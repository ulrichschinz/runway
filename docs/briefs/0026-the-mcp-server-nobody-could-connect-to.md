# Change Impact Brief 0026 — Make the MCP server connectable, and document what it actually is

| Field | Value |
|---|---|
| **Requested outcome** | Establish the exact client configuration for Runway's MCP server, and correct the misleading example that ships in the README and in the Settings page. The investigation found the configuration could not be stated because no configuration worked, so the outcome grew to include the defects that made it so. |
| **Owning unit** | `be/app`, `fe/identity`, `fe/shared`, `docs`, `ops`, `tests` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §5 (public surfaces), §9 (the meta-rule) |
| **Governed by** | [ADR 0033](../adr/0033-the-mcp-server-nobody-could-connect-to.md), and [ADR 0004](../adr/0004-pin-transitive-mcp.md), whose pin this revisits |
| **Rule IDs introduced** | None. `RISK-MCP-002` is added to the residual-risk register; no gate arm is added, and [ADR 0033](../adr/0033-the-mcp-server-nobody-could-connect-to.md) records why. |
| **Entry points** | [`backend/app/main.py`](../../backend/app/main.py) (the mount), [`backend/requirements.txt`](../../backend/requirements.txt) (the pin), [`frontend/src/shared/mcpSnippets.js`](../../frontend/src/shared/mcpSnippets.js) and [`frontend/src/views/SettingsView.vue`](../../frontend/src/views/SettingsView.vue) (the snippet), [`README.md`](../../README.md) |
| **Affected public surfaces** | The **MCP transport and endpoint**: HTTP+SSE at `/mcp` → Streamable HTTP at `/mcp`, reached externally as `/api/mcp`. **Tool names are unchanged** — [`ops/surfaces/mcp-tools.json`](../../ops/surfaces/mcp-tools.json) and [`ops/surfaces/openapi.json`](../../ops/surfaces/openapi.json) are byte-identical after the change. |
| **Known dependents** | MCP clients only. The SPA does not use MCP; it calls REST through [`frontend/src/api/client.js`](../../frontend/src/api/client.js). |
| **Uncertain / dynamic areas** | `BLIND-TEST-001` (test protection is import-derived, so the new session test shows as protecting only `main.py`), `BLIND-FE-001`, `BLIND-FE-002`, `RISK-MCP-001` |
| **Analogous implementations** | [Brief 0015](0015-public-surface-protection.md) — the last time an MCP claim in the README turned out to be false, and the snapshot that was built in response. This change is that story's second half: the snapshot fixed the *names* and could not see the *transport*. |
| **Delivery Pattern** | **Bug Fix**, with the Public-Surface Migration's contract step taken in one commit. [ADR 0033](../adr/0033-the-mcp-server-nobody-could-connect-to.md) justifies compressing the pattern: the old form provably has no working consumer. |
| **Required tests** | A test that speaks the protocol — a real `ClientSession` over the real transport — asserting the handshake, the delivered tool list against the snapshot, both credential shapes, and refusal without one. Plus pure tests for the generated snippets, in the shared layer where they can be tested. |
| **Intended scope** | The mount, the pin and the locks, the two documentation surfaces, one residual risk, one corrected docstring. **Not** in scope: authenticating the MCP connection itself (`RISK-MCP-002`), removing `SHIM-SEC-006`, `RISK-MCP-001`. |
| **Base revision** | `68c24ae` |

## Behaviour change

Yes, and it is a public surface.

| | Before | After |
|---|---|---|
| Transport | HTTP+SSE (`mount()`) | Streamable HTTP (`mount_http()`) |
| Endpoint, externally | `/api/mcp` stream + `/mcp/messages/` (which resolved to the SPA) | `/api/mcp`, one endpoint |
| Forwarded credential headers | `authorization` only | `authorization`, `x-api-key` |
| Tool names | 32 | the same 32, byte-identical snapshot |
| Sessions a client could establish | **none** | all of them |

A client configured against the old form stops finding an SSE endpoint. Nothing else changes: no REST
route moves, no schema changes, the frontend is unaffected at runtime.

## What was wrong, and how it was found

The trigger was a user question — "what exactly does the MCP config need to be?" — about a snippet that
looked wrong. It was wrong, and so was everything underneath it. Four defects, listed in full with their
evidence in [ADR 0033](../adr/0033-the-mcp-server-nobody-could-connect-to.md):

1. `fastapi-mcp` 0.3.3 against the pinned `mcp` 1.29.0 drops the session at `initialize`
   (`'JSONRPCMessage' object has no attribute 'message'`). Reproduced against production and locally.
2. The documented URL, `https://<host>/mcp`, is the SPA. The endpoint is `/api/mcp`.
3. SSE advertises `/mcp/messages/` as an absolute path, which behind the `/api` prefix is the SPA again.
4. `X-Api-Key` — the header every artefact documented — was never forwarded into the tool call, so it
   was the one credential that could not work. The only working shape was `SHIM-SEC-006`.

**Why nothing caught it.** `RULE-SURF-001` compares `ops/surfaces/mcp-tools.json` against the tool list
read off the booted server object. [ADR 0004](../adr/0004-pin-transitive-mcp.md) verified its pin by
importing the app. Both are derived from this process, and both were green throughout. A surface verified
only from the inside proves the implementation agrees with itself; it cannot see a transport that no
consumer can reach. That is the finding worth keeping from this change, and
[`tools/surfaces.py`](../../tools/surfaces.py)'s docstring no longer claims otherwise.

## What this leaves open

- **`RISK-MCP-002`** — the MCP endpoint itself is unauthenticated; anyone who can reach it may list the
  tools. Every call is authenticated. Accepted, because the tool inventory is already published.
- **The `SHIM-SEC-006` soak restarts.** The audit log has been recording credential shapes since
  2026-08-31 to decide whether Bearer-as-API-key is still in use. MCP clients are a plausible producer of
  that shape and none could connect, so the evidence gathered so far says nothing about them. Read the
  window as starting from this deploy.
- **Nothing runs a client session against the deployed server.** The new test runs in-process, and the
  change was additionally verified behind the checked-in `nginx.conf` in a container — but traefik and a
  real Claude client are still only reached by deploying. The first production check is a human
  connecting a client, and it should happen immediately after the deploy rather than being assumed.
