# Change Impact Brief 0038 — One call that says what a review has to look at

| Field | Value |
|---|---|
| **Requested outcome** | A review, and later a session hook, needs to know what is worth looking at before it fetches anything: how much is in the inbox and how old it is, what is overdue or due today, how many next, waiting, someday and parked tasks there are, which follow-ups fell due, what is in no list at all, and which active projects have stalled. Today that costs a full pending fetch and a project list on every daily review, and the agent counts the titles itself — which means every title reaches the transcript, in a repository whose conversations may be logged. `GET /gtd/summary` answers all of it in one call, in numbers, and names nothing but stalled projects. |
| **Owning unit** | `be/routers` (`gtd.py`), `be/services` (`task_service.py`), `be/leaves` (`models.py`), backend tests (unit and container), `rules` (route guards), `integrations` (the skill), `ops` (snapshots), `docs` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 (anything touching Taskwarrior goes through the task service, which is where validation lives; the router reads its own database rows), §4 (`be/routers` → `be/services` → `be/leaves`; no new import edge, no new fan-in), §5 (REST and MCP are externally consumed, so both snapshots move and the counts in the contract move with them), §7 (`RULE-SEC-001`: a new route is a new line in `rules/route-guards.toml`) |
| **Governed by** | No ADR. The counter definitions and the fill-later shape are recorded here; the "stalled" definition is revisited, and gets a decision record of its own, in the later item that makes project status storable — it is the only part of this open to a second opinion. [ADR 0036](../adr/0036-list-semantics-against-taskwarrior-3-5.md) is where virtual waiting and the single clock come from, and [ADR 0038](../adr/0038-validated-filters-and-exact-project-match.md) is where the day filters this reuses were written. |
| **Rule IDs introduced** | None. No gate rule changes; no ledger entry is added or reworded beyond the two sentences that state counts. |
| **Entry points** | [`backend/app/routers/gtd.py`](../../backend/app/routers/gtd.py) `summary`, [`backend/app/services/task_service.py`](../../backend/app/services/task_service.py) `summarize`, `project_rollup`, `_open_raw`, `_is_hidden`, [`backend/app/models.py`](../../backend/app/models.py) `GtdSummary`, `LastReview` |
| **Affected public surfaces** | **REST (S1):** one new route, `GET /gtd/summary`, with the same optional repeatable `tag` the other GTD lists take. Additive; no existing route, parameter or response moves. **MCP (S2):** one new tool, `summary_gtd_summary_get` — the `gtd` tag is on the allowlist (ADR 0037), so it is exposed automatically. 22 → 23; every existing name and summary is byte-identical. **Route guards:** 32 → 33, `GET /gtd/summary` = `user`. **Counts:** REST 33 → 34. **Claude skill** 0.6.0 → 0.7.0. No database object, SPA route or storage key changes. |
| **Known dependents** | The runway skill, which this commit rewrites to use it, and any MCP client that discovers tools at connect time. Nothing existing calls it, so nothing existing breaks. The SPA does not call it and needs no change. `routers/inbox.py` and `routers/tasks.py` import the same service module and are untouched. |
| **Uncertain / dynamic areas** | `BLIND-TEST-001` (the routers are exercised through the ASGI client, so no import-derived test edge exists for `routers/gtd.py`; the coverage is real and is in `test_gtd.py`). `RISK-TEST-001` (the container tier cannot run on arm64 in the local gate; run by hand, see Pre-checks, and authoritatively in CI). `RISK-MCP-001` (the index derives one tool per route and is therefore over-inclusive since the allowlist; the snapshot is the count source, `RULE-DOC-001`). `RISK-OPS-002` (the counters read the server's zone, `TZ=Europe/Berlin` since `cb37327`, and nothing here can see the deploy host). |
| **Analogous implementations** | [Brief 0034](0034-filters-for-the-task-list.md) and [Brief 0035](0035-scoped-lists-and-a-text-search.md) — the same validate-then-export seam, `_tag_filters`, and the rule that date questions are answered in Python rather than in Taskwarrior's grammar. [Brief 0037](0037-the-container-clock.md) — `_now()` and `_local_day()`, the clock every counter below asks. [Brief 0032](0032-list-semantics.md) — what "open", "visible" and "hidden" mean on 3.5, which is what each counter is a slice of. |
| **Delivery Pattern** | **New Capability.** A new read-only route, guard-declared, snapshot-covered and tested in both tiers; nothing existing changes shape, so no migration is owed. It carries one Security-pattern obligation of its own, inherited from brief 0035: `tag` becomes a `+tag` filter token, a position `--` cannot protect, so it goes through the same `_tag_filters` validation and the same 400. And one privacy obligation that is this route's own: the response must never carry a task description, and under a scope must not name another area's project. Both are asserted, not argued. |
| **Required tests** | Unit (`test_gtd.py`): `TestSummary` — every counter at once on an eighteen-task fixture built one task per case, the whole response asserted as a dict so a counter cannot be added or renamed silently; five of those tasks are parked twins of visible ones (a `waiting` with a passed follow-up, a `next`, a `someday`, one overdue and one due today), so the visible-versus-open line that defines six counters cannot be moved without a red test; that no fixture description appears anywhere in the response body; that a task due today is not also overdue; the day boundary at 23:59 and 00:01 on the same task, with the clock the only thing that moves; 401 without a credential. `TestSummaryProjects` — an explicit project with no task at all is stalled, and a project whose only task is waiting, parked or a `next` action is not. `TestSummaryScoping` — `tag` narrows every counter (`hidden` included) while the inbox stays unscoped, two tags AND, a refused tag is a 400, a project the scope names is judged by all of its open tasks and not only by the scoped ones, and the privacy case: neither an explicit `Privat X` without a task nor a `Privat Y` whose only task is out of scope appears in a scoped response or is counted, while both are findings in the unscoped one. Container (`test_real_task.py`, `TestTheSummaryCounters`) — the two things the fake cannot witness: that the real binary hands back a task whose `wait` passed an hour ago as visible and still carrying the `wait` the "returned today" counter reads, and that a bare `YYYY-MM-DD` due date lands on the day the counters then call today. |
| **Intended scope** | The `GET /gtd/summary` route, the `GtdSummary` and `LastReview` models, `summarize`, `project_rollup`, `_open_raw` and `_is_hidden` in the task service, the guard declaration, both test tiers, the two snapshots, the skill's daily-review gather step, its operation table, weekly-review prepare line, guardrail, hook note and permissions block (0.7.0), and the sentences that state a count. One behaviour-preserving edit comes with it: the router's error mapping helper became generic in its result type, because the summary is counters rather than a list of tasks, and `projects` uses it instead of its own copy of the same five lines. **Not** in scope: review timestamps (`last_review` is the shape, filled with nulls — P1-7), project status and the on-hold case (every project is active here — P1-8), the `/gtd/projects/overview` route (P1-8), the SessionStart hook that will consume this over REST (C-5), and any frontend change. |
| **Base revision** | `cb37327` |

## Behaviour change

Nothing that exists changes. One route is added, and what it means is the whole of the change:

- **One export, then Python.** `_open_raw` runs a single `OPEN` export — pending plus
  future-wait, which is everything the user still owns and has not finished — and every counter
  is a slice of that one list. A counter per list would be a dozen subprocesses per summary, and
  they would not even agree with each other: each would see the store at its own instant. The
  filter is the module constant; nothing a caller sends is interpolated into it.
- **The counters, precisely.** *Visible* means not hidden by a future `wait`; *open* includes
  hidden. `inbox` = visible, no project, no tags. `overdue` = open, `due` day before today;
  `due_today` = open, `due` day today — strictly disjoint, so a task due today is counted once.
  `next` = visible `+next`; `someday` = visible `+someday`; `waiting` = open `+waiting`, hidden
  ones included, because a delegated thing parked in the tickler is still delegated.
  `waiting_followup_due` = `+waiting` whose `scheduled` day is today or earlier. `hidden` = a
  `wait` still in the future; `tickler_returned_today` = a `wait` that passed *today*.
  `scheduled_passed` = visible, not `+waiting`, `scheduled` today or earlier — the daily
  review's "could have started", with the waiting-fors held back for their own section.
  `unclarified` = visible, no project, has tags, and none of `next`/`waiting`/`someday`: in no
  GTD list at all.
- **"Stalled" is the skill's definition, not the narrower one** (D14): an *active* project with
  no `next` action, nothing `waiting` and nothing parked in the tickler. A project waiting on
  someone, or deliberately parked, has a live next step — it is just not the user's. An
  explicitly created project with no open task at all *is* stalled, which is the case the
  change order's "no pending `+next` task" would have missed entirely. The skill's own text
  (`conventions.md`, `daily-review.md`) still says "no next and nothing waiting"; it is brought
  fully in line by the later item that makes "active" storable and records the definition.
- **`tag` narrows every counter except the inbox.** That exception is deliberate and is the
  reason a scoped repository can use this at all: an inbox item carries no tags by definition,
  so a scoped inbox count would always be zero and would hide the one thing GTD asks about
  first. Everything else is narrowed, including which projects are even considered for
  "stalled" — but *only* which ones are considered. A project the scope names is then judged
  by all of its open tasks, because "has a next action" is a fact about the project, and
  capture in a scoped repository stays untagged: judging by the scoped tasks alone would
  report a project as stalled whose next action merely carries no scope tag, and section 5 of
  the daily review hands that name to the user with no further call to check it against.
- **The privacy property.** The response carries counters, one capture timestamp and the names
  of stalled projects — no description, ever. Under a scope it goes further: a project with no
  open task carrying the scope tags is dropped *before* the stalled test, whether it is an
  explicit row with no task at all or a project whose whole backlog belongs to another area, so
  another area's project name never reaches a logged transcript. This is what makes the route
  printable from a shell hook (C-5) and what the skill's "report the inbox as a count" rule has
  been waiting for.
- **The shape is final; two values are not.** `last_review` is `{daily: null, weekly:
  null}` until P1-7 records reviews, and every project counts as `active` until P1-8 can store
  a status. Later commits change those values, never the shape — which is why `statuses` is
  already a name→status mapping the router fills with `"active"` rather than a list of names.

## Pre-checks

- Container tier by hand (D25), the authoritative local check for anything touching Taskwarrior
  semantics, against `/opt/homebrew/bin/task` **3.5.0**:
  `cd backend && TZ=UTC PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -m container tests/container`
  → **73 passed** (71 before; 2 new). CI's x86_64 run is the authoritative one.
- Unit tier: **546 passed** (528 before; 18 new). No existing test moves.
- `./run surfaces` reported drift in both S1 and S2 before the update and matches after it;
  `mcp-tools.json` gains exactly one entry and its `count` goes 22 → 23, which is what
  `RULE-DOC-001` reads (ADR 0037).
- Adversarial, each a temporary edit to the service that was reverted afterwards
  (`scratchpad/adversarial.log`):
  - **The scope stops dropping explicit projects** (`names` built from the rows under a tag as
    well): `test_a_private_project_is_neither_named_nor_counted_under_a_scope` red — the
    private project's name appears in a scoped response, which is the leak the rule exists to
    prevent.
  - **The inbox counts hidden tasks** (`raw` instead of `visible`): `test_every_counter` red.
    A tickler item is inbox-shaped — no project, no tags — so without the visibility filter the
    inbox would count everything parked for later, and the review would chase items the user
    deliberately postponed.
  - **`overdue` uses `<=` instead of `<`**: two tests red, including the midnight boundary one.
    This is the double-count the strict boundary exists to prevent.
  - **`hidden` dropped from the stalled test**: `test_a_project_whose_only_task_is_parked_is_not_stalled`
    red — the D14 difference from the change order's narrower definition, made executable.
  - **Each of the six open/visible counters swapped to the other side** (`waiting`, `next`,
    `someday`, `overdue`, `due_today`, `waiting_followup_due`), and `hidden` widened to the
    unscoped export: seven separate edits, each one red in `test_every_counter` or in
    `test_the_hidden_counter_is_narrowed_too`. The counters are pinned by the fixture, not
    only by the prose above.
  - **The stalled verdict judged by the scoped tasks** (`project_rollup(scoped)` for the test
    as well as for the names): `test_a_project_named_by_the_scope_is_judged_by_all_of_its_tasks`
    red — the false "stalled" a scoped repository would otherwise report every day.
- Not made executable, and deliberately so: that the *deployed* server's zone is Berlin. Nothing
  in CI can see the host (`RISK-OPS-002`); `today` and every day counter follow `TZ`, and the
  proof is brief 0037's container tier plus a production read after the next deploy.

## Skill

0.7.0. `references/daily-review.md` §1 is rewritten around the route: the summary is called
first, it is the entry path, and **a list is fetched only when its counter is above zero**. A
table maps each of the six sections of the review screen to its counter and to the one call
that section may make — including the concession that section 4 ("in no list") is the single
permitted full pending fetch, and only when `unclarified` says there is something to find. The
inbox row states the rule the privacy property now supports: report count and age, and fetch
titles only when there are five or fewer *and* the repository is not scoped. The overdue row
says the one place where a counter and its call do not have to agree: `overdue` and `due_today`
are open counts and the list call returns the visible tasks, so a remainder is sitting in the
tickler rather than missing.
`references/conventions.md` names the route in the operation table (dropping the "if present"
exemption, which turns the `RULE-SURF-003` check on for it) and stops hedging in "Scoping".
`references/weekly-review.md` drops "(if available)" from its prepare list.
`SKILL.md`'s last guardrail stops saying "prefer the summary where it exists" and says what to
do: use the summary and the filter parameters, never fetch everything to count.
`references/setup.md` records why the reminder hook will call `GET /api/gtd/summary` with `curl`
rather than the MCP tool — a hook is a shell command — and that the summary carries no titles,
so it is safe in a logged repository; the hook itself arrives in C-5. The permissions block
gains `mcp__runway__summary_gtd_summary_get` in `allow`: it is a read, and a review that asks
permission to count is a review nobody runs.

## Counts

REST 33 → **34**, MCP tools 22 → **23**, route guards 32 → **33** (26 `user` / 4 `admin` /
3 `open`). Updated in `AGENTS.md` §5, `README.md` ("the full list of all 23"), the route
breakdown and the schema-versus-declaration paragraph in `docs/threat-model.md` §1, and the two
sentences in `rules/ledger.yaml` that state them (`RISK-MCP-002`, `RISK-SEC-005`).
`docs/plan/STATUS.md:15` is a dated record of what production served in September and is left
as it stands.
