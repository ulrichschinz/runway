# ADR 0001 — The repository task interface is `make` over POSIX `sh`

- **Date:** 2026-08-04
- **Status:** Accepted
- **Scope:** repository (`ops`)
- **Supersedes:** —

## Context

This repository spans two ecosystems (Python 3.12 / FastAPI and Node 20 / Vue 3) plus a native Taskwarrior
binary, and it must be usable by any coding agent and by a human with a shell, with no vendor-specific
tooling on the required path. Agents need documented exit codes and machine-readable output; humans need
something discoverable. Nothing of the kind exists today — Phase 0 found no formatter, linter, type checker,
test runner, or verification step anywhere in the repository or in CI.

## Decision

A root `Makefile` is the thin, discoverable front door. It contains no logic; every target delegates to a
POSIX `sh` script under `tools/`. Verification profiles are assembled by `tools/run-profile.sh` from a
checked-in manifest (`tools/checks/profiles.conf`), so a later step adds a check by adding one file and one
line rather than by editing a runner.

Exit codes are part of the interface: `0` ok, `1` rule violation, `2` needs input, `3` tooling or
environment problem, `4` stale index. Any command an agent consumes accepts `JSON=1` and emits a stable
machine-readable object. `PLAN=1` prints the resolved execution plan without running it.

## Alternatives considered

- **`just`, `mise`, `task`** — better ergonomics than `make`, but each is a new binary that every developer,
  agent and CI runner must install before it can run *anything*. That is a bootstrap dependency on the one
  command whose job is to remove bootstrap dependencies.
- **npm scripts** — would force a Node toolchain onto anyone touching only the backend, and cannot
  reasonably express a Python-only path.
- **`tox` / `nox`** — Python-only; leaves the frontend and ops units unserved.
- **A single `./run` shell dispatcher without `make`** — viable and nearly equivalent. Rejected as the *only*
  surface because `make`'s target list gives free discoverability (`make help`, shell completion) and is the
  convention a cold agent is most likely to try unprompted. It is, however, kept alongside `make` — see the
  amendment below.

`make` and `sh` are present on every developer machine and every CI runner in use. The cost of this decision
is `make`'s tab-sensitivity and its poor argument passing, both of which are contained by keeping recipes to
a single delegating line.

## Amendment, 2026-08-04 — `./run` is kept as the exit-code-faithful surface

Implementing this ADR surfaced a constraint that invalidates part of it: **GNU make reports exit code `2`
for any failed recipe.** It cannot pass through the documented exit codes (`1` rule violation, `2` needs
input, `3` tooling, `4` stale index), which makes those codes unreachable for the automation they exist to
serve. `make map` returned `2` where the interface promised `3`.

Rather than weaken the exit-code contract, the repository keeps both surfaces over one implementation:

- `./run <command>` — the dispatcher, and the single place mapping a command name to a script. Exit codes
  are exact. This is what agents, CI and any script should call.
- `make <command>` — a pure alias layer, one delegating line per target. Discoverable, and what a human
  reaches for first.

Both accept the same `JSON=1` / `PLAN=1` modifiers, so a command copied from the documentation behaves
identically either way. `RULE-TI-001` checks that the Makefile, the dispatcher and `docs/task-interface.md`
all offer exactly the same command set, in all three directions — the cost of a second surface is that it
can drift, so drift is made a gate failure.

## Consequences

- Adding a verification check is one new file in `tools/checks/` plus one line in `profiles.conf`.
- Recipes must never grow logic; anything conditional belongs in a script, where it is testable.
- The interface itself becomes a surface that can drift from its documentation, so `RULE-TI-001` and
  `RULE-TI-002` check that the Makefile targets and `docs/task-interface.md` agree in both directions.

## Related

- ADR 0002 (Python interpreter provisioning: `uv` preferred, `venv` fallback)
- `docs/task-interface.md` — the command reference this ADR justifies
- `docs/plan/phase-0-2.md` §2.1 — the proportionality review that rejected a task orchestrator
