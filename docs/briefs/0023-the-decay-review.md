# Change Impact Brief 0023 — The gate starts reviewing itself, and has to leave proof

Step 16c. `./run decay-review` stops being a stub and starts running six diagnostics that no green gate run
can produce, writing evidence a reader can recompute rather than trust, and `RULE-GOV-002` starts failing
`verify` when that evidence is overdue or does not verify. The review was **run**, and its real output is
quoted below — a decay review that has never been run is the exact thing this step exists to prevent.

| Field | Value |
|---|---|
| **Requested outcome** | Step 16c of [`docs/plan/phase-0-2.md`](../plan/phase-0-2.md): `make decay-review` runs every mandatory structural analysis and every activated conditional diagnostic — cycle inventory and trend, hub baselines, co-change vs. declared units, the waiver/quarantine/shim inventories and their expiries, index quality metrics, a reduced Cold-Agent Change Test — and writes machine-verifiable evidence (repo revision, index revision, CI run id, report hash, executed checks, result). A monthly scheduled workflow is only an adapter. An overdue or unverifiable review fails the governance check; the contract may display the date but is never its source of truth. |
| **Owning unit** | `ops`, `docs` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md), [`docs/task-interface.md`](../task-interface.md) |
| **Governed by** | [`adr:0030`](../adr/0030-the-decay-review.md). It rests on [`adr:0008`](../adr/0008-index-implementation-mode.md) for what the index may be asked, [`adr:0016`](../adr/0016-briefs-are-generated-references-are-checked.md) for the line between a fact a tool may fill in and a judgment it may not, and [`adr:0029`](../adr/0029-the-scaffold-generator.md) for the machine-raised ratchet this review now has to distinguish from a human one. |
| **Rule IDs introduced** | **`RULE-GOV-002`** — a decay review MUST have been run inside the review period, and its evidence MUST verify. Executable, `verify` profile, one negative fixture. The conformance suite now proves **47** rules able to fail, 0 not, up from 46. |
| **Risks recorded** | Four, all in [`rules/ledger.yaml`](../../rules/ledger.yaml) rather than only here. `RISK-GOV-004` — a locally-run review has no CI run id and nothing attests its environment. `RISK-GOV-005` — the rule proves a review happened, never that anyone acted on it. `RISK-TI-001` — `RULE-TI-003` says *every command* while its check validates five of twenty-one; **found by the first review**. `RISK-ARCH-002` — five of seven fan-in baselines carry no comment saying who set them, so measured, reasoned and machine-generated ceilings read identically; **also found by the first review**. |
| **Entry points** | [`tools/decay_review.py`](../../tools/decay_review.py), [`tools/checks/decay-freshness.sh`](../../tools/checks/decay-freshness.sh), [`tools/checks/decay_freshness.py`](../../tools/checks/decay_freshness.py), [`tools/checks/profiles.conf`](../../tools/checks/profiles.conf), [`tools/fixtures/negative.sh`](../../tools/fixtures/negative.sh), [`.github/workflows/decay-review.yml`](../../.github/workflows/decay-review.yml), [`run`](../../run), [`docs/task-interface.md`](../task-interface.md), [`AGENTS.md`](../../AGENTS.md) |
| **Affected public surfaces** | **None.** No route, no MCP tool, no schema, no environment variable, no SPA key; all five snapshots under [`ops/surfaces/`](../../ops/surfaces) are unchanged and both counted claims in [`AGENTS.md`](../../AGENTS.md) still read 32. One command changes from exiting `3` to doing what it always said it would. |
| **Known dependents** | **None** in the import graph — [`tools/decay_review.py`](../../tools/decay_review.py) is a leaf script nothing imports, and it is the third adapter over `tools/index/query.py` rather than a fourth copy of it. Its real dependents are textual: it reads the comment shape of [`ops/structure-baseline.toml`](../../ops/structure-baseline.toml) to attribute a raise, and the five-group shape of [`rules/waivers.yaml`](../../rules/waivers.yaml) and [`rules/shims.yaml`](../../rules/shims.yaml) to read an expiry. Both degrade to a weaker answer rather than a wrong one — an unrecognised comment reads as *unattributed*, a missing `expires` reads as *no date*. |
| **Uncertain / dynamic areas** | `BLIND-TEST-001` — reported for the changed set and true in the ordinary way: no test imports [`tools/decay_review.py`](../../tools/decay_review.py), and what proves it is the real run below plus the negative fixture. `BLIND-MCP-001`, `BLIND-OPS-001` and `BLIND-TASK-001` are reported for this diff and are not load-bearing: nothing here reaches Taskwarrior, the deploy host or the MCP derivation. |
| **Analogous implementations** | [`tools/index/cli.py`](../../tools/index/cli.py) and `tools/index/mcp_server.py` — two adapters over one query layer that add no logic of their own; this is the third, and it is why the reduced Cold-Agent test can assert on the same envelope an agent sees. [`tools/checks/deploy_compose.py`](../../tools/checks/deploy_compose.py) — the `RULE-ID\|message` shell/python check pair the new check copies exactly. [`tools/scaffold.py`](../../tools/scaffold.py) — the precedent for a command that stages what it writes and rebuilds the index, and for the argument that staging is not committing. |
| **Delivery Pattern** | **New Capability**, plus a **rule change** under the meta-rule. One command moves from stub to implementation and one executable rule is added with all four parts — check, profile line, ledger entry, negative fixture. No application code changes and nothing is deployed. |
| **Required tests** | The negative fixture (`GOV-002-overdue`), which is the test the meta-rule requires, plus the real review run below. There is no unit test for the review itself: its output is checked by the fixture, by `json-output` in `verify`, and by the fact that every number it reports comes from a layer that twenty-seven qualification assertions already cover. What is genuinely uncovered is the *unverifiable* arm of `RULE-GOV-002`, exercised by hand and quoted below rather than automated — see the note under the fixture. |
| **Intended scope** | Step 16c only. **Not** 16d — the full Cold-Agent Index and Change Tests, the Phase 4 audit, the adversarial fixture per Coverage Profile and the migration log are untouched. **Not** closing `RISK-GOV-002` by teaching the review to read live branch protection, which needs a token in a workflow and is a governance change of its own. **Not** building the quarantine register the plan names — there has never been one here. **Not** widening `RULE-TI-003`'s check beyond the five commands it now validates (`RISK-TI-001`). **Not** acting on the two approaching expiries the review found; naming them is this step, deciding them is theirs. |
| **Base revision** | `4942403` |
| **Index revision** | `4942403` |

## Why the review reports and only one thing blocks

Every rule in [`rules/ledger.yaml`](../../rules/ledger.yaml) answers *is this change allowed?*. None of them
can answer *is the gate still measuring anything?*, because each failure of that second kind leaves every
check green: a ratchet that only rises, a waiver whose date is three weeks out, an index whose extractors
drifted in the same direction as their expectations.

Making a diagnostic fail the build was the obvious design and it is wrong. A threshold that blocks merges
gets tuned until it stops blocking merges, and this repository would then hold a rule with a number nobody
believes. So `./run decay-review` exits `0` whatever it finds — and exits `4` if the index is stale, because
four of the six diagnostics read it and evidence built on a stale index is confident and wrong.

Exactly one thing blocks: `RULE-GOV-002`, which asks whether the review happened and whether its evidence
verifies, and never reads the findings. That gap has a name — `RISK-GOV-005` — rather than a second rule.

## The first real run

`./run decay-review`, on this change's working tree at base `4942403`. It is recorded as dirty because it
is: the review ran before the commit that carries it, which is what `repo_dirty` is for. A CI run is clean by
construction.

```
decay review — 2026-08-30

  repo revision   4942403204ed  (working tree dirty)
  index revision  4942403204ed
  ci run id       none — run outside CI; GITHUB_RUN_ID is unset (see RISK-GOV-004)
  prior reviews   0

  cycles
    2 declared, 0 new, 0 resolved-but-declared
    - no trend: this is the first recorded review, so the inventory has a value and no
      direction. The second review is the first one that can say anything.

  hubs
    7 baseline(s), 0 machine-raised, 5 unattributed, 0 over baseline
    - 5 baseline(s) carry no comment saying who raised them or why:
      backend/app/database.py, frontend/src/components/TaskList.vue,
      frontend/src/components/TaskModal.vue, frontend/src/stores/tasks.js,
      frontend/src/views/_useTaskView.js

  co-change
    13 cross-unit pair(s) at >= 3 commits, 1 of them not explained by a declared coupling
    - frontend/index.html and frontend/src/components/AppShell.vue changed together in
      3 commits but live in ops and fe/layout

  expiries
    3 dated exception(s): 0 expired, 2 inside the 93-day horizon
    - WAIVER-TYPE-001 expires on 2026-11-04, in 66 day(s)
    - SHIM-SEC-006 expires on 2026-11-25, in 87 day(s)

  index-quality
    555 nodes, 826 edges, 244 files, 7 blind spots, index current

  cold-agent-change-reduced
    12/12 assertions, 4 queries, 0.085s

  result          ATTENTION — 5 finding(s)
```

Four of those five findings were worth the step on their own.

**The hub inventory is three different kinds of number wearing one costume.** Two entries carry a dated
comment arguing for the value. Five carry nothing at all — they were recorded as *observed* when
`RULE-ARCH-003` was introduced, which makes each a ceiling nobody argued for. And since 16b a third kind
exists: a value `./run scaffold` raised itself (`RISK-ARCH-001`). A reader of the file cannot tell them
apart, so the review does it explicitly, by reading the comment block above each entry: a backticked
repository command means machine-raised, prose means human-raised, nothing means unattributed. That
attribution is itself only a comment and nothing enforces it, which the review says in the same breath.
Recorded as `RISK-ARCH-002`.

**Co-change's loudest signal is the meta-rule working.** Of thirteen cross-unit pairs at three commits or
more, twelve are governance artefacts moving together — a check with its ledger entry, its contract section
and its fixture; the Makefile with the dispatcher and the reference. Those are *required* to co-change by
[`AGENTS.md`](../../AGENTS.md) §9 and `RULE-TI-001`, so the review marks them explained rather than counting
them. A co-change analysis that did not know this would report the repository's own discipline as structural
decay, and the one genuine signal — `frontend/index.html` with `AppShell.vue` — would be buried under it.

**Two expiries are inside the horizon and neither is a gate failure yet.** That is the entire value: today
`RULE-RULE-002` and `RULE-SEC-002` say nothing at all, and on 4 November and 25 November they stop the gate.
`WAIVER-TYPE-001` needs a status-code decision on a hard-promise surface and `SHIM-SEC-006` needs a
production soak that has not started, so "decide it on the day" was never going to work for either.

**And the trend section says it has no trend.** One point is not a direction, and a chart of one point would
have been an invented answer. `ops/decay-history.jsonl` is where the second review gets one from.

## The evidence, and how to check it without trusting it

`ops/decay-review.json` carries the repository revision, the index revision, the CI run id, every executed
check with its findings, the result, and `report_sha256` over all of it.
[`docs/task-interface.md`](../task-interface.md) publishes the two one-liners that recompute it, and both
were run:

```
$ python3 -c 'import hashlib,json;d=json.load(open("ops/decay-review.json"));h=d.pop("report_sha256");print(h==hashlib.sha256(json.dumps(d,sort_keys=True,separators=(",",":")).encode()).hexdigest())'
True
$ git merge-base --is-ancestor "$(python3 -c 'import json;print(json.load(open("ops/decay-review.json"))["repo_revision"])')" HEAD && echo ok
ok
```

The ancestry check is what turns "the report describes the revision it claims" from an assertion into a
test. `tools/checks/decay-freshness.sh` runs both, plus the schema check and the date arithmetic, and it
reads the evidence and never [`AGENTS.md`](../../AGENTS.md) — a contract that is the source of its own
freshness date is the artefact the rule exists to prevent.

**The CI run id is absent locally and is recorded as absent.** Inventing one would make a local review and a
CI review indistinguishable, which is the only thing that field is for. What a local review is therefore
worth is written down as `RISK-GOV-004`: the hash proves the file was not edited after it was written and
the revision check proves it describes a commit this branch contains, but neither proves the operator ran
the real command rather than hand-writing a well-formed file, and neither proves the toolchain was the
declared one. `RULE-GOV-002` still accepts it, because a rule that is unsatisfiable on the maintainer's own
machine is a rule that gets deleted.

## Period, profile, and the two arguments behind them

**Monthly, red at 45 days.** The workflow runs on the 1st. The gate tolerates one missed run and not two,
because `RULE-GOV-002` sits in `verify`, which gates the deploy — and a governance rule that turns a single
failed cron job into a production blocker is a rule somebody removes at the worst possible moment. Red then
means *the schedule is broken*, which is true, rather than *a run was late*, which is noise.

**`verify` only, and the asymmetry with `RULE-RULE-002` is the point.** An expired waiver is fixable in the
tree in front of you — resolve it or re-approve it, in the same commit — so it belongs in `check`. An
overdue review is not: the fix is to run a review and commit its evidence, a separate act with nothing to do
with the diff being made. A five-second gate that goes red on every machine for an unrelated reason is a
gate that stops being run.

## The fixture, and the arm that is not automated

`GOV-002-overdue` produces a **real** review inside the fixture sandbox, then backdates it past its own
`overdue_after_days` and recomputes the hash by the published recipe rather than by calling the tool. Both
halves matter: a report with a stale date and a stale hash would go red for the wrong reason and the fixture
would pass vacuously, and computing the hash independently checks that the recipe in the documentation is
the one the gate uses. The fixture asserts that the report it backdates carries the sandbox's own HEAD,
so it cannot silently fall through to the parent repository's copy.

The **unverifiable** arm is exercised by hand, not automated, and here it is — one field changed, the hash
left alone:

```
$ python3 -c '...; d["result"]="ok"; ...'   # rewrite the result, leave report_sha256
$ tools/checks/decay-freshness.sh
  FAIL  RULE-GOV-002  ops/decay-review.json is unverifiable: report_sha256 does not match
        the report it covers, so the file has been edited since the review produced it
        why:  docs/task-interface.md#the-decay-review
        fix:  ./run decay-review
EXIT=1
```

It is not in the suite because the suite counts fixtures and prints the total as a rule count. A second arm
would report forty-eight rules where forty-seven exist, and a conformance number that overstates itself is a
worse defect than an unautomated arm. The trade is recorded in the rule's `fixture` field in
[`rules/ledger.yaml`](../../rules/ledger.yaml) the same way `RULE-TEST-002` and `RULE-GOV-001` record theirs.

## The workflow is an adapter, and contains no conditional

[`.github/workflows/decay-review.yml`](../../.github/workflows/decay-review.yml) checks out with full
history — the co-change diagnostic reads a year of commits and a shallow clone would make it report an empty
result rather than fail — bootstraps, runs `./run decay-review`, and commits the two files it wrote. Every
decision lives in the command: which diagnostics run, what a finding is, what the evidence contains, how it
is hashed, whether the index needs rebuilding. A rule that lives in YAML is a rule nobody can run locally.

## What the index knows

**9 production path(s) changed**, out of 14 total:

- `AGENTS.md`
- `ops/decay-history.jsonl`
- `ops/decay-review.json`
- `run`
- `tools/checks/decay-freshness.sh`
- `tools/checks/decay_freshness.py`
- `tools/checks/json-output.sh`
- `tools/checks/profiles.conf`
- `tools/decay_review.py`

### Changed with no import-derived test protection

The index found no test reaching these. That is a claim about imports, not proof of absence — but it is
where a required test most likely belongs.

- `AGENTS.md`
- `ops/decay-history.jsonl`
- `ops/decay-review.json`
- `run`
- `tools/checks/decay-freshness.sh`
- `tools/checks/decay_freshness.py`
- `tools/checks/json-output.sh`
- `tools/checks/profiles.conf`
- `tools/decay_review.py`

### Blind spots relevant to this answer

- **`BLIND-MCP-001`** — resolved 2026-08-26 by runtime observation; the residue is `RISK-MCP-001`, and
  nothing here touches either.
- **`BLIND-OPS-001`** — the deploy host's compose file is a transcription the index cannot verify. Not
  load-bearing: this change reaches no host.
- **`BLIND-TASK-001`** — Taskwarrior's internals are opaque to the index. Not load-bearing.
- **`BLIND-TEST-001`** — test protection is import-derived, so the absence of an edge means "no
  import-derived protection", not "untested". True for every file in this diff, and the reason the negative
  fixture and the real run are the evidence offered instead.

## The gate

`./run verify` — **GREEN in 53s of its 600s budget**, `47 rule(s) proven able to fail, 0 not`, up from 46.

```
  decay-freshness
  ok    decay review 0 day(s) old, evidence verifies against 4942403204ed
  json-output
  ok    check, plan, doctor, help and decay-review all emit valid JSON
  gate-conformance
      PASS  GOV-002-overdue    RULE-GOV-002 went red
      47 rule(s) proven able to fail, 0 not

verify: 53s of 600s budget
verify: GREEN
```

## Behaviour change

None in the application. Two behaviour changes in the repository: one command stops exiting `3` and starts
producing a report and evidence, and `verify` acquires a check that will go red on a date if nobody runs
that command — the first rule here whose failure mode is *nothing happening* rather than an act.
