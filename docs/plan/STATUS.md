# Session handoff — where we are, and how to go on

**Snapshot taken 2026-08-27 at the head of `main` (`31326de`), after a session crash.** This file is a *dated handoff*, not a source of
truth. Everything in it can drift; §1 tells you how to re-establish the real state in about
twenty seconds. When they disagree, the commands win.

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

**Seventeen changes merged to `main`, all green.** `verify` re-run 2026-08-27: **GREEN in 53s,
40 rules proven able to fail, 0 not.** Plan step → PR:

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

**All three pillars exist:** contract (`AGENTS.md`, self-checked), gate (**40 rules, 40
proven able to fail on every run**), index (built, qualified, deterministic, queryable).

`check` ~5s · `verify` ~53s local. Unimplemented commands are `rebuild-verify` (5),
`scaffold` (16b) and `decay-review` (16c); `brief`, `surfaces`, `lock` and `grant-admin` are implemented.

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
| **15b** | Narrow the migration `except` per decision 3; resolve `WAIVER-OPS-001`. | Yes — runs at boot against the production database |
| **15c** | The audit log, including the credential-shape discriminator that `SHIM-SEC-006` needs. | Yes — new persisted data |
| **15e/f** | The shim evidence runbook, `docs/threat-model.md`, the SEC-5 waiver, and the residual risks this step's own blind spots create. | No |

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
| **16** | `make scaffold`, `make decay-review`, Phase 4 audit, **Cold-Agent Index and Change Tests** | 16a already landed early. |

Unimplemented commands (each exits `3` naming its step): `rebuild-verify` (5),
`scaffold` (16), `decay-review` (16). `grant-admin` was added in Step 11.

---

## 5. Open debt with dates on it

**Two waivers expire 2026-11-04**, and one shim expires 2026-11-25. When that date passes, `RULE-RULE-002` stops the gate
until each is resolved or deliberately re-approved:

| Waiver | Finding | Resolved by |
|---|---|---|
| `WAIVER-OPS-001` | migrations swallow every exception | Step 15 |
| `WAIVER-TYPE-001` | unchecked `Row \| None` in two handlers — a reachable 500 on `/auth/me` | its own step |

Twenty residual risks are recorded in `rules/ledger.yaml`. The ones that shape decisions:

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

Say *"where are we and how do we go on"*. The answer should be: read this file and run §1's
commands, then **start Step 15** — it is next in plan order, entirely local, and its four
open design decisions were closed on 2026-08-27 (§3).

**15d is done** (2026-08-28). Next is **15a**, structured logging, which both **15b** and
**15c** depend on. Its rule joins the OPS family 15d established and points at the same
[`Timeouts`](../operations.md#timeouts) neighbourhood in `docs/operations.md`.

Do not try to remove `SHIM-SEC-006` in this step, and do not fold the SEC-5 fix into the audit
log — §3 records why for both.
