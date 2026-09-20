# Change Impact Brief 0033 — The MCP surface is an allowlist

| Field | Value |
|---|---|
| **Requested outcome** | No authentication, API-key, user or admin operation is reachable over MCP. REST is unchanged. The MCP count in `AGENTS.md` is checked against what the server actually offers. |
| **Owning unit** | `be/app` (`main.py`), backend tests (`test_mcp_session.py`), `tools/checks` (`contract_check.py`, `RULE-DOC-001`), `tools/scaffold.py`, `tools/fixtures` (`negative.sh`), `integrations` (the skill), `ops` (snapshots), `rules` (ledger, waivers), `docs` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 (a new endpoint is an MCP tool only if its tag is allowlisted), §5 (MCP tools: count and promise), §9 (the meta-rule: `RULE-DOC-001` changes with its check, ledger entry, fixture, contract and ADR) |
| **Governed by** | [ADR 0037](../adr/0037-the-mcp-surface-is-an-allowlist.md) (the MCP surface is an allowlist, new), [ADR 0033](../adr/0033-the-mcp-server-nobody-could-connect-to.md) (the MCP transport and header allowlist), [ADR 0020](../adr/0020-runtime-observed-surfaces.md) (runtime-observed surfaces), [ADR 0035](../adr/0035-the-skill-lives-with-the-api-it-drives.md) (the skill moves with the API) |
| **Rule IDs introduced** | None. `RULE-DOC-001` changes its MCP count source (meta-rule, ADR 0037 Decision 3) and gains the `DOC-001-count` fixture arm. `RISK-MCP-001` and `RISK-MCP-002` are reworded. |
| **Entry points** | [`backend/app/main.py`](../../backend/app/main.py) `mcp = FastApiMCP(...)`; [`tools/checks/contract_check.py`](../../tools/checks/contract_check.py) `_check_surface_counts`; [`tools/scaffold.py`](../../tools/scaffold.py) `bump_surface_counts` |
| **Affected public surfaces** | **MCP (S2):** 33 → 22 tools. Removed: `change_password_auth_password_put`, `get_apikey_auth_apikey_get`, `get_settings_admin_settings_get`, `list_users_admin_users_get`, `login_auth_login_post`, `regenerate_apikey_auth_apikey_regenerate_post`, `register_auth_register_post`, `registration_status_auth_registration_status_get`, `set_user_role_admin_users__target__role_put`, `update_profile_auth_me_put`, `update_settings_admin_settings_put`. Every kept name is unchanged. **REST (S1):** unchanged, 33 routes; `ops/surfaces/openapi.json` unchanged. **Claude skill** 0.4.0 → 0.4.1. |
| **Known dependents** | MCP clients (Claude Code and others) — they must reconnect to see the new list; permission rules on kept names still match. The web UI uses REST only and is unaffected. The runway skill never called a removed tool. |
| **Uncertain / dynamic areas** | `BLIND-MCP-001` (the index derives tools per route; the snapshot is authoritative — and now the only count source, `RISK-MCP-001`), `BLIND-TEST-001` (the MCP routes are exercised through the ASGI client, not by import). |
| **Analogous implementations** | [Brief 0026](0026-the-mcp-server-nobody-could-connect-to.md) — the MCP surface changed and pinned by a real client session; [Brief 0029](0029-adopt-the-claude-skill.md) — `RULE-SURF-003` holding the skill to the snapshot, which now checks the literal permissions block. |
| **Delivery Pattern** | **Security or Operability Change.** Public tools are removed on purpose, without expand/migrate — every removed tool bears or changes a credential or is admin-only, and none had an agent consumer (ADR 0037 Decision 2). |
| **Required tests** | Unit (`test_mcp_session.py`, a real client session, written first): the tool list is disjoint from the 11 removed names; the only name containing `_auth_` or `_admin_` is `me_auth_me_get`; `health_health_get` and `me_auth_me_get` are present (`include_operations` ignores unknown names); calling `get_apikey_auth_apikey_get` is an error, "Unknown tool", and the key is not in the text; the existing snapshot equality. Gate: the `DOC-001-count` negative fixture arm (claimed MCP count + 1 → `RULE-DOC-001` red). |
| **Intended scope** | The `FastApiMCP` arguments and comment, the session tests, the `RULE-DOC-001` count source with its ledger text and fixture arm, the scaffold's count bump, the MCP snapshot, the skill's permission block and guardrail and version, counts and docs (`AGENTS.md`, `backend/AGENTS.md`, `README.md`, `change-workflow.md`, `task-interface.md`, `security.md`, `threat-model.md`, `WAIVER-SEC-003` wording), ADR 0037. **Not** in scope: authenticating the MCP handshake (`RISK-MCP-002`), scoped or hashed API keys (`WAIVER-SEC-003`), changing the index extractor. |
| **Base revision** | `366d9b7` |

## Behaviour change

- **The allowlist (D18).** `FastApiMCP(app, headers=[...], include_tags=["tasks","gtd","projects","inbox"],
  include_operations=["health_health_get","me_auth_me_get"])`. fastapi-mcp takes the union of the two include
  kinds; `health` has no tag, so it needs the operation entry. A router with any other tag is REST-only until
  its tag is added — the list fails closed.
- **`RULE-DOC-001` (D19).** The MCP count claimed in `AGENTS.md` is compared with
  `ops/surfaces/mcp-tools.json["count"]` (missing file → red). The REST count is still compared with the
  index. The index still derives 33 `mcp_tool` nodes; `RISK-MCP-001` now says they are over-inclusive.
- **Scaffold.** `bump_surface_counts` moves the REST count only; a scaffolded router's tag is not allowlisted.

## Pre-checks

- Tests written first: against the unchanged `main.py`, 3 of the 4 new tests failed (disjoint, only-`me`,
  unknown-tool); the named-operations test passed, as it must before and after.
- Boot check: `from app.main import mcp; len(mcp.tools)` → **22**.
- Adversarial, each on a temporary edit that was reverted:
  - `include_tags` removed, `include_operations` kept: the surface shrinks to `health` and `me` (fails
    closed), so the disjoint test stays green; the snapshot equality test and `RULE-SURF-001` go red.
  - Both include arguments removed (fastapi-mcp's default, every route): disjoint, only-`me`, unknown-tool
    and snapshot equality all red, and `RULE-SURF-001` red.
  - `me` handler renamed to `whoami`: the named-operations test, only-`me`, the snapshot test and every
    test that calls `me_auth_me_get` go red, and `RULE-SURF-001` red.
  - `AGENTS.md` MCP count wrong: `RULE-DOC-001` red (the `DOC-001-count` arm, run by `verify`).
- Container tier (D25): not required — the change touches no Taskwarrior semantics.

## Skill

0.4.1. `references/setup.md` §2 is a literal `permissions` block of exact `mcp__runway__<operation id>`
names — `allow`: health, me, list/get task, inbox, next, waiting, someday, projects, project tasks, tickler,
get plan; `ask`: create, modify, complete, annotate, start, stop, create project, upsert plan, inbox post;
`deny`: delete task — which `RULE-SURF-003` checks name by name against the snapshot. The prose says
authentication, API-key, user and admin operations are not exposed over MCP; "if the server still exposes
them" is gone. `SKILL.md` keeps the guardrail as defence in depth against older servers, shortened to
"Never call authentication, API-key, user or admin operations."

## Counts

MCP 33 → 22; REST 33 and route guards 32 (25 user / 4 admin / 3 open) unchanged: `AGENTS.md` §5,
`README.md`, `rules/ledger.yaml` (`RISK-MCP-002`). `docs/task-interface.md` fixture totals recounted: 54 arms (53 before), 46 of 49 executable rules.
`docs/plan/STATUS.md` records the 32 tools a production session listed on 2026-09-18; a dated observation,
left as written.
