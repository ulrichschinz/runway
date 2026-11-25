"""RISK-SEC-004 (plan M8): every free-text field a request carries is bounded, and over the bound is a
4xx before any handler runs — never a Taskwarrior 500.

The body limit (1 MiB, 16 KiB on `/auth/*`, brief 0067) bounds a request; it does not bound a
field. Until brief 0073 a 900 KiB description fitted the body, was accepted, and went into the
Taskwarrior argv — where, on Linux, one argument past `MAX_ARG_STRLEN` (128 KiB) makes `execve` fail
with `E2BIG`, surfaced as an unhandled 500. These tests send one character past each limit and
require 422 and an untouched store; the limit itself is accepted; and an `E2BIG` that still happens
is 413, not 500. MCP tool calls are requests to the same routes, so the same limits hold there.
"""

from __future__ import annotations

import asyncio
import errno
import sqlite3
import subprocess
from typing import Any

import httpx
import pytest
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from app import models
from app.services import task_runner
from app.task_storage import TaskStore

# (method, route, body builder, the field's limit) for every free-text field of the routes the plan
# names: task description, annotation, inbox, plus the other request texts that reach a store.
CASES: list[tuple[str, str, Any, int]] = [
    ("POST", "/tasks", lambda n: {"description": "d" * n}, models.DESCRIPTION_MAX),
    ("POST", "/inbox", lambda n: {"description": "d" * n}, models.DESCRIPTION_MAX),
    ("POST", "/inbox", lambda n: {"description": "x", "note": "n" * n}, models.ANNOTATION_MAX),
    ("POST", "/tasks", lambda n: {"description": "x", "due": "2" * n}, models.DATE_FIELD_MAX),
    ("POST", "/tasks", lambda n: {"description": "x", "recur": "w" * n}, models.DATE_FIELD_MAX),
    ("POST", "/tasks", lambda n: {"description": "x", "tags": ["t" * n]}, models.TAG_MAX),
    ("POST", "/tasks", lambda n: {"description": "x", "tags": ["t"] * n}, models.TAGS_MAX_ITEMS),
    (
        "POST",
        "/tasks",
        lambda n: {"description": "x", "depends": ["u"] * n},
        models.DEPENDS_MAX_ITEMS,
    ),
    # The plan names login first. Each of these names went whole into an audit row and a log line
    # before any check ran, unauthenticated (review of brief 0073).
    (
        "POST",
        "/auth/login",
        lambda n: {"username": "u" * n, "password": "x"},
        models.USERNAME_GIVEN_MAX,
    ),
    (
        "POST",
        "/auth/register",
        lambda n: {"username": "u" * n, "password": "a-long-enough-password"},
        models.USERNAME_GIVEN_MAX,
    ),
    ("PUT", "/auth/me", lambda n: {"full_name": "f" * n}, models.PROFILE_NAME_MAX),
    ("PUT", "/auth/me", lambda n: {"email": "e" * n}, models.EMAIL_MAX),
    ("PUT", "/projects/plans/home", lambda n: {"purpose": "p" * n}, models.PLAN_TEXT_MAX),
    (
        "PUT",
        "/projects/plans/home",
        lambda n: {"brainstorm": [{"id": "1", "text": "b" * n}]},
        models.PLAN_ITEM_TEXT_MAX,
    ),
    (
        "PUT",
        "/projects/plans/home",
        lambda n: {"brainstorm": [{"id": str(i), "text": "b"} for i in range(n)]},
        models.PLAN_LIST_MAX_ITEMS,
    ),
]


def _send(client, auth, method: str, path: str, body: dict) -> httpx.Response:
    return client.request(method, path, json=body, headers=auth)


class TestEveryFieldIsBounded:
    @pytest.mark.parametrize(("method", "path", "body", "limit"), CASES)
    def test_one_past_the_limit_is_422_and_nothing_is_written(
        self, client, auth, fake_task, method, path, body, limit
    ):
        before = {k: list(v) for k, v in fake_task.stores.items()}
        r = _send(client, auth, method, path, body(limit + 1))
        assert r.status_code == 422, (path, r.status_code, r.text[:200])
        assert {k: list(v) for k, v in fake_task.stores.items()} == before

    @pytest.mark.parametrize(("method", "path", "body", "limit"), CASES)
    def test_the_limit_itself_passes_the_length_check(
        self, client, auth, method, path, body, limit
    ):
        """At the limit the length is never the refusal. A date, recurrence or dependency id of that
        length is not a valid value, so what validates it refuses with 400 — not 422."""
        r = _send(client, auth, method, path, body(limit))
        if path.startswith("/auth/login"):
            # No such account: refused for the credentials, not for the length.
            assert r.status_code == 401, (path, r.status_code, r.text[:200])
            return
        assert r.status_code in (200, 201, 400), (path, r.status_code, r.text[:200])
        if r.status_code == 400:
            assert any(k in str(body(1)) for k in ("due", "recur", "depends", "username"))

    def test_a_huge_description_inside_the_body_limit_is_refused(self, client, auth, fake_task):
        """The scenario of RISK-SEC-004 itself: 900 KiB fits the 1 MiB body and is refused anyway."""
        r = client.post("/tasks", json={"description": "x" * 900_000}, headers=auth)
        assert r.status_code == 422
        assert not any(fake_task.stores.values())

    def test_an_annotation_and_a_modify_are_bounded(self, client, auth, fake_task):
        uuid = client.post("/tasks", json={"description": "x"}, headers=auth).json()["uuid"]
        over = models.ANNOTATION_MAX + 1
        r = client.post(f"/tasks/{uuid}/annotate", json={"text": "a" * over}, headers=auth)
        assert r.status_code == 422
        r = client.put(
            f"/tasks/{uuid}", json={"description": "d" * (models.DESCRIPTION_MAX + 1)}, headers=auth
        )
        assert r.status_code == 422
        task = client.get(f"/tasks/{uuid}", headers=auth).json()
        assert task["description"] == "x"
        assert task["annotations"] == []

    def test_the_largest_argument_stays_below_the_kernel_limit(self):
        """MAX_ARG_STRLEN is 32 pages (131 072 bytes) on Linux, terminating NUL included. A
        description is bounded in characters (UTF-8 is at most 4 bytes each), a note or annotation
        also in bytes."""
        assert 4 * models.DESCRIPTION_MAX < 131_072 // 4
        assert models.ANNOTATION_MAX_BYTES < 131_072 // 2

    @pytest.mark.parametrize("letter", ["a", "\u00e9", "\u20ac", "\U0001f600"])
    def test_the_largest_capture_a_client_sends_is_accepted(self, client, auth, fake_task, letter):
        """`capping.js` (and Android's `Capping.kt`, line for line) sends a description of at most
        500 code points and a note cut at 32 KiB of UTF-8. The previous deploy accepted that, so the
        bound must too: on POST /inbox, and as an annotation for a capture into a project."""
        note = (letter * 40_000).encode()[: 32 * 1024].decode(errors="ignore")
        assert len(note.encode()) <= 32 * 1024
        body = {"description": letter * 500, "note": note}
        r = client.post("/inbox", json=body, headers=auth)
        assert r.status_code == 201, r.text[:200]
        uuid = client.post("/tasks", json={"description": "x"}, headers=auth).json()["uuid"]
        r = client.post(f"/tasks/{uuid}/annotate", json={"text": note}, headers=auth)
        assert r.status_code in (200, 201), r.text[:200]

    def test_a_note_over_its_bytes_is_422_even_under_its_characters(self, client, auth, fake_task):
        note = "\u20ac" * (models.ANNOTATION_MAX_BYTES // 3 + 1)
        assert len(note) <= models.ANNOTATION_MAX
        r = client.post("/inbox", json={"description": "x", "note": note}, headers=auth)
        assert r.status_code == 422
        assert not any(fake_task.stores.values())

    def test_an_oversized_username_leaves_no_audit_row_or_log_line(self, client, caplog):
        from app import database

        def actors() -> list:
            con = sqlite3.connect(database.audit_db_path())
            try:
                return [r[0] for r in con.execute("SELECT actor FROM audit_events")]
            finally:
                con.close()

        before = actors()
        huge = "u" * 15_000
        assert (
            client.post("/auth/login", json={"username": huge, "password": "x"}).status_code == 422
        )
        r = client.post("/auth/register", json={"username": huge, "password": "a-long-password"})
        assert r.status_code == 422
        assert actors() == before
        assert huge not in caplog.text

    def test_the_openapi_schema_states_the_limits(self, client):
        schema = client.get("/openapi.json").json()["components"]["schemas"]
        assert (
            schema["TaskCreate"]["properties"]["description"]["maxLength"] == models.DESCRIPTION_MAX
        )
        assert (
            schema["AnnotationCreate"]["properties"]["text"]["maxLength"] == models.ANNOTATION_MAX
        )
        note = schema["InboxItem"]["properties"]["note"]
        assert any(b.get("maxLength") == models.ANNOTATION_MAX for b in note.get("anyOf", [note]))


class TestTheKernelRefusalIsNot500:
    def test_e2big_from_execve_is_argument_too_long(self, tmp_path, monkeypatch):
        def refuse(*_a, **_k):
            raise OSError(errno.E2BIG, "Argument list too long")

        monkeypatch.setattr(subprocess, "run", refuse)
        store = TaskStore(path=tmp_path)
        with pytest.raises(task_runner.ArgumentTooLong):
            task_runner._run(store, ["add"], ["x"])

    def test_another_os_error_is_still_a_failure_of_the_system(self, tmp_path, monkeypatch):
        def missing(*_a, **_k):
            raise FileNotFoundError(errno.ENOENT, "task")

        monkeypatch.setattr(subprocess, "run", missing)
        store = TaskStore(path=tmp_path)
        with pytest.raises(OSError) as raised:
            task_runner._run(store, ["add"], ["x"])
        assert not isinstance(raised.value, task_runner.ArgumentTooLong)

    def test_an_argument_too_long_is_413_on_every_task_route(
        self, client, auth, fake_task, monkeypatch
    ):
        def too_long(*_a, **_k):
            raise task_runner.ArgumentTooLong("A value is too long for the task store")

        monkeypatch.setattr(task_runner, "_run", too_long)
        for method, path, body in [
            ("POST", "/tasks", {"description": "x"}),
            ("POST", "/inbox", {"description": "x"}),
            ("GET", "/gtd/inbox", None),
        ]:
            r = client.request(method, path, json=body, headers=auth)
            assert r.status_code == 413, (path, r.status_code, r.text)
            assert "too long" in r.json()["detail"]


# --- the same limits over MCP --------------------------------------------------------------


@pytest.fixture
def _fresh_session_manager():
    from app.main import mcp

    transport = mcp._http_transport
    if transport is not None:
        transport._manager_started = False
        transport._manager_task = None
        transport._session_manager = None
    yield


async def _call_tool(headers: dict[str, str], tool: str, arguments: dict[str, Any]):
    from app.main import app

    async with app.router.lifespan_context(app):
        client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://mcp-limits", headers=headers
        )
        async with streamable_http_client("http://mcp-limits/mcp", http_client=client) as (r, w, _):
            async with ClientSession(r, w) as session:
                await session.initialize()
                return await session.call_tool(tool, arguments)


class TestMcpMeetsTheSameLimits:
    def test_an_oversized_description_over_mcp_writes_nothing(
        self, registered, fake_task, _fresh_session_manager
    ):
        result = asyncio.run(
            asyncio.wait_for(
                _call_tool(
                    {"X-Api-Key": registered["api_key"]},
                    "create_task_tasks_post",
                    {"description": "d" * (models.DESCRIPTION_MAX + 1)},
                ),
                10,
            )
        )
        text = " ".join(getattr(c, "text", "") for c in result.content)
        # Refused by the tool's own input schema (the same `maxLength`) before a request is made, or
        # by the route with 422 — either way an error, and nothing written.
        assert result.isError, text[:200]
        assert "too long" in text or "422" in text, text[:200]
        assert not any(fake_task.stores.values())
