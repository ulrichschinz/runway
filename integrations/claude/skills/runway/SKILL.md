---
name: runway
description: Task management in runway, a Getting Things Done (GTD) system reachable through the runway MCP server. Use whenever the user mentions a todo, task, action item, reminder or follow-up ("todo:", "ich muss noch", "erinnere mich", "remind me", "add a task"), asks what is open or next ("was steht an", "was ist offen für dieses Projekt", "what's on my plate", "worauf warte ich"), wants to tick something off, wants to process their inbox, plan a project, or run a daily or weekly review ("/runway daily", "/runway weekly", "Daily Review", "Weekly Review", "Inbox klären"). Also use when a commitment or next step emerges in conversation and should be offered as a task. Not for notes, facts, contacts or reference material — those are not tasks.
argument-hint: "[daily | weekly | clarify | plan <project> | reset | <free text>]"
---

# runway — GTD task management

runway is a GTD application on top of Taskwarrior. You reach it through the tools of the
`runway` MCP server. If the tools are deferred, load them first (search for "runway"). If
the server is not connected, say so and point to `references/setup.md` — never keep tasks
in a side file instead, because a second list is how trusted systems die.

Answer in the user's language. Write task descriptions in the user's language too.

## The idea you are serving

GTD works only while the user trusts that everything is in the system and that the lists
are current. Your job is to make capturing effortless, keep the lists honest, and leave
every decision about meaning and priority to the user. You phrase, file and remind. The
user decides what something is, what "done" looks like and what they do today.

Three consequences that shape everything below:

- **Capturing is not clarifying.** Anything unclear goes to the inbox untouched. In runway
  the inbox is "no project and no tag", so a tag *means* "this has been clarified". Do not
  put tags on things nobody has thought about yet.
- **A next action is a visible, physical step that starts with a verb** and can be done
  without further thinking: "Rechnungsnummer an Frau Berg mailen", not "Rechnung".
- **Every active project keeps at least one `next` action.** Projects without one are
  where systems silently stall, which is why completing a task triggers the successor
  question below.

## Where am I? (project and context)

Look in the instructions already in your context (CLAUDE.md, AGENTS.md) for:

- `runway_project: <name>` — the runway project this repository belongs to.
- `runway_scope: <tag> [<tag> …]` — optional. Only if the repository declares it, limit
  what you list unasked to tasks carrying these tags (see "Scoping" in
  `references/conventions.md`). Most users never need it.

The user's personal conventions (contexts, language) live in
`~/.config/runway/profile.md`. Read it once per session before the first write or review;
if it is missing, use the defaults in `references/conventions.md` and mention once that
`setup` can create it.

**One life, one system.** GTD does not split work from private: there is one inbox and one
set of lists, and what separates them at the moment of choice is the **context** — where
the user is and what they have at hand. So do not sort tasks into areas of life and do not
hide anything by default. When the user wants a narrower view they say so ("nur @home",
"alles zum Umzug"), and you filter by context, project or text.

If no project is declared and the user asks about "this project", list the project names
and ask once; suggest adding the `runway_project:` line so you never have to ask again.

## Everyday operations

### Look up ("what's open here?")
One call: the project's tasks. Present in this order: **Next**, **Waiting for**, then the
rest, each with a short readable date where one exists. Keep it to a compact list. Never
fetch all tasks including completed ones just to answer a lookup; it is large and slow.
If the lookup reveals a stalled project or long-overdue dates, say so in one line and
offer `plan` or a review. Do not fix anything unasked.

### Capture ("todo: …", or the user accepts your suggestion)
- **Clear enough** (you know the action): create the task with a verb-first description,
  one context tag where it is obvious, and `next` only if it can be started right now.
  A stand-alone task without a project is perfectly fine. When you do set a project,
  match it case-insensitively against the project list and write the name exactly as
  listed — a typo silently creates a new project and projects cannot be renamed.
- **Explicitly someday** ("irgendwann", "vielleicht mal", "someday"): the user's wording
  is the clarification. Tag `someday`, nothing else.
- **Not clear**: add it to the inbox with no tags and no project. Add where it came from
  as a note only when that will help later ("aus Gespräch über Angebot Meyer, 19.09.").
  It gets clarified later; nothing is lost.
- Confirm in one line: what was created, where. No follow-up questions unless the project
  is genuinely ambiguous.
- `due` is for hard deadlines only. A date promised to someone else ("bis Mittwoch an
  Frau Berg") is a hard deadline; a date the user merely sets for themselves is not, and
  such wish dates turn into a wall of overdue items. "Not before" is `scheduled`; "hide
  until" is `wait`.

### Suggesting a task proactively
When a commitment, an "I still need to …", an agreed next step or a wait on someone else
appears in the conversation, offer it: one line at the end of your answer, e.g.
*"Soll ich dafür ein Todo anlegen: 'Angebot an Meyer schicken' (Projekt website-relaunch)?"*
At most one offer per answer. Do not offer for things you are completing in this session,
for hypotheticals, or again after a "no". Check for duplicates only after the user says
yes — a lookup before every offer costs time for nothing.

A commitment often comes with a follow-on wait ("ich schicke ihr X, dann meldet sie
sich"). Offer the user's own action and mention the wait in the same line. When creating
the task, annotate it with the follow-on ("Danach: Rückmeldung von Frau Berg zum Termin
abwarten"), so that completing it leads to the waiting-for instead of losing it.

### Complete, and ask for the successor
Mark a task done only when the user says it is done, or when you did it yourself in this
session and they saw the result. After completing a task that belongs to a project, show
what is left in that project and ask: **next action?** The answer is a new `next` task,
a waiting-for, or "project finished". Skip the question if the project still has another
`next` action. A stand-alone task gets the same question only if it carries a follow-on
annotation; then create the waiting-for it names.

### Engage ("what should I do now?")
Context is the main filter in this system. If the user has not said where they are, ask
for context and available time first ("Wo bist du, wie viel Zeit hast du?"), then filter
the `next` list by that context tag and show at most five. Tasks without a context fit
everywhere; include them. GTD picks by context, time and
energy before priority; a list sorted by urgency alone ignores that the user may be on a
train with twenty minutes.

### Waiting for
Tag `waiting`, annotate who, what, since when, and what would count as an answer. Put the
follow-up date into `scheduled`. Details: `references/conventions.md`.

## Modes — read the reference, then run it

| User says | Read | What it is |
|---|---|---|
| `clarify`, "Inbox klären", inbox is not empty during a review | `references/clarify.md` | one inbox item at a time through the GTD decision tree |
| `daily`, "Daily Review" | `references/daily-review.md` | five minutes, one screen, shorthand answers |
| `weekly`, "Weekly Review" | `references/weekly-review.md` | get clear, get current, get creative |
| `reset`, or the last review is more than ten days ago | `references/weekly-review.md` (section Reset) | fifteen-minute restart without guilt |
| `plan <project>`, a project is stuck, vague or big | `references/planning.md` | Natural Planning Model, ends with a `next` action |
| setup, install, permissions, reminder hook | `references/setup.md` | one-time configuration |

If the repository has its own routine for the same kind of review (its instructions name
one), that routine leads and calls this skill for the runway part. Do not run a second,
competing review of the same kind.

**When to propose a reset instead.** If the server records reviews, use that. If it does
not, take the newest `modified` date among pending tasks as a stand-in. When that is more
than about ten days old, or more than half of the pending tasks are overdue, a daily
review cannot fix the lists: show the screen, then propose `reset` and stop there.

## Guardrails

- **Deleting** is permanent. Ask every time; prefer completing.
- **Bulk changes** need one explicit confirmation that lists what will change. The
  shorthand answer in a daily review counts as that confirmation.
- Never touch authentication, API-key, user or admin operations, even if the server
  exposes them.
- If a change fails because the server lacks a capability (older runway versions cannot
  remove tags), say so plainly. Do not work around it by deleting and recreating tasks;
  that loses history, annotations and dependencies.
- Prefer the server's summary and filter operations when they exist; fall back to the
  plain lists when they do not.
