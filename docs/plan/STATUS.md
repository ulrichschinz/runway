# Session handoff — where we are, and how to go on

**Snapshot taken 2026-08-23 at the head of `step-10-briefs`.** This file is a *dated handoff*, not a source of
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
| — | PR #13 | **CI hardening**: build platform pinned to `linux/amd64`, deploy bounded, actions bumped |
| 10 | PR #17 | `./run brief` generation; `RULE-DOC-004` resolves references in records and briefs |
| — | PR #15 | Deploy host read; compose checked in; two false production claims corrected; healthchecks and rollback fixed on the host |
| 11 (partial) | PR #16 | SEC-2 closed: zero-admin bootstrap, last-admin guard, `RULE-SEC-001` route guards |

**All three pillars exist:** contract (`AGENTS.md`, self-checked), gate (**33 rules, 32
proven able to fail on every run**), index (built, qualified, deterministic, queryable).

`check` ~5s · `verify` ~40s local. Unimplemented commands are now `rebuild-verify` (5),
`scaffold` (16) and `decay-review` (16); `brief` is implemented.

---

## 3. What to do next — Step 11, and it needs the human

Step 10 is done and Step 12 onward is all local work, but **Step 11 is next in plan order**
and it is the security wave that touches the running production instance. It is blocked on
two preconditions that cannot be cleared from a dev machine. Both were recorded as hard
blockers when decision **F3** was frozen.

### ~~Blocker A — is production running on the default JWT secret?~~ **CLEARED 2026-08-24**

Checked on the host: `JWT_SECRET` resolves to a **non-default 64-character value** (42 distinct
characters, no dictionary words). Production was never on the publicly known default, so no
rotation was performed — it would have cost a round of logouts for no security benefit.

`WAIVER-SEC-001`'s mitigation clause is satisfied: Step 11's boot-refusal will be a no-op for
this deployment rather than a deploy that takes the site down.

### ~~Blocker B — the admin bootstrap~~ **CLEARED 2026-08-24**

`init_db()` no longer promotes `uli`. `bootstrap_admin()` promotes `BOOTSTRAP_ADMIN` only when
the database contains **no admin at all**, which makes it self-limiting: it cannot contradict
a role set through the API and cannot lock anyone out. Paired with a 409 that refuses to
demote the last admin, so the two compose — the guard makes zero admins unreachable through
the API, the bootstrap recovers an instance that reaches zero some other way.

Proven against the production shape: the deploy host's database holds **one admin and one
user**, so the bootstrap returns on its first branch and the change is a no-op there.

See `docs/briefs/0012-admin-bootstrap-and-route-guards.md` and ADR 0017.

### Also outstanding from the last exchange

An offer the human had not yet answered: build a **preflight check** that reports whether a
resolved `JWT_SECRET` is a known default or too short — runnable *on the host* against
`docker compose config`, so "is production configured?" becomes something tooling answers
rather than something someone remembers to check.

### Step 11 — what is done and what is left

| Finding | State |
|---|---|
| **SEC-1** default JWT secret | **No code change needed.** Production was never on a default. The boot-refusal is still worth adding for third-party deployments, but it is no longer urgent and no longer blocked. |
| **SEC-2** hard-coded `uli` promotion | **Done.** Replaced by the zero-admin bootstrap, plus the last-admin guard and `RULE-SEC-001`. |
| **SEC-4** CORS allowlist instead of wildcard | Open. |
| **SEC-6** unify `/inbox` onto `get_current_user` | Open. Now *declared* rather than implicit: `rules/route-guards.toml` records it as `open` with the reason. |
| **SEC-8** login rate limiting | Open. |

Each remaining one still owes an adversarial fixture proving the gate goes red before the fix
and green after.

---

## 4. Remaining plan steps

| Step | Scope | Notes |
|---|---|---|
| ~~10~~ | ~~`make brief` generation; ADR-link resolution~~ | **Done.** See `docs/briefs/0011-briefs-and-record-resolution.md` and ADR 0016. |
| **11** ⚠ | Security wave 1 — see §3 | **Behaviour-changing. Blocked on the human.** |
| **12** ⚠ | Security wave 2 — Taskwarrior argv hardening at the `_run` choke point | Behaviour-changing. SEC-3 is *resolved* (medium, not critical) but the fix is still owed: containment today is an accident of a third-party argument grammar, not a control. |
| **13** | Public-surface protection: OpenAPI snapshot, **runtime-observed MCP tool list**, DB schema, env-var schema, SPA routes | Also replaces `BLIND-MCP-001` with `RUNTIME_OBSERVED` evidence. |
| **14** | Supply chain: hash-pinned lockfile, licence policy, digest-pinned base images, secret scanning | The `mcp` incident is the argument for this one. |
| **15** | Operability: structured logging with a no-secrets rule, audit log, healthchecks already landed, `WAIVER-OPS-001` resolution | |
| **16** | `make scaffold`, `make decay-review`, Phase 4 audit, **Cold-Agent Index and Change Tests** | 16a already landed early. |

Unimplemented commands (each exits `3` naming its step): `rebuild-verify` (5),
`scaffold` (16), `decay-review` (16). `grant-admin` was added in Step 11.

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

Sixteen residual risks are recorded in `rules/ledger.yaml`. The ones that shape decisions:

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

Say *"where are we and how do we go on"*. The answer should be: read this file and §1's
commands, then either

- **clear Blocker A** by running `docker compose config | grep JWT_SECRET` on the deploy
  host and reporting what it says — that unblocks Step 11 and is the highest-value next
  action; or
- **build the JWT preflight check** (§3), which is local, needs nothing from the human, and
  turns Blocker A from something someone remembers to check into something tooling answers;
  or
- **start Step 12** (Taskwarrior argv hardening at the `_run` choke point), the next
  unblocked plan step. It is behaviour-changing, so it wants the Security-or-Operability
  pattern: failure scenario, control, adversarial proof.

Step 10 is done — see §4.
