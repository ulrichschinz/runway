# Change Impact Brief 0002 — Formatters, linters and type checking

| Field | Value |
|---|---|
| **Requested outcome** | Every ecosystem has a formatter, linter and (where typed) a type checker, enforced by CHECK and VERIFY, with a `make fix` that repairs everything deterministic. |
| **Owning unit** | `ops`, touching `backend` and `frontend` |
| **Applicable contracts** | `docs/task-interface.md` (§Formatting, linting and types; §Gate conformance) |
| **Rule IDs introduced** | `RULE-FMT-001`, `RULE-LINT-001`, `RULE-LINT-002`, `RULE-TYPE-001`, `RULE-GATE-002` |
| **Entry points** | `tools/checks/{py-format,py-lint,py-types,js-lint,gate-conformance}.sh`, `tools/fix.sh`, `tools/fixtures/negative.sh` |
| **Relevant flow** | `./run check` → `run-profile.sh` → each check → the ecosystem's tool. `./run verify` additionally runs `gate-conformance`, which runs the fixture suite in a sandboxed copy of the working tree. |
| **Affected public surfaces** | **None.** No REST, MCP, DB, env-var or SPA surface changes. |
| **Known dependents** | `.github/workflows/verify.yml` (unchanged — it calls `make verify`). `make bootstrap` now also installs `backend/requirements-dev.txt`. |
| **Uncertain / dynamic areas** | Whether the ruff `S` (bandit) selection will produce false positives on code not yet written. Two are already recorded as `justified_suppressions`. |
| **Analogous implementations** | Step 1's three checks — same `fail_rule` shape, same profile wiring. |
| **Delivery Pattern** | **Behaviour-Preserving Refactor**, with the characterization step inverted: no tests exist yet (Step 3), so behaviour preservation rests on the mechanical nature of the changes, enumerated below. |
| **Required tests** | `RULE-GATE-002` — all 10 executable rules proven able to fail. Run and green. |
| **Intended scope** | `backend/pyproject.toml`, `backend/requirements-dev.txt`, `frontend/eslint.config.js`, `frontend/package.json`+lock, `tools/**`, `rules/**`, `docs/**`, plus mechanical edits under `backend/app/` and two dead-code removals under `frontend/src/`. |
| **Base revision** | `4d7cacb` |
| **Index revision** | n/a — Step 5. |

## Behaviour change

**None intended.** Every edit to application code falls into one of these classes:

| Class | Sites | Why it preserves behaviour |
|---|---|---|
| `ruff format` whitespace | 10 files | Formatting only; no token changes. |
| Import sorting (`I001`) | 15 | Order of side-effect-free module imports. |
| `Optional[X]` → `X \| None`, `List` → `list` (`UP045`/`UP006`/`UP035`) | 46 | Identical at runtime on 3.12; Pydantic v2 treats both the same. |
| Unused import removal (`F401`) | 2 | `settings` in `routers/auth.py`, `Path` in `task_runner.py` — neither referenced, neither re-exported. |
| Exception chaining `raise ... from e` (`B904`) | 5 | Sets `__cause__` only. Status codes, messages and control flow are unchanged; tracebacks improve. |
| Dead-code removal (frontend) | 2 | An unused `matchMedia` probe, dead since `cb707b4` stopped following the system colour scheme, and an unused `watch` import. |

**The `B904` and dead-code classes are the only ones that touch anything but whitespace, imports and type
annotations.** They are enumerated here precisely because no test yet exists to catch a mistake in them.

## Findings the tools surfaced

Three Phase 0 findings became gate findings with owners and expiry dates rather than prose in a report:

| Finding | Tool | Handling |
|---|---|---|
| SEC-1 default JWT secret | ruff `S105` | `WAIVER-SEC-001` → Step 11 |
| SEC-3 untrusted input to subprocess | ruff `S603` | `WAIVER-SEC-002` → Step 12 |
| SEC-10 migrations swallow every exception | ruff `S110` | `WAIVER-OPS-001` → Step 15 |

Two ruff findings were investigated and **refuted** — recorded as `justified_suppressions` with the
reasoning, not silently ignored:

- `S608` "possible SQL injection" in `routers/auth.py` — only literals from a fixed set are interpolated
  (`"full_name=?"`, `"email=?"`); every value is a bound parameter.
- `S105` "hardcoded password" on `token_type: str = "bearer"` — an OAuth token type name, not a credential.

**One finding is new and was not in the Phase 0 baseline:** mypy found unchecked `Row | None` indexing in
`GET /auth/me` and `PUT /admin/users/{target}/role`. The first is genuinely reachable — a user holding a
valid JWT whose row was deleted gets a `TypeError` and a 500. Deferred as `WAIVER-TYPE-001` because choosing
the right status code changes a hard-promise public surface (F2) and belongs in its own step with tests.

## Rollback

`git revert` of the single commit. Nothing outside the repository is mutated.

## Temporary mechanisms introduced

| Mechanism | Removal |
|---|---|
| 4 `scheduled_remediation` waivers, all expiring 2026-11-04 | Steps 11, 12, 15, and the `WAIVER-TYPE-001` follow-up |
| `rules/waivers.yaml` has no validator, so an expired waiver does not yet fail the gate | Step 9 |
| `B008` disabled for router modules | Permanent — `Depends()` in a default is FastAPI's DI, not a bug |
