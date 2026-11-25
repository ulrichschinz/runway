"""The MCP surface's controls: where a tool call may go, and what an MCP request may cost.

Brief 0071, ADR 0045 (findings REV-005, REV-004; `RISK-MCP-002`). `main.py` builds
the MCP server from `RunwayMCP` instead of `FastApiMCP`; nothing else imports this module.

**A tool call reaches its own route, and no other (REV-005).** `fastapi-mcp` 0.4.0 turns a tool call
back into an HTTP request against this application and substitutes a path argument into the route
template unencoded; `httpx` then removes `.`/`..` segments while parsing the URL. So
`get_task_tasks__uuid__get(uuid="../auth/apikey")` arrived as `GET /auth/apikey` — a REST-only route
the allowlist (ADR 0037) promises an MCP session cannot reach. Two controls, each sufficient for the
reproduced cases and both kept, because they fail in different ways:

1. `encode_segment` percent-encodes every path argument — everything but `A-Z a-z 0-9 - _ ~`, the
   dot included — so `.`/`..` cannot be dot segments and `?`/`#` cannot split off a query or a
   fragment. That is all it does: Starlette routes on the *decoded* path, so an encoded `/` is a
   separator again (`uuid="x/done"` selects `complete_task`), and a plain word needs no encoding
   (`set_project_status(name="plans")` is `PUT /projects/plans/status`, the `upsert_plan` route).
2. `RunwayMCP._execute_api_tool` names the tool in `MCP_EXPECTED_OPERATION` around the
   call, and `bind_mcp_target` — the application's first dependency on every route —
   refuses with 400, before any credential lookup or handler, a tool call whose *selected* route has
   another operation id. The binding is to the route that is about to run, after normalisation and
   routing, not to a URL string parsed a second time (plan M5.1). It is the only control for the
   sibling-route cases above; `TestOnlyTheBindingStopsASiblingRoute` fails without it.

**No session outlives its request (REV-004).** The transport is stateless Streamable HTTP: every POST
gets a fresh server transport that is torn down in a `finally` — and its server task cancelled — when
the request ends, however it ends. No `Mcp-Session-Id` is issued; `GET` (the server stream) and
`DELETE` (session end) answer 405, which the specification allows a server without either.

**Reserve before work.** `BUDGET.reserve` takes a slot under one lock before the transport reads a
byte: a global ceiling, a per-source ceiling, and — for a request that presents no credential header
at all — a quarter of the global ceiling. Every
request is bounded by `REQUEST_DEADLINE_SECONDS`; past it, it is cancelled and answered 504, which is
also what bounds a client that disconnects (Starlette does not cancel a buffered handler on
disconnect; `test_a_client_that_disconnects_mid_call_gives_its_slot_back`). In-process and per-worker, like the login budget (`RISK-SEC-003`).

**Not yet: authentication at the handshake.** The handshake and the tool list are still served
without a credential (`RISK-MCP-002`); every tool call is authenticated by the route behind it. The
dated switch to 401 is deferred until the owner decides on the structural change it needs (brief
0071, *Deferred*).

**Counters only.** `counters()` and the summary line carry integers: no header, address, account or
tool argument.
"""

from __future__ import annotations

import asyncio
import contextvars
import json
import logging
import threading
import time
from collections.abc import MutableMapping
from typing import Any
from urllib.parse import quote

import anyio
import httpx
from fastapi import HTTPException, Request, Response, status
from fastapi_mcp import FastApiMCP
from fastapi_mcp.transport.http import FastApiHttpSessionManager
from mcp.server.streamable_http import StreamableHTTPServerTransport
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager

from app import rate_limit
from app.config import settings

logger = logging.getLogger(__name__)

# Three times the inner tool call's own httpx timeout (fastapi-mcp's 10 s), so a slow but healthy tool call
# finishes; anything longer is a request holding a slot it is not using.
REQUEST_DEADLINE_SECONDS: float = 30.0
_SUMMARY_EVERY = 3600.0
_WARN_EVERY = 300.0


# REV-005: the MCP tool whose call is being executed, set by
# `RunwayMCP._execute_api_tool` around the in-process request a tool call makes, and None for every other
# request. The tool call is awaited in the same task as that request, so the value is visible here.
MCP_EXPECTED_OPERATION: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "mcp_expected_operation", default=None
)
MCP_UNBOUND_DETAIL = "This tool call does not reach its own route"


async def bind_mcp_target(request: Request) -> None:
    """An MCP tool call may run only the handler its tool was generated from.

    Declared on the application, so it is the first dependency of every route and is evaluated on
    the route Starlette actually selected — after URL normalisation, decoding and routing, which is
    the point: the binding is to the operation id that is about to run, not to a URL string parsed a
    second time. A REST request (no tool in progress) passes untouched. A tool call that reached any
    other route is refused here, before the credential is looked up or the handler runs.
    """
    expected = MCP_EXPECTED_OPERATION.get()
    if expected is None:
        return
    route = request.scope.get("route")
    reached = getattr(route, "operation_id", None) or getattr(route, "unique_id", None)
    if reached != expected:
        # Both names are strings this repository wrote; the path and the arguments are not.
        logger.warning(
            "MCP tool call refused: it does not reach its own route",
            extra={"mcp_tool": expected, "mcp_reached": reached},
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=MCP_UNBOUND_DETAIL)


# --- counters ----------------------------------------------------------------------------------

_COUNTER_NAMES = (
    "served_with_header",
    "served_anonymous",
    "refused_source",
    "refused_global",
    "refused_anonymous_share",
    "refused_unbound_target",
    "timed_out",
)
_lock = threading.Lock()
_counts: dict[str, int] = dict.fromkeys(_COUNTER_NAMES, 0)
_live_transports = 0
_last_summary = 0.0
_last_warning = 0.0


def _count(name: str) -> None:
    with _lock:
        _counts[name] += 1


def counters() -> dict[str, int]:
    """Every counter and the current occupancy — integers only, nothing about any caller."""
    with _lock:
        snapshot = dict(_counts)
        snapshot["live_transports"] = _live_transports
    snapshot.update(BUDGET.occupancy())
    return snapshot


def report(*, force: bool = False) -> None:
    """The summary line, at most once an hour (or now, when forced)."""
    global _last_summary
    now = time.monotonic()
    with _lock:
        due = force or now - _last_summary >= _SUMMARY_EVERY
        if due:
            _last_summary = now
    if due:
        logger.info("mcp budget", extra={"mcp_counters": counters()})


def _warn_refusal() -> None:
    global _last_warning
    now = time.monotonic()
    with _lock:
        due = now - _last_warning >= _WARN_EVERY
        if due:
            _last_warning = now
    if due:
        logger.warning(
            "mcp budget: a request was refused for capacity", extra={"mcp_counters": counters()}
        )


def reset_all() -> None:
    """For the tests: empty counters and budget."""
    global _live_transports, _last_summary, _last_warning
    with _lock:
        for name in _COUNTER_NAMES:
            _counts[name] = 0
        _live_transports = 0
        _last_summary = 0.0
        _last_warning = 0.0
    BUDGET.reset()


# --- the in-flight budget ----------------------------------------------------------------------


class Refused(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class Reservation:
    """One request's slot. Released exactly once, however the request ends."""

    def __init__(self, budget: Budget, source: str | None) -> None:
        self._budget = budget
        self.source = source
        self.anonymous = False
        self._open = True

    def mark_anonymous(self) -> None:
        self._budget._take_anonymous(self)

    def release(self) -> None:
        self._budget._release(self)


class Budget:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._total = 0
        self._anonymous = 0
        self._by_source: dict[str, int] = {}

    @staticmethod
    def _ceiling() -> int:
        return max(1, settings.mcp_max_inflight)

    def reserve(self, source: str | None) -> Reservation:
        """A slot, or `Refused`. Synchronous and under one lock: nothing awaits in between."""
        with self._lock:
            if self._total >= self._ceiling():
                raise Refused("global")
            if source is not None and self._by_source.get(source, 0) >= max(
                1, settings.mcp_source_max_inflight
            ):
                raise Refused("source")
            self._total += 1
            if source is not None:
                self._by_source[source] = self._by_source.get(source, 0) + 1
            return Reservation(self, source)

    def _take_anonymous(self, reservation: Reservation) -> None:
        with self._lock:
            if not reservation._open or reservation.anonymous:
                return
            if self._anonymous >= max(1, self._ceiling() // 4):
                raise Refused("anonymous_share")
            self._anonymous += 1
            reservation.anonymous = True

    def _release(self, reservation: Reservation) -> None:
        with self._lock:
            if not reservation._open:
                return
            reservation._open = False
            self._total -= 1
            if reservation.anonymous:
                self._anonymous -= 1
            source = reservation.source
            if source is not None:
                left = self._by_source.get(source, 0) - 1
                # Only sources in flight are held: the table cannot grow past the ceiling.
                if left > 0:
                    self._by_source[source] = left
                else:
                    self._by_source.pop(source, None)

    def occupancy(self) -> dict[str, int]:
        with self._lock:
            return {"inflight": self._total, "inflight_anonymous": self._anonymous}

    def source_count(self) -> int:
        with self._lock:
            return len(self._by_source)

    def reset(self) -> None:
        with self._lock:
            self._total = 0
            self._anonymous = 0
            self._by_source.clear()


BUDGET = Budget()


# --- the stateless transport -------------------------------------------------------------------


class _StatelessManager(StreamableHTTPSessionManager):
    """The SDK's stateless mode, with the teardown it lacks.

    `mcp` 1.29.0 starts the per-request server task and terminates the transport after the request
    without a `finally`: a request cancelled by the deadline would leave its server task running in
    the manager's task group for the life of the process. Here the task runs in a cancel scope that
    the `finally` cancels, and `live_transports` counts the tasks that are actually alive.
    """

    async def _handle_stateless_request(self, scope, receive, send) -> None:
        http_transport = StreamableHTTPServerTransport(
            mcp_session_id=None,
            is_json_response_enabled=self.json_response,
            event_store=None,
            security_settings=self.security_settings,
        )
        cancel = anyio.CancelScope()

        async def run_server(*, task_status=anyio.TASK_STATUS_IGNORED) -> None:
            global _live_transports
            with _lock:
                _live_transports += 1
            try:
                with cancel:
                    async with http_transport.connect() as (read_stream, write_stream):
                        task_status.started()
                        try:
                            await self.app.run(
                                read_stream,
                                write_stream,
                                self.app.create_initialization_options(),
                                stateless=True,
                            )
                        except Exception:
                            logger.exception("MCP stateless server ended with an error")
            finally:
                with _lock:
                    _live_transports -= 1

        if self._task_group is None:
            raise RuntimeError("the MCP session manager is not running")
        try:
            await self._task_group.start(run_server)
            await http_transport.handle_request(scope, receive, send)
        finally:
            cancel.cancel()
            try:
                await http_transport.terminate()
            except Exception:
                logger.exception("MCP stateless transport did not terminate cleanly")


def _json(status: int, detail: str, headers: dict[str, str] | None = None) -> Response:
    return Response(
        content=json.dumps({"detail": detail}),
        status_code=status,
        media_type="application/json",
        headers=headers,
    )


def _source(request: Request) -> str | None:
    """The network source, as the login budget determines it (rate_limit.source_of)."""
    return rate_limit.source_of(
        request.client.host if request.client else None,
        request.headers.getlist("x-forwarded-for"),
        rate_limit.trusted_networks(settings.trusted_proxies),
    )


def _carries_credential(request: Request) -> bool:
    """Whether the request presents a credential header at all — not whether it is valid.

    The tool call behind the request verifies it (every REST route does). Verifying it here too
    would make this module a new importer of the authentication code, a structural change the
    owner has not yet decided (brief 0071, *Deferred*). A caller can therefore escape the anonymous
    share by sending a made-up header; it still meets the global and per-source ceilings.
    """
    return bool(request.headers.get("authorization") or request.headers.get("x-api-key"))


class BudgetedTransport(FastApiHttpSessionManager):
    """`fastapi-mcp`'s HTTP transport, stateless, behind the budget and the handshake check."""

    # Declared here because the base class assigns them untyped in its __init__.
    _manager_started: bool
    _manager_ready: asyncio.Event
    _session_manager: StreamableHTTPSessionManager | None

    async def _ensure_session_manager_started(self) -> None:
        # Check and create with no await in between, so one event loop cannot start two managers;
        # no lock, because an asyncio.Lock binds to the first loop that contends for it.
        if not self._manager_started or self._session_manager is None:
            manager = _StatelessManager(
                app=self.mcp_server,
                event_store=None,
                json_response=True,
                stateless=True,
                security_settings=self.security_settings,
            )
            ready = asyncio.Event()

            async def run_session_manager() -> None:
                async with manager.run():
                    ready.set()
                    await asyncio.Event().wait()

            self._session_manager = manager
            self._manager_ready = ready
            self._manager_task = asyncio.create_task(run_session_manager())
            self._manager_started = True
        await self._manager_ready.wait()

    async def handle_fastapi_request(self, request: Request) -> Response:
        if request.method != "POST":
            # No server stream and no sessions to end: the specification's answer is 405.
            return _json(405, "Method Not Allowed", {"Allow": "POST"})
        try:
            reservation = BUDGET.reserve(_source(request))
        except Refused as refused:
            _count(f"refused_{refused.reason}")
            _warn_refusal()
            if refused.reason == "source":
                return _json(429, "Too many MCP requests from this source", {"Retry-After": "1"})
            return _json(503, "The MCP server is at capacity", {"Retry-After": "1"})
        try:
            credentialed = _carries_credential(request)
            if not credentialed:
                try:
                    reservation.mark_anonymous()
                except Refused as refused:
                    _count(f"refused_{refused.reason}")
                    _warn_refusal()
                    return _json(503, "The MCP server is at capacity", {"Retry-After": "1"})
            try:
                async with asyncio.timeout(REQUEST_DEADLINE_SECONDS):
                    response = await self._serve(request)
            except TimeoutError:
                _count("timed_out")
                return _json(504, "The MCP request took too long")
            _count("served_with_header" if credentialed else "served_anonymous")
            return response
        finally:
            reservation.release()
            report()

    async def _serve(self, request: Request) -> Response:
        await self._ensure_session_manager_started()
        if self._session_manager is None:
            raise RuntimeError("the MCP session manager did not start")
        status = 200
        headers: list[tuple[bytes, bytes]] = []
        body = b""

        async def send(message: MutableMapping[str, Any]) -> None:
            nonlocal status, headers, body
            if message["type"] == "http.response.start":
                status = message["status"]
                headers = message.get("headers", [])
            elif message["type"] == "http.response.body":
                body += message.get("body", b"")

        await self._session_manager.handle_request(request.scope, request.receive, send)
        return Response(
            content=body,
            status_code=status,
            headers={k.decode(): v.decode() for k, v in headers},
        )


# --- the target binding ------------------------------------------------------------------------


def encode_segment(value: Any) -> str:
    """A path argument percent-encoded: unreserved characters stay, the rest — the dot included,
    so `..` cannot be a dot segment — is encoded. An encoded `/` is decoded again before routing;
    `bind_mcp_target`, not this, keeps such a value on its own route."""
    return quote(str(value), safe="").replace(".", "%2E")


class RunwayMCP(FastApiMCP):
    """`FastApiMCP` with the target binding and the budgeted, stateless transport."""

    async def _execute_api_tool(
        self,
        client: httpx.AsyncClient,
        tool_name: str,
        arguments: dict[str, Any],
        operation_map: dict[str, dict[str, Any]],
        http_request_info: Any = None,
    ) -> Any:
        if tool_name not in operation_map:
            raise Exception(f"Unknown tool: {tool_name}")
        operation = dict(operation_map[tool_name])
        arguments = dict(arguments or {})
        path: str = operation["path"]
        for param in operation.get("parameters", []):
            name = param.get("name")
            if param.get("in") == "path" and name in arguments:
                path = path.replace("{" + name + "}", encode_segment(arguments.pop(name)))
        operation["path"] = path
        token = MCP_EXPECTED_OPERATION.set(tool_name)
        try:
            return await super()._execute_api_tool(
                client, tool_name, arguments, {tool_name: operation}, http_request_info
            )
        except Exception as error:
            if MCP_UNBOUND_DETAIL in str(error):
                _count("refused_unbound_target")
            raise
        finally:
            MCP_EXPECTED_OPERATION.reset(token)

    def mount_http(self, router: Any = None, mount_path: str = "/mcp") -> None:
        transport = BudgetedTransport(mcp_server=self.server)
        self._register_mcp_endpoints_http(self.fastapi, transport, mount_path, None)
        self._setup_auth()
        self._http_transport = transport
