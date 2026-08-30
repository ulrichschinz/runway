# ADR 0031 — Audit the gate against its own claims, and define the cold-agent test before running it

- **Date:** 2026-08-30
- **Status:** Accepted
- **Scope:** `tools`, `rules`, `docs`, `ops`, `index`

## Context

[`docs/plan/phase-0-2.md`](../plan/phase-0-2.md) §16d asks for two things that look like one. The first is
an audit: every gate component gets a conformance test proving it is invoked and that a representative
violation makes it fail, failure messages name the violated rule and point at the right contract section,
branch protection actually *blocks*, and the residual-risk register is reviewed entry by entry. The second
is a benchmark: the Cold-Agent Index and Change Tests, with versioned pass criteria defined **before** the
run.

The second half cannot be done by whoever wrote the first. The precondition is a session carrying no
agent-side cache, knowledge base or session memory of this work, and a session that has just audited the
repository is contaminated by construction — any pass it produced would mean nothing. So this change does
the audit, writes the criteria and builds the harness, and leaves the running to a cold session.

The audit's own premise is that a clean result would itself be a finding. The previous four steps each
surfaced something real, and 16c's first decay review returned `attention` with four findings on a
repository that had been green for weeks.

## Decision

**1. `RULE-GATE-002` counts rules, not fixture arms.**

`tools/fixtures/negative.sh` printed *"47 rule(s) proven able to fail"*. That was the count of arms. Several
rules have more than one arm — `RULE-OPS-001` is proven twice, once for the subprocess and once for an
egress call — so the number ran three ahead of the rule count, and every document downstream repeated it as
a rule count, including [`docs/task-interface.md`](../task-interface.md)'s statement of what a green `verify`
means.

It had already cost something. `RULE-GOV-002`'s ledger entry declined to automate its second fixture arm on
the reasoning that doing so *"would report forty-eight rules where forty-seven exist"* — an argument against
adding a proof, resting on an equality that never held.

The suite now derives the claim instead of printing a counter. It reads the ledger for the rules that name
`tools/fixtures/negative.sh` as their fixture, records which rule id each arm was observed failing on, and
fails when a rule that declares an automated fixture was not exercised. It reports both numbers, labelled:

```
  48 fixture arm(s) passed, 0 failed
  42 of 45 executable rules proven able to fail; 3 declare no automated fixture (…)
```

**2. Three rules declare no automated fixture, and that is the whole list.**

The audit checked every one of the 27 entries in `tools/checks/profiles.conf`: each has a script, each
script is invoked by the profile it declares, and each has at least one arm — with exactly three exceptions,
all of them previously declared and justified rather than silently missing. `RULE-TEST-002` needs Docker and
an x86_64 host (`RISK-TEST-002`); `RULE-GOV-001` needs a live GitHub to drift from and its three drift
scenarios were constructed by hand (`RISK-GOV-003`); and `RULE-GATE-002` is the fixture suite, so an arm for
it would have to make the suite fail from inside itself. The third had no risk id and now has one:
`RISK-GATE-001`.

**3. `RULE-DOC-005` — a rule's `contract:` pointer must resolve.**

Failure messages were audited by reading what `fail_rule` in `tools/lib.sh` actually prints. It prints the
ledger's `contract:` field as the `why:` line and the `fix:` field as the `fix:` line, which is right — but
nothing checked that the pointer went anywhere. All forty-four resolved when checked by hand, and nothing
was holding them there: a renamed heading leaves a message that still prints, still looks authoritative, and
sends the reader to the top of a document instead of to the paragraph that explains the failure.

`RULE-DOC-005` resolves the file and, where an `#anchor` is given, the heading that produces it. Four parts
in the same commit, as the meta-rule requires: the check in `tools/checks/contract_check.py`, the ledger
entry, the arm in the fixture suite — which renames a heading rather than deleting a file, because renaming
is how this actually breaks — and the contract text in
[`docs/task-interface.md`](../task-interface.md#adding-a-check).

Two message defects were repaired while auditing them. `RULE-IDX-001`'s stale-index path — the failure a
contributor here meets more often than any other — named neither the rule nor the contract, printing only
`the index is stale`; it now prints the rule id, the `why:` and the `fix:`, while still exiting `4` rather
than `1`, because a stale answer is not a rule violation. And that rule's `fix:` read `make fix (or make
index)`, which is two commands where the plan asks for the exact one; `make fix` rebuilds the index, so it
is now the only one named.

**4. Branch protection: what can be established without a pull request, and what cannot.**

`RULE-GOV-001` compares the live ruleset against [`ops/github/ruleset.json`](../../ops/github/ruleset.json).
That is a claim about *configuration*, not about *behaviour*, and the plan asks for the behaviour: a gate
that runs but does not block is advice.

Three things were established read-only against the live API on 2026-08-30, and they are recorded here
because they are the strongest available evidence short of a merge:

- the `main-protection` ruleset exists, `enforcement` is `active`, and `bypass_actors` is empty;
- GitHub's own evaluation of what applies to `main` — `repos/…/rules/branches/main`, which is the API
  answering *"which rules govern this branch?"* rather than the file asserting it — returns `deletion`,
  `non_fast_forward` and `required_status_checks` with context `verify`;
- all twenty merged pull requests in this repository's history had a **successful** `verify` check run on
  their head commit at merge time.

None of that is the claim. GitHub evaluates a required status check when a merge is *attempted*, so the
blocking behaviour is only observable by attempting one, and twenty green merges are equally consistent with
"nobody ever tried to merge red". The honest position is that the blocking half is asserted from
configuration; it is recorded as `RISK-GOV-006` rather than assumed.

**The procedure a human must run to settle it**, which takes about five minutes and merges nothing:

1. `git checkout -b protection-probe` from `main`; commit a change that makes `verify` fail deterministically
   and is obviously a probe — appending a line to `AGENTS.md` breaks `RULE-DOC-001`, or a stray identifier in
   an ADR breaks `RULE-DOC-004`. Push the branch.
2. Open a pull request into `main` and wait for the `verify` check to report a conclusion of `failure`.
3. **Observe, do not click.** In the pull request's merge box, the merge button must be disabled and the
   status must read that the required check has not succeeded. Confirm the same from the API:
   `gh pr view <n> --json mergeStateStatus` must return `BLOCKED`, not `BEHIND`, `UNSTABLE` or `CLEAN`.
4. Record the pull request number, the check conclusion and the verbatim `mergeStateStatus` in
   `docs/briefs/` or an amendment to this record, then **close the pull request and delete the branch.**
   Do not merge it, and do not use an admin override to test the override — that tests a different control.
5. Update `RISK-GOV-006`: if `mergeStateStatus` is `BLOCKED`, the risk is resolved and the evidence replaces
   the assertion. If it is anything else, protection is advice and that is a finding, not a formality.

Doing this needs the maintainer's own account and a pull request, which is why it is written down here
rather than performed. The natural home for the procedure is
[`docs/operations.md`](../operations.md#branch-protection); it is here because that file was out of scope for
this change.

**5. The register was audited entry by entry, and three triggers could never have fired.**

All thirty-five residual risks carried an owner, a re-open trigger and a decision record, and the checkable
statements were re-verified rather than believed — `RISK-ARCH-002`'s five unattributed baselines are still
exactly five of seven, `RISK-TI-001`'s five of twenty-one commands is still five of twenty-one,
`RISK-OPS-007`'s claim that the application makes no network egress still holds, and `RISK-SEC-005`'s route
outside `backend/app/routers/` is still `GET /health` and only that.

Three triggers named a step rather than an event, and the step had already landed:

- `RISK-TEST-002` and `RISK-GOV-003` both read *"Step 9's ledger validator requires an automated fixture for
  every executable rule."* Step 9 landed in PR #11 and its validator requires a **declared** fixture, not an
  automated one — deliberately, since prose is how these two rules record why they cannot be automated. The
  trigger therefore described something that had already happened without occurring, and could never fire.
- `RISK-GOV-002` read *"the scheduled decay review (Step 16c) begins carrying this evidence."* 16c landed on
  2026-08-30 and none of its six diagnostics touches the rulesets API. Same defect.

All three now name observable events. A re-open trigger that points at a plan step is a trigger with a
deadline instead of a condition, and when the step passes it goes quiet rather than firing.

**6. `index/manifest.toml` and the index disagreed about what the index cannot see.**

The manifest's `[unsupported]` list held six mechanisms; the graph carries seven. `BLIND-TEST-001` —
import-derived test protection, which sees no `TESTED_BY` edge for anything exercised through the FastAPI
`TestClient` — was added to the builder and never to the manifest. The manifest also still listed
`BLIND-MCP-001` as unsupported, which the graph records as resolved by runtime observation in Step 13.

Nothing reads `[unsupported]`: blind spots come from `_declare_global_blind_spots` in `tools/index/build.py`,
so the manifest is prose *about* the index rather than input *to* it. Both copies are corrected; that nothing
keeps them together is `RISK-IDX-002`. This is not tidiness — the manifest is what a reader is pointed at to
learn what the index cannot see, and a benchmark that scores an agent on flagging the declared blind spots
has to be scored against the right number.

**7. The gate's own Python is held to a lower standard than the application it judges.**

ruff runs over `backend/app`, `backend/tests` and `tools/index`; mypy's `files` list is `backend/app` alone.
That leaves the ten check implementations under `tools/checks/` and the five command implementations under
`tools/` — about 4,300 lines — outside every one of them. These are the programs that decide whether a
change is mergeable and that an agent is told to trust over its own reading of the tree. Widening the scope
would land a pile of findings in one commit, which is exactly why `RULE-LINT-001` was introduced narrow, so
this change records the asymmetry as `RISK-GATE-002` rather than fixing it inside an audit.

**8. The Cold-Agent criteria are versioned, complete, and written before any run.**

[`ops/cold-agent/criteria.md`](../../ops/cold-agent/criteria.md), version 1.0.0. Twelve Index Test questions
with mandatory facts, three Change Test requests written out verbatim so they cannot be paraphrased into
leaking their answers, a query and time budget for each section, a precise definition of an invented
authoritative edge, the seven blind spots as a named list, a `grep`/manual baseline with a stated production
procedure, a six-way classification for every miss, and a scoring rule with no middle grade.

Three decisions inside it are worth naming here.

*The precondition is measured, not declared.* Four of the five evidence items — a purge command, a launch
command, cache paths, a green gate — can all be satisfied by an operator who purged the wrong thing. The
fifth is a **negative control**: before the session is given any repository access, it is asked what it
already knows about `runway`, and an answer containing a rule id, a unit id, a count, or the phrase "decay
review" **voids the run**. Void is not fail: a contaminated pass and a contaminated fail are equally
uninformative, and scoring one as a fail invites a re-run until the number is liked.

*Grepping to the right answer fails.* `RISK-DOC-001` records that "query the index first" cannot be
enforced. The benchmark is where it is at least *measured*: the count of manual reads before the first index
query must be zero. The whole justification for building the index was that grep gives strings and the index
gives consequences — if grep gets there just as well, that is the finding.

*"Close" does not pass, and the scorer exists to keep it that way.* `tools/cold_agent_score.py` deliberately
does not read the transcript and cannot judge an answer; marking a criterion is human judgment, and if it
were not, this would be a check and would live in `verify`. What it automates is the part that gets fudged
under time pressure: leaving a criterion unmarked, rounding eleven of twelve up, scoring a run against
criteria adjusted after the result was seen, and reporting a void run as a fail.

## Consequences

- The gate proves **42 of 45** executable rules able to fail over 48 fixture arms, and says so in two
  numbers rather than one. Three rules declare in the ledger why they cannot be automated.
- A renamed heading in a contract document now fails the gate instead of silently breaking every failure
  message that pointed at it.
- Four new residual risks — `RISK-GATE-001`, `RISK-GATE-002`, `RISK-IDX-002`, `RISK-GOV-006` — and three
  repaired re-open triggers. The register holds thirty-nine entries.
- Whether branch protection *blocks* remains unproven, with a five-minute procedure written down and a risk
  id carrying it. This change deliberately did not open a pull request to find out.
- The Cold-Agent tests can now be run and scored by someone who was not here, against criteria that predate
  the run. Nobody has run them.

## Alternatives considered

**Run the cold-agent tests here.** Rejected on the plan's own terms: this session read the repository in
depth to perform the audit, so its negative control would fail its own precondition. A pass produced by a
contaminated session is worse than no result, because it would be recorded as evidence.

**Make `RULE-GATE-002` require an automated fixture for every rule, with no prose exemption.** Rejected. It
would make the rule unsatisfiable for `RULE-TEST-002` and `RULE-GOV-001` on any machine that is not a
GitHub-connected x86_64 Linux host, and the predictable outcome is that someone deletes the rule or writes a
fixture that asserts nothing. A declared, risk-carrying exemption is weaker than a proof and much stronger
than a fixture that passes vacuously.

**Widen ruff and mypy over `tools/` as part of this change.** Rejected as scope. An audit that also lands
several hundred lint fixes stops being reviewable as an audit, and the finding is more useful recorded than
half-fixed.

**Write the cold-agent criteria after a trial run, so they are calibrated.** Rejected — this is the one part
of 16d that cannot be done afterwards without destroying it. Criteria fitted to an observed result are a
description of that result.

## What this does not settle

- Whether branch protection blocks (`RISK-GOV-006`).
- Whether an agent actually queries the index rather than grepping (`RISK-DOC-001`). The criteria measure
  it; nobody has run them.
- Whether the wrapper that turns a failing fixture suite into a red gate works (`RISK-GATE-001`).
- Whether `index/manifest.toml` and the index's blind spots stay in agreement (`RISK-IDX-002`).
- Whether anyone acts on a finding. That is `RISK-GOV-005`, and it applies to this record as much as to a
  decay review.
