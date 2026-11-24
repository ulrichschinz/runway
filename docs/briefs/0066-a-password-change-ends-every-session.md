# Change Impact Brief 0066 — A password change ends every session

| Field | Value |
|---|---|
| **Requested outcome** | Finding **REV-001** (Codex review of audit run `20261118T131510Z-claude`, 2026-11-24): a password change left every JWT issued before it valid until expiry (24 h), on every REST route and every MCP tool, so changing the password did not lock out someone holding a stolen token. Ordered by Uli on **2026-11-24** as milestone M2.1 of the security remediation plan (decision gate D3: a monotone per-account `auth_version` in the token and in the database). Closing criterion (plan §5): an old JWT gets 401 everywhere after a password change. |
| **Owning unit** | `be/leaves` — `backend/app/auth.py` (claims, decode). `be/di` — `backend/app/dependencies.py` (`get_current_user` compares the version). `be/adapters/db` — `backend/app/database.py` (column, trigger, the expand row, `get_auth_version`, `change_password`). `be/routers` — `backend/app/routers/auth.py` (login issues the version; password change bumps it and returns a fresh token). `fe/identity` — `frontend/src/identity/useAccount.js`, `frontend/src/identity/SettingsPage.vue`, `frontend/src/views/SettingsView.vue`, `frontend/src/stores/auth.js`. `fe/shared` — `frontend/src/shared/messages.settings.de.js`. `ops` — `ops/surfaces/db-schema.sql`, `rules/shims.yaml` (`SHIM-SEC-008`). `docs` — this brief, ADR 0044, `docs/security.md`, `docs/threat-model.md`, `docs/operations.md`, `README.md`. `tests`. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §2–§5 (SQLite schema forward-only and additive; REST and MCP surfaces through the migration pattern); [`backend/AGENTS.md`](../../backend/AGENTS.md) (only `be/adapters/db` opens a connection; migrations are additive statements in `init_db()`); [`frontend/AGENTS.md`](../../frontend/AGENTS.md). No gate rule is added or changed, so the META-RULE is not engaged. |
| **Governed by** | **New:** [ADR 0044 — Credential lifecycle: JWT, password and API key](../adr/0044-credential-lifecycle-jwt-password-and-api-key.md). Respected: [ADR 0025](../adr/0025-narrowing-the-migration-except.md) (migration loop), [ADR 0037](../adr/0037-the-mcp-surface-is-an-allowlist.md) (auth routes are REST-only), [ADR 0043](../adr/0043-account-identity-and-taskwarrior-storage.md) (the account lookup this builds on). |
| **Rule IDs introduced** | None. Shim **`SHIM-SEC-008`** — a token without `auth_version`, accepted for one JWT lifetime after the first boot of this image, expiring 2027-01-31 (`RULE-SEC-002` enforces the date). |
| **Entry points** | `get_current_user`, reached by every authenticated route: all REST routes but `/health`, `/auth/login`, `/auth/register`, `/auth/registration-status`, and through them every authenticated MCP tool. `POST /auth/login`, `PUT /auth/password`. The boot path `init_db()`. |
| **Affected public surfaces** | **DB schema** — additive: `users.auth_version` and the trigger `users_auth_version_monotone` (`ops/surfaces/db-schema.sql` updated). **REST/OpenAPI — unchanged**: the `PUT /auth/password` response is untyped (`{}`) in the served schema; its body gains `access_token` and `token_type` beside `detail`. **Behaviour change on a public surface, intended:** after `PUT /auth/password` every earlier JWT of that account gets 401; a client that changes the password must use the token in the response (README). **MCP tools — unchanged** (27). **Env vars — none.** **SPA** routes and `localStorage` keys unchanged (`token` is overwritten, not added). |
| **Known dependents** | From `./run impact` (index `current`, revision `b083e66c5dd8`, 1712 nodes / 2671 edges): `auth.py` → `dependencies.py`, `routers/auth.py` → all routers and `main.py`; `dependencies.py` has 6 direct dependents (every router) and reaches every surface; `database.py` 8 direct dependents; `routers/auth.py` → `main.py`. Frontend: `useAccount.js` → `AdminSettings.vue`, `SettingsPage.vue`; `stores/auth.js` → 6 direct dependents; `SettingsView.vue` → `router/index.js`. |
| **Uncertain / dynamic areas** | `BLIND-TEST-001` — routers are exercised only through the TestClient, so the index reports no import-derived protection for them. `BLIND-MCP-001` (resolved) — MCP tool names come from the runtime snapshot. Whether fastapi-mcp forwards the header into the tool call is not an index fact; `test_mcp_session.py` and the new MCP test observe it. |
| **Analogous implementations** | `TestVanishedAccount` / brief 0056: `get_current_user` already holds a signed token to a database precondition. `users_storage_id_immutable` (ADR 0043): a trigger keeps a security-relevant column from moving the wrong way. `SHIM-SEC-007`: a dated compatibility shape. |
| **Delivery Pattern** | **Security or Operability Change** (failure scenario, control, adversarial red test first) **and Public-Surface or Data Migration** (expand → switch → contract) for the token form and the schema. |
| **Required tests** | Unit: claims and decode (`test_session_revocation.py`), the legacy window's edges, the monotone trigger. DB integration: password + version in one statement, compare-and-swap of two concurrent changes, fresh-vs-upgrade schema (`test_migrations.py`). ASGI/REST: an old JWT on **every** protected route of the OpenAPI snapshot gets 401 after a password change, a new one works. MCP: an old JWT is refused at the tool, a new one works, over a real `ClientSession`. Parallel: two concurrent password changes, a password change against a running request. Frontend pure logic: `useAccount` stores the token the change returns (`useAccount.test.js`). Container: not applicable — no Taskwarrior path changes; the existing container suite still runs. |
| **Intended scope** | Expand and the date-driven switch. **Not** in scope: Argon2id and password limits (M2.2), API-key hashing and revocation (M4), logout-side revocation, the contract step, any production action. |
| **Base revision** | `b083e66` (`security/m1-storage-id`) |

## Failure scenario

Mallory obtains Alice's JWT — a shared or stolen laptop with the SPA open, `localStorage` copied by
a script on the origin, a header kept by a proxy or a log. Alice notices and changes her password
in Einstellungen. Before this change Mallory's token keeps working for up to 24 hours: she lists,
edits and deletes Alice's tasks over REST and over MCP, reads Alice's API key from
`GET /auth/apikey` (which then survives every password change, `WAIVER-SEC-003`). Only changing
the password back is closed to her, because it asks for the current one. Pinned as a defect by
`test_existing_tokens_survive_a_password_change` until this change.

## Control

1. `users.auth_version` (default 1, monotone by trigger) and an `auth_version` claim in every new
   token, with `iat` and a random `jti`.
2. `get_current_user` loads the stored version with the account and refuses any token that does not
   carry it — one 401 for every reason.
3. `PUT /auth/password` changes hash and version in one compare-and-swap statement and returns a
   fresh token for the session that made the change.
4. Versionless tokens from the previous image: accepted only when they expire within one JWT
   lifetime of this image's first boot, and compared as version 1 (`SHIM-SEC-008`).
5. Incident: one `UPDATE` bumps one account's or every account's version (`docs/operations.md`).

## Expand → migrate → switch → contract

| Step | What | State in this change |
|---|---|---|
| Expand | Column, trigger, `auth_version_expand_at` written at first boot; new tokens carry the version; versionless accepted within the window as version 1. | **Done, deploys on merge.** Old code reads the expanded DB unchanged. |
| Migrate | Nothing to move: a token is replaced by logging in, which every client does at least once per JWT lifetime. | **Not applicable** — the window *is* the migration. |
| Switch | Versionless tokens refused. | **Automatic, by date**: one `JWT_EXPIRE_HOURS` after the first boot of this image in production, with no deploy and no setting. |
| Contract | Remove the legacy branch and the `site_settings` row. | **Deferred**, own change, after the window has passed in production; `SHIM-SEC-008` expires 2027-01-31. |

Rollback: the previous image ignores the column and the row; it accepts every correctly signed
token again (REV-001 re-opens for the rollback's duration) and its password change does not bump the
version. After rolling forward, bump every version once (`docs/operations.md`).

## Test evidence

Every result below was run on 2026-11-24 on an arm64 Mac. The red column is the new tests against the
unchanged production code at `b083e66`, before any line of the control was written.

| Tier | What | Before the control (`b083e66`) | After |
|---|---|---|---|
| ASGI/REST | `test_session_revocation.py::TestAnOldTokenIsRefusedEverywhere` — every one of the 34 protected operations in `ops/surfaces/openapi.json`, with a positive control first (the old token is not 401 before the change) | **34 of 34 red** (`… still accepts the old token`), positive control green | green |
| MCP, real `ClientSession` over ASGI | `TestMcpRefusesTheOldTokenToo` — `me`, `list_tasks`, `summary` refuse the old token at the tool; the response's token works | **4 of 4 red** | green |
| Unit | `TestClaims` — `sub`/`iat`/`exp`/`jti`/`auth_version`, login issues the stored version, malformed versions, **a token without `exp`** | **red**, including `a_token_without_exp_is_refused`: a correctly signed token without `exp` never expired (python-jose checks `exp` only when present) | green |
| Unit | `TestTheVersionlessWindow` — the previous image's tokens inside / outside the window, revoked by the first change, missing record fails closed | **6 of 7 red** (the green one asserts what already held: a token inside the window works) | green |
| DB integration | `TestPasswordAndVersionChangeTogether` — compare-and-swap of two concurrent `replace_password` calls; an aborted version write leaves the hash untouched even when the caller commits | **red** (no such function) | green |
| Parallel, HTTP | two threads change the password at once from the same session | **red: `[200, 200]`** — both changes succeeded; the later hash silently won | exactly one 200, one 400; winner's password logs in, loser's does not; version 2 |
| Parallel, HTTP | a request authenticated before the change, held inside Taskwarrior while the change happens | **red: `(200, 200, 200)`** — the old token still worked afterwards | `(200, 200, 401)`: the running request completes, the next one is refused |
| Unit | `TestTheOperatorCanRevoke` — the runbook's `UPDATE` ends the session, the API key keeps working; the version cannot go down | **red** (no column) | green |
| Unit, characterization | `test_auth.py::test_existing_tokens_end_with_a_password_change` — the former `test_existing_tokens_survive_a_password_change`, the pinned defect, flipped to 401 | **red** | green |
| DB integration | `test_migrations.py` — upgraded DB starts every account at 1 and records the expand moment once; fresh and upgraded schemas equal; NULL/0/lowering refused; a previous-image row gets 1 | — (new) | green |
| Frontend pure logic | `useAccount.test.js` — a successful change stores the returned token; a refused one does not | **1 red** with the `useAccount.js` change stashed (`expected [] to deeply equal [ 'eyJ.neu' ]`) | green |
| Container (host Taskwarrior 3.5.0) | whole `tests/container` suite — no Taskwarrior path changed; its helper now mints versioned tokens | — | **94 passed** |

In all: 63 of the 69 new backend tests and the flipped characterization test were red before the control;
the 6 green ones are the positive controls and the properties that already held (the API key survives,
a failed change revokes nothing, a token without `sub` is refused, a versionless token inside the window
works, the route list is non-empty). The concurrency tests were run five times in a row, green each time.

## Results

- `./run surfaces`: **only the DB schema snapshot moved** (column + trigger, additive). OpenAPI, the 27
  MCP tools, the SPA snapshot and the env-var table are unchanged.
- Whole unit tier **865 passed**; frontend **749 passed**; container suite against the host binary
  **94 passed**.
- `make check`: **GREEN** (23 s), after `make fix` rebuilt the stale index.
- `make verify`: see the commit's report; recorded below once run.
- Closed by this change: **REV-001** against its plan criterion (an old JWT gets 401 on every protected
  REST route and on the MCP tools after a password change; a new one works; concurrent changes cannot
  write hash and version partially). REV-001 was never in the waiver or risk registers, so nothing is
  removed there. Not closed: `WAIVER-SEC-003` (API keys survive a password change by design, M4).
- Noticed, not in scope: `SHIM-SEC-006` expires **2026-11-25**, tomorrow; `RULE-SEC-002` will turn the
  gate red from that date regardless of this change.

## Deferred, with triggers

| Step | Trigger / date | Owner |
|---|---|---|
| Contract: remove the versionless branch and `auth_version_expand_at` | after one `JWT_EXPIRE_HOURS` has passed since this image first booted in production; before 2027-01-31 (`SHIM-SEC-008`) | maintainer |
| Post-deploy check: an old JWT gets 401 after a password change on the live instance, with a synthetic account | first deploy of this change | maintainer |
| Owner sign-off on `SHIM-SEC-008` — written by the implementing agent, not independently reviewed (`RISK-GOV-001`) | before merge | maintainer |
