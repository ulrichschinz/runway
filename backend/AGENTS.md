# backend/AGENTS.md — scoped contract

Refines the root [`AGENTS.md`](../AGENTS.md) for this unit. It may not weaken a root rule;
`RULE-DOC-003` fails the build if it tries.

## Layers

`be/app` (assembly) → `be/routers` → `be/services` → `be/adapters/{db,task}` → `be/leaves`,
with `be/di` providing what routers inject. Declared in `architecture.toml`, enforced by
`tools/checks/boundaries.sh`.

**Only `be/adapters/task` runs the Taskwarrior subprocess.** A router reaching it directly
skips the validation in `be/services` — that was a real violation until Step 8, and it is
now a gate failure.

**Only `be/adapters/db` opens a database connection.**

## Tests

Two tiers, split at `task_runner._run` (ADR 0006):

- `backend/tests/unit` — Taskwarrior faked at that seam. Everything above it runs for
  real: argv construction, validation, routing, error mapping. No binary, no Docker.
- `backend/tests/container` — the real binary, in `backend/Dockerfile.test`. Urgency,
  storage format, and **cross-tenant isolation**, which rests entirely on three
  environment variables handed to a subprocess.

These are **characterization** tests: they pin current behaviour *including its defects*.
Six defects are asserted as-is and labelled in place with the step that will change them.
A test failing after an intentional change is the point.

Coverage floor is a ratchet, not a target — raise it, never lower it to fit a change.

## Things that will surprise you

- `fastapi-mcp` turns every route into an MCP tool **named after the handler function**.
  Renaming a Python function is a breaking public-surface change.
- Schema migrations are `ALTER TABLE` statements in `init_db()`, run on every start. Only
  "duplicate column name" passes silently — that is the re-run path. Every other database
  error is logged at ERROR and the boot continues, so a failed migration is visible but not
  fatal; the database can still be left half-migrated (`WAIVER-OPS-001`, resolved).
- `bcrypt` runs at its minimum cost factor in tests. At the production factor the suite
  took 36 seconds; the production factor is consequently covered by no test.
