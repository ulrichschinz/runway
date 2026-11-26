"""REV-005: an MCP tool call must reach the handler its tool was made from, and no other.

``fastapi-mcp`` 0.4.0 turns a tool call back into an HTTP request against this application, and
it substitutes a path argument into the route template **unencoded** (``server.py:513-515``).
``httpx`` then removes ``.`` and ``..`` segments while it parses the URL — before the request
reaches the application. So ``get_task_tasks__uuid__get`` with ``uuid="../auth/apikey"`` used to
arrive as ``GET /auth/apikey``: a REST-only route the allowlist (ADR 0037) promises an MCP session
cannot reach. The allowlist checked the *tool name*; nothing checked where the call ended up.

These tests observe the end of the hop, not the status: a recorder around the application notes
the route Starlette finally dispatched each inner request to, and its operation id. A 401 or 403
is **not** accepted as evidence (plan §6, "Ein 401 auf einem MCP-Test widerlegt nicht automatisch
eine falsche Zielbindung"): the admin route answering 403 to a normal key was still the admin
route. The assertion is that every handler that ran is the tool's own — or that none ran at all.

Brief 0071 holds the reproduction table these cases came from, run against the unchanged code.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
from pathlib import Path
from typing import Any

import httpx
import pytest
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from app.config import settings
from app.mcp_gate import MCP_UNBOUND_DETAIL

SURFACES = Path(__file__).resolve().parents[3] / "ops" / "surfaces"
BASE = "http://mcp-under-test"
TIMEOUT = 10


@pytest.fixture(autouse=True)
def _fresh_session_manager():
    """Each test runs its own event loop; see test_mcp_session.py for why this reset exists."""
    from app.main import mcp

    transport = mcp._http_transport
    if transport is not None:
        transport._manager_started = False
        transport._manager_task = None
        transport._session_manager = None
    yield


class _Recorder:
    """Wraps the application the tool call is sent to and notes which handler each request ran.

    Starlette writes the selected route into the scope it is handed (``scope["route"]``) before it
    runs the route, so reading the scope afterwards says which route was dispatched to. No route in
    the scope means nothing matched. A route in the scope whose request the binding refused
    (``mcp_gate.bind_mcp_target``, the application's first dependency) ran no handler and no
    other dependency: that refusal is recognised by its exact detail and recorded as no handler.
    The behavioural tests below (``TestTheReproducedImpact``) hold the same claim without this
    inference: the profile and the site setting do not change.
    """

    def __init__(self, app: Any) -> None:
        self.app = app
        self.seen: list[dict[str, Any]] = []

    async def __call__(self, scope, receive, send):
        status: dict[str, int] = {}
        body = bytearray()

        async def _send(message):
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
            elif message["type"] == "http.response.body":
                body.extend(message.get("body", b""))
            await send(message)

        await self.app(scope, receive, _send)
        if scope["type"] != "http":
            return
        route = scope.get("route")
        selected = (
            (getattr(route, "operation_id", None) or getattr(route, "unique_id", None))
            if route is not None
            else None
        )
        refused = status.get("code") == 400 and MCP_UNBOUND_DETAIL.encode() in bytes(body)
        self.seen.append(
            {
                "path": scope["path"],
                "selected": selected,
                "operation_id": None if refused else selected,
                "refused_by_binding": refused,
                "status": status.get("code"),
            }
        )


async def _call(headers: dict[str, str], tool: str, arguments: dict[str, Any]) -> tuple:
    from app.main import app, mcp

    inner = mcp._http_client._transport
    original = inner.app
    recorder = _Recorder(original)
    inner.app = recorder
    try:
        async with app.router.lifespan_context(app):
            client = httpx.AsyncClient(
                transport=httpx.ASGITransport(app=app),
                base_url=BASE,
                headers=headers,
                timeout=TIMEOUT,
            )
            async with streamable_http_client(f"{BASE}/mcp", http_client=client) as (r, w, _):
                async with ClientSession(r, w) as session:
                    await session.initialize()
                    result = await session.call_tool(tool, arguments)
        return result, recorder.seen
    finally:
        inner.app = original


def _run(headers: dict[str, str], tool: str, arguments: dict[str, Any]) -> tuple:
    return asyncio.run(asyncio.wait_for(_call(headers, tool, arguments), TIMEOUT))


def _text(result: Any) -> str:
    return " ".join(getattr(c, "text", "") for c in result.content)


# Every tool with a path parameter, and the parameter's name. Read from the snapshot's routes
# rather than typed by hand would be nicer; it is pinned instead, and the last test below fails
# when the surface gains a path parameter this list does not know.
PATH_TOOLS = {
    "get_task_tasks__uuid__get": "uuid",
    "modify_task_tasks__uuid__put": "uuid",
    "delete_task_tasks__uuid__delete": "uuid",
    "annotate_task_tasks__uuid__annotate_post": "uuid",
    "complete_task_tasks__uuid__done_post": "uuid",
    "start_task_tasks__uuid__start_post": "uuid",
    "stop_task_tasks__uuid__stop_post": "uuid",
    "project_tasks_gtd_projects__name__get": "name",
    "get_plan_projects_plans__name__get": "name",
    "upsert_plan_projects_plans__name__put": "name",
    "set_project_status_projects__name__status_put": "name",
}

# The hostile shapes of plan M5.1: raw and percent-encoded `/` and `..`, `%2e`, `%2f`, double
# encoding, query and fragment characters, and Unicode look-alikes of `.` and `/`.
HOSTILE = [
    "../auth/apikey",
    "../auth/apikeys",
    "../../auth/apikeys",
    "../../admin/users",
    "../auth/me",
    "..",
    ".",
    "../",
    "a/../../auth/apikey",
    "..%2fauth%2fapikey",
    "%2e%2e/auth/apikey",
    "%2e%2e%2fauth%2fapikey",
    "%252e%252e%252fauth%252fapikey",
    "..\\auth\\apikey",
    "x?y=1",
    "x#frag",
    "?",
    "#",
    "%",
    "．．／auth／apikey",  # FULLWIDTH FULL STOP / SOLIDUS
    "․․/auth/apikey",  # ONE DOT LEADER
    "..∕auth∕apikey",  # DIVISION SLASH
]

# Arguments a tool needs besides its path parameter, so the call is well-formed and reaches the
# transport (an input-validation refusal before the hop would prove nothing).
EXTRA = {
    "annotate_task_tasks__uuid__annotate_post": {"annotation": "x"},
    "set_project_status_projects__name__status_put": {"status": "active"},
}


def _assert_bound(tool: str, seen: list[dict[str, Any]]) -> None:
    reached = [s["operation_id"] for s in seen if s["operation_id"] is not None]
    assert all(op == tool for op in reached), f"{tool} reached another handler: {seen}"


class TestEveryCallReachesItsOwnHandler:
    @pytest.mark.parametrize("value", HOSTILE)
    @pytest.mark.parametrize("tool", sorted(PATH_TOOLS))
    def test_a_hostile_path_argument_reaches_no_other_handler(self, registered, tool, value):
        arguments = {PATH_TOOLS[tool]: value, **EXTRA.get(tool, {})}
        _, seen = _run({"X-Api-Key": registered["api_key"]}, tool, arguments)
        _assert_bound(tool, seen)

    @pytest.mark.parametrize(
        "tool,value",
        [
            ("project_tasks_gtd_projects__name__get", "Haus Umbau"),
            ("project_tasks_gtd_projects__name__get", "Büro"),
            ("project_tasks_gtd_projects__name__get", "."),
            ("project_tasks_gtd_projects__name__get", "a..b"),
            ("get_plan_projects_plans__name__get", "Q4 2026 – Plan"),
            ("get_task_tasks__uuid__get", "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b"),
        ],
    )
    def test_a_legitimate_unusual_value_reaches_its_own_handler(self, registered, tool, value):
        """The positive control: the binding must not be "refuse everything odd".

        Each of these reaches the tool's own handler, with the value as the handler sees it.
        """
        _, seen = _run({"X-Api-Key": registered["api_key"]}, tool, {PATH_TOOLS[tool]: value})
        assert [s["operation_id"] for s in seen] == [tool], seen

    def test_the_value_arrives_as_the_client_sent_it(self, client, auth, registered):
        """`Haus Umbau` and `Büro` already survive (test_mcp_session.py); a `.` must too."""
        # `%2E`, because httpx would remove a literal `.` segment from the test's own REST call too.
        made = client.put("/projects/plans/%2E", json={"purpose": "dot"}, headers=auth)
        assert made.status_code == 200, made.text
        result, seen = _run(
            {"X-Api-Key": registered["api_key"]},
            "get_plan_projects_plans__name__get",
            {"name": "."},
        )
        assert [s["operation_id"] for s in seen] == ["get_plan_projects_plans__name__get"]
        assert not result.isError, _text(result)
        plan = json.loads(_text(result))
        assert (plan["project_name"], plan["purpose"]) == (".", "dot")

    def test_every_path_parameter_tool_is_covered(self):
        snapshot = json.loads((SURFACES / "openapi.json").read_text())
        tools = {t["name"] for t in json.loads((SURFACES / "mcp-tools.json").read_text())["tools"]}
        with_path = set()
        for path, ops in snapshot["paths"].items():
            for op in ops.values():
                if op.get("operationId") in tools and "{" in path:
                    with_path.add(op["operationId"])
        assert with_path == set(PATH_TOOLS)


class TestTheReproducedImpact:
    """What REV-005 let an MCP session do, asserted as behaviour (brief 0071)."""

    def test_modify_task_cannot_change_the_profile(self, client, registered, auth):
        before = client.get("/auth/me", headers=auth).json()
        _run(
            {"X-Api-Key": registered["api_key"]},
            "modify_task_tasks__uuid__put",
            {"uuid": "../auth/me", "email": "mallory@example.org", "name": "Mallory"},
        )
        assert client.get("/auth/me", headers=auth).json() == before

    def test_an_admin_key_cannot_reopen_registration_through_a_task_tool(
        self, client, registered, auth
    ):
        con = sqlite3.connect(settings.db_path)
        con.execute("UPDATE users SET role='admin' WHERE username=?", (registered["username"],))
        con.commit()
        con.close()
        client.put("/admin/settings", json={"allow_registration": False}, headers=auth)
        _run(
            {"X-Api-Key": registered["api_key"]},
            "modify_task_tasks__uuid__put",
            {"uuid": "../admin/settings", "allow_registration": True},
        )
        assert client.get("/admin/settings", headers=auth).json() == {"allow_registration": False}

    def test_a_task_tool_cannot_list_the_keys(self, registered):
        result, seen = _run(
            {"X-Api-Key": registered["api_key"]},
            "get_task_tasks__uuid__get",
            {"uuid": "../auth/apikeys"},
        )
        assert result.isError
        assert "list_apikeys_auth_apikeys_get" not in [s["operation_id"] for s in seen]


class TestOnlyTheBindingStopsASiblingRoute:
    """Values no encoding can make harmless: the call is well-formed, every character is ordinary,
    and the route it would select is a sibling the tool was not made from.

    `encode_segment` stops dot segments and query or fragment splitting, and nothing else: an
    encoded `/` is decoded before Starlette routes, and a plain word like `plans` or `overview`
    needs no encoding at all. In these cases `bind_mcp_target` is the only control between the
    tool and another handler, so a change that drops it — or a library bump after which the
    expected operation no longer reaches the inner request — fails here, not only in a review.
    """

    def test_set_project_status_on_plans_does_not_upsert_a_plan_called_status(self, registered):
        # `PUT /projects/plans/status` is `upsert_plan(name="status")`, declared first (ADR 0039).
        result, seen = _run(
            {"X-Api-Key": registered["api_key"]},
            "set_project_status_projects__name__status_put",
            {"name": "plans", "status": "active"},
        )
        assert "upsert_plan_projects_plans__name__put" in [s["selected"] for s in seen], seen
        assert [s["operation_id"] for s in seen if s["operation_id"]] == [], seen
        assert result.isError
        assert MCP_UNBOUND_DETAIL in _text(result)
        con = sqlite3.connect(settings.db_path)
        try:
            written = con.execute("SELECT COUNT(*) FROM projects WHERE name='status'").fetchone()
        finally:
            con.close()
        assert written == (0,)

    def test_project_tasks_of_overview_does_not_run_the_overview(self, registered):
        # `/gtd/projects/overview` is declared before `/gtd/projects/{name}` (routers/gtd.py).
        result, seen = _run(
            {"X-Api-Key": registered["api_key"]},
            "project_tasks_gtd_projects__name__get",
            {"name": "overview"},
        )
        assert "projects_overview_gtd_projects_overview_get" in [s["selected"] for s in seen]
        _assert_bound("project_tasks_gtd_projects__name__get", seen)
        assert result.isError
        assert MCP_UNBOUND_DETAIL in _text(result)

    def test_a_refusal_is_counted(self, registered):
        from app import mcp_gate

        mcp_gate.reset_all()
        _run(
            {"X-Api-Key": registered["api_key"]},
            "project_tasks_gtd_projects__name__get",
            {"name": "overview"},
        )
        assert mcp_gate.counters()["refused_unbound_target"] == 1
        mcp_gate.reset_all()

    def test_the_binding_is_the_applications_first_dependency(self):
        """The structural half: every route, the MCP-only ones included, evaluates it first."""
        from app import mcp_gate
        from app.main import app

        assert app.router.dependencies, "the application declares no dependency"
        assert app.router.dependencies[0].dependency is mcp_gate.bind_mcp_target
