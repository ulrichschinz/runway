"""The MCP surface, exercised the way a client exercises it.

Every other guarantee about MCP in this repository is taken from the *server object*:
``ops/surfaces/mcp-tools.json`` is captured by booting the app and reading ``mcp.tools``, and
`RULE-SURF-001` compares that capture against the checked-in snapshot. That proves the tool
names. It does not prove that a client can obtain them, because no client is involved.

The gap was not theoretical. ``fastapi-mcp`` 0.3.3 against ``mcp`` 1.29.0 accepted the
``initialize`` request, raised ``'JSONRPCMessage' object has no attribute 'message'`` inside
the SDK's receive loop, and dropped the session — so every tool name was correct and no
client could reach a single one of them. The snapshot stayed green throughout, in production,
for as long as the pin was in place. See ADR 0033.

These tests therefore speak the protocol: a real ``ClientSession`` over the real transport,
carried to the ASGI application in-process. What they assert is the handshake, the tool list
*as delivered to a client*, and that an authenticated call reaches the endpoint behind it.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
import pytest
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

SNAPSHOT = Path(__file__).resolve().parents[3] / "ops" / "surfaces" / "mcp-tools.json"

# Any host works: the request never leaves the process. It is named rather than "testserver"
# so a stray real connection would be obvious in a traceback.
BASE = "http://mcp-under-test"

# A session that cannot be established hangs rather than fails, and a hanging test is a
# gate nobody runs. Ten seconds is ~100x what the in-process handshake costs.
TIMEOUT = 10


def _asgi_client(app: Any, headers: dict[str, str]) -> httpx.AsyncClient:
    """Hand the MCP client an httpx client that speaks ASGI instead of TCP.

    ``streamable_http_client`` would otherwise build its own, which needs a listening
    socket. The injection point exists precisely so the caller can decide; this is the same
    client the SDK would have built, over ASGI.
    """
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url=BASE,
        headers=headers,
        timeout=TIMEOUT,
    )


async def _session(headers: dict[str, str], tool: str, arguments: dict[str, Any]) -> tuple:
    from app.main import app

    # The TestClient in the fixtures has already run and closed a lifespan; this opens one
    # for the async client, because httpx does not. init_db and init_store are idempotent.
    async with app.router.lifespan_context(app):
        async with streamable_http_client(
            f"{BASE}/mcp", http_client=_asgi_client(app, headers)
        ) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                listing = await session.list_tools()
                result = await session.call_tool(tool, arguments)
                return [t.name for t in listing.tools], result


def _run(headers: dict[str, str], tool: str = "me_auth_me_get", arguments: Any = None) -> tuple:
    async def main():
        return await asyncio.wait_for(_session(headers, tool, arguments or {}), TIMEOUT)

    return asyncio.run(main())


@pytest.fixture
def api_key(registered: dict[str, str]) -> str:
    return registered["api_key"]


@pytest.fixture(autouse=True)
def _fresh_session_manager():
    """Unbind the MCP session manager from the previous test's event loop.

    ``fastapi-mcp`` starts its StreamableHTTP session manager lazily, on the first request,
    as a task on whatever loop is running then — and caches it on the module-level server
    object. Each test here runs ``asyncio.run``, so the second test would hand a request to a
    task group belonging to a loop that is already closed: ``RuntimeError: Task group is not
    initialized``. Production has one loop for the process lifetime and never sees this.

    Resetting the flag makes each test start its own manager on its own loop.
    """
    from app.main import mcp

    transport = mcp._http_transport
    if transport is not None:
        transport._manager_started = False
        transport._manager_task = None
        transport._session_manager = None
    yield


class TestASessionCanBeEstablished:
    def test_a_client_completes_the_handshake_and_receives_the_tools(self, api_key):
        names, _ = _run({"X-Api-Key": api_key})
        assert "me_auth_me_get" in names

    def test_the_client_receives_exactly_the_snapshotted_tools(self, api_key):
        """The claim `ops/surfaces/mcp-tools.json` has always made, now measured.

        RULE-SURF-001 compares the snapshot against the booted server object. This compares
        it against what crosses the wire, which is the thing the snapshot is read as meaning.
        """
        names, _ = _run({"X-Api-Key": api_key})
        snapshot = json.loads(SNAPSHOT.read_text())
        assert sorted(names) == sorted(t["name"] for t in snapshot["tools"])


class TestCredentialsReachTheEndpoint:
    """Both documented credential shapes must survive the hop into the tool call.

    ``fastapi-mcp`` forwards only the headers on its allowlist, which defaults to
    ``authorization`` alone — so ``X-Api-Key``, the header the README and the Settings page
    have always shown, arrived at the endpoint as no credential at all and every call came
    back 401. The allowlist in `backend/app/main.py` is what makes this pass.
    """

    def test_an_api_key_header_authenticates_the_call(self, api_key, registered):
        _, result = _run({"X-Api-Key": api_key})
        assert not result.isError, result.content[0].text
        assert json.loads(result.content[0].text)["username"] == registered["username"]

    def test_a_bearer_api_key_authenticates_the_call(self, api_key, registered):
        """SHIM-SEC-006, exercised through MCP because that is where it is consumed."""
        _, result = _run({"Authorization": f"Bearer {api_key}"})
        assert not result.isError, result.content[0].text
        assert json.loads(result.content[0].text)["username"] == registered["username"]

    def test_an_unauthenticated_session_is_refused_at_the_tool(self, api_key):
        """The connection is deliberately open; the endpoint behind it is not.

        Nothing guards the MCP endpoint itself — a client may connect and list tools without
        a credential. That is recorded as RISK-MCP-002 rather than fixed here, because the
        tool list is already public in the README. What must not happen is a *call*
        succeeding without one.
        """
        _, result = _run({})
        assert result.isError
        assert "401" in result.content[0].text


# The eleven operations the allowlist took off the MCP surface (ADR 0037). Each one carries a
# credential, changes an account, or is admin-only; none had an agent consumer. They stay on
# REST, where the web UI uses them.
REMOVED = {
    "change_password_auth_password_put",
    "get_apikey_auth_apikey_get",
    "get_settings_admin_settings_get",
    "list_users_admin_users_get",
    "login_auth_login_post",
    "regenerate_apikey_auth_apikey_regenerate_post",
    "register_auth_register_post",
    "registration_status_auth_registration_status_get",
    "set_user_role_admin_users__target__role_put",
    "update_profile_auth_me_put",
    "update_settings_admin_settings_put",
}


class TestTheSurfaceIsAnAllowlist:
    """No authentication, API-key, user or admin operation is reachable over MCP (ADR 0037).

    The surface is ``include_tags`` plus two named operations. That fails closed: a router
    with a new tag is not a tool until someone adds it. These tests read the list as a client
    receives it, not from the server object.
    """

    def test_no_removed_operation_is_offered(self, api_key):
        names, _ = _run({"X-Api-Key": api_key})
        assert REMOVED.isdisjoint(names)

    def test_the_only_auth_or_admin_tool_is_me(self, api_key):
        names, _ = _run({"X-Api-Key": api_key})
        assert [n for n in names if "_auth_" in n or "_admin_" in n] == ["me_auth_me_get"]

    def test_the_named_operations_exist(self, api_key):
        """`include_operations` silently ignores a name that matches nothing.

        A renamed ``health`` or ``me`` handler would drop the tool without an error; this is
        what notices.
        """
        names, _ = _run({"X-Api-Key": api_key})
        assert {"health_health_get", "me_auth_me_get"} <= set(names)

    def test_a_removed_tool_cannot_be_called_and_leaks_no_key(self, api_key):
        _, result = _run({"X-Api-Key": api_key}, tool="get_apikey_auth_apikey_get")
        assert result.isError
        text = " ".join(getattr(c, "text", "") for c in result.content)
        assert "Unknown tool" in text
        assert api_key not in text


def _payload(result: Any) -> Any:
    """The JSON body a tool call returned, as a client receives it."""
    assert not result.isError, result.content[0].text
    return json.loads(result.content[0].text)


class TestQueryAndPathParametersSurviveTheHop:
    """The filters are only useful if an MCP client can actually send them.

    ``fastapi-mcp`` turns a tool's arguments back into an HTTP request itself: query values
    go through httpx's ``params=``, while a path parameter is substituted into the template
    **unencoded** (``server.py:515``). Neither is covered by ``mcp-tools.json``, which records
    names and summaries only — so a repeated ``tag``, a non-ASCII ``q`` and a project name
    holding a space and an umlaut are asserted here, through a real client session.
    """

    def test_a_repeated_tag_arrives_as_a_list_and_ands(self, client, auth, api_key):
        client.post(
            "/tasks", json={"description": "both", "tags": ["next", "ar", "@home"]}, headers=auth
        )
        client.post("/tasks", json={"description": "one", "tags": ["next", "ar"]}, headers=auth)
        _, result = _run(
            {"X-Api-Key": api_key},
            tool="next_actions_gtd_next_get",
            arguments={"tag": ["ar", "@home"]},
        )
        assert [t["description"] for t in _payload(result)] == ["both"]

    def test_a_non_ascii_text_search_reaches_the_server(self, client, auth, api_key):
        # Both tasks are completed, so `status` alone would return two rows: only an applied
        # `q` can yield one. Without the second `done` the assertion would pass even if `q`
        # were dropped somewhere on the hop.
        done = client.post("/tasks", json={"description": "Büro aufräumen"}, headers=auth).json()
        other = client.post("/tasks", json={"description": "Rechnung"}, headers=auth).json()
        client.post(f"/tasks/{done['uuid']}/done", headers=auth)
        client.post(f"/tasks/{other['uuid']}/done", headers=auth)
        _, result = _run(
            {"X-Api-Key": api_key},
            tool="list_tasks_tasks_get",
            arguments={"status": "completed", "q": "büro"},
        )
        assert [t["description"] for t in _payload(result)] == ["Büro aufräumen"]

    @pytest.mark.parametrize("name", ["Haus Umbau", "Büro"])
    def test_a_project_name_with_a_space_or_an_umlaut_survives_the_path(
        self, client, auth, api_key, name
    ):
        client.post("/tasks", json={"description": "renovieren", "project": name}, headers=auth)
        client.post("/tasks", json={"description": "other", "project": "sonst"}, headers=auth)
        _, result = _run(
            {"X-Api-Key": api_key},
            tool="project_tasks_gtd_projects__name__get",
            arguments={"name": name},
        )
        assert [t["description"] for t in _payload(result)] == ["renovieren"]
