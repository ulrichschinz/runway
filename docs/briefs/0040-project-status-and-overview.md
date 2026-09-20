# Change Impact Brief 0040 — Which projects are actually stuck

| Field | Value |
|---|---|
| **Requested outcome** | "Nothing is moving this project" is the most valuable sentence a GTD review produces, and the summary has been getting it wrong for every project the user deliberately set aside — because Taskwarrior holds no notion of a project beyond the string on a task, so "parked on purpose" and "forgotten" look identical in the data. The skill worked around it by moving a parked project's tasks to `someday` and writing `ON HOLD` into the plan text, then reading that text back at review time: a convention held up by prose on both sides, invisible to every other client, one plan fetch per candidate, and silently broken by lower case. `PUT /projects/{name}/status` stores the decision (`active`, `on_hold`, `done`), and `GET /gtd/projects/overview` gives every project with its counts, its status and whether it is stalled — the list behind the summary's one-line finding. In the same commit the two paths that *create* a project name start validating it, because `PUT /projects/plans/{name}` turned out to be a second creation path and the API was still minting names its own filters refuse. |
| **Owning unit** | `be/adapters/db` (`database.py`), `be/leaves` (`models.py`), `be/services` (`task_service.py`), `be/routers` (`gtd.py`, `projects.py`), backend tests (unit and container), `rules` (route guards, ledger counts), `integrations` (the skill), `ops` (snapshots), `docs` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 (anything reading or writing a database goes in `database.py`; anything touching Taskwarrior goes in `task_service.py`), §4 (`be/routers` → `be/services` → `be/adapters/db` → `be/leaves`: `projects.py` already imports `database.py` and `models.py`, so no fan-in grows and `task_service.py` gains no importer), §5 (REST and MCP are externally consumed and the SQLite schema is forward-only and additive — all three snapshots move and the counts in the contract move with them), §7 (`RULE-SEC-001`: two new routes are two new lines in `rules/route-guards.toml`) |
| **Governed by** | **[ADR 0039](../adr/0039-project-status-and-stalled.md)** — the table, the three values, the stalled definition, the two reserved names and the routing collision behind them. [ADR 0038](../adr/0038-validated-filters-and-exact-project-match.md) is the rule this extends from filtering to creation; [ADR 0025](../adr/0025-narrowing-the-migration-except.md) is why this is a `CREATE TABLE` and not an `ALTER`; [ADR 0037](../adr/0037-the-mcp-surface-is-an-allowlist.md) is why the two tools appear on MCP without a line of configuration. |
| **Rule IDs introduced** | None. No gate rule changes; the two ledger edits are the sentences that state counts (`RISK-MCP-002`, `RISK-SEC-005`). |
| **Entry points** | [`backend/app/database.py`](../../backend/app/database.py) `CREATE_PROJECT_STATUS`, `get_project_statuses`, `set_project_status`; [`backend/app/routers/gtd.py`](../../backend/app/routers/gtd.py) `projects_overview`, `_has_plan`, `summary`; [`backend/app/routers/projects.py`](../../backend/app/routers/projects.py) `set_project_status`, `_created`, `create_project`, `upsert_plan`; [`backend/app/services/task_service.py`](../../backend/app/services/task_service.py) `project_overview`, `_is_stalled`; [`backend/app/models.py`](../../backend/app/models.py) `ProjectOverview`, `ProjectStatus`, `ProjectStatusUpdate` |
| **Affected public surfaces** | **REST (S1):** two new routes, `GET /gtd/projects/overview` and `PUT /projects/{name}/status`; 36 → 38. Two existing routes gain a **400** they did not have: `POST /projects` and `PUT /projects/plans/{name}` refuse a name they would have to write (behaviour change, below). **MCP (S2):** two new tools, `projects_overview_gtd_projects_overview_get` and `set_project_status_projects__name__status_put` — the `gtd` and `projects` tags are on the allowlist, so they are exposed automatically; 25 → 27, every existing name and summary byte-identical. **SQLite (S4):** one new table, `project_status`; forward-only and additive, nothing existing changes. **Route guards:** 35 → 37, both `user`. **Claude skill** 0.8.0 → 0.9.0. `GtdSummary.stalled_projects` changes value for anyone who sets a status, never shape. No SPA route or storage key changes. |
| **Known dependents** | The runway skill, which this commit rewrites to use both routes, and any MCP client that discovers tools at connect time. `GET /gtd/summary` is the one existing caller of anything changed here (`summarize` now receives real statuses) and it is changed in the same commit. The SPA reads `GET /gtd/projects` and `GET /projects/plans/{name}`, neither of which moves; it creates projects only through `POST /projects`, whose new 400 it can reach with a name containing `:` or `/` — the same trade ADR 0038 already made for the project *filter*. `routers/admin.py`, `routers/auth.py`, `routers/inbox.py`, `dependencies.py`, `audit.py` and `main.py` import `database.py` and are untouched: the two helpers are additions, not edits. |
| **Uncertain / dynamic areas** | `BLIND-TEST-001` (the routers are exercised through the ASGI client, so no import-derived test edge exists for `routers/gtd.py` or `routers/projects.py`; the coverage is real and is in `test_gtd.py` and `test_projects.py`). `RISK-MCP-001` (the index derives one tool per route and is over-inclusive since the allowlist; the snapshot is the count source, `RULE-DOC-001`). `RISK-OPS-002` (the table is created at boot on the deploy host, and nothing in CI can see that host; the proof is a production read after the deploy). `RISK-TEST-001` (the container tier cannot run on arm64 in the gate; run by hand anyway, see Pre-checks). |
| **Analogous implementations** | [Brief 0039](0039-review-timestamps.md) — the `reviews` table, which this copies exactly: a small per-user table with a `UNIQUE(username, …)`, an upsert, a `CHECK` beside a `Literal`, created by `init_db` rather than altered. [Brief 0038](0038-the-gtd-summary.md) — `project_rollup` and the stalled test the overview now shares. [Brief 0034](0034-filters-for-the-task-list.md) — `validate_project_name`, whose `reserved=True` arm this is the first caller of. |
| **Delivery Pattern** | **New Capability** (two routes, guard-declared, snapshot-covered, tested) plus **Data Migration** (a new table, forward-only, created by `init_db` on every start like every other) plus **Bug Fix** (project names were unvalidated on both creation paths, and the second path was not in the change order at all). The write obligations are the Security pattern's: the path name becomes a stored key and is validated with the same regex a filter uses, the body is a `Literal` constrained again by a `CHECK`, and every row is read and written under the caller's own username. |
| **Required tests** | Unit (`test_gtd.py`): `TestProjectsOverview` — the route is not shadowed by `/gtd/projects/{name}` (a project *called* `overview` exists in that test, and the overview still answers); it names no task; the counts separate visible, waiting and parked tasks; a project that is only waiting or only parked is not stalled; an inferred project is `explicit: false` with no plan; an explicit project with no task at all is listed and stalled; `has_plan` is true for a filled text field and for a brainstorm alone; `on_hold` and `done` are never stalled; a status on an inferred project leaves it inferred; a status on a name no project carries is listed but never stalled, for `active` and for `on_hold`; projects with tasks come before the explicitly created ones. `TestSummaryReadsTheStatus` — an on-hold project drops out of `stalled_projects`, a `done` explicit project stops being a finding, a name only the status table knows is not a finding until a task names it, and the two routes agree. The auth list gains `projects/overview`. (`test_projects.py`): `TestProjectNamesAreValidatedWhereTheyAreCreated` — a newline, `(`, a quote, a slash, `plans` and `overview` are each a 400 on `POST /projects` and on `PUT /projects/plans/{name}`, with no row written; surrounding whitespace is still stripped rather than refused; a row that already carries a refused name stays editable. `TestProjectStatus` — the status round-trips; it creates no project; setting it again moves the one row; an unknown status is a 422; a name it would have to write is a 400; a project whose name predates the rules keeps its plan but cannot be given a status; statuses are per user; 401 unauthenticated; and `PUT /projects/plans/status` reaches the plan route, pinned as current routing. (`test_migrations.py`): a database from before the table gains it quietly, and the `UNIQUE` plus the `CHECK` hold against real SQLite. Container (`test_real_task.py`): `TestTheProjectOverview` — parked and waiting tasks are counted and stop a project being stalled; a subproject is a project of its own; a stored status reaches both the overview and the summary. |
| **Intended scope** | The `project_status` table and its two helpers, `project_overview` and the shared `_is_stalled` predicate, the three models, the two routes, the name validation on both creation paths, the guard declarations, the unit and container tests, the three snapshots, the skill's project section, review steps and permissions block (0.9.0), ADR 0039, and the sentences that state a count or the table inventory. **Not** in scope: any frontend change (the SPA shows neither the overview nor a status; no `spa.json` entry moves); a route that *reads* a single project's status (the overview carries it, and a second route would be a second source); pruning or history of statuses, which the table deliberately does not keep; and renaming a project, which remains impossible. |
| **Base revision** | `d097e8c` |

## Behaviour change

Three, and the first is the point of the commit.

- **`stalled_projects` gets shorter, on purpose.** Until now every project without a next action
  was reported, every day, including the ones the user had consciously parked — which is how the
  most valuable finding a review makes turns into a list nobody reads. `on_hold` and `done` are
  never stalled. Nothing changes for a user who sets no status.
- **Stalled means three zeros, not one.** Active, no `next`, nothing `waiting`, nothing parked in
  the tickler (D14). The change order asked for "no pending `+next`"; the skill's own text said "no
  next and nothing in waiting"; neither counted the tickler. Each of the three is already an answer
  to "what happens next here": a project waiting on someone has its next step outside the user's
  control, and one parked by a future `wait` has a date on which it comes back. `_is_stalled` is
  one predicate used by the summary and the overview, so the one-line finding and the list behind
  it cannot disagree. An **explicit project with no open task at all is stalled** — a real finding,
  not an empty row.
- **Creating a project name can now be a 400.** `POST /projects` and `PUT /projects/plans/{name}`
  both validate with `validate_project_name(name, reserved=True)`. The second path had to be found:
  it INSERTs a `projects` row for whatever name it is given, so "validate project names on
  creation" was half-applied without it, and the API was minting names its own filters refuse
  (ADR 0038). Refused: control characters, `( ) " ' \ : / ? # %`, a leading sign, a trailing space,
  and the two reserved names. Surrounding whitespace on `POST /projects` is still **stripped**
  rather than refused, exactly as before. Reads, filters and resent values are untouched — a plan
  whose row already exists is updated without re-validating its name, the same live-user rule that
  keeps kept tags and an unchanged project modifier exempt.

Everything else is new.

- **A table, not a column** (D15). The migration loop runs *before* the `CREATE` statements, so an
  `ALTER TABLE … ADD COLUMN` against a table a fresh database does not have yet fails on the first
  boot and succeeds on the second. That is the reason the `reviews` table has this shape and it
  applies unchanged. The second reason is meaning: `projects` is "created explicitly", which is
  what `explicit` reports, and putting status there would force a project into existence to say it
  is on hold — the wrong direction, since a project that exists only because tasks name it is the
  most likely one to need parking. `PUT /projects/{name}/status` creates no `projects` row, and a
  test says so.
- **No row means `active`.** Nothing is written for the ordinary case, and "nobody has decided
  anything here" is not stored as a decision.
- **A status can name something that is not a project yet, and that is never a finding.** The
  status route creates no `projects` row, so `PUT /projects/websight/status` writes a status for a
  name no task carries. The overview lists such a name with zero counts, which is how a status set
  ahead of the first task — or a typo — is ever seen again; `_is_stalled` takes a third argument
  saying whether a task or a `projects` row carries the name, and a name known only from the status
  table is never stalled and is never in `stalled_projects`. Without it, `active` plus three zeros
  is exactly the stalled shape, nothing deletes a status row, and one mistyped `PUT` would be a
  false finding in every review from then on — the noise this commit exists to remove. The moment a
  task names it, it is judged like every other project.
- **A project whose name predates these rules cannot be given a status.** `_created` validates the
  path name the route is about to write as a key, so `(alt)` is a 400 here while `PUT
  /projects/plans/(alt)` stays a 200 — the same split the plan route makes between creating a name
  and updating a row that exists. `GET /gtd/projects/{name}` already refuses the same name for the
  same reason (it becomes a filter token, ADR 0038), so the project is unreachable by name either
  way; the way out is to move its tasks to a valid name. Accepted, pinned by a test and recorded in
  ADR 0039 rather than fixed with a "validate only unknown names" branch, which would hand out a
  key no other route can read back.
- **`status` is constrained twice**, as `kind` already is: a `Literal` so an unknown value is
  FastAPI's 422 with the list of what is allowed — the error an agent can act on — and a SQLite
  `CHECK` so nothing else can arrive by another path.
- **The overview is a third view of one export.** It runs the same `OPEN` export and the same
  `project_rollup` as the summary, adds `explicit`, `has_plan` and the stored status, and carries
  no task description, so it is as printable as the summary.
- **`/gtd/projects/overview` is declared before `/gtd/projects/{name}`.** FastAPI matches in
  declaration order; the other way round this path reads as a project called `overview`. Order is
  the fix, the reserved name is the second half, and a test holds both. The mirror case is
  documented rather than fixed: `PUT /projects/plans/status` matches `PUT /projects/plans/{name}`,
  which is declared first, so it upserts the plan of a project called `status` — a project
  literally named `plans` cannot have a status set. That name can no longer be created, so the only
  way to reach the state is a row that predates this change (ADR 0039, Decision 4).

## Pre-checks

- Unit tier: **617 passed** (572 before; 45 new). No existing test changes its expectation; the
  `test_gtd.py` auth list gains one entry and two local imports in `test_projects.py` move to the
  module header.
- Container tier by hand (D25), against `/opt/homebrew/bin/task` **3.5.0**:
  `cd backend && TZ=UTC PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -m container tests/container`
  → **76 passed** (73 before; 3 new). The three cover what the fake cannot: that a task parked by a
  future `wait` still reaches the rollup at all (it is `status:waiting`, not `status:pending`, on
  3.5), that a subproject is a project of its own here where the binary's own `project:` is a
  prefix match, and that a stored status reaches both routes against real data. CI's x86_64 run is
  the authoritative one.
- `./run surfaces` reported drift in S1, S2 and S4 before the update and matches after it.
  `mcp-tools.json` gains exactly two entries and its `count` goes 25 → 27, which is what
  `RULE-DOC-001` reads (ADR 0037); `db-schema.sql` gains one `-- table project_status` block and
  nothing else moves.
- Adversarial, each a temporary edit reverted afterwards, over `test_gtd.py`, `test_projects.py`
  and `test_migrations.py` (140 tests; `scratchpad/adv-p18.sh`, `scratchpad/adv-p18.log`):
  - **Stalled ignores the status** (`status == "active"` widened to any status): **5 red**. Both
    routes and both directions — an on-hold project reappears as a finding, which is the whole
    defect this commit removes.
  - **The overview is declared after `/projects/{name}`**: **12 red**. The route is read as a
    project name and answers with that project's tasks, so every overview assertion fails at once.
  - **The summary ignores the stored statuses** (the merge dropped): **3 red**. The overview stays
    green, which is exactly the drift the shared predicate is not enough to prevent on its own —
    the two routes have to read the same statuses as well as the same rule.
  - **The plan upsert creates any name** (`_created` dropped from `upsert_plan`): **4 red**. The
    second creation path is the one the change order did not mention.
  - **The stored statuses are read for every user** (`WHERE username=?` neutered): **1 red**, the
    cross-user test. The isolation is asserted, not assumed.
  - **`project_status` is not created at boot**: **40 red**, including every summary and overview
    test — the proof that both routes genuinely read the table rather than carrying a constant.
- Not made executable: that the table appears on the *deployed* database. `init_db` runs on every
  start and the snapshot proves the statement, but nothing in CI can see the host
  (`RISK-OPS-002`); the check is a `GET /api/gtd/projects/overview` returning `200` after the
  deploy, which is in PR B's verification list. No status is written in production — that write is
  the user's.

## Skill

0.9.0. `references/conventions.md` "Projects" stops telling the model to move a parked project's
tasks to `someday` and write `ON HOLD` into the plan; it says to set status `on_hold`, and it
states the stalled definition the server actually computes, including the tickler. That fallback is
deleted rather than kept beside the route: two sources for one fact is how they drift, and the
prose one cannot be checked by anything. The operation table gains the overview and the status
route. `references/daily-review.md` §2 item 5 loses the "check the plan for an ON HOLD note, for at
most five candidates" instruction — five plan fetches to recover a fact the summary now carries —
and gains the offer to set the status for anything the user has consciously parked; the gather
table still says section 5 makes **no** call, with the overview named only for when the user asks
what is in those projects, because the daily review's whole discipline is one summary and a list
per non-zero counter. `references/weekly-review.md` item 6 names the overview as the list to walk
and gives "on hold" and "close" their status calls, and the Reset's third step says which status it
means. `references/setup.md` puts `projects_overview_…` in `allow` — it is a lookup that names no
task — and `set_project_status_…` in `ask`, beside the other writes: unlike a review timestamp,
this one changes what the next review reports, so it is worth a prompt.
The scoping paragraph in `conventions.md` names the overview beside the project-name list as a
call that takes **no** `tag`: both would return every area's project names, so neither is made in a
scoped repository — the scoped summary already names this area's stalled projects. The two places
that call the overview say the same, because the daily review's gather rule ("pass the scope tags
to every list call") cannot be satisfied by a route that has no such parameter.
`integrations/claude/README.md` records that the if-present list is now empty, says in the update
section that the skill no longer works around a missing operation (the two sentences contradicted
each other otherwise), and adds the project status to the server semantics the skill depends on.

## Counts

REST 36 → **38**, MCP tools 25 → **27**, route guards 35 → **37** (30 `user` / 4 `admin` /
3 `open`). Updated in `AGENTS.md` §5, `README.md` ("the full list of all 27"), the route breakdown
and the schema-versus-declaration paragraph in `docs/threat-model.md` §1, and the two sentences in
`rules/ledger.yaml` that state them (`RISK-MCP-002`, `RISK-SEC-005`). The persistence section of
`docs/threat-model.md` §6 goes from five tables to **six** and its line references move with the
file. `docs/plan/STATUS.md:15` is a dated record of what production served in September and is left
as it stands.
