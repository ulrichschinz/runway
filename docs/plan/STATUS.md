# Session handoff — where we are, and how to go on

**Snapshot taken 2026-08-14 at `90b7952`.** This file is a *dated handoff*, not a source of
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

**Ten changes merged to `main`, all green.** Plan step → PR:

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

**All three pillars exist:** contract (`AGENTS.md`, self-checked), gate (**30 rules, 28
proven able to fail on every run**), index (built, qualified, deterministic, queryable).

`check` ~7s · `verify` ~34s local, ~90s CI.

---

## 3. What to do next — Step 11, and it needs the human

**Step 11 is the security wave that touches the running production instance.** It is the
next step, and it is blocked on two preconditions that cannot be cleared from a dev
machine. Both were recorded as hard blockers when decision **F3** was frozen.

### Blocker A — is production running on the default JWT secret?

`docker-compose.yml` resolves `JWT_SECRET=${JWT_SECRET:-changeme-set-in-.env}` at compose
parse time, from a `.env` beside the compose file on the deploy host. **Nobody has yet
confirmed what that resolves to in production.**

The operator runs, on the host:

```sh
cd /opt/services/runway
docker compose config | grep JWT_SECRET     # the authoritative answer
```

If it prints `changeme-set-in-.env`, production is live on the publicly known default
(finding SEC-1) and must be fixed *before* Step 11 lands.

**Agreed sequencing (from the last exchange): set a real secret as a separate ops action
first.** Then Step 11's boot-refusal is a no-op for production rather than a coupled
code-and-config change that can leave a container refusing to start with no obvious cause.

```sh
openssl rand -base64 48        # then set JWT_SECRET in /opt/services/runway/.env
docker compose up -d
```

Cost: **one round of logouts** — JWTs stop validating. **API keys are unaffected**:
`get_current_user` checks `X-Api-Key` against a database row *before* trying the JWT, so
agents, MCP clients and the `/inbox` webhook keep working across a rotation.

### Blocker B — the admin bootstrap

`init_db()` runs `UPDATE users SET role='admin' WHERE username='uli'` on **every** startup
(finding SEC-2). Step 11 deletes it. Before that, an explicit bootstrap must exist **and be
proven against a copy of the production `users.db`**, or the maintainer loses admin access
at the next restart.

### Also outstanding from the last exchange

An offer the human had not yet answered: build a **preflight check** that reports whether a
resolved `JWT_SECRET` is a known default or too short — runnable *on the host* against
`docker compose config`, so "is production configured?" becomes something tooling answers
rather than something someone remembers to check.

### Then Step 11 itself

SEC-1 refuse to boot on a default/unset secret · SEC-2 remove the hard-coded `uli`
promotion, replace with an explicit bootstrap · SEC-4 CORS allowlist instead of wildcard ·
SEC-6 unify `/inbox` onto `get_current_user` behind a tracked compatibility shim · SEC-8
login rate limiting. Each with an adversarial fixture proving the gate goes red before the
fix and green after.

---

## 4. Remaining plan steps

| Step | Scope | Notes |
|---|---|---|
| **10** (partial) | `make brief` generation; ADR-link resolution as a gate check | `docs/change-workflow.md` and the five delivery patterns already landed in Step 9. `./run brief` still exits 3. |
| **11** ⚠ | Security wave 1 — see §3 | **Behaviour-changing. Blocked on the human.** |
| **12** ⚠ | Security wave 2 — Taskwarrior argv hardening at the `_run` choke point | Behaviour-changing. SEC-3 is *resolved* (medium, not critical) but the fix is still owed: containment today is an accident of a third-party argument grammar, not a control. |
| **13** | Public-surface protection: OpenAPI snapshot, **runtime-observed MCP tool list**, DB schema, env-var schema, SPA routes | Also replaces `BLIND-MCP-001` with `RUNTIME_OBSERVED` evidence. |
| **14** | Supply chain: hash-pinned lockfile, licence policy, digest-pinned base images, secret scanning | The `mcp` incident is the argument for this one. |
| **15** | Operability: structured logging with a no-secrets rule, audit log, healthchecks already landed, `WAIVER-OPS-001` resolution | |
| **16** | `make scaffold`, `make decay-review`, Phase 4 audit, **Cold-Agent Index and Change Tests** | 16a already landed early. |

Unimplemented commands (each exits `3` naming its step): `rebuild-verify` (5),
`brief` (10), `scaffold` (16), `decay-review` (16).

---

## 5. Open debt with dates on it

**Four waivers expire 2026-11-04.** When that date passes, `RULE-RULE-002` stops the gate
until each is resolved or deliberately re-approved:

| Waiver | Finding | Resolved by |
|---|---|---|
| `WAIVER-SEC-001` | default JWT signing key in a public repo | Step 11 |
| `WAIVER-SEC-002` | unvalidated input reaching the `task` argv | Step 12 |
| `WAIVER-OPS-001` | migrations swallow every exception | Step 15 |
| `WAIVER-TYPE-001` | unchecked `Row \| None` in two handlers — a reachable 500 on `/auth/me` | its own step |

Ten residual risks are recorded in `rules/ledger.yaml`. The ones that shape decisions:

- **`BLIND-OPS-001`** — the deploy host's compose file is **not in this repository**. The
  checked-in one declares `build:` with no `image:`, so `docker compose pull` cannot consume
  the images CI pushes. Until this is resolved, the rollback runbook in
  `docs/operations.md` is intent, not verified fact. *This is the single largest unknown.*
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

Say *"where are we and how do we go on"*. The answer should be: read this file and §1's
commands, then either

- **clear Blocker A** by running `docker compose config | grep JWT_SECRET` on the deploy
  host and reporting what it says — that unblocks Step 11 and is the highest-value next
  action; or
- **do Step 10** (`make brief` generation and the ADR-link gate check), which is entirely
  local, needs nothing from the human, and is the natural thing to build while the
  production question is being answered.
