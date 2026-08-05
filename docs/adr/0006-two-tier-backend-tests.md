# ADR 0006 — Two test tiers, split at the Taskwarrior boundary

- **Date:** 2026-08-05
- **Status:** Accepted
- **Scope:** `backend`

## Context

This repository had no test of any kind. The risky surfaces — authentication, API-key
issuance, admin role changes, argv construction, irreversible deletes, and the cross-tenant
isolation that rests entirely on `TASKDATA` — were at 0% coverage.

The obstacle is the engine. Every task operation shells out to the Taskwarrior binary,
which is not present on a developer machine, is installed from `archlinux:latest` in the
production image, and publishes no arm64 manifest.

## Decision

**Split at `task_runner._run`.**

**Unit tier** (`tests/unit`, 121 tests, ~1s). `_run` is replaced by an in-memory fake.
Everything above that seam still executes for real: `_build_args`, the validation in
`task_service`, the routers, FastAPI's dependency injection and the error mapping. No
binary, no Docker, no network. Runs in `check` and `verify`.

Faking higher up — at `export_tasks` or at `task_service` — would have been simpler and
would have skipped argv construction, which is exactly where finding SEC-3 lives.

The fake deliberately does **not** emulate Taskwarrior's urgency algorithm, date parsing
or filter DSL. A fake that claimed to reproduce them would be asserting its own behaviour.

**Container tier** (`tests/container`, `backend/Dockerfile.test`). The real binary. Covers
what only it can answer: urgency actually derived from the checked-in coefficients, the
storage format, and cross-tenant isolation — including the adversarial SEC-3 probe.
Runs in `verify` only.

`Dockerfile.test` is a separate file rather than a stage in `backend/Dockerfile`. Adding a
final `test` stage there would make it the **default build target**, and both
docker-compose and the deploy workflow would silently begin shipping an image whose `CMD`
is `pytest`. The cost of that separation is duplicated base images, so `RULE-TI-002` checks
that the two files stay in step.

## Consequences

- **Characterization, not aspiration.** These tests pin current behaviour *including its
  defects*. Six are labelled as defects in place, each naming the step that will change it:
  every registration failure reported as "username already taken"; JWTs surviving a
  password change; the last admin being able to demote themselves; the inbox rejecting the
  `X-Api-Key` header the README says it accepts; a project vanishing from the sidebar when
  its last task completes; and the description-based re-query after `task add`.
- **bcrypt runs at its minimum cost factor** in tests. At the production factor the suite
  took 36 seconds — long enough that the gate would start being skipped. The algorithm is
  unchanged, but the production cost factor is consequently covered by no test
  (`RISK-TEST-003`).
- **The container tier cannot run on arm64** (`RISK-TEST-001`): `pacman` fails under amd64
  emulation. The check detects this and passes with a message rather than failing; CI is
  x86_64 and runs it for real. An Apple Silicon developer never exercises the real binary
  locally.
- **`RULE-TEST-002` has no automated negative fixture** (`RISK-TEST-002`) — the offline
  sandbox has neither Docker nor an x86_64 host.
- Coverage is a **ratchet at 90%** against a current 96%. A floor tracking the exact
  number turns every unrelated refactor into a coverage failure, and a gate that fails for
  irrelevant reasons is one people learn to bypass.
- The unit tier is fast enough (~1s) that `check` stays well inside its budget.

## Related

- ADR 0003 (lint/format/types), ADR 0004 (the mcp incident)
- `rules/waivers.yaml` — WAIVER-SEC-002 records SEC-3 pending Step 12
