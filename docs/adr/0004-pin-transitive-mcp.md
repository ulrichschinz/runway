# ADR 0004 — Pin the transitive `mcp` dependency, and check that the backend can start

- **Date:** 2026-08-04
- **Status:** Accepted
- **Scope:** `backend`, `ops`
- **Context:** production incident, discovered during Step 3

## Context

`backend/requirements.txt` pins nine direct dependencies exactly, but nothing pins their
transitive dependencies. `fastapi-mcp==0.3.3` declares `mcp>=1.6.0` with **no upper bound**.

`mcp 2.0.0` changed `Server.__init__`, which `fastapi_mcp.server` calls with three positional
arguments. From that release onward, any fresh `pip install -r requirements.txt` produces an
environment where `import app.main` raises `TypeError` — uvicorn never binds a port.

The pipeline reported none of this. `deploy.yml` builds the image, pushes it to ghcr.io, and
triggers `docker compose pull && up -d`. The build succeeds because the failure is at import
time, not install time. The push succeeds. The deploy job goes green. **The service is down.**

Two deploys ran on 2026-08-04 (from the Step 1 and Step 2 merges), both reporting success. The
previous deploy was 2026-05-17, before `mcp 2.0.0` existed — so the running image was healthy
until today's rebuild, and the defect had been latent in the repository since the day
`mcp 2.0.0` was published.

## Decision

1. **Pin `mcp==1.29.0`** in `requirements.txt`, with the reason recorded inline. 1.29.0 is the
   last 1.x release and is verified to import cleanly with all 37 routes and `/mcp` mounted.
2. **Add `RULE-DEP-001`**: the backend must import cleanly from its pinned dependency set.
   `tools/checks/py-import.sh` runs `python -c 'import app.main'`. No server, no database, no
   Docker. It is the cheapest possible signal that the artefact can run at all, it lives in both
   `check` and `verify`, and it is non-waivable.

## Alternatives considered

- **Upgrade to a `fastapi-mcp` that supports `mcp` 2.x** — the right long-term fix, but it changes
  the MCP surface, which F2 treats as externally consumed and hard-promised. That belongs in its
  own step with the surface snapshot from Step 13, not in a hotfix while the service is down.
- **`mcp<2` instead of an exact pin** — leaves the same class of failure open at the next 1.x
  release. Every other runtime dependency here is pinned exactly; this one should match.
- **Wait for Step 14's hash-pinned lockfile** — correct and still planned, but it does not restore
  a service that is down now.

## Consequences

- Full transitive pinning remains outstanding. This ADR fixes one dependency; **Step 14 must
  generate a hash-pinned lockfile covering the whole tree**, because the same class of failure is
  open for the other eight direct dependencies and everything under them.
- `RULE-DEP-001` catches the whole class in under a second, on every `check`.
- The deploy pipeline still cannot tell a healthy container from a crash-looping one. `deploy.yml`
  gates on nothing today; **Step 16a puts `verify` in front of it, and Step 15 adds the container
  healthcheck** that would have caught this at the deploy rather than in a test run.
- The incident is evidence for the Phase 0 findings SEC-9 (non-reproducible builds) and SEC-11
  (unverified deploy) being correctly rated, and for their remediation steps being scheduled too
  late in the plan. Recorded for the Step 4 replan review.
