# Change Impact Brief 0014 — The Taskwarrior argv boundary

| Field | Value |
|---|---|
| **Requested outcome** | Make cross-tenant containment a control this repository owns, rather than an accident of a third-party argument parser. Close SEC-3. |
| **Owning unit** | `be/adapters/task`, `be/services`, `ops`, `tests` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md), [`docs/security.md`](../security.md) |
| **Rule IDs introduced** | `RULE-ARCH-004` (a restricted stdlib import stays at its choke point) |
| **Waivers closed** | `WAIVER-SEC-002` → resolved, demoted to a justified suppression |
| **Entry points** | [`backend/app/services/task_runner.py`](../../backend/app/services/task_runner.py), [`backend/app/services/task_service.py`](../../backend/app/services/task_service.py), [`architecture.toml`](../../architecture.toml) |
| **Affected public surfaces** | **None.** No route, schema or MCP tool name moves. `task_runner`'s internal signatures change. |
| **Known dependents** | `task_service` is the only caller of `task_runner`; `RULE-ARCH-004` now enforces that no one else can become one. |
| **Uncertain / dynamic areas** | `BLIND-TASK-001` — Taskwarrior's internals are opaque to static analysis, which is why every claim here was tested against the real binary rather than reasoned about. |
| **Analogous implementations** | The route-guard declaration (`RULE-SEC-001`): a normative list in a checked-in file, compared against what the code actually does. |
| **Delivery Pattern** | **Security or Operability Change** — failure scenario, control, adversarial proof. |
| **Required tests** | The container tier is the pass criterion: **17 passed** against real Taskwarrior 3.5.0, including six inverted SEC-3 tests. Plus rewritten unit tests and one new negative fixture. |
| **Intended scope** | Step 12. Attribute-value validation is deliberately out of scope and recorded. |
| **Base revision** | `1947188` |

## The failure scenario, stated as it actually is

Per-user isolation rests on three environment variables handed to a subprocess. There is no
ownership column and no second gate.

Taskwarrior consumes `rc.<key>=<value>` anywhere in its argument list as a runtime override,
including `rc.data.location`, which chooses which store it opens. So a task description of
that shape was addressed directly at the only tenancy boundary the system has.

The 2026-08-05 investigation confirmed the mechanism and found the exploit blocked: every
command able to carry an override also required free text, the override consumed it, and
`task add` refused. That is why SEC-3 was downgraded from critical to medium.

**It was never a control.** It is a property of someone else's argument parser, and this
repository learned three weeks later that the binary changes under it — Taskwarrior 3.5.0
started requiring theme files and broke every container test on an unchanged backend.

## The control, verified before it was written

I ran the experiment against the real binary first, because `BLIND-TASK-001` says Taskwarrior
is opaque to static analysis and the whole SEC-3 history is a case study in why guessing here
is expensive:

```
task add rc.data.location=/tmp/victim hello      ->  /tmp/victim/taskchampion.sqlite3 created
task add -- rc.data.location=/tmp/victim hello   ->  stored as literal description text
```

The first line is SEC-3 reproduced on 3.5.0: **the store was redirected**. The second is the
fix.

Free text now travels after `--`. This is the primary control **because it does not depend on
us being right about what is dangerous** — a blocklist is only as good as its author's
imagination, and a separator that ends parsing is a property of the grammar.

Its cost is ordering: everything after `--` becomes text, so modifiers must come first.
`_build_args` returns `(mods, text)` rather than one list, which puts the trust boundary in
the type signature instead of in a comment.

Two more controls sit behind it. `reject_structural_tokens` refuses `rc.`-shaped tokens in
the positions that must stay parseable, and **`RULE-ARCH-004`** keeps `subprocess` importable
only from `task_runner` — because everything above is worth nothing if a second module calls
`task` directly, and that is an easy change to make by accident while chasing something else.

The rule is scoped to `backend/app/`, not the whole tree. Repository tooling runs `git` in
five places, and a rule with five standing exceptions teaches people the rule is noise.

## The read-back was a second injection surface

`create_task` re-queried the new task by filtering on its description — putting user text into
a *filter* position, the one place `--` cannot protect. Replaced with Taskwarrior's `+LATEST`
virtual tag.

That also fixes a correctness bug hiding inside the security one: two tasks with the same
description made the return value ambiguous, and the service returned whichever came first.
There is now a test for it.

Parsing the UUID out of `task add` output was the obvious alternative and does not work: with
`rc.verbose=nothing`, which this module sets, `add` prints nothing. Verified, not assumed.

## The fake had to learn the separator

`FakeTaskCLI` now takes free text as a separate argument, joins it into the description
verbatim, and **never parses it** — which is what the real binary does after `--`.

This matters more than it looks. A fake that quietly parsed that text would make the hardening
appear to work in 159 unit tests while the real binary disagreed. That is precisely the
failure mode that made SEC-3 need the container tier to confirm it in the first place, and it
would have been invisible on an arm64 developer machine where the container tier never runs
(`RISK-TEST-001`).

## Six tests that asserted the opposite

The container tier's SEC-3 tests each said in their own docstring that Step 12 would flip
them. They did:

| Test | Was | Is |
|---|---|---|
| an `rc.`-shaped description | consumed as configuration; command fails | stored as literal text |
| an `rc.`-shaped annotation | applied the override, returned success, wrote nothing | stored as annotation text |
| the redirect | reached another user's store | never reaches it; the directory is byte-identical afterwards |
| an override after real text | "one argv token" containment | inert, whatever its shape |

## Behaviour change

**Yes, one, and it is user-visible.** A description or annotation shaped like
`rc.key=value` is now **stored and returned as ordinary text**. Previously the same input
either failed with a Taskwarrior error or silently produced an empty annotation. Anyone who
had learned to rely on that error is affected; nobody should have.

No route, schema or MCP tool name changes. `task_runner`'s function signatures change and are
internal.
