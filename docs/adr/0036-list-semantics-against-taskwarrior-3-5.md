# ADR 0036 — List semantics against Taskwarrior 3.5

- **Date:** 2026-09-19
- **Status:** Accepted
- **Scope:** `be/services`, `be/routers`, `be/adapters/task`, backend tests, `integrations`

## Context

The GTD lists (`/gtd/inbox`, `next`, `waiting`, `someday`, `projects`, `projects/{name}`) were written as
Taskwarrior filters and tested against a fake that agreed with them. Run against Taskwarrior 3.5.0
(observed 2026-09-19, the version the image ships), two of their assumptions were wrong:

- **`-project` is not "has no project".** It is a tag exclusion: "not tagged `project`". The inbox
  filter `status:pending -TAGGED -project` therefore listed every untagged task of every project.
  "No project" is `project:` with an empty value.
- **A future `wait` changes the status a filter sees.** Such a task no longer matches `status:pending`;
  it matches `status:waiting` and the virtual tag `+WAITING` — and its export still says
  `"status": "pending"`. Once the date passes it is `status:pending` again. A future `scheduled` hides
  nothing. Every list filtered on `status:pending`, so a `+waiting` task with a future wait vanished
  from `/gtd/waiting`, a project whose only task was parked vanished from `/gtd/projects`, and no
  route listed parked tasks at all.

The fake had implemented `-project` as "no project" and did not model `wait`, so the unit tier
confirmed the code rather than the product.

## Decision 1 — three filter constants, never interpolated

`task_service` holds `PENDING = ["status:pending"]` (visible), `HIDDEN = ["status:waiting"]` (a future
wait) and `OPEN = ["(", "status:pending", "or", "status:waiting", ")"]` (both). Every list is one of
them plus fixed tokens, in `gtd_list(username, view, tags=None)`:

| view | filter |
|---|---|
| inbox | `PENDING` `-TAGGED` `project:` |
| next | `PENDING` `+next` |
| waiting | `OPEN` `+waiting` |
| someday | `PENDING` `+someday` |
| tickler | `HIDDEN`, sorted by `wait` ascending |

`project_names` reads `OPEN`, so a parked project stays listed. `project_tasks` stays `PENDING` plus the
(prefix) `project:` filter; exact match comes with name validation in P1-5. Nothing a caller
sends reaches these positions; the `tags` parameter is validated with `TAG_RE`, at most ten, and is not
exposed over HTTP yet.

**Waiting reads `OPEN`, next and someday do not.** A waiting-for is something another person owes the
user; the weekly review needs all of them, including the ones deliberately parked. A parked next action
is not actionable today, which is what a next list is for.

**`GET /gtd/tickler`** is new: the hidden tasks, soonest first. The sort is a string sort of the stored
`wait`, which is correct because Taskwarrior exports every date in one UTC basic format
(`20300101T000000Z`). It is declared before `/gtd/projects/{name}`.

## Decision 2 — `status` stays Taskwarrior's

A hidden task's `Task.status` is `"pending"`, as the export says. The route it came from carries the
semantics (`/gtd/tickler` lists only hidden ones). Rewriting the field to `"waiting"` would invent a
value the binary never stores and that no filter written against Taskwarrior's docs would expect back.

## Decision 3 — the fake models this, and every claim is pinned

`tests/fake_task.py` gains the contract the lists depend on: a clock (`FakeTaskCLI(now=...)`, default
2026-09-19T10:00:00Z; the `fake_task` fixture hands the same instant to `task_service._now`), dates in
three forms stored as UTC basic format, virtual waiting, `project:` / `project:X` (prefix) /
`project.is:X` (exact), `-word` as a generic tag exclusion, `status:completed`, the `OPEN` and `ALL`
token groups, `end` set on done and delete, and the refusals below. A filter it does not know still
raises. Each claim is pinned against the binary in `tests/container` (`TestWhatTheFakeClaims`,
`TestListSemantics`) — a fake that asserts its own behaviour is how the inbox defect survived.

`task_service._now()` is the one clock (server local time, D10). Nothing in the service reads it yet; the
day-based filters and the summary (P1-5, P1-6) do.

## Decision 4 — exit code 2 is a contract, and so is the recurrence prompt

Recorded here because the lists and the skill rely on both (implemented in brief 0031):

- Taskwarrior exits 2 when it refuses input — a bad date, a priority outside H/M/L, `recur` without
  `due`, stripping `recur` or `due` from a recurring task. `_run` raises `TaskwarriorRejected`, a
  `ValueError`, and every router maps it to 400. Exit code 2 whose stderr shows a store fault stays a
  `RuntimeError` (500) with a generic message. The fake raises the same class for the same inputs and
  changes nothing when it does.
- `_run` passes `stdin=subprocess.DEVNULL` and the own override `rc.recurrence.confirmation=no`:
  modifying one instance of a recurring task changes that instance only and never waits on
  "modify all pending recurrences? (yes/no)".

## Consequences

- The inbox no longer shows project tasks; waiting-fors and parked projects no longer vanish.
- One new route and MCP tool, `tickler_gtd_tickler_get` (33 routes, 33 tools).
- The skill (0.4.0) uses `gtd/tickler` without a fallback, and no longer tells the model to call the
  inbox separately to be sure about hidden ticklers.
- A task whose `wait` passes between two calls moves from the tickler back to its list with no write;
  the unit tier pins that by moving the fake's clock.

## Alternatives considered

- **Derive hidden-ness in Python** from `wait > now` over one `status:pending or status:waiting`
  export. It would work, but it re-implements a rule the binary already applies, in a second place, and
  depends on the clocks agreeing. The filter constants let Taskwarrior decide.
- **Report hidden tasks as `status: "waiting"`.** Rejected (Decision 2).
