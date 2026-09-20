# ADR 0038 — Filter values are validated; the project match is exact

- **Date:** 2026-09-20
- **Status:** Accepted
- **Scope:** `be/leaves` (`models.py`), `be/services` (`task_service.py`), `be/routers` (`tasks.py`), backend tests, docs
- **Addendum to:** [ADR 0019](0019-the-taskwarrior-argv-boundary.md) (the argv boundary), [ADR 0036](0036-list-semantics-against-taskwarrior-3-5.md) (what the status filters mean)

## Context

`GET /tasks` had one parameter, `include_done`, and no filters. Every question narrower than
"all pending tasks" — what is overdue, what did I finish this week, what belongs to this
project — was answered by fetching the whole list and filtering it in the client. For the
skill that means the full pending set, with every description, in the transcript, on every
review. For the SPA it means the same payload on every context refresh.

Adding filters moves caller-supplied values into the two argv positions `--` cannot protect:
filters and modifiers. Both must stay parseable, so they cannot sit behind the separator, and
until now the only thing standing there was `reject_structural_tokens`, which knows exactly one
shape (`^rc\.`). The project name was already in that position through `/gtd/projects/{name}`
and `project:` on create, and it was validated nowhere.

Two further facts, verified against Taskwarrior 3.5.0 on 2026-09-20:

- `project:alpha` is a **hierarchical prefix match**. It returns `alpha`, `alpha.sub` *and*
  `alphabet`. `/gtd/projects/alpha` has been answering with other projects' tasks all along.
- An **unfiltered export** — which is what `include_done=true` sent — also returns deleted
  tasks and the recurring parent template (`"status": "recurring"`, a row nobody does).

## Decision 1 — every filter value is shaped before it becomes a token

Each value has one regex, in one place, and validation runs **before** anything is exported, so
a refused call never invokes the binary at all.

| Value | Rule | Where |
|---|---|---|
| project name | `PROJECT_RE` | `app/models.py` |
| filter tag | `TAG_RE`, ≤ 10 tags, ≤ 100 characters each | `task_service._tag_filters` |
| `due_before`, `due_after`, `scheduled_before`, `completed_since` | `YYYY-MM-DD`, then `date.fromisoformat` | `task_service._validate_day` |
| `status` | a `Literal`, so FastAPI answers 422 | `routers/tasks.py` |
| `limit` | 1..500 | both |

```python
PROJECT_RE = re.compile(r"^(?![+\-\s])[^\x00-\x1f\x7f()\"'\\:/?#%]{1,100}(?<!\s)$")
```

Refused: control characters and newlines; parentheses, quotes and `:`, which are Taskwarrior's
own filter grammar; a backslash; `/ ? # %`; a leading `+`, `-` or space, which Taskwarrior
would read as a modifier; a trailing space, which nobody can see. Allowed: spaces, umlauts,
dots (they nest subprojects) and semicolons — that is what people call their projects, and
`a b; c` is a perfectly safe attribute value.

`/ ? # %` are refused for a reason that has nothing to do with Taskwarrior: fastapi-mcp 0.4.0
substitutes a path parameter into the URL without encoding it
(`fastapi_mcp/server.py:515`, `path.replace(f"{{{param_name}}}", str(...))`), so a project
named `a/b` would address a *different route* over MCP. httpx encodes the space and the
umlaut itself, so those survive.

`validate_project_name` lives in `models.py` (`be/leaves`), not in the task service, so the
project router can reach it in a later change without the services layer gaining an importer.

A project name is never a token by itself — it is always the tail of `project:` or
`project.is:` — so a name shaped like `rc.data.location=x` is inert, and the test says so
rather than pretending the regex is what stops it. The `/` of a real data path is refused
anyway, for the MCP reason above.

### What is deliberately not validated

A value the client merely **resends unchanged**. On modify, the project modifier is validated
only when it differs from the project the task already carries; kept tags were already exempt
(ADR 0036, D3). Live users hold data that predates every rule here — this is a repository with
users, not a green field — and re-validating what the web UI echoes back on every save would
make those tasks uneditable. The same reasoning keeps the reserved names (`overview`, `plans`,
which would address a sibling route) out of the read and filter paths: they are refused only
where a name is *created*.

## Decision 2 — the project match is exact

`project.is:NAME` everywhere a project filter is built: `/gtd/projects/{name}`, `GET
/tasks?project=`, and the counters that come later. A subproject is a project of its own and
is reached by its own name. This is a **behaviour change**, and a fix: `/gtd/projects/alpha`
stops returning `alpha.sub` and `alphabet`.

## Decision 3 — `status`, and what `include_done` now means

| `status` | filter |
|---|---|
| `pending` (default) | `status:pending` — visible tasks |
| `waiting` | `status:waiting` — hidden by a future `wait` |
| `completed` | `status:completed` |
| `all` | `( status:pending or status:waiting or status:completed )` |

`waiting` is **Taskwarrior's** waiting, not the `waiting` GTD tag; the two are different
questions and the parameter description says so. `/gtd/waiting` remains the tag.

`include_done=true` is kept as an alias for `status=all` — the SPA sends `include_done=false`
on every context-tag refresh — but it is now that filter rather than no filter, so deleted
tasks and recurring templates are gone from the result. `include_done=false` is a no-op, not a
conflict, because agents fill defaults; only `true` together with `status` is a 400.
`completed_since` implies `completed` when no status is given and is refused with `pending` or
`waiting`, where it could only ever return nothing.

## Decision 4 — dates and `limit` are ours, not Taskwarrior's

The four date filters take a calendar day, and are applied in Python over the export, per
**local** day (`_local_day`, off the one clock `_now()`). Taskwarrior's date grammar is a
language of its own — `eom`, `now+3d`, `due.before` — and none of it needs to reach the binary
to answer "before this day". Keeping it out means the date parameters are a closed set of ten
characters rather than an expression surface. `limit` slices after the sort, for the same
reason: it is a presentation bound, not a query.

Completed tasks are sorted by `end` descending instead of by urgency, which is meaningless
once a task is done.

## Consequences

- `/gtd/projects/{name}` returns fewer tasks than before, correctly. Anyone relying on the
  prefix behaviour must ask for the subproject by name.
- `GET /tasks?include_done=true` returns fewer tasks than before: no deleted ones, no
  recurring template.
- `Task` gains `end`, which is what `completed_since` sorts and filters on.
- A project name that today's rules refuse can still be **resent**, so a task already carrying
  one stays editable; it cannot be newly created or moved to.
- The same name can no longer be **read through a project filter**. `GET /gtd/projects/{name}`
  and `GET /tasks?project=` validate it like every other filter value (Decision 1), so a legacy
  name holding `:`, `(`, `)`, `"`, `'`, `\`, `/`, `?`, `#`, `%` or a leading space answers 400 —
  while `GET /gtd/projects` still lists it, because that route reads names out of the export
  rather than taking one in. Taskwarrior 3.5.0 stores every one of those (`Kunde: ACME`,
  `O'Brien`, `Kunde (ACME)`, `Marketing/Sales`, `say "hi"`, `a\b`, `a?b`, `a#b`, `a%b`,
  ` Haus` — each rc 0 and exported verbatim; a *trailing* space it trims itself), and the API
  created them without validation until this change, so this is a live-user case, not a
  hypothetical one. It is the deliberate trade: the name *is* the filter token here, and over MCP it is
  an unencoded path segment (`/ ? # %` above). The fallbacks are the unfiltered list, which
  still returns the tasks, and a rename — a modify to a name that passes — which brings the
  project view back. The SPA's project view (`frontend/src/stores/tasks.js`, `fetchProjects`
  then `fetchProject`) is the one dependent that can hit it: it offers a name the server listed
  and then asks for it back.
- No route count, tool count or tool name changes.
- The skill (0.5.0) can ask the server for "done since" and "overdue" instead of fetching
  everything.

## Alternatives considered

- **Pass the dates to Taskwarrior** (`due.before:`) — smaller code, but it re-opens a parser
  surface in the one position `--` cannot protect, and Taskwarrior's relative dates would make
  "today" the binary's question rather than the server's. Rejected.
- **Validate every project name, including resent ones** — simpler rule, breaks live users'
  existing tasks. Rejected (AGENTS.md §1: there are users).
- **Keep `project:` and document the prefix match** — it is a defect, not a feature; nobody
  asked for "the tasks of every project whose name starts with this".
- **A `project_prefix` parameter alongside the exact one** — no caller wants it today; it can
  be added without breaking anything if one appears.
