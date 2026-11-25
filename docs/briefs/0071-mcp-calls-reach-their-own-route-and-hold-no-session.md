# Change Impact Brief 0071 — An MCP call reaches its own route, and the transport holds no session

| Field | Value |
|---|---|
| **Requested outcome** | Milestone **M5** of the security remediation plan (findings **REV-005**, **REV-004** and the registered residual risk **`RISK-MCP-002`**), ordered by Uli on 2026-11-24, decision gate **D5** taken as recommended: **authentication before any session is created, and stateless Streamable HTTP where the real session test allows it**. M5.1: first *validate* REV-005 — an isolated ASGI reproduction of MCP tool calls with raw and percent-encoded `/`, `..`, `%2e`, `%2f`, double encoding, query and fragment characters and Unicode look-alikes, observing for each the **final FastAPI handler and its operation id**; fix only if a different handler is reached, else commit the counter-evidence. M5.2: no long-lived state for an unauthenticated handshake; stateless HTTP if the real session test stays green, otherwise idle TTL, absolute lifetime, hard global and per-source limits, body limit and teardown; migrate the public MCP promise of ADR 0033/0037 through expand → soak → contract rather than switching the handshake to hard authentication in one deploy; metrics only as counters. Acceptance (plan M5): an unauthenticated handshake leaves no long-lived state; the first request above the limit is refused in a controlled way; finished, timed-out and disconnected requests give their capacity back; a real in-process session, the tool list, credential forwarding and the refusal of an unlisted tool stay tested. Closing criteria (plan §5): REV-004 — no anonymous unbound session, expiry and capacity limit tested; REV-005 — confirmed with ASGI evidence and fixed, or reproducibly refuted. |
| **Owning unit** | `be/app` — `backend/app/main.py` (the MCP mount) and **new** `backend/app/mcp_gate.py` (the tool-call target binding, the stateless transport, the in-flight budget and the handshake authentication; declared in `architecture.toml` under `be/app`, the assembly unit, because it wires the MCP library to the application and nothing imports it but `main.py`). `be/di` — `backend/app/dependencies.py` (`identify` and `bearer_token`: who a credential names, without recording it, now the one implementation behind `get_current_user` too, so the handshake and the REST routes cannot drift). `be/leaves` — `backend/app/config.py` (three settings). `ops` — `architecture.toml`, both compose files, `rules/ledger.yaml` (`RISK-MCP-002` restated), `rules/shims.yaml` (`SHIM-MCP-001`, anonymous discovery during the soak). `docs` — this brief, ADR 0045, `README.md`, `AGENTS.md` §5 (the MCP row), `docs/security.md`, `docs/threat-model.md`, `docs/operations.md`. `tests` — `backend/tests/unit/test_mcp_target_binding.py` (new), `backend/tests/unit/test_mcp_budget.py` (new), `backend/tests/unit/test_mcp_session.py`. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 (a new backend file goes in a declared unit), §4 (layers: `be/app` may reach `be/di`, `be/adapters/db`, `be/leaves`), §5 (**MCP tools** and the transport are a public surface: names are operation ids, the snapshot is `ops/surfaces/mcp-tools.json`; env vars documented in README, `RULE-SURF-002`), §6 (`AGENTS.md`, `architecture.toml`, `rules/ledger.yaml` and the gate configuration need owner approval — `RISK-GOV-001`: not independent), §8, §9 (the META-RULE: **not engaged** — no rule's check, ledger entry or fixture changes; see *Rule IDs*); [`backend/AGENTS.md`](../../backend/AGENTS.md) (only `database.py` opens a connection; tests at the `_run` seam; the MCP surprises section). |
| **Governed by** | New: [ADR 0045](../adr/0045-mcp-authentication-and-resource-budget.md) (MCP authentication and resource budget). Amends the promises of [ADR 0033](../adr/0033-the-mcp-server-nobody-could-connect-to.md) (Streamable HTTP stays; the transport becomes stateless; anonymous discovery becomes a dated shim) and [ADR 0037](../adr/0037-the-mcp-surface-is-an-allowlist.md) (the allowlist now also binds the *final* handler of every call, not only the tool name). Respected: [ADR 0004](../adr/0004-pin-transitive-mcp.md) (`mcp==1.29.0` and `fastapi-mcp==0.4.0` stay pinned; no dependency changes), [ADR 0026](../adr/0026-the-audit-log.md) (no caller fingerprint and no row an unauthenticated caller can append), [ADR 0044](../adr/0044-credential-lifecycle-jwt-password-and-api-key.md) (every credential form and its revocation apply at the handshake exactly as on REST). |
| **Rule IDs introduced** | None. `SHIM-MCP-001` is added to `rules/shims.yaml` (held by the existing `RULE-SEC-002`), `RISK-MCP-002` is restated. A gate arm for "every MCP call reaches its own handler" would have to boot the application and speak the protocol, which is the unit tier's job (the same limit ADR 0033 recorded); it is held by tests. |
| **Entry points** | `POST /mcp` (`/api/mcp` externally) — every MCP message; `GET /mcp` and `DELETE /mcp` (the optional server stream and session end of the spec). Inside a tool call: `FastApiMCP._execute_api_tool`, which turns tool arguments back into an HTTP request to the application over an in-process `httpx.ASGITransport`. |
| **Affected public surfaces** | **MCP transport: behaviour changes, names do not.** Stateful → stateless Streamable HTTP: no `Mcp-Session-Id` is issued any more, `GET /mcp` and `DELETE /mcp` answer `405` (the specification's answer for a server that offers no stream and no sessions), a `Mcp-Session-Id` a client still sends is ignored. Capacity refusals: `429` (this source) or `503` (the server), with `Retry-After`. **Handshake authentication is staged**: before `MCP_ANONYMOUS_CUTOFF` (default **2027-01-15**) an MCP request without a valid credential is still served — stateless, under its own small share of the budget, counted — and from that day it is `401`. **MCP tools: unchanged (27)**; `ops/surfaces/mcp-tools.json` byte-identical. A tool call whose path argument would leave its own route (`..`, `/`, `?`, `#`, `%`) now addresses its own route with the argument as one literal segment. **REST/OpenAPI: unchanged** (the MCP route is `include_in_schema=False`). **DB schema: unchanged.** **Env vars: three added** — `MCP_ANONYMOUS_CUTOFF` (earlier only), `MCP_MAX_INFLIGHT`, `MCP_SOURCE_MAX_INFLIGHT`; documented in README (`RULE-SURF-002`) and passed through both compose files. **SPA: unchanged.** |
| **Known dependents** | From `./run impact` (index `current`, revision `340c46d194ba`, 1841 nodes / 3059 edges): `main.py` — no import dependents; protected by the TestClient suites (`conftest.py`, `test_mcp_session.py`, `test_api_keys.py`, `test_login_budget.py`, `test_session_revocation.py`, …), governed by ADRs 0018, 0033, 0037, 0044. `dependencies.py` → every router, transitively `main.py`. `config.py` → eleven modules. `mcp_gate.py`: new, imported by `main.py` only. |
| **Uncertain / dynamic areas** | `BLIND-MCP-001`/`RISK-MCP-001` — `./run impact` lists `mcp_tools` for REST-only routes (`get_apikey`, `list_users`, …); that is the index's declaration-derived guess, not the surface: `ops/surfaces/mcp-tools.json` and `test_mcp_session.py` are the authority. The target binding rests on two private seams of the pinned libraries (`FastApiMCP._execute_api_tool`/`_register_mcp_endpoints_http`, `StreamableHTTPSessionManager._handle_stateless_request`); a version bump has to re-run these tests, which ADR 0004's pin already forces. **Production facts this repository cannot see** (plan M0): which MCP clients connect, whether any of them connects without a credential, and what the TLS proxy in front of nginx does with long requests. |
| **Analogous implementations** | `rate_limit.reserve` (brief 0069: reserve a slot under one lock *before* any await, close it exactly once, refuse rather than evict); `API_KEY_LEGACY_CUTOFF` (brief 0070: a dated switch the setting may only bring forward, reported at startup); `SHIM-SEC-008` (a legacy shape accepted until a date, then refused without a deploy). |
| **Delivery Pattern** | **Security or Operability Change** (failure scenario, control, adversarial red tests written first and observed failing) **and Public-Surface Migration** for the transport: expand (stateless + budget + binding, anonymous still served) → soak (counters; until the cutoff) → switch (anonymous refused, by date) → contract (remove the anonymous branch and `SHIM-MCP-001`, its own change). |
| **Required tests** | *ASGI (REV-005 validation):* for every path-parameter tool, the hostile values listed above; the recorded final route's operation id must equal the tool's, or no handler may run at all — a 401/403 is not accepted as evidence (plan §6). Positive controls: a real uuid, a name with a space, an umlaut, a `.`. The concrete impact, as behaviour: `modify_task` with `uuid="../auth/me"` changes no profile; with an admin's key, `modify_task` with `uuid="../admin/settings"` changes no site setting. *Unit:* the in-flight budget — global, per source, the anonymous share, no source key → global only, release exactly once (exception, cancellation), refusal before any other work; the cutoff setting (default, earlier honoured, later and malformed ignored). *ASGI (REV-004):* an anonymous and an authenticated handshake leave no server instance and issue no session id; `GET`/`DELETE` 405; a stale session id is ignored; before the cutoff an anonymous `tools/list` is served, after it `401` (also for an invalid key), a valid key still 200; over-body `413` before any transport. *Parallel:* with the limit at N, N requests held open in a tool call and the N+1st refused (`503`, and `429` for the source tier), capacity back after they finish; a request that exceeds the deadline is answered `504` and frees its slot and its transport; a burst of 50 handshakes leaves zero live transports. *Real session:* `test_mcp_session.py` unchanged in what it asserts (handshake, tool list = snapshot, both credential shapes, anonymous call refused at the tool, the allowlist, parameters survive the hop) and run against the stateless transport. *Metrics:* the counters carry integers only; no header value or argument appears in a counter or the summary log line. *Container:* not named for M5 by the plan's matrix. |
| **Intended scope** | M5.1 in full (validation; fix, because it reproduces — see *REV-005*); M5.2 expand and the stateless switch in full; the handshake-authentication switch **by date**; the contract step **deferred** with its trigger. **Not** in scope: OAuth for MCP, per-tool scopes for API keys, changing the allowlist, a dependency bump, any production action. |
| **Base revision** | `e5653a1` (`security/m4-api-key-hashing`) |

## REV-005 — validation first

Reproduced on 2026-11-25 in an isolated ASGI harness before any production change (the probe became
`test_mcp_target_binding.py`). A real `ClientSession` with a valid **non-admin** API key, the app's own
in-process transport, and a recorder around the application that notes, for every request the tool call
makes, the scope's final `route` and its operation id.

| Tool, argument | Final handler reached | Status |
|---|---|---|
| `get_task_tasks__uuid__get`, `uuid="../auth/apikey"` | `get_apikey_auth_apikey_get` (REST-only) | 200 |
| `get_task_tasks__uuid__get`, `uuid="../auth/apikeys"` | `list_apikeys_auth_apikeys_get` (REST-only) | 200 |
| `modify_task_tasks__uuid__put`, `uuid="../auth/me"`, `email=…` | `update_profile_auth_me_put` (REST-only) — **the profile changed** | 200 |
| `project_tasks_gtd_projects__name__get`, `name="../../auth/apikeys"` | `list_apikeys_auth_apikeys_get` | 200 |
| `project_tasks_gtd_projects__name__get`, `name="../../admin/users"` | `list_users_admin_users_get` (admin-only) | 403 for this key — **200 for an admin's** |
| `delete_task_tasks__uuid__delete`, `uuid="../auth/apikeys/abc"` | `revoke_apikey_auth_apikeys__key_id__delete` | 403 (session-only route) |
| `..%2fauth%2fapikey`, `%2e%2e/auth/apikey` | none (the decoded path matches no route) | 404 |
| `%252e…` (double encoding), `x?y`, `x#y`, `．．／auth／apikey` (U+FF0E/U+FF0F) | the tool's own `get_task_tasks__uuid__get` | 400 |

**Confirmed.** `fastapi-mcp` 0.4.0 substitutes a path argument into the route template unencoded
(`server.py:513-515`), and `httpx` removes `.` and `..` segments while parsing the URL, before the request
reaches the application — so the request is routed to whatever the normalised path names. The allowlist
checks the *tool name* only. Every REST role and credential check still runs (the 403s), so this is not an
authentication bypass; it is an **allowlist bypass**: an MCP session — the thing ADR 0037 promised cannot
read key metadata, change the profile or reach an admin route — can do each, with the key it already holds.
With an admin's key, `modify_task(uuid="../admin/settings", allow_registration=true)` reopens registration
and `../admin/users/<name>/role` changes a role: a prompt injected into a task description is enough to ask
an agent for it. The extra arguments pass because the tool input schema does not forbid additional
properties, and they become the JSON body. Severity: **medium** — the same credential reaches these routes
over REST directly; what fails is the containment of an agent session.

The `x?y` and `x#y` rows show that `?` and `#` cut the path short and the *tool's own* route answers; the
trailing remainder is dropped — wrong, but not a different handler. The percent-encoded rows reach nothing
because Starlette routes on the decoded path and does not normalise it.

## REV-004 — failure scenario

1. **The session farm.** Anyone who can reach `/api/mcp` sends `initialize` without a credential, in a loop.
   Each one creates a `StreamableHTTPServerTransport` and a server task in the session manager's task group,
   keyed by a fresh `Mcp-Session-Id`, and nothing ever removes it: `fastapi-mcp` builds the manager with no
   `session_idle_timeout`, there is no cap, and the client never has to send `DELETE`. Memory and task count
   grow until the single worker (`RISK-SEC-003`) degrades for every user. No credential, no tool call needed.
2. **The held stream.** A `GET /mcp` with a session id opens the server-to-client stream and holds it.
3. **The slow flood.** Many concurrent requests — anonymous or with one stolen key — each holding a worker
   coroutine, with no ceiling on how many run at once.

## Decisions

- **Stateless Streamable HTTP** (`stateless=True`, `json_response=True`). Each POST gets a fresh transport
  that is torn down in a `finally` when the request ends — normally, by error, by cancellation or by the
  deadline. No session id is ever issued, so nothing outlives a request. The tools are plain
  request/response (no server-initiated messages, no resumability), so nothing is lost. `GET` and `DELETE`
  answer `405` before any transport exists. The real session test (`test_mcp_session.py`) passes unchanged
  against it, which is the plan's compatibility condition. *Rejected:* idle TTL + absolute lifetime + caps on a
  stateful manager — it keeps per-client state an anonymous caller can create, and needs four knobs to bound
  what stateless does not create at all.
- **A hard in-flight budget, reserved before any work.** One lock, one reservation per request, taken before
  the credential is looked up or the body is read by the transport: a global ceiling (`MCP_MAX_INFLIGHT`,
  default 32), a per-source ceiling (`MCP_SOURCE_MAX_INFLIGHT`, default 8; the source as the login budget
  determines it, `TRUSTED_PROXIES` included, IPv6 by /64; no source key → global only), and an anonymous
  share of a quarter of the global ceiling, so unauthenticated discovery cannot crowd out authenticated work.
  A full tier answers `503` (global, anonymous share) or `429` (source) with `Retry-After: 1`, without
  touching the database. Released exactly once. Per-worker and in-process like the login budget
  (`RISK-SEC-003`).
- **A deadline.** Every MCP request is bounded by 30 seconds (three times the inner tool call's own
  10-second `httpx` timeout); past it the request is cancelled, answered `504`, and its transport and slot are
  freed. This is also what bounds a client that disconnects mid-request: Starlette does not cancel a buffered
  handler on disconnect, the deadline does.
- **The body limit** already applies: `BodyLimitMiddleware` refuses an MCP body over 1 MiB with `413` before
  routing (brief 0067). A test pins it for `/mcp`.
- **Authentication at the handshake, staged (D5).** Every MCP request's credential is resolved by the same
  code as `get_current_user` (`dependencies.identify`, now shared by both), without an audit row — the tool
  call behind it writes that one, and an unauthenticated caller must not be able to append rows
  (`RISK-OPS-006`). Before `MCP_ANONYMOUS_CUTOFF` an anonymous or invalid credential is still served
  (stateless, anonymous share, counted); from that day it is `401` before any transport exists. The setting
  may bring the date forward, never push it back (as `API_KEY_LEGACY_CUTOFF`); a later or malformed value is
  ignored with a startup WARNING. Recorded as `SHIM-MCP-001`. Why staged: README and ADR 0033 promise that
  "anyone who can reach it may list the tools"; a client or monitor that lists tools without a key would break
  on the deploy, and the plan forbids a hard switch without a soak.
- **REV-005: bind the call to its route, twice.** (1) Every path argument is percent-encoded as **one
  segment** before substitution — everything but `A–Z a–z 0–9 - _ ~`, including `.`, so neither `..` nor `/`,
  `?`, `#` or `%` can change the path's structure; Starlette decodes the segment back, so the handler receives
  exactly the value the client sent (`Haus Umbau`, `Büro`, `.` reach their own handler with that name). (2)
  `RunwayMCP._execute_api_tool` names the tool in a context variable around the call, and
  `mcp_gate.bind_mcp_target` — declared on the application, so the **first dependency of every route** —
  compares it with the operation id of the route Starlette **actually selected** and refuses with `400`
  before any other dependency (the credential lookup) or the handler runs; a REST request carries no tool and
  passes untouched. (2) is the binding the plan asks for ("an Route/operation id statt an einen neu geparsten
  URL-String"); (1) is what makes legitimate unusual values work under it rather than be refused. *Revised
  during the work:* the first draft resolved the scope against `app.router.routes` in an ASGI wrapper; FastAPI
  0.141 nests included routers (`_IncludedRouter`), so that resolver matched every `/auth/*` call to an opaque
  router object and refused legitimate calls — a second resolver is a re-implementation that drifts from the
  one that runs, which is the defect class itself. The dependency reads the route the real resolver chose.
  legitimate unusual values work under it rather than be refused.
- **Counters, not logs of callers.** `mcp_gate.counters()` — served by class (`authenticated`, `anonymous`),
  refused by reason (`source`, `global`, `anonymous_share`, `unauthenticated`, `unbound_target`), `timed_out`,
  and the current `inflight` and `live_transports`. A summary line at INFO at most once an hour, and a
  WARNING at the first capacity refusal in five minutes; both carry only these integers. No header, address,
  tool argument or account name.

## The four steps

| Step | What happens | When |
|---|---|---|
| Expand | Stateless transport, budget, deadline, target binding, handshake classification; anonymous still served and counted | this change |
| Soak | The operator reads the `anonymous` counter (summary line) to learn whether anything lists tools without a key | until the cutoff |
| Switch | An MCP request without a valid credential is `401` before any transport | **2027-01-15** (by date, no deploy), or earlier by `MCP_ANONYMOUS_CUTOFF` |
| Contract | Remove the anonymous branch, the anonymous share and `SHIM-MCP-001`; close `RISK-MCP-002` | its own change, **after 2027-01-15 and before 2027-01-31** |

## Control

In code: `backend/app/mcp_gate.py` — `encode_segment`, `MCP_EXPECTED_OPERATION`, `bind_mcp_target`,
`RunwayMCP` (`_execute_api_tool`, `mount_http`), `_StatelessManager._handle_stateless_request` (the teardown),
`BudgetedTransport` (`_ensure_session_manager_started`, `handle_fastapi_request`, `_serve`), `Budget`/
`Reservation`/`Refused`/`BUDGET`, `anonymous_cutoff`, `anonymous_cutoff_problem`, `_clock`, `counters`,
`report`, `reset_all`; `backend/app/main.py` (`dependencies=[Depends(mcp_gate.bind_mcp_target)]` on the app,
`mcp_gate.RunwayMCP` instead of `FastApiMCP`, the cutoff warning and three fields in `startup complete`);
`backend/app/dependencies.py` (`identify`, `bearer_token`; `get_current_user` now raises and records around
`identify` — a behaviour-preserving extraction, the full unit suite unchanged and green);
`backend/app/config.py` (three settings). `architecture.toml` declares `mcp_gate.py` in `be/app`. No baseline,
budget, rule or suppression changed; `RULE-ARCH-003` stayed green after the binding moved from
`dependencies.py` into `mcp_gate.py` (it was red once, `dependencies.py` fan-in 6 → 7, while `main.py`
imported the binding from there — fixed in the code, not the baseline).

## Test evidence

Run on 2026-11-25 on an arm64 Mac. "Before" is the test file run against the **unchanged production code**
at `e5653a1` (only the test file added).

| Tier | What | Before (`e5653a1`) | After |
|---|---|---|---|
| ASGI (REV-005) | `test_mcp_target_binding.py::TestEveryCallReachesItsOwnHandler::test_a_hostile_path_argument_reaches_no_other_handler` — 11 path-parameter tools × 22 hostile values, the final route recorded per inner request | **red by behaviour**: 47 cases reached another handler (`get_apikey_auth_apikey_get`, `list_apikeys_auth_apikeys_get`, `update_profile_auth_me_put`, `list_users_admin_users_get`, `projects_gtd_projects_get`, …) | every handler that ran is the tool's own, or none ran |
| ASGI (positive control) | `::test_a_legitimate_unusual_value_reaches_its_own_handler` × 6 (space, umlaut, `.`, `a..b`, an en dash, a uuid); `::test_the_value_arrives_as_the_client_sent_it` (a plan named `.` read back) | red for `.` (it reached `projects_gtd_projects_get`, and the plan test failed); green for the rest | green |
| ASGI (impact) | `TestTheReproducedImpact` × 3 — `modify_task(uuid="../auth/me")` changes no profile; an admin key's `modify_task(uuid="../admin/settings", allow_registration=true)` changes no setting; `get_task(uuid="../auth/apikeys")` does not list keys | **red**: the profile changed; registration was reopened; the key list was returned | green |
| Surface pin | `::test_every_path_parameter_tool_is_covered` (the list equals the snapshot's path-parameter tools) | green | green |
| ASGI (REV-004) | `test_mcp_budget.py::TestNoSessionOutlivesItsRequest` × 8 — no `Mcp-Session-Id` and no server instance after an anonymous and an authenticated `initialize`; a list without `initialize`; a stale session id ignored; `GET`/`DELETE` 405; 50-handshake burst leaves 0 live transports; 2 MiB body 413 before any transport | **red by behaviour** for the first five shown (`'mcp-session-id': '4ef9…'` in the anonymous response; `400 Missing session ID`; `400` instead of `405`); the rest red by the module's absence | green |
| Parallel | `TestCapacity` × 5 — limit 3: three held tool calls, the fourth `503` with `Retry-After: 1`, all three 200 after release, a fifth 200, `inflight`/`live_transports` 0; per-source `429` while another source is served; two anonymous holders fill the share, a third `503`, an authenticated request 200; a refused request costs no `identify` call; a never-returning tool call `504` after the deadline with slot and transport freed | red (no budget) | green |
| Unit | `TestTheBudgetUnit` × 5 — global/source order, no source key → global only, release counted once, the quarter share, the source table empty after 500 sources | red (absent) | green |
| ASGI (handshake) | `TestTheAnonymousCutoff` × 9 — in the soak an anonymous list is served and counted; after the cutoff none, an unknown key and a bad bearer are `401` with no transport; all three credential shapes still 200; a JWT revoked by a password change `401` at the handshake; no `auth.authenticated` row from the handshake | red (absent) | green |
| Unit | `TestTheCutoffSetting` × 6 — default 2027-01-15, earlier honoured, later and malformed ignored and reported | red (absent) | green |
| Metrics | `TestTheCountersSayNothingAboutCallers` × 2 — integers only; the summary line holds no key, address or username | red (absent) | green |
| Ops pin | `TestTheComposeFilesPassTheSettings` × 2 | — (added after the red run) | green |
| Real session | `test_mcp_session.py` — handshake, list = snapshot, both credential shapes, anonymous call refused at the tool (clock pinned in the soak), allowlist, parameters survive the hop, documentation; new: after the cutoff a real `ClientSession` without a credential cannot connect | green (existing) | green, against the stateless transport |
| Whole unit tier | `backend/tests/unit` | — | 1423 passed in `make check` |

Of the 253 tests in `test_mcp_target_binding.py`, 52 were red before the control; of the 35 in
`test_mcp_budget.py` at the red run, all 35 were red, 5 of them by behaviour against the old transport.

## Results

- **REV-005: confirmed and fixed.** Reproduced with ASGI evidence before any production change (table above);
  closing criterion (plan §5, "mit ASGI-Beleg bestätigt und behoben") met: every path-parameter tool is held
  to its own handler against the plan's value classes, with the impact asserted as behaviour.
- **REV-004: closing criterion met** ("keine anonyme ungebundene Session; TTL und Kapazitätsgrenze getestet"):
  no session exists at all, for anyone; the in-flight ceilings, the deadline (the plan's TTL for a stateless
  transport) and the teardown are tested in the parallel tier. Plan M5 acceptance: an unauthenticated handshake
  leaves no long-lived state; the first request above the limit is refused (503/429); finished and timed-out
  requests give capacity back; real session, tool list, credential forwarding and the unlisted-tool refusal
  stay tested.
- **`RISK-MCP-002`: restated, not removed.** Its residue (inventory disclosure) ends in behaviour on
  2027-01-15, and the risk leaves the register with the contract step. `SHIM-MCP-001` is new (expires
  2027-01-31). REV-004/REV-005 have no ledger or waiver entry in this repository; nothing to remove.
- **Public surfaces:** MCP tool names, `ops/surfaces/mcp-tools.json` and `ops/surfaces/openapi.json`
  unchanged (`RULE-SURF-001` green with no snapshot update); transport behaviour changed as stated above
  (stateless, 405 on GET/DELETE, 429/503/504, 401 after the cutoff); three env vars documented in README and
  passed through both compose files (`RULE-SURF-002` green). DB schema and SPA unchanged.
- **Rollback:** the previous image runs unchanged on the same data (nothing on disk changed); it is stateful
  again and reopens REV-005 while it runs.

### Deferred, with trigger

- **The switch** — automatic on **2027-01-15** (or earlier via `MCP_ANONYMOUS_CUTOFF`); operator: before it,
  read `served_anonymous` in the hourly `mcp budget` line (`docs/operations.md`, *MCP*) and find any consumer
  that lists tools without a key.
- **The contract step** — its own change, after 2027-01-15 and before `SHIM-MCP-001` expires (2027-01-31):
  remove the anonymous branch, the anonymous share and `MCP_ANONYMOUS_CUTOFF`; remove `SHIM-MCP-001` and
  `RISK-MCP-002`; update README, ADR 0045 and the threat model.
- **Through the real proxy** — the stateless transport, 405 and the capacity answers were verified in-process
  only. Traefik → nginx → backend with a real Claude client has not been run from here (as ADR 0033 recorded
  for its change): check `claude mcp` against `https://<host>/api/mcp` after the deploy (plan §7.3).
- **Production facts** (plan M0): which MCP clients connect, whether any connects without a key, and what
  the TLS proxy does with requests near the 30-second deadline — not visible from this repository.
- **Owner sign-off** on `SHIM-MCP-001`, the `RISK-MCP-002` text, the `architecture.toml` entry and the
  `AGENTS.md` row (`RISK-GOV-001`: not independent).
- **`SHIM-SEC-006` expires today (2026-11-25)** — outside this package (brief 0070 flagged it too);
  `RULE-SEC-002` fails the gate from 2026-11-26 unless it is removed or re-approved. Not touched.
- **Library bump** — `fastapi-mcp`/`mcp` upgrades must re-run the three MCP test files (private seams:
  `_execute_api_tool`, `_register_mcp_endpoints_http`, `_handle_stateless_request`); ADR 0004's pin forces it.

Gate results: recorded in the follow-up commit.
