# Migration log — what the agent-readiness programme changed, and why

Runway went from a working web app with no enforced structure to a repository an agent can
be dropped into. This is the log of that: one row per plan step, what the step actually
produced, and the finding that made it worth doing. It is deliberately short, and every row
points at the brief that carries the detail.

**Sources of truth, when this file and they disagree:** [`docs/plan/phase-0-2.md`](plan/phase-0-2.md)
is the approved plan and the frozen decisions F1–F4; [`docs/briefs/`](briefs/) is what each
step did; [`docs/adr/`](adr/) is why; [`rules/ledger.yaml`](../rules/ledger.yaml) is every
rule and every residual risk. This log is a narrative over them and is written once, at the
end. It is not maintained as the repository changes — [`docs/plan/STATUS.md`](plan/STATUS.md)
is the dated handoff, and it is the one to read for current state.

**Mode C (tune).** The structure was already sound. What was missing was enforcement and
knowledge, so nothing was restructured: frontend units are declared over the existing
directories rather than moved, and no file was relocated to satisfy a rule.

---

## The three pillars

| | What it is | Where it lives |
|---|---|---|
| **Contract** | what is true, checked against the repository on every run | [`AGENTS.md`](../AGENTS.md), self-checked by `RULE-DOC-001` |
| **Gate** | 45 rules, 42 of them proven able to fail on a constructed violation | [`rules/ledger.yaml`](../rules/ledger.yaml), `tools/checks/`, `tools/fixtures/negative.sh` |
| **Index** | ownership, dependents, surfaces and test protection, with an evidence class on every fact | `index/`, `tools/index/`, queried by `./run map` / `impact` / `flow` |

---

## Step by step

| Step | Landed | Outcome, and what it found |
|---|---|---|
| **1** | PR #1 | The task interface — `make` for discovery, `./run` for exact exit codes — plus a clean-clone bootstrap and the first gate. [Brief 0001](briefs/0001-repository-task-interface.md) |
| **2** | PR #2 | ruff, mypy, eslint. Three Phase 0 security findings became tracked, expiring waivers instead of notes. [Brief 0002](briefs/0002-lint-format-types.md) |
| — | PR #3 | **Production hotfix.** The transitive `mcp` pin: the backend could not start. The first evidence that unpinned transitive dependencies were a live risk, not a theoretical one. |
| **16a** *(pulled forward)* | PR #4 | `verify` gates the deploy; branch protection checked in as `ops/github/ruleset.json`; images get an immutable `:<sha>` tag. [Brief 0003](briefs/0003-gate-the-deploy.md) |
| **3** | PR #5 | Backend safety net: 121 unit and 17 container tests. **SEC-3 resolved.** Two tiers, because cross-tenant isolation cannot be tested against a fake. [Brief 0004](briefs/0004-backend-safety-net.md) |
| **4** | PR #6 | Frontend logic tests. Five copies of one filtering rule collapsed to one. [Brief 0005](briefs/0005-frontend-safety-net.md) |
| **5** | PR #7 | The index: schema, extractors, canonical export, freshness. A stale index exits `4`, because a confident wrong answer is worse than none. [Brief 0006](briefs/0006-index-pillar.md) |
| **6** | PR #8 | The Index Qualification Gate — 27 assertions that decide whether the index may be trusted at all. [Brief 0007](briefs/0007-index-qualification.md) |
| **7** | PR #9 | CLI and MCP adapters over one query layer, with fact-level parity between them. [Brief 0008](briefs/0008-query-adapters.md) |
| **8** | PR #10 | Boundary enforcement, the cycle ratchet, hub baselines. Both violations found were fixed rather than declared. [Brief 0009](briefs/0009-boundaries.md) |
| **9** | PR #11 | The root contract, the scoped contracts, and the validators that keep the ledger and the waiver register honest. [Brief 0010](briefs/0010-contract.md) |
| — | PR #13 | **CI hardening.** Build platform pinned to `linux/amd64`, deploy bounded, actions bumped. |
| **10** | PR #17 | `./run brief` generates a Change Impact Brief from the index; `RULE-DOC-004` resolves every identifier a record names. [Brief 0011](briefs/0011-briefs-and-record-resolution.md) |
| — | PR #15 | The deploy host was read for the first time. Its compose file was checked in, and **two claims this repository had made about production turned out false** — the healthchecks did not run and the rollback runbook had nothing to substitute into. Both fixed. |
| **11** | PR #16, PR #18 | SEC-1, 2, 4, 6, 8 closed: a zero-admin bootstrap that cannot be re-run, a last-admin guard, `RULE-SEC-001` route guards, boot refusal on a default secret, closed CORS, one auth path, throttled login. [Briefs 0012](briefs/0012-admin-bootstrap-and-route-guards.md), [0013](briefs/0013-security-wave-2.md) |
| **12** | PR #19 | The Taskwarrior argv boundary: free text after `--`, override refusal at the choke point, `RULE-ARCH-004` keeping `subprocess` in one module. [Brief 0014](briefs/0014-taskwarrior-boundary.md) |
| **13** | PR #20 | Public surfaces snapshotted by **observing the running application** rather than trusting the docs. Found: **every MCP tool name in the README was wrong** — they are FastAPI operation ids — and `PORT` was documented but never read. [Brief 0015](briefs/0015-public-surface-protection.md) |
| **14** | PR #21 | Supply chain: four images digest-pinned, Arch packages pinned to a dated archive snapshot, hash-pinned Python locks, 305 licences classified. [Brief 0016](briefs/0016-supply-chain.md) |
| **15d** | `4d11cde` | `RULE-OPS-001` — every blocking outward call declares a timeout. Both arms proven, one by deleting the only real timeout in the application. [Brief 0017](briefs/0017-timeouts-are-declared.md) |
| **15a** | `2ec8bec`, `52a20bb` | The rule first, while there was still no logging to break it, then the logging: one JSON stream with uvicorn folded in, runtime redaction by value shape as well as field name, and a per-request correlation id. [Brief 0018](briefs/0018-structured-logging.md) |
| **15b** | `1c8756e` | The migration loop keeps exactly one silence — a duplicate-column error measured against the pinned driver — and reports everything else. `WAIVER-OPS-001` resolved. [Brief 0019](briefs/0019-narrowing-the-migration-except.md) |
| **15c** | `f031bb4` | The audit log, in its own SQLite file. Twelve event types, and the three credential shapes finally distinguishable — which is what makes `SHIM-SEC-006` removable on evidence rather than on hope. [Brief 0020](briefs/0020-the-audit-log.md) |
| **15e/f** | `75f5766` | [`docs/threat-model.md`](threat-model.md): eight sections, each ending in what is *enforced* by a named rule and what is only *asserted* and carries a risk id. SEC-5 finally got an owner. [Brief 0021](briefs/0021-threat-model-and-sec-5.md) |
| **16b** | `50aa33a` | `./run scaffold` — a new unit arrives conformant on its first commit instead of after review. [Brief 0022](briefs/0022-the-scaffold-generator.md) |
| **16c** | `81edfbb` | `./run decay-review`: six diagnostics no green run can produce, written as recomputable evidence. `RULE-GOV-002` fails `verify` when the review is overdue or its evidence does not verify — and it reads the evidence, never the contract. [Brief 0023](briefs/0023-the-decay-review.md) |
| **16d** | this change | The Phase 4 audit and the Cold-Agent pass criteria. [Brief 0024](briefs/0024-the-phase-4-audit.md) |

---

## What changed about how work is done

- **The index answers ownership, impact and test questions; grep answers none of them.**
  The contract says query it first. That cannot be enforced (`RISK-DOC-001`) and the
  mitigation is that it is faster.
- **A rule is four things or it is not a rule**: an executable check, a line in
  `tools/checks/profiles.conf`, a ledger entry, and an arm in the negative fixture suite.
- **A gate component nobody has watched fail is a shell call.** Every rule that can be made
  to fail in an offline sandbox is made to fail on every `verify`.
- **What is not covered is written down.** 39 residual risks, each with an owner and a
  re-open trigger; every waiver has an expiry that stops the gate; the threat model says
  section by section what is enforced and what is merely asserted.
- **Records are dated and reference-checked.** An ADR that cites an identifier nobody
  declared fails the gate.

## What was deliberately not done

Recorded so a green gate is not mistaken for a broader guarantee. The full list is
[`AGENTS.md`](../AGENTS.md) §10 and the `residual_risks` section of the ledger; the ones
that shaped the programme:

- **No horizontal scaling, HA or multi-tenant operation** (decision F1). Single host,
  single operator, no load or capacity budgets.
- **No affected-target selection.** `check` and `verify` run at full scope, justified by
  measured scale, with a re-open trigger rather than a heuristic.
- **Frontend units are declared, not foldered.** Moving files would have bought tidiness
  and cost migration risk.
- **One home-grown boundary checker** rather than two ecosystem-native ones, so that one
  rule means one thing across both stacks — mitigated by mandatory negative fixtures.
- **Required-reviewer governance is impossible with one maintainer** (`RISK-GOV-001`), and
  is recorded as a residual risk rather than dressed up.
- **Nothing compares the deploy host against this repository** (`RISK-OPS-002`). CI has no
  host access.
