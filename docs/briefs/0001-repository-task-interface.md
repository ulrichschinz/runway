# Change Impact Brief 0001 — Repository task interface and clean-clone bootstrap

> Written by hand. Step 10 delivers `make brief`, which generates this same structure from the index and
> the working diff; the field list here is the format that tooling will target.

| Field | Value |
|---|---|
| **Requested outcome** | One repository-owned command surface, usable by any agent or a human with a shell, plus a CI job that proves the repository builds from a clean clone. |
| **Owning unit** | `ops` (repository scope 1, see `docs/plan/phase-0-2.md` §1.1) |
| **Applicable contracts** | None yet — the root contract lands in Step 9. This step creates `docs/task-interface.md` and `rules/ledger.yaml`, which Step 9 folds into `AGENTS.md`. |
| **Rule IDs introduced** | `RULE-HYG-001`, `RULE-HYG-002`, `RULE-TI-001`, `RULE-TI-002`, `RULE-GATE-001` |
| **Entry points** | `Makefile` → `tools/*.sh` → `tools/checks/*.sh` |
| **Relevant flow** | `make check` / `make verify` → `tools/run-profile.sh <profile>` → reads `tools/checks/profiles.conf` → runs each selected check → aggregates findings → enforces the runtime budget → emits human or JSON output. |
| **Affected public surfaces** | **None.** No REST, MCP, DB, env-var, or SPA surface is touched. One new *internal* surface is created: the task interface itself (commands, exit codes, JSON shape), which Step 9 records in the contract. |
| **Known dependents** | `.github/workflows/verify.yml` (created here). `deploy.yml` is **not** modified — gating the deploy is Step 16a. |
| **Uncertain / dynamic areas** | Whether `pip install` of the pinned dependency set succeeds on a Python newer than 3.12 — mitigated by pinning the interpreter to 3.12 via `uv` when available. Not yet verified: behaviour of `make bootstrap` on a machine without `uv` and without Python 3.12 (falls back with a warning; CI covers the uv path only). |
| **Analogous implementations** | None in this repository — this is the first tooling of its kind here. |
| **Delivery Pattern** | **New Capability** — owner (`ops`), contract (`docs/task-interface.md`), vertical slice (Makefile → runner → checks → CI), failure behaviour (documented exit codes; `needs-input` names the missing field), tests (three executable checks plus CI proving a clean clone bootstraps). |
| **Required tests** | CI must perform a clean checkout and run `make bootstrap && make doctor && make verify` green. Each of the three checks must be demonstrably capable of failing (negative fixtures are formalised in Step 2). |
| **Intended scope** | `Makefile`, `tools/**`, `rules/ledger.yaml`, `docs/**`, `.github/workflows/verify.yml`, a short pointer added to `README.md`, one `.gitignore` line. **No file under `backend/app/` or `frontend/src/` is touched.** |
| **Base revision** | `1b06703` |
| **Index revision** | n/a — the index pillar lands in Step 5. |

## Scope deviations (recorded after implementation)

| Deviation | Why |
|---|---|
| **Added `./run` at the repository root** — not in the declared scope, and a new top-level file | Implementation disproved an assumption in ADR 0001: GNU make reports exit `2` for *any* failed recipe, so the documented exit codes were unreachable through `make`. `make map` returned `2` where the interface promised `3`. Either the exit-code contract or the single-surface assumption had to give; the contract is load-bearing for automation, so `make` became a pure alias layer over an exit-code-faithful dispatcher. ADR 0001 carries a dated amendment, and `RULE-TI-001` was extended to check all three surfaces agree. |
| **Added `tools/fixtures/negative.sh`** — inside the declared `tools/**` scope, but beyond the step's stated intent | Step 1 could not honestly claim a green gate without evidence that its checks can go red. The script constructs a real violation of each of the five rules and observes the gate fail. Step 2 wires it into the verify profile; here it is run on demand. |
| **`.gitignore` was not modified** — one declared scope item went unused | The existing `.gitignore` already satisfied `RULE-HYG-002` in full. The rule was written to match reality rather than reality changed to match the rule. |

The deviation is material but does not touch any frozen element (organizing axis, public promise, security
invariant, target boundary, acceptance criterion), so it is recorded here rather than escalated as a replan.

## Behaviour change

**None.** No application code is modified. `docker-compose.yml`, both Dockerfiles, and `deploy.yml` are
unchanged.

## Rollback

`git revert` of the single commit. Nothing outside the repository is mutated: no GitHub settings, no
registry, no deploy host. `make bootstrap` writes only to git-ignored paths (`.env`, `users.db`, `data/`,
`backend/.venv/`, `frontend/node_modules/`).

## Temporary mechanisms introduced

| Mechanism | Removal |
|---|---|
| Unimplemented task-interface targets exit `3` with a message naming the step that implements them | Each disappears as its step lands (Steps 2, 3, 5, 7, 10, 16b, 16c) |
| `rules/ledger.yaml` has no validator yet; `fixture:` fields read `pending (Step 2)` | Step 2 adds the first fixtures; Step 9 adds the ledger validator that makes a missing fixture a gate failure |
| Gate failure messages point at `docs/task-interface.md` rather than `AGENTS.md` | Step 9 repoints them at the root contract and the contract self-check enforces the reference resolves |
