# ADR 0030 — The gate reviews itself monthly, and has to prove it

- **Date:** 2026-08-30
- **Status:** Accepted
- **Scope:** `ops`, `docs`

## Context

Every rule in [`rules/ledger.yaml`](../../rules/ledger.yaml) answers the same question: *is this change
allowed?* Forty-six fixtures prove that each of them can say no. What none of them can say is whether the
gate is still measuring anything.

The failures this repository is actually exposed to now are of the second kind, and each one leaves every
check green:

- **A ratchet that only rises.** [`ops/structure-baseline.toml`](../../ops/structure-baseline.toml) is a
  ratchet by declaration. Since 16b, `./run scaffold` raises one of its numbers itself (`RISK-ARCH-001`).
  `RULE-ARCH-003` passes either way; the number just gets bigger.
- **A waiver whose date is approaching.** `RULE-RULE-002` fails on the day an expiry passes. Until that day
  it says nothing at all, so the first signal is the gate stopping — which is the worst possible moment to
  start thinking about a public-surface migration.
- **An index that drifted.** `RULE-IDX-003` tests the extractors against known answers. A drift that both
  the extractors and their expectations share is invisible to it, and an index that answers confidently and
  wrongly is worse than no index.
- **A cycle inventory that stopped shrinking.** Two cycles are declared. Nothing measures how long they have
  been declared.

[`docs/plan/phase-0-2.md`](../plan/phase-0-2.md) §16c asks for a command that runs "every mandatory
structural analysis and every activated conditional diagnostic" and writes machine-verifiable evidence, with
one enforcement clause: **an overdue or unverifiable review fails the governance check, and the contract may
display the date but is never its source of truth.**

That last clause is the whole design. A repository whose contract asserts its own freshness has built the
exact artefact it is trying to prevent.

## Decision

### `./run decay-review` reports; it does not judge

Six diagnostics — cycle inventory and trend, hub baselines with attribution, co-change against the declared
units, the waiver and shim expiry inventories, index quality metrics, and a reduced Cold-Agent Change Test.
Each one states, in its own output, what it cannot see. Exit `0` means the review ran, whatever it found;
exit `4` means the index was stale and nothing was measured, because four of the six read it.

Making a diagnostic *fail* the build was the obvious alternative and it is wrong. A threshold that blocks
merges gets tuned until it stops blocking merges — that is what happened to every coverage gate anyone has
ever worked under — and this repository would then have a seventh executable rule with no fixture and a
number nobody believes. Measurements that block builds stop being measurements.

So exactly one thing blocks: `RULE-GOV-002`, which asks whether the review happened and whether its evidence
verifies. It never reads the findings. That gap is real and is recorded as `RISK-GOV-005`: a report whose
result is `attention` is as green as one with nothing in it. The mitigation is not another rule — it is that
the findings land in a checked-in file whose diff changes every month.

### "Unverifiable" means four recomputable things, not one

[`tools/checks/decay_freshness.py`](../../tools/checks/decay_freshness.py) recomputes rather than trusts:

1. **the file parses and carries its schema fields** — a truncated or half-written report is not evidence;
2. **`report_sha256` matches a fresh hash** over the record with that one field removed, canonically
   serialised. A softened `result`, a moved `generated_at`, a deleted finding — each changes the hash;
3. **`repo_revision` is a commit in this repository and an ancestor of `HEAD`.** A report describing a
   revision this branch has never contained describes nothing. This is what makes "the report describes the
   revision it claims" checkable rather than asserted;
4. **`generated_at` is inside the period**, and is not in the future.

The two interesting ones are runnable by hand in one line each, and both are written into
[`docs/task-interface.md`](../task-interface.md) so a reader can confirm the gate rather than believe it.
The negative fixture recomputes the hash by that same published recipe rather than by calling the tool, so
the recipe and the check are independently checked against each other.

### The period is monthly; the gate goes red at 45 days

Monthly is the plan's cadence and what `.github/workflows/decay-review.yml` schedules. The gate does not go
red at 31 days, it goes red at 45.

The slack is deliberate and it is an argument about what red should *mean*. `RULE-GOV-002` runs in `verify`,
which is the mergeability gate and which gates the deploy. Without slack, a single failed cron run — an
expired token, a runner image change, a GitHub incident — converts a monitoring miss into a production
blocker, and the pressure at that moment is to remove the rule, which is precisely the dynamic
`RULE-GATE-001`'s own rationale describes for slow gates. With 14 days of slack there are two scheduled
attempts before anything blocks, so red means *the schedule is broken*, not *a run was late*. Fourteen days
also cannot hide a stopped schedule: two consecutive misses is a fortnight, not a quarter.

### It is in `verify` only, and that asymmetry with `RULE-RULE-002` is deliberate

`RULE-RULE-002` (expired waiver) runs in `check` as well. This one does not, and the difference is what a
contributor can do about it.

An expired waiver is fixable in the tree in front of you: resolve it, or re-approve it with a new date, in
the same commit as the work. An overdue review is not. The fix is to *run a review* — several minutes, a
fresh index, an evidence file that then has to be committed — which is a separate act that has nothing to do
with the change being made. A `check` that goes red on every machine in the repository, for a reason
unrelated to the diff, on a Tuesday, is how a five-second gate stops being run at all.

`verify` is where a repository-level claim belongs, because `verify` is the thing that says *mergeable*, and
"the gate has not been reviewed in seven weeks" is exactly a statement about whether merging is safe.

### The evidence is checked in, under `ops/`

`ops/decay-review.json` is the latest report; `ops/decay-history.jsonl` is one summary line per review.

`ops/` is already where this repository keeps checked-in operational state that the gate reads —
[`ops/structure-baseline.toml`](../../ops/structure-baseline.toml), [`ops/surfaces/`](../../ops/surfaces),
[`ops/github/ruleset.json`](../../ops/github/ruleset.json) — and the `ops` unit in
[`architecture.toml`](../../architecture.toml) already owns the whole tree. A new top-level directory would
have bought nothing.

The history file is not decoration: **a trend needs history, and there is nowhere else for it to come from.**
The index knows what is true now; git knows what changed; only a series of dated measurements knows whether
the cycle inventory has been stuck at two for six months. The first run says so plainly — *no trend: this is
the first recorded review, so the inventory has a value and no direction* — because the alternative, a chart
of one point, would be an invented answer.

### A locally-run review has no CI run id, and is still evidence

`GITHUB_RUN_ID` is absent locally. The review records the absence and the reason; it does not invent a value,
because a fabricated run id makes a local review and a CI review indistinguishable, which is the one thing
that field exists to prevent.

`RULE-GOV-002` accepts a local review. Requiring a run id would make the rule unsatisfiable on the
maintainer's own machine and would bind a governance rule to one vendor's CI — and the rule would then be
removed the first time it blocked someone offline.

What a local review is worth is therefore narrower than a CI one, and the difference is written down as
`RISK-GOV-004`. The hash proves the file was not edited after it was written. The revision check proves it
describes a commit this branch contains. Neither proves that the operator ran the real command rather than
producing a well-formed file by hand, and neither proves the toolchain was the declared one — CI's
bootstrap-from-clean-clone is what proves that. A CI review carries both; a local one carries neither.

### The reduced Cold-Agent Change Test reduces the agent, not the index

The full test in 16d is three change requests, a session with no prior knowledge, a `grep`/manual baseline
to compare against, and a human judging whether the answers were *used*. None of that is mechanisable, which
is why it is a benchmark and not a check.

What runs monthly is the decision procedure of [`AGENTS.md`](../../AGENTS.md) §2, executed end to end for
one change request from a cold index load, with twelve assertions inside a six-query, five-second budget:
the owning unit resolves, the scoped contract exists, the blast radius names the connected public surfaces
*and their MCP tool names*, an end-to-end path exists from a route to the adapter, a shared-kernel change
reports its dependents, every answer carries an index revision and a freshness verdict and its own blind
spots, and **no authoritative edge carries a guessed evidence class**.

Its suite version is pinned in the module, so a future change to the pass criteria is a change to a
versioned number rather than a silent redefinition of what passing means.

**What it does not cover, stated plainly:** it does not run a session, so it cannot show that an agent
queried the index instead of grepping (`RISK-DOC-001`); it cannot compare against a `grep` baseline; it
cannot judge whether the contract was read or the right Delivery Pattern chosen; it covers one request where
the full test covers three, and that one request is a public-surface change, so nothing here exercises the
cross-process security scenario; and it runs on the machine's warm toolchain rather than a cold one. All of
that is 16d, and none of it is closed by this change.

### The workflow is an adapter and contains no logic

`.github/workflows/decay-review.yml` checks out with full history, bootstraps, runs `./run decay-review`,
and commits the two files it wrote. There is no conditional in it. Everything that could be a decision —
which diagnostics run, what a finding is, what the evidence contains, how it is hashed, whether the index
needs rebuilding — is in the command, where it is readable, testable and runnable by hand. A rule that lives
in YAML is a rule nobody can run locally, which is a rule nobody checks.

## What this deliberately does not do

- **It does not close `RISK-GOV-002`.** That risk's re-open trigger says the scheduled decay review will one
  day carry branch-protection evidence. It does not yet: `tools/checks/branch-protection.sh` needs an
  authenticated `gh`, and wiring a token into this workflow is a governance change of its own, not a line in
  a review that was already being added.
- **It does not build the quarantine inventory** the plan names beside the waiver and shim registers. There
  has never been one here; the ratchet that occupies that role is `known_cycles` in
  [`architecture.toml`](../../architecture.toml), which carries a teardown path rather than a date. The
  review reports it under that name and says the register is absent rather than pretending it exists.
- **It does not turn co-change into a ratchet.** Forty-five commits in the window are small enough to be
  evidence of coupling, and the loudest signal in them is the meta-rule doing its job — a rule change moving
  its check, its ledger entry, its contract section and its fixture together. Those pairs are marked
  *explained* rather than counted; a threshold over this much data would be a number pretending to be a
  measurement.
- **It does not read the review.** `RULE-GOV-002` proves a review happened. `RISK-GOV-005` is the honest
  name for the rest.
- **It does not widen `RULE-TI-003`.** The first review found that the rule says *every command* while
  [`tools/checks/json-output.sh`](../../tools/checks/json-output.sh) validates five of twenty-one. The decay
  review's own JSON mode is now one of the five; the other sixteen are `RISK-TI-001`.

## Consequences

The gate now has a component whose failure mode is *nothing happening*, which is a shape this repository did
not previously have. Every other rule fires on an act; this one fires on the absence of one.

Three findings arrived with the first run and are in the register rather than only here: `RISK-TI-001`
(the JSON rule is wider than its check), `RISK-ARCH-002` (five of seven fan-in baselines carry no comment
saying who set them, so measured, reasoned and machine-generated ceilings now read identically), and the two
approaching expiries — `WAIVER-TYPE-001` in 66 days and `SHIM-SEC-006` in 87 — which `RULE-RULE-002` and
`RULE-SEC-002` would otherwise have announced by stopping the gate.

The cost is a monthly commit from a bot and one more thing that can be broken by being switched off. The
second is mitigated by the shape of the rule: switching the workflow off does not make `RULE-GOV-002` pass,
it makes it fail 45 days later.
