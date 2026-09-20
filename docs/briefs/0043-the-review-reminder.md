# Change Impact Brief 0043 — The plugin ships the reminder the summary was built for

| Field | Value |
|---|---|
| **Requested outcome** | `GET /gtd/summary` exists so that something can say "a review is due" ([brief 0038](0038-the-gtd-summary.md)), and the change order names a SessionStart hook as its main consumer. Nothing shipped one: `references/setup.md` §6 described a file the user had to write, and the settings page told them to export a variable ([`urlExportLine`](../../frontend/src/shared/claudeConnect.js), [brief 0042](0042-connect-claude-from-the-settings-page.md)) that nothing read. So the plugin now carries `hooks/hooks.json` and `hooks/runway-summary.sh`: one line at the start of a session when a review is due, silence in every other case. The second outcome is the rule that keeps it honest — the released content hash was `skills/` only, so a hook edit without a version bump would have reached nobody, which is `RULE-SURF-004`'s exact failure with a shell script instead of prose in it. |
| **Owning unit** | `ops` ([`tools/checks/skill_surface.py`](../../tools/checks/skill_surface.py), [`tools/checks/skill.sh`](../../tools/checks/skill.sh), [`tools/fixtures/negative.sh`](../../tools/fixtures/negative.sh), [`rules/ledger.yaml`](../../rules/ledger.yaml)), `be/feature/skill` ([`skill_service.py`](../../backend/app/services/skill_service.py) — the copied hash follows the gate's), `fe/shared` ([`claudeConnect.js`](../../frontend/src/shared/claudeConnect.js) — the env step gains the origin), plus `integrations/claude/`, which the index does not model as a unit (it is a consumer that ships from here, ADR 0035). |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 ("a gate rule: a script in `tools/checks/`, a line in `profiles.conf`, an entry in `rules/ledger.yaml`, and a fixture in `tools/fixtures/negative.sh` — all four"; `profiles.conf` already runs `skill`, so the widened rules need the other three), §5 (no promised surface moves; the skill and its release record are held by `RULE-SURF-003/004`), §9 **the meta-rule** — the check, the ledger entry with its fixture, the contract document (`docs/task-interface.md`) and a dated ADR, all in this commit. |
| **Governed by** | [ADR 0035](../adr/0035-the-skill-lives-with-the-api-it-drives.md) — the skill ships from this repository with the API it drives, which is why a hook for that API belongs here and not in a dotfiles repository. [ADR 0040](../adr/0040-the-server-ships-the-skill-it-speaks.md) — the release hash and the image that serves it; its Consequences already named this change and now link to this brief. **New: [ADR 0041](../adr/0041-the-plugin-ships-a-review-reminder.md)** — the plugin ships a review reminder: REST not MCP, silence by default, counters only, the env contract, the widened hash, and why not a server push. |
| **Rule IDs introduced** | None introduced; **two widened**, which is the same obligation. `RULE-SURF-004` now covers `integrations/claude/hooks/` as well as `skills/`. `RULE-TEST-005` now also requires `integrations/claude/hooks/runway-summary.sh` to pass [`tests/hook_test.sh`](../../integrations/claude/tests/hook_test.sh). Both keep their check (`tools/checks/skill.sh`), both gain a negative-fixture arm (`SURF-004-hooks`, `TEST-005-hook`), and both statements and rationales are rewritten in `rules/ledger.yaml`. `docs/task-interface.md` "The Claude skill" carries the contract text, including the hook's own contract. |
| **Entry points** | [`integrations/claude/hooks/runway-summary.sh`](../../integrations/claude/hooks/runway-summary.sh) (the script), [`integrations/claude/hooks/hooks.json`](../../integrations/claude/hooks/hooks.json) (`SessionStart`, timeout 5), `skill_surface._content_hash` / `RELEASED`, `skill_service._tree` / `_skill_files` / `_content_hash` / `_RELEASED`, `install.sh` (`HOOK`, `HOOK_TARGET`, `HAS_HOOK`), `claudeConnect.connectClaudeSteps` (the `key` step). |
| **Affected public surfaces** | **None of the eight in `AGENTS.md` §5.** REST stays **40**, MCP tools **27**, route guards **39** (30 `user` / 4 `admin` / 5 `open`); `./run surfaces` reports no drift in S1, S2, S4, S5 or S8. The one snapshot that moves is `ops/skill-release.json`, deliberately: the plugin is **1.1.0** and the recorded sha256 now covers `skills/` **and** `hooks/`. `RUNWAY_URL` is **not** an env-var surface — `RULE-SURF-002` holds `README.md` against the fields of `Settings`, and no field reads it; it is a variable a *consumer* reads, like `RUNWAY_API_KEY` before it. |
| **Known dependents** | `GET /api/gtd/summary` — the hook is now a consumer of that route and of four of its counters (`inbox`, `overdue`, `due_today`, `waiting_followup_due`), and of `GET /api/gtd/review` for the records (`kind`, `reviewed_at`), so a rename on either breaks a shipped script; the hook's own test pins the shapes it expects. It deliberately does **not** read the summary's `last_review`: that field answers for one scope (D16/D17) and a hook has no scope. `backend/app/services/skill_service.py` reads the same two directories the gate script hashes, and `backend/tests/unit/test_skill.py::TestTheHashAgrees` fails when the two stop agreeing. `backend/Dockerfile` and `.dockerignore` must admit what the hash covers, or a deployed `GET /skill` answers 503. `frontend/tests/claudeConnect.test.js` pins the variable names against the script with `node:fs`. |
| **Uncertain / dynamic areas** | `RISK-OPS-002` — nothing in the gate builds an image, so "the hooks are really in the image" is proven by the container tier's tmp tree and then in production by `GET /api/skill`'s hash. `RISK-TEST-001` — the container tier does not run on arm64 in CI's sense; it was run by hand here (below). `BLIND-TEST-001` — `install.sh`, `runway-summary.sh` and the gate scripts have no import-derived test protection and cannot: they are shell. Each has a test that runs it. **Not covered by anything mechanical:** that Claude Code actually loads `hooks/hooks.json` from an installed plugin. `claude plugin validate` passes, the schema matches the documented one, and the first real proof is the maintainer's own session after the plugin is installed. |
| **Analogous implementations** | [Brief 0029](0029-adopt-the-claude-skill.md) — the commit that introduced `RULE-SURF-003/004` and `RULE-TEST-005` and put a shipped consumer under the gate; this widens exactly those three. [Brief 0041](0041-the-server-ships-the-skill.md) — the hash, the image and the 503-rather-than-a-wrong-answer rule this follows. [Brief 0042](0042-connect-claude-from-the-settings-page.md) — `urlExportLine` was written and tested there and deliberately left off the card until the thing that reads it existed; this is that thing. |
| **Delivery Pattern** | **New Capability** (a shipped consumer script) plus a **rule change**, so the meta-rule applies: check, ledger entry, fixture arm, contract document and ADR in one commit. Not a Public-Surface Migration — nothing this repository promises moves; the plugin's own `version` is the migration mechanism for the thing that does change, and it is raised. |
| **Required tests** | New [`integrations/claude/tests/hook_test.sh`](../../integrations/claude/tests/hook_test.sh), run by `tools/checks/skill.sh` under `RULE-TEST-005`, with a stub `curl` first on `PATH` that answers both routes — no server, no key, no network. Its review records are built from the real clock, because the hook compares durations and a stamp frozen into the file would test a different age every day it runs. **Silence:** without `RUNWAY_URL`, without `RUNWAY_API_KEY`, without `python3` on `PATH`, on an HTTP error, when only the review route errors (a server too old to have it), on a body that is not the summary, on a review list that is not a list, when nothing is due, when today's daily review is already recorded, when the only recorded review belongs to a **scope**, and when the daily review is an hour old but stamped on the **previous UTC day** — the two arms that pin the ways this hook could nag somebody who has just reviewed. **One line:** exactly one, with the expected counters, when a review is due; when the weekly review is nineteen days old; when nothing was ever reviewed. **What it must not print:** the project name in `stalled_projects`, the API key. **What it asked for:** `<origin>/api/gtd/summary` with the trailing slash on `RUNWAY_URL` not doubled, the key in an `X-Api-Key` header and not in the URL, and `-m` present. Plus `dash -n`, and a wall-clock assertion that the whole suite stays under five seconds. Extended [`install_test.sh`](../../integrations/claude/tests/install_test.sh): the reminder is installed, executable, and never from an uncommitted edit. Five new cases in [`backend/tests/unit/test_skill.py`](../../backend/tests/unit/test_skill.py): a changed hook changes the release hash, a changed skill still does, the two directories are told apart inside one digest, the zip carries the skill and not the hooks, and an image without the hooks answers 503 instead of a hash that is wrong. Two new cases in [`frontend/tests/claudeConnect.test.js`](../../frontend/tests/claudeConnect.test.js): the env step exports the origin beside the key, and the hook really reads those two variable names. Two fixture arms: `SURF-004-hooks`, `TEST-005-hook`. |
| **Intended scope** | The two hook files; its test and the gate line that runs it; the widened `_content_hash` in the gate script and its copy in `skill_service`, with the `.dockerignore` admit and the `Dockerfile` `COPY` that keep the image's answer equal to the record; `install.sh` placing the script for the non-plugin channel; the two ledger entries, the two fixture arms and `docs/task-interface.md`; `references/setup.md` §1 (`RUNWAY_URL`) and §6 (what ships, and the snippet for `install.sh` users); `integrations/claude/README.md`; the env step on the settings card; plugin **1.1.0** and `ops/skill-release.json`. **Not** in scope: the root `README.md`'s "Use runway from Claude" section and `docs/plan/STATUS.md` (C-4, the docs-closure commit); the post-deploy job that will read the hash (C-3); any change to the summary route itself; and a server-side push, which stays the right answer for reminders without an open session and stays undone. |
| **Base revision** | `b90a0ed` |

## Behaviour change

**A user on the plugin channel gets a hook on their next `claude plugin update`.** That is the
change, and everything about the design is an answer to how badly it could go. The script runs
before every session in every repository, on a machine this repository does not control, and
writes to a terminal somebody is about to work in. So its promises are almost all negative:

- Nothing at all when `RUNWAY_URL` or `RUNWAY_API_KEY` is unset — which is every existing
  installation until the user exports the origin, so the default for anyone who updates without
  reading anything is no change whatsoever.
- Nothing on a missing `curl` or `python3`, a 401 from a rotated key, a 502, a timeout, or a body
  that is not the summary. Exit 0 in all of them: a non-zero exit from a SessionStart hook is a
  message of its own, and "runway is unreachable" is not worth one.
- Nothing when nothing is due.
- At most **one line**, and only counters. `stalled_projects` is the single field of the summary
  with names in it, and the hook does not read it — the same property `runway_scope` exists to
  protect for repositories whose sessions are logged.

**Due** is deliberately narrow: no daily review recorded in the last 24 hours *and* a non-zero
`inbox`, `overdue`, `due_today` or `waiting_followup_due`; or a weekly review older than ten
days. The counter condition is what makes the daily arm self-silencing — an empty inbox is a
reason to say nothing rather than to report four zeroes.

**Both questions about a review are asked of `GET /gtd/review`, and both ages are durations
between UTC instants.** That is two corrections to the obvious implementation, and each of them
is the difference between a reminder and a line people delete the hook over. Reviews are stored
per scope: a repository that declares `runway_scope` records with that key, so the *unscoped*
summary's `last_review` — the only one a hook could ask for, having no scope of its own — stays
`null` for that user forever, and dueness read off it would print at every session start in
every repository with nothing that could ever silence it. And the record is a UTC stamp while
the summary's `today` is the server's local day (`TZ=Europe/Berlin`), so slicing a day out of
the stamp and comparing it against `today` reports a review recorded at 00:30 local as not
recorded today — the same off-by-one brief 0037 removed on the server, in the one consumer that
holds both clocks. Comparing durations needs no offset the hook cannot know, and "in the last 24
hours" is a hair wider than "today" in exchange.

One case keeps printing until the user acts: a weekly review that was **never recorded in any
scope**, which says so in words instead of a day count. That is the reviewed decision in ADR
0041. Never having reviewed is the most overdue a weekly review can be, one recorded review
silences it for ten days, and the alternative — reading "no record" as "nothing to report" —
makes the reminder useless for precisely the person it exists for. It stays defensible only
because "no record" now means no record anywhere.

**The release hash widens, and that is why several files move together.** A plugin update
delivers everything under the plugin directory; the hash recorded in `ops/skill-release.json`
covered only `skills/`, so a hook edit with an unchanged version would have been invisible to
`RULE-SURF-004` and would have reached nobody. Hashing `skills/` and `hooks/` with paths relative
to `integrations/claude/` fixes that, and pulls three things with it: the backend's deliberate
copy of the algorithm (ADR 0040) follows, so the image must carry `hooks/` — otherwise a deployed
`GET /skill` would answer a hash that does not match this repository, which is exactly what the
post-deploy check compares. An image missing them answers **503** rather than a confidently wrong
release record, like the two parts of the bundle before it.

**The zip does not change.** It is skill-only, for clients that have no plugin system; a hook
they cannot register is a file they cannot use. A test asserts the archive listing exactly.

**`install.sh` places the script and registers nothing.** That channel has no plugin manifest for
Claude Code to read `hooks.json` from, and this repository does not silently edit a user's
`settings.json` — `setup.md` §6 holds the snippet to paste, shown as a diff, with a yes asked
for. The file lands at `~/.claude/runway-summary.sh`, beside `skills/` rather than inside it: a
stray executable under `skills/runway` would be part of what Claude loads as the skill.

## Pre-checks

- `make check`: **GREEN**, 13s of the 180s budget; `make verify` **GREEN**, 117s of 600s. Backend unit **642 passed** (637 before; five
  new in `test_skill.py`). Frontend **80 passed** (78 before). `ruff`, `mypy`, `eslint`: no
  findings. `./run surfaces`: no drift; the only snapshot rewritten is `ops/skill-release.json`
  (1.0.0 → **1.1.0**, new hash).
- Gate conformance: **56 fixture arm(s) passed, 0 failed; 46 of 49 executable rules proven able to
  fail** (54 arms before; `SURF-004-hooks` and `TEST-005-hook` are the two new ones). The
  `TEST-005-hook` arm raises the plugin version and refreshes the record inside the sandbox, so it
  fails on the hook's behaviour alone — verified by running the same mutation in a scratch copy of
  the tree: twenty-three `RULE-TEST-005` findings and no `RULE-SURF-004`.
- Container tier by hand (D25), against `/opt/homebrew/bin/task` **3.5.0**:
  `cd backend && TZ=UTC PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -m container tests/container`
  → **81 passed**, unchanged. This commit touches no Taskwarrior semantics; the run is a control,
  and it covers the one thing only that tier sees — `test_skill.py`'s image-shaped tmp tree, which
  now contains `hooks/` because the Dockerfile copies it.
- `claude plugin validate integrations/claude` → **Validation passed** (Claude Code 2.x, the
  version installed on this machine).
- Adversarial, each a temporary edit reverted immediately, over `hook_test.sh` unless noted:
  - **It announces itself before looking at anything** (a `printf` after `set -u`): **red**, and
    not only on one arm — every silence assertion fires. This is the `TEST-005-hook` fixture arm.
  - **It prints `stalled_projects`**: **red**. A project name at the top of a logged session is
    the one disclosure this design is built to avoid.
  - **`curl` loses `-m 2`**: **red**. Without it a hung server holds the session open until the
    `hooks.json` timeout, which is the backstop and not the budget.
  - **The key moves into the query string**: **red**, twice — the URL assertion and the explicit
    "not in the URL" one.
  - **It reads the summary's own `last_review` instead of `GET /gtd/review`**: **red**, nine
    assertions, among them "when the recorded review belongs to a scope" and "did not call
    `<origin>/api/gtd/review`". This is the shape the first draft of this commit shipped, and
    the failure is the permanent line described above.
  - **It goes back to slicing the day out of the stamp and comparing it against `today`**:
    **red** on "when the daily review is an hour old but on the previous UTC day". It would have
    reminded the user of a review they had just finished, which is how a reminder loses its
    meaning.
  - **`${RUNWAY_URL%/}` loses the trailing-slash strip**: **red**, twice (`//api/gtd/summary`
    and `//api/gtd/review`).
  - **The gate script's hash goes back to `skills/` only**, backend copy untouched:
    `test_skill.py::TestTheHashAgrees` **fails** — 1 failed, 24 passed. The copy cannot drift
    silently in either direction.
  - **`install.sh` stops placing the script**: `install_test.sh` **fails** with
    "installed no executable runway-summary.sh".
  - **Removing `2>/dev/null` from the `python3` call: green, and kept anyway.** The parser exits 0
    silently on every payload the test feeds it, so no arm observes the redirect. It is the second
    layer under a first one that already holds, and the failure it covers — an interpreter writing
    to stderr for a reason the test did not imagine — is the one this hook must never produce.
    Recorded here rather than removed, because an unobserved line is exactly what this repository
    does not leave unmarked.
- Not made executable by anything: that Claude Code loads `hooks/hooks.json` from the installed
  plugin and runs it at `SessionStart`. `claude plugin validate` passes and the JSON matches the
  documented shape, but the gate has no Claude Code to run. First proof is the maintainer's own
  session after `claude plugin install runway@runway` — the step PR C's closing checklist already
  contains.

## Counts

REST **40**, MCP tools **27**, route guards **39** (30 `user` / 4 `admin` / 5 `open`) — all
unchanged, no route is added or touched. Claude skill **1.0.0 → 1.1.0**, and
`ops/skill-release.json` records a hash over `skills/` **and** `hooks/`. Fixture arms **54 → 56**;
executable rules proven **46 of 49**, unchanged, because both new arms belong to rules that were
already proven.
