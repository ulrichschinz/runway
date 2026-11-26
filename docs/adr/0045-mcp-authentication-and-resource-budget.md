# ADR 0045 — MCP authentication and resource budget

- **Date:** 2026-11-25
- **Status:** Accepted
- **Scope:** `backend/app/mcp_gate.py` (new), `backend/app/main.py` (the MCP mount, the app-level
  dependency), `backend/app/config.py` (`MCP_MAX_INFLIGHT`, `MCP_SOURCE_MAX_INFLIGHT`), both compose
  files, `RISK-MCP-002`
- **Brief:** [0071](../briefs/0071-mcp-calls-reach-their-own-route-and-hold-no-session.md)
- **Amends:** [ADR 0033](0033-the-mcp-server-nobody-could-connect-to.md) (the transport) and
  [ADR 0037](0037-the-mcp-surface-is-an-allowlist.md) (what the allowlist binds)

Milestone M5 of the security remediation plan: findings **REV-005** and **REV-004** of the November
2026 review, and the residual risk `RISK-MCP-002`. Decision gate **D5**, taken as recommended:
authentication before any session is created, and stateless Streamable HTTP where the real session
test allows it. Stateless means no session is created at all, so the first half holds by construction;
authenticating the handshake itself is designed here (Decision 4) and **deferred** (see there).

## Context

**REV-005 was a hypothesis and was validated first.** In an isolated ASGI reproduction (brief 0071,
table *REV-005 — validation first*) a real MCP client with a non-admin key called path-parameter tools
with traversal, encoded, double-encoded, query, fragment and Unicode look-alike values, and a recorder
noted the final route of every request the tool call made. `get_task_tasks__uuid__get(uuid="../auth/apikey")`
reached `GET /auth/apikey`; `modify_task_tasks__uuid__put(uuid="../auth/me", email=…)` changed the
profile; `../../admin/users` reached the admin route (403 for that key, 200 for an admin's). Cause:
`fastapi-mcp` 0.4.0 substitutes a path argument into the template unencoded, and `httpx` removes dot
segments while parsing the URL, so the request is routed to whatever the normalised path names, while
the allowlist checked only the tool name. REST roles and credential checks still applied; what failed
was ADR 0037's containment of an agent session. Medium.

**REV-004.** The mount used `fastapi-mcp`'s stateful session manager with no idle timeout and no cap:
every `initialize`, with or without a credential, created a server transport and task that lived until
the client sent `DELETE` — so anyone who could reach `/api/mcp` could grow server state without bound.

## Decision 1 — a tool call reaches its own route

Two controls, both kept:

- **Encode the segment.** Every path argument is percent-encoded as one segment — everything but
  `A–Z a–z 0–9 - _ ~`, the dot included — before substitution (`mcp_gate.encode_segment`). That stops
  dot-segment removal and query or fragment splitting; Starlette decodes it, so the handler receives
  exactly the value sent. It does not stop a `/` (decoded before routing, so `uuid="x/done"` selects
  `complete_task`) or a plain value that selects a sibling route (`set_project_status(name="plans")` is
  `PUT /projects/plans/status`, the `upsert_plan` route): only the binding below does
  (`TestOnlyTheBindingStopsASiblingRoute`, review round 1).
- **Bind to the selected route.** `RunwayMCP._execute_api_tool` names the tool in a context variable
  around the call; `mcp_gate.bind_mcp_target`, declared on the application and therefore the first
  dependency of every route, compares it with the operation id of the route Starlette actually selected
  and refuses with 400 — before any credential lookup or handler — when they differ. REST requests carry
  no tool and pass untouched; no route gains a parameter (`ops/surfaces/openapi.json` unchanged).

*Rejected:* re-resolving the URL against the route table in a wrapper — FastAPI 0.141 nests included
routers, so a second resolver would be a re-implementation that can drift from the one that runs, which
is the defect class itself. *Rejected:* refusing `/ ? # % .` in path arguments — it would also refuse
legitimate existing names on read (threat model §3: resent values are deliberately not validated).

## Decision 2 — the transport is stateless

`stateless=True`, `json_response=True`. A fresh server transport per POST, torn down — and its server
task cancelled — in a `finally` (`_StatelessManager`; `mcp` 1.29.0's own stateless path has no
`finally`, so a cancelled request would have left its task running). No `Mcp-Session-Id` is issued;
`GET` and `DELETE` answer 405, as the specification allows a server with no stream and no sessions; a
session id a client still sends is ignored. The tools are request/response, so nothing is lost. The
plan's condition holds: `test_mcp_session.py` passes unchanged against it.

*Rejected:* stateful with idle TTL, absolute lifetime and caps — it keeps state an anonymous caller can
create, and needs four limits to bound what stateless does not create.

## Decision 3 — reserve before work, and a deadline

`mcp_gate.BUDGET.reserve` takes a slot under one lock before the transport reads a byte: a global
ceiling (`MCP_MAX_INFLIGHT`, 32), a per-source ceiling (`MCP_SOURCE_MAX_INFLIGHT`, 8; the source as the
login budget determines it), and, for a request without any credential header, a quarter of the global
ceiling. Presence, not validity: a made-up header escapes the anonymous share but not the other two. Full: 503 (global, anonymous share) or 429 (source), `Retry-After: 1`, no database work. Every
MCP request is bounded by 30 seconds and answered 504 past it, which also bounds a client that
disconnects (observed: `test_a_client_that_disconnects_mid_call_gives_its_slot_back`; the server task
is cancelled in the request's `finally` and unwinds within a few loop turns after the response). The body limit (1 MiB, `BodyLimitMiddleware`) already applied. Per-worker and in-process,
like the login budget (`RISK-SEC-003`).

## Decision 4 — authentication at the handshake: designed, deferred

The plan's switch is: resolve every MCP request's credential with the same code as `get_current_user`
(extracted as one `identify` function so the two cannot drift, ADR 0044's revocation included, no audit
row so an unauthenticated caller cannot append any), serve a request without a valid one during a soak,
and refuse it with 401 before any transport from a published date (`MCP_ANONYMOUS_CUTOFF`, earlier
only, as `API_KEY_LEGACY_CUTOFF`), recorded as a shim with an expiry. It was implemented and tested in
the working tree of brief 0071 and then **taken out before the commit**: it makes `mcp_gate.py` an
importer of `backend/app/dependencies.py`, whose fan-in ratchet (`RULE-ARCH-003`, baseline 6 in
`ops/structure-baseline.toml`) may only be raised as a deliberate owner decision. That decision is not
the implementing agent's to take (`RISK-GOV-001`). Without it the handshake stays open
(`RISK-MCP-002`, accepted as before) — but it now costs no session, which was REV-004's harm.

*Trigger:* the owner approves raising the `dependencies.py` fan-in from 6 to 7 for this importer — the
same reasoning as the 2026-08-25 raise for `/inbox` (one more dependent on the auth choke point instead
of a second auth implementation). Then: expand (classify, count, serve) in one change, the dated 401 at
least four weeks after its deploy, and the contract removing the anonymous branch.

## Decision 5 — counters only

`mcp_gate.counters()` (served by class, refused by reason, timed out, in flight, live transports), an
INFO summary at most hourly and a WARNING at the first capacity refusal in five minutes. Integers only:
no header, address, account or tool argument. A binding refusal logs the tool name and the reached
operation id, both strings this repository wrote.

## The steps

| Step | What | When |
|---|---|---|
| Expand | Binding, stateless transport, budget, deadline | brief 0071 |
| Handshake authentication | Decision 4: classify and count, then 401 without a valid credential by date, then remove the anonymous branch | deferred — trigger: owner approval of the fan-in raise |

## Consequences

- ADR 0033: Streamable HTTP and the header allowlist stand; the transport is stateless; the open
  connection stays open (`RISK-MCP-002`) until Decision 4 is taken up. ADR 0037: the allowlist now binds the handler a call runs, not only
  the name it is called by.
- MCP tool names and the OpenAPI schema are byte-identical; two env vars are added.
- Both controls of Decision 1 and the transport of Decision 2 rest on private seams of the pinned
  `fastapi-mcp` 0.4.0 and `mcp` 1.29.0 (ADR 0004); a version bump must re-run
  `test_mcp_target_binding.py`, `test_mcp_budget.py` and `test_mcp_session.py`, which the pin already
  forces.
- Not done: OAuth for MCP, scoped API keys, a shared limiter across workers.
