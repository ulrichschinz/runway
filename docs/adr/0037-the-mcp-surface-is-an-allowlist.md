# ADR 0037 — The MCP surface is an allowlist

- **Date:** 2026-09-19
- **Status:** Accepted
- **Scope:** `be/app`, backend tests, `tools/checks` (`RULE-DOC-001`), `tools/scaffold.py`, `integrations`, docs

## Context

`FastApiMCP(app, …)` turned every route of the application into an MCP tool: 33 of them, including
`get_apikey_auth_apikey_get`, `regenerate_apikey_auth_apikey_regenerate_post`,
`change_password_auth_password_put`, `login_auth_login_post` and the four admin operations. An agent
session holds an API key, so any of those was one tool call away from reading the key back, rotating it
(locking the user out of every other client), changing the password, or — on an admin account — changing
site settings and roles. A prompt injected into a task description was enough to ask for it. No agent
consumer ever needed them: the runway skill told the model never to call them, which is a request, not a
control.

## Decision 1 — include, never exclude

```python
FastApiMCP(
    app,
    headers=["authorization", "x-api-key"],
    include_tags=["tasks", "gtd", "projects", "inbox"],
    include_operations=["health_health_get", "me_auth_me_get"],
)
```

The four routers the GTD work lives in, plus two single operations: `health` (declared on the app object
in `main.py`, so it **has no tag** and no tag rule can reach it) and `me` (the skill's "who am I" check;
it returns the profile, never the key). 22 tools; the 11 removed are every other `auth` and `admin`
operation.

An allowlist **fails closed**: a router with a new tag — the scaffold's, the skill route of PR C — is not
a tool until someone adds its tag here and the snapshot records it. A denylist (`exclude_tags=["auth",
"admin"]`) fails open for exactly that case, and cannot keep `me` without a second, operation-level rule.

**fastapi-mcp unions the two include kinds** (and, separately, the two exclude kinds): an operation is a
tool if its tag is included *or* its id is. That is what makes the pair above work. It is also why the
change order's `exclude_tags` plus `exclude_operations` would have excluded far less than it read as
(each exclude kind yields "everything but these", and the union of the two is nearly everything).
Include and exclude of the same kind cannot be combined; fastapi-mcp 0.4.0 raises `ValueError`
(`fastapi_mcp/server.py:89-93`, the union at `:631-645`). `include_operations` silently ignores a
name that matches nothing — renaming the `health` or `me` handler would drop the tool without an error —
so `test_mcp_session.py` pins both names, as a client receives the list.

## Decision 2 — no expand/migrate step (F2 deliberately skipped)

MCP tool names are a public surface under decision F2, and removing one normally goes expand → migrate →
switch → contract. It is skipped here, on purpose:

- every removed tool bears or changes a credential, or is admin-only — keeping them reachable through a
  deprecation window keeps the exposure open for that window;
- there is no legitimate agent consumer: the web UI uses REST, which is unchanged, and the skill never
  called them (its guardrail forbade it);
- every kept tool keeps its name, so existing permission rules in clients still match.

## Decision 3 — `RULE-DOC-001` counts MCP tools from the snapshot

The contract's MCP count was checked against the index, which derives one `mcp_tool` node per route. With
an allowlist that count is 33 while the server offers 22. `contract_check._check_surface_counts` now reads
the MCP count from `ops/surfaces/mcp-tools.json["count"]` (a missing file fails `RULE-DOC-001`). That
snapshot is itself held to the booted server by `RULE-SURF-001`, so the claim is compared with an
observation rather than a derivation. The REST count stays index-based. A new negative fixture arm
(`DOC-001-count`) raises the claimed MCP count by one and requires `RULE-DOC-001` red.

The index extractor is not changed. `RISK-MCP-001` is reworded: index `mcp_tool` nodes are now
over-inclusive — they say nothing about membership — and its re-open trigger is an index consumer relying
on that membership.

**No new rule id.** The allowlist is held by the session tests (disjoint from the removed names, only `me`
among auth/admin, both named operations present, a removed name is "Unknown tool" and leaks no key) and by
`RULE-SURF-001` (any change to the list changes the snapshot). A dedicated rule would restate those two and
widen the meta-rule change for no additional detection.

## Decision 4 — the scaffold bumps REST only

`tools/scaffold.py bump_surface_counts` used to raise both counts in `AGENTS.md`. A scaffolded feature's
router carries its own tag, which is not on the allowlist, so it adds a route and no tool. The function
now moves the REST count only; making the new feature a tool is a separate, deliberate edit to `main.py`
and the snapshot.

## Consequences

- MCP: 33 → 22 tools. REST: unchanged, 33 routes.
- The key-theft abuse case (`docs/threat-model.md` §8) gains a mitigation for agent sessions: a key held by
  an MCP client cannot be read back or rotated through MCP. The key used directly against REST still
  reaches every route; `WAIVER-SEC-003` is unchanged.
- The skill (0.4.1) states its permissions as a literal `permissions` block of exact tool names, which
  `RULE-SURF-003` checks against the snapshot, and keeps "never call authentication, API-key, user or admin
  operations" as defence in depth against older servers.
- Clients must reconnect to see the new list; nothing they were allowed to call has been renamed.

## Alternatives considered

- **`exclude_tags=["auth", "admin"]`** — fails open for every future tag, and drops `me`. Rejected.
- **Guard the MCP mount with `dependencies=`** (`RISK-MCP-002`) — authenticates the handshake, removes
  nothing a key-holding session can call. Orthogonal; not done here.
- **Scope API keys** (read-only, no key disclosure) — the real fix for a stolen key, and part of the
  `WAIVER-SEC-003` resolution; a far larger change. The allowlist is the cheap, immediate half.
