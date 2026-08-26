# Change Impact Brief 0015 — Public-surface protection, and what observing them found

| Field | Value |
|---|---|
| **Requested outcome** | Give every externally consumed surface protecting evidence, and replace `BLIND-MCP-001`'s declared assumption with a runtime observation. |
| **Owning unit** | `ops`, `docs`, `be/app` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md), [`docs/task-interface.md`](../task-interface.md) |
| **Rule IDs introduced** | `RULE-SURF-001` (snapshots match), `RULE-SURF-002` (env vars agree with README) |
| **Risks recorded** | `RISK-MCP-001` (index and snapshot derive tool names by different means) |
| **Blind spots resolved** | `BLIND-MCP-001` → runtime-observed |
| **Entry points** | [`tools/surfaces.py`](../../tools/surfaces.py), [`ops/surfaces/`](../../ops/surfaces), [`tools/checks/surfaces.sh`](../../tools/checks/surfaces.sh) |
| **Affected public surfaces** | **None changed.** Every surface is now *recorded*; the documentation describing two of them was wrong and is corrected. |
| **Known dependents** | None — the tool boots the app read-only and writes only into `ops/surfaces/`. |
| **Uncertain / dynamic areas** | `RISK-MCP-001`. `SHIM-SEC-006` remains open (below). |
| **Analogous implementations** | `RULE-SEC-001`'s route-guard declaration: normative state in a checked-in file, compared against what the code actually does. |
| **Delivery Pattern** | **New Capability.** No behaviour changes. |
| **Required tests** | Two negative fixtures — a changed urgency coefficient, and a documented variable nothing reads. |
| **Intended scope** | Step 13. `SHIM-SEC-006`'s removal was in scope and is deliberately deferred, with the reason recorded. |
| **Base revision** | `86207db` |

## The mechanism

Each surface is captured from the **running application** and checked in under
`ops/surfaces/`. `./run surfaces` reports drift; `--update` accepts it.

Updating a snapshot is not a way around the rule — it *is* the rule. The control is that a
public-surface change becomes a diff a human commits, instead of something that happens.

Sources are deliberately chosen so a snapshot cannot inherit the belief it exists to test: the
REST schema comes from `app.openapi()` rather than from the routers, the DB schema from a
database `init_db()` has actually migrated rather than from the `CREATE` statements, and the
MCP tools from a booted `FastApiMCP` rather than from the route table.

## What observing them found, immediately

### Every MCP tool name in the README was wrong

All seven. The names are FastAPI **operation ids** — function, path, method — so `create_task`
is really `create_task_tasks_post`. `AGENTS.md` carried the same error in stronger language:
*"Tool names are the route handler function names."*

```
README claimed: list_tasks, create_task, gtd_inbox, add_to_inbox
exact matches in the runtime tool list: []
```

Nothing broke, because MCP clients discover tools at connect time rather than hardcoding them
— which is exactly why it could stand for months. An agent following the README by hand would
have failed on every call.

This is the entire argument for `RUNTIME_OBSERVED` over `CONTRACT_DECLARED`, and it is why
`BLIND-MCP-001` existed. The library's documented behaviour was close enough to sound right
and wrong enough to be useless.

I did **not** rename the tools to match the documentation. That is a breaking change to an
externally consumed surface under decision **F2**, and it belongs in a migration of its own
rather than smuggled in beside the mechanism that revealed it.

### `PORT` was documented and read by nothing

The plan predicted this check would catch it. It did, on the first run. The frontend's port is
fixed in `nginx.conf` and published by compose; an operator setting `PORT` got silence.

Four variables that *are* read were documented nowhere — `CORS_ORIGINS`, `BOOTSTRAP_ADMIN`,
`LOGIN_RATE_LIMIT`, `LOGIN_RATE_WINDOW_SECONDS`, three of them shipped by this session. Both
directions are the same defect: a configuration surface that lies. The README now carries the
complete table.

## The shim that was due here and is not gone

`SHIM-SEC-006` — an API key in the Bearer slot — was scheduled for removal in this step.

Its record always made removal conditional on **callers having moved**, and nothing in this
repository can see what callers send. Removing it on schedule regardless would break every
agent, MCP client and webhook in one step, which is the precise outcome a compatibility shim
exists to prevent.

So the removal step moved to Step 15, where the audit log makes "is anyone still using this?"
a question the deployment can answer. **The expiry did not move**: 2026-11-25 stands and
`RULE-SEC-002` still fails when it passes. A shim that slips its date twice should be an
argument, not a habit.

## Behaviour change

**None.** No route, schema, tool name or storage key moves. Two documents that described these
surfaces incorrectly now describe them correctly, which changes what a reader believes rather
than what the software does.
