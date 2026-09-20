# Change Impact Brief 0032 — The GTD lists mean what they say on Taskwarrior 3.5; `/gtd/tickler`

| Field | Value |
|---|---|
| **Requested outcome** | The GTD lists match GTD semantics on the real Taskwarrior 3.5: the inbox holds only tasks with no project and no tag; a task hidden by a future `wait` is in no visible list until the date passes, but stays in `/gtd/waiting` if it is a waiting-for, and keeps its project in `/gtd/projects`; a new `GET /gtd/tickler` lists the hidden tasks, soonest first. |
| **Owning unit** | `be/services` (`task_service.py`), `be/routers` (`gtd.py`), backend tests (`fake_task.py`, `conftest.py`), `integrations` (the skill), `ops` (snapshots), `rules` (route guards, counts), `docs` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 (Taskwarrior changes live in the service; a new endpoint is an MCP tool), §5 (public surfaces: REST and MCP counts) |
| **Governed by** | [ADR 0036](../adr/0036-list-semantics-against-taskwarrior-3-5.md) (list semantics against Taskwarrior 3.5, new), [ADR 0019](../adr/0019-the-taskwarrior-argv-boundary.md) (the argv boundary), [ADR 0035](../adr/0035-the-skill-lives-with-the-api-it-drives.md) (the skill moves with the API) |
| **Rule IDs introduced** | None. The route guard for `GET /gtd/tickler` is a new entry under the existing `RULE-SEC-001`. |
| **Entry points** | [`backend/app/services/task_service.py`](../../backend/app/services/task_service.py) `PENDING`, `HIDDEN`, `OPEN`, `gtd_list`, `project_tasks`, `project_names`, `_tag_filters`, `_now`; [`backend/app/routers/gtd.py`](../../backend/app/routers/gtd.py) `_tasks`, `tickler`; [`backend/tests/fake_task.py`](../../backend/tests/fake_task.py) `FakeTaskCLI` |
| **Affected public surfaces** | **REST (S1):** new `GET /gtd/tickler` (33 routes). Behaviour: `/gtd/inbox` no longer lists untagged project tasks; `/gtd/waiting` includes `+waiting` tasks with a future wait; `/gtd/projects` includes projects whose only open task is hidden. `/gtd/next`, `/gtd/someday`, `/gtd/projects/{name}` unchanged (visible tasks only; the project route is still Taskwarrior's prefix match until P1-5). **MCP (S2):** new tool `tickler_gtd_tickler_get` (33 tools); every existing name unchanged. **Claude skill** 0.3.1 → 0.4.0. |
| **Known dependents** | The web UI (inbox, waiting and project sidebar read these routes; no Tickler view is added); MCP and REST agents, including the runway skill. |
| **Uncertain / dynamic areas** | `BLIND-TASK-001` (what the binary does is known only through the container tier — which is why every claim of the fake is now pinned there), `BLIND-TEST-001` (routers are covered through the TestClient, not by import), `BLIND-MCP-001` (the index names tools by handler; the snapshot is authoritative). The container tier runs only in CI on x86_64 (`RISK-TEST-001`); it was run locally by hand for this change (below). |
| **Analogous implementations** | [Brief 0030](0030-tags-are-a-full-set.md) — a defect the fake agreed with, closed by pinning the fake's claim in the container tier; [Brief 0031](0031-empty-string-clears.md) — the rc 2 → 400 mapping the new refusals of the fake reuse. |
| **Delivery Pattern** | **Bug Fix** (inbox `-project`; waiting-fors and parked projects vanished), recorded in [`docs/operations.md`](../operations.md), plus **New Capability** (`GET /gtd/tickler`). |
| **Required tests** | Container, written first against the real binary (`TestListSemantics`): the inbox excludes an untagged project task (the defect); a future wait hides a task from inbox, next, someday and the project's tasks; a past wait shows it normally; waiting includes a future-wait `+waiting` task; a project whose only task is hidden stays listed; the tickler lists hidden tasks by wait across month and year boundaries, not by urgency, with `status` still `"pending"`; a future `scheduled` hides nothing; `recur` without `due` is a `ValueError` and 400. Container, the fake's claims (`TestWhatTheFakeClaims`): hidden is `status:waiting` / `+WAITING` yet exports "pending", and `OPEN` sees both; `project:X` prefix, `project.is:X` exact, `project:` none; `-foo` and `-project` are tag exclusions; `status:completed` and the `ALL` group; `end` on done and delete; the three date forms for due, scheduled, wait and until; a bad priority is `TaskwarriorRejected`; `+1abc` is not a tag. Unit (`test_gtd.py`): the same list semantics over HTTP with the fake; the tickler order; a task moving from the tickler to the inbox when the fake's clock passes its wait; `tickler` and `projects/{name}` in the auth and error-mapping lists. Unit (`test_task_service.py`): the exact filter of each view; the inbox never sends `-project`; `OPEN` is not mutated; filter tags AND-ed, validated, at most ten; `project_names` reads `OPEN`; `_now` is the fake's clock; the fake's refusals change nothing. Unit (`test_tasks.py`): dates come back in basic format; `recur` needs `due` (400). |
| **Intended scope** | Service list functions and constants, the gtd router and its new route, the route-guard entry, the fake's contract (plan §1.5) and the fixture clock, tests, snapshots, skill text and version, counts, `operations.md`, `task-interface.md`, ADR 0036. **Not** in scope: exact project match and project-name validation (P1-5), `tag` on the HTTP lists (P1-5a), the MCP allowlist (P0-4), `GET /tasks` filters (P1-5), a Tickler view in the web UI (not required; would change `spa.json`). |
| **Base revision** | `fcc7c29` |

## Behaviour change

- **Inbox (D1).** `status:pending -TAGGED -project` → `status:pending -TAGGED project:`. On 3.5 `-project`
  means "not tagged `project`", so every untagged task of a project was in the inbox. `project:` with an
  empty value is "has no project".
- **Virtual waiting (D9).** A task with a future `wait` does not match `status:pending`; it matches
  `status:waiting` and `+WAITING`, and exports `"status": "pending"`. The service now names three filter
  constants, `PENDING` (visible), `HIDDEN` (future wait) and `OPEN` (both), and builds every list from
  them in `gtd_list`. Waiting and the project list read `OPEN`; inbox, next and someday read `PENDING`.
- **`GET /gtd/tickler`.** `HIDDEN`, sorted by the stored `wait` string (Taskwarrior's single UTC basic
  format, so string order is date order), not by urgency. Declared before `/gtd/projects/{name}`.
  `Task.status` stays Taskwarrior's raw value.
- **Filter tags.** `gtd_list` and `project_tasks` accept `tags` (validated with `TAG_RE`, AND-ed, at most
  ten). Not exposed over HTTP until P1-5a.
- **The fake (plan §1.5).** A clock (`FakeTaskCLI(now=...)`, 2026-09-19T10:00:00Z by default, handed to
  `task_service._now` by the fixture); dates parsed in three forms and stored as UTC basic format, anything
  else `TaskwarriorRejected` (this is why two existing tests now expect `20260901T000000Z` and the old
  `test_date_fields_are_unvalidated` became `test_date_fields_are_validated_by_taskwarrior_not_by_us`);
  virtual waiting; `project:` / `project:X` / `project.is:X`; `-word` as a tag exclusion (its old `-project`
  branch, which is what hid the inbox defect, is gone); `status:completed`; the `OPEN` and `ALL` groups;
  `end` on done and delete; refusals for a bad priority and `recur` without `due` that change nothing, and
  a `FakeTaskError` for a `+tag` the binary would read as text. Unknown filters still raise.

## Pre-checks

- Container tests written first; against the unchanged service 8 of the new ones failed (inbox, hidden
  lists, waiting, parked project, tickler 404, scheduled via the inbox, `OPEN` missing).
- Manual container run (D25), `TZ=UTC`, against `/opt/homebrew/bin/task` 3.5.0 on arm64:
  `.venv/bin/python -m pytest -p no:cacheprovider -m container tests/container` → **58 passed** (40 before,
  18 new). Unit tier: 404 passed (369 before).
- Adversarial: with the inbox filter set back to `-project`, 3 unit and 2 container tests fail; with
  waiting reading `PENDING` instead of `OPEN`, 2 more unit tests and 1 more container test fail.
- A hidden task whose wait passes between two calls: moves from the tickler to the inbox with no write
  (unit, the fake's clock moved forward).

## Skill

0.4.0. `conventions.md`: the operation table names `gtd tickler (gtd/tickler)` for hidden ticklers
without "if present" (`RULE-SURF-003` now checks it); "Tickler" says it is listed by `gtd/tickler` and back
in the inbox after the date; "Waiting for" keeps "no `wait`" with the reason that `scheduled` carries the
follow-up and `wait` would hide the task from the project list and the daily review; "Recurring" says the
server answers 400 without `due`. `daily-review.md`: no separate inbox call for hidden ticklers; a passed
`wait` is shown normally. `weekly-review.md`: "tickler" without "(if available)". `README.md`: tickler
dropped from the "if present" list; the `wait` semantics stated.

## Counts

REST 32 → 33, MCP 32 → 33, route guards 31 → 32 (25 user / 4 admin / 3 open): `AGENTS.md` §5,
`README.md`, `docs/threat-model.md`, `rules/ledger.yaml` (`RISK-MCP-002`, `RISK-SEC-005`).
`docs/plan/STATUS.md` records the 32 tools a production session listed on 2026-09-18; that is a dated
observation and stays as written.
