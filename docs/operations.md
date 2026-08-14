# Operations

How this repository is verified, shipped, protected and rolled back.

## The pipeline

```
pull request ──> Verify (verify.yml)                    required to merge
push to main ──> Build and Deploy (deploy.yml)
                   └─ verify        (the same reusable workflow)
                        └─ build-and-push   needs: verify
                             └─ deploy      needs: build-and-push
```

**Nothing is built and nothing is shipped unless `verify` passes.** Before 2026-08-04 this pipeline went
straight from push to build to deploy with no verification of any kind — see [the incident](#incident-2026-08-04)
below for what that cost.

## Branch protection

`RULE-GOV-001`. `ops/github/ruleset.json` is **canonical**; the live GitHub configuration is compared
against it on every `verify`, so a protection switched off in the web UI is detectable rather than silent.

```sh
tools/apply-ruleset.sh          # push the checked-in state to GitHub
./run verify                    # includes the drift check
```

The ruleset requires the `verify` status check, and forbids branch deletion and non-fast-forward pushes.
It does **not** require a pull request. It does, however, require the `verify` status check — and that
**does reject a direct push to `main`**, because a freshly pushed commit has no check runs yet:

```
remote: - Required status check "verify" is expected.
remote: ! [remote rejected] HEAD -> main (push declined due to repository rule violations)
```

**This corrects a claim made on 2026-08-04.** The test that appeared to show direct pushes surviving was
invalid: it pushed a *new branch* matching the rule, which is branch creation, not a push onto a protected
branch. The error was found on 2026-08-14 by trying to push a documentation commit to `main`.

So decision **F4** — a required status check *and* continued direct pushes — is not achievable with this
ruleset. In practice every change has gone through a pull request regardless, so the half that matters holds.
The open choice is recorded in `docs/plan/STATUS.md`: keep PR-only, or drop `required_status_checks` and rely
solely on `deploy.yml` gating, which would restore direct pushes but let a red pull request merge.

Two governance gaps are recorded rather than papered over: `RISK-GOV-001` (a single maintainer cannot be
independently reviewed) and `RISK-GOV-002` (the drift check cannot prove anything from an offline machine).

### Governance drift evidence

`RULE-GOV-001` has no automated negative fixture — the offline fixture sandbox has no GitHub to drift from
(`RISK-GOV-003`). Its violations were constructed by hand against the live API on 2026-08-04, and all three
were detected:

| Drift introduced | Detected as |
|---|---|
| `enforcement` set to `disabled` | `enforcement is 'disabled', want 'active'` |
| `non_fast_forward` rule removed | `rule 'non_fast_forward' is missing from the live ruleset` |
| A bypass actor added | `1 bypass actor(s) configured, want 0` |

Re-run that procedure whenever the check changes.

## Rolling back

Every deploy pushes two tags per image: `:latest` and an immutable `:<commit-sha>`. **Before 2026-08-04
there was only `:latest`, which means there was no rollback target at all** — nothing named the previous
build.

To roll back, pin the last good SHA on the deploy host:

```sh
# on the deploy host
cd /opt/services/runway
export RUNWAY_SHA=<the last good commit sha>
docker compose pull && docker compose up -d --remove-orphans
```

Find candidate SHAs in the Actions run summary of any successful deploy, or:

```sh
gh api /users/ulrichschinz/packages/container/runway-backend/versions \
  --jq '.[] | .metadata.container.tags' | head
```

> **This procedure is unverified.** See the open question below — the compose file the deploy host actually
> uses is not in this repository, so the exact mechanism for pinning a SHA there cannot be confirmed from
> here. Treat the block above as the intended shape, not a tested runbook.

## Health

Both services declare a healthcheck in `docker-compose.yml`, and `frontend` waits for `backend` to be
healthy rather than merely started. A crash-looping container used to be indistinguishable from a working
one: `docker compose up -d` returns success either way.

The backend healthcheck calls `/health` with Python's `urllib`, because the runtime image ships no HTTP
client.

## Open question — the deploy host's compose file

`docker-compose.yml` in this repository declares `build:` for both services and **no `image:`**. The deploy
host runs `docker compose pull && docker compose up -d`, which cannot pull anything for a service that
declares no image name. The images this repository pushes to `ghcr.io` are therefore either consumed by a
**different compose file that is not checked in**, or not consumed at all and the host builds from source.

`DEPLOY.md` is listed in `.gitignore`, which suggests deployment documentation exists outside version
control.

This matters and is not currently answerable from the repository:

- the rollback procedure above cannot be confirmed without knowing how the host selects an image;
- the healthchecks added here only take effect if the host uses *this* compose file;
- if the host builds from source, the images built in CI are decorative and the real build is unverified.

**Until this is resolved, the checked-in deployment topology should be treated as a description of intent
rather than of fact.** Resolving it means either checking in the production compose file (with secrets kept
out) or recording the real topology here.

## Incident 2026-08-04

The backend could not start in any image built after `mcp 2.0.0` was published.

`requirements.txt` pinned nine direct dependencies exactly and nothing transitive. `fastapi-mcp==0.3.3`
declares `mcp>=1.6.0` with no upper bound; `mcp 2.0.0` changed `Server.__init__`, so `import app.main`
raised `TypeError` before uvicorn bound a port.

Nothing reported it. The image built — the failure was at import, not install. The registry push succeeded.
The deploy job went green. The service was down.

What changed as a result:

| Change | Prevents |
|---|---|
| `mcp==1.29.0` pinned (ADR 0004) | this specific break |
| `RULE-DEP-001` — the backend must import cleanly | the whole class, in under a second, on every `check` |
| `verify` gates build and deploy (ADR 0005) | shipping anything that fails verification |
| Healthchecks in compose | a crash-looping container reporting success |
| Immutable SHA tags | having no rollback target |

Still open: transitive dependencies are unpinned as a whole (Step 14's hash-pinned lockfile), and the
deploy host's real topology is unknown (above).
