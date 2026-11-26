# ADR 0049 — The verify budget is 1200 seconds

- **Date:** 2026-11-26
- **Status:** Accepted
- **Scope:** `tools/checks/budgets.conf` (`verify`), `RULE-GATE-001`
- **Decided by:** the maintainer, on 2026-11-26, during the deploy of the security remediation

## Context

`verify` had a budget of 600 seconds from Step 1 on. It ran in about 60 to 140 seconds for months.
The security remediation (plan `docs/plan/security-remediation-2026-11.md`, milestones M1 to M9)
adds adversarial unit, container and fixture tests with every package. On GitHub's amd64 runner,
where the container tier actually runs (on arm64 it is skipped, `RISK-TEST-001`), the gate grew
past the budget while the work was being merged:

| Run | Unit tests | `verify` on CI |
|---|---|---|
| M1 (PR #89) | 786 | ~260 s |
| M2.1 on `main` | — | 607 s (red), green on rerun |
| M4 (PR #95), attempt 1 | 1126 | 603 s (red) |
| M4 (PR #95), attempt 2 | 1126 | 718 s (red) |

In the M4 run, the unit suite took 2 minutes and `gate-conformance` (the sandbox's full `check` followed by
60 fixture arms) took 7. Nothing failed; only `RULE-GATE-001` turned red. M5 to M9 bring further tests.

## Decision

`verify=1200`. `check` stays at 180 s. The point of `RULE-GATE-001` still holds: a gate that slows down without
anyone noticing gets bypassed. That is exactly why the budget is raised here with numbers, not
quietly, and why it does not go higher than the remediation needs.

## Consequences

- A merge on `main` waits up to about 20 minutes for `verify` before the deploy starts.
- The time goes back down by making the gate parallel (unit suite across processes, fixture arms in
  parallel sandboxes), not by raising the budget again. Re-open trigger: `verify` on CI over
  900 s, or the parallel gate is done (then the budget comes back down).
