# Change Impact Brief 0044 — The deploy says which commit is answering

| Field | Value |
|---|---|
| **Requested outcome** | The `deploy` job reports success when an SSH connection closed. It has never reported anything about production. That was survivable while the only thing crossing the wire was application code with a healthcheck behind it; it stopped being survivable when the image started carrying content this repository makes a claim about — the skill it serves ([brief 0041](0041-the-server-ships-the-skill.md)) and now the hooks beside it ([brief 0043](0043-the-review-reminder.md)). Both are delivered by lines in `.dockerignore` and `backend/Dockerfile`, and an edit to either produces an image that passes the whole gate and answers **503** on one route, because the gate builds no image ([`RISK-OPS-002`](../../rules/ledger.yaml)). `GET /api/skill` was built to be readable by exactly this job ([ADR 0040](../adr/0040-the-server-ships-the-skill-it-speaks.md) Decision 2), and until now nothing read it. The outcome is that every push to `main` ends with CI having asked the running server which commit and which skill it is serving, and having compared both against the commit that was pushed. |
| **Owning unit** | `ops` — [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml) and [`rules/ledger.yaml`](../../rules/ledger.yaml); `docs` — [`docs/operations.md`](../operations.md), [ADR 0040](../adr/0040-the-server-ships-the-skill-it-speaks.md), [`AGENTS.md`](../../AGENTS.md). No `backend/` or `frontend/` file is touched. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §6 (`rules/ledger.yaml` is an owner-approval file, and so is what CI is configured to do), §10 (`RISK-OPS-002` is stated there and its wording moves with this change), §5 (no public surface moves — the two routes this job reads already exist and are unchanged). Not §9: no rule is added, removed or redefined, so the meta-rule does not apply — see *Why this is not a gate rule*. |
| **Governed by** | [ADR 0040](../adr/0040-the-server-ships-the-skill-it-speaks.md) — the server ships the skill it speaks; **extended here with Decision 6**, the post-deploy check that reads the release record, and with the correction that the check's brief is this one and not 0042. [ADR 0032](../adr/0032-the-deploy-mechanism-correction.md) — what the deploy actually does on the host, and why "green" said so little; this is the first thing in the pipeline that looks back at it. |
| **Rule IDs introduced** | **None.** One residual risk is **narrowed**: `RISK-OPS-002` gains a dated paragraph naming the job, what it now proves (the commit answering, the skill version and content hash it serves, `/health`, the zip's contents) and what it still cannot see (the host's own `docker-compose.yml`). Its `re_open_trigger` is unchanged, deliberately — it asks for a check that compares the host's compose against the deployed commit, and this is not that check. |
| **Entry points** | The `verify-deploy` job in [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml): `needs: deploy`, `timeout-minutes: 8`, `permissions: contents: read`, `RUNWAY_URL` from `vars.RUNWAY_PUBLIC_URL` with the public origin as the literal fallback, one `actions/checkout` and one POSIX `sh` step. |
| **Affected public surfaces** | **None of the eight in `AGENTS.md` §5.** REST stays **40**, MCP tools **27**, route guards **39** (30 `user` / 4 `admin` / 5 `open`); `./run surfaces` reports no drift. No skill file changes, so the plugin stays **1.1.0** and `ops/skill-release.json` is untouched — `RULE-SURF-004` has nothing to hold here. The job is a *consumer* of two surfaces, not a change to them. |
| **Known dependents** | Nothing depends on this job; it depends on five things, and each is a rename away from breaking it: `GET /api/skill`'s response shape (`.server.commit`, `.skill.version`, `.skill.sha256`), the zip's one-directory layout (`runway/SKILL.md`), the `version` key of [`integrations/claude/.claude-plugin/plugin.json`](../../integrations/claude/.claude-plugin/plugin.json), the `sha256` key of [`ops/skill-release.json`](../../ops/skill-release.json) — those four are pinned by [`backend/tests/unit/test_skill.py`](../../backend/tests/unit/test_skill.py), so a rename goes red inside the gate long before it reaches this job, which is the right order because this job's failure costs a deploy. The fifth is `GET /api/health`'s body, `{"status": "ok"}`, and it is pinned by **nothing**: the route declares no response model, every unit test that touches it asserts the status code, and the OpenAPI snapshot therefore records no schema for it. This job is the first consumer of that literal, and it was not added to the gate for it — see *Why this is not a gate rule*. |
| **Uncertain / dynamic areas** | `RISK-OPS-002` — the host's compose file stays unread, and a deploy that never rewrote it still looks green here for as long as the running containers answer correctly. `BLIND-TEST-001` — a workflow has no import-derived test protection and cannot; the step was run by hand instead (below). **Not made executable by anything:** that GitHub resolves `vars.RUNWAY_PUBLIC_URL` to the empty string when it is unset (documented behaviour, hence the `||` fallback) and that the runner image ships `jq` and `unzip` (both are on `ubuntu-latest` today). The poll window is an estimate, not a measurement — nothing here has timed a real restart (see *The control*). The first real run is the merge of PR C. |
| **Analogous implementations** | [Brief 0041](0041-the-server-ships-the-skill.md) — the route this reads, written with this consumer named in its scope as "not yet". [Brief 0043](0043-the-review-reminder.md) — the same verification technique for the same class of artefact: a shell script that talks HTTP, proven by putting a stub `curl` first on `PATH` and asserting behaviour rather than by mocking a server. [ADR 0032](../adr/0032-the-deploy-mechanism-correction.md) — the six-day silent failure that is the reason this job exists. |
| **Delivery Pattern** | **Security or Operability Change.** Failure scenario, control, adversarial proof: the scenario is stated below with the two ways it has already happened, the control is the job, and every branch of it was driven red by hand. |
| **Required tests** | **None in the gate**, and that is a decision rather than a gap — see *Why this is not a gate rule*. What was required instead: the step's bytes, extracted from the YAML and run under `/bin/sh` against a stub `curl` first on `PATH`, over eleven scenarios — the happy path, a late cutover (old commit for two polls, then the new one), a commit that never changes, `/api/skill` answering 503, a body that is not JSON, a wrong skill version, a wrong content hash, `/health` not `ok`, a healthy old build replaced by an unhealthy new one, a zip without `runway/SKILL.md`, and the zip route answering 503. Plus `dash -n` on the extracted script, and a `RUNWAY_URL` with a trailing slash asserted not to produce a doubled path. The harness reads the version and the hash from the repository's own files, so the happy path proves the comparison against the real record rather than against a constant. |
| **Intended scope** | The `verify-deploy` job; the `RISK-OPS-002` paragraph in the ledger and the sentence that states it in `AGENTS.md` §10; `docs/operations.md` (the pipeline diagram, a new *What says the deploy actually happened* subsection, and one paragraph under *Health* about the ordering); ADR 0040's Decision 6 and the two references in it that this commit makes true. **Not** in scope: the root `README.md`'s "Use runway from Claude" section and `docs/plan/STATUS.md` (C-4, the docs-closure commit); any change to the routes being read; any check of the host's compose file; and a rollback on failure, which is deliberately absent — see below. |
| **Base revision** | `22965f8` |

## The failure scenario

Concretely, twice over, both from this repository's own history:

1. **The deploy that deployed nothing.** For six days in August 2026 every push to `main`
   produced a green pipeline while this service shipped images without its configuration: the
   host script extracts the compose from the first image that carries one, and it falls
   through in silence for images that carry none (ADR 0032, and the `RISK-OPS-002` statement
   that records the same silence). It was found by a human reading the host.
2. **The image that loses what it is supposed to serve.** `.dockerignore` is deny-all-then-admit
   and `backend/Dockerfile` copies three paths. Dropping one of them is a one-line edit that
   every gate passes — no image is built in CI — and that produces a server answering 503 on
   `/api/skill` and `/api/skill/runway.zip`. Brief 0041 wrote that down as the gap it could not
   close; brief 0043 widened the same surface to the hooks.

In both, the signal that something is wrong reaches a human only when a human happens to look.
The control puts the looking in the pipeline.

## The control

`verify-deploy`, `needs: deploy`. Four questions, in an order that matters:

1. **Which commit is answering?** Poll `GET /api/skill` every ten seconds for up to six minutes
   until `.server.commit` equals `$GITHUB_SHA`. Everything after this point would otherwise be
   asking the *previous* build whether it is correct, and it is — which is exactly how a failed
   deploy looks green.
2. **Is it serving what this commit recorded?** `.skill.version` against `plugin.json`, and
   `.skill.sha256` against `ops/skill-release.json`. The hash covers everything a plugin update
   delivers, so this is also the assertion that the image carries a complete skill tree.
3. **Is the rest of the application up?** `/api/health` says `ok`.
4. **Does the download work?** Fetch the zip and confirm `runway/SKILL.md` is inside it.

The poll window is the one number with judgement in it, and it is an estimate rather than a
measurement: `deploy.yml` already records the host's forced command as taking seconds and caps
that job at five minutes for a cold `docker compose pull`, so six minutes of polling *after* it
returns is the same order of headroom applied to the container coming up. It sits inside this
job's eight-minute cap, so a server that is never coming back is reported rather than holding a
runner to GitHub's own limit. If the first real deploys show the restart is slower than that, the
number moves — the poll is what makes it adjustable without making the check racy.

**It does not roll back.** The deploy has already happened by the time this job runs, and an
automatic rollback would be a second unattended write to production triggered by a check that can
fail for reasons outside production — a runner without network, a DNS hiccup, GitHub's own
outage. Rolling back is a decision with a runbook (*Rolling back* in `docs/operations.md`); this
job's job is to make sure somebody knows there is a decision to make.

**The key never appears.** Both routes are open (ADR 0040, Decision 2), which is what lets this
job run at all: it holds no user's credential, and there is nothing in its environment to leak
into a log. `RUNWAY_URL` is a repository variable, not a secret, and the public origin is the
fallback literal so that a fork needs no configuration to be correct.

## Why this is not a gate rule

`tools/checks/` holds checks any clone can reproduce offline, and `RULE-GATE-002` requires every
rule to have a negative fixture that proves it can fail. This check's answer depends on a host
that is not in the repository and on a moment in time — the same commit verifies green after the
deploy and red thirty seconds before it. A rule like that teaches contributors that red is
sometimes meaningless, which is the failure mode `AGENTS.md` §7 exists to prevent. It also cannot
block anything: what it observes has already shipped.

So it is a job, and the meta-rule (§9) does not fire: no check script, no ledger rule, no fixture
arm. What the ledger gains is the narrowing of a residual risk, which is the honest record of a
gap that got smaller without closing.

The one thing here a gate rule *could* hold is the `/health` literal this job now reads, which no
snapshot and no test pins today. Giving that route a response model would put its body in
`ops/surfaces/openapi.json` under `RULE-SURF-001` — a public-surface change, in its own commit,
with the migration pattern that goes with it. It is not folded in here, where it would be an
unrelated surface edit inside an operability change; until it happens, a `/health` that stops
saying `ok` fails this job with a message naming exactly what it said instead.

## Pre-checks

- `make check`: **GREEN**, 18s of the 180s budget. `make verify`: **GREEN**, 139s of 600s.
  Backend unit **642 passed**, frontend **80 passed**, both unchanged — this commit touches no
  code. `./run surfaces`: 5 snapshots match, no drift; none is rewritten.
- Gate conformance: **56 fixture arm(s) passed, 0 failed; 46 of 49 executable rules proven able to
  fail** — unchanged, as it must be for a commit that adds no rule.
- `AGENTS.md` is **11991 bytes** of the 12000 `RULE-DOC-002` allows, and the `RISK-OPS-002` bullet
  was rewritten rather than extended: the first draft put the contract at 12020 bytes and its own
  budget refused it. The second draft then failed `RULE-DOC-001`, which reads a backticked
  `deploy.yml` as a path claim and could not find one — the contract names the job's effect
  instead of its file, which is what the sentence had room for anyway.
- Container tier by hand (D25), against `/opt/homebrew/bin/task` **3.5.0**:
  `cd backend && TZ=UTC PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -m container tests/container`
  → **81 passed**, unchanged. A control: this commit contains no Python, no Taskwarrior semantics
  and no test.
- **The step itself, run by hand.** The `run:` block is extracted from `deploy.yml` with a YAML
  parser — so the bytes exercised are the bytes shipped — and executed under `/bin/sh` from the
  repository root, with a stub `curl` first on `PATH` and only the poll window shortened. Results:

  | Scenario | Result |
  |---|---|
  | commit matches on the first poll | **exit 0**, one summary line naming the commit and the skill |
  | old commit for two polls, then the new one | **exit 0** after 3 polls — the loop is what makes the check honest rather than racy |
  | commit never matches | **exit 1** at the deadline, printing what it got and what it expected |
  | `/api/skill` answers 503 (image without the skill) | **exit 1** at the deadline; curl's own error on each attempt |
  | `/api/skill` answers HTML | **exit 1** at the deadline — an unparsable body is not a match |
  | skill version `0.9.0` vs the recorded `1.1.0` | **exit 1**, naming both |
  | content hash differs | **exit 1**, naming both |
  | `/health` says `degraded` | **exit 1** |
  | zip without `runway/SKILL.md` | **exit 1**, printing the archive listing |
  | zip route answers 503 | **exit 1** (curl `-f`) |
  | the old build was healthy, the new one is not | **exit 1** at `/health`, after the poll |

- Adversarial, each an edit to the extracted copy, reverted:
  - **Drop the poll and read `/api/skill` once**: the late-cutover scenario turns **red** — the
    exact false negative this job exists to avoid, reported as a deploy failure on a deploy that
    worked.
  - **Compare `.skill.version` only, not the hash**: the wrong-hash scenario goes **green**. The
    version is a number a human types; the hash is the thing that catches an image built from a
    tree that is not this one.
  - **Move the health check in front of the poll**: the last scenario in the table — a build that
    replaces a healthy one and is not healthy itself — goes **green**, because the question was
    asked of the container that was on its way out. Ordering is a property here, not a style.
  - **`${RUNWAY_URL%/}` removed**: the stub `curl` refuses a doubled slash, **red** — the same
    guard `runway-summary.sh` carries, for the same reason.
  - **`>> "${GITHUB_STEP_SUMMARY:-/dev/null}"` written as `>> "$GITHUB_STEP_SUMMARY"`**: red under
    `set -u` outside Actions, which would have made every by-hand run of this step fail at its last
    line for a reason that has nothing to do with the deploy.
- Not proven by anything until PR C merges: that `needs: deploy` sequences the job after the host
  has finished, that `vars.RUNWAY_PUBLIC_URL` resolves as expected, and that six minutes is enough
  on the real host. The first deploy after the merge is the proof, and `docs/operations.md` names
  what to read if it is not.

## Counts

REST **40**, MCP tools **27**, route guards **39** (30 `user` / 4 `admin` / 5 `open`) — unchanged;
no route is added or touched. Claude skill **1.1.0**, `ops/skill-release.json` unchanged. Fixture
arms **56**, executable rules proven **46 of 49** — unchanged. Workflow jobs in `deploy.yml`:
**3 → 4**.
