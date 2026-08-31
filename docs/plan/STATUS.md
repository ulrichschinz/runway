# Session handoff — where we are, and how to go on

**Snapshot taken 2026-08-30 at the head of `step-15a-structured-logging` (`ebe0c91`).** This file is a
*dated handoff*, not a source of truth. Everything in it can drift; §1 tells you how to re-establish the
real state in about twenty seconds. When they disagree, the commands win — this branch found four
documents that had quietly stopped being true, and this one is not exempt.

> **Fifteen commits sit on this branch and none are merged. There is no pull request.** `main` is still at
> `31326de`. Everything below — Step 15, 16b, 16c, the Phase 4 audit, the deploy mechanism — exists only
> here. Nothing has reached production.

---

## 1. Re-establish the truth first

```sh
git log --oneline -12          # what has landed
make check                     # is the tree green
./run violations               # structural state
tools/checks/contract.sh       # is the contract still honest
ls docs/briefs/                # one brief per completed step
```

The authoritative records are: `docs/plan/phase-0-2.md` (the approved plan and the frozen
decisions F1–F4), `docs/briefs/` (what each step actually did and why), `docs/adr/` (the
non-obvious decisions), `rules/ledger.yaml` (every enforced rule and every residual risk),
`rules/waivers.yaml` (open security debt with expiry dates), and `AGENTS.md` (the contract).

---

## 2. Where we are

Making this repository agent-ready, following `docs/plan/phase-0-2.md`. **MODE C (tune)** —
the structure was already sound; what was missing was enforcement and knowledge.

**Seventeen changes merged to `main`; fifteen more sit unmerged on this branch.** `verify` re-run
2026-08-30 at `ebe0c91`: **GREEN in 61s, 48 fixture arms passed, 42 of 45 executable rules proven able to
fail, 3 declaring no automated fixture.**

> **Read that number carefully — it was wrong until 2026-08-30.** The suite printed "N rules proven able to
> fail" while counting *fixture arms*, which are not the same thing: several rules have two arms and three
> have none. Every progress report on this branch quoted the inflated figure, and `rules/ledger.yaml` had
> already used the false equality to *decline* automating a fixture, on the grounds that adding one "would
> report forty-eight rules where forty-seven exist". A metric nobody had audited was making decisions. The
> suite now records which rule id each arm proved and fails when an executable rule is unexercised.

Plan step → PR:

| Plan step | Landed | What it gave us |
|---|---|---|
| 1 | PR #1 | Task interface (`make`/`./run`), clean-clone bootstrap, first gate |
| 2 | PR #2 | ruff, mypy, eslint; three Phase 0 security findings became tracked waivers |
| — | PR #3 | **Production hotfix**: pinned transitive `mcp`; the backend could not start |
| 16a (pulled forward) | PR #4 | `verify` gates the deploy; branch protection as checked-in state; SHA tags |
| 3 | PR #5 | Backend safety net: 121 unit + 17 container tests; **SEC-3 resolved** |
| 4 | PR #6 | Frontend logic tests; five copies of one rule collapsed to one |
| 5 | PR #7 | The index: schema, extractors, canonical export, freshness |
| 6 | PR #8 | Index Qualification Gate — 27 assertions deciding whether to trust it |
| 7 | PR #9 | CLI + MCP query adapters over one layer, fact-level parity |
| 8 | PR #10 | Boundary enforcement, cycle ratchet, hub baselines; both violations fixed |
| 9 | PR #11 | Root `AGENTS.md`, scoped contracts, ledger and waiver validators |
| — | PR #13 | **CI hardening**: build platform pinned to `linux/amd64`, deploy bounded, actions bumped |
| 10 | PR #17 | `./run brief` generation; `RULE-DOC-004` resolves references in records and briefs |
| — | PR #15 | Deploy host read; compose checked in; two false production claims corrected; healthchecks and rollback fixed on the host |
| 11 (partial) | PR #16 | SEC-2 closed: zero-admin bootstrap, last-admin guard, `RULE-SEC-001` route guards |
| 11 | PR #18 | SEC-1/4/6/8 closed: boot refusal, closed CORS, one auth path, throttled login |
| 12 | PR #19 | Taskwarrior argv boundary: free text after `--`, override refusal, `RULE-ARCH-004` |
| 13 | PR #20 | Public-surface snapshots; every README MCP tool name was wrong, `PORT` unread |
| 14 | PR #21 | Supply chain: digest-pinned images, hash-pinned locks, 305 licences classified |

**All three pillars exist:** contract (`AGENTS.md`, self-checked), gate (**45 executable rules, 42 proven
able to fail on every run, 3 declaring why they cannot be**), index (built, qualified, deterministic,
queryable).

`check` ~7s · `verify` ~61s local, against a 600s budget. The only unimplemented command is
`rebuild-verify` (5); `brief`, `surfaces`, `lock`, `grant-admin`, `scaffold` and `decay-review` all work.

---

## 3. What to do next — Step 15, and four decisions are already taken

Steps 11–14 are all complete; see §4 for what each one closed. **Step 15 (operability and
the minimal threat model) is next**, and unlike Step 11 it is entirely local work — nothing
in it is blocked on the deploy host.

### Step 15 is larger than earlier versions of this file claimed

Until 2026-08-27 this section summarised Step 15 as "structured logging, audit log,
`WAIVER-OPS-001`". That dropped two whole plan items. The authoritative text is
[`phase-0-2.md`](phase-0-2.md) §"Step 15 — Operability and the minimal threat model":

| Plan item | State on 2026-08-27 |
|---|---|
| Structured logging + executable no-secrets-in-logs rule | **Not started.** The backend has *zero* logging — no `import logging`, no `getLogger`, no `print()` anywhere under `backend/app/`. What production emits today is uvicorn's plain-text default. |
| Audit log for role changes, key regeneration, task deletion | **Not started.** No audit table, file or trail of any kind. |
| Executable rule: every subprocess and egress call declares a timeout | **Not started, and previously unrecorded here.** One timeout exists in the whole application and no rule holds it there. |
| `docs/threat-model.md` | **Does not exist, and was previously unrecorded here.** The largest silent omission. |
| Healthchecks in compose | **Already landed** (PR #15). Step 15 records this rather than redoing it. |
| SHA tags + one-line rollback | **Already landed** (PR #4/#15). Same — record, do not redo. |
| Scaling recorded as deliberately out of scope | Per **F1**. Mostly already stated in [`AGENTS.md`](../../AGENTS.md). |

`WAIVER-OPS-001` resolution belongs to this step too, though the plan text does not name it:
the link runs the other way, from the waiver's own `resolution:` field.

### Decisions taken 2026-08-27

These four were open and are now closed. They do not need re-litigating.

1. **The audit log lives in its own SQLite file**, not in `users.db` and not as a stdout
   stream. A table in `users.db` would move the `RULE-SURF-001`-protected schema surface
   and would trip [`waivers.yaml`](../../rules/waivers.yaml)'s "a `migrations/` directory
   becomes due when a third table changes shape" clause, expanding the step by a whole
   piece of infrastructure. A stdout stream can be lost to log rotation, which would make
   the `SHIM-SEC-006` removal evidence unreliable — the one thing the audit log exists to
   make trustworthy. The writer still lives in the module that owns database access, because
   the contract allows no other module to open a connection.

2. **SEC-5 gets an owner and an expiry now; the fix is its own step.** See below.

3. **A genuine migration failure logs and continues; it does not refuse to start.**
   Migrations are additive and the migration routine runs on every start, so a transient
   failure retries — which is the waiver's own recorded mitigation. Extending the
   refuse-to-serve posture to migrations would risk taking production down at deploy time on
   a transient error, the exact class of blocker **F3** made explicit for Step 11.

4. **The JWT preflight check gets built** — the offer that had been outstanding since
   2026-08-24. It reports whether a resolved `JWT_SECRET` is a published default or too
   short, runnable *on the host*, so "is production configured?" becomes a question tooling
   answers rather than one someone remembers to ask.

### Decisions taken 2026-08-28 (Step 15a)

Also closed; also not for re-litigating.

5. **One JSON stream, uvicorn included.** Its loggers are folded in via `--log-config`, so
   access lines, application lines and tracebacks all pass through the same formatter and the
   same redaction filter. Two formats in one stream is worse than either, and a line that
   bypasses redaction is the one that leaks.

6. **`LOG_LEVEL` is the only knob, default `INFO`.** JSON is unconditional. There must be no
   configuration in which structure or redaction can be switched off.

7. **`json-file` rotation in both compose files.** See the outstanding host action below.

8. **A per-request correlation id**, minted locally in a `ContextVar`, echoed on `X-Request-Id`.
   Step 15c's audit rows carry the same id, which is why it landed now rather than after —
   retrofitting it once audit rows exist is materially harder.

### Outstanding on the deploy host — not closed by Step 15a

Two things are now true in this repository and **not yet true in production**. Both need hands
on the host; nothing here can reach it (`RISK-OPS-002`).

- **Log rotation is checked in but not applied.** Re-verified on 2026-08-28: the host's
  `docker-compose.yml` is still 3087 bytes, last modified 25 August, with no `logging:` block
  on either service. An attempt to apply it that day silently did nothing — the file is owned
  by `root`, and `cp`/`scp` as the login user fail without stopping a chained command. Apply it
  by staging through `/tmp` and `sudo cp` into place; a driver change only takes effect on
  container recreation.

- **Two unbounded writers will land on one partition.** `audit.db` writes a row per
  authenticated request and nothing prunes it (`RISK-OPS-006`), and container logs are not
  rotating. Both sit on the disk that holds `users.db`. Either alone is slow; together they are
  the same outage twice. Rotation should be applied *before* the audit log deploys, not after.
- **The next deploy changes what the log stream looks like.** `docker compose logs -f backend`
  will emit JSON rather than uvicorn's plain text. Nothing breaks; it will look different.

Stated this way deliberately. This repository has twice made claims about production that were
false when checked — the healthchecks and the rollback runbook — so Step 15a records the intent
and not the state.

### SEC-5 is the last open High finding, and until 2026-08-27 nothing owned it

API keys are stored in plaintext in `users.db`, are permanent, unscoped and un-expiring, and
are retrievable in cleartext from the key endpoint. `users.db` is a bind-mounted file on the
deploy host and in backups. Severity **High**.

It appears in exactly two places in this repository: the Phase 0 finding table, and one
incidental citation inside Step 15's redaction clause. **No waiver, no rule, no step, no
expiry.** Every other High or Critical finding was closed in Steps 11–12; this one stayed
invisible precisely because no artefact tracked it. Step 15 will redact keys *from logs*,
which does nothing about keys sitting in cleartext in the database and the backups.

The decision: record it in [`waivers.yaml`](../../rules/waivers.yaml) with an owner and an
expiry as part of Step 15, so it stops being ownerless. The real fix — store a hash, show the
key once on regeneration — changes the key endpoint's response contract, so under **F2** it is
a public-surface migration and gets its own step rather than being buried inside the audit-log
change.

### `SHIM-SEC-006` cannot be removed in Step 15

The audit log is the *instrument* that makes "is anyone still sending the Bearer-as-API-key
shape?" answerable. It is not the answer. Answering needs the instrument deployed to
production and a soak period, and nothing local can produce that. So Step 15 lands the
instrument and the query, and records the soak start date; **removal is a follow-up change
before the expiry**, which has not moved.

### Suggested order

Five sub-changes. The first two are prerequisites for everything after them.

| | Delivers | Behaviour-changing |
|---|---|---|
| ~~**15d**~~ | **Done 2026-08-28**, on branch `step-15d-timeout-rule`. `RULE-OPS-001`, the OPS family, and the [`Timeouts`](../operations.md#timeouts) anchor the rest of Step 15 points at. Both arms proven — the subprocess arm by deleting the real `timeout=10`, the egress arm by introducing the first HTTP client. The gate now proves **42** rules able to fail, up from 40. See [brief 0017](../briefs/0017-timeouts-are-declared.md) and [ADR 0022](../adr/0022-timeouts-are-declared.md). | No |
| ~~**15a**~~ | **Done 2026-08-28**, on branch `step-15a-structured-logging`, in two commits. First the rule: `RULE-OPS-002`, an AST scan refusing a credential-bearing expression at a logging call, landed while there was still no logging to break it ([ADR 0023](../adr/0023-no-secrets-in-logs.md)). Then the logging: one JSON stream with uvicorn's own loggers folded into it via `--log-config`, a runtime redaction filter that matches by value shape as well as by field name, `LOG_LEVEL` as the only knob, a per-request correlation id in a `ContextVar` and on `X-Request-Id`, and `json-file` rotation in both compose files ([ADR 0024](../adr/0024-structured-logging.md)). No new rule in the second commit — the conformance suite still proves **44**. Rotation is checked in but **not yet applied on the deploy host**; see [brief 0018](../briefs/0018-structured-logging.md). | Yes — it creates an output surface that did not exist |
| ~~**15b**~~ | **Done 2026-08-28.** One silence kept — `sqlite3.OperationalError` carrying `duplicate column name`, a string measured against the pinned driver rather than recalled — and everything else logged. Catch boundary is `sqlite3.Error`, deliberately wider than `OperationalError` so a corrupt file or a malformed statement is reported rather than refusing the boot. `WAIVER-OPS-001` resolved. See [brief 0019](../briefs/0019-narrowing-the-migration-except.md) and [ADR 0025](../adr/0025-narrowing-the-migration-except.md). | Yes — runs at boot against the production database |
| ~~**15c**~~ | **Done 2026-08-28.** `audit.db` in its own file under `DATA_ROOT` — the only bind-mounted directory, so it survives a deploy without a compose change. Twelve event types, four outcomes, and the three credential shapes finally distinguishable: `api-key-header`, `bearer-jwt`, `bearer-api-key`. Same request id as the log lines. No read endpoint, no route count moved, no credential in any row. See [brief 0020](../briefs/0020-the-audit-log.md) and [ADR 0026](../adr/0026-the-audit-log.md). | Yes — new persisted data |
| ~~**15e/f**~~ | **Done 2026-08-28.** [`docs/threat-model.md`](../threat-model.md) in eight sections, each ending with what is *enforced* by a named rule and what is only *asserted* and carries a risk id. No new rule: 22 existing ones are cited. SEC-5 finally has an owner as `WAIVER-SEC-003`, expiring 2027-01-31. Three stale claims about production corrected against a host read. See [brief 0021](../briefs/0021-threat-model-and-sec-5.md) and [ADR 0027](../adr/0027-the-threat-model.md). | No |

Two things worth knowing before starting 15c: the admin bootstrap **already returns a reason
string naming which branch it took, and the caller throws it away** — that return value was
written for this audit log. And there is **no logout endpoint** (auth is stateless; the
frontend simply drops the token), so do not scope logout auditing.

### Still open, and not decided

**The F4 branch-protection question** (§7) was put to the human again on 2026-08-27 and again
went unanswered. It is not blocking anything; it just keeps reappearing.

## 4. Remaining plan steps

| Step | Scope | Notes |
|---|---|---|
| ~~10~~ | ~~`make brief` generation; ADR-link resolution~~ | **Done.** See `docs/briefs/0011-briefs-and-record-resolution.md` and ADR 0016. |
| ~~11~~ | ~~Security wave 1~~ | **Done.** All five findings closed across two changes. |
| ~~12~~ | ~~Security wave 2 — Taskwarrior argv hardening~~ | **Done.** Free text after `--`, override refusal at the choke point, `RULE-ARCH-004` keeps `subprocess` there. `WAIVER-SEC-002` resolved. See `docs/briefs/0014-taskwarrior-boundary.md` and ADR 0019. |
| ~~13~~ | ~~Public-surface protection~~ | **Done.** Five snapshots under `ops/surfaces/`, env vars cross-checked against README. `BLIND-MCP-001` resolved. Found: every MCP tool name in the README was wrong, and `PORT` was documented but unread. See `docs/briefs/0015-public-surface-protection.md` and ADR 0020. |
| ~~14~~ | ~~Supply chain~~ | **Done.** Four images digest-pinned, Arch packages pinned to a dated archive snapshot, hash-pinned Python locks, 305 licences classified, secret scanning, Dependabot. `python-jose` 3.3.0→3.5.0. See `docs/briefs/0016-supply-chain.md` and ADR 0021. |
| **15** | Operability and the minimal threat model | **Next.** Scoped in full in §3 — it is larger than this row once claimed. |
| **16** | `make decay-review`, Phase 4 audit, **Cold-Agent Index and Change Tests** | 16a landed early; **16b landed 2026-08-29**; **16c landed 2026-08-30**. **16d's first half landed 2026-08-30** — the Phase 4 audit and the versioned Cold-Agent criteria. Remaining: *running* the Cold-Agent Index and Change Tests, which needs a session with no memory of this work. |

One unimplemented command remains, exiting `3` and naming its step: `rebuild-verify` (5).
`grant-admin` was added in Step 11; `scaffold` landed in 16b, `decay-review` in 16c.

---

## 5. Open debt with dates on it

**Two waivers expire 2026-11-04**, and one shim expires 2026-11-25. When that date passes, `RULE-RULE-002` stops the gate
until each is resolved or deliberately re-approved:

| Waiver | Finding | Resolved by |
|---|---|---|
| `WAIVER-OPS-001` | migrations swallow every exception | Step 15 |
| `WAIVER-TYPE-001` | unchecked `Row \| None` in two handlers — a reachable 500 on `/auth/me` | its own step |

Thirty-nine residual risks are recorded in `rules/ledger.yaml`. The ones that shape decisions:

- **`RISK-DEP-003`** — `passlib` 1.7.4 is the *latest* release and it is from 2020-10-08. It
  is the only thing hashing passwords here, and `bcrypt` is frozen at 4.0.1 because passlib
  reads an attribute bcrypt removed — bcrypt 5.0.0 does not warn, it fails every hash. A
  security-relevant dependency held in place by a dead one.
- **`RISK-MCP-001`** — the index derives `mcp_tool` nodes by declaration while the surface
  snapshot derives them by booting the app. Two producers of one fact, only one observed, and
  nothing compares them: an index query returns a handler name, a client sees an operation id.
- **`BLIND-OPS-001`** — the deploy host's compose file was read on 2026-08-24 and is now
  **checked in as `ops/deploy/docker-compose.yml`** (no secrets: `JWT_SECRET` is a `${...}`
  reference, and `RULE-HYG-003` fails the gate if a literal ever replaces it). It uses
  `image: ghcr.io/ulrichschinz/runway-*`, so `docker compose pull` *does* consume the images
  CI pushes. Two claims this repository made turned out false — the healthchecks did not run
  in production, and the rollback runbook's `RUNWAY_SHA` had nothing to substitute into —
  and both are fixed in the checked-in copy. What remains open is that **nothing compares
  the copy against the host** (`RISK-OPS-002`); CI has no host access, so it needs a
  scheduled job somewhere that does.
- `RISK-GOV-001` — one maintainer, so required-reviewer approval cannot be independent.
- `RISK-GOV-002` — the branch-protection drift check needs an authenticated `gh`; it
  reports "skipped" in CI, so it effectively only runs from the maintainer's machine.
- `RISK-TEST-001` — the container tier cannot run on arm64; CI runs it.
- `RISK-IDX-001` — the MCP adapter is tested at the protocol level, never against a real
  MCP client.
- `RISK-DOC-001` — "query the index first" is unenforceable.

---

## 6. Things a fresh session would otherwise re-learn the hard way

- **`make fix` before `make check`.** Any edit to a tracked file makes the index stale,
  because ADRs, rules and contracts are nodes in it.
- **`git add` early.** The index reads `git ls-files`, so a new file is invisible to it
  until staged — a local `verify` can pass while CI fails on the same commit. This
  happened in Step 9.
- **Exit codes are exact only through `./run`.** `make` collapses every failure to `2`.
- **Adding a rule means four things**: a script in `tools/checks/`, a line in
  `tools/checks/profiles.conf`, an entry in `rules/ledger.yaml`, and a fixture in
  `tools/fixtures/negative.sh`. `RULE-GATE-002` enforces the fourth.
- **After changing `frontend/package.json`, run `tools/npm-lock.sh`.** npm 11 and npm 10
  disagree on lockfile contents and CI (Node 20) rejects a lockfile written by npm 11 —
  invisibly, until you push.
- **A fixture that depends on a defect expires when the defect is fixed.** Four index tests
  used the `gtd.py → task_runner` violation as their known edge; Step 8 repaired it and
  broke all four, correctly.
- **The index is descriptive, `architecture.toml` is normative.** Twice the index disagreed
  with the declaration and the *declaration* was wrong.
- **Do not quote a dangling identifier in prose.** `RULE-DOC-004` resolves every
  `RULE-`/`RISK-`/`BLIND-`/`WAIVER-`/`CYCLE-` id named in a record or brief, so a document
  explaining a wrong id must *describe* it, not reproduce it. Step 10 hit this three times
  while being written.
- **Records point at files with links, not backticks.** Path existence is deliberately not
  checked (`RISK-DOC-002`) because prose cannot be distinguished from reference; a markdown
  link is checked and carries the guarantee for free.

---

## 7. The frozen decisions (F1–F4)

Recorded in full in `docs/plan/phase-0-2.md`. In short: **F1** scaling/HA/multi-tenant are
out of scope · **F2** REST and MCP surfaces are treated as externally consumed, so changes
go through expand→migrate→switch→contract · **F3** all three security fixes, in plan order,
with the two preconditions above as hard blockers · **F4** `verify` required — and see the
correction below, because the "direct pushes still allowed" half turned out not to be
achievable.

**Correction to F4, 2026-08-14.** `required_status_checks` *does* reject a direct push to
`main`: a fresh commit has no check runs, so GitHub declines it. The 2026-08-04 test that
seemed to show otherwise was invalid — it pushed a *new branch*, which is branch creation
rather than a push onto a protected branch. Every change has gone through a pull request
anyway, so nothing was actually blocked, but the claim was wrong and is now corrected in
`ops/github/ruleset.json` and `docs/operations.md`.

**Open decision for the next session:** keep PR-only (current reality, strongest), or drop
`required_status_checks` and rely solely on `deploy.yml`'s `needs: verify` — which restores
direct pushes but would let a red pull request merge.

---

## 8. How to resume

Say *"where are we and how do we go on"*. The answer should be: read this file, run §1's commands, and then
pick up at **16d's second half** — the Cold-Agent tests — which is the only implementation work left in the
plan. Everything before it has landed on this branch.

### If you are the cold session, stop reading here

The Cold-Agent test measures whether an agent that has never seen this work can answer real change requests
from the repository's own contract and index. **This file is a summary of the answers.** So is
[`ops/cold-agent/criteria.md`](../../ops/cold-agent/criteria.md), which is the scoring key.

Two roles, and they must not be the same session:

- **The subject** is handed only the three request prompts and the repository. It reads
  [`AGENTS.md`](../../AGENTS.md) and queries the index — that is precisely what is being measured — and
  never this file, never the criteria, never `docs/briefs/`. Its transcript, queries and wall time are
  captured.
- **The scorer** reads that transcript afterwards and scores it against the criteria.

The criteria's §2 makes the precondition measurable rather than asserted: a negative control is asked
before any repository access, and an answer that names a rule id, a unit id, a count or the decay review
**voids** the run. Void is not the same as fail — it means the session was contaminated and the result says
nothing. A run that quietly skips this proves nothing at all, which is worse than not running it, because
the register would then carry a pass nobody can trust.

**Step 15 is complete** (2026-08-28), and so is **16b** (2026-08-29). Everything sits on
`step-15a-structured-logging` — twelve commits, none merged, no PR opened. The gate proves
**46** rules able to fail, up from 40 when Step 15 began.

Two things landed after Step 15 and are easy to miss because they are not plan steps:

- **The compose file is now deployed rather than described** (`135ab62`). The forced command
  fetches [`ops/deploy/docker-compose.yml`](../../ops/deploy/docker-compose.yml) at the deployed
  commit and applies it, so `RISK-OPS-002` closes by construction once the host swap is done.
  `RULE-OPS-003` bounds what that file may ask of the host. **The swap has not been done** —
  see the host items below; until it is, none of Step 15's compose changes reach production.
- **`./run scaffold` works** (`50aa33a`). Verified end to end: one command, `verify` green with
  zero manual edits, and the generated unit removes cleanly leaving the tree byte-identical.

- **The gate now reviews itself** (16c, 2026-08-30). `./run decay-review` runs six diagnostics and
  writes recomputable evidence to [`ops/decay-review.json`](../../ops/decay-review.json);
  `RULE-GOV-002` fails `verify` when that evidence is overdue (45 days) or does not verify. The
  suite proves **47** rules able to fail. The first run's findings are live and unowned:
  `WAIVER-TYPE-001` expires in 66 days and `SHIM-SEC-006` in 87, five fan-in baselines have no
  attribution (`RISK-ARCH-002`), and `RULE-TI-003`'s check covers five of twenty-one commands
  (`RISK-TI-001`). See [brief 0023](../briefs/0023-the-decay-review.md) and
  [ADR 0030](../adr/0030-the-decay-review.md).

- **The gate has now been audited against its own claims** (16d first half, 2026-08-30). Six
  findings, none of them a rule going red: the conformance suite was counting fixture *arms* and
  every document read the number as rules (47 arms, 44 rules, 41 proven); `RULE-GATE-002` itself
  had no declared exemption for being unprovable (`RISK-GATE-001`); the stale-index message named
  neither its rule nor its contract section; three re-open triggers named a plan step that had
  already landed, so they could never fire; `index/manifest.toml` and the index disagreed about
  how many blind spots exist (`RISK-IDX-002`); and the gate's own Python is outside ruff and mypy
  (`RISK-GATE-002`). `RULE-DOC-005` was added — every rule's `contract:` pointer must resolve.
  The suite now proves **42 of 45** rules able to fail over 48 arms. See
  [brief 0024](../briefs/0024-the-phase-4-audit.md) and [ADR 0031](../adr/0031-the-phase-4-audit.md).

**Remaining: 16d's second half — running the Cold-Agent Index and Change Tests.** The versioned
pass criteria exist at [`ops/cold-agent/criteria.md`](../../ops/cold-agent/criteria.md) and were
written before any run, which is the whole point of them; the harness is
[`tools/cold_agent_score.py`](../../tools/cold_agent_score.py) and
[`ops/cold-agent/run-template.json`](../../ops/cold-agent/run-template.json), and
[`ops/cold-agent/runs/`](../../ops/cold-agent/runs) is empty and must stay so until a real run
fills it. The precondition no tooling can satisfy stands: the test session must carry no
agent-side cache, knowledge base or session memory from this work, arranged before the run rather
than asserted after it — and §2 of the criteria makes that measurable with a negative control
rather than a tick-box. The reduced Cold-Agent Change Test that 16c runs monthly does **not**
discharge it: it reduces the agent, not the index — one request instead of three, no session, no
`grep` baseline, no judgment about whether the contract was read.

**Also outstanding, and it needs your hands:** nothing has ever observed branch protection *block*
a merge (`RISK-GOV-006`). The live ruleset was confirmed active and correct on 2026-08-30 and all
twenty merged pull requests had a green `verify`, but the blocking behaviour is only observable by
attempting a merge. The five-minute procedure — open a deliberately red pull request, observe
`mergeStateStatus` is `BLOCKED`, close it without merging — is written out in
[ADR 0031](../adr/0031-the-phase-4-audit.md).

Do not try to remove `SHIM-SEC-006` in this step, and do not fold the SEC-5 fix into the audit
log — §3 records why for both.
