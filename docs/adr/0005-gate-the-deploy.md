# ADR 0005 — Verification gates the deploy; branch protection is checked-in state

- **Date:** 2026-08-04
- **Status:** Accepted
- **Scope:** `ops`
- **Supersedes:** the plan's ordering, which scheduled this as Step 16a

## Context

The approved plan put deploy gating and branch protection last, on the reasoning that the pillars —
contract, gate, index — should exist before the controls that enforce them. The incident of 2026-08-04
falsified that ordering in one specific way: **every merge deployed straight to production with no gate**,
and two of them shipped a backend that could not start. Twelve more steps at that exposure is a bad trade
when the fix is small.

Step ordering is not a frozen element of the plan (frozen: architecture drivers, organizing axes, public
promises, security and data invariants, target boundaries, acceptance criteria), so pulling this forward
needs no replan — but it does need recording, which is what this is.

## Decision

**1. `verify.yml` becomes a reusable workflow.** It triggers on `pull_request` and `workflow_call`, and no
longer on `push: main`. `deploy.yml` calls it as its first job; `build-and-push` declares `needs: verify`
and `deploy` declares `needs: build-and-push`. Main is therefore verified exactly once, inside the pipeline
that ships it, rather than twice in parallel with no relationship between them.

A cross-workflow `needs:` is not expressible in GitHub Actions, so the alternative — leaving `verify.yml`
independent and hoping the two agree — would have left the deploy ungated in fact while looking gated.

**2. `ops/github/ruleset.json` is canonical checked-in state**, applied by `tools/apply-ruleset.sh` and
compared against the live API by `tools/checks/branch-protection.sh` (`RULE-GOV-001`) on every `verify`.

**3. Both halves of decision F4 hold at once.** F4 asked for a required status check *and* continued direct
pushes to `main`, which appeared contradictory. It was tested empirically on a throwaway branch:
`required_status_checks` gates pull-request merges and does **not** reject direct pushes. So the ruleset
requires `verify`, forbids deletion and non-fast-forward, and does not require a pull request.

**4. Immutable SHA tags and healthchecks.** Every deploy pushes `:latest` and `:<commit-sha>`; before this
there was only `:latest` and therefore no rollback target. Both services declare healthchecks, and the
frontend waits for the backend to be *healthy* rather than merely started.

## Alternatives considered

- **Duplicate the verification steps inside `deploy.yml`** — gives a real `needs:` but two copies of the
  gate that drift apart. Rejected; the reusable workflow gives the same guarantee with one definition.
- **`workflow_run` trigger on `deploy.yml`** — fires after `Verify` completes, but requires inspecting the
  conclusion by hand and runs even on failure unless guarded. More moving parts for a weaker guarantee.
- **Require pull requests on `main`** — the strongest option and the one to revisit if a second contributor
  arrives, but it contradicts F4 and buys little while the same person writes and approves everything.
- **Leave branch protection to the web UI** — rejected: a control that can be switched off without leaving
  a trace is not a control.

## Consequences

- A red `verify` now makes shipping technically impossible, not merely discouraged.
- `RULE-GOV-001` has **no automated negative fixture**: the offline fixture sandbox has no GitHub to drift
  from. Its three drift scenarios were constructed by hand against the live API and all were detected;
  the procedure is recorded in `docs/operations.md#governance-drift-evidence` and the gap as `RISK-GOV-003`.
- The drift check needs network and an authenticated `gh`. Where it cannot reach GitHub it says so and
  passes, because a governance check that goes red on a train is a governance check people delete. That
  gap is `RISK-GOV-002` and belongs to the scheduled decay review, which is the layer that can actually
  prove bypasses and admin merges.
- Step 16 keeps its remaining parts: the scaffold generator and the decay review.
- **The deploy host's real topology remains unknown** — `docker-compose.yml` declares no `image:`, so
  `docker compose pull` cannot consume the images CI pushes. Recorded as an open question in
  `docs/operations.md`; the rollback procedure is written as intent, not as a tested runbook.
