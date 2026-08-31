# ADR 0027 — The threat model names the rules that already hold it, and says where nothing does

- **Date:** 2026-08-28
- **Status:** Accepted
- **Scope:** `docs`, `ops`

## Context

[`docs/plan/phase-0-2.md`](../plan/phase-0-2.md)'s Step 15 asks for `docs/threat-model.md` with eight
named sections — trusted actors, untrusted inputs, secrets, side effects, egress, persistence, supply
chain, abuse cases — "with its mechanically enforceable parts entering the gate and the rest entering
the residual-risk register with re-open triggers". The file did not exist. It was the largest silent
omission in the plan: the entry was in the text from the start and no earlier session recorded that it
was outstanding.

The obvious failure mode of a document like this is worse than not having one. A threat model written
from a template describes a *class* of system and reads as though it describes *this* one; it makes
claims nobody checked, in a document readers treat as authoritative precisely because it is called a
threat model. This repository has already published two false claims about production — that the
healthchecks did not run, and that the rollback runbook worked — and both were false in exactly this
way: written once, plausible, never re-read.

The second failure mode is subtler and it is the one the plan sentence sets up. "Mechanically
enforceable parts entering the gate" can be read as *write a rule per section*, and that reading is
available and tempting: eight sections, eight new `RULE-` ids, a document that looks fully enforced.
It would be the worst outcome available. A rule invented so that a paragraph can cite one is a rule
whose failure nobody has ever seen, which is exactly what `RULE-GATE-002` exists to prevent by
demanding a negative fixture — and a gate that grows a rule per document is a gate people learn to
read past.

## Decision

### The document is written from the code, and every claim is cited to a file and a line

Nothing in it is inherited from a general model of web-application risk. Where a claim could not be
verified from this tree it says so rather than asserting it — the clearest case is the per-argument
`execve` limit behind `RISK-SEC-004`, which is a Linux constant that could not be reproduced from a
macOS development host and is written down as unreproduced rather than as a bound.

The cost is stated in the document's own first paragraph: line numbers move, and nothing re-derives
any of this. That is `RISK-DOC-003`, and it is the price of the alternative being a document with no
citations at all. `RULE-DOC-001` performs exactly this resolution for [`AGENTS.md`](../../AGENTS.md)
and `RULE-DOC-004` for the records — neither reaches `docs/threat-model.md`, because the contract check
reads the contract and the reference resolver reads `docs/adr/` and `docs/briefs/`.

### No new gate rule. Each enforceable claim names the rule that already holds it

Twenty-two rules are cited across the eight sections and **every one of them predates this change**.
`RULE-SEC-001` holds the authorization posture, `RULE-ARCH-004` holds the single subprocess door,
`RULE-OPS-001` the timeouts, `RULE-OPS-002` and the runtime filter the secrets in logs, `RULE-SURF-001`
and `RULE-SURF-002` the surfaces, `RULE-HYG-001` through `RULE-HYG-003` the secret-bearing paths,
`RULE-DEP-001` through `RULE-DEP-004` the supply chain, `RULE-RULE-002` the expiry on the one open
finding, `RULE-TEST-002` the argv boundary against the real binary.

This is not a shortcut, it is the finding. The gate was already holding most of what a threat model
for this system would want held, and nobody had ever written down the mapping. Producing that mapping
is most of the document's value: it is what lets a reader ask "what happens if this stops being true"
and get an answer that is a command rather than an opinion.

Adding a rule was considered in two places and rejected in both.

**Egress.** The application makes none, and nothing keeps it that way. A rule could forbid importing
an HTTP client under `backend/app/` the way `RULE-ARCH-004` forbids `subprocess` outside
`task_runner.py`. It was rejected because the two cases are not alike: the subprocess rule names a
door and permits it, so it channels a capability the application genuinely needs. An egress rule would
forbid a capability outright, on a system that has no designed egress boundary to route the first call
through — so the first legitimate outbound call would arrive as a gate failure with no correct fix
except deleting the rule. A rule whose first true positive is its own removal teaches the wrong thing.
Recorded as `RISK-OPS-007` instead, with the trigger that fires when the question becomes real.

**Route-guard scope.** `tools/checks/route_guards.py` reads `backend/app/routers/*.py` only, so the
served schema has 32 operations and [`rules/route-guards.toml`](../../rules/route-guards.toml) declares
31; the odd one is `GET /health`, declared on the app object. Widening the checker is a real fix and it
is a change to a rule's meaning, not a documentation change: it forces a decision about what an
infrastructure route declares, and it belongs in a change that can carry a fixture proving the widened
arm fails. Recorded as `RISK-SEC-005`, which is the first thing this document found that nobody knew.

The conformance suite therefore still proves **44** rules able to fail, unchanged.

### Every asserted claim carries a risk id, and four of them are new

The plan's second clause — "the rest entering the residual-risk register with re-open triggers" — is
satisfied by making each section end with two lists, `Enforced` and `Asserted`, where every entry in
the second names a risk. Most of them already existed: `RISK-OPS-002` through `RISK-OPS-006`,
`RISK-SURF-001`, `RISK-SEC-001` through `RISK-SEC-003`, `RISK-DEP-001` through `RISK-DEP-003`,
`RISK-GOV-001`, `RISK-TEST-001`, `RISK-TEST-004`. Writing the document created four that did not:

- **`RISK-DOC-003`** — the document is an assertion and nothing re-derives it.
- **`RISK-OPS-007`** — the no-egress property is an observation, not an invariant.
- **`RISK-SEC-004`** — no request field declares a length limit, and neither uvicorn nor Starlette
  imposes a body-size limit by default. A capacity question, which decision **F1** excludes — recorded
  rather than silently assumed, which is what F1 asks for.
- **`RISK-SEC-005`** — the route-guard rule does not see the whole route surface.

Three of the four were found by reading the code to write the document rather than by knowing them in
advance, which is the argument for having written it.

### SEC-5 gets an owner and a date in the same change

`WAIVER-SEC-003`, expiring 2027-01-31, in [`rules/waivers.yaml`](../../rules/waivers.yaml). It is a new
class in that file — `open_security_finding` — because it suppresses nothing: no linter reports it, no
gate rule covers it, and there is no inline annotation to justify. It is a Phase 0 finding of severity
High that outlived the security waves that closed every other one of its severity, and it survived
precisely because no artefact tracked it. The waiver register is the only place in this repository
where a defect carries an owner and a date, so that is where it goes.

The date is argued in the entry's own `expiry_rationale` and is deliberately not clustered with the two
November dates already standing, and deliberately after the `SHIM-SEC-006` decision rather than before
it: both change the same function's API-key path.

The audit log's `auth.apikey.disclosed` event, landed in [ADR 0026](0026-the-audit-log.md), is recorded
as a **partial** mitigation and described as observation rather than prevention. A row proves a key was
handed out through the API; it says nothing about one read out of `users.db` on the host, because that
read passes through no code this repository owns.

### The exclusions are part of the model

Decision **F1** requires load, latency and capacity to be written down as excluded rather than silently
assumed covered. The document's closing section is that record, and it goes further than F1's list,
because several controls above it depend on the same assumption and say so — the login limiter is
per-process, and three stores sharing one partition is only survivable at this size.
[`AGENTS.md`](../../AGENTS.md) §10 keeps the short form and now points here; it gained one bullet rather
than a copy, and one stale claim in it was corrected in passing, since the deploy host's compose file
*is* now in this repository.

## Consequences

**A reader can tell which half of the document the machine is holding.** That is the property the two
lists exist for, and it is the one thing a template threat model cannot give you. The cost is that the
distinction has to be maintained by hand: a rule added later does not migrate a bullet from `Asserted`
to `Enforced` by itself.

**The mapping is now the fastest way to answer "what breaks if this stops being true".** Each enforced
claim names a rule, each rule names a check in [`tools/checks/profiles.conf`](../../tools/checks/profiles.conf)
and a fixture that proves it can fail. That chain did not exist in one place before.

**This document will be wrong before it is edited.** `RISK-DOC-003` says so plainly, with a re-open
trigger on a false claim, on a new trust boundary, and on the decay review of Step 16c being asked to
carry it — which is the mechanism that would eventually close the gap, if the review is built.

**Four new risks and no new rules is a deliberate ratio.** The register grew because reading the code
found things; the gate did not, because none of them were things a check could hold today. A change
that inverted that ratio would have looked more impressive and been worth less.

**`docs/operations.md`'s Health section was corrected in the same change** and is unrelated to the
threat model except in kind. It claimed the healthchecks did not run in production; a host read on
2026-08-28 shows they do, along with `condition: service_healthy`, with the only drift being the
unapplied log rotation. Both the old claim and the new one are single reads on single dates, and the
corrected text says so — `RISK-OPS-002` is unchanged and is the reason.
