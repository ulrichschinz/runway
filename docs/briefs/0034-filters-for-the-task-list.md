# Change Impact Brief 0034 — Filters for the task list, and an exact project match

| Field | Value |
|---|---|
| **Requested outcome** | `GET /tasks` can answer a narrower question than "everything pending": by status, by project, by tag, by due or completion day, with a limit. Every value that becomes a Taskwarrior filter or modifier is validated first, and the project match stops being a prefix match. |
| **Owning unit** | `be/leaves` (`models.py`), `be/services` (`task_service.py`), `be/routers` (`tasks.py`), backend tests (unit and container), `integrations` (the skill), `ops` (snapshots), `docs` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 (anything touching Taskwarrior goes in the task service, which is where validation lives), §5 (REST API and MCP tools are externally consumed), §4 (`be/routers` → `be/services` → `be/leaves`, no new fan-in) |
| **Governed by** | [ADR 0038](../adr/0038-validated-filters-and-exact-project-match.md) (validated filters, exact project match, new), [ADR 0019](../adr/0019-the-taskwarrior-argv-boundary.md) (the argv boundary this extends), [ADR 0036](../adr/0036-list-semantics-against-taskwarrior-3-5.md) (what the status filters mean on 3.5) |
| **Rule IDs introduced** | None. No gate rule changes; no ledger entry is added or reworded. |
| **Entry points** | [`backend/app/models.py`](../../backend/app/models.py) `PROJECT_RE`, `validate_project_name`; [`backend/app/services/task_service.py`](../../backend/app/services/task_service.py) `search_tasks`, `_validate_day`, `_local_day`, `ALL`; [`backend/app/routers/tasks.py`](../../backend/app/routers/tasks.py) `list_tasks` |
| **Affected public surfaces** | **REST (S1):** `GET /tasks` gains `status`, `project`, `tag`, `due_before`, `due_after`, `scheduled_before`, `completed_since`, `limit`; `include_done` is kept and redefined. The `Task` schema gains `end`. `GET /gtd/projects/{name}` changes behaviour (exact match) without changing its shape. `ops/surfaces/openapi.json` updated. **MCP (S2):** unchanged — 22 tools, every name the same; `mcp-tools.json` records summaries only, and none changed. **Route count:** unchanged at 33, guards unchanged at 32 (25 user / 4 admin / 3 open). **Claude skill** 0.4.1 → 0.5.0. |
| **Known dependents** | MCP clients (the runway skill above all) — additive parameters, nothing to change. The SPA sends `include_done=false` on every context-tag refresh (`frontend/src/stores/tasks.js:21`); that stays a no-op and needs no frontend change. Anyone relying on `/gtd/projects/alpha` also returning `alpha.sub` or `alphabet` gets fewer tasks — that is the fix. **The SPA project view** (`frontend/src/stores/tasks.js` `fetchProjects` → `fetchProject`) offers a name the server listed and then asks for it back: for a legacy project name `PROJECT_RE` refuses — Taskwarrior 3.5.0 stores `Kunde: ACME`, `O'Brien`, `Kunde (ACME)`, `Marketing/Sales` and the like, and this API created them unvalidated — `GET /gtd/projects` still lists it while `GET /gtd/projects/{name}` and `GET /tasks?project=` now answer 400. No frontend change ships here; the fallbacks are the unfiltered list and a rename, and ADR 0038's Consequences record the trade. |
| **Uncertain / dynamic areas** | `BLIND-TEST-001` (the routers are exercised through the ASGI client, so no import-derived test edge exists for `routers/tasks.py`), `RISK-TEST-001` (the container tier cannot run on arm64 in CI's gate; run by hand, see Pre-checks), `RISK-MCP-001` (the index derives tools per route; the snapshot is the count source). |
| **Analogous implementations** | [Brief 0032](0032-list-semantics.md) — the same seam, the same two tiers, the previous round of Taskwarrior-3.5 list semantics. [Brief 0030](0030-tags-are-a-full-set.md) — validating only what the client newly sends, never what it resends. |
| **Delivery Pattern** | **New Capability** with Security-pattern obligations: the parameters are additive, but each opens an argv position `--` cannot protect, so each carries a regex, a bound, a negative test and a fuzz assertion that nothing refused reaches the binary. Two behaviour changes ride along as fixes (exact project match, `include_done` no longer returning deleted tasks) and are recorded in ADR 0038 rather than migrated: neither has a consumer who wants the old result. |
| **Required tests** | Unit, argv level (`test_task_service.py`): the `project.is:` token; every refused project shape leaving `fake.calls` empty; an `rc.`-shaped name accepted but never a bare token; the reserved names refused only with `reserved=True`; an unchanged project not re-validated and a changed one refused; each status constant reaching argv; `all` excluding deleted and recurring; `include_done` as an alias, as a no-op, and as a conflict; `completed_since` implying `completed`; local-day comparison for due, scheduled and end, with one test running the clock at UTC+13 so the conversion is not a no-op; completed sorted by `end` descending; filter tags validated and bounded; `limit` slicing after the sort. HTTP (`test_tasks.py`, `test_gtd.py`): the 400/422 shapes, the exact project view, a project name with a space and an umlaut through the path, and a fuzz sweep asserting no poisoned value in any recorded argv. Container (`test_real_task.py`, `TestSearchFilters`): `project.is:` against the real prefix match, a space-and-umlaut name round trip, `status=waiting` as the binary's waiting, a real `end` with `completed_since`, `all` leaving out the deleted task and the recurring template, and a refused value never reaching the binary. |
| **Intended scope** | The project-name rules in `models.py`, `search_tasks` and its helpers, the exact `project_tasks`, `Task.end`, the query parameters and their MCP-visible descriptions, the three test tiers, the openapi snapshot, the skill's operation table, look-up section and weekly-review preparation (0.5.0), ADR 0038, and the filter paragraphs in `docs/security.md` and `docs/threat-model.md` (with the stale line references in §2 corrected). **Not** in scope: `q` and `tag` on the `/gtd` lists (next item), the project routes' own validation and the reserved names in `projects.py` (later item, with the status table), any counter or summary route, and any frontend change. |
| **Base revision** | `31abf78` |

## Behaviour change

- **`GET /tasks` filters.** `status` (`pending` default / `waiting` / `completed` / `all`),
  `project` (exact), `tag` (repeatable, AND, at most ten), `due_before`, `due_after`,
  `scheduled_before`, `completed_since` (all `YYYY-MM-DD`), `limit` (1..500). Status, project and
  tags become Taskwarrior filter tokens; the dates and the limit are applied in Python over the
  export, per local day off `_now()`. Completed tasks are sorted by `end` descending.
- **The project match is exact** (`project.is:`). `project:alpha` is Taskwarrior's hierarchical
  prefix match — verified on 3.5.0, it returns `alpha`, `alpha.sub` *and* `alphabet` — so
  `/gtd/projects/alpha` has been mixing in other projects' tasks. It no longer does.
- **`include_done=true` is now `status=all`**, which is
  `( status:pending or status:waiting or status:completed )`. It used to send **no filter at
  all**, so it also returned deleted tasks and the recurring parent template. `include_done=false`
  stays a no-op (the SPA sends it, and agents fill defaults); only `true` together with `status`
  is a 400.
- **Project names are validated** wherever one is written, filtered on or put into a path —
  `PROJECT_RE` in `models.py`. Spaces, umlauts, dots and semicolons stay legal; control
  characters, parentheses, quotes, backslash, `:`, `/ ? # %` and a leading or trailing space do
  not. On modify the name is checked only when it *differs* from the one the task already
  carries, so another live user's legacy project stays editable (the same rule kept tags usable
  in brief 0030). A read path is not exempt: `GET /gtd/projects/{name}` and `GET /tasks?project=`
  validate too, so a legacy name that fails the regex answers 400 there while `GET /gtd/projects`
  still lists it. The fallbacks are the unfiltered list and a rename; ADR 0038's Consequences
  record why refusing is right on those two paths (the name *is* the filter token, and an
  unencoded MCP path segment).
- **`Task.end`** is exposed, which is what `completed_since` filters and the completed sort uses.

## Pre-checks

- Container tier by hand (D25), the authoritative check for anything touching Taskwarrior
  semantics, against `/opt/homebrew/bin/task` **3.5.0**:
  `cd backend && TZ=UTC PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -m container tests/container`
  → **64 passed** (58 before; 6 new). CI's x86_64 run is the authoritative one.
- Full backend suite: 563 passed.
- Taskwarrior facts re-verified on 3.5.0 before the tests were written: `project:alpha` returns
  `alpha`, `alpha.sub`, `alphabet`; `project.is:alpha` returns `alpha` only; an unfiltered export
  returns the deleted task and a `"status":"recurring"` template while the `ALL` group returns
  neither; `project.is:Haus Umbau Büro` matches.
- Adversarial, each on a temporary edit that was reverted:
  - `project.is:` put back to `project:` (both call sites): 2 unit, 2 HTTP and 1 container
    test red.
  - The `ALL` group replaced by no filter at all: 3 unit, 1 HTTP and 1 container test red.
  - The project validation removed from `_build_args`: 18 unit tests red.
  - `_local_day` stripped of its zone conversion (the stored UTC day instead of the local
    one): 1 unit test red — `test_the_day_filters_use_the_servers_zone_not_utc`, which runs
    the one clock at UTC+13. Every other test runs at UTC, where the conversion is invisible,
    so before that test the local-day claim of ADR 0038 was pinned by nothing.
  - `project_is_new` forced to `True` (always validate on modify): the legacy-project test red,
    which is the live-user regression this rule exists to prevent.
  - Fuzz, asserted permanently rather than by hand (`test_no_refused_value_ever_reaches_the_binary`):
    `(`, `)`, ` or `, a newline, `rc.data.location=/tmp/x`, a leading `-`, a leading `+` and
    10 000 characters, across `project`, `tag`, `due_before` and `completed_since` — every one a
    400 or 422, never a 500, and never a token in any recorded argv.

## Where the plan was wrong

The implementation plan expected `project=rc.data.location=x` to be a 400 "because the regex
blocks `:`". It has no colon, and the name is accepted. It is also harmless: a project name is
never an argv token on its own — always the tail of `project:` or `project.is:` — so it cannot be
the `rc.`-prefixed token Taskwarrior reads as an override. The real data path is refused anyway,
by the `/` exclusion that exists for fastapi-mcp's unencoded path parameters. The test now says
that plainly instead of claiming a protection the regex does not provide.

## Skill

0.5.0. `references/conventions.md` names the real parameters in the operation table
(`status`, `project`, `tag`, `due_before`/`due_after`/`completed_since`, `limit`) instead of
"filtered by project or tag where the server allows it". `SKILL.md` "Look up" tells the model to
ask the list for what it needs — `status=completed` with `completed_since` for "what did I
finish", `due_before` for "what is overdue" — rather than fetching everything.
`references/weekly-review.md` drops the "only if the server can filter by completion date" caveat
and states the call. The permissions block in `references/setup.md` is unchanged: this item adds
no MCP tool.

## Counts

Unchanged: REST 33, MCP 22, route guards 32 (25 user / 4 admin / 3 open). No route is added or
removed and no handler is renamed, so `AGENTS.md` §5, `README.md`, `docs/threat-model.md` and
`rules/ledger.yaml` need no edit.
