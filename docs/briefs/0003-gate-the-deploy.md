# Change Impact Brief 0003 — Gate the deploy, protect the branch, make rollback possible

> **Out of plan order.** This is Step 16a plus the healthcheck half of Step 15, pulled forward after the
> 2026-08-04 incident. Rationale and authority: ADR 0005; approved by the maintainer.

| Field | Value |
|---|---|
| **Requested outcome** | Nothing is built or shipped unless `verify` passes; branch protection is checked-in state with drift detection; a rollback target exists. |
| **Owning unit** | `ops` |
| **Applicable contracts** | `docs/operations.md`, `docs/task-interface.md` |
| **Rule IDs introduced** | `RULE-GOV-001` |
| **Risks recorded** | `RISK-GOV-001` (no independent reviewer), `RISK-GOV-002` (drift check needs network), `RISK-GOV-003` (no automated fixture for `RULE-GOV-001`) |
| **Entry points** | `.github/workflows/{verify,deploy}.yml`, `tools/apply-ruleset.sh`, `tools/checks/branch-protection.sh` |
| **Relevant flow** | `push: main` → `deploy.yml` → `verify` (reusable) → `build-and-push` → `deploy`. A failure at `verify` stops the chain before anything is built or pushed. |
| **Affected public surfaces** | **S7 (container images)** — each image now carries an additional immutable `:<commit-sha>` tag. `:latest` is unchanged, so every existing consumer is unaffected; this is an additive surface change. |
| **Known dependents** | The deploy host, whose compose file is **not in this repository** — see the open question below. |
| **Uncertain / dynamic areas** | Whether the deploy host uses the checked-in `docker-compose.yml` at all. It declares no `image:`, so `docker compose pull` cannot consume the images CI pushes. |
| **Analogous implementations** | None — this is the first governance-as-code in the repository. |
| **Delivery Pattern** | **Security or Operability Change** — failure scenario, control, and adversarial proof. |
| **Required tests** | Drift detection proven against the live API on three real scenarios (recorded in `docs/operations.md#governance-drift-evidence`); `required_status_checks` semantics proven empirically on a throwaway branch. |
| **Intended scope** | `.github/workflows/**`, `docker-compose.yml`, `ops/**`, `tools/**`, `rules/ledger.yaml`, `docs/**` |
| **Base revision** | `9d49aff` |

## Failure scenario, control, adversarial proof

| Failure scenario | Control | Proof |
|---|---|---|
| A commit that fails verification is built and deployed | `build-and-push` and `deploy` declare `needs: verify` | The 2026-08-04 incident is the failing case; the chain now stops at `verify` |
| A red pull request is merged | `required_status_checks` on `verify` | Applied and confirmed live |
| Someone disables protection in the web UI | `RULE-GOV-001` compares live against checked-in state on every `verify` | Three drift scenarios constructed against the live API; all three detected |
| A bypass actor is quietly added | Same check compares `bypass_actors` | Constructed and detected |
| A bad deploy cannot be undone | Immutable `:<commit-sha>` tags | Tags now emitted; **the rollback runbook itself is unverified — see below** |
| A crash-looping container reports success | Healthchecks; `frontend` waits for `backend` to be healthy | Declared; effective only if the host uses this compose file |

## Behaviour change

**Deployment behaviour changes deliberately:** a push to `main` that fails verification no longer produces
an image or reaches the deploy host. That is the point.

No application code is touched. No REST, MCP, DB, env-var or SPA surface changes.

## Rollback

`git revert` restores the previous workflows. The GitHub ruleset is separate repository state: remove it
with `gh api -X DELETE repos/ulrichschinz/runway/rulesets/<id>`, or re-apply an earlier
`ops/github/ruleset.json` with `tools/apply-ruleset.sh`.

## Open question carried forward

The deploy host's compose file is not in this repository, and the checked-in one cannot pull the images CI
pushes. Until that is resolved, the healthchecks and the rollback procedure are **statements of intent, not
verified facts** — recorded prominently in `docs/operations.md` rather than left implicit.
