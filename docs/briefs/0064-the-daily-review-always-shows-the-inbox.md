# Change Impact Brief 0064 — The daily review always shows the inbox

| Field | Value |
|---|---|
| **Requested outcome** | The Claude skill's daily review lists every inbox item by title, whatever the count, and is finished only when each item is clarified or the user has deferred the rest. Ordered by Uli on **2026-11-13**, after a daily review over eight inbox items showed "8 items, oldest two days" and no title: the user asked what was on for the day and saw nothing he had captured. |
| **Owning unit** | `integrations` — `integrations/claude/skills/runway/references/daily-review.md` (the rule), `integrations/claude/.claude-plugin/plugin.json` (version 1.1.1). `ops` — `ops/skill-release.json` (release record). `docs` — this brief. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §2 and §5 (the skill is shipped by the server and its hash is a recorded surface). |
| **Governed by** | **None.** No decision record is changed or needed: the scoped-repository rule, the summary as entry path and the review timestamps stay as they are. |
| **Rule IDs introduced** | **None.** |
| **Entry points** | `integrations/claude/skills/runway/references/daily-review.md` §1 (table row 2), §2 (item 2), §4 (last paragraph). |
| **Affected public surfaces** | The skill's content hash and version (`ops/skill-release.json`, `RULE-SURF-004`): 1.1.0 → 1.1.1. No REST route, MCP tool, schema or SPA surface changes. |
| **Known dependents** | From `./run impact`: none by import. Readers of the skill: Claude Code (plugin) and any agent installed from the skill zip the server ships. |
| **Uncertain / dynamic areas** | `BLIND-TEST-001` — the skill is prose; no test imports it. Its behaviour is what a model does with it, which no gate here measures. |
| **Analogous implementations** | Brief 0038 (the GTD summary), which introduced the "fetch a list only when its counter is above zero" entry path this change keeps. |
| **Delivery Pattern** | **Bug Fix** (`docs/change-workflow.md`): the review hid what it was asked to show. |
| **Required tests** | None new. `backend/tests/unit/test_skill.py` holds the shipped skill to `ops/skill-release.json`; `integrations/claude/tests/` cover install and hook, both unchanged. |
| **Intended scope** | The three files above and this brief. **Not** in scope: `clarify.md` (still one item at a time), the weekly review, the reminder hook, the scoped-repository rule. |
| **Base revision** | `78cfaac` (`main`) |

## Behaviour change

Before: the daily review fetched `gtd/inbox` only when the inbox held five items or fewer; above that it
reported count and age, and above about ten it told the agent not to clarify inside the review.

After:

- `gtd/inbox` is fetched whenever the counter is above zero. Every item is shown with its title, numbered,
  oldest first. Above twenty, the twenty oldest are shown and the remainder is counted.
- The review is finished, and recorded, only when each inbox item is clarified through `clarify.md` or the
  user has said for this review that the rest waits.
- A scoped repository is unchanged: it never fetches the inbox and shows count and age, because inbox items
  carry no tags and a scoped view must not show another area's captures.

## Why the threshold goes

The threshold protected the "one screen" promise. It did so by dropping the one list whose items have no
other home: an overdue task still appears under next actions, an inbox item appears nowhere else. A longer
screen is the smaller cost.

## Pre-checks

- `./run surfaces --update` wrote `ops/skill-release.json` for 1.1.1.
- `make verify` before the pull request.
