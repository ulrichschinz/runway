# Change Impact Brief 0028 — Four backend dependencies forward, with their lock

| Field | Value |
|---|---|
| **Requested outcome** | Take the four open Dependabot pip bumps (#24 uvicorn, #25 aiosqlite, #28 fastapi, #30 pydantic-settings) in one change that also regenerates the locks — the part Dependabot cannot do, and which `RULE-DEP-005` now requires. |
| **Owning unit** | `be/app` (dependencies), `ops` (surface snapshot) |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §5 (public surfaces), [`docs/task-interface.md`](../task-interface.md) `make lock` |
| **Governed by** | [ADR 0034](../adr/0034-the-lock-must-match-the-intent.md), [ADR 0004](../adr/0004-pin-transitive-mcp.md) (the `mcp` pin, untouched here) |
| **Rule IDs introduced** | None. |
| **Entry points** | [`backend/requirements.txt`](../../backend/requirements.txt), `backend/requirements.lock`, `backend/requirements-dev.lock` |
| **Affected public surfaces** | **REST (S1), additive only:** the generated `ValidationError` schema gains `input` and `ctx`, which FastAPI now documents; pydantic already returned them in 422 bodies. No route, parameter or success schema changes. The MCP tool list, the database schema, the Taskwarrior template and the SPA snapshots are byte-identical. |
| **Known dependents** | Every route, through FastAPI and Starlette. MCP clients, through `fastapi-mcp` 0.4.0 on the new FastAPI. |
| **Uncertain / dynamic areas** | **Starlette moves 0.41.3 → 1.6.0**, a major version, pulled in transitively by FastAPI. The unit tier exercises routing, middleware, auth and a real MCP session; the container tier (`RISK-TEST-001`, arm64) runs only in CI. |
| **Analogous implementations** | [Brief 0026](0026-the-mcp-server-nobody-could-connect-to.md) — the last dependency move, and the reason a protocol-level MCP test exists. |
| **Delivery Pattern** | **Security or Operability Change** — dependency maintenance, with the surface snapshot updated as the public-surface step. |
| **Required tests** | The full `verify`: 259 backend unit tests including `tests/unit/test_mcp_session.py`, 50 frontend tests, the snapshots, and the container tier in CI. |
| **Intended scope** | Four pins, both locks, one snapshot. **Not** in scope: `bcrypt` (load-bearing pin, see `requirements.txt`), `mcp`, the Python runtime (#35), and the dev tooling. |
| **Base revision** | `ada5c6c` |

## Behaviour change

None intended. `fastapi` 0.115.5 → 0.141.1, `uvicorn` 0.32.1 → 0.53.0, `pydantic-settings` 2.6.1 →
2.15.0, `aiosqlite` 0.20.0 → 0.22.1; transitively `starlette` 0.41.3 → 1.6.0. The only observable
difference is the additive 422 schema documentation above.
