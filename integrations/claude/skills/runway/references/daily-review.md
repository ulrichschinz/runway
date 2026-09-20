# Daily review — five minutes, one screen

The daily review keeps the lists trustworthy between weekly reviews. It must stay short,
or it will not happen. One screen, numbered, the user answers in shorthand, you apply the
changes in one go.

## 1. Gather (no questions yet)

Call the summary first. It is the entry path: it names no task, and it says which lists are
worth fetching at all. **Fetch a list only when its counter is above zero.** In a scoped
repository pass the scope tags as `tag` to the summary and to every list call below.

| Section | Counter | Call, only if the counter is above zero |
|---|---|---|
| 1 Overdue / due today | `overdue`, `due_today`, `scheduled_passed` | list tasks with `due_before=<tomorrow>`; if `scheduled_passed` is above zero also `scheduled_before=<tomorrow>`, and drop the `waiting` ones — they are section 3. `overdue` and `due_today` count parked tasks as well, which the list call does not return: a remainder is in the tickler, not missing |
| 2 Inbox | `inbox`, `inbox_oldest_entry` | `gtd/inbox`, only if `inbox` is five or fewer and the repository is not scoped; otherwise report count and age and stop there |
| 3 Waiting for | `waiting_followup_due` | `gtd/waiting`, keep those whose `scheduled` is today or earlier |
| 4 In no list | `unclarified` | list tasks with `status=pending`, filtered locally (no project, none of `next`/`waiting`/`someday`). This is the one permitted full pending fetch, and only when the counter says there is something to find |
| 5 Stalled projects | `stalled_projects` | none — the summary gives the names |
| 6 Next actions | `next` | `gtd/next`, scoped by the area tags only |

If the user named a context ("daily @home"), filter section 6 by it yourself — a task
without a context fits everywhere, and a server-side context filter would drop it.

## 2. Show one numbered screen

Only sections that have content, in this order. Number only entries whose title is
visible — a count cannot be addressed by shorthand.

1. **Overdue / due today** — each with its date. Include tasks whose `scheduled` date has
   passed and that are not waiting-fors.
2. **Inbox** — count and age of the oldest item; list titles if there are five or fewer.
3. **Waiting for — follow-up due**: `scheduled` today or earlier. Older data may carry the
   follow-up in `due` instead; treat a past date there the same way and suggest moving it
   to `scheduled`. A task whose `wait` has passed is shown normally again; suggest moving
   that date to `scheduled` as well.
4. **In no list** — stand-alone tasks without `next`/`waiting`/`someday`. Tasks that carry
   only a context tag look clarified to the server but usually are not (no verb, no
   outcome): list them here and offer `clarify`.
5. **Stalled projects** — active projects without a `next` action and nothing waiting
   (names only). If the server has no project status, check the plan
   for an "ON HOLD" note, for at most five candidates.
6. **Next actions** — the candidates for today, at most ten, numbered on.

Two zeros are worth a line of their own because they are findings, not emptiness:
"Inbox 0" tells the user the system is trustworthy, "Next 0" tells them it has stopped.

Do not ask about the calendar unless you have calendar access; remind the user in one
line to glance at it first, because the day's fixed commitments decide how much fits.

Then ask **one** question, e.g.:
*"Kürzel reichen: ‚1 erledigt, 2 due weg, 3 auf Freitag, 5 klären, Fokus 9 11 12'."*

## 3. Apply

Parse the shorthand, apply everything, and report in one compact block what changed. The
shorthand is the user's confirmation for this batch; do not re-confirm each item. Ask back
only where an instruction is ambiguous.

Typical instructions and what they mean:

| Shorthand | Action |
|---|---|
| erledigt / done | complete; if it was a project's last `next`, ask for the successor |
| due weg | clear `due` (it was a wish date) |
| auf <Datum> | new honest `due`, or `scheduled` if it is not a deadline |
| nachfassen | you draft the follow-up message; the user sends it; move `scheduled` forward |
| klären | run `references/clarify.md` for those items, right now if there are few |
| someday | swap the status tag to `someday` (tags_remove + tags_add) |
| Fokus n n n | today's focus: three to five `next` actions; just list them back, no tagging |

Overdue items get exactly one of three outcomes: done, a new honest date, or no date.
"Leave it overdue" is not an outcome — a permanently red list is how users stop looking.

## 4. Close

- Record the review on the server if it supports review timestamps. Otherwise, if the
  repository has its own marker for reviews, follow its instructions; if neither exists,
  do nothing — do not invent a state file.
- End with the focus list and nothing else. No task dump into journals or logs; at most
  counters ("Inbox 0, 2 überfällige geklärt, Fokus 3").

If the inbox is large (more than about ten) do not try to clarify it inside the daily
review. Say how many there are and offer `clarify` separately.
