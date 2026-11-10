# Change Impact Brief 0056 — A vanished user gets 401

| Field | Value |
|---|---|
| **Requested outcome** | `GET /auth/me` answers **500** for a valid JWT whose account row no longer exists (`WAIVER-TYPE-001`, expired 2026-11-04, which turns `make verify` on `main` red through `RULE-RULE-002`). The owner decided the status: **401** — the token's user is gone, so the caller is not authenticated, and the client logs in again. The waiver is resolved and its `# type: ignore[index]` suppressions removed, as its resolution path says. |
| **Owning unit** | `be/di` — [`backend/app/dependencies.py`](../../backend/app/dependencies.py) (`get_current_user`); `be/routers` — [`backend/app/routers/auth.py`](../../backend/app/routers/auth.py) and [`backend/app/routers/admin.py`](../../backend/app/routers/admin.py), for the two handlers the waiver names. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §5 (REST and MCP are externally consumed; a status change is a surface change), §6 (`rules/waivers.yaml` is an owner-approval file), §8 (a `# type: ignore` must correspond to a waiver, so both go together); [`backend/AGENTS.md`](../../backend/AGENTS.md) (`be/di` provides what routers inject; characterization tests change visibly when behaviour does). |
| **Governed by** | [ADR 0017](../adr/0017-admin-bootstrap-and-route-guards.md) — the route guards and what `user` and `admin` mean; [ADR 0037](../adr/0037-the-mcp-surface-is-an-allowlist.md) — `GET /auth/me` is the MCP tool `me_auth_me_get`. |
| **Rule IDs introduced** | **None.** `WAIVER-TYPE-001` moves from `waivers` to `resolved` in [`rules/waivers.yaml`](../../rules/waivers.yaml), kept rather than deleted because this brief, brief 0002 and `docs/plan/STATUS.md` cite it. |
| **Entry points** | `get_current_user` in [`backend/app/dependencies.py`](../../backend/app/dependencies.py), the JWT branch; `me` in [`backend/app/routers/auth.py`](../../backend/app/routers/auth.py); `set_user_role` in [`backend/app/routers/admin.py`](../../backend/app/routers/admin.py). |
| **Affected public surfaces** | **Behaviour, not shape.** For a JWT naming an account that no longer exists: `GET /auth/me` (MCP `me_auth_me_get`) goes 500 → 401; every other `user`-guarded route goes 200 → 401; the four `admin`-guarded routes go 403 → 401. For every existing account, and for both API-key shapes, nothing changes. The served OpenAPI schema declares no 401 and no 500 on any route, so `ops/surfaces/openapi.json` does not move; `./run surfaces` reports no drift. REST stays **40**, MCP tools **27**, route guards unchanged in [`rules/route-guards.toml`](../../rules/route-guards.toml) — no guard is added or relaxed, the guard that was already declared now holds for this case too. |
| **Known dependents** | `./run impact backend/app/dependencies.py`: all six routers (`admin`, `auth`, `gtd`, `inbox`, `projects`, `tasks`) and through them `main.py` — every guarded route. The SPA: [`frontend/src/shared/sessionEnd.js`](../../frontend/src/shared/sessionEnd.js) already ends the session on a 401 to a token-carrying request that is not `/auth/login`, so `fetchMe` in [`frontend/src/stores/auth.js`](../../frontend/src/stores/auth.js) now drops the token and shows the login page instead of failing on a 500. MCP clients receive the 401 through the tool call as they do for any other refused credential. |
| **Uncertain / dynamic areas** | `BLIND-TEST-001` — routes are exercised through `TestClient`, so the index reports no import-derived protection for any file touched; the protection is the test class named below. `RISK-MCP-001` — the index lists the tool under its declared name `me`; the observed name is `me_auth_me_get` (`ops/surfaces/mcp-tools.json`). **Cost:** one indexed `SELECT` on `users` per JWT-authenticated request, the same read both API-key shapes already pay. **Not proven:** that the 500 was ever hit in production. There is no route that deletes an account; the state arises only from removing a row on the host, and no such 500 is recorded in `docs/operations.md`. |
| **Analogous implementations** | The two API-key branches of the same function, which already refuse a key that matches no row with 401 — this makes the JWT branch hold the same precondition. [Brief 0045](0045-a-refused-login-stays-on-the-page.md) — the client half of "a 401 sends you back to login", which this relies on and does not change. |
| **Delivery Pattern** | **Public-Surface Migration**, with the steps collapsed and the reason recorded: *expand* — not applicable, there is no old form to keep alongside the new one; a 500 is not an answer a consumer can depend on, and no snapshot, document or test promised it. *Migrate* — no consumer has anything to move: the SPA and every MCP client already treat 401 as "authenticate again". *Switch* — this change. *Contract* — the `# type: ignore` suppressions and the waiver entry, removed here. The 200 → 401 on the other routes is the same decision applied where authentication is decided rather than per handler; keeping a deleted account's token working on `/tasks` while `/auth/me` refused it would have been an inconsistency introduced deliberately. |
| **Required tests** | `TestVanishedAccount` in [`backend/tests/unit/test_auth.py`](../../backend/tests/unit/test_auth.py), written first and watched fail (500 on `/auth/me`; 200 on `/tasks`, `/gtd/next`, `/auth/apikey`; 500 on `PUT /auth/me`; 403 on `/admin/users`): a valid JWT for a deleted account gets 401 `Not authenticated` on `GET /auth/me`, 401 on four representative `user` routes, and 401 — not 403 — on an `admin` route. |
| **Intended scope** | The JWT branch of `get_current_user`; the `None` handling in `me` (a row deleted between authentication and the read — now 401) and in `set_user_role` (unreachable in practice — now 404, the same answer that handler already gives for a missing target); the regression tests; the waiver's resolution; the `RULE-RULE-002` arm of [`tools/fixtures/negative.sh`](../../tools/fixtures/negative.sh), which expired this waiver's own date to prove the rule can fail and so broke when the waiver left — it now expires whichever active waiver comes first; the account of the three credential shapes in [`docs/security.md`](../security.md) and the line citations in [`docs/threat-model.md`](../threat-model.md) that the edit shifted; a defect entry in [`docs/operations.md`](../operations.md). **Not** in scope: token revocation in general (a JWT for an existing account remains valid until it expires — that is a separate decision), any route that deletes accounts, and declaring 401 responses in the OpenAPI schema, which no route does today and which would move every route's snapshot at once. |
| **Base revision** | `11e1287` |

## Behaviour change

A JWT is signed, not looked up: `decode_token` proves the server issued it and that it has not
expired, and says nothing about whether the account it names still exists. Both API-key shapes
read the `users` table and so could never authenticate a deleted account; the JWT shape did not,
and returned the username straight from the token. `GET /auth/me` then read the row, got `None`,
and raised `TypeError` — a 500. Every other route simply went on serving a user that no longer
existed: `/tasks` and `/gtd/*` ran Taskwarrior against the old data directory, `GET /auth/apikey`
returned an empty key, and `/admin/*` answered 403 as if the principal were a known non-admin.

`get_current_user` now confirms the account exists before accepting a decoded JWT and raises the
same 401 `Not authenticated` an absent or invalid credential gets. No audit row is written for the
refusal, for the reason the function already gives: only successful authentication is recorded
(`RISK-OPS-006`).

`me` keeps its own check for the narrow race in which the row disappears between authentication
and the read, and answers that with the same 401. `set_user_role` re-reads a row it has just
updated on the same connection; the check there is for the type checker, and it answers 404 like
the existence check a few lines above it.

## Pre-checks

- `TestVanishedAccount` reproduced the defect before the fix — 6 failures, the status codes listed
  above — and passes after it.
- `./run surfaces`: no drift. `mypy` passes with the seven suppressions removed.
- `RULE-GATE-002` went red after the waiver moved (`expiry target not found in waivers.yaml`) and is
  green again with the re-anchored arm; the arm still turns `RULE-RULE-002` red, now on `WAIVER-SEC-003`.
