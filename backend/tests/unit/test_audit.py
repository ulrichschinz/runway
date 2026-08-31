"""The audit log: the rows it writes, the credential shape it names, and what it refuses.

Three tests in here carry the weight and the rest support them.

`TestTheCredentialShapeDiscriminator` is the reason the whole module exists: the `registered`
fixture hands out both a JWT and an API key, so the same account can authenticate three ways
and the rows have to come back with three different values. Without that, this change answers
nothing about `SHIM-SEC-006`.

`test_no_credential_appears_anywhere_in_the_audit_database` is the adversarial proof required
by the Security-or-Operability pattern: drive every credential-handling endpoint, then dump
every value of every column of every row and assert the real token, the real API keys and the
real passwords are absent.

`test_an_audit_write_failure_does_not_fail_the_request` is the one that protects the service
from this feature. An audit row is evidence about a request; it must never be part of serving
one.
"""

from __future__ import annotations

import contextlib
import io
import json
import logging
import sqlite3
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app import audit, database
from app.auth import create_access_token
from app.config import settings
from app.database import generate_api_key
from app.logging_setup import REDACTION_MARKER, REQUEST_ID_HEADER, JsonFormatter

# --- reading the store back -------------------------------------------------------------


def query(sql: str, parameters: tuple = ()) -> list[dict]:
    """Run one read against the audit database and close the connection behind it."""
    con = sqlite3.connect(database.audit_db_path())
    try:
        con.row_factory = sqlite3.Row
        return [dict(r) for r in con.execute(sql, parameters).fetchall()]
    finally:
        con.close()


def rows(event: str | None = None) -> list[dict]:
    """Every audit row, oldest first, as plain dicts."""
    found = query("SELECT * FROM audit_events ORDER BY id")
    return [r for r in found if event is None or r["event"] == event]


@contextlib.contextmanager
def captured(name: str) -> Iterator[io.StringIO]:
    """Capture one logger's own output, in the real JSON shape.

    Attached to the named logger rather than to the root handler, because two of the tests
    below boot the application a second time and `configure_logging` replaces root's handlers
    when they do. A handler on `app.audit` survives that; a redirected root handler does not.
    """
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    log = logging.getLogger(name)
    log.addHandler(handler)
    try:
        yield stream
    finally:
        log.removeHandler(handler)


def lines(stream: io.StringIO) -> list[dict]:
    return [json.loads(line) for line in stream.getvalue().splitlines() if line.strip()]


def only(event: str) -> dict:
    """The single row for this event, asserting there is exactly one."""
    found = rows(event)
    assert len(found) == 1, f"expected one {event} row, got {len(found)}"
    return found[0]


def last(event: str) -> dict:
    found = rows(event)
    assert found, f"no {event} row was written"
    return found[-1]


@pytest.fixture
def admin(client: TestClient, registered: dict[str, str]) -> dict[str, str]:
    """Promote the registered user in the database, as `test_admin.py` does."""
    con = sqlite3.connect(settings.db_path)
    con.execute("UPDATE users SET role='admin' WHERE username=?", (registered["username"],))
    con.commit()
    con.close()
    return {"Authorization": f"Bearer {registered['token']}"}


# --- the store itself ---------------------------------------------------------------------


class TestTheStore:
    def test_it_is_its_own_file_beside_the_task_data(self, client: TestClient):
        """Not a table in users.db, and not a stream that log rotation can take away."""
        path = database.audit_db_path()
        assert path.name == "audit.db"
        assert path.parent == settings.data_root
        assert path.exists()
        assert str(path) != settings.db_path

    def test_the_columns_are_exactly_the_declared_list(self, client: TestClient):
        """Pinned rather than snapshotted.

        There is one version of this schema and it is created fresh everywhere, so a snapshot
        under ops/surfaces/ would only ever describe the fresh path — which is precisely the
        weakness RISK-SURF-001 records about the users schema. This assertion instead makes
        the column list something a change has to move deliberately.
        """
        columns = [r["name"] for r in query("PRAGMA table_info(audit_events)")]
        assert tuple(columns) == audit.AUDIT_COLUMNS

    def test_the_shim_query_has_an_index_to_run_on(self, client: TestClient):
        names = {r["name"] for r in query("SELECT name FROM sqlite_master WHERE type='index'")}
        assert "audit_events_shape" in names
        assert "audit_events_event_time" in names

    def test_init_store_is_idempotent(self, client: TestClient):
        before = len(rows())
        audit.init_store()
        audit.init_store()
        assert len(rows()) == before

    def test_every_event_constant_is_in_the_declared_vocabulary(self):
        declared = {
            value
            for name, value in vars(audit).items()
            if name.isupper() and isinstance(value, str) and "." in value
        }
        assert declared == audit.EVENTS

    def test_the_timestamp_is_the_same_shape_the_log_stream_stamps(self, client: TestClient):
        recorded = only(audit.ADMIN_BOOTSTRAP)["recorded_at"]
        assert recorded.endswith("Z")
        assert recorded[10] == "T"


# --- one test per event type ---------------------------------------------------------------


class TestEvents:
    def test_the_admin_bootstrap_records_the_reason_it_already_returned(self, client: TestClient):
        row = only(audit.ADMIN_BOOTSTRAP)
        assert row["outcome"] == audit.NOOP
        assert row["detail"] == "noop: no admin, and BOOTSTRAP_ADMIN is unset"
        assert row["actor"] is None
        # No request ran; an absent id is honest where an invented one would not be.
        assert row["request_id"] is None

    def test_a_real_bootstrap_promotion_is_recorded_as_a_success(
        self, isolated_storage, fake_task, monkeypatch: pytest.MonkeyPatch
    ):
        """The branch that actually changes a role, driven end to end through the lifespan."""
        from app.main import app

        with TestClient(app):
            con = sqlite3.connect(settings.db_path)
            con.execute(
                "INSERT INTO users (username, hashed_password, api_key) VALUES (?, ?, ?)",
                ("boot", "x", generate_api_key()),
            )
            con.commit()
            con.close()

        monkeypatch.setattr(settings, "bootstrap_admin", "boot")
        with TestClient(app):
            pass

        row = last(audit.ADMIN_BOOTSTRAP)
        assert row["outcome"] == audit.SUCCESS
        assert "promoted 'boot' to admin" in row["detail"]

    def test_registration_succeeded(self, client: TestClient, registered: dict[str, str]):
        row = only(audit.REGISTERED)
        assert (row["actor"], row["outcome"]) == ("alice", audit.SUCCESS)
        assert row["route"] == "POST /auth/register"

    def test_registration_refused_when_the_instance_is_closed(
        self, client: TestClient, admin: dict[str, str]
    ):
        client.put("/admin/settings", json={"allow_registration": False}, headers=admin)
        assert (
            client.post("/auth/register", json={"username": "bob", "password": "pw"}).status_code
            == 403
        )

        row = last(audit.REGISTERED)
        assert (row["actor"], row["outcome"]) == ("bob", audit.REFUSED)
        assert row["detail"] == "registration is disabled on this instance"

    def test_registration_failed_on_a_taken_username(
        self, client: TestClient, registered: dict[str, str]
    ):
        assert (
            client.post("/auth/register", json={"username": "alice", "password": "x"}).status_code
            == 400
        )
        row = last(audit.REGISTERED)
        assert (row["actor"], row["outcome"]) == ("alice", audit.FAILURE)
        assert row["detail"] == "username already taken"

    def test_login_succeeded(self, client: TestClient, registered: dict[str, str]):
        row = last(audit.LOGIN_SUCCEEDED)
        assert (row["actor"], row["outcome"]) == ("alice", audit.SUCCESS)
        assert row["route"] == "POST /auth/login"
        # Password authentication is not one of the three credential shapes: those describe
        # how a request proved an EXISTING session, and this is the request that creates one.
        assert row["auth_shape"] is None

    def test_login_failed(self, client: TestClient, registered: dict[str, str]):
        assert (
            client.post("/auth/login", json={"username": "alice", "password": "no"}).status_code
            == 401
        )
        row = only(audit.LOGIN_FAILED)
        assert (row["actor"], row["outcome"]) == ("alice", audit.FAILURE)

    def test_login_failed_says_nothing_about_whether_the_account_exists(
        self, client: TestClient, registered: dict[str, str]
    ):
        """The user-enumeration oracle the rate limiter avoids must not reappear as a row."""
        client.post("/auth/login", json={"username": "alice", "password": "no"})
        client.post("/auth/login", json={"username": "ghost", "password": "no"})
        real, absent = rows(audit.LOGIN_FAILED)
        assert real["outcome"] == absent["outcome"] == audit.FAILURE
        assert real["detail"] is None and absent["detail"] is None

    def test_login_lockout(self, client: TestClient, registered: dict[str, str]):
        wrong = {"username": "alice", "password": "no"}
        statuses = {client.post("/auth/login", json=wrong).status_code for _ in range(12)}
        assert statuses == {401, 429}

        row = last(audit.LOGIN_THROTTLED)
        assert (row["actor"], row["outcome"]) == ("alice", audit.REFUSED)
        assert "retry in" in row["detail"]

    def test_the_password_change(self, client: TestClient, auth, registered: dict[str, str]):
        body = {
            "current_password": registered["password"],
            "new_password": "another long passphrase",
        }
        assert client.put("/auth/password", json=body, headers=auth).status_code == 200
        row = only(audit.PASSWORD_CHANGED)
        assert (row["actor"], row["outcome"]) == ("alice", audit.SUCCESS)
        assert row["route"] == "PUT /auth/password"

    def test_a_refused_password_change(self, client: TestClient, auth):
        body = {"current_password": "not it", "new_password": "another long passphrase"}
        assert client.put("/auth/password", json=body, headers=auth).status_code == 400
        row = only(audit.PASSWORD_CHANGED)
        assert (row["actor"], row["outcome"]) == ("alice", audit.FAILURE)

    def test_the_api_key_disclosure(self, client: TestClient, auth):
        """GET /auth/apikey hands back a permanent credential in cleartext — finding SEC-5.

        The route is not changed here; what changes is that its use is on the record.
        """
        assert client.get("/auth/apikey", headers=auth).status_code == 200
        # One from the `registered` fixture, one from the call above.
        found = rows(audit.APIKEY_DISCLOSED)
        assert len(found) == 2
        assert found[-1]["actor"] == "alice"
        assert found[-1]["outcome"] == audit.SUCCESS
        assert found[-1]["route"] == "GET /auth/apikey"
        assert "SEC-5" in found[-1]["detail"]

    def test_the_key_regeneration(self, client: TestClient, auth):
        assert client.post("/auth/apikey/regenerate", headers=auth).status_code == 200
        row = only(audit.APIKEY_REGENERATED)
        assert (row["actor"], row["outcome"]) == ("alice", audit.SUCCESS)
        assert row["route"] == "POST /auth/apikey/regenerate"

    def test_a_role_change(self, client: TestClient, admin: dict[str, str]):
        con = sqlite3.connect(settings.db_path)
        con.execute(
            "INSERT INTO users (username, hashed_password, api_key) VALUES (?, ?, ?)",
            ("bob", "x", generate_api_key()),
        )
        con.commit()
        con.close()

        assert (
            client.put("/admin/users/bob/role", json={"role": "admin"}, headers=admin).status_code
            == 200
        )
        row = only(audit.ROLE_CHANGED)
        assert (row["actor"], row["subject"]) == ("alice", "bob")
        assert row["outcome"] == audit.SUCCESS
        assert row["detail"] == "role user -> admin"
        assert row["route"] == "PUT /admin/users/{target}/role"

    def test_the_refused_last_admin_demotion(self, client: TestClient, admin: dict[str, str]):
        assert (
            client.put("/admin/users/alice/role", json={"role": "user"}, headers=admin).status_code
            == 409
        )
        row = only(audit.ROLE_CHANGED)
        assert row["outcome"] == audit.REFUSED
        assert (row["actor"], row["subject"]) == ("alice", "alice")
        assert row["detail"] == "refused: this is the last admin"

    def test_a_role_change_that_names_no_such_user(self, client: TestClient, admin: dict[str, str]):
        assert (
            client.put("/admin/users/ghost/role", json={"role": "admin"}, headers=admin).status_code
            == 404
        )
        row = only(audit.ROLE_CHANGED)
        assert (row["outcome"], row["detail"]) == (audit.FAILURE, "no such user")

    def test_a_role_change_to_a_role_that_does_not_exist(
        self, client: TestClient, admin: dict[str, str]
    ):
        assert (
            client.put("/admin/users/alice/role", json={"role": "root"}, headers=admin).status_code
            == 400
        )
        row = only(audit.ROLE_CHANGED)
        assert row["outcome"] == audit.FAILURE

    def test_the_registration_toggle(self, client: TestClient, admin: dict[str, str]):
        client.put("/admin/settings", json={"allow_registration": False}, headers=admin)
        client.put("/admin/settings", json={"allow_registration": True}, headers=admin)
        closed, opened = rows(audit.REGISTRATION_TOGGLED)
        assert closed["detail"] == "registration disabled"
        assert opened["detail"] == "registration enabled"
        assert opened["actor"] == "alice"
        assert opened["outcome"] == audit.SUCCESS

    def test_a_task_deletion(self, client: TestClient, auth, fake_task):
        created = client.post("/tasks", json={"description": "throwaway"}, headers=auth)
        assert created.status_code == 201
        uuid = created.json()["uuid"]

        assert client.delete(f"/tasks/{uuid}", headers=auth).status_code == 204
        row = only(audit.TASK_DELETED)
        assert (row["actor"], row["subject"]) == ("alice", uuid)
        assert row["outcome"] == audit.SUCCESS
        assert row["route"] == "DELETE /tasks/{uuid}"

    def test_completing_a_task_is_not_a_deletion(self, client: TestClient, auth, fake_task):
        created = client.post("/tasks", json={"description": "keep"}, headers=auth)
        uuid = created.json()["uuid"]
        assert client.post(f"/tasks/{uuid}/done", headers=auth).status_code == 204
        assert rows(audit.TASK_DELETED) == []


# --- the discriminator ----------------------------------------------------------------------


class TestTheCredentialShapeDiscriminator:
    """Three shapes, one account, three values. This is what `SHIM-SEC-006` needs."""

    def test_the_api_key_header_path(self, client: TestClient, registered: dict[str, str]):
        assert client.get("/tasks", headers={"X-Api-Key": registered["api_key"]}).status_code == 200
        assert last(audit.AUTHENTICATED)["auth_shape"] == audit.SHAPE_API_KEY_HEADER

    def test_the_bearer_jwt_path(self, client: TestClient, registered: dict[str, str]):
        headers = {"Authorization": f"Bearer {registered['token']}"}
        assert client.get("/tasks", headers=headers).status_code == 200
        assert last(audit.AUTHENTICATED)["auth_shape"] == audit.SHAPE_BEARER_JWT

    def test_the_bearer_as_api_key_shim_path(self, client: TestClient, registered: dict[str, str]):
        headers = {"Authorization": f"Bearer {registered['api_key']}"}
        assert client.get("/tasks", headers=headers).status_code == 200
        assert last(audit.AUTHENTICATED)["auth_shape"] == audit.SHAPE_BEARER_API_KEY

    def test_the_three_shapes_are_three_distinct_values(
        self, client: TestClient, registered: dict[str, str]
    ):
        """The same account, the same route, three headers — and three different rows.

        Before this change all three produced the same trace, which is none, and that is why
        the shim could not be removed on evidence.
        """
        key, token = registered["api_key"], registered["token"]
        for headers in (
            {"X-Api-Key": key},
            {"Authorization": f"Bearer {token}"},
            {"Authorization": f"Bearer {key}"},
        ):
            assert client.get("/tasks", headers=headers).status_code == 200

        shapes = [r["auth_shape"] for r in rows(audit.AUTHENTICATED)][-3:]
        assert shapes == [
            audit.SHAPE_API_KEY_HEADER,
            audit.SHAPE_BEARER_JWT,
            audit.SHAPE_BEARER_API_KEY,
        ]
        assert len(set(shapes)) == 3
        assert set(shapes) == audit.SHAPES

    def test_the_shim_query_answers_who_and_on_what_route(
        self, client: TestClient, registered: dict[str, str]
    ):
        """The query documented in docs/operations.md, run against a real store."""
        key = registered["api_key"]
        assert client.get("/tasks", headers={"Authorization": f"Bearer {key}"}).status_code == 200
        assert (
            client.get("/gtd/inbox", headers={"Authorization": f"Bearer {key}"}).status_code == 200
        )
        assert client.get("/tasks", headers={"X-Api-Key": key}).status_code == 200

        found = query(
            "SELECT actor, route, COUNT(*) AS calls FROM audit_events "
            "WHERE event = ? AND auth_shape = ? "
            "GROUP BY actor, route ORDER BY calls DESC, route",
            (audit.AUTHENTICATED, audit.SHAPE_BEARER_API_KEY),
        )
        assert found == [
            {"actor": "alice", "route": "GET /gtd/inbox", "calls": 1},
            {"actor": "alice", "route": "GET /tasks", "calls": 1},
        ]

    def test_a_rejected_credential_writes_no_row(self, client: TestClient, registered):
        """Deliberate: an unauthenticated caller must not be able to append to this file."""
        before = len(rows())
        assert client.get("/tasks", headers={"X-Api-Key": "not a key"}).status_code == 401
        assert client.get("/tasks", headers={"Authorization": "Bearer nope"}).status_code == 401
        assert client.get("/tasks").status_code == 401
        assert len(rows()) == before


# --- correlation ------------------------------------------------------------------------------


def test_the_row_carries_the_request_id_of_the_lines_around_it(client: TestClient, auth):
    """The join key. An audit row and the log lines from the same request must agree."""
    with captured("app.routers.auth") as stream:
        response = client.post("/auth/apikey/regenerate", headers=auth)
    assert response.status_code == 200
    request_id = response.headers[REQUEST_ID_HEADER]

    logged = [line for line in lines(stream) if line["message"] == "api key regenerated"]
    assert len(logged) == 1

    row = only(audit.APIKEY_REGENERATED)
    assert row["request_id"] == request_id == logged[0]["request_id"]


# --- no credential, ever ------------------------------------------------------------------------


def every_value_written() -> str:
    """Every value of every column of every row, as one blob to search."""
    return "\n".join(
        "".join("" if value is None else str(value) for value in row.values()) for row in rows()
    )


def test_no_credential_appears_anywhere_in_the_audit_database(
    client: TestClient, registered: dict[str, str], fake_task
):
    """The adversarial proof: drive everything that touches a credential, then dump the file.

    `registered` yields a real password, a real JWT and a real API key, which is exactly the
    material a leak would consist of. Every endpoint below either receives one, returns one or
    mints one.
    """
    token, key, password = registered["token"], registered["api_key"], registered["password"]
    headers = {"Authorization": f"Bearer {token}"}

    assert (
        client.post("/auth/login", json={"username": "alice", "password": password}).status_code
        == 200
    )
    assert client.get("/auth/apikey", headers=headers).status_code == 200

    rotated = client.post("/auth/apikey/regenerate", headers=headers)
    new_key = rotated.json()["api_key"]
    assert client.get("/tasks", headers={"X-Api-Key": new_key}).status_code == 200
    assert client.get("/tasks", headers={"Authorization": f"Bearer {new_key}"}).status_code == 200

    replacement = "a completely different passphrase"
    assert (
        client.put(
            "/auth/password",
            headers=headers,
            json={"current_password": password, "new_password": replacement},
        ).status_code
        == 200
    )
    assert (
        client.post("/auth/login", json={"username": "alice", "password": "wrong one"}).status_code
        == 401
    )

    written = every_value_written()

    # Not vacuous: the rows really are there.
    events = {row["event"] for row in rows()}
    assert {
        audit.AUTHENTICATED,
        audit.LOGIN_SUCCEEDED,
        audit.LOGIN_FAILED,
        audit.APIKEY_DISCLOSED,
        audit.APIKEY_REGENERATED,
        audit.PASSWORD_CHANGED,
    } <= events
    assert audit.SHAPE_BEARER_API_KEY in written

    for secret in (token, key, new_key, password, replacement, "wrong one", settings.jwt_secret):
        assert secret not in written, f"{secret[:12]}... reached the audit database"

    # And the hashes too: a bcrypt digest is offline-attackable, so it is a credential here.
    con = sqlite3.connect(settings.db_path)
    (hashed,) = con.execute("SELECT hashed_password FROM users WHERE username='alice'").fetchone()
    con.close()
    assert hashed not in written


class TestTheRedactionBackstop:
    """A call site that got it wrong still cannot persist a credential.

    No call site in this repository passes a credential to `record`, and these tests do not
    prove that they do not — the test above does. These prove the second line of defence.
    """

    def test_a_jwt_handed_to_record_is_stored_redacted(self, client: TestClient):
        token = create_access_token("alice")
        audit.record(audit.AUTHENTICATED, outcome=audit.SUCCESS, detail=token)
        assert token not in every_value_written()
        assert REDACTION_MARKER in last(audit.AUTHENTICATED)["detail"]

    def test_an_api_key_handed_to_record_is_stored_redacted(self, client: TestClient):
        key = generate_api_key()
        audit.record(audit.AUTHENTICATED, outcome=audit.SUCCESS, actor=key)
        assert key not in every_value_written()

    def test_the_signing_key_handed_to_record_is_stored_redacted(self, client: TestClient):
        audit.record(audit.AUTHENTICATED, outcome=audit.SUCCESS, detail=settings.jwt_secret)
        assert settings.jwt_secret not in every_value_written()

    def test_an_ordinary_value_survives_intact(self, client: TestClient):
        audit.record(audit.TASK_DELETED, outcome=audit.SUCCESS, actor="alice", subject="a-b-c-d")
        row = only(audit.TASK_DELETED)
        assert (row["actor"], row["subject"]) == ("alice", "a-b-c-d")


# --- failure must not propagate ------------------------------------------------------------------


@pytest.fixture
def broken_audit_store(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Make every audit write fail, the way a full disk or a bad mount would."""

    def refuse(*args, **kwargs):
        raise sqlite3.OperationalError("attempt to write a readonly database")

    monkeypatch.setattr(database, "audit_connection", refuse)
    yield


def test_an_audit_write_failure_does_not_fail_the_request(
    client: TestClient, auth, fake_task, broken_audit_store
):
    """The request is served, the failure is on the log, and nothing 500s."""
    with captured("app.audit") as stream:
        assert client.get("/auth/apikey", headers=auth).status_code == 200
        assert client.get("/tasks", headers=auth).status_code == 200

    failures = [
        line for line in lines(stream) if line["message"] == "the audit event could not be written"
    ]
    assert failures, "the failure was swallowed silently, which is the one thing it must not be"
    assert failures[0]["level"] == "ERROR"
    assert failures[0]["audit_event"] in audit.EVENTS
    assert "readonly" in failures[0]["audit_error"]
    # And the shape of the fix: the row is gone, the evidence that it existed is not.
    assert {line["outcome"] for line in failures} == {audit.SUCCESS}


def test_a_store_that_cannot_be_initialised_does_not_stop_the_boot(
    isolated_storage, fake_task, monkeypatch: pytest.MonkeyPatch
):
    def refuse(*args, **kwargs):
        raise sqlite3.OperationalError("unable to open database file")

    monkeypatch.setattr(database, "audit_connection", refuse)

    from app.main import app

    with captured("app.audit") as stream, TestClient(app) as broken:
        assert broken.get("/health").status_code == 200

    assert any(
        line["message"] == "the audit store could not be initialised" for line in lines(stream)
    )


def test_route_of_tolerates_a_request_that_was_never_routed(client: TestClient):
    assert audit.route_of(None) is None
