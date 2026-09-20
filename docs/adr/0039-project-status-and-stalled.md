# ADR 0039 — Project status, and what "stalled" means

- **Date:** 2026-09-20
- **Status:** Accepted
- **Scope:** `be/adapters/db` (`database.py`), `be/leaves` (`models.py`), `be/services`
  (`task_service.py`), `be/routers` (`gtd.py`, `projects.py`), backend tests, the Claude skill, docs
- **Addendum to:** [ADR 0038](0038-validated-filters-and-exact-project-match.md) (project names are
  validated where they are written), [ADR 0025](0025-narrowing-the-migration-except.md) (why a new
  table and not an `ALTER`)

## Context

The most valuable thing a GTD review produces is the sentence "nothing is moving this project".
`GET /gtd/summary` has been answering it since [brief 0038](../briefs/0038-the-gtd-summary.md), and
it has been answering it wrongly for every project the user has consciously set aside — because
Taskwarrior holds no notion of a project beyond the string on a task, so "deliberately parked" and
"forgotten" look identical in the data.

The skill worked around it the only way it could: move a parked project's tasks to `someday` and
write `ON HOLD` into the plan text, then read that text back at review time
(`references/conventions.md`, `references/daily-review.md`). That is a convention held up by prose
on both sides. It costs a plan fetch per candidate, it is invisible to anything that is not this
skill, and it fails silently the moment somebody writes `on hold` in lower case.

Two further facts made this the moment to fix it:

- `POST /projects` accepted any name at all, and `PUT /projects/plans/{name}` — which inserts a
  `projects` row for whatever name it is given — was a second, unnoticed creation path. ADR 0038
  validated names where they become filter tokens; it did not validate them where they are
  **created**, so the API was still minting names its own filters would later refuse.
- A project's counts were computed in `summarize` and thrown away. The review had a one-line
  finding and no way to look behind it.

## Decision 1 — status is a small table of its own

```sql
CREATE TABLE IF NOT EXISTS project_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'on_hold', 'done')),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(username, name)
)
```

Three values, no more: `active` is the default and needs a next action, `on_hold` is parked on
purpose, `done` is over. **No row means `active`**, so nothing has to be written for the ordinary
case and "nobody has decided anything here" is not stored as a decision.

Not a column on `projects`, for two independent reasons.

- The migration loop in `init_db` runs **before** the `CREATE` statements, so an `ALTER TABLE …
  ADD COLUMN` against a table a fresh database does not have yet fails on the first boot and
  succeeds on the second — logged, and confusing exactly once per deployment. `CREATE TABLE IF NOT
  EXISTS` is the same statement on both. This is the reason the `reviews` table has the shape it
  has, and it applies unchanged here.
- `projects` means **created explicitly**. `explicit` in the overview is precisely "has a row
  there", and putting status on it would force a project into existence to say it is on hold —
  which is the wrong direction: a project that exists only because tasks name it is the most
  likely one to need parking. `PUT /projects/{name}/status` therefore creates no `projects` row,
  and a test says so.

## Decision 2 — stalled is active, no `next`, nothing waiting, nothing parked

```python
def _is_stalled(status, counts, exists):
    return (exists and status == "active"
            and counts["next"] == 0 and counts["waiting"] == 0 and counts["hidden"] == 0)
```

The change order asked for "active projects without a pending `+next` task". The skill's own
definition said "no next and nothing in waiting". Neither counts the tickler. The server implements
all three zeros, because each of them is already an answer to "what happens next here":

- a project **waiting on someone else** has its next step outside the user's control; naming it as
  stalled asks them to invent work they cannot do;
- a project **parked in the tickler** by a future `wait` has a date on which it comes back — the
  user already decided, and the decision is in the data;
- a project **on hold or done** was decided about explicitly, which is what this ADR adds.

One predicate, used by `GET /gtd/summary` (`stalled_projects`) and `GET /gtd/projects/overview`
(`stalled`), so the one-line finding and the list behind it cannot disagree. An **explicit project
with no open task at all is stalled** — that is a real finding, not an empty row. `exists` is the
other half of that sentence: a name known only from the status table is a stored decision, not a
project, and is never a finding (see Consequences).

## Decision 3 — the overview is a third view of one export

`GET /gtd/projects/overview` returns every project with `status`, `explicit`, `has_plan`, the four
counts and `stalled`. It runs the same single `OPEN` export and the same `project_rollup` the
summary uses; nothing is counted twice and nothing can drift. Names come in first-seen order —
projects with tasks first, then the table's rows by creation — and it carries no task description,
so it is as printable as the summary.

`explicit` and `has_plan` are reported rather than hidden, because an inferred project has no
purpose written down anywhere and that is worth seeing in a weekly review.

## Decision 4 — two reserved names, and why

`/gtd/projects/overview` is declared **before** `/gtd/projects/{name}`; FastAPI matches in
declaration order, so the other way round the overview would be read as a project called
`overview`. Declaration order is the fix. The reservation is the second half: `overview` and
`plans` cannot be **created** as project names (`validate_project_name(..., reserved=True)`), so
the collision cannot be manufactured on purpose.

`plans` is reserved for a sharper reason, pinned by a test as current routing:

> `PUT /projects/plans/status` matches `PUT /projects/plans/{name}`, which is declared first. It
> upserts the plan of a project called `status` — it does **not** set the status of a project
> called `plans`.

A project literally named `plans` therefore cannot have a status set. That is accepted rather than
worked around: re-ordering the two routes would break `PUT /projects/plans/status` as a plan write,
which is the older promise. Since `plans` can no longer be created, the only way to reach that
state is a row that predates this change.

## Decision 5 — names are validated on **both** creation paths

`POST /projects` and `PUT /projects/plans/{name}` both run `validate_project_name(name,
reserved=True)` and answer **400**. The second one had to be found: it INSERTs a row for any name,
so "validate project names on creation" was half-applied without it.

Reads, filters and resent values are untouched, which is the rule ADR 0038 established and D3/D4
state: a plan whose row already exists is updated without re-validating its name, exactly as a kept
tag and an unchanged project modifier are. Live users hold names that predate every rule here, and
re-validating what the server itself handed out would make their projects uneditable.

## Consequences

- The summary's `stalled_projects` gets **shorter** for anyone who sets a status, which is the
  point. Nothing changes for a user who sets none.
- `POST /projects` can now answer 400 where it answered 201. Names containing a control character,
  `( ) " ' \ : / ? # %`, a leading sign or a trailing space are refused, and so are `overview` and
  `plans`. A leading or trailing space is still **stripped** rather than refused, as before.
- `PUT /projects/plans/{name}` can now answer 400 for a name that does not exist yet. An existing
  plan is unaffected.
- Six tables instead of five; `db-schema.sql` moves. Two routes, two MCP tools and two guard
  declarations are added: 38 routes, 27 tools, 37 guards.
- The skill (0.9.0) stops reading `ON HOLD` out of plan text. That fallback is deleted rather than
  kept: leaving it would mean two sources for the same fact, and the prose one cannot be checked.
- A status can be set on a name no project currently carries; refusing would mean a user cannot
  park a project before its first task exists. The overview lists such a name with zero counts and
  `explicit: false`, which is how a status set ahead of the first task — or a mistyped one — is
  seen again at all. It is **never** stalled, and the summary never names it: nothing deletes a
  status row, so one typo would otherwise be a false finding in every review from then on, which
  is the noise this change exists to remove. "Stalled" is a statement about a project, and a name
  is a project once a task carries it or a `projects` row holds it.
- A project whose name predates these rules (`(alt)`) can have its plan updated but **cannot** have
  a status set: the status route validates the name it is about to write as a key, the same way
  `GET /gtd/projects/{name}` already validates the name it is about to put into a filter (ADR
  0038). Such a project stays listed and stays stalled, and the way out is the one that was always
  there — rename it by moving its tasks. Accepted rather than fixed with a "validate only new
  names" branch here: the name is a fresh row in a new table, and a status route that accepts a
  name no other route accepts would hand out a key that can never be read back by name.

## Alternatives considered

- **A `status` column on `projects`.** Smaller schema, but it needs an `ALTER` in a loop that runs
  before the table exists on a fresh database, and it makes "on hold" imply "explicitly created".
  Rejected on both counts.
- **Keep `ON HOLD` in the plan text.** No schema change, but it is a convention enforced by prose
  in two files, invisible to every other client, and it costs a plan fetch per project. It is the
  status quo this change exists to remove.
- **Derive "on hold" from the tasks** (for example: all of them `someday`). It is a guess, it
  cannot express a project with no tasks, and it makes a bulk tag edit silently change a project's
  status. Rejected.
- **A free-text status.** Every consumer would then have to agree on spellings. Three values with a
  `CHECK` and a `Literal` is the same decision the review `kind` already made.
- **Re-order `/plans/{name}` and `/{name}/status`** so a project called `plans` could have a
  status. It would break plan writes for a project called `status`, trading a live promise for a
  hypothetical one. Rejected; the name is reserved instead.
