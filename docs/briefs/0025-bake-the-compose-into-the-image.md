# Change Impact Brief 0025 — The compose file travels in the image, because the mechanism we documented never existed

Not a plan step. A correction, found while carrying out the installation runbook that commit `135ab62`
left behind: the forced command this repository documented, reviewed and merged was never installed on the
deploy host, and the host has all along run a shared script that deploys compose files by extracting them
from images. Runway's images carried none, so its configuration never shipped.

| Field | Value |
|---|---|
| **Requested outcome** | Make this repository actually determine its own deployment, having established that it does not. Adopt the mechanism the deploy host already runs rather than replacing it for one service; retract the false claims in the three places that carried them; and record why a gate that checks every repository fact could not catch a claim about a machine. |
| **Owning unit** | `ops`, `docs` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md), [`docs/operations.md`](../operations.md) |
| **Governed by** | [`adr:0032`](../adr/0032-the-deploy-mechanism-correction.md). |
| **Rule IDs introduced** | **None.** No new rule. The gate cannot reach the fact that was wrong: every check here reads the repository, and the claim was about a host CI has no access to (`RISK-OPS-002`). Inventing a rule that re-checks repository facts would add enforcement precisely where enforcement was not missing. |
| **Risks recorded** | Two updated in [`rules/ledger.yaml`](../../rules/ledger.yaml), neither new. `RISK-DOC-004` is **re-opened** — its trigger was "a fifth stale claim is found", and this is the fifth and the first that was never true rather than merely rotted. `RISK-OPS-002` is **narrowed**: drift is now corrected by every deploy instead of detected, but nothing verifies the write happened and the host script's fall-through is silent, which is exactly how six days of deploys shipped images without configuration while reporting success. |
| **Entry points** | [`backend/Dockerfile`](../../backend/Dockerfile), [`.dockerignore`](../../.dockerignore), [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml), [`docker-compose.yml`](../../docker-compose.yml), [`ops/deploy/docker-compose.yml`](../../ops/deploy/docker-compose.yml), [`docs/operations.md`](../operations.md), [`rules/ledger.yaml`](../../rules/ledger.yaml), [`index/manifest.toml`](../../index/manifest.toml) |
| **Affected public surfaces** | **None.** No route, no MCP tool, no schema, no environment variable, no SPA key; the snapshots under [`ops/surfaces/`](../../ops/surfaces) are unchanged and no `./run` command is added or removed. The backend image gains a file at `/opt/stack/docker-compose.yml`, which is consumed by the deploy host and by nothing a third party can reach. |
| **Known dependents** | **None** in the import graph — nothing here is imported by anything. The real dependents are a build context and a host script. Widening [`backend/Dockerfile`](../../backend/Dockerfile)'s context from `./backend` to the repository root means every `COPY` in it had to be re-rooted, and the root [`docker-compose.yml`](../../docker-compose.yml) had to move with it or a local build would resolve paths differently from the shipped one. [`backend/Dockerfile.test`](../../backend/Dockerfile.test) is deliberately untouched: the container tier builds it with `./backend` as its context, and Docker reads the `.dockerignore` beside each context root. |
| **Uncertain / dynamic areas** | `BLIND-OPS-001` and `BLIND-TEST-001`, both reported and both real here. Nothing in this repository can observe the host extracting the baked file; that is the residue of `RISK-OPS-002` and the reason this brief claims a mechanism rather than an outcome. The verification that matters was done by hand after the deploy and is recorded in [`docs/operations.md`](../operations.md). |
| **Analogous implementations** | The `lethos` service on the same host, which bakes its compose at the same service-agnostic path and builds with the repository root as its context — the pattern this change adopts rather than invents. Within this repository, [`ops/deploy/docker-compose.yml`](../../ops/deploy/docker-compose.yml)'s existing `${...}` discipline under `RULE-HYG-003`, which is what makes a file safe to bake into an image at all. |
| **Delivery Pattern** | **Security or Operability Change.** It moves no public surface and changes no application behaviour; it changes how configuration reaches the host, and it widens what a merge to `main` determines there. Not a rule change — nothing is added to the gate, so the meta-rule's four parts do not apply. |
| **Required tests** | No fixture, because no rule is added. The evidence is a build-context probe run before anything else: a throwaway image proving that `backend/requirements.txt`, `backend/app/` and `ops/deploy/docker-compose.yml` all resolve inside the new context, and a second proving `frontend/` does **not** — the deny-all `.dockerignore` doing its job in both directions. Beyond that, `verify` must stay green and the next deploy must be checked on the host by hand. |
| **Intended scope** | The deploy mechanism and the documents that described it. Explicitly **not** in scope: `SHIM-SEC-006`, whose removal needs an observation window on the deployed audit log; the `WAIVER-SEC-003` fix, which is a public-surface migration of its own; and the Cold-Agent test, which needs a session that has not read any of this. |

## Behaviour change

Nothing the application does changes. What changes is what a merge to `main` decides on the deploy host.

Before: the backend image carried application code. The host's shared script looked for a baked compose
file, found none, and left the on-disk `docker-compose.yml` alone — whatever someone had last edited by
hand. Configuration and code shipped on different schedules, and only one of them was in version control.

After: the backend image also carries `ops/deploy/docker-compose.yml` at `/opt/stack/docker-compose.yml`.
The same host script finds it, writes it over the on-disk copy, and then pulls and restarts. Configuration
and code ship together, from one source, through the same review.

The widening is real and is stated plainly in [`docs/operations.md`](../operations.md): compose can mount
host paths, join the host network namespace and ask for privilege, none of which application code can do
from inside a container. `RULE-OPS-003` refuses those edits and `RULE-HYG-003` refuses a literal secret
where a `${...}` reference belongs. Neither is a sandbox and neither is claimed to be.

## What was wrong, and how it was found

The runbook said to repoint the deploy key with a `sed` addressed to a line containing `docker compose
pull`. Reading the host first showed that string occurs in no `authorized_keys` there. The deploy account
holds one key per service, each forced to `sudo /opt/scripts/deploy.sh <service>` — a script shared by all
eight services, which had been deploying compose files by extracting them from images for as long as anyone
had been claiming otherwise.

Had the documented script been installed, it would have failed anyway: the deploy account may `sudo` exactly
one program, so every privileged call inside it would have been refused, and it fails closed.

This is the fifth stale claim about production on this programme and the first that was never true. The
other four were accurate when written and rotted. This one described a mechanism the repository had authored
rather than one it had observed — and no check here can tell those apart, because the difference lives on a
machine the gate cannot reach.
