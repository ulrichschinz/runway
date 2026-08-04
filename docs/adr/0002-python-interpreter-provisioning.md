# ADR 0002 — `make bootstrap` prefers `uv` for the Python interpreter, falling back to `venv`

- **Date:** 2026-08-04
- **Status:** Accepted
- **Scope:** `backend`, `ops`

## Context

`backend/Dockerfile` runs on `python:3.12-slim`, but a developer machine may carry any interpreter — this
one carries 3.14. The pinned dependency set (`passlib 1.7.4`, `bcrypt 4.0.1`, `python-jose 3.3.0`) is old
enough that installing it under a much newer interpreter is not safe to assume. A clean clone must
nevertheless bootstrap without the developer hand-installing a specific Python.

## Decision

`make bootstrap` provisions the backend virtualenv with `uv venv --python 3.12` when `uv` is available,
because `uv` will fetch a matching interpreter rather than failing. When `uv` is absent it falls back to
`python3 -m venv`, and `make doctor` reports which path was taken and warns when the resulting interpreter's
minor version differs from the one declared in `tools/versions.env`.

`uv` is therefore **preferred but never required**. No command on the required path fails when it is absent.

## Alternatives considered

- **Require `uv`** — cleaner and fully reproducible, but makes the tool a hard prerequisite of the one
  command meant to work from a bare clone. Rejected for the same reason `just` was rejected in ADR 0001.
- **`pyenv` / `asdf` / `mise`** — solve interpreter provisioning well, but are heavier prerequisites and
  none of them also solve the hashed-lockfile problem that Step 14 needs.
- **Docker-only development** — already how the app is *run*, but it makes the fast local `check` loop slow
  enough to be bypassed, which is exactly what CHECK's runtime budget exists to prevent.

## Consequences

- `uv` becomes the natural choice for the hash-pinned lockfile in Step 14, since it is already on the
  preferred path here.
- `tools/versions.env` becomes the single source of truth for the declared runtime versions, and
  `RULE-TI-002` checks that both Dockerfiles agree with it. Step 14 extends that rule from tags to digests.
- Two bootstrap paths mean two behaviours to keep working. CI exercises the `uv` path; the fallback path is
  covered only by `make doctor`'s warning. **Recorded as residual risk** in `docs/task-interface.md`, with
  the re-open trigger: a second contributor reports a bootstrap failure.

## Related

- ADR 0001 (task interface)
- `tools/versions.env`, `tools/bootstrap.sh`, `tools/checks/toolchain-pinning.sh`
