# Change Impact Brief 0024 — The audit that checks the gate against its own claims, and criteria written before the run

Step 16d, first half. The gate is audited against the claims it makes — every check invoked, every rule
proven able to fail or declaring why it cannot, every failure message pointing somewhere real, every
register entry carrying a trigger that can fire — and the Cold-Agent Index and Change Test pass criteria are
written, versioned, **before any run**. The run itself is deliberately not performed here: this session read
the repository in depth to do the audit, so it would fail the benchmark's own precondition.

Six findings. None of them was a rule going red; all six were things the gate believed about itself.

| Field | Value |
|---|---|
| **Requested outcome** | Step 16d of [`docs/plan/phase-0-2.md`](../plan/phase-0-2.md): every gate component gets a conformance test proving it is invoked and that a representative violation makes it fail — no gate step remains an untested shell call; confirm branch protection actually *blocks* a merge while VERIFY is red; confirm failure messages name the violated rule and point to the right contract section, and that deterministic violations print the exact repository-owned `make fix` command; write the Cold-Agent Index and Change Test pass criteria — versioned, before the run — covering expected facts, mandatory owner/contract/rule hits, zero invented authoritative edges, correct flagging of the declared blind spots, a query and time budget, a minimum coverage of critical facts, a documented `grep`/manual baseline and three requests; the residual-risk and accepted-debt register with a re-open trigger on every entry; and a short migration log. |
| **Owning unit** | `docs`, `ops` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md), [`docs/task-interface.md`](../task-interface.md) |
| **Governed by** | [`adr:0031`](../adr/0031-the-phase-4-audit.md). It rests on [`adr:0030`](../adr/0030-the-decay-review.md) for the reduced Cold-Agent Change Test whose stated gaps this benchmark exists to close, [`adr:0016`](../adr/0016-briefs-are-generated-references-are-checked.md) for the line between a fact a tool may resolve and a judgment it may not, [`adr:0008`](../adr/0008-index-implementation-mode.md) for what the index may be asked, and [`adr:0005`](../adr/0005-gate-the-deploy.md) for the branch-protection posture being audited. |
| **Rule IDs introduced** | **`RULE-DOC-005`** — every rule's `contract:` pointer MUST resolve: the file exists, and where an `#anchor` is given, the file carries a heading that produces it. Executable, `check` and `verify` profiles, one negative fixture (`DOC-005`, which renames a heading rather than deleting a file, because renaming is how this actually breaks). The suite now proves **42 of 45** executable rules able to fail over **48** fixture arms, up from 41 of 44 over 47. |
| **Risks recorded** | Four, in [`rules/ledger.yaml`](../../rules/ledger.yaml) and not only here. `RISK-GATE-001` — `RULE-GATE-002`'s wrapper, the three lines between a failing fixture suite and a red gate, has never been observed working. `RISK-GATE-002` — the gate's own Python is outside ruff and mypy: fifteen modules, about 4,300 lines, held to a lower standard than the application they judge. `RISK-IDX-002` — [`index/manifest.toml`](../../index/manifest.toml) and the index disagreed about how many blind spots exist, and nothing compares them. `RISK-GOV-006` — nothing has ever observed branch protection *block* a merge. |
| **Entry points** | [`tools/fixtures/negative.sh`](../../tools/fixtures/negative.sh), [`tools/checks/contract_check.py`](../../tools/checks/contract_check.py), [`tools/checks/contract.sh`](../../tools/checks/contract.sh), [`tools/checks/gate-conformance.sh`](../../tools/checks/gate-conformance.sh), [`tools/checks/index-fresh.sh`](../../tools/checks/index-fresh.sh), [`tools/cold_agent_score.py`](../../tools/cold_agent_score.py), [`ops/cold-agent/criteria.md`](../../ops/cold-agent/criteria.md), [`ops/cold-agent/run-template.json`](../../ops/cold-agent/run-template.json), [`rules/ledger.yaml`](../../rules/ledger.yaml), [`index/manifest.toml`](../../index/manifest.toml), [`docs/migration-log.md`](../migration-log.md), [`docs/task-interface.md`](../task-interface.md), [`AGENTS.md`](../../AGENTS.md) |
| **Affected public surfaces** | **None.** No route, no MCP tool, no schema, no environment variable, no SPA key; all five snapshots under [`ops/surfaces/`](../../ops/surfaces) are unchanged and both counted claims in [`AGENTS.md`](../../AGENTS.md) still read 32. No `./run` command is added or removed — the scorer is a benchmark harness invoked directly, not a command, so the command surface stays at twenty-one. |
| **Known dependents** | **None** in the import graph. [`tools/cold_agent_score.py`](../../tools/cold_agent_score.py) is a leaf script nothing imports and nothing in the gate calls. The real dependents are textual and they are the point of the change: [`tools/fixtures/negative.sh`](../../tools/fixtures/negative.sh) now reads the `fixture:` field of every rule in [`rules/ledger.yaml`](../../rules/ledger.yaml), and [`tools/checks/contract_check.py`](../../tools/checks/contract_check.py) now reads every `contract:` field. Both degrade toward a *stricter* answer rather than a wrong one — an unparseable fixture value reads as *automated and therefore required*, and an unresolvable pointer reads as a failure. |
| **Uncertain / dynamic areas** | `BLIND-TEST-001` — reported for the changed set and true in the ordinary way: no test imports any of these files. What stands in for a test here is the fixture suite itself, plus the two synthetic run records used to exercise the scorer's pass and fail paths, which are deliberately **not** checked in: a filled-in run record under [`ops/cold-agent/runs/`](../../ops/cold-agent/runs) would be indistinguishable from a real benchmark result, and that directory must stay empty until a cold session fills it. |
| **Analogous implementations** | [`tools/decay_review.py`](../../tools/decay_review.py) — the precedent for a machine-checkable diagnostic that reports rather than gates, and whose own `does_not_cover` field enumerates exactly what this benchmark has to close. [`tools/checks/decay_freshness.py`](../../tools/checks/decay_freshness.py) — evidence that recomputes rather than is trusted, which is the model for the run record. `check_records` in [`tools/checks/contract_check.py`](../../tools/checks/contract_check.py) — the reference-resolution `RULE-DOC-005` copies, one field narrower. |
| **Delivery Pattern** | **Security or Operability Change** for the audit half — it changes no behaviour and adds enforcement over the gate's own claims — plus a **rule change** under the meta-rule for `RULE-DOC-005`, with all four parts in this commit: the check, the [`profiles.conf`](../../tools/checks/profiles.conf) line it inherits from `contract`, the ledger entry, and the fixture arm. Not a Public-Surface Migration: nothing a third party consumes moves. |
| **Required tests** | The `DOC-005` fixture arm, which is the test the meta-rule requires. Beyond it, the audit's own evidence: the coverage assertion now inside the fixture suite, which fails when a rule declaring an automated fixture is not observed failing; the live branch-protection check passing against the real GitHub API rather than being skipped; and the scorer exercised on a synthetic passing record (exit `0`), a synthetic failing record (exit `1`) and the incomplete template (exit `2`). |
| **Intended scope** | The **first half of Step 16d only**. **Not** running the Cold-Agent Index or Change Tests — the precondition is a session with no memory of this work and this one has the opposite. **Not** performing the branch-protection blocking test, which needs a pull request and the maintainer's account; the procedure is written out in [ADR 0031](../adr/0031-the-phase-4-audit.md) instead. **Not** widening ruff or mypy over `tools/` (`RISK-GATE-002`) — an audit that also lands several hundred lint fixes stops being reviewable as an audit. **Not** automating `RULE-GOV-002`'s unverifiable arm or `RULE-GATE-002`'s wrapper. **Not** re-writing dated records: [brief 0023](0023-the-decay-review.md) quotes the conformance output of its day accurately, and the number it quotes was the suite's own wording, which is what changed. |
| **Base revision** | `97d71be` |
| **Index revision** | `97d71be` |

## What the audit found

### 1. The conformance suite counted arms and everyone read it as rules

`tools/fixtures/negative.sh` ended with `47 rule(s) proven able to fail, 0 not`. Forty-seven was the number
of fixture *arms* that passed. The ledger held forty-four rules, of which forty-one were exercised by an
arm — several rules have more than one, `RULE-OPS-001` being proven once for the subprocess and once for an
egress call.

The gap between those numbers had already cost something. `RULE-GOV-002`'s ledger entry declined to automate
its second arm because doing so *"would report forty-eight rules where forty-seven exist"*: an argument
against adding a proof, resting on an equality that never held. The number had also propagated into
[`docs/task-interface.md`](../task-interface.md)'s statement of what a green `verify` means, which is the
paragraph a reader is most likely to quote back.

The suite now derives the claim rather than counting. It records which rule id each arm was observed failing
on, reads the ledger for the rules that name it as their fixture, and fails when one of them was not
exercised — so a rule that quietly stops being covered is a red gate rather than a smaller number nobody
reads. Both figures are printed and labelled.

### 2. Every check is invoked, and exactly three rules have no automated fixture — all declared

All twenty-seven entries in [`tools/checks/profiles.conf`](../../tools/checks/profiles.conf) have a script,
every script is executable and is invoked by the profile it declares — `tools/run-profile.sh` treats a
missing or non-executable one as a tooling error rather than a pass — and every check has at least one
fixture arm, with three exceptions:

| Rule | Why not automated | Declared as |
|---|---|---|
| `RULE-TEST-002` | needs Docker and an x86_64 host; the offline sandbox has neither | `RISK-TEST-002`, in the ledger's `fixture:` field |
| `RULE-GOV-001` | needs a live GitHub to drift from; three drift scenarios constructed by hand on 2026-08-04 | `RISK-GOV-003`, same |
| `RULE-GATE-002` | it *is* the fixture suite; an arm would have to make the suite fail from inside itself | previously undeclared — now `RISK-GATE-001` |

The first two were declared and justified. The third was the silent one: the ledger said *self-proving* and
left it there, so the one rule that makes every other rule trustworthy was also the one nobody had watched
fail. The exposure is narrow — an inverted condition or a swallowed exit code in
[`tools/checks/gate-conformance.sh`](../../tools/checks/gate-conformance.sh) would have made every
conformance run since Step 2 green and meaningless — and it now has an id and a trigger.

Two checks skip silently in this environment and both say so with a risk id: `py-test-container` on arm64
(`RISK-TEST-001`) and `branch-protection` without an authenticated `gh` (`RISK-GOV-002`). Neither is a
finding; both are the declared shape of a check that cannot lie about running.

The plan also asks for **one adversarial fixture per active Coverage Profile**, and all five from
[`docs/plan/phase-0-2.md`](../plan/phase-0-2.md) §0.11 already have at least one: CORE by `HYG-001` and
`DOC-001`; DYNAMIC ARCHITECTURE by `SURF-001`, which moves a runtime-observed surface, and `SEC-001-new`,
where a route arrives with no guard decision; DISTRIBUTED / POLYGLOT by `LINT-002` and `TEST-004` on the
second language and `OPS-003-privileged` on the process topology; CRITICAL RUNTIME by `ARCH-004` — the
subprocess escaping its choke point — together with `OPS-002-secret` and `DEP-003`; and the reduced
SCALE / OPERABILITY by `OPS-001` in both arms and `GATE-001`. Checked rather than assumed, and nothing
needed adding.

### 3. Every `contract:` pointer resolved, and nothing was holding them there

The failure-message audit read what `fail_rule` in `tools/lib.sh` actually prints: the ledger's `contract:`
field as the `why:` line, the `fix:` field as the `fix:` line where it is not `none`. All forty-four
pointers resolved — file present, and where an `#anchor` was given, a heading producing it. That was luck
rather than enforcement, which is what `RULE-DOC-005` now fixes.

Two message defects were repaired in passing.

- **The stale-index failure named nothing.** It is the gate failure a contributor here meets more often than
  any other, and it printed `the index is stale` and a rebuild hint — no rule id, no contract pointer. It
  now prints `RULE-IDX-001`, the `why:` and the `fix:`, while still exiting `4`, because a stale answer is
  not a rule violation and must not be recorded as one.
- **`RULE-IDX-001`'s `fix:` named two commands.** It read `make fix   (or make index)`. The plan asks for
  *the exact* repository-owned command, and `make fix` rebuilds the index, so `make fix` is now the only one
  named.

### 4. Branch protection: established, and not established

`RULE-GOV-001` compares live protection against [`ops/github/ruleset.json`](../../ops/github/ruleset.json).
That is a claim about configuration. The plan asks about behaviour.

**Established read-only on 2026-08-30**, with an authenticated `gh`, opening nothing:

- the `main-protection` ruleset exists, `enforcement` is `active`, `bypass_actors` is empty, and
  `branch-protection` passed inside `verify` rather than reporting `skipped`;
- `repos/…/rules/branches/main` — GitHub answering *which rules govern this branch* rather than the file
  asserting it — returns `deletion`, `non_fast_forward`, and `required_status_checks` with context `verify`;
- every one of the twenty merged pull requests in this repository's history had a **successful** `verify`
  check run on its head commit at merge time.

**Not established:** that a red `verify` blocks a merge. GitHub evaluates a required status check when a
merge is *attempted*, so the enforcing behaviour is observable only by attempting one, and twenty green
merges are equally consistent with nobody ever having tried to merge red. This is recorded as
`RISK-GOV-006` rather than asserted from the ruleset's contents.

**What a human must do**, in about five minutes, merging nothing: branch from `main`; commit a change that
deterministically reddens `verify` and is obviously a probe; open a pull request; wait for the `verify`
conclusion to be `failure`; then **observe without clicking** that the merge button is disabled and that
`gh pr view <n> --json mergeStateStatus` returns `BLOCKED` — not `UNSTABLE`, `BEHIND` or `CLEAN`; record the
verbatim status; close the pull request and delete the branch. Do not test the admin override, which is a
different control. The full procedure with its failure interpretation is in
[ADR 0031](../adr/0031-the-phase-4-audit.md). Its natural home is
[`docs/operations.md`](../operations.md#branch-protection), which was out of scope for this change.

### 5. The register: thirty-five entries, three triggers that could never fire

Every residual risk carried an owner, a re-open trigger and a decision record. The checkable statements were
re-verified rather than believed, and they held: `RISK-ARCH-002`'s five unattributed fan-in baselines are
still exactly five of seven, `RISK-TI-001`'s five of twenty-one commands is still five of twenty-one,
`RISK-OPS-007`'s claim that the application makes no network egress still holds against a fresh scan, and
`RISK-SEC-005`'s route outside `backend/app/routers/` is still `GET /health` and only that.

Three triggers named a plan step instead of an event, and the step had already landed:

- `RISK-TEST-002` and `RISK-GOV-003` both read *"Step 9's ledger validator requires an automated fixture for
  every executable rule."* Step 9 landed in PR #11, and its validator requires a **declared** fixture — by
  design, since prose is how these two rules record why they cannot be automated. The trigger described
  something that had already happened without occurring.
- `RISK-GOV-002` read *"the scheduled decay review (Step 16c) begins carrying this evidence."* 16c landed on
  2026-08-30 and none of its six diagnostics touches the rulesets API.

All three now name observable events. **A re-open trigger that points at a plan step has a deadline instead
of a condition**, and when the step passes it goes quiet rather than firing — which is the failure mode a
register exists to prevent.

### 6. The index manifest and the index disagreed about what the index cannot see

[`index/manifest.toml`](../../index/manifest.toml)'s `[unsupported]` list held six mechanisms; the graph
carries seven. `BLIND-TEST-001` was added to `tools/index/build.py` and never to the manifest, and the
manifest still listed `BLIND-MCP-001` as unsupported although the graph records it resolved by runtime
observation in Step 13. Nothing reads `[unsupported]` — the blind spots a query reports come from the
builder — so the manifest is prose *about* the index rather than input *to* it.

Both copies are corrected; that nothing keeps them together is `RISK-IDX-002`. It matters beyond tidiness:
the manifest is what a reader is pointed at to learn what the index cannot see, and criteria IT-05 of the
Cold-Agent benchmark scores an agent on naming all seven.

### 7. The gate's own Python is not held to the standard it enforces

ruff runs over `backend/app`, `backend/tests` and `tools/index`; mypy's `files` list is `backend/app` alone.
That leaves the ten check implementations under `tools/checks/` and the five command implementations under
`tools/` — about 4,300 lines — outside formatting, linting and type checking. These are the programs that
decide whether a change is mergeable and that [`AGENTS.md`](../../AGENTS.md) tells an agent to trust over its
own reading of the tree. Recorded as `RISK-GATE-002` and deliberately not fixed here.

## The Cold-Agent criteria, and why they are only criteria

[`ops/cold-agent/criteria.md`](../../ops/cold-agent/criteria.md), version 1.0.0, written before any run
because that is the one part of Step 16d that cannot be done afterwards without destroying it. Twelve Index
Test questions with mandatory facts; three Change Test requests reproduced verbatim so they cannot be
paraphrased into leaking their answers — a local behaviour change, a public-surface and data migration, and
a cross-process security change; a query and a time budget per section; a five-clause definition of an
*invented authoritative edge*; the seven blind spots as a named list; a `grep`/manual baseline with a stated
production procedure and a forbidden-tools list; a six-way classification turning every miss into an owned
correction; and a pass condition with no middle grade.

Three of its decisions are worth repeating here.

**The precondition is measured, not declared.** Four of the five evidence items — a purge command, a launch
command line, cache paths, a green gate — can all be satisfied by an operator who purged the wrong thing.
The fifth is a negative control: before the session touches the repository it is asked what it already knows
about `runway`, and an answer containing a rule id, a unit id, a count or the phrase *decay review* **voids
the run**. Void is not fail. A contaminated pass and a contaminated fail are equally uninformative, and
grading one as a fail invites re-running until the number is liked.

**Grepping to the right answer fails the Change Test.** `RISK-DOC-001` records that *query the index first*
cannot be enforced. The benchmark is where it is at least measured: manual reads before the first index
query must be zero. The whole case for building the index was that grep gives strings and the index gives
consequences — if grep gets there just as well and just as fast, that is the finding, and the baseline
comparison is designed to be able to say so.

**"Close" does not pass, and the scorer exists to keep it that way.**
[`tools/cold_agent_score.py`](../../tools/cold_agent_score.py) deliberately does not read the transcript and
cannot judge an answer; marking a criterion is human judgment, and if it were not, this would be a check and
would live in `verify`. What it automates is what gets fudged under time pressure: an unmarked criterion,
eleven of twelve rounded up, a run scored against criteria adjusted after the result was seen, a void run
reported as a fail, a miss with no correction, and a declared result that the criteria do not compute.

Nobody has run the benchmark. The directory [`ops/cold-agent/runs/`](../../ops/cold-agent/runs) is empty and
must stay that way until a cold session fills it, because a checked-in run record is indistinguishable from
a result.

## The gate

`./run verify` — **GREEN in 131s of its 600s budget**, `48 fixture arm(s) passed, 0 failed`,
`42 of 45 executable rules proven able to fail`.

```
  branch-protection
  ok    live branch protection matches ops/github/ruleset.json
  decay-freshness
  ok    decay review 0 day(s) old, evidence verifies against 81edfbbd2db7
  json-output
  ok    check, plan, doctor, help and decay-review all emit valid JSON
  gate-conformance
      PASS  DOC-005            RULE-DOC-005 went red
      PASS  GOV-002-overdue    RULE-GOV-002 went red
      PASS  GATE-001           RULE-GATE-001 went red
      48 fixture arm(s) passed, 0 failed
      42 of 45 executable rules proven able to fail; 3 declare no automated fixture (RULE-GATE-002, RULE-GOV-001, RULE-TEST-002)

verify: 131s of 600s budget
verify: GREEN
```

`check` runs in 20s of its 180s budget. The `verify` figure is well inside budget but is roughly double the
53s recorded in [brief 0023](0023-the-decay-review.md); the fixture suite dominates it, and the single arm
added here accounts for about two seconds of the difference.

## Behaviour change

**None in the application.** No route, no schema, no configuration, nothing deployed.

Three behaviour changes in the repository. `RULE-GATE-002` now fails when a rule declaring an automated
fixture is not exercised, rather than only when an arm fails. `RULE-DOC-005` fails when a rule's contract
pointer stops resolving, which a renamed heading in any of five documents will now do. And the stale-index
message names the rule and the contract section, so the most common failure here teaches something for the
first time.
