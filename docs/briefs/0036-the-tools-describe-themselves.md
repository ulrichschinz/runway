# Change Impact Brief 0036 — The project tools describe themselves

| Field | Value |
|---|---|
| **Requested outcome** | An agent reaching runway over MCP learns what an operation does from the operation itself. Three of the twenty-two tools — the project ones — carried a summary FastAPI derived from the handler name (`Upsert Plan`), no description at all, and unlabelled body fields, so nothing told a caller that a project also exists as soon as a task names it, what a plan is, or that an omitted plan field is kept rather than cleared. The task and GTD descriptions that earlier items changed the *behaviour* of are brought in line with it in the same pass. |
| **Owning unit** | `be/routers` (`projects.py`, `gtd.py`, `tasks.py`), `be/leaves` (`models.py`), backend tests (unit, MCP-session, container, the fake), `ops` (snapshots) |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §5 (REST and MCP are externally consumed; the OpenAPI and MCP snapshots move with them, and **tool names are operation ids** — no handler is renamed here), §3 (a route description belongs on the router; the field descriptions belong on the model in `be/leaves`) |
| **Governed by** | [ADR 0037](../adr/0037-the-mcp-surface-is-an-allowlist.md) (which routes are tools at all, and that `mcp-tools.json` records the name and the summary only), [ADR 0038](../adr/0038-validated-filters-and-exact-project-match.md) (the behaviour the `list_tasks` parameter text describes) |
| **Rule IDs introduced** | None. No gate rule changes; no ledger entry is added or reworded. |
| **Entry points** | [`backend/app/routers/projects.py`](../../backend/app/routers/projects.py) `create_project`, `get_plan`, `upsert_plan`; [`backend/app/models.py`](../../backend/app/models.py) `ProjectCreate`, `ProjectPlanUpdate`, `BrainstormItem`; [`backend/app/routers/gtd.py`](../../backend/app/routers/gtd.py) `inbox`; [`backend/app/routers/tasks.py`](../../backend/app/routers/tasks.py) `create_task`, `modify_task` |
| **Affected public surfaces** | **REST (S1):** no path, method, status code, parameter or schema changes — only `summary` and `description` strings, on `POST /projects`, `GET`/`PUT /projects/plans/{name}`, `GET /gtd/inbox`, `POST /tasks` and `PUT /tasks/{uuid}`, plus field descriptions on three request schemas and on `TaskModify.description`. `ops/surfaces/openapi.json` updated. **MCP (S2):** 22 tools, every **name** unchanged; three summaries change (`Create Project` → `Create a project`, `Get Plan` → `Get a project plan`, `Upsert Plan` → `Update a project plan`), so `mcp-tools.json` moves by exactly those three lines. **Route count:** unchanged at 33, guards unchanged at 32 (25 user / 4 admin / 3 open). **Claude skill:** untouched, so no version bump (it stays 0.6.0). |
| **Known dependents** | MCP clients and the runway skill read this text; nothing calls it. The SPA ignores summaries and descriptions entirely. `models.py` has seven importers, none of which reads a `Field` description. |
| **Uncertain / dynamic areas** | `BLIND-TEST-001` (the routers are exercised through the ASGI client, so no import-derived test edge exists for `routers/projects.py`), `BLIND-MCP-001` / `RISK-MCP-001` (the index derives one tool per route by declaration; the snapshot is the source for names and summaries, and is what the new tests read through a real client). |
| **Analogous implementations** | [Brief 0031](0031-empty-string-clears.md) — where the task field descriptions were written, and the reason they are the only documentation an agent sees. [Brief 0033](0033-the-mcp-allowlist.md) — the surface these three tools sit on, and the snapshot that records only their names and summaries. |
| **Delivery Pattern** | **Public-Surface change, non-breaking.** Nothing is renamed, removed or newly required: an operation id is untouched, so every permission rule of the form `mcp__runway__<id>` still matches, and no client that ignores documentation notices anything. No expand → migrate → switch → contract is owed, because there is nothing to migrate off. What the pattern does oblige is the snapshot update in the same commit, and a test that reads the text the way a client receives it rather than from the server object. |
| **Required tests** | Unit (`test_projects.py`, `TestTheProjectToolsDocumentThemselves`): every project route carries a non-empty summary and a description containing the fact a caller cannot infer from the signature (implicit creation, the Natural Planning Model, that omitted fields are kept); every property of `ProjectCreate`, `ProjectPlanUpdate` and `BrainstormItem` in the served schema has a description. MCP session (`test_mcp_session.py`, `TestTheToolsCarryTheirOwnDocumentation`): read through a real `ClientSession` — the `modify_task` input schema says an empty string clears, that `tags` is the complete set and that the deltas leave other tags alone; the `inbox` tool states "no project and no tags" and that a tag means clarified; the `list_tasks` `status` parameter distinguishes a future `wait` date from the `waiting` GTD tag; the three project tools carry their descriptions and `purpose` its field text. Unit (`test_tasks.py`, `TestEmptyStringClears`): `description: ""` on modify is a 200 that leaves the description as it was. Container (`TestWhatTheFakeClaims`): `modify -- ""` against the real binary, alone and beside a modifier, is rc 0 with the description unchanged. |
| **Intended scope** | Summary and description text on six routes, `Field(description=...)` on the three project request models and on `TaskModify.description`, the two new test classes, the fake's empty-free-text correction with the unit and container cases that pin it, and the openapi and mcp-tools snapshots. **Not** in scope: any product behaviour, any route, any parameter, any skill file (P1-9 changes none, so no bump), the summary route and its counters, review timestamps, and project status (later items). |
| **Base revision** | `e92ddf5` |

## Behaviour change

None. Every changed string is documentation; no code path, validation or response body moves.
What changes is what a caller is told:

- **`POST /projects`** says that a project also exists implicitly as soon as a task names it,
  and that creating the same name twice changes nothing. Without that, an agent has no way to
  know whether it must create a project before using it in a task — and the honest answer,
  "no", is the difference between one call and two.
- **`GET` / `PUT /projects/plans/{name}`** name the model the five fields come from (GTD Natural
  Planning: purpose, principles, vision, brainstorm, organized), say that an unknown name reads
  back as an empty plan rather than a 404, and that an omitted field is kept. Each field then
  says what belongs in it, and both lists say that they are **replaced whole** — "update the
  plan" otherwise reads as "append to it", which would silently drop the stored ideas.
- **`GET /gtd/inbox`** carries the definition instead of a restatement of its name: no project
  and no tags, and a tag means the task has been clarified, so giving it one takes it out of the
  inbox. This is the definition the tag parameter description already relied on.
- **`POST /tasks`** and **`PUT /tasks/{uuid}`** catch up with the behaviour of briefs 0030 and
  0031: on create an empty string counts as not given; on modify an omitted or null field is
  left alone while an empty string clears the seven scalar fields brief 0031 named (D7), and `tags` replaces
  the whole set where `tags_add` / `tags_remove` do not. The route description said "Only
  provided fields are changed", which is true and, since 0031, no longer the whole rule.
  The **description is named as the exception**: `""` reaches the binary as free text after
  `--`, which 3.5.0 takes with rc 0 and ignores, so the call is a 200 carrying the old
  description. A blanket "an empty string clears it" would have promised a clearing that
  neither the API nor Taskwarrior performs — and the fake asserted that promise, so a test
  written from it would have been green and wrong. The fake now drops an empty word like the
  binary, and `TestWhatTheFakeClaims` pins it.

## Pre-checks

- Unit tier: **525 passed** (518 before; 7 new). Container tier by hand (D25), against
  `/opt/homebrew/bin/task` **3.5.0**: **66 passed** (65 before; 1 new) — this item touches no
  Taskwarrior semantics, and the one new case only records what the binary already did.
- Mutation check: with `backend/app/` reverted to `e92ddf5` and the new tests kept, **4 of the
  6 are red** — both project tests, the inbox tool test and the project-tool text test. The
  other two (the `modify_task` schema and the `status` parameter) are green before and after by
  design: they pin text that briefs 0030, 0031 and 0034 introduced and that nothing else
  guards, since `mcp-tools.json` records neither a description nor an input schema. The seventh
  test, the empty description, is red against the previous fake (which cleared the description)
  and green against the corrected one.
- Adversarial check on the surface diff, as required for this item: `ops/surfaces/mcp-tools.json`
  changes by **three summary lines and nothing else** — `"count": 22` is unchanged and no
  `"name"` line appears in the diff. `ops/surfaces/openapi.json` changes only `description` and
  `summary` keys; no path, operation id, parameter or schema property is added or removed.
- The MCP-session tests read the listing through a real client rather than `mcp.tools`, for the
  reason ADR 0033 exists: the snapshot was green for eleven weeks while no client could obtain
  anything at all. Their helper asks for the listing alone, without a tool call.

## Counts

Unchanged: REST 33, MCP 22, route guards 32 (25 user / 4 admin / 3 open). No route is added or
removed and no handler is renamed, so `AGENTS.md` §5, `README.md`, the route breakdown in
`docs/threat-model.md` §1 and `rules/ledger.yaml` need no edit.
