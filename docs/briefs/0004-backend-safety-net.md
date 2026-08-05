# Change Impact Brief 0004 — Backend behavioural safety net

| Field | Value |
|---|---|
| **Requested outcome** | Pin current observable backend behaviour so later steps — especially the security fixes in Steps 11 and 12 — can be shown to change only what they intend. |
| **Owning unit** | `backend`, with `ops` wiring |
| **Applicable contracts** | `docs/task-interface.md#tests`, ADR 0006 |
| **Rule IDs introduced** | `RULE-TEST-001`, `RULE-TEST-002`, `RULE-TEST-003` |
| **Risks recorded** | `RISK-TEST-001` (no container tier on arm64), `RISK-TEST-002` (no automated fixture for the container tier), `RISK-TEST-003` (production bcrypt cost untested) |
| **Entry points** | `backend/tests/`, `backend/Dockerfile.test`, `tools/checks/py-test-*.sh`, `tools/test.sh` |
| **Relevant flow** | `check` → unit tier (fake at `task_runner._run`). `verify` → unit tier + container tier (real binary in Docker). |
| **Affected public surfaces** | **None.** No production code path is modified. |
| **Known dependents** | None — tests are leaves. |
| **Uncertain / dynamic areas** | Whether finding SEC-3 is real. The container tier asserts that isolation holds; its result settles the question either way. |
| **Analogous implementations** | None — first tests in this repository. |
| **Delivery Pattern** | **Behaviour-Preserving Refactor** — the characterization half, run *before* the refactors it protects. |
| **Required tests** | This step *is* the tests. `RULE-TEST-001` and `RULE-TEST-003` carry negative fixtures; `RULE-TEST-002` cannot (`RISK-TEST-002`). |
| **Intended scope** | `backend/tests/**`, `backend/Dockerfile.test`, `backend/pyproject.toml`, `backend/requirements-dev.txt`, `tools/**`, `rules/**`, `docs/**` |
| **Base revision** | `0186cf7` |

## Behaviour change

**None.** No file under `backend/app/` or `frontend/src/` is modified.

## Defects pinned rather than fixed

Characterization means recording what *is*. Six tests assert current behaviour that is
wrong, each labelled in place with the step that will change it:

| Pinned behaviour | Why not fixed here |
|---|---|
| Any registration failure reports "Username already taken" | Distinguishing causes needs error-path coverage this step is creating |
| A JWT keeps working after its owner changes password | Session invalidation is a design decision on a hard-promise surface |
| The last admin can demote themselves, locking everyone out | Belongs with the admin bootstrap in Step 11 |
| `/inbox` rejects `X-Api-Key`, which the README says works everywhere | SEC-6; Step 11 unifies the paths behind a tracked shim |
| A project disappears from the list when its last task completes | Product decision, not a defect to fix silently |
| `create_task` re-queries by description, so duplicates are ambiguous | Step 12 replaces it with the UUID from `task add` |

## SEC-3 — the open question this step settles

`tests/container/test_real_task.py` asserts that a task description shaped like
`rc.data.location=<other user's directory>` cannot redirect the Taskwarrior data store.

Taskwarrior consumes `rc.<key>=<value>` anywhere in its argument list, and `_run` places
user tokens *after* its own `rc.` flags. If the binary treats such a description as an
override rather than as text, the only cross-tenant boundary in this system is bypassable
by typing a task title.

**A failure of that test is a confirmed critical vulnerability, not a flake.** It cannot be
run on this arm64 machine, so the answer comes from CI.

## Rollback

`git revert`. Tests are additive; nothing outside the repository is touched.
