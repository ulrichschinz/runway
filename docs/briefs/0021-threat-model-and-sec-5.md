# Change Impact Brief 0021 — The threat model, and an owner for the last open High finding

Step 15e/f, and the end of Step 15. No code changed. What changed is that the security posture this
repository has been building since Step 11 is now written down as one document that says, section by
section, **which half of it the gate is holding** — and that finding SEC-5, the only open High in the
repository, stopped being ownerless after four months.

| Field | Value |
|---|---|
| **Requested outcome** | [`docs/threat-model.md`](../threat-model.md) as the plan specifies it: eight named sections, every claim read out of this code rather than out of a template, its mechanically enforceable parts mapped into the gate and the rest into the residual-risk register with re-open triggers. Plus an owner and an expiry for SEC-5, and the correction of one claim about production that stopped being true. |
| **Owning unit** | `docs`, `ops` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) |
| **Governed by** | [`adr:0027`](../adr/0027-the-threat-model.md). It rests on the four records that preceded it in this step — [`adr:0022`](../adr/0022-timeouts-are-declared.md), [`adr:0023`](../adr/0023-no-secrets-in-logs.md), [`adr:0024`](../adr/0024-structured-logging.md), [`adr:0025`](../adr/0025-narrowing-the-migration-except.md), [`adr:0026`](../adr/0026-the-audit-log.md) — and on [`adr:0017`](../adr/0017-admin-bootstrap-and-route-guards.md), [`adr:0018`](../adr/0018-cors-startup-refusal-and-the-inbox-shim.md), [`adr:0019`](../adr/0019-the-taskwarrior-argv-boundary.md) and [`adr:0021`](../adr/0021-supply-chain-pinning.md) for the controls it describes. |
| **Rule IDs introduced** | **None, deliberately.** Twenty-two existing rules are cited across the eight sections and every one of them predates this change. [ADR 0027](../adr/0027-the-threat-model.md) argues the choice and records the two places a rule was considered and rejected — an egress prohibition, and widening the route-guard checker's scope. The conformance suite still proves **44** rules able to fail, 0 not. |
| **Risks recorded** | Four new: **`RISK-DOC-003`** (the document is an assertion and nothing re-derives it), **`RISK-OPS-007`** (there is no network egress and nothing keeps it that way), **`RISK-SEC-004`** (no request field declares a length limit), **`RISK-SEC-005`** (the route-guard rule reads `backend/app/routers/` only, so the served schema has 32 operations and the declaration file has 31). Three of the four were found by reading the code to write the document. |
| **Entry points** | [`docs/threat-model.md`](../threat-model.md), [`docs/adr/0027-the-threat-model.md`](../adr/0027-the-threat-model.md), [`rules/waivers.yaml`](../../rules/waivers.yaml), [`rules/ledger.yaml`](../../rules/ledger.yaml), [`AGENTS.md`](../../AGENTS.md), [`docs/operations.md`](../operations.md#health) |
| **Affected public surfaces** | **None.** No route, no MCP tool, no schema, no environment variable, no SPA key. All five snapshots under [`ops/surfaces/`](../../ops/surfaces) regenerate byte-identically, because nothing under `backend/` or `frontend/` was touched at all. |
| **Known dependents** | **None** in the import graph. The document's dependents are human: [`AGENTS.md`](../../AGENTS.md) §10 now points at it, and [`docs/security.md`](../security.md) remains the narrower document about roles and guards rather than being folded into it. |
| **Uncertain / dynamic areas** | `BLIND-OPS-001` — reported for the changed set and directly load-bearing here, because the Health correction is a transcription of a host read that nothing verifies (`RISK-OPS-002`). `BLIND-TEST-001` — reported by construction; there is no code in this change for a test to reach. |
| **Analogous implementations** | [`docs/security.md`](../security.md) — the same posture-describing register, narrower in scope; the threat model cites it rather than repeating it. [`rules/ledger.yaml`](../../rules/ledger.yaml)'s `residual_risks` section — the existing convention of a statement plus an owner plus a re-open trigger, which the four new entries follow exactly. [`rules/shims.yaml`](../../rules/shims.yaml)'s `SHIM-SEC-006` entry — the model for `WAIVER-SEC-003`'s honesty about what its mitigation does and does not prove. |
| **Delivery Pattern** | **Documentation and Records Change.** No behaviour changes, nothing is deployed, and the gate's rule set is unchanged. What it does carry is a correction to a false claim about production, which is why the *evidence* for that correction is stated with its date and its limits rather than asserted. |
| **Required tests** | None new. The properties the document describes are already tested where they are testable: 254 backend tests and 42 frontend tests pass unchanged, and `./run verify` proves the 22 cited rules — among the 44 — able to fail. The document's own correctness is not a testable property, which is `RISK-DOC-003`. |
| **Intended scope** | Step 15e/f only. **Not** the SEC-5 fix (its own step, under **F2**), **not** the removal of `SHIM-SEC-006` (needs a soak on a deployment nobody here can reach), **not** log rotation on the host, **not** any change to `docker-compose.yml`, [`ops/deploy/docker-compose.yml`](../../ops/deploy/docker-compose.yml) or the deploy workflow — a separate change is in flight on the deploy mechanism — and **not** a new gate rule. |
| **Base revision** | `e84b2bf` |
| **Index revision** | `e84b2bf` |

## Why a threat model, and why not a template one

The plan named the file and the eight sections in one sentence and no earlier session recorded that it
was outstanding. It was the largest silent omission in Step 15 — larger than the audit log, because a
missing audit log is visibly missing and a missing threat model is indistinguishable from one nobody
has read.

The failure mode worth naming is not "no document". It is a document that describes a *class* of
system while reading as though it describes this one. This repository has published two false claims
about production already — that the healthchecks did not run, and that the rollback runbook worked —
and both were false in exactly that way: written once, plausible, never re-read. So the rule for this
document was that every claim is cited to a file and a line, and anything that could not be verified
from this tree is written down as unverified. One claim is: the per-argument `execve` limit behind
`RISK-SEC-004` is a Linux constant, and the development host is macOS, where a one-megabyte argument
executed fine. It says so.

## What it found

Writing it was not a transcription exercise. Four things came out of reading the code that nobody had
recorded:

1. **`RULE-SEC-001` does not see the whole route surface.** `tools/checks/route_guards.py` globs
   `backend/app/routers/*.py`. The served schema in [`ops/surfaces/openapi.json`](../../ops/surfaces/openapi.json)
   has **32** operations; [`rules/route-guards.toml`](../../rules/route-guards.toml) declares **31**. The
   odd one is `GET /health`, declared on the app object in `backend/app/main.py`. That route is
   harmless — it returns a fixed `{"status": "ok"}` — and it is the proof that a route added beside it
   would need no guard declaration, which is precisely the silent failure the rule exists to prevent.
   `RISK-SEC-005`.
2. **There is no network egress at all, and nothing keeps it that way.** No import of `httpx`,
   `requests`, `urllib`, `aiohttp`, `socket`, `smtplib` or `http.client` exists anywhere under
   `backend/app/`. `RULE-OPS-001` requires a timeout on an egress call *once one exists*, which makes
   the first outbound call survivable rather than visible — and `httpx` is already installed as a
   transitive dependency of `mcp`, so adding one is an import away. `RISK-OPS-007`.
3. **No request field declares a length limit.** `backend/app/models.py` constrains types and nothing
   else — no `Field(max_length=...)`, no `constr` — and neither uvicorn nor Starlette imposes a
   body-size limit by default. A capacity question, excluded by **F1**, and F1 requires exclusions to
   be written down rather than assumed. `RISK-SEC-004`.
4. **The `VALID_ROLES` tuple has two copies.** `backend/app/models.py:7` and
   `tools/grant-admin.py:24`; the CLI declares its own rather than importing. Not a defect —
   `tools/` cannot import from `backend/app/` — but [`docs/security.md`](../security.md)'s "lives in one
   place" is a sentence more confident than the code. The threat model states it accurately.

## No new rule, and that is the decision

The plan's phrase "mechanically enforceable parts entering the gate" reads naturally as *write a rule
per section*: eight sections, eight rule ids, a document that looks fully enforced. It would have been
the worst outcome available. A rule invented so a paragraph can cite one has a failure nobody has ever
seen, which is what `RULE-GATE-002` exists to refuse, and a gate that grows a rule per document is a
gate people learn to read past.

What the mapping found instead is that **the gate was already holding most of it** and nobody had
written the mapping down. Twenty-two rules across eight sections: `RULE-SEC-001` for the authorization
posture, `RULE-ARCH-004` for the single subprocess door, `RULE-OPS-001` for timeouts, `RULE-OPS-002`
for secrets in logs, `RULE-SURF-001` and `RULE-SURF-002` for the surfaces, `RULE-HYG-001` through
`RULE-HYG-003` for secret-bearing paths, `RULE-DEP-001` through `RULE-DEP-004` for the supply chain,
`RULE-TEST-002` for the argv boundary against the real Taskwarrior binary, `RULE-RULE-002` for the
expiry on the one open finding. Producing that mapping is most of the document's value: it turns "what
happens if this stops being true" into a command rather than an opinion.

Two rules were considered and rejected, and [ADR 0027](../adr/0027-the-threat-model.md) records both.
An egress prohibition would forbid a capability outright on a system with no designed egress boundary,
so its first true positive would be its own deletion. Widening the route-guard checker is a real fix
and a change to a rule's meaning, which needs a fixture proving the widened arm fails — a change of its
own, not a paragraph in a document.

## SEC-5 has an owner and a date

`WAIVER-SEC-003` in [`rules/waivers.yaml`](../../rules/waivers.yaml), expiring **2027-01-31**.

Until 2026-08-28, finding SEC-5 appeared in exactly two places in this repository — the Phase 0 finding
table and one incidental citation — with no waiver, no rule, no step and no expiry, while every other
High and Critical finding was closed in Steps 11 and 12. It survived because no artefact tracked it.
The waiver register is the only place here where a defect carries an owner and a date, so that is where
it went, in a new class: `open_security_finding`. It suppresses nothing — no linter reports it, no rule
covers it, there is no inline annotation to justify.

**The date is argued, not defaulted.** It is deliberately clear of the two dates already standing in
November — `WAIVER-TYPE-001` on the 4th and `SHIM-SEC-006` on the 25th — because three decisions in one
month is how one of them gets renewed without being read. And it is *after* the shim decision rather
than before it: both change the same function's API-key path, so sequencing them means the first is not
being reasoned about while the second is in flight.

**The mitigation is described as partial, because it is.** Since Step 15c every disclosure through
`GET /auth/apikey` writes an `auth.apikey.disclosed` audit row naming the account, the route and the
request id, and every authenticated request records which credential shape was used. That converts
"undetectable and unattributable" into "reconstructable from `data/audit.db`". It observes the
disclosure; it does not prevent it, and it says nothing at all about a key read straight out of
`users.db` on the host, because that read passes through no code this repository owns.

The real fix is store-a-hash plus show-once-on-regeneration, which changes what `GET /auth/apikey` can
return. Under **F2** that is a public-surface migration — expand → migrate → switch → contract, with a
deprecation window, in its own step. The migration has to keep the column readable while both shapes
are accepted, because existing agents authenticate with keys issued in cleartext that cannot be
re-derived.

## One claim about production was false and is corrected

[`docs/operations.md`](../operations.md#health)'s Health section said: *"These healthchecks do not run
in production. The host uses its own compose file, which declares no `healthcheck` for either service
and orders `frontend` after `backend` with a plain `depends_on`."*

Read directly from the host on **2026-08-28**, that is no longer true. `/opt/services/runway/docker-compose.yml`
carries a `healthcheck` on both services and `depends_on: backend: condition: service_healthy`, exactly
as the checked-in copy declares. The only drift between the host and that copy is the two `logging:`
blocks and the `LOG_LEVEL` line — log rotation, still unapplied. The `What this settles` bullet that
cross-referenced the old claim is corrected too, and the transcript above it is left as what it is: the
file as it stood on 2026-08-24.

**It is not overstated.** The corrected paragraph says in its own words that it is one read on one date,
that the sentence it replaces was also true when it was written, and that nothing continuously compares
the host against the checked-in copy. `RISK-OPS-002` is unchanged and is the reason. Nothing else in
that document was touched — not the rotation section, not the logging sections, not the audit-log
section, and neither compose file nor the deploy workflow.

## What Step 15 deliberately did not cover

Per **F1**, load, latency and capacity scaling are out of scope and are recorded rather than silently
assumed. [`AGENTS.md`](../../AGENTS.md) §10 already said most of it, so it gained one bullet rather than
a copy: what the gate does *not* hold is written down section by section in the threat model, with
every asserted-only property carrying a risk id. One stale claim in §10 was corrected in passing — it
said the deploy host's compose file is not in this repository, and it has been checked in since PR #15.

The threat model's own closing section goes further than F1's list, because several controls depend on
the same assumption and say so: the login limiter's counters are per-process (`RISK-SEC-003`), and three
stores sharing one partition is only survivable at this size (`RISK-OPS-006`).

## Behaviour change

**None.** No code changed. No route, no schema, no environment variable, no container, no deploy.

**Documented:** [`docs/threat-model.md`](../threat-model.md), new. [`docs/adr/0027-the-threat-model.md`](../adr/0027-the-threat-model.md),
new. `WAIVER-SEC-003` and a new waiver class in [`rules/waivers.yaml`](../../rules/waivers.yaml). Four
residual risks in [`rules/ledger.yaml`](../../rules/ledger.yaml). Two corrections in
[`docs/operations.md`](../operations.md#health) and one in [`AGENTS.md`](../../AGENTS.md) §10, plus a
pointer to the new document from its closing index.

## What the index knows

**1 production path(s) changed**, out of 6 total:

- `AGENTS.md`

The index classifies only `AGENTS.md` as a production path here; the other five changed files are
records, rules and documentation. That is correct and it is also the shape of the change: nothing this
brief describes is reachable from a request.

### Changed with no import-derived test protection

- `AGENTS.md`

`AGENTS.md` is protected by `RULE-DOC-001` rather than by a test — every path, command and identifier it
names is resolved on every gate run — which is exactly why the threat model records that no equivalent
check reaches *it* (`RISK-DOC-003`).

### Blind spots relevant to this answer

- **`BLIND-OPS-001`** — The deploy host's compose file is not in this repository. Its contents were read
  on 2026-08-24 and are recorded in `docs/operations.md`, so the mapping from built images to running
  containers is no longer unknown — but it is a transcription the index cannot verify, and nothing
  detects drift once the host changes. See `RISK-OPS-002`. **Load-bearing for this change**: the Health
  correction is a second such transcription, and it is written to age visibly rather than quietly.
- **`BLIND-TEST-001`** — Test protection is import-derived. Code exercised only through the FastAPI
  TestClient produces no `TESTED_BY` edge. Reported by construction; there is no code in this change.

## Outstanding

**The threat model will be wrong before it is edited.** `RISK-DOC-003`, with a re-open trigger on a
false claim, on a new trust boundary arriving without a section, and on the Step 16c decay review being
asked to carry it — which is the mechanism that would eventually close the gap, if that review is built.

**`RISK-SEC-005` is a real gap in a real rule** and this change only records it. Widening
`tools/checks/route_guards.py` to every module that can hold a route decorator forces a decision about
what an infrastructure route declares, and needs a fixture proving the widened arm fails.

**SEC-5 is owned, not fixed.** `GET /auth/apikey` still returns a permanent unscoped credential in
cleartext, and `users.db` still holds every key in the clear on the host and in every backup.

**`SHIM-SEC-006` is unchanged**, expiry 2026-11-25. The instrument shipped in Step 15c; the evidence
needs a soak on a deployment that runs.

**Log rotation is still not applied on the host**, and the audit database still has nothing pruning it
(`RISK-OPS-006`). Both sit on the partition that holds `users.db`.

## Follow-on

Step 15 is complete with this change. Next in plan order is **Step 16** — `scaffold`, `decay-review`,
the Phase 4 audit and the Cold-Agent tests. Before that, on their own dates: the shim soak and its
removal change, and the SEC-5 fix as the public-surface migration **F2** requires.
