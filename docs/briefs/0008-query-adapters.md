# Change Impact Brief 0008 — CLI and MCP adapters over one query layer

| Field | Value |
|---|---|
| **Requested outcome** | Turn the graph from an artefact the gate checks into something an agent or a human actually queries — through two access paths that cannot disagree. |
| **Owning unit** | `ops` |
| **Applicable contracts** | `docs/task-interface.md#the-index`, `index/schema.md` |
| **Rule IDs introduced** | `RULE-IDX-004` (fact-level parity) |
| **Risks recorded** | `RISK-IDX-001` (the MCP adapter is untested against a real client) |
| **Entry points** | `tools/index/query.py` (the layer), `cli.py`, `mcp_server.py` |
| **Affected public surfaces** | **None** in the product. The task interface gains five commands: `map`, `impact`, `flow`, `similar`, `violations`, `mcp`. |
| **Delivery Pattern** | **New Capability** |
| **Required tests** | 24 parity and correctness assertions; `RULE-IDX-004` with a negative fixture. |
| **Base revision** | `45a725c` |

## One layer, two adapters

`query.py` holds every canonical query. `cli.py` adds rendering; `mcp_server.py` adds JSON-RPC. **Neither
adds logic**, which is what makes parity provable rather than aspirational — there is nothing for the two
surfaces to disagree about.

Every answer is wrapped in an envelope carrying the repository revision, the index revision, freshness,
coverage and **the blind spots relevant to that specific answer**. A stale index makes the CLI exit `4` and
stamps the answer `ANSWER MAY BE WRONG`.

The MCP adapter is hand-rolled JSON-RPC over stdio rather than the `mcp` SDK, because ADR 0008 commits the
index to zero third-party dependencies. It is tested at the protocol level; that it has not been driven by a
real MCP client from here is recorded as `RISK-IDX-001` rather than glossed.

## The queries found two errors in my own architecture declaration

Running `violations` for the first time reported **seven** forbidden dependencies. Two were mine, not the
code's:

| Reported | Reality |
|---|---|
| `be/routers → be/adapters`, six imports | Five were `database.get_db` — a FastAPI **dependency provider**, which routers are *meant* to import for injection. The unit rule was too coarse. |
| `fe/shell → ops`, one import | `main.js` imports `style.css`, which I had mis-assigned to the `ops` unit during the TOML conversion. |

Fixes: `be/adapters` split into `be/adapters/db` (a provider; routers may import it) and `be/adapters/task`
(the Taskwarrior subprocess; routers must not), and `style.css` returned to `fe/shell`.

**Exactly one violation now remains, and it is real**: `be/routers → be/adapters/task` at `gtd.py:7`, where
a router reaches past the service layer — and past its validation — straight into the subprocess adapter.
That is the V1 breach Phase 0 found by reading; it is now reported mechanically with the line that proves it.

## What the gate caught during the step

- `RULE-TI-001` blocked four new commands for being undocumented. Working exactly as intended.
- The parity tests failed on my own unit rename, because they asserted the old names. Also as intended:
  renaming a unit is a change to a declared fact, and the tests are what make that visible.

## Behaviour change

**None.** No application code is touched.
