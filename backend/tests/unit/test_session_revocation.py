"""A password change ends every session (finding REV-001, ADR 0044, brief 0066).

Before this change a JWT carried `sub` and `exp` only, so a token issued before a password change
kept working on every route — REST and MCP — until it expired. Changing the password after a token
was stolen did not lock the thief out. These tests construct exactly that and require 401.

The route list is taken from the served OpenAPI snapshot (`ops/surfaces/openapi.json`), not written
out by hand: a route added later is covered without anyone remembering to add it here.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
import threading
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import aiosqlite
import httpx
import pytest
from jose import jwt

from app.config import settings

OPENAPI = Path(__file__).resolve().parents[3] / "ops" / "surfaces" / "openapi.json"
NEW_PASSWORD = "a brand new passphrase"  # secret-scan: allow — a synthetic test value
TIMEOUT = 10


def _protected_operations() -> list[tuple[str, str]]:
    """Every (method, path) the served schema marks as needing a credential."""
    spec = json.loads(OPENAPI.read_text())
    ops = []
    for path, methods in spec["paths"].items():
        for method, op in methods.items():
            if op.get("security"):
                ops.append((method.upper(), path))
    return sorted(ops)


PROTECTED = _protected_operations()


def _concrete(path: str) -> str:
    """Fill every path parameter with a harmless placeholder."""
    out = []
    for part in path.split("/"):
        out.append("placeholder" if part.startswith("{") and part.endswith("}") else part)
    return "/".join(out)


def _call(client, method: str, path: str, headers: dict[str, str]):
    body = {} if method in ("POST", "PUT", "PATCH") else None
    return client.request(method, _concrete(path), headers=headers, json=body)


def _change_password(client, registered, headers):
    return client.put(
        "/auth/password",
        json={"current_password": registered["password"], "new_password": NEW_PASSWORD},
        headers=headers,
    )


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _db() -> sqlite3.Connection:
    con = sqlite3.connect(settings.db_path)
    con.row_factory = sqlite3.Row
    return con


def _forge(claims: dict[str, Any]) -> str:
    """A token signed with the server's real secret — what the previous image issued, or what a
    test needs to probe the decoder. Not a forgery in the attack sense: it needs the secret."""
    return jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _exp(hours: float) -> int:
    return int((datetime.now(UTC) + timedelta(hours=hours)).timestamp())


# --- the closing criterion: everywhere 401 ------------------------------------------------------


def test_the_snapshot_lists_the_protected_routes():
    """A guard on the guard: an empty list would make every test below vacuous."""
    assert len(PROTECTED) >= 30
    assert ("PUT", "/auth/password") in PROTECTED
    assert ("GET", "/tasks") in PROTECTED


class TestAnOldTokenIsRefusedEverywhere:
    def test_the_old_token_worked_before_the_change(self, client, registered, auth):
        """Positive control: without it, 401 below could be any other failure."""
        for method, path in PROTECTED:
            r = _call(client, method, path, auth)
            assert r.status_code != 401, f"{method} {path} refused a valid token: {r.text}"

    @pytest.mark.parametrize(("method", "path"), PROTECTED, ids=[f"{m} {p}" for m, p in PROTECTED])
    def test_after_a_password_change_the_old_token_is_401(
        self, client, registered, auth, method, path
    ):
        assert _change_password(client, registered, auth).status_code == 200
        r = _call(client, method, path, auth)
        assert r.status_code == 401, f"{method} {path} still accepts the old token: {r.text}"
        assert r.json()["detail"] == "Not authenticated"

    def test_the_token_in_the_response_works_and_a_fresh_login_works(
        self, client, registered, auth
    ):
        r = _change_password(client, registered, auth)
        assert r.status_code == 200
        body = r.json()
        assert body["detail"] == "Password updated"
        assert body["token_type"] == "bearer"
        assert client.get("/auth/me", headers=_bearer(body["access_token"])).status_code == 200
        login = client.post(
            "/auth/login", json={"username": registered["username"], "password": NEW_PASSWORD}
        )
        assert (
            client.get("/auth/me", headers=_bearer(login.json()["access_token"])).status_code == 200
        )

    def test_a_second_session_ends_too(self, client, registered, auth):
        """Two logins are two sessions; the change made from one ends the other."""
        other = client.post(
            "/auth/login",
            json={"username": registered["username"], "password": registered["password"]},
        ).json()["access_token"]
        assert _change_password(client, registered, auth).status_code == 200
        assert client.get("/tasks", headers=_bearer(other)).status_code == 401

    def test_the_api_key_is_not_revoked_by_a_password_change(self, client, registered, auth):
        """Decision 2 of ADR 0044: the key is a separate credential with its own rotation."""
        assert _change_password(client, registered, auth).status_code == 200
        assert (
            client.get("/auth/me", headers={"X-Api-Key": registered["api_key"]}).status_code == 200
        )

    def test_a_failed_change_revokes_nothing(self, client, registered, auth):
        r = client.put(
            "/auth/password",
            json={"current_password": "not it", "new_password": NEW_PASSWORD},
            headers=auth,
        )
        assert r.status_code == 400
        assert client.get("/auth/me", headers=auth).status_code == 200


class TestTheOperatorCanRevoke:
    def test_bumping_the_version_on_the_host_ends_the_session(self, client, registered, auth):
        """docs/operations.md: the incident response is one UPDATE, no secret rotation."""
        con = _db()
        con.execute(
            "UPDATE users SET auth_version = auth_version + 1 WHERE username=?",
            (registered["username"],),
        )
        con.commit()
        con.close()
        assert client.get("/auth/me", headers=auth).status_code == 401
        assert (
            client.get("/auth/me", headers={"X-Api-Key": registered["api_key"]}).status_code == 200
        )

    def test_the_version_cannot_go_backwards(self, client, registered):
        """A revoked token must never become valid again by the version moving down."""
        con = _db()
        con.execute("UPDATE users SET auth_version = 5 WHERE username=?", (registered["username"],))
        con.commit()
        with pytest.raises(sqlite3.IntegrityError, match="auth_version"):
            con.execute(
                "UPDATE users SET auth_version = 4 WHERE username=?", (registered["username"],)
            )
        con.close()


# --- MCP: the same check, reached through a real client session -------------------------------


def _fresh_session_manager() -> None:
    """See test_mcp_session.py: unbind the lazily started manager from the previous event loop.
    Called before every session, because a test here opens two (before and after the change)."""
    from app.main import mcp

    transport = mcp._http_transport
    if transport is not None:
        transport._manager_started = False
        transport._manager_task = None
        transport._session_manager = None


MCP_TOOLS = Path(__file__).resolve().parents[3] / "ops" / "surfaces" / "mcp-tools.json"


def _protected_tools() -> list[str]:
    """Every MCP tool in the snapshot whose REST operation needs a credential. Tool names are
    operation ids (ADR 0037), so the OpenAPI snapshot says which ones are protected."""
    spec = json.loads(OPENAPI.read_text())
    protected = {
        op["operationId"]
        for methods in spec["paths"].values()
        for op in methods.values()
        if op.get("security")
    }
    tools = [t["name"] for t in json.loads(MCP_TOOLS.read_text())["tools"]]
    return sorted(t for t in tools if t in protected)


PROTECTED_TOOLS = _protected_tools()

_PLACEHOLDER: dict[str, Any] = {
    "string": "placeholder",
    "integer": 1,
    "number": 1,
    "boolean": False,
    "array": [],
    "object": {},
}


def _minimal_arguments(schema: dict[str, Any]) -> dict[str, Any]:
    """Fill every required argument of a tool's input schema with a type-correct placeholder, so
    the call passes schema validation and reaches the REST route behind the tool."""
    args: dict[str, Any] = {}
    for name in schema.get("required", []):
        prop = schema.get("properties", {}).get(name, {})
        kind = prop.get("type")
        if kind is None:
            for alt in prop.get("anyOf", []) + prop.get("oneOf", []):
                if alt.get("type") and alt["type"] != "null":
                    kind = alt["type"]
                    break
        if "enum" in prop:
            args[name] = prop["enum"][0]
        else:
            args[name] = _PLACEHOLDER.get(kind, "placeholder")
    return args


def _mcp_call(headers: dict[str, str], tool: str = "me_auth_me_get"):
    from mcp import ClientSession
    from mcp.client.streamable_http import streamable_http_client

    from app.main import app

    _fresh_session_manager()

    async def session():
        async with app.router.lifespan_context(app):
            http = httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app),
                base_url="http://mcp-under-test",
                headers=headers,
                timeout=TIMEOUT,
            )
            async with streamable_http_client("http://mcp-under-test/mcp", http_client=http) as (
                read,
                write,
                _,
            ):
                async with ClientSession(read, write) as s:
                    await s.initialize()
                    listed = {t.name: t.inputSchema for t in (await s.list_tools()).tools}
                    return await s.call_tool(tool, _minimal_arguments(listed[tool]))

    return asyncio.run(asyncio.wait_for(session(), TIMEOUT))


def test_the_snapshot_lists_the_protected_tools():
    """A guard on the guard: every exposed tool but `health` needs a credential."""
    assert len(PROTECTED_TOOLS) == 26
    assert "health_health_get" not in PROTECTED_TOOLS


class TestMcpRefusesTheOldTokenToo:
    @pytest.mark.parametrize("tool", PROTECTED_TOOLS)
    def test_an_old_token_is_refused_at_the_tool(self, client, registered, auth, tool):
        """Every protected tool, with schema-valid arguments. The positive control is "not
        refused for authentication" rather than "succeeded": a placeholder uuid may well be 404."""
        before = _mcp_call(auth, tool)
        assert not (before.isError and "401" in before.content[0].text), before.content[0].text
        assert _change_password(client, registered, auth).status_code == 200
        after = _mcp_call(auth, tool)
        assert after.isError, f"{tool} still accepts the old token"
        assert "401" in after.content[0].text, after.content[0].text

    def test_the_new_token_reaches_the_tool(self, client, registered, auth):
        token = _change_password(client, registered, auth).json()["access_token"]
        result = _mcp_call(_bearer(token))
        assert not result.isError, result.content[0].text
        assert json.loads(result.content[0].text)["username"] == registered["username"]


# --- the token itself ---------------------------------------------------------------------------


class TestClaims:
    def test_a_new_token_carries_sub_iat_exp_jti_and_the_version(self):
        from app.auth import create_access_token

        token = create_access_token("alice", auth_version=3)
        claims = jwt.get_unverified_claims(token)
        assert claims["sub"] == "alice"
        assert claims["auth_version"] == 3
        assert isinstance(claims["iat"], int)
        assert claims["exp"] > claims["iat"]
        assert claims["jti"]

    def test_two_tokens_in_the_same_second_differ_by_jti(self):
        from app.auth import create_access_token

        a = jwt.get_unverified_claims(create_access_token("alice", auth_version=1))
        b = jwt.get_unverified_claims(create_access_token("alice", auth_version=1))
        assert a["jti"] != b["jti"]

    def test_login_issues_the_current_version(self, client, registered):
        con = _db()
        con.execute("UPDATE users SET auth_version = 7 WHERE username=?", (registered["username"],))
        con.commit()
        con.close()
        token = client.post(
            "/auth/login",
            json={"username": registered["username"], "password": registered["password"]},
        ).json()["access_token"]
        assert jwt.get_unverified_claims(token)["auth_version"] == 7
        assert client.get("/auth/me", headers=_bearer(token)).status_code == 200

    @pytest.mark.parametrize(
        "version",
        ["1", True, 0, -1, 1.0, None, [1]],
        ids=["str", "bool", "zero", "neg", "float", "null", "list"],
    )
    def test_a_malformed_version_is_refused(self, client, registered, version):
        token = _forge({"sub": registered["username"], "exp": _exp(1), "auth_version": version})
        assert client.get("/auth/me", headers=_bearer(token)).status_code == 401

    def test_a_token_without_exp_is_refused(self, client, registered):
        token = _forge({"sub": registered["username"], "auth_version": 1})
        assert client.get("/auth/me", headers=_bearer(token)).status_code == 401

    def test_a_token_without_sub_is_refused(self, client, registered):
        token = _forge({"exp": _exp(1), "auth_version": 1})
        assert client.get("/auth/me", headers=_bearer(token)).status_code == 401


# --- expand: tokens the previous image issued ---------------------------------------------------


def _set_expand_at(value: int | None) -> None:
    from app.database import AUTH_VERSION_EXPAND_KEY

    con = _db()
    con.execute("DELETE FROM site_settings WHERE key=?", (AUTH_VERSION_EXPAND_KEY,))
    if value is not None:
        con.execute(
            "INSERT INTO site_settings (key, value) VALUES (?, ?)",
            (AUTH_VERSION_EXPAND_KEY, str(value)),
        )
    con.commit()
    con.close()


class TestTheVersionlessWindow:
    """SHIM-SEC-008: the previous image's tokens, for one JWT lifetime after the first boot."""

    def test_the_first_boot_records_the_moment_once(self, client):
        from app.database import AUTH_VERSION_EXPAND_KEY, init_db

        con = _db()
        (first,) = con.execute(
            "SELECT value FROM site_settings WHERE key=?", (AUTH_VERSION_EXPAND_KEY,)
        ).fetchone()
        con.close()
        asyncio.run(init_db())
        con = _db()
        (again,) = con.execute(
            "SELECT value FROM site_settings WHERE key=?", (AUTH_VERSION_EXPAND_KEY,)
        ).fetchone()
        con.close()
        assert first == again
        assert abs(int(first) - datetime.now(UTC).timestamp()) < 120

    def test_a_previous_image_token_is_accepted_inside_the_window(self, client, registered):
        legacy = _forge({"sub": registered["username"], "exp": _exp(settings.jwt_expire_hours)})
        assert client.get("/auth/me", headers=_bearer(legacy)).status_code == 200

    def test_and_revoked_by_the_first_password_change(self, client, registered, auth):
        legacy = _forge({"sub": registered["username"], "exp": _exp(1)})
        assert client.get("/auth/me", headers=_bearer(legacy)).status_code == 200
        assert _change_password(client, registered, auth).status_code == 200
        assert client.get("/auth/me", headers=_bearer(legacy)).status_code == 401

    def test_one_that_outlives_the_window_cannot_be_from_before_the_deploy(
        self, client, registered
    ):
        legacy = _forge({"sub": registered["username"], "exp": _exp(settings.jwt_expire_hours + 1)})
        assert client.get("/auth/me", headers=_bearer(legacy)).status_code == 401

    def test_after_the_window_none_is_accepted(self, client, registered):
        """The switch happens by date: expand one lifetime and a minute ago."""
        long_ago = datetime.now(UTC) - timedelta(hours=settings.jwt_expire_hours, minutes=1)
        _set_expand_at(int(long_ago.timestamp()))
        legacy = _forge({"sub": registered["username"], "exp": _exp(0.5)})
        assert client.get("/auth/me", headers=_bearer(legacy)).status_code == 401

    def test_no_recorded_moment_fails_closed(self, client, registered):
        _set_expand_at(None)
        legacy = _forge({"sub": registered["username"], "exp": _exp(0.5)})
        assert client.get("/auth/me", headers=_bearer(legacy)).status_code == 401

    def test_a_versioned_token_does_not_depend_on_the_window(self, client, registered, auth):
        _set_expand_at(None)
        assert client.get("/auth/me", headers=auth).status_code == 200


# --- the database: one statement, compare-and-swap ---------------------------------------------


def _hash_of(username: str) -> str:
    con = _db()
    (h,) = con.execute("SELECT hashed_password FROM users WHERE username=?", (username,)).fetchone()
    con.close()
    return h


def _version_of(username: str) -> int:
    con = _db()
    (v,) = con.execute("SELECT auth_version FROM users WHERE username=?", (username,)).fetchone()
    con.close()
    return v


class TestPasswordAndVersionChangeTogether:
    def test_a_second_change_against_the_same_old_hash_writes_nothing(self, client, registered):
        """Compare-and-swap: two changes that both verified the old password; one wins."""
        from app.database import replace_password

        name = registered["username"]
        old = _hash_of(name)

        async def both():
            async with (
                aiosqlite.connect(settings.db_path) as a,
                aiosqlite.connect(settings.db_path) as b,
            ):
                return await asyncio.gather(
                    replace_password(a, name, old, "hash-from-a"),
                    replace_password(b, name, old, "hash-from-b"),
                )

        results = asyncio.run(both())
        assert sorted(r is None for r in results) == [False, True]
        winner = "hash-from-a" if results[0] is not None else "hash-from-b"
        assert _hash_of(name) == winner
        assert _version_of(name) == 2

    def test_when_the_version_cannot_be_written_the_hash_is_not_either(self, client, registered):
        """Atomicity: make the version update abort and commit anyway; the hash must be the old
        one. Two statements — hash first, version second — would leave the new hash behind."""
        from app.database import replace_password

        name = registered["username"]
        old = _hash_of(name)
        con = _db()
        con.execute(
            "CREATE TRIGGER test_refuse_version BEFORE UPDATE OF auth_version ON users"
            " BEGIN SELECT RAISE(ABORT, 'refused by test'); END"
        )
        con.commit()
        con.close()

        async def attempt():
            async with aiosqlite.connect(settings.db_path) as db:
                with pytest.raises(sqlite3.IntegrityError):
                    await replace_password(db, name, old, "never-stored")
                await db.commit()

        asyncio.run(attempt())
        assert _hash_of(name) == old
        assert _version_of(name) == 1

    def test_concurrent_changes_over_http_leave_one_winner(self, client, registered, auth):
        barrier = threading.Barrier(2)
        results: dict[str, int] = {}

        def change(new: str) -> None:
            barrier.wait()
            r = client.put(
                "/auth/password",
                json={"current_password": registered["password"], "new_password": new},
                headers=auth,
            )
            results[new] = r.status_code

        threads = [threading.Thread(target=change, args=(p,)) for p in ("first one", "second one")]
        for t in threads:
            t.start()
        for t in threads:
            t.join(TIMEOUT)
        assert sorted(results.values()) == [200, 400]
        winner = next(p for p, s in results.items() if s == 200)
        loser = next(p for p, s in results.items() if s == 400)

        def login(password: str) -> int:
            body = {"username": registered["username"], "password": password}
            return client.post("/auth/login", json=body).status_code

        assert login(winner) == 200
        assert login(loser) == 401
        assert _version_of(registered["username"]) == 2


class TestARunningRequest:
    def test_is_decided_at_its_start_and_the_next_one_is_refused(
        self, client, registered, auth, fake_task, monkeypatch
    ):
        """A request already authenticated when the password changes finishes; nothing after it
        with the same token does. Authorization is decided once, at the start of a request."""
        from app.main import app
        from app.services import task_runner

        entered, release = threading.Event(), threading.Event()
        real = fake_task.run

        def slow(*args, **kwargs):
            entered.set()
            release.wait(TIMEOUT)
            return real(*args, **kwargs)

        monkeypatch.setattr(task_runner, "_run", slow)

        async def scenario():
            async with httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app),
                base_url="http://under-test",
                timeout=TIMEOUT,
            ) as http:
                running = asyncio.create_task(http.get("/tasks", headers=auth))
                assert await asyncio.to_thread(entered.wait, TIMEOUT)
                changed = await http.put(
                    "/auth/password",
                    json={"current_password": registered["password"], "new_password": NEW_PASSWORD},
                    headers=auth,
                )
                refused = await http.get("/auth/me", headers=auth)
                release.set()
                return (await running).status_code, changed.status_code, refused.status_code

        assert asyncio.run(scenario()) == (200, 200, 401)
