"""API keys are stored as hashes and shown once (WAIVER-SEC-003, ADR 0044 Decision 6, brief 0070).

Before this change `users.api_key` held the value that authenticates, in cleartext, and
`GET /auth/apikey` returned it on demand. Anyone with a copy of `users.db` — a backup, a debugging
copy — held a permanent credential for every account. These tests construct that and the steps of
the migration away from it: the boot import of the legacy values as hashes, hash-only
authentication, the show-once creation, expiry, revocation, rotation, the legacy cutoff, and a
pre-migration backup restored after it.

Every value is synthetic and generated at run time; nothing here reads a real database.
"""

from __future__ import annotations

import hashlib
import io
import logging
import re
import secrets
import sqlite3
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import audit, auth, database
from app.config import settings
from app.logging_setup import REDACTION_MARKER, JsonFormatter, redact_text
from tests.conftest import _enable_registration

PASSWORD = "correct horse battery staple"  # secret-scan: allow — a synthetic test value
KEY_SHAPE = re.compile(r"rwk_[0-9a-f]{16}_[A-Za-z0-9_-]{43}")
PAST = "2026-01-01"  # a cutoff that has passed: the setting may move it earlier, never later


# --- helpers ------------------------------------------------------------------------------------


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _db(path: str | Path | None = None) -> sqlite3.Connection:
    con = sqlite3.connect(path or settings.db_path)
    con.row_factory = sqlite3.Row
    return con


def _register(client: TestClient, username: str = "alice") -> dict[str, str]:
    _enable_registration(client)
    body = {"username": username, "password": PASSWORD}
    assert client.post("/auth/register", json=body).status_code == 201
    token = client.post("/auth/login", json=body).json()["access_token"]
    return {"username": username, "token": token}


def _session(account: dict[str, str]) -> dict[str, str]:
    return {"Authorization": f"Bearer {account['token']}"}


def _create(client: TestClient, account: dict[str, str], **body) -> dict:
    r = client.post("/auth/apikeys", headers=_session(account), json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _me(client: TestClient, headers: dict[str, str]):
    return client.get("/auth/me", headers=headers)


def _write_pre_m4_database(path: Path, accounts: dict[str, str]) -> None:
    """A users database as an image before this change left it: the cleartext key in the
    `users.api_key` column and no `api_keys` table. `accounts` maps username -> legacy key."""
    con = sqlite3.connect(path)
    con.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,"
        " hashed_password TEXT NOT NULL, api_key TEXT UNIQUE,"
        " created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
    )
    for username, key in accounts.items():
        con.execute(
            "INSERT INTO users (username, hashed_password, api_key) VALUES (?, ?, ?)",
            (username, auth.hash_password(PASSWORD), key),
        )
    con.commit()
    con.close()


@pytest.fixture
def legacy_key() -> str:
    """A key in the previous image's shape: `secrets.token_urlsafe(32)`, 43 characters."""
    return secrets.token_urlsafe(32)


@pytest.fixture
def legacy_client(isolated_storage: Path, fake_task, legacy_key: str) -> Iterator[TestClient]:
    """The app booted on a pre-M4 database holding one legacy key for `alice`."""
    _write_pre_m4_database(isolated_storage / "users.db", {"alice": legacy_key})
    from app.main import app

    with TestClient(app) as c:
        yield c


def _boot(client_factory=None) -> None:
    """Boot the application once more on the same files (a restart)."""
    from app.main import app

    with TestClient(app):
        pass


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch):
    """Control the API-key clock (epoch seconds)."""
    state = {"now": int(database.api_key_clock())}

    def now() -> int:
        return state["now"]

    monkeypatch.setattr(database, "api_key_clock", now)
    return state


# --- unit: the format ---------------------------------------------------------------------------


class TestTheFormat:
    def test_a_new_key_has_a_prefix_a_public_id_and_a_256_bit_secret(self):
        issued = database.new_api_key()
        assert KEY_SHAPE.fullmatch(issued.api_key), issued.api_key
        assert issued.api_key.startswith(f"rwk_{issued.key_id}_")
        secret = issued.api_key.split("_", 2)[2]
        import base64

        assert len(base64.urlsafe_b64decode(secret + "=")) == 32
        assert issued.secret_hash == _sha256(issued.api_key)
        assert issued.secret_hash != issued.api_key

    def test_ids_and_secrets_are_random(self):
        keys = [database.new_api_key() for _ in range(50)]
        assert len({k.key_id for k in keys}) == 50
        assert len({k.api_key for k in keys}) == 50

    def test_only_the_exact_shape_parses(self):
        issued = database.new_api_key()
        assert database.parse_api_key(issued.api_key) == issued.key_id
        for other in (
            secrets.token_urlsafe(32),  # a legacy key
            issued.api_key[:-1],
            issued.api_key + "A",
            issued.api_key.upper(),
            "rwk_" + "g" * 16 + "_" + "A" * 43,
            "",
        ):
            assert database.parse_api_key(other) is None, other


class TestTheCutoff:
    def test_the_default_is_before_the_waiver_expires(self, monkeypatch):
        monkeypatch.setattr(settings, "api_key_legacy_cutoff", "2027-01-15")
        assert database.legacy_cutoff() == 1799971200  # 2027-01-15T00:00:00Z
        assert database.legacy_cutoff() < 1801612800  # 2027-02-03, after WAIVER-SEC-003 expires

    def test_an_earlier_date_is_honoured(self, monkeypatch):
        monkeypatch.setattr(settings, "api_key_legacy_cutoff", "2026-12-01")
        assert database.legacy_cutoff() == 1796083200

    @pytest.mark.parametrize("value", ["2027-06-01", "2099-01-01", "tomorrow", "", "2027-13-40"])
    def test_a_later_or_malformed_date_cannot_extend_it(self, monkeypatch, value):
        monkeypatch.setattr(settings, "api_key_legacy_cutoff", value)
        assert database.legacy_cutoff() == 1799971200
        assert database.legacy_cutoff_problem() is not None


def _shaped_key() -> str:
    """A key in the new shape, built here rather than by `database.new_api_key`, so the redaction
    tests fail on behaviour against an image that does not know the shape (brief 0070)."""
    return f"rwk_{secrets.token_hex(8)}_{secrets.token_urlsafe(32)}"


class TestRedaction:
    def test_a_new_key_is_redacted_under_a_neutral_name(self):
        key = _shaped_key()
        out = redact_text(f"agent sent {key} and then stopped")
        assert key.split("_", 2)[2] not in out
        assert REDACTION_MARKER in out

    def test_a_new_key_in_a_header_dump_is_redacted(self):
        key = _shaped_key()
        out = redact_text(f"{{'x-api-key': '{key}'}}")
        assert key.split("_", 2)[2] not in out

    def test_the_public_prefix_alone_survives(self):
        key_id = secrets.token_hex(8)
        assert redact_text(f"key rwk_{key_id} revoked") == f"key rwk_{key_id} revoked"


# --- DB integration ----------------------------------------------------------------------------


class TestTheSchema:
    @pytest.mark.anyio
    async def test_fresh_and_upgraded_databases_have_the_same_api_keys_schema(
        self, isolated_storage: Path, monkeypatch
    ):
        """RISK-SURF-001 must not recur in the new table: compare both paths."""
        fresh = isolated_storage / "fresh.db"
        upgraded = isolated_storage / "upgraded.db"
        _write_pre_m4_database(upgraded, {"alice": secrets.token_urlsafe(32)})
        for path in (fresh, upgraded):
            monkeypatch.setattr(settings, "db_path", str(path))
            await database.init_db()
            await database.init_db()

        def schema(path: Path) -> list[tuple[str, str]]:
            con = _db(path)
            try:
                return sorted(
                    (r["name"], r["sql"])
                    for r in con.execute(
                        "SELECT name, sql FROM sqlite_master WHERE tbl_name='api_keys'"
                    )
                )
            finally:
                con.close()

        assert schema(fresh) == schema(upgraded)
        assert {name for name, _ in schema(fresh)} >= {"api_keys"}

    def test_a_revoked_key_cannot_be_unrevoked_and_a_key_cannot_be_repointed(self, client):
        account = _register(client)
        created = _create(client, account)
        assert client.delete(f"/auth/apikeys/{created['key_id']}", headers=_session(account))
        con = _db()
        try:
            for statement in (
                "UPDATE api_keys SET revoked_at=NULL WHERE key_id=?",
                "UPDATE api_keys SET user_id=user_id+1 WHERE key_id=?",
                # The first hex digit flipped to another one: a fixed "0" would be no change at
                # all for one hash in sixteen, and the trigger rightly lets a no-op through.
                "UPDATE api_keys SET secret_hash=(CASE substr(secret_hash, 1, 1) WHEN '0'"
                " THEN '1' ELSE '0' END) || substr(secret_hash, 2) WHERE key_id=?",
                "UPDATE api_keys SET kind='legacy' WHERE key_id=?",
            ):
                with pytest.raises(sqlite3.IntegrityError):
                    con.execute(statement, (created["key_id"],))
        finally:
            con.close()


class TestTheLegacyImport:
    def test_every_cleartext_value_becomes_a_hash(self, legacy_client, legacy_key):
        con = _db()
        rows = [dict(r) for r in con.execute("SELECT * FROM api_keys")]
        con.close()
        assert len(rows) == 1
        (row,) = rows
        assert row["kind"] == "legacy"
        assert row["secret_hash"] == _sha256(legacy_key)
        assert legacy_key not in repr(rows)
        assert row["expires_at"] == database.legacy_cutoff()

    def test_the_import_is_idempotent(self, legacy_client, legacy_key):
        _boot()
        _boot()
        con = _db()
        assert con.execute("SELECT COUNT(*) FROM api_keys").fetchone()[0] == 1
        con.close()

    def test_the_import_prints_nothing(self, isolated_storage, fake_task, legacy_key):
        _write_pre_m4_database(isolated_storage / "users.db", {"alice": legacy_key})
        buffer = io.StringIO()
        handler = logging.StreamHandler(buffer)
        handler.setFormatter(JsonFormatter())
        logger = logging.getLogger("app.database")
        logger.addHandler(handler)
        try:
            _boot()
        finally:
            logger.removeHandler(handler)
        assert legacy_key not in buffer.getvalue()
        assert _sha256(legacy_key) not in buffer.getvalue()

    def test_the_legacy_key_still_authenticates_before_the_cutoff(self, legacy_client, legacy_key):
        assert _me(legacy_client, {"X-Api-Key": legacy_key}).status_code == 200
        assert _me(legacy_client, {"Authorization": f"Bearer {legacy_key}"}).status_code == 200

    def test_only_the_hash_authenticates_not_the_column(self, legacy_client, legacy_key):
        """Hash-only from the first request: a value written into `users.api_key` (by hand, by a
        restore of one row, by anything) is not a credential to this image."""
        planted = secrets.token_urlsafe(32)
        con = _db()
        con.execute("UPDATE users SET api_key=? WHERE username='alice'", (planted,))
        con.commit()
        con.close()
        assert _me(legacy_client, {"X-Api-Key": planted}).status_code == 401
        assert _me(legacy_client, {"Authorization": f"Bearer {planted}"}).status_code == 401
        assert _me(legacy_client, {"X-Api-Key": legacy_key}).status_code == 200

    def test_a_rotation_by_the_previous_image_supersedes_the_old_legacy_row(
        self, legacy_client, legacy_key
    ):
        """Rollback: the previous image's regenerate writes a new cleartext value. The next boot
        of this image imports it and ends the one it replaced, as the old image did."""
        rotated = secrets.token_urlsafe(32)
        con = _db()
        con.execute("UPDATE users SET api_key=? WHERE username='alice'", (rotated,))
        con.commit()
        con.close()
        _boot()
        from app.main import app

        with TestClient(app) as again:
            assert _me(again, {"X-Api-Key": rotated}).status_code == 200
            assert _me(again, {"X-Api-Key": legacy_key}).status_code == 401

    def test_the_previous_image_can_still_read_its_column(self, legacy_client, legacy_key):
        """Rollback compatibility inside the window: the previous image authenticates with
        `SELECT username FROM users WHERE api_key=?` — that still finds the account."""
        con = _db()
        row = con.execute("SELECT username FROM users WHERE api_key=?", (legacy_key,)).fetchone()
        con.close()
        assert row is not None and row["username"] == "alice"


class TestAfterTheCutoff:
    def test_a_legacy_key_is_refused_by_date_without_a_restart(
        self, legacy_client, legacy_key, monkeypatch
    ):
        assert _me(legacy_client, {"X-Api-Key": legacy_key}).status_code == 200
        monkeypatch.setattr(settings, "api_key_legacy_cutoff", PAST)
        r = _me(legacy_client, {"X-Api-Key": legacy_key})
        assert r.status_code == 401 and r.json() == {"detail": "Invalid API key"}
        r = _me(legacy_client, {"Authorization": f"Bearer {legacy_key}"})
        assert r.status_code == 401 and r.json() == {"detail": "Not authenticated"}

    def test_the_first_boot_after_it_revokes_and_wipes_every_legacy_key(
        self, legacy_client, legacy_key, monkeypatch
    ):
        monkeypatch.setattr(settings, "api_key_legacy_cutoff", PAST)
        _boot()
        con = _db()
        assert (
            con.execute("SELECT COUNT(*) FROM users WHERE api_key IS NOT NULL").fetchone()[0] == 0
        )
        legacy = con.execute("SELECT revoked_at FROM api_keys WHERE kind='legacy'").fetchall()
        dump = "\n".join(con.iterdump())
        con.close()
        assert legacy and all(r["revoked_at"] is not None for r in legacy)
        assert legacy_key not in dump

    def test_a_pre_migration_backup_restored_after_the_cutoff_yields_no_working_key(
        self, isolated_storage, fake_task, legacy_key, monkeypatch
    ):
        """Plan M4 acceptance: a key from a pre-migration backup does not authenticate after the
        cutoff — and the boot that opens the restored file empties it before any request."""
        monkeypatch.setattr(settings, "api_key_legacy_cutoff", PAST)
        _write_pre_m4_database(isolated_storage / "users.db", {"alice": legacy_key})
        from app.main import app

        with TestClient(app) as c:
            assert _me(c, {"X-Api-Key": legacy_key}).status_code == 401
            assert _me(c, {"Authorization": f"Bearer {legacy_key}"}).status_code == 401
        con = _db()
        dump = "\n".join(con.iterdump())
        con.close()
        assert legacy_key not in dump

    def test_the_deprecated_get_returns_nothing_after_it(
        self, legacy_client, legacy_key, monkeypatch
    ):
        token = legacy_client.post(
            "/auth/login", json={"username": "alice", "password": PASSWORD}
        ).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        assert legacy_client.get("/auth/apikey", headers=headers).json() == {"api_key": legacy_key}
        monkeypatch.setattr(settings, "api_key_legacy_cutoff", PAST)
        assert legacy_client.get("/auth/apikey", headers=headers).json() == {"api_key": ""}

    def test_issued_keys_are_untouched_by_the_cutoff(self, client, monkeypatch):
        account = _register(client)
        created = _create(client, account)
        monkeypatch.setattr(settings, "api_key_legacy_cutoff", PAST)
        _boot()
        assert _me(client, {"X-Api-Key": created["api_key"]}).status_code == 200


# --- ASGI/REST: the new contract ---------------------------------------------------------------


class TestShowOnce:
    def test_creation_returns_the_secret_once_and_it_authenticates(self, client):
        account = _register(client)
        created = _create(client, account, label="laptop agent")
        assert KEY_SHAPE.fullmatch(created["api_key"])
        assert created["key_id"] in created["api_key"]
        assert created["label"] == "laptop agent"
        assert created["kind"] == "issued" and created["state"] == "active"
        assert created["prefix"] == f"rwk_{created['key_id']}"
        assert _me(client, {"X-Api-Key": created["api_key"]}).json()["username"] == "alice"
        assert _me(client, {"Authorization": f"Bearer {created['api_key']}"}).status_code == 200

    def test_nothing_returns_the_secret_afterwards(self, client):
        account = _register(client)
        created = _create(client, account)
        key = created["api_key"]
        secret = key.split("_", 2)[2]
        for headers in (_session(account), {"X-Api-Key": key}):
            for path in ("/auth/apikeys", "/auth/apikey", "/auth/me"):
                r = client.get(path, headers=headers)
                assert r.status_code == 200, (path, r.text)
                assert secret not in r.text, path
                assert _sha256(key) not in r.text, path

    def test_the_list_is_metadata_only(self, client):
        account = _register(client)
        _create(client, account, label="one")
        _create(client, account, label="two")
        listed = client.get("/auth/apikeys", headers=_session(account)).json()
        assert [k["label"] for k in listed] == ["two", "one"]
        for item in listed:
            assert set(item) == {
                "key_id",
                "label",
                "kind",
                "prefix",
                "created_at",
                "expires_at",
                "revoked_at",
                "last_used_at",
                "state",
            }

    def test_registration_stores_no_cleartext_key(self, client):
        _register(client)
        con = _db()
        value = con.execute("SELECT api_key FROM users WHERE username='alice'").fetchone()[0]
        con.close()
        assert value is None

    def test_a_new_account_has_no_key_to_read_back(self, client):
        account = _register(client)
        r = client.get("/auth/apikey", headers=_session(account))
        assert r.json() == {"api_key": ""}


class TestLifecycle:
    def test_an_expired_key_is_refused_like_an_unknown_one(self, client, clock):
        account = _register(client)
        created = _create(client, account, expires_in_days=1)
        assert _me(client, {"X-Api-Key": created["api_key"]}).status_code == 200
        clock["now"] += 86400
        expired = _me(client, {"X-Api-Key": created["api_key"]})
        unknown = _me(client, {"X-Api-Key": database.new_api_key().api_key})
        assert expired.status_code == unknown.status_code == 401
        assert expired.json() == unknown.json() == {"detail": "Invalid API key"}
        listed = client.get("/auth/apikeys", headers=_session(account)).json()
        assert listed[0]["state"] == "expired"

    def test_expiry_is_bounded(self, client):
        account = _register(client)
        for days in (0, 366, -1):
            r = client.post(
                "/auth/apikeys", headers=_session(account), json={"expires_in_days": days}
            )
            assert r.status_code == 422, days
        created = _create(client, account)
        assert created["expires_at"] is not None

    def test_a_revoked_key_is_refused_like_an_unknown_one(self, client):
        account = _register(client)
        created = _create(client, account)
        r = client.delete(f"/auth/apikeys/{created['key_id']}", headers=_session(account))
        assert r.status_code == 204
        revoked = _me(client, {"Authorization": f"Bearer {created['api_key']}"})
        unknown = _me(client, {"Authorization": f"Bearer {database.new_api_key().api_key}"})
        assert revoked.status_code == unknown.status_code == 401
        assert revoked.json() == unknown.json() == {"detail": "Not authenticated"}
        # Revoking twice is not an error; the key stays revoked.
        again = client.delete(f"/auth/apikeys/{created['key_id']}", headers=_session(account))
        assert again.status_code == 204

    def test_a_forged_secret_for_a_real_id_is_refused(self, client):
        account = _register(client)
        created = _create(client, account)
        forged = f"rwk_{created['key_id']}_{secrets.token_urlsafe(32)}"
        assert _me(client, {"X-Api-Key": forged}).status_code == 401

    def test_another_accounts_key_cannot_be_revoked(self, client):
        alice = _register(client, "alice")
        bob = _register(client, "bob")
        created = _create(client, alice)
        r = client.delete(f"/auth/apikeys/{created['key_id']}", headers=_session(bob))
        assert r.status_code == 404
        assert _me(client, {"X-Api-Key": created["api_key"]}).status_code == 200
        assert client.get("/auth/apikeys", headers=_session(bob)).json() == []

    def test_last_used_is_recorded(self, client):
        account = _register(client)
        created = _create(client, account)
        assert created["last_used_at"] is None
        _me(client, {"X-Api-Key": created["api_key"]})
        listed = client.get("/auth/apikeys", headers=_session(account)).json()
        assert listed[0]["last_used_at"] is not None

    def test_the_number_of_active_keys_is_capped(self, client):
        account = _register(client)
        for _ in range(10):
            _create(client, account)
        r = client.post("/auth/apikeys", headers=_session(account), json={})
        assert r.status_code == 409

    def test_the_stored_rows_stay_bounded_under_a_create_revoke_loop(self, client):
        account = _register(client)
        for _ in range(60):
            created = _create(client, account)
            client.delete(f"/auth/apikeys/{created['key_id']}", headers=_session(account))
        con = _db()
        count = con.execute("SELECT COUNT(*) FROM api_keys").fetchone()[0]
        con.close()
        assert count <= 50


class TestKeyManagementNeedsASession:
    """Scenario 3: a stolen key must not mint its own successor."""

    def test_an_api_key_cannot_create_a_key(self, client):
        account = _register(client)
        created = _create(client, account)
        for headers in (
            {"X-Api-Key": created["api_key"]},
            {"Authorization": f"Bearer {created['api_key']}"},
        ):
            r = client.post("/auth/apikeys", headers=headers, json={})
            assert r.status_code == 403, r.text
        con = _db()
        assert con.execute("SELECT COUNT(*) FROM api_keys").fetchone()[0] == 1
        con.close()

    def test_an_api_key_cannot_revoke_a_key(self, client):
        account = _register(client)
        first = _create(client, account)
        second = _create(client, account)
        r = client.delete(
            f"/auth/apikeys/{second['key_id']}", headers={"X-Api-Key": first["api_key"]}
        )
        assert r.status_code == 403
        assert _me(client, {"X-Api-Key": second["api_key"]}).status_code == 200

    def test_an_api_key_may_list(self, client):
        account = _register(client)
        created = _create(client, account)
        r = client.get("/auth/apikeys", headers={"X-Api-Key": created["api_key"]})
        assert r.status_code == 200 and len(r.json()) == 1


class TestTheDeprecatedRoutes:
    def test_the_get_is_marked_deprecated(self, legacy_client, legacy_key):
        r = legacy_client.get("/auth/apikey", headers={"X-Api-Key": legacy_key})
        assert r.status_code == 200
        assert r.json() == {"api_key": legacy_key}
        assert r.headers["Deprecation"].startswith("@")
        assert "2027" in r.headers["Sunset"]
        assert 'rel="successor-version"' in r.headers["Link"]

    def test_both_old_routes_are_deprecated_in_the_schema(self, client):
        spec = client.get("/openapi.json").json()
        assert spec["paths"]["/auth/apikey"]["get"].get("deprecated") is True
        assert spec["paths"]["/auth/apikey/regenerate"]["post"].get("deprecated") is True
        assert not spec["paths"]["/auth/apikeys"]["post"].get("deprecated")

    def test_regenerate_mints_a_hashed_key_and_ends_every_other_one(
        self, legacy_client, legacy_key
    ):
        token = legacy_client.post(
            "/auth/login", json={"username": "alice", "password": PASSWORD}
        ).json()["access_token"]
        session = {"Authorization": f"Bearer {token}"}
        issued = legacy_client.post("/auth/apikeys", headers=session, json={}).json()["api_key"]
        r = legacy_client.post("/auth/apikey/regenerate", headers=session)
        assert r.status_code == 200
        assert set(r.json()) == {"api_key"}
        new_key = r.json()["api_key"]
        assert KEY_SHAPE.fullmatch(new_key)
        assert "Deprecation" in r.headers
        assert _me(legacy_client, {"X-Api-Key": new_key}).status_code == 200
        assert _me(legacy_client, {"X-Api-Key": legacy_key}).status_code == 401
        assert _me(legacy_client, {"X-Api-Key": issued}).status_code == 401
        con = _db()
        assert con.execute("SELECT api_key FROM users WHERE username='alice'").fetchone()[0] is None
        con.close()

    def test_revoking_the_legacy_key_empties_the_column(self, legacy_client, legacy_key):
        token = legacy_client.post(
            "/auth/login", json={"username": "alice", "password": PASSWORD}
        ).json()["access_token"]
        session = {"Authorization": f"Bearer {token}"}
        (legacy,) = legacy_client.get("/auth/apikeys", headers=session).json()
        assert legacy["kind"] == "legacy" and legacy["prefix"] == ""
        r = legacy_client.delete(f"/auth/apikeys/{legacy['key_id']}", headers=session)
        assert r.status_code == 204
        assert _me(legacy_client, {"X-Api-Key": legacy_key}).status_code == 401
        con = _db()
        dump = "\n".join(con.iterdump())
        con.close()
        assert legacy_key not in dump


class TestTheAuditTrail:
    def _rows(self, event: str) -> list[dict]:
        con = _db(database.audit_db_path())
        rows = [dict(r) for r in con.execute("SELECT * FROM audit_events WHERE event=?", (event,))]
        con.close()
        return rows

    def test_creation_and_revocation_are_recorded_by_public_id(self, client):
        account = _register(client)
        created = _create(client, account)
        client.delete(f"/auth/apikeys/{created['key_id']}", headers=_session(account))
        (made,) = self._rows(audit.APIKEY_CREATED)
        (ended,) = self._rows(audit.APIKEY_REVOKED)
        for row in (made, ended):
            assert row["actor"] == "alice"
            assert created["key_id"] in row["detail"]


# --- the acceptance search (plan M4) -----------------------------------------------------------


@pytest.fixture
def every_log_line(client: TestClient) -> Iterator[io.StringIO]:
    buffer = io.StringIO()
    root = logging.getLogger()
    installed = [h for h in root.handlers if isinstance(h.formatter, JsonFormatter)]
    assert installed
    previous = [(h, h.stream) for h in installed]
    for handler, _ in previous:
        handler.setStream(buffer)
    try:
        yield buffer
    finally:
        for handler, stream in previous:
            handler.setStream(stream)


def test_no_database_audit_row_or_log_line_holds_a_key_or_its_hash(
    client: TestClient, every_log_line: io.StringIO
):
    """A synthetic DB, audit and log search finds neither a new nor an old cleartext key."""
    account = _register(client)
    session = _session(account)
    minted = [_create(client, account, label="a")["api_key"]]
    minted.append(client.post("/auth/apikey/regenerate", headers=session).json()["api_key"])
    minted.append(_create(client, account, label="b")["api_key"])
    for key in minted:
        _me(client, {"X-Api-Key": key})
        _me(client, {"Authorization": f"Bearer {key}"})
    client.get("/auth/apikeys", headers=session)
    client.get("/auth/apikey", headers=session)
    for item in client.get("/auth/apikeys", headers=session).json():
        client.delete(f"/auth/apikeys/{item['key_id']}", headers=session)
    _me(client, {"X-Api-Key": minted[-1]})  # a refused one, too

    con = _db()
    users_dump = "\n".join(con.iterdump())
    con.close()
    con = _db(database.audit_db_path())
    audit_dump = "\n".join(con.iterdump())
    con.close()
    logs = every_log_line.getvalue()
    assert "api key" in logs.lower()  # not vacuous: the flow did log

    for key in minted:
        secret = key.split("_", 2)[2]
        for where, text in (("users.db", users_dump), ("audit.db", audit_dump), ("log", logs)):
            assert secret not in text, f"a secret reached {where}"
        for where, text in (("audit.db", audit_dump), ("log", logs)):
            assert _sha256(key) not in text, f"a hash reached {where}"


# --- review round 1 (brief 0070): the paths the first implementation left open ------------------


def _login(client: TestClient, username: str = "alice") -> dict[str, str]:
    token = client.post("/auth/login", json={"username": username, "password": PASSWORD}).json()[
        "access_token"
    ]
    return {"Authorization": f"Bearer {token}"}


def _previous_image_backfill() -> None:
    """What the previous image's `init_db` did at every boot, verbatim in effect: give every row
    whose `users.api_key` is NULL a fresh cleartext key (`secrets.token_urlsafe(32)`)."""
    con = _db()
    for (username,) in con.execute("SELECT username FROM users WHERE api_key IS NULL").fetchall():
        con.execute(
            "UPDATE users SET api_key=? WHERE username=?", (secrets.token_urlsafe(32), username)
        )
    con.commit()
    con.close()


class TestRegenerateNeedsASession:
    """A stolen key — a legacy one from a pre-migration backup above all — must not be able to
    swap itself for a fresh key that outlives the cutoff, nor end every key its owner holds."""

    def test_a_legacy_backup_key_cannot_be_laundered_into_a_key_that_outlives_the_cutoff(
        self, legacy_client, legacy_key, clock
    ):
        r = legacy_client.post("/auth/apikey/regenerate", headers={"X-Api-Key": legacy_key})
        minted = r.json().get("api_key", "") if r.status_code == 200 else ""
        clock["now"] = database.legacy_cutoff() + 30 * 86400
        assert _me(legacy_client, {"X-Api-Key": legacy_key}).status_code == 401
        if minted:
            assert _me(legacy_client, {"X-Api-Key": minted}).status_code == 401, "laundered"
        assert r.status_code == 403, r.text

    def test_an_issued_key_cannot_regenerate_and_lock_its_owner_out(self, client):
        account = _register(client)
        owners = _create(client, account)
        stolen = _create(client, account)
        for headers in (
            {"X-Api-Key": stolen["api_key"]},
            {"Authorization": f"Bearer {stolen['api_key']}"},
        ):
            r = client.post("/auth/apikey/regenerate", headers=headers)
            assert r.status_code == 403, r.text
        assert _me(client, {"X-Api-Key": owners["api_key"]}).status_code == 200
        con = _db()
        assert con.execute("SELECT COUNT(*) FROM api_keys").fetchone()[0] == 2
        con.close()

    def test_a_signed_in_session_still_regenerates(self, legacy_client, legacy_key):
        r = legacy_client.post("/auth/apikey/regenerate", headers=_login(legacy_client))
        assert r.status_code == 200 and KEY_SHAPE.fullmatch(r.json()["api_key"])


class TestARollbackBeforeTheCutoff:
    """The previous image fills a cleartext key into every NULL `users.api_key` at its boot. An
    account this image moved off the column (or registered) must not get that value back as a
    working key when this image boots again."""

    def test_a_moved_and_a_new_account_get_no_working_key_from_the_previous_images_backfill(
        self, legacy_client, legacy_key
    ):
        session = _login(legacy_client)
        (legacy,) = legacy_client.get("/auth/apikeys", headers=session).json()
        assert (
            legacy_client.delete(f"/auth/apikeys/{legacy['key_id']}", headers=session).status_code
            == 204
        )
        bob = _register(legacy_client, "bob")
        _previous_image_backfill()
        con = _db()
        minted = dict(con.execute("SELECT username, api_key FROM users").fetchall())
        con.close()
        assert all(minted.values())
        _boot()
        from app.main import app

        with TestClient(app) as again:
            for name, value in minted.items():
                assert _me(again, {"X-Api-Key": value}).status_code == 401, name
                assert _me(again, {"Authorization": f"Bearer {value}"}).status_code == 401, name
            assert again.get("/auth/apikey", headers=_session(bob)).json() == {"api_key": ""}
        con = _db()
        dump = "\n".join(con.iterdump())
        con.close()
        for value in minted.values():
            assert value not in dump

    def test_a_regenerated_account_gets_no_working_key_from_the_backfill(
        self, legacy_client, legacy_key
    ):
        assert (
            legacy_client.post("/auth/apikey/regenerate", headers=_login(legacy_client)).status_code
            == 200
        )
        _previous_image_backfill()
        con = _db()
        (value,) = con.execute("SELECT api_key FROM users WHERE username='alice'").fetchone()
        con.close()
        _boot()
        from app.main import app

        with TestClient(app) as again:
            assert _me(again, {"X-Api-Key": value}).status_code == 401

    def test_an_account_the_previous_image_registered_during_the_rollback_keeps_its_key(
        self, legacy_client, legacy_key
    ):
        """The other side of the line: an account that never met this image has its key from the
        previous image, and that key goes on working until the cutoff, like every legacy key."""
        carol = secrets.token_urlsafe(32)
        con = _db()
        con.execute(
            "INSERT INTO users (username, hashed_password, api_key) VALUES ('carol', ?, ?)",
            (auth.hash_password(PASSWORD), carol),
        )
        con.commit()
        con.close()
        _boot()
        from app.main import app

        with TestClient(app) as again:
            assert _me(again, {"X-Api-Key": carol}).status_code == 200
            assert _me(again, {"X-Api-Key": legacy_key}).status_code == 200


class TestAnEarlierCutoff:
    def test_moving_the_cutoff_earlier_moves_the_announced_expiry(
        self, legacy_client, legacy_key, monkeypatch
    ):
        earlier = datetime.fromtimestamp(database.legacy_cutoff() - 10 * 86400, UTC)
        monkeypatch.setattr(settings, "api_key_legacy_cutoff", earlier.strftime("%Y-%m-%d"))
        _boot()
        session = _login(legacy_client)
        (legacy,) = legacy_client.get("/auth/apikeys", headers=session).json()
        assert (
            legacy["expires_at"]
            == datetime.fromtimestamp(database.legacy_cutoff(), UTC).isoformat()
        )
        con = _db()
        (stored,) = con.execute("SELECT expires_at FROM api_keys WHERE kind='legacy'").fetchone()
        con.close()
        assert stored == database.legacy_cutoff()
