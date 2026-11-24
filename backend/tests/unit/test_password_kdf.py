"""Passwords are hashed with Argon2id, bounded in UTF-8 bytes (finding SEC-006, ADR 0044, brief 0067).

Before this change passwords went through passlib's bcrypt, which reads only the first 72 UTF-8
bytes: two passwords with the same 72-byte prefix were the same password. No password field and no
request body had a limit, an unknown account cost no hash work at all (a timing oracle for
"does this account exist"), and a NUL byte made passlib raise, so the login answered 500.

The legacy hashes below were produced by **passlib 1.7.4 itself** (bcrypt 4.0.1, cost 4), on
2026-11-24, before passlib was removed — so "an existing account still logs in" is tested against
the exact bytes the previous implementation stored, not against a re-implementation of it.
Every password here is synthetic.
"""

from __future__ import annotations

import sqlite3
import threading
import time
from typing import Any

import pytest

from app.config import settings

# (password, hash) — passlib 1.7.4 CryptContext(schemes=["bcrypt"], bcrypt__rounds=4).hash(password)
LEGACY = {
    "short": (
        "correct horse battery staple",  # secret-scan: allow — synthetic test value
        "$2b$04$sOeWECW91sb9hzhzigm/6OqyvuvjbBFruzzpjZZWpYWFQeZ3zw1KG",
    ),
    "seventy_one": ("p" * 71, "$2b$04$MAe5wunAlKFg3kufaI8hne4eMGuIZZrCcehk/nOyVeKRgQju33o.O"),
    "seventy_two": ("q" * 72, "$2b$04$lb14bbhhfHUstRmqB5uA/umPEu3pkiOqJFUHh5GQ.UNb5L9VaW3WK"),
    "long_ascii": (
        "L" * 72 + "-the-suffix",
        "$2b$04$tZ7h3r7ha7OfY4jrprPiZeCrJtrxpPRukZXjTzRhwTeyMwhUlGxai",
    ),
    "long_umlaut": ("ä" * 40, "$2b$04$tVorJFWl8sfHPGdMKDfamOTCd8CEuiICpAx/oPvkhODFJIEW1mg2C"),
    "long_emoji": ("🔑" * 20, "$2b$04$ZdeMz1bztNN5Nb4u9KCbX.XJMuBXgptubn6wTDYnzvpRUKX698/ze"),
}
# The production cost passlib used by default (12): what every stored hash in a real deploy has.
LEGACY_COST_12 = (
    "production cost vector",  # secret-scan: allow — synthetic test value
    "$2b$12$4lP73D7R5jeIV4zENV3uIuKnGOJ.J/y/.IBCnzJLl8MOv3nGTrkZW",
)

GOOD = "a perfectly good passphrase"  # secret-scan: allow — synthetic test value
DAY = 86400


# --- helpers -----------------------------------------------------------------------------------


def _sql(query: str, args: tuple = ()) -> list[sqlite3.Row]:
    con = sqlite3.connect(settings.db_path)
    con.row_factory = sqlite3.Row
    try:
        rows = con.execute(query, args).fetchall()
        con.commit()
        return rows
    finally:
        con.close()


def _open_registration() -> None:
    _sql("INSERT OR REPLACE INTO site_settings (key, value) VALUES ('allow_registration', 'true')")


def _register(client, username: str, password: str = GOOD):
    _open_registration()
    return client.post("/auth/register", json={"username": username, "password": password})


def _stored_hash(username: str) -> str:
    return _sql("SELECT hashed_password FROM users WHERE username=?", (username,))[0][0]


def _version(username: str) -> int:
    return _sql("SELECT auth_version FROM users WHERE username=?", (username,))[0][0]


def _legacy_account(client, username: str, vector: tuple[str, str]) -> str:
    """An account whose stored hash is exactly what passlib wrote."""
    assert _register(client, username).status_code == 201
    _sql("UPDATE users SET hashed_password=? WHERE username=?", (vector[1], username))
    return vector[0]


def _login(client, username: str, password: str):
    return client.post("/auth/login", json={"username": username, "password": password})


def _expand_days_ago(days: float) -> None:
    """Move the first boot of this image `days` into the past."""
    _sql(
        "INSERT OR REPLACE INTO site_settings (key, value) VALUES ('password_kdf_expand_at', ?)",
        (str(int(time.time() - days * DAY)),),
    )


# --- ASGI/REST: the attack and the limits ------------------------------------------------------


class TestTheSeventyTwoBytePair:
    """Plan M2.2 acceptance: two passwords with the same 72-byte prefix and different suffixes give
    different hashes and are not interchangeable."""

    PREFIX = "x" * 72
    ONE = PREFIX + "-the-real-suffix"
    TWO = PREFIX + "-anything-else"

    def test_a_shared_prefix_does_not_log_in(self, client):
        assert _register(client, "alice", self.ONE).status_code == 201
        assert _login(client, "alice", self.ONE).status_code == 200
        assert _login(client, "alice", self.TWO).status_code == 401
        assert _login(client, "alice", self.PREFIX).status_code == 401

    def test_the_two_get_different_hashes(self, client):
        assert _register(client, "alice", self.ONE).status_code == 201
        assert _register(client, "bob", self.TWO).status_code == 201
        a, b = _stored_hash("alice"), _stored_hash("bob")
        assert a.startswith("$argon2id$") and b.startswith("$argon2id$")
        assert a != b
        from app.auth import KdfPhase, check_password

        phase = KdfPhase(write_argon2=True, accept_long_bcrypt=True)
        assert not check_password(self.TWO, a, phase=phase).ok
        assert not check_password(self.ONE, b, phase=phase).ok

    def test_a_password_change_to_a_long_password_is_argon2id_too(self, client):
        assert _register(client, "alice").status_code == 201
        token = _login(client, "alice", GOOD).json()["access_token"]
        r = client.put(
            "/auth/password",
            json={"current_password": GOOD, "new_password": self.ONE},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, r.text
        assert _stored_hash("alice").startswith("$argon2id$")
        assert _login(client, "alice", self.TWO).status_code == 401


class TestPasswordLimitsInBytes:
    def test_a_new_password_over_the_maximum_is_refused(self, client):
        assert _register(client, "alice", "a" * 1025).status_code == 422
        assert _register(client, "bob", "a" * 1024).status_code == 201

    def test_the_maximum_counts_bytes_not_characters(self, client):
        # 342 x 'ä' is 342 characters and 684 bytes; 513 x 'ä' is 1026 bytes.
        assert _register(client, "alice", "ä" * 513).status_code == 422
        assert _register(client, "bob", "ä" * 512).status_code == 201

    def test_a_new_password_under_the_minimum_is_refused(self, client):
        assert _register(client, "alice", "seven77").status_code == 422
        # 4 characters, 8 bytes: the rule is bytes.
        assert _register(client, "bob", "ääää").status_code == 201

    def test_the_password_change_applies_the_same_rule(self, client):
        assert _register(client, "alice").status_code == 201
        token = _login(client, "alice", GOOD).json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        for bad in ("short", "a" * 1025):
            r = client.put(
                "/auth/password",
                json={"current_password": GOOD, "new_password": bad},
                headers=headers,
            )
            assert r.status_code == 422, bad
        assert _login(client, "alice", GOOD).status_code == 200

    def test_login_keeps_no_minimum_so_an_old_short_password_still_works(self, client):
        assert _register(client, "alice").status_code == 201
        short = ("pw", "$2b$04$" + "a" * 53)
        _sql("UPDATE users SET hashed_password=? WHERE username=?", (short[1], "alice"))
        # Wrong hash on purpose: the point is that "pw" reaches verification (401), not 422.
        assert _login(client, "alice", "pw").status_code == 401

    def test_an_oversized_login_is_refused_before_any_hash_or_query(self, client, monkeypatch):
        assert _register(client, "alice").status_code == 201
        from app import auth

        def boom(*_a: Any, **_k: Any):
            raise AssertionError("password work ran for an oversized password")

        monkeypatch.setattr(auth, "check_password", boom)
        r = _login(client, "alice", "a" * 1025)
        assert r.status_code == 422

    def test_a_password_that_is_not_encodable_is_refused(self):
        """A lone surrogate is valid JSON and not UTF-8. Over HTTP pydantic already refuses it as
        `string_unicode` — and FastAPI's own 422 renderer then fails to encode the echoed input,
        a 500 for ANY string field (pre-existing, recorded in brief 0067, not this change's
        surface). The policy itself refuses it, so no code path can hash it."""
        from app.auth import password_problem

        assert password_problem("abcdefgh\ud800", new=True) is not None
        assert password_problem("abcdefgh\ud800", new=False) is not None


class TestTheBodyLimit:
    def test_a_declared_oversized_auth_body_is_413(self, client):
        body = b'{"username": "alice", "password": "' + b"a" * 20000 + b'"}'
        r = client.post("/auth/login", content=body, headers={"Content-Type": "application/json"})
        assert r.status_code == 413
        assert "x-request-id" in {k.lower() for k in r.headers}

    def test_a_chunked_oversized_auth_body_is_413(self, client):
        def chunks():
            yield b'{"username": "alice", "password": "'
            for _ in range(40):
                yield b"a" * 1024
            yield b'"}'

        r = client.post(
            "/auth/login", content=chunks(), headers={"Content-Type": "application/json"}
        )
        assert r.status_code == 413

    def test_the_rest_of_the_api_has_the_nginx_default(self, client, auth):
        big = "d" * (1024 * 1024 + 10)
        r = client.post("/tasks", json={"description": big}, headers=auth)
        assert r.status_code == 413
        ok = client.post("/tasks", json={"description": "d" * 30000}, headers=auth)
        assert ok.status_code != 413

    def test_a_normal_login_passes(self, client):
        assert _register(client, "alice").status_code == 201
        assert _login(client, "alice", GOOD).status_code == 200


class TestNulBytes:
    def test_a_nul_byte_on_a_legacy_account_is_401_not_500(self, client):
        _legacy_account(client, "alice", LEGACY["short"])
        assert _login(client, "alice", "correct\x00horse").status_code == 401

    def test_a_nul_byte_on_an_unknown_account_is_401(self, client):
        assert _login(client, "nobody", "abc\x00def").status_code == 401


# --- migration: rehash-on-login and the ambiguous case -----------------------------------------


class TestRehashOnLogin:
    @pytest.mark.parametrize("name", ["short", "seventy_one"])
    def test_an_exact_legacy_login_is_rehashed_once(self, client, name):
        password = _legacy_account(client, "alice", LEGACY[name])
        before = _version("alice")
        r = _login(client, "alice", password)
        assert r.status_code == 200, r.text
        assert r.json().get("password_change_required") is False
        stored = _stored_hash("alice")
        assert stored.startswith("$argon2id$")
        # The same password, so no session ends.
        assert _version("alice") == before
        # And it keeps working, now against Argon2id, without a second rehash.
        assert _login(client, "alice", password).status_code == 200
        assert _stored_hash("alice") == stored

    def test_the_rehash_is_audited(self, client):
        password = _legacy_account(client, "alice", LEGACY["short"])
        _login(client, "alice", password)
        from app import audit, database

        rows = (
            sqlite3.connect(database.audit_db_path())
            .execute("SELECT outcome FROM audit_events WHERE event=?", (audit.PASSWORD_REHASHED,))
            .fetchall()
        )
        assert rows == [("success",)]

    def test_a_wrong_password_on_a_legacy_account_changes_nothing(self, client):
        _legacy_account(client, "alice", LEGACY["short"])
        assert _login(client, "alice", "not the password at all").status_code == 401
        assert _stored_hash("alice") == LEGACY["short"][1]

    def test_the_old_token_survives_the_rehash(self, client):
        password = _legacy_account(client, "alice", LEGACY["short"])
        token = _login(client, "alice", password).json()["access_token"]
        assert (
            client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200
        )


class TestTheAmbiguousLegacyCase:
    """A bcrypt hash and an input of 72 bytes or more: bcrypt saw only the first 72, so the input
    may be the real password or its prefix plus anything. It must never become the new hash."""

    @pytest.mark.parametrize("name", ["seventy_two", "long_ascii", "long_umlaut", "long_emoji"])
    def test_inside_the_window_it_logs_in_but_is_not_rehashed(self, client, name):
        password = _legacy_account(client, "alice", LEGACY[name])
        r = _login(client, "alice", password)
        assert r.status_code == 200, r.text
        assert r.json()["password_change_required"] is True
        assert _stored_hash("alice") == LEGACY[name][1]

    def test_a_different_suffix_is_never_written_as_the_new_hash(self, client):
        password = _legacy_account(client, "alice", LEGACY["long_ascii"])
        forged = password[:72] + "-what-mallory-typed"
        r = _login(client, "alice", forged)
        # bcrypt cannot tell; inside the window the login is what it always was ...
        assert r.status_code == 200
        # ... but the forged suffix does not become Alice's password.
        assert _stored_hash("alice") == LEGACY["long_ascii"][1]
        assert r.json()["password_change_required"] is True

    def test_after_the_window_it_is_refused(self, client):
        password = _legacy_account(client, "alice", LEGACY["long_ascii"])
        _expand_days_ago(68)
        assert _login(client, "alice", password).status_code == 401
        assert _stored_hash("alice") == LEGACY["long_ascii"][1]

    def test_after_the_window_an_exact_legacy_account_still_migrates(self, client):
        password = _legacy_account(client, "alice", LEGACY["short"])
        _expand_days_ago(68)
        assert _login(client, "alice", password).status_code == 200
        assert _stored_hash("alice").startswith("$argon2id$")

    def test_inside_the_window_the_password_change_is_the_way_out(self, client):
        password = _legacy_account(client, "alice", LEGACY["long_ascii"])
        token = _login(client, "alice", password).json()["access_token"]
        r = client.put(
            "/auth/password",
            json={"current_password": password, "new_password": GOOD},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, r.text
        assert _stored_hash("alice").startswith("$argon2id$")
        assert _login(client, "alice", GOOD).json()["password_change_required"] is False

    def test_a_missing_phase_row_fails_closed(self, client):
        password = _legacy_account(client, "alice", LEGACY["long_ascii"])
        _sql("DELETE FROM site_settings WHERE key='password_kdf_expand_at'")
        assert _login(client, "alice", password).status_code == 401


class TestTheSoak:
    """For the first 7 days after the first boot new hashes are still bcrypt, so the previous image
    can verify every hash this one wrote if it is rolled back."""

    @pytest.fixture
    def real_soak(self, monkeypatch):
        from datetime import timedelta

        from app import auth

        monkeypatch.setattr(auth, "KDF_SOAK", timedelta(days=7))

    def test_during_the_soak_a_new_password_is_bcrypt_and_nothing_is_rehashed(
        self, client, real_soak
    ):
        assert _register(client, "bob").status_code == 201
        assert _stored_hash("bob").startswith("$2b$")
        password = _legacy_account(client, "alice", LEGACY["short"])
        assert _login(client, "alice", password).status_code == 200
        assert _stored_hash("alice") == LEGACY["short"][1]

    def test_a_soak_hash_is_one_passlib_could_verify(self, client, real_soak):
        assert _register(client, "bob").status_code == 201
        import bcrypt

        assert bcrypt.checkpw(GOOD.encode(), _stored_hash("bob").encode())
        assert _stored_hash("bob").startswith("$2b$")

    def test_after_the_soak_it_is_argon2id(self, client, real_soak):
        _expand_days_ago(8)
        assert _register(client, "bob").status_code == 201
        assert _stored_hash("bob").startswith("$argon2id$")
        password = _legacy_account(client, "alice", LEGACY["short"])
        assert _login(client, "alice", password).status_code == 200
        assert _stored_hash("alice").startswith("$argon2id$")


# --- no user-existence or hash-scheme oracle ---------------------------------------------------


class TestUniformWork:
    """Every login costs one Argon2id verification and one bcrypt check, whatever the account."""

    @pytest.fixture
    def work(self, monkeypatch) -> list[str]:
        import bcrypt

        calls: list[str] = []
        real_check = bcrypt.checkpw

        def check(*a: Any):
            calls.append("bcrypt")
            return real_check(*a)

        # checkpw only: bcrypt 4.0.1's checkpw calls hashpw itself, and verification never
        # calls hashpw directly.
        monkeypatch.setattr(bcrypt, "checkpw", check)
        try:
            from argon2 import PasswordHasher

            real_verify = PasswordHasher.verify

            def verify(self, *a: Any, **k: Any):
                calls.append("argon2")
                return real_verify(self, *a, **k)

            monkeypatch.setattr(PasswordHasher, "verify", verify)
        except ImportError:
            pass
        return calls

    def _cost(self, client, work: list[str], username: str, password: str) -> list[str]:
        work.clear()
        r = _login(client, username, password)
        assert r.status_code == 401
        return sorted(work)

    def test_unknown_wrong_bcrypt_and_argon2_cost_the_same(self, client, work):
        _legacy_account(client, "legacy", LEGACY["short"])
        assert _register(client, "modern").status_code == 201
        assert _stored_hash("modern").startswith("$argon2id$")
        unknown = self._cost(client, work, "nobody-at-all", "whatever it is")
        legacy = self._cost(client, work, "legacy", "whatever it is")
        modern = self._cost(client, work, "modern", "whatever it is")
        assert unknown == legacy == modern == ["argon2", "bcrypt"]

    def test_the_answer_is_the_same(self, client):
        _legacy_account(client, "legacy", LEGACY["short"])
        assert _register(client, "modern").status_code == 201
        answers = {
            (r.status_code, r.text)
            for r in (
                _login(client, "nobody", "whatever it is"),
                _login(client, "legacy", "whatever it is"),
                _login(client, "modern", "whatever it is"),
                _login(client, "legacy", "x" * 80),
            )
        }
        assert answers == {(401, '{"detail":"Invalid credentials"}')}


# --- unit: KDF selection, parameters, legacy verification ---------------------------------------


class TestKdfUnit:
    def test_production_parameters_are_the_documented_ones(self):
        from app import auth

        assert (auth.ARGON2_TIME_COST, auth.ARGON2_MEMORY_KIB, auth.ARGON2_PARALLELISM) == (
            auth.PRODUCTION_ARGON2.time_cost,
            auth.PRODUCTION_ARGON2.memory_cost,
            auth.PRODUCTION_ARGON2.parallelism,
        )
        # The floor of the OWASP Password Storage Cheat Sheet's Argon2id table.
        assert auth.ARGON2_MEMORY_KIB >= 19456
        assert auth.ARGON2_TIME_COST >= 2

    def test_one_hash_at_production_parameters(self):
        """The only test that runs the production work factor (RISK-TEST-003): correctness, not
        latency. Every other test runs the reduced parameters of conftest.py."""
        from argon2 import PasswordHasher

        from app import auth

        hasher: PasswordHasher = auth.PRODUCTION_ARGON2
        stored = hasher.hash(GOOD)
        assert stored.startswith(
            f"$argon2id$v=19$m={auth.ARGON2_MEMORY_KIB},t={auth.ARGON2_TIME_COST},"
            f"p={auth.ARGON2_PARALLELISM}$"
        )
        assert hasher.verify(stored, GOOD)
        # The reduced test hasher is genuinely reduced, and a production hash read by it is
        # flagged for rehash, never silently accepted as current.
        assert auth._argon2.memory_cost < auth.ARGON2_MEMORY_KIB
        assert auth._argon2.check_needs_rehash(stored)

    @pytest.mark.parametrize("name", list(LEGACY))
    def test_every_passlib_vector_verifies(self, name):
        from app.auth import KdfPhase, check_password

        password, stored = LEGACY[name]
        result = check_password(password, stored, phase=KdfPhase(True, True))
        assert result.ok
        exact = len(password.encode()) < 72
        assert result.rehash is exact
        assert result.change_required is (not exact)

    def test_the_production_cost_vector_verifies(self):
        from app.auth import KdfPhase, check_password

        assert check_password(*LEGACY_COST_12, phase=KdfPhase(True, True)).ok

    def test_the_seventy_one_byte_vector_does_not_take_a_suffix(self):
        from app.auth import KdfPhase, check_password

        password, stored = LEGACY["seventy_one"]
        assert not check_password(password + "z", stored, phase=KdfPhase(True, True)).ok

    def test_phase_boundaries(self):
        from app import auth

        now = 10_000_000
        soak = auth.KDF_SOAK.total_seconds()
        window = (auth.KDF_SOAK + auth.LONG_BCRYPT_WINDOW).total_seconds()
        assert auth.kdf_phase(None, now) == auth.KdfPhase(True, False)
        assert auth.kdf_phase(now, now).accept_long_bcrypt
        assert auth.kdf_phase(int(now - window), now) == auth.KdfPhase(True, False)
        assert auth.kdf_phase(int(now - window + 1), now).accept_long_bcrypt
        assert auth.kdf_phase(int(now - soak), now).write_argon2

    def test_real_constants(self):
        from datetime import timedelta

        from app import auth

        assert auth.LONG_BCRYPT_WINDOW == timedelta(days=60)
        assert (auth.PASSWORD_MIN_BYTES, auth.PASSWORD_MAX_BYTES) == (8, 1024)

    @pytest.mark.parametrize(
        ("value", "new", "problem"),
        [
            ("a" * 8, True, False),
            ("a" * 7, True, True),
            ("a" * 7, False, False),
            ("", False, False),
            ("a" * 1024, True, False),
            ("a" * 1025, False, True),
            ("ä" * 512, True, False),
            ("ä" * 513, True, True),
            ("\ud800abcdefgh", True, True),
        ],
    )
    def test_password_problem(self, value, new, problem):
        from app.auth import password_problem

        assert (password_problem(value, new=new) is not None) is problem

    def test_an_unrecognised_hash_never_verifies(self):
        from app.auth import KdfPhase, check_password

        for stored in ("", "plain", "$argon2id$garbage", "$2b$04$short", None):
            assert not check_password("anything at all", stored, phase=KdfPhase(True, True)).ok


# --- DB integration and parallel -------------------------------------------------------------


class TestRehashCompareAndSwap:
    def test_the_phase_row_is_written_once(self, client):
        first = _sql("SELECT value FROM site_settings WHERE key='password_kdf_expand_at'")
        assert len(first) == 1
        import asyncio

        from app.database import init_db

        asyncio.run(init_db())
        again = _sql("SELECT value FROM site_settings WHERE key='password_kdf_expand_at'")
        assert again[0][0] == first[0][0]

    def test_a_rehash_does_not_overwrite_a_changed_password(self, client):
        import asyncio

        import aiosqlite

        from app.database import rehash_password

        _legacy_account(client, "alice", LEGACY["short"])
        _sql("UPDATE users SET hashed_password=? WHERE username='alice'", ("changed meanwhile",))

        async def attempt() -> bool:
            async with aiosqlite.connect(settings.db_path) as db:
                return await rehash_password(db, "alice", LEGACY["short"][1], "$argon2id$new")

        assert asyncio.run(attempt()) is False
        assert _stored_hash("alice") == "changed meanwhile"

    def test_a_login_racing_a_password_change_never_resurrects_the_old_password(
        self, client, monkeypatch
    ):
        """The login verifies the legacy hash, then a password change commits, then the login's
        rehash runs: the compare-and-swap must find the hash changed and write nothing."""
        password = _legacy_account(client, "alice", LEGACY["short"])
        from app.routers import auth as auth_router

        verified = threading.Event()
        changed = threading.Event()
        real_check = auth_router.check_password

        def slow_check(*a: Any, **k: Any):
            result = real_check(*a, **k)
            if a and a[0] == password and not verified.is_set():
                verified.set()
                assert changed.wait(10)
            return result

        monkeypatch.setattr(auth_router, "check_password", slow_check)
        results: dict[str, int] = {}

        def login() -> None:
            results["login"] = _login(client, "alice", password).status_code

        t = threading.Thread(target=login, name="login")
        t.start()
        assert verified.wait(10)
        _sql(
            "UPDATE users SET hashed_password=?, auth_version=auth_version+1 WHERE username='alice'",
            ("$argon2id$changed-by-the-owner",),
        )
        changed.set()
        t.join(10)
        assert results["login"] == 200
        assert _stored_hash("alice") == "$argon2id$changed-by-the-owner"


class TestTheOperatorReset:
    """The recovery path of docs/operations.md, statement for statement: an account refused after
    Switch 2 gets a temporary Argon2id password and every session ends."""

    def test_the_runbook_statement_recovers_a_refused_account(self, client):
        from app.auth import hash_password, password_problem

        password = _legacy_account(client, "alice", LEGACY["long_ascii"])
        token = _login(client, "alice", password).json()["access_token"]
        _expand_days_ago(68)
        assert _login(client, "alice", password).status_code == 401

        temporary = "temporary pass 42"  # secret-scan: allow — synthetic test value
        assert password_problem(temporary, new=True) is None
        con = sqlite3.connect(settings.db_path)
        n = con.execute(
            "UPDATE users SET hashed_password = ?, auth_version = auth_version + 1"
            " WHERE username = ?",
            (hash_password(temporary), "alice"),
        ).rowcount
        con.commit()
        con.close()
        assert n == 1
        r = _login(client, "alice", temporary)
        assert r.status_code == 200
        assert r.json()["password_change_required"] is False
        # The session from before the reset is over.
        assert (
            client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
        )
