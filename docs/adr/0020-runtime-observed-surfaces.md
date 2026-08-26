# ADR 0020 — Snapshot what the application produces, not what the documentation claims

- **Date:** 2026-08-26
- **Status:** Accepted
- **Scope:** `ops`, `docs`, `backend`

## Context

`AGENTS.md` treats nine public surfaces as externally consumed — this is a public repository
whose README documents the API for third parties — and until now protected none of them. The
promise was real; the measurement was absent.

`BLIND-MCP-001` had recorded the sharpest instance since Step 5: MCP tool names were entered
into the index as `CONTRACT_DECLARED`, on the strength of `fastapi-mcp`'s documented behaviour,
with a note that Step 13 would replace the declaration with observation.

## Decision

**Each protected surface is captured from the running application and checked in.**

The point is not to prevent change. It is to make change **visible and deliberate**: a diff in
a checked-in snapshot has to be reviewed and committed, whereas renaming a route handler
function silently renames an MCP tool and breaks every client with nothing in the diff to
notice. `./run surfaces --update` accepts a change; that is the rule working, not a way around
it.

Sources are chosen so the snapshot cannot inherit the belief it is meant to test:

| Surface | Captured from |
|---|---|
| S1 REST | `app.openapi()` — the schema FastAPI actually serves |
| S2 MCP tools | a booted `FastApiMCP` instance, read at runtime |
| S4 DB schema | `sqlite_master` of a database `init_db()` has migrated |
| S5 taskrc | the template verbatim — the urgency coefficients are a behavioural contract |
| S8 SPA | routes and localStorage keys parsed from source |

**Environment variables are cross-checked rather than snapshotted**, in both directions.
A documented variable nothing reads and an undocumented variable the app does read are the
same defect wearing different clothes: a configuration surface that lies.

## What observation immediately falsified

**Every MCP tool name in the README was wrong.** All seven. The names are FastAPI operation
ids — function, then path, then method — so `create_task` is really `create_task_tasks_post`.
`AGENTS.md` carried the same error in stronger language: *"Tool names are the route handler
function names."*

Nothing broke, because MCP clients discover tools at connect time rather than hardcoding them
— which is precisely why the error could stand for months. An agent following the README by
hand would have failed on every call.

**`README` documented `PORT=4000`, which nothing reads.** The frontend's port is fixed in
`nginx.conf` and published by compose. The plan predicted this check would catch it, and it
did, on the first run. Four variables that *are* read — `CORS_ORIGINS`, `BOOTSTRAP_ADMIN`,
`LOGIN_RATE_LIMIT`, `LOGIN_RATE_WINDOW_SECONDS` — were documented nowhere, three of them
shipped by this session.

## Alternatives considered

- **Rename the MCP tools to match the README** by setting explicit `operation_id`s. Tempting:
  the documented names are the nicer ones. Rejected for now — under decision **F2** that is a
  breaking change to an externally consumed surface and belongs in expand → migrate → switch →
  contract, not smuggled in beside the mechanism that revealed it. Documenting reality first
  is also what makes the migration reviewable later.
- **Snapshot the routes from the source instead of the served schema.** Rejected: it would
  record what we believe we registered, and the belief is the thing under test.
- **Grep for `os.environ` to find the env vars.** Rejected: pydantic-settings reads them by
  field name, so a grep finds nothing and would have reported everything as fine.
- **Fail the gate on any snapshot change, with no update path.** Rejected as the way to make
  people stop running the gate. A reviewed diff is the control.

## Consequences

- Five surfaces are protected by `RULE-SURF-001`; env vars by `RULE-SURF-002`. Both are proven
  able to fail.
- **`BLIND-MCP-001` is resolved** — the evidence class for S2 moves from `CONTRACT_DECLARED` to
  observed. What remains is narrower and recorded as `RISK-MCP-001`: the index still derives
  `mcp_tool` nodes by declaration while the snapshot derives them by observation, so the two
  producers disagree in form and nothing compares them.
- The README and `AGENTS.md` now state the tool-name rule correctly, with a mapping table.
- **`SHIM-SEC-006` was scheduled for removal here and is not removed.** Its record always made
  removal conditional on callers having moved, and nothing in this repository can yet see what
  callers send; removing it on schedule would break every agent in one step, which is the
  outcome the shim exists to prevent. Removal moves to Step 15, where the audit log makes the
  question answerable. **The expiry did not move** — 2026-11-25 stands, and `RULE-SEC-002`
  still fails when it passes. A shim that slips its removal date twice should be an argument,
  not a habit.
- The OpenAPI snapshot is 2,700 lines. That is the cost of the control, and it is a file
  nobody edits by hand.
