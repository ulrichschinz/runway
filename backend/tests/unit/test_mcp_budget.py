"""REV-004 and RISK-MCP-002: what an MCP request may cost the server, and who may make one.

Before brief 0071 the transport was the stateful Streamable HTTP manager `fastapi-mcp` builds:
every `initialize` — with or without a credential — created a server transport and a task,
keyed by a fresh `Mcp-Session-Id`, with no idle timeout, no cap and no teardown unless the
client sent `DELETE`. Anyone who could reach `/api/mcp` could grow that table without limit.

These tests speak raw JSON-RPC over the in-process ASGI transport, so they can see the response
headers and the server's own bookkeeping, and they can hold requests open in a tool call. The
real client session is `test_mcp_session.py`; it runs against the same transport.
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest

from app.config import settings

BASE = "http://mcp-under-test"
TIMEOUT = 10
ACCEPT = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}

INITIALIZE = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2025-06-18",
        "capabilities": {},
        "clientInfo": {"name": "budget-test", "version": "0"},
    },
}
LIST = {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
CALL_HEALTH = {
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {"name": "health_health_get", "arguments": {}},
}

# A day inside the soak and a day after the default cutoff, so no test depends on today's date.
SOAK = int(datetime(2026, 12, 1, tzinfo=UTC).timestamp())
AFTER = int(datetime(2027, 2, 1, tzinfo=UTC).timestamp())


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


@pytest.fixture(autouse=True)
def _gate_state(monkeypatch):
    """Clean counters and budget per test, and a clock inside the soak unless a test moves it."""
    from app import mcp_gate

    mcp_gate.reset_all()
    monkeypatch.setattr(mcp_gate, "_clock", lambda: SOAK)
    yield
    mcp_gate.reset_all()


def _client(app: Any, peer: str = "203.0.113.7") -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app, client=(peer, 50000)),
        base_url=BASE,
        timeout=TIMEOUT,
    )


async def _post(client: httpx.AsyncClient, payload: dict, headers: dict | None = None):
    return await client.post(
        "/mcp", content=json.dumps(payload), headers={**ACCEPT, **(headers or {})}
    )


def _arun(coro):
    return asyncio.run(asyncio.wait_for(coro, 30))


async def _with_app(fn):
    from app.main import app

    async with app.router.lifespan_context(app):
        async with _client(app) as c:
            return await fn(app, c)


def _manager():
    from app.main import mcp

    return mcp._http_transport._session_manager


class TestNoSessionOutlivesItsRequest:
    """REV-004's core: a handshake leaves nothing behind, with or without a credential."""

    def test_an_anonymous_handshake_issues_no_session_and_leaves_no_transport(self, client):
        async def run(app, c):
            r = await _post(c, INITIALIZE)
            return r, dict(getattr(_manager(), "_server_instances", {}))

        r, instances = _arun(_with_app(run))
        assert r.status_code == 200, r.text
        assert "mcp-session-id" not in r.headers
        assert instances == {}

    def test_an_authenticated_handshake_issues_no_session_either(self, registered):
        async def run(app, c):
            r = await _post(c, INITIALIZE, {"X-Api-Key": registered["api_key"]})
            return r, dict(getattr(_manager(), "_server_instances", {}))

        r, instances = _arun(_with_app(run))
        assert r.status_code == 200, r.text
        assert "mcp-session-id" not in r.headers
        assert instances == {}

    def test_a_burst_of_handshakes_leaves_zero_live_transports(self, client):
        from app import mcp_gate

        async def run(app, c):
            results = await asyncio.gather(*(_post(c, INITIALIZE) for _ in range(50)))
            return [r.status_code for r in results]

        codes = _arun(_with_app(run))
        assert set(codes) <= {200, 429, 503}
        assert codes.count(200) >= 1
        assert mcp_gate.counters()["live_transports"] == 0
        assert mcp_gate.counters()["inflight"] == 0

    def test_a_tool_list_needs_no_prior_handshake(self, registered):
        """Stateless: every request stands alone, so a list without `initialize` is answered."""

        async def run(app, c):
            return await _post(c, LIST, {"X-Api-Key": registered["api_key"]})

        r = _arun(_with_app(run))
        assert r.status_code == 200, r.text
        assert "me_auth_me_get" in r.text

    def test_a_session_id_from_before_the_deploy_is_ignored(self, registered):
        async def run(app, c):
            return await _post(
                c, LIST, {"X-Api-Key": registered["api_key"], "Mcp-Session-Id": "f" * 32}
            )

        r = _arun(_with_app(run))
        assert r.status_code == 200, r.text

    @pytest.mark.parametrize("method", ["GET", "DELETE"])
    def test_the_stream_and_the_session_end_are_not_offered(self, registered, method):
        async def run(app, c):
            return await c.request(
                method, "/mcp", headers={**ACCEPT, "X-Api-Key": registered["api_key"]}
            )

        r = _arun(_with_app(run))
        assert r.status_code == 405
        assert getattr(_manager(), "_server_instances", {}) == {}

    def test_an_oversized_body_is_refused_before_any_transport(self, client):
        from app import mcp_gate

        async def run(app, c):
            body = json.dumps({**LIST, "params": {"pad": "x" * (2 * 1024 * 1024)}})
            return await c.post("/mcp", content=body, headers=ACCEPT)

        r = _arun(_with_app(run))
        assert r.status_code == 413
        assert mcp_gate.counters()["served_anonymous"] == 0


class _Held:
    """Hold tool calls open inside the server until released, so capacity can be measured."""

    def __init__(self) -> None:
        self.release = asyncio.Event()
        self.entered = 0

    async def __call__(self, *args, **kwargs):
        from mcp import types

        self.entered += 1
        await self.release.wait()
        return [types.TextContent(type="text", text='{"status": "ok"}')]


async def _until(predicate, limit: float = 5.0) -> None:
    deadline = asyncio.get_running_loop().time() + limit
    while not predicate():
        if asyncio.get_running_loop().time() > deadline:
            raise AssertionError("condition not reached")
        await asyncio.sleep(0.01)


class TestCapacity:
    """The first request above the ceiling is refused; finished ones give their slot back."""

    def test_the_request_above_the_global_ceiling_is_refused_and_capacity_returns(
        self, registered, monkeypatch
    ):
        from app import mcp_gate
        from app.main import mcp

        monkeypatch.setattr(settings, "mcp_max_inflight", 3)
        monkeypatch.setattr(settings, "mcp_source_max_inflight", 10)
        held = _Held()
        monkeypatch.setattr(mcp, "_execute_api_tool", held)
        key = {"X-Api-Key": registered["api_key"]}

        async def run(app, c):
            first = [asyncio.create_task(_post(c, CALL_HEALTH, key)) for _ in range(3)]
            await _until(lambda: held.entered == 3)
            over = await _post(c, CALL_HEALTH, key)
            held.release.set()
            done = await asyncio.gather(*first)
            after = await _post(c, CALL_HEALTH, key)
            return over, [r.status_code for r in done], after

        over, done, after = _arun(_with_app(run))
        assert over.status_code == 503
        assert over.headers.get("retry-after") == "1"
        assert done == [200, 200, 200]
        assert after.status_code == 200
        assert mcp_gate.counters()["refused_global"] == 1
        assert mcp_gate.counters()["inflight"] == 0
        assert mcp_gate.counters()["live_transports"] == 0

    def test_one_source_cannot_take_the_whole_server(self, registered, monkeypatch):
        from app.main import mcp

        monkeypatch.setattr(settings, "mcp_max_inflight", 10)
        monkeypatch.setattr(settings, "mcp_source_max_inflight", 2)
        held = _Held()
        monkeypatch.setattr(mcp, "_execute_api_tool", held)
        key = {"X-Api-Key": registered["api_key"]}

        async def run(app, c):
            first = [asyncio.create_task(_post(c, CALL_HEALTH, key)) for _ in range(2)]
            await _until(lambda: held.entered == 2)
            same = await _post(c, CALL_HEALTH, key)
            async with _client(app, peer="198.51.100.9") as other:
                elsewhere = asyncio.create_task(_post(other, CALL_HEALTH, key))
                await _until(lambda: held.entered == 3)
                held.release.set()
                await asyncio.gather(*first)
                return same, await elsewhere

        same, elsewhere = _arun(_with_app(run))
        assert same.status_code == 429
        assert elsewhere.status_code == 200

    def test_anonymous_requests_cannot_crowd_out_authenticated_ones(self, registered, monkeypatch):
        from app import mcp_gate

        monkeypatch.setattr(settings, "mcp_max_inflight", 8)
        monkeypatch.setattr(settings, "mcp_source_max_inflight", 8)
        gate = asyncio.Event()
        original = mcp_gate.BudgetedTransport._serve

        async def slow(self, request, *a, **kw):
            if not request.headers.get("x-api-key"):
                await gate.wait()
            return await original(self, request, *a, **kw)

        monkeypatch.setattr(mcp_gate.BudgetedTransport, "_serve", slow)

        async def run(app, c):
            anonymous = [asyncio.create_task(_post(c, LIST)) for _ in range(2)]
            await _until(lambda: mcp_gate.counters()["inflight_anonymous"] == 2)
            third = await _post(c, LIST)
            authed = await _post(c, LIST, {"X-Api-Key": registered["api_key"]})
            gate.set()
            await asyncio.gather(*anonymous)
            return third, authed

        third, authed = _arun(_with_app(run))
        assert third.status_code == 503
        assert authed.status_code == 200

    def test_a_refused_request_costs_no_credential_lookup(self, registered, monkeypatch):
        from app import dependencies, mcp_gate

        monkeypatch.setattr(settings, "mcp_max_inflight", 1)
        calls = {"n": 0}
        original = dependencies.identify

        async def counting(*a, **kw):
            calls["n"] += 1
            return await original(*a, **kw)

        monkeypatch.setattr(dependencies, "identify", counting)
        monkeypatch.setattr(mcp_gate, "identify", counting, raising=False)
        reservation = mcp_gate.BUDGET.reserve(None)
        try:

            async def run(app, c):
                return await _post(c, LIST, {"X-Api-Key": registered["api_key"]})

            r = _arun(_with_app(run))
        finally:
            reservation.release()
        assert r.status_code == 503
        assert calls["n"] == 0

    def test_a_request_past_the_deadline_is_ended_and_frees_its_slot(self, registered, monkeypatch):
        from app import mcp_gate
        from app.main import mcp

        monkeypatch.setattr(mcp_gate, "REQUEST_DEADLINE_SECONDS", 0.3)
        held = _Held()  # never released
        monkeypatch.setattr(mcp, "_execute_api_tool", held)

        async def run(app, c):
            return await _post(c, CALL_HEALTH, {"X-Api-Key": registered["api_key"]})

        r = _arun(_with_app(run))
        assert r.status_code == 504
        assert mcp_gate.counters()["timed_out"] == 1
        assert mcp_gate.counters()["inflight"] == 0
        assert mcp_gate.counters()["live_transports"] == 0


class TestTheBudgetUnit:
    """The reservation itself, without HTTP: one lock, refuse rather than evict, close once."""

    def test_global_then_source_ceilings(self, monkeypatch):
        from app import mcp_gate

        monkeypatch.setattr(settings, "mcp_max_inflight", 3)
        monkeypatch.setattr(settings, "mcp_source_max_inflight", 2)
        a1 = mcp_gate.BUDGET.reserve("a")
        a2 = mcp_gate.BUDGET.reserve("a")
        with pytest.raises(mcp_gate.Refused) as source:
            mcp_gate.BUDGET.reserve("a")
        assert source.value.reason == "source"
        b1 = mcp_gate.BUDGET.reserve("b")
        with pytest.raises(mcp_gate.Refused) as full:
            mcp_gate.BUDGET.reserve("c")
        assert full.value.reason == "global"
        for r in (a1, a2, b1):
            r.release()
        assert mcp_gate.counters()["inflight"] == 0
        mcp_gate.BUDGET.reserve("a").release()

    def test_no_source_key_meets_the_global_ceiling_only(self, monkeypatch):
        from app import mcp_gate

        monkeypatch.setattr(settings, "mcp_max_inflight", 3)
        monkeypatch.setattr(settings, "mcp_source_max_inflight", 1)
        held = [mcp_gate.BUDGET.reserve(None) for _ in range(3)]
        with pytest.raises(mcp_gate.Refused):
            mcp_gate.BUDGET.reserve(None)
        for r in held:
            r.release()

    def test_a_release_is_counted_once(self, monkeypatch):
        from app import mcp_gate

        monkeypatch.setattr(settings, "mcp_max_inflight", 2)
        r = mcp_gate.BUDGET.reserve("a")
        r.release()
        r.release()
        assert mcp_gate.counters()["inflight"] == 0
        mcp_gate.BUDGET.reserve("a")
        mcp_gate.BUDGET.reserve("a")
        with pytest.raises(mcp_gate.Refused):
            mcp_gate.BUDGET.reserve("a")

    def test_the_anonymous_share_is_a_quarter_of_the_ceiling(self, monkeypatch):
        from app import mcp_gate

        monkeypatch.setattr(settings, "mcp_max_inflight", 8)
        monkeypatch.setattr(settings, "mcp_source_max_inflight", 8)
        first = [mcp_gate.BUDGET.reserve(None) for _ in range(2)]
        for r in first:
            r.mark_anonymous()
        third = mcp_gate.BUDGET.reserve(None)
        with pytest.raises(mcp_gate.Refused) as refused:
            third.mark_anonymous()
        assert refused.value.reason == "anonymous_share"
        third.release()
        for r in first:
            r.release()
        assert mcp_gate.counters()["inflight_anonymous"] == 0

    def test_the_source_table_holds_only_sources_in_flight(self, monkeypatch):
        from app import mcp_gate

        monkeypatch.setattr(settings, "mcp_max_inflight", 1000)
        for i in range(500):
            mcp_gate.BUDGET.reserve(f"s{i}").release()
        assert mcp_gate.BUDGET.source_count() == 0


class TestTheAnonymousCutoff:
    """RISK-MCP-002 / SHIM-MCP-001: anonymous discovery is served in the soak, refused after it."""

    def test_in_the_soak_an_anonymous_tool_list_is_served_and_counted(self, client):
        from app import mcp_gate

        async def run(app, c):
            return await _post(c, LIST)

        r = _arun(_with_app(run))
        assert r.status_code == 200, r.text
        assert mcp_gate.counters()["served_anonymous"] == 1

    @pytest.mark.parametrize(
        "headers",
        [{}, {"X-Api-Key": "rwk_0000000000000000_" + "x" * 43}, {"Authorization": "Bearer nope"}],
        ids=["none", "unknown-key", "bad-bearer"],
    )
    def test_after_the_cutoff_no_valid_credential_is_refused_before_any_transport(
        self, client, monkeypatch, headers
    ):
        from app import mcp_gate

        monkeypatch.setattr(mcp_gate, "_clock", lambda: AFTER)

        async def run(app, c):
            return await _post(c, INITIALIZE, headers)

        r = _arun(_with_app(run))
        assert r.status_code == 401
        assert mcp_gate.counters()["refused_unauthenticated"] == 1
        assert mcp_gate.counters()["live_transports"] == 0

    @pytest.mark.parametrize("shape", ["x-api-key", "bearer-api-key", "bearer-jwt"])
    def test_after_the_cutoff_every_credential_shape_still_works(
        self, registered, monkeypatch, shape
    ):
        from app import mcp_gate

        monkeypatch.setattr(mcp_gate, "_clock", lambda: AFTER)
        headers = {
            "x-api-key": {"X-Api-Key": registered["api_key"]},
            "bearer-api-key": {"Authorization": f"Bearer {registered['api_key']}"},
            "bearer-jwt": {"Authorization": f"Bearer {registered['token']}"},
        }[shape]

        async def run(app, c):
            return await _post(c, LIST, headers)

        r = _arun(_with_app(run))
        assert r.status_code == 200, r.text
        assert mcp_gate.counters()["served_authenticated"] == 1

    def test_after_the_cutoff_a_revoked_session_is_refused_at_the_handshake(
        self, client, registered, monkeypatch
    ):
        """The handshake applies ADR 0044's revocation, not just a signature check."""
        from app import mcp_gate

        monkeypatch.setattr(mcp_gate, "_clock", lambda: AFTER)
        changed = client.put(
            "/auth/password",
            json={
                "current_password": registered["password"],
                "new_password": "another long passphrase",
            },
            headers={"Authorization": f"Bearer {registered['token']}"},
        )
        assert changed.status_code == 200, changed.text

        async def run(app, c):
            return await _post(c, LIST, {"Authorization": f"Bearer {registered['token']}"})

        assert _arun(_with_app(run)).status_code == 401

    def test_the_handshake_writes_no_audit_row(self, registered, monkeypatch):
        from app import audit, mcp_gate

        monkeypatch.setattr(mcp_gate, "_clock", lambda: AFTER)
        rows: list = []
        monkeypatch.setattr(audit, "record", lambda *a, **kw: rows.append((a, kw)))

        async def run(app, c):
            await _post(c, LIST, {"X-Api-Key": registered["api_key"]})
            await _post(c, LIST)

        _arun(_with_app(run))
        # The lifespan writes its own boot row; what must be absent is any authentication row.
        assert [r for r in rows if r[0] and r[0][0] == audit.AUTHENTICATED] == []


class TestTheCutoffSetting:
    def test_the_default(self):
        from app import mcp_gate

        assert mcp_gate.anonymous_cutoff() == int(datetime(2027, 1, 15, tzinfo=UTC).timestamp())
        assert mcp_gate.anonymous_cutoff_problem() is None

    def test_an_earlier_date_is_honoured(self, monkeypatch):
        from app import mcp_gate

        monkeypatch.setattr(settings, "mcp_anonymous_cutoff", "2026-12-01")
        assert mcp_gate.anonymous_cutoff() == int(datetime(2026, 12, 1, tzinfo=UTC).timestamp())
        assert mcp_gate.anonymous_cutoff_problem() is None

    @pytest.mark.parametrize("value", ["2027-06-01", "soon", "", "2027-13-01"])
    def test_a_later_or_malformed_date_is_ignored_and_reported(self, monkeypatch, value):
        from app import mcp_gate

        monkeypatch.setattr(settings, "mcp_anonymous_cutoff", value)
        assert mcp_gate.anonymous_cutoff() == int(datetime(2027, 1, 15, tzinfo=UTC).timestamp())
        assert mcp_gate.anonymous_cutoff_problem()


class TestTheCountersSayNothingAboutCallers:
    def test_counters_are_integers_only(self, registered):
        from app import mcp_gate

        async def run(app, c):
            await _post(c, LIST, {"X-Api-Key": registered["api_key"]})
            await _post(c, LIST)

        _arun(_with_app(run))
        counters = mcp_gate.counters()
        assert counters and all(isinstance(v, int) for v in counters.values())

    def test_the_summary_line_holds_no_header_address_or_argument(self, registered, monkeypatch):
        from app import mcp_gate

        lines: list[str] = []
        monkeypatch.setattr(
            mcp_gate.logger, "info", lambda msg, *a, **kw: lines.append(f"{msg} {a} {kw}")
        )

        async def run(app, c):
            await _post(c, LIST, {"X-Api-Key": registered["api_key"]})
            await _post(c, LIST)

        _arun(_with_app(run))
        mcp_gate.report(force=True)
        text = " ".join(lines)
        assert "mcp budget" in text
        assert registered["api_key"] not in text
        assert "203.0.113" not in text
        assert registered["username"] not in text


class TestTheComposeFilesPassTheSettings:
    """A setting the compose file does not list never reaches the container (no env_file)."""

    @pytest.mark.parametrize("compose", ["docker-compose.yml", "ops/deploy/docker-compose.yml"])
    def test_every_mcp_setting_is_passed_through_with_its_default(self, compose):
        from pathlib import Path

        text = (Path(__file__).resolve().parents[3] / compose).read_text()
        for line in (
            "- MCP_MAX_INFLIGHT=${MCP_MAX_INFLIGHT:-32}",
            "- MCP_SOURCE_MAX_INFLIGHT=${MCP_SOURCE_MAX_INFLIGHT:-8}",
            "- MCP_ANONYMOUS_CUTOFF=${MCP_ANONYMOUS_CUTOFF:-2027-01-15}",
        ):
            assert line in text, line
