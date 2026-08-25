# ADR 0019 — Let Taskwarrior's own grammar do the work, and keep the door single

- **Date:** 2026-08-25
- **Status:** Accepted
- **Scope:** `backend`, `ops`

## Context

Taskwarrior consumes `rc.<key>=<value>` anywhere in its argument list as a runtime
configuration override. One of those keys is `rc.data.location`, which chooses **which data
store it opens** — and per-user isolation here rests entirely on `TASKDATA` pointing at one
user's directory. A task description of that shape was therefore addressed directly at the
only tenancy boundary the system has (finding **SEC-3**).

The 2026-08-05 investigation confirmed the mechanism against the real binary and found the
exploit blocked: every command that could carry an override also required free text, and the
override consumed it, so `task add` refused. The finding was downgraded from critical to
medium on that evidence, and the fix was deferred to this step.

That containment was never a control. It is a property of a third-party argument parser,
owned by someone else, and it holds only until they change it. This repository learned on
2026-08-25 that the binary does change under it: Taskwarrior 3.5.0 started requiring theme
files and broke every container test on an unchanged backend.

## Decision

**Free text is passed after `--`.** Taskwarrior stops interpreting options there, so an
override in a description is inert by the binary's own grammar rather than by our filtering.
Verified against 3.5.0 before writing any code:

```
task add rc.data.location=/tmp/victim hello      ->  /tmp/victim/taskchampion.sqlite3 created
task add -- rc.data.location=/tmp/victim hello   ->  stored as literal description text
```

This is the primary control **because it does not depend on us being right about what is
dangerous.** A blocklist of shapes is only as good as its author's imagination; a separator
that ends parsing is a property of the grammar.

Its cost is ordering: everything after `--` becomes text, so modifiers must come first —
`task add project:x +tag -- <description>`. `_build_args` therefore returns `(mods, text)`
rather than one list, which makes the trust boundary visible in the type.

**`reject_structural_tokens` refuses `rc.`-shaped tokens** in the caller-supplied argument
list. Defence in depth for the positions `--` cannot cover — filters and modifiers must stay
parseable — and a guard against a future caller reintroducing the hole.

**`RULE-ARCH-004` keeps `subprocess` importable only from `task_runner`.** Everything above is
worth nothing if a second module calls `task` directly, and that is an easy change to make by
accident. The rule is scoped to `backend/app/` rather than the whole tree: repository tooling
shells out to git constantly and legitimately, and a rule that flagged that would be switched
off within the week.

**Reading back a created task uses `+LATEST`.** The old form re-queried by description, which
put user text into a *filter* position — the one place `--` cannot protect — so the same
string was an injection surface twice. It also returned the wrong task whenever two shared a
description, which was a correctness bug hiding inside a security one.

## Alternatives considered

- **Validate descriptions against a blocklist and keep the old argv shape.** Rejected as the
  weaker half of what was built. It makes safety depend on enumerating dangerous prefixes
  correctly, forever, against a binary whose grammar is not ours. It is kept as the *second*
  control, for the positions the separator cannot reach.
- **Escape or strip `rc.` prefixes from user text.** Rejected: it silently corrupts a
  legitimate description — someone writing documentation about Taskwarrior configuration is
  the obvious case — to defend against a shape the separator already neutralises.
- **Parse the UUID out of `task add` output.** Rejected: with `rc.verbose=nothing`, which this
  module sets, `add` prints nothing at all. Verified rather than assumed.
- **Restrict `subprocess` across the whole repository.** Rejected: the toolchain legitimately
  runs `git` in five places, and a rule with five standing exceptions teaches people that the
  rule is noise.
- **Drop the override refusal now that `--` covers free text.** Rejected: filters and
  modifiers are still assembled from user-influenced values, and the choke point is the
  cheapest place to be sure.

## Consequences

- SEC-3 is closed and `WAIVER-SEC-002` is resolved. The `# noqa: S603` becomes a permanent
  justified suppression: the argv is a list, and the question S603 cannot see — whether the
  callee reinterprets its arguments — is now answered structurally.
- **The container tier's SEC-3 tests are inverted.** They used to assert the payload was
  consumed as configuration and the command failed; they now assert it is stored as text.
  Each said in its own docstring that Step 12 would flip it.
- `task_runner`'s public functions change shape: `add_task(username, mods, text)` and
  `modify_task(username, uuid, mods, text)`. This is internal — no route, schema or MCP tool
  name moves.
- **The fake Taskwarrior had to learn the separator.** It now joins free text into the
  description verbatim and never parses it, which is what the real binary does. A fake that
  quietly parsed it would have made the hardening look like it worked while the real binary
  disagreed — the exact failure mode that made SEC-3 need the container tier in the first
  place.
- Attribute values — `project:`, `due:`, dates — remain unvalidated by us and are parsed by
  Taskwarrior. They are not overrides, and that is recorded rather than hardened.
