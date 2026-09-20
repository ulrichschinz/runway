# Change Impact Brief 0031 — An empty string clears a field; Taskwarrior's refusals are 400

| Field | Value |
|---|---|
| **Requested outcome** | One clear semantic for every scalar task field, documented where MCP clients see it: on `PUT /tasks/{uuid}` an empty string clears project, priority, due, scheduled, wait, until and recur; on create it means "not given". The web UI can actually clear a field. Input Taskwarrior refuses (exit code 2) is a 400 with its reason, not a 500. Modifying one instance of a recurring task never waits on a confirmation prompt. |
| **Owning unit** | `be/adapters/task` (`task_runner.py`), `be/services` (`task_service.py`), `be/leaves` (`models.py`), `be/routers` (`gtd.py`, `inbox.py`), `fe/shared` (`taskPayload.js`), `fe/tasks` (`TaskModal.vue`), `integrations` (the skill), `ops` (snapshots), `docs` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 (Taskwarrior changes live in the service; frontend rules in `fe/shared`), §5 (public surfaces); [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (tests cover the pure logic) |
| **Governed by** | [ADR 0019](../adr/0019-the-taskwarrior-argv-boundary.md) (the argv boundary and `_run` as the one door), [ADR 0007](../adr/0007-frontend-test-scope.md) (frontend logic lives in `shared/` and is tested there), [ADR 0035](../adr/0035-the-skill-lives-with-the-api-it-drives.md) (the skill moves with the API) |
| **Rule IDs introduced** | None. |
| **Entry points** | [`backend/app/services/task_runner.py`](../../backend/app/services/task_runner.py) `_run`, `TaskwarriorRejected`, `_OWN_OVERRIDES`; [`backend/app/services/task_service.py`](../../backend/app/services/task_service.py) `_build_args`; [`backend/app/models.py`](../../backend/app/models.py) `TaskCreate`, `TaskModify`; [`backend/app/routers/gtd.py`](../../backend/app/routers/gtd.py) `_tasks`, `projects`; [`backend/app/routers/inbox.py`](../../backend/app/routers/inbox.py) `webhook_inbox`; [`frontend/src/shared/taskPayload.js`](../../frontend/src/shared/taskPayload.js) `buildTaskPayload` |
| **Affected public surfaces** | **REST (S1):** every `TaskCreate` / `TaskModify` field gains a description (OpenAPI only, no shape change). Behaviour: `priority: ""` on modify clears instead of 400; `""` on create is "not given" for every field (`priority: ""` was 400, `project: ""` reached Taskwarrior); exit code 2 is 400 on every task route, and the `/gtd/*` routes and `POST /inbox` map `ValueError` to 400 (were 500). MCP tool names are unchanged; the MCP snapshot is byte-identical, the tool input schemas carry the new descriptions. **Claude skill** 0.3.0 → 0.3.1. |
| **Known dependents** | The web UI (`TaskModal.vue`, now through `buildTaskPayload`); MCP and REST agents, including the runway skill; the inbox webhook. |
| **Uncertain / dynamic areas** | `BLIND-TASK-001` (what the binary does is known only through the container tier), `BLIND-TEST-001` (router coverage is not import-derived; `gtd.py` and `inbox.py` are covered through the TestClient). The container tier runs only in CI on x86_64 (`RISK-TEST-001`); it was run locally by hand for this change (below). |
| **Analogous implementations** | [Brief 0030](0030-tags-are-a-full-set.md) — the modify path and the `mode` split of `_build_args` this change folds the clear semantic into; [Brief 0014](0014-taskwarrior-boundary.md) — the `(mods, text)` split. |
| **Delivery Pattern** | **Bug Fix** (a priority could not be cleared; the UI could not clear anything; refusals were 500), recorded in [`docs/operations.md`](../operations.md). |
| **Required tests** | Unit, argv level (`test_task_service.py`): per field, modify `""` → exactly `field:` (7), create `""` → no token (7); a cleared priority is gone; a non-empty invalid priority still 400. Runner (`test_task_runner.py`, new, `subprocess.run` monkeypatched): `stdin=subprocess.DEVNULL`; `rc.recurrence.confirmation=no` precedes the caller args; rc 0/1 return stdout; rc 2 → `TaskwarriorRejected` (a `ValueError`) carrying stderr, with a fallback message; rc 2 with a store fault's stderr (six observed forms) → `RuntimeError` with a generic message, no path, stderr logged; rc 3 stays `RuntimeError`. HTTP: `POST` with `priority: ""` is 201 with no priority (`""` removed from the rejected list); `PUT` `""` clears project, priority, due, wait; `null` leaves a field unchanged; a rejection on create and modify is 400 with Taskwarrior's text; `/gtd/next`, `/gtd/projects`, `/gtd/projects/{name}` 400 on a rejection and 500 on a `RuntimeError`; `POST /inbox` with priority `X` is 400, a rejection 400, a binary failure 500. Frontend (`taskPayload.test.js`): create sends `null`, never `""`; edit sends `""` for an emptied field and for a deselected priority, omits unchanged fields, always sends full `tags` / `depends`. Container (`TestEmptyStringClears`, `TestRecurringInstances`): each of project, priority, due, scheduled, wait, until cleared for real with the others kept; create with all `""` sets nothing; `recur: ""` on a plain task is 200; `recur: ""` / `due: ""` on a recurring instance raise `ValueError`; `due: notadate` raises `TaskwarriorRejected` whose message names the value and no path, and is 400 over HTTP; `tags_add` on one instance of a weekly task is 200 in under 2 s, the parent and every other instance unchanged. |
| **Intended scope** | Runner, service, models, two routers, the new frontend helper and its wiring, tests, snapshots, skill text and version, `security.md`, `operations.md`. **Not** in scope: wait semantics, the inbox filter and the fake's date parsing (P0-3), the MCP allowlist (P0-4), descriptions on routes other than the task models (P1-9). `docs/task-interface.md` does not describe `_run`'s exit codes, so it is unchanged. |
| **Base revision** | `09653bd` |

## Behaviour change

- **Empty string (D7).** `_build_args` treats project, priority, due, scheduled, wait, until and recur
  alike: on modify `""` emits `field:`, which Taskwarrior reads as "remove the attribute"; on create `""`
  is skipped. `null` or an omitted field is unchanged, as before. Priority is validated only when it is
  non-empty, so clearing it no longer fails as "Invalid priority". The two recur special cases are folded
  into the loop.
- **Recurring tasks keep `recur` and `due`.** Taskwarrior 3.5.0 refuses to strip either from a recurring
  task ("You cannot remove the recurrence from a recurring task.", rc 2); that is now a 400 with that
  text, and the field descriptions say so.
- **Exit code 2 → 400 (D6).** `_run` raises `TaskwarriorRejected(ValueError)` with Taskwarrior's stderr
  on rc 2; any other code outside 0/1 stays `RuntimeError` (500). `tasks.py` already mapped `ValueError`
  to 400; `gtd.py` mapped it to 500 and now maps it to 400; `inbox.py` had no mapping and now has the
  same one. The stderr of the refusals checked (bad date, bad priority, recur without due, stripping
  recur or due) names the value and nothing about the server — no data path — so it is passed through
  as the detail. Exit code 2 is Taskwarrior's generic error code, though: a missing rc file, a data
  directory it cannot create and every sqlite fault (unable to open, read-only, corrupt, locked — "Error
  code N") exit 2 as well, observed on 3.5.0. When the stderr matches `_SYSTEM_FAULT`, `_run` logs it and
  raises `RuntimeError` with a generic message instead: 500, and no data path reaches the caller.
- **No prompt can wait.** `_run` passes `stdin=subprocess.DEVNULL`, and `rc.recurrence.confirmation=no`
  joins its own overrides. Modifying one instance of a recurring task otherwise asks "modify all pending
  recurrences? (yes/no)"; with a terminal on stdin (`make dev`, a hand-run pytest) it waited until the
  10 s timeout and returned 500. With the override only the instance changes (verified on 3.5.0). The
  skill swaps tags on recurring tasks in every daily review.
- **Field descriptions.** Every `TaskCreate` / `TaskModify` field says what it means and accepts: date
  formats (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`, server-local), "an empty string clears it" on modify,
  "a recurring task cannot lose it (400)" on due and recur, tags without `+` and contexts as `@name`,
  `tags` as the complete set versus the deltas, and `due` as a hard deadline, `scheduled` as earliest
  start or follow-up, `wait` as hiding. Generic on purpose (`RISK-MCP-002`).
- **Web UI.** The form sent `null` for every empty field, which the API reads as "unchanged", so no
  field could be cleared. `buildTaskPayload(form, original)` now builds the body: on create an empty
  field is `null`; on edit an emptied field is `""` and an unchanged one is omitted, so an untouched
  date is no longer resent (which also stops a due time from being truncated to midnight on every
  save); `tags` and `depends` are always the full arrays.

## Pre-checks

- Manual container run (D25), `TZ=UTC`, against `/opt/homebrew/bin/task` 3.5.0 on arm64:
  `.venv/bin/python -m pytest -p no:cacheprovider -m container tests/container` → **40 passed**
  (27 before, 13 new).
- The unit tests were written first; 20 failed against the old runner, service and routers.
- Adversarial: with `rc.recurrence.confirmation=no` and `stdin=DEVNULL` both removed, the recurring
  instance container test still passes under pytest, because pytest's stdin is not a terminal, so the
  prompt cannot wait. The container test pins the outcome (only the instance changes, quickly);
  the two guards themselves are pinned by `test_task_runner.py`.

## Skill

0.3.1, `references/conventions.md` only. "## Dates": an empty string clears project, priority, due,
scheduled, wait, until and recur; a recurring task keeps its recur and due. "## Priority": new tasks have
no priority (the old text claimed the server defaults to `M`; `default.priority=M` in the taskrc has no
effect on 3.5.0); clear it with an empty string.
