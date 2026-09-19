# ADR 0035 — The skill lives with the API it drives, and installs from a ref

- **Date:** 2026-09-19
- **Status:** Accepted
- **Scope:** `integrations`, `ops`, `tools`, `rules`, `docs`

## Context

A Claude Code skill, `runway`, runs Getting Things Done on this server over MCP: capture, clarify,
daily and weekly review, project planning. It was written and tested outside this repository and
arrives as a plugin in [`integrations/claude/`](../../integrations/claude/README.md), with an
install script.

The skill depends on this server in two ways. It names operations — routes, and through them MCP
tool names, which are FastAPI operation ids and a public surface (`AGENTS.md` §5). And it depends on
server semantics no schema states: the inbox is "no project and no tag", `next`/`waiting`/`someday`
are plain tags, `wait` hides a task, an empty string clears a field. A planned series of GTD API
changes (tag removal, `wait` semantics, a summary, review timestamps, project status, list filters)
changes exactly those.

## Decision 1 — the skill lives in this repository, next to the API

The skill is developed here, declared as the unit `integrations`, and changed **in the same commit**
as the API change it belongs to. It is held to the surface by the gate:

- `RULE-SURF-003` — every route in the skill's operation table and every `mcp__runway__` tool name it
  mentions must exist in the checked-in snapshots. "If present" lines are exempt: that is the skill's
  own convention for operations a newer server may have, and it is what lets one skill work against
  older and newer servers.
- `RULE-SURF-004` — a change under `skills/` must raise `version` in `plugin.json`, because Claude Code
  delivers a plugin update only when the version changes. The check compares a content hash recorded
  in `ops/skill-release.json` rather than a git base, so it gives the same answer in CI, locally and
  in the fixture sandbox.

The repository root carries `.claude-plugin/marketplace.json`, so the plugin installs straight from
GitHub: `claude plugin marketplace add ulrichschinz/runway`.

### Alternatives considered

- **A repository of its own.** The skill would release independently of the API, which is the
  problem: a skill and a server that drift apart fail on the user's machine, not in review. The
  semantics it depends on would live in a second repository with no gate that sees both.
- **Generate the operation table from the OpenAPI schema.** It would stay correct by construction, but
  the table is prose for a model — "which operation for what" — and the value is in the wording.
  Checking a hand-written table against the snapshot keeps the prose and catches the drift.

## Decision 2 — install from a ref, never symlink

The repository is where the skill is developed; `~/.claude` is where it is used. What an agent runs
on must be a released state somebody chose to install. A symlink from `~/.claude/skills/runway` into
a checkout breaks that silently: an unfinished edit or a checked-out feature branch becomes what every
Claude session on the machine runs.

So there are two install channels, and neither reads the working tree:

- **The plugin**, from the marketplace, versioned by `plugin.json`.
- **`install.sh`**, which exports a git ref with `git archive`, refuses a symlinked target (exit 73),
  fails on an unknown ref (exit 66), keeps the previous copy outside `skills/` (where Claude would load
  it as a second skill) and records what it installed. `RULE-TEST-005` runs its test in a throwaway
  repository with `CLAUDE_CONFIG_DIR` in a temp directory, and asserts each of those promises.

## Consequences

- A route rename that breaks the skill fails the pull request that renames it.
- Every GTD API change that the skill hedges with "if present" or "older servers cannot" carries the
  skill edit and a version bump in the same commit.
- **What the gate does not hold.** Only named routes and tool names are checked. The semantics the skill
  depends on (inbox definition, `wait`, clearing fields) are prose, and a server change to them passes
  every rule here; they are listed in `integrations/claude/README.md` so the author of such a change can
  find them. Skill *behaviour* has no automated test at all — the README describes the manual check.
- `install.sh` is POSIX sh and is parsed with `dash -n` by its test. The repository has no shell lint
  beyond that, for this script or any other.

## Follow-up, not built here

A download route that serves the skill as a zip matching the running server's version, and a
"Connect Claude" block on the settings page (the MCP command, the skill download, the standing rule to
copy). Recorded in `docs/plan/STATUS.md`.
