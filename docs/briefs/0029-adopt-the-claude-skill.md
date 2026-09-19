# Change Impact Brief 0029 — Adopt the Claude skill, and hold it to the surface

| Field | Value |
|---|---|
| **Requested outcome** | The `runway` Claude Code plugin in `integrations/claude/`, written and tested outside the repository, becomes part of it: a declared unit, installable from the repository's own marketplace, and unable to drift from the REST and MCP surface it drives. The skill's prose is adopted unchanged. |
| **Owning unit** | `integrations` (new), `ops`, `docs` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 (a gate rule is four artefacts), §5 (public surfaces), §9 (the meta-rule) |
| **Governed by** | [ADR 0035](../adr/0035-the-skill-lives-with-the-api-it-drives.md) |
| **Rule IDs introduced** | **`RULE-SURF-003`** — every route in the skill's operation table and every `mcp__runway__` tool name it mentions exists in the snapshots, "if present" lines exempt. **`RULE-SURF-004`** — a change under `integrations/claude/skills/` raises the plugin version. **`RULE-TEST-005`** — `install.sh` passes its test. All in `tools/checks/skill.sh`, `check` and `verify` profiles, four fixture arms (`SURF-003`, `SURF-003-tool`, `SURF-004`, `TEST-005`). The suite now proves **46 of 49** executable rules able to fail over **53** fixture arms. |
| **Entry points** | [`integrations/claude/README.md`](../../integrations/claude/README.md), [`tools/checks/skill_surface.py`](../../tools/checks/skill_surface.py), [`integrations/claude/tests/install_test.sh`](../../integrations/claude/tests/install_test.sh), `.claude-plugin/marketplace.json` |
| **Affected public surfaces** | None of the application's. The repository gains a **plugin marketplace** — `claude plugin marketplace add ulrichschinz/runway` — which is a new thing consumers install, versioned by `integrations/claude/.claude-plugin/plugin.json` and recorded in `ops/skill-release.json`. |
| **Known dependents** | Claude Code users who install the plugin, or run `install.sh`. |
| **Uncertain / dynamic areas** | The server semantics the skill depends on are prose and not checked (ADR 0035, *What the gate does not hold*). The skill text contradicts today's server in several places, listed below; they are the GTD API work the skill was written ahead of. |
| **Analogous implementations** | [Brief 0015](0015-public-surface-protection.md) — the snapshots this rule reads. |
| **Delivery Pattern** | **New Capability** — a new unit and three gate rules, with no change to application behaviour. |
| **Required tests** | `install_test.sh`: committed state installed and an uncommitted edit not, `--check` 0 and 1, symlink 73, unknown ref 66, POSIX parse with `dash -n`. The four fixture arms. `claude plugin validate .` passes. |
| **Intended scope** | The unit, the marketplace, the check, three ledger entries, four arms, the contract text, the README section, the ADR, one wrong tool name in the README. **Not** in scope: any change to the skill's prose, the GTD API work itself, the download route and settings block (follow-up). |
| **Base revision** | `712e797` |

## Behaviour change

None in the application. For the gate: a skill that names a missing route or tool, a skill change
without a version bump, and an `install.sh` that stops refusing a symlink now fail `check` and `verify`.

The root README named the MCP tool for `POST /inbox` as `add_to_inbox_inbox_post`. The served name is
`webhook_inbox_inbox_post`; corrected.

## Where the skill text and today's server disagree

Found by reading `backend/app` against the skill, with no running Taskwarrior. None is a defect in the
skill's design — each is a server capability the GTD API work is meant to add — but until then the text
promises more than the server does:

1. **Tags cannot be removed at all.** `tags` on update only ever emits `+tag`
   (`services/task_service.py`, `_build_args`); `tags: []` emits nothing; `"-next"` passes validation and
   becomes a new tag `-next`. The skill says "older runway versions cannot remove tags"; it is today's
   version. Every status swap it performs (someday → next, next → waiting) leaves both tags. Also a bug in
   the web UI, which sends the full tag list and expects removal (brief item P0-1).
2. **Nothing is wait-aware.** Every list filters on `status:pending` only (`routers/gtd.py`,
   `routers/tasks.py`). Whether a future-`wait` task is hidden depends solely on Taskwarrior's treatment
   of `status:pending`, which no test pins (the unit fake does not model `wait`). The tickler ("hidden
   until the date, then back in the inbox") and "do not use `wait` on waiting-for tasks" are therefore
   unverified (P0-3).
3. **No summary, tickler, project overview or review records.** Named "if present" in the operation table,
   but `references/setup.md` puts them in the permission allow-list and says a reminder hook "should call
   the server's summary operation" — there is none to call (P1-6, P1-7, P1-8).
4. **`GET /tasks` has no filter** but `include_done`. "Filtered by project or tag where the server allows
   it", "use the server's tag filter", and filtering by context or text all happen client-side today, after
   every pending task has been fetched (P1-5, P1-5a).
5. **Priority cannot be cleared** — `priority: ""` is a 400 — while "empty string clears a field" is stated
   generally. Dates and project do clear (P0-2).
6. **Auth, API-key and admin operations are MCP tools today** (`get_apikey`, `regenerate_apikey`,
   `set_user_role`, …). `setup.md` says to deny them "if the server still exposes them"; it does (P0-4).
