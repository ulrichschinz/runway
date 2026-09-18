# ADR 0033 — Streamable HTTP, a header allowlist, and the MCP server nobody could connect to

- **Date:** 2026-09-18
- **Status:** Accepted
- **Scope:** `backend`, `frontend`, `docs`, `rules`

## Context

Runway has advertised an MCP server since its first release. [`README.md`](../../README.md) documented
the config, the Settings page generated a copy-paste snippet with the user's own API key already
substituted, [`ops/surfaces/mcp-tools.json`](../../ops/surfaces/mcp-tools.json) snapshotted all 32 tool
names, and `RULE-SURF-001` failed the gate whenever one of them changed. Step 13 corrected the tool
names after `BLIND-MCP-001` showed the README had invented seven of them. The surface was, by every
artefact this repository holds, protected.

**No client has ever completed a handshake against it.** This was found on 2026-09-18 by connecting one.

Four defects, each sufficient on its own, each invisible to the gate.

### 1. The transport was broken by a transitive pin

`fastapi-mcp` 0.3.3 declares `mcp>=1.6.0` with no upper bound. [ADR 0004](0004-pin-transitive-mcp.md)
pinned `mcp==1.29.0` after `mcp` 2.0.0 changed `Server.__init__` and produced an image whose backend
could not start — a real fix for a real outage. But the SDK also changed the wire wrapper *inside* the
permitted range: the receive loop expects a `SessionMessage`, and 0.3.3 hands it a bare
`JSONRPCMessage`. Against the running production server:

```
POST .../mcp/messages/?session_id=… → 202 Accepted
  ERROR 'JSONRPCMessage' object has no attribute 'message'   (mcp/shared/session.py:360)
POST .../mcp/messages/?session_id=… → 404 {"detail":"Could not find session"}
```

`initialize` is accepted, the session dies inside the SDK, and every subsequent message is refused.
Reproduced locally with no proxy in the path, so it is not a deployment artefact.

ADR 0004 recorded that the pin was "verified to import cleanly with all 37 routes and `/mcp` mounted".
That verification was honest and it was the wrong instrument: importing proves the process starts, not
that the protocol works.

### 2. The documented URL was not the endpoint

Production is traefik → the frontend container → nginx, and [`nginx.conf`](../../frontend/nginx.conf)
proxies only `location /api/`. The backend has no other route in. So:

| URL | What answers |
|---|---|
| `https://<host>/api/mcp` | the MCP server |
| `https://<host>/mcp` | `200 text/html` — the Vue app |

Every published snippet used the second.

### 3. SSE cannot work behind that prefix

The HTTP+SSE transport advertises where the client must post its messages, as an absolute path:

```
event: endpoint
data: /mcp/messages/?session_id=…
```

nginx strips `/api`, so the backend generates `/mcp/messages/` — which externally is the SPA again. A
client that guessed the right stream URL would still post its first message into an HTML page. Setting
`--root-path /api` fixes the advertisement (verified: it then emits `/api/mcp/messages/`), at the cost of
a deployment flag that must stay in sync with an nginx `location` block, in two compose files.

### 4. `X-Api-Key` was the one credential that could not work

`fastapi-mcp` forwards only allowlisted headers into the tool call, and the default allowlist is
`["authorization"]` — hardcoded in 0.3.3. The header every artefact documented was dropped. Measured on
a working build, same session, same key:

| Client sends | Tool call |
|---|---|
| `Authorization: Bearer <api-key>` | 200, returns the profile |
| `X-Api-Key: <api-key>` | **401 Not authenticated** |

So the only shape that could ever have worked is Bearer-as-API-key — `SHIM-SEC-006`, the dated
compatibility shim whose removal is scheduled for 2026-11-25. The documentation pointed away from the
sole working path and toward a shim.

## Decision

**1. Streamable HTTP, via `mount_http()`, replacing HTTP+SSE.** One endpoint that never advertises a
path of its own, so it is correct behind the `/api` prefix with no `root_path` to keep in sync with
nginx. It is also the transport the MCP specification now prescribes; SSE is deprecated.

**2. An explicit header allowlist, `["authorization", "x-api-key"]`.** This makes the documented shape
the working one. It also *removes* MCP as a consumer of `SHIM-SEC-006` instead of quietly depending on
it, which matters for a shim that is counted down to removal.

**3. `fastapi-mcp` 0.4.0, keeping `mcp==1.29.0`.** 0.4.0 requires `mcp>=1.12.0`, speaks the current
wrapper, and is where the header allowlist became configurable. The upper bound survives for ADR 0004's
original reason, which is unchanged: `mcp` 2.0.0 still breaks the import.

**4. A test that speaks the protocol.**
[`backend/tests/unit/test_mcp_session.py`](../../backend/tests/unit/test_mcp_session.py) opens a real
`ClientSession` over the real transport, carried to the ASGI app in-process. It asserts the handshake,
that the delivered tool list equals the snapshot, and that both credential shapes authenticate while an
anonymous call is refused. It fails against the old configuration.

**5. The frontend snippets move into the tested shared layer**
([`mcpSnippets.js`](../../frontend/src/shared/mcpSnippets.js)) and derive the host from
`window.location.origin` rather than printing `your-host`. A user copying from Settings now gets a URL
that is correct for the deployment they are looking at.

## Verified through the proxy, not only in-process

The in-process test proves the protocol; it does not prove the deployment, and this repository
has twice shipped a claim about production that the host refuted. So the change was also run
behind the real [`nginx.conf`](../../frontend/nginx.conf) — the checked-in file, only `BACKEND_HOST`
substituted — in a container in front of a local backend:

| Request through nginx | Result |
|---|---|
| `POST /api/mcp`, full session with `X-Api-Key` | 32 tools listed, tool call returns the profile |
| `GET /api/mcp` without a session | `400`, the transport's own "missing session id" |
| `POST /api/mcp/messages/` (the old SSE path) | `404` — gone, as intended |

**nginx needs no change.** The HTTP transport answers with plain JSON rather than an event
stream (`json_response` defaults to true), so it is an ordinary request/response pair and
nginx's default buffering and HTTP/1.0 upstream are irrelevant to it. That is a second reason
to prefer it here: the SSE transport would have needed `proxy_http_version 1.1` and
`proxy_buffering off` to stream reliably, which is one more thing to keep true.

What remains unverified until the deploy: the same path through traefik, and a real Claude
client rather than the SDK's.

## The contract step, taken immediately rather than staged

Under decision F2 the MCP surface is externally consumed, and
[`docs/change-workflow.md`](../change-workflow.md) requires expand → migrate → switch → contract. This
change removes the SSE endpoint in the same commit that adds the HTTP one, which is the contract step
without the three before it.

The justification is evidence, not convenience: **the old form cannot have a working consumer, because
it never worked.** No session has ever been established against it — not since the `mcp` pin landed, and
the pin predates every deploy of the current architecture. Preserving a compatibility path for clients
that provably do not exist would mean keeping, and documenting, a second endpoint that is broken in two
independent ways.

Tool names — the part of the surface that consumers actually bind to — are unchanged.
`ops/surfaces/mcp-tools.json` and `ops/surfaces/openapi.json` are byte-identical after this change, which
is the mechanical check on that claim.

## Consequences

- MCP clients work, over `https://<host>/api/mcp`, with `X-Api-Key`.
- One deprecated transport and one hardcoded header allowlist are gone; `RISK-MCP-002` records what the
  new mount still does not do, which is authenticate the *connection*.
- **The `SHIM-SEC-006` soak is measuring a broken instrument.** The audit log began recording credential
  shapes on 2026-08-31 so that "is anyone still sending Bearer-as-API-key?" could be answered from
  evidence. MCP clients are a plausible source of that shape and none of them could connect, so a low
  count today says nothing about them. The soak window should be read as starting from this deploy, not
  from 2026-08-31.
- `RISK-MCP-001` is untouched: the index still derives tool names by declaration.
- The gate is unchanged. No rule is added, and that is a deliberate limit — see below.

## What this does not fix

A rule would have to boot the application, open a session, and call a tool, which is the container test
tier's job rather than a static check. The protection here is a test, not a gate arm, so it holds only
what the unit tier runs.

More generally: this defect survived eleven weeks of a gate that got steadily stricter, because every
artefact describing MCP was derived from the same source — the server object in this process — and none
of them crossed the wire. A snapshot taken from the thing under test proves the thing agrees with
itself. The lesson is recorded here rather than in a rule, because the honest statement of it
("verify a public surface the way its consumers reach it") is not mechanically checkable, and
`RISK-DOC-001` already carries that class of claim.
