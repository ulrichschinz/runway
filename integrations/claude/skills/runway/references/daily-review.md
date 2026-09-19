# Daily review — five minutes, one screen

The daily review keeps the lists trustworthy between weekly reviews. It must stay short,
or it will not happen. One screen, numbered, the user answers in shorthand, you apply the
changes in one go.

## 1. Gather (no questions yet)

If the server offers a summary operation, call it first and fetch only the lists whose
counters are not zero. Otherwise two calls are enough: the pending tasks (sections 1, 3,
4 and 6 are filters over that list) and the project list (section 5). Call the inbox
separately only if you need to be sure about hidden ticklers. If the user named a context
("daily @home"), filter section 6 by it.

## 2. Show one numbered screen

Only sections that have content, in this order. Number only entries whose title is
visible — a count cannot be addressed by shorthand.

1. **Overdue / due today** — each with its date. Include tasks whose `scheduled` date has
   passed and that are not waiting-fors.
2. **Inbox** — count and age of the oldest item; list titles if there are five or fewer.
3. **Waiting for — follow-up due**: `scheduled` today or earlier. Older data may carry the
   follow-up in `due` or `wait` instead; treat a past date there the same way and suggest
   moving it to `scheduled`.
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
| someday | swap the status tag to `someday` |
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
