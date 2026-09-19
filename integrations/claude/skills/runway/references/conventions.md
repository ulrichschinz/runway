# Conventions

These are the defaults. `~/.config/runway/profile.md` overrides names (contexts), never
the mechanics.

## The GTD lists and how runway stores them

| GTD list | In runway | Notes |
|---|---|---|
| Inbox | no project **and** no tag | a tag means "clarified" — never tag on capture |
| Next actions | tag `next` | can be started right now, no blocker |
| Waiting for | tag `waiting` | annotation + follow-up date in `scheduled` |
| Someday/maybe | tag `someday` | looked at in the weekly review only |
| Projects | `project` field, optional plan | outcome needing more than one step |
| Tickler | `wait` date, no tag, no project | hidden until the date, then back in the inbox |

Tags are written without `+` in the API (`next`, not `+next`). The `@` of a context is
part of the tag name (`"@phone"`).

## Which operation for what

Tool names are the server's operation ids and may differ by server version; find them by
what they do.

| Need | Operation |
|---|---|
| tasks of one project | gtd project tasks (`gtd/projects/{name}`) |
| project names | gtd projects |
| inbox / next / waiting / someday | the matching gtd list |
| duplicate check, overdue, "in no list" | list tasks (pending), filtered by project or tag where the server allows it |
| capture unclarified | inbox post (description, optional note) |
| counters for reviews and hooks | gtd summary, if present |
| hidden ticklers | gtd tickler, if present |
| project plan | get plan / upsert plan |

## Status tags

- A clarified task carries exactly one of `next`, `waiting`, `someday` — or none, if it
  is a later step inside a project.
- **Later steps without a status tag are allowed inside projects only.** A stand-alone
  task with no status tag is in no GTD list at all. Report it as a finding in reviews
  ("3 tasks are in no list") and let the user decide.
- Switching status means removing the old tag and adding the new one in the same call.
- Order later steps with `depends` when the order is real. Do not build dependency chains
  for their own sake.

## Contexts — the main filter

A context says where or with what a task can be done: a place, a tool, a person. It is
what the user filters by when choosing what to do, so it is the one tag worth getting
right. Work and private life are not kept apart by a label of their own; `@office` and
`@home` do that job naturally.

- Use the user's own contexts from the profile. Defaults: `@computer`, `@home`,
  `@errands`, `@phone`. Look at the tags already in use before inventing a new one.
- One context per task is the norm; two only when the task really can be done in either.
  No context means "anywhere".
- A context is not a topic. Topics are projects, or findable by text search.
- For recurring conversations with one person use `@agenda-<name>`.
- The `@` is part of the tag name (`"@phone"`).

## Scoping (optional)

A repository may declare `runway_scope: <tags>`. Then unasked lists (next, waiting,
reviews) show only tasks carrying those tags and give the rest as one line of counts. This
exists for repositories whose conversations are logged or shared with others. An explicit
request by name always wins. Without the declaration, nothing is hidden. Be aware that
scoping filters what you say, not what the tools return; use the server's tag filter when
it has one.

## Projects

- New projects get flat names in kebab-case (`website-relaunch`). If the repository has a
  project slug of its own, use exactly that. Existing names stay as they are; match them
  case-insensitively and write them exactly as listed.
- Always check the name against the project list before creating a task; unknown names
  are accepted silently and projects cannot be renamed.
- **On hold**: move its open tasks to `someday` and note "ON HOLD" in the plan (or set
  the project status if the server supports it). An on-hold project is not stalled.
- **Stalled**: an active project with no `next` action and nothing in `waiting`. Finding
  these is the most valuable thing a review does.

## Dates

| Field | Meaning | Use |
|---|---|---|
| `due` | hard deadline, real consequences | rarely |
| `scheduled` | earliest sensible start, or follow-up date of a waiting-for | often |
| `wait` | hide completely until this date | tickler only |
| `until` | task expires by itself | rarely |

Use ISO dates (`2026-09-25`). To clear a date, send an empty string.

A pile of overdue `due` dates is a symptom of wish dates. In a review, each overdue item
gets one of: done, a new honest date, or no due date at all.

## Waiting for

Description states the expected thing ("Rückmeldung von Frau Berg zum Workshop-Termin").
Annotation: who, what was asked, when, what counts as an answer. `scheduled` = the day to
follow up. Do not use `wait` on waiting-for tasks: the weekly review needs the complete
list of what others owe the user, including items that are not due yet.

## Tickler

Only `description` + `wait`. No tag, no project. When the date arrives the item shows up
in the inbox and gets clarified like anything new — by then the user knows more.

## Recurring

`recur` needs a `due` date; this is the one place where a due date on a routine is fine.
Do not create a recurring "do daily review" task: missed instances pile up and turn a
habit into guilt.

## Annotations

Annotations cannot be removed, so keep them meaningful: phone numbers, links, the file or
repository path that actually helps, waiting-for details. No session ids, no "created by
agent" stamps.

## Priority

New tasks get priority `M` from the server by default. Do not set priorities unless the
user asks; GTD chooses by context, time and energy first.
