# Change Impact Brief 0070 — API keys are stored as hashes and shown once

| Field | Value |
|---|---|
| **Requested outcome** | The open High finding **`WAIVER-SEC-003`** (Phase 0 SEC-5): API keys lie in `users.db` as the cleartext value that authenticates, are permanent, unscoped and un-expiring, and `GET /auth/apikey` hands the value back on demand, so a read of the database file or of any backup of it is a working credential for every account. Ordered by Uli on **2026-11-24** as milestone **M4** of the security remediation plan, decision gate **D4** taken as recommended: **a 256-bit secret, stored as a SHA-256 hash, behind a public random key id, with expiry and revocation**. Plan §4 M4.1–M4.4: a public key id, `user_id`, the hash, created/expiry/revocation time, `last_used_at`, an optional harmless display prefix; a creation response that shows the secret exactly once; a metadata-only status endpoint; the authentication path accepting new hashed and old keys; the old GET deprecated for an announced window; the new format in the static secret scan and the runtime redaction (`RISK-OPS-005`) with negative tests; the existing cleartext values hashed server-side without being printed; the migration ending in the **revocation of every legacy key**; fresh and migrated schemas generated and compared (`RISK-SURF-001`); the switch to hash-only authentication with one external answer for unknown, expired and revoked keys; the contract (cleartext column and legacy authentication removed, 410, the waiver removed) in its own change. Acceptance (plan M4): a synthetic DB, audit and log search finds neither a new nor an old cleartext key; a key from a pre-migration backup does not authenticate after the cutoff; the new secret cannot be retrieved after the creation response; expiry, revocation and rotation are tested. Closing criterion (plan §5): no cleartext keys; old backup keys invalid; show-once contract active. |
| **Owning unit** | `be/leaves` — `backend/app/config.py` (one setting), `backend/app/models.py` (three response/request models), `backend/app/logging_setup.py` (the new value shape). `be/adapters/db` — `backend/app/database.py` (the key format — mint, parse, hash — the legacy cutoff and the clock, beside the table; table `api_keys`, its indexes and triggers, the boot-time legacy import and the date-driven wipe, create/list/revoke/rotate/authenticate), `backend/app/audit.py` (two events). `be/di` — `backend/app/dependencies.py` (both API-key paths go through the hash lookup; the credential shape is kept on the request). `be/routers` — `backend/app/routers/auth.py` (three new routes; the two old ones deprecated). `be/app` — `backend/app/main.py` (the cutoff in the startup line). `fe/identity` — `frontend/src/identity/useAccount.js`, `SettingsPage.vue`; `fe/shared` — `frontend/src/shared/apiKeys.js` (new, pure), `messages.settings.de.js`. `ops` — `tools/checks/secret_scan.py` (`RULE-DEP-003` learns the new shape), `tools/fixtures/negative.sh` (three new arms), both compose files (the setting passed through), `ops/surfaces/openapi.json`, `ops/surfaces/db-schema.sql`. `rules` — `rules/ledger.yaml` (`RULE-DEP-003` text, `RISK-OPS-005`, `RISK-SURF-001`), `rules/route-guards.toml` (three routes), `rules/waivers.yaml` (`WAIVER-SEC-003` mitigation brought up to date — **not** removed or downgraded). `docs` — this brief, ADR 0044 (Decision 6), `README.md`, `docs/security.md`, `docs/threat-model.md`, `docs/operations.md`, `AGENTS.md` (route count). |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §5 (REST through the migration pattern; the SQLite schema forward-only and additive; env vars documented in README, `RULE-SURF-002`), §6 (`AGENTS.md`, `rules/ledger.yaml`, `rules/waivers.yaml` and the gate configuration need owner approval — `RISK-GOV-001`: not independent), §8, §9 (**the META-RULE is engaged**: `RULE-DEP-003`'s check changes, so check, ledger entry, negative fixture and documentation change in one commit); [`backend/AGENTS.md`](../../backend/AGENTS.md) (only `database.py` opens a connection; migrations in `init_db()`; an audit write never fails a request); [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (two UIs until M17 — the old one is left as it is; tests cover the pure logic). |
| **Governed by** | Amends [ADR 0044](../adr/0044-credential-lifecycle-jwt-password-and-api-key.md) with **Decision 6** (the API-key lifecycle the record reserved for M4). Respected: [ADR 0026](../adr/0026-the-audit-log.md) (no credential and no caller fingerprint in an audit row — the public key id is neither), [ADR 0037](../adr/0037-the-mcp-surface-is-an-allowlist.md) (the `auth` tag stays off the MCP allowlist: no tool is added), [ADR 0025](../adr/0025-narrowing-the-migration-except.md) (the new table is a `CREATE TABLE IF NOT EXISTS`, not an `ALTER`), [ADR 0018](../adr/0018-cors-startup-refusal-and-the-inbox-shim.md) (`SHIM-SEC-006`, the Bearer-as-API-key shape, is kept and carries the new keys too). |
| **Rule IDs introduced** | None. `RULE-DEP-003` (committed credentials) is **extended** to the new key shape; `RULE-OPS-002` (credentials reaching a logger) is unchanged in code and gets two fixture arms that log the new credential parts. |
| **Entry points** | New, REST-only (`auth` tag): `POST /auth/apikeys` (create; the only response that carries a secret), `GET /auth/apikeys` (metadata), `DELETE /auth/apikeys/{key_id}` (revoke). Changed: `GET /auth/apikey` (deprecated; legacy value only until the cutoff), `POST /auth/apikey/regenerate` (deprecated; now mints a hashed key and revokes every other key of the account; since review round 1 a signed-in session only, an API key gets 403). Every authenticated route through `get_current_user` (`X-Api-Key`, and `Authorization: Bearer <key>` under `SHIM-SEC-006`), REST and MCP alike. `init_db()` at every boot. |
| **Affected public surfaces** | **REST/OpenAPI: additive plus a deprecation.** Three routes added (40 → 43); `GET /auth/apikey` and `POST /auth/apikey/regenerate` keep their paths, methods and response schema (`{"api_key": str}`) and are marked `deprecated: true`; both answer with `Deprecation`, `Sunset` and `Link: rel="successor-version"` headers. Behaviour changes inside the documented shapes, each stated in the README: an account registered from now on has no legacy key, so its `GET /auth/apikey` answers `""`; after the cutoff every account's does; `regenerate` returns a key in the new format (`rwk_…`, 64 characters instead of 43) and ends **every** other key of the account. **MCP tools: unchanged (27)** — the `auth` tag is not on the allowlist. **DB schema: additive** — a new table `api_keys` with two indexes and three triggers, and (review round 1) one nullable column `users.api_key_closed_at` (the previous image ignores it; NULL for every row it writes); `users.api_key` is kept (the rollback target reads it) and emptied by the migration as it goes. **Env vars: one added** — `API_KEY_LEGACY_CUTOFF` (default `2027-01-15`; it can move the cutoff earlier, never later). **SPA:** routes and `localStorage` keys unchanged; the new UI's settings page no longer reads `GET /auth/apikey`. |
| **Known dependents** | From `./run impact` (index `current`, revision `1e1e2297d154`, 1796 nodes / 2924 edges): `database.py` → `audit.py`, `dependencies.py`, `main.py`, `routers/{admin,auth,gtd,projects}.py`, `services/{password_reset,storage_migration}.py`, transitively `routers/{inbox,tasks}.py`; `dependencies.py` → every router; `routers/auth.py` → `main.py`; `models.py` → every router and `services/task_service.py`; `logging_setup.py` → `audit.py`, `main.py`, `middleware.py`, transitively every router; `config.py` → eleven modules; `useAccount.js` → `AdminSettings.vue`, `SettingsPage.vue`; `views/SettingsView.vue` (old UI) → `router/index.js`. `tools/checks/{secret_scan,log_secrets}.py`: unit `ops`, no import dependents. |
| **Uncertain / dynamic areas** | `BLIND-TEST-001` — no router and not `dependencies.py` has import-derived test protection; they are exercised through the TestClient. `BLIND-MCP-001`/`RISK-MCP-001` — `./run impact` lists `mcp_tools: ['get_apikey']` and `['regenerate_apikey']`; that is the index's name-derived guess, not the surface: `ops/surfaces/mcp-tools.json` has neither, and `test_mcp_session.py` proves both are absent. **Production facts this repository cannot see** (plan M0): how many accounts hold a legacy key, which clients read their key back through `GET /auth/apikey`, how many backups of `users.db` exist and where. |
| **Analogous implementations** | `SHIM-SEC-008` / ADR 0044 Decision 3 (a legacy credential form accepted until a moment written at the first boot, then refused without a deploy); `users_storage_id_immutable` / `users_auth_version_monotone` (a trigger that makes a security property of a row unrevertable); `admin_preserving_write` (one `BEGIN IMMEDIATE` transaction per multi-statement change). |
| **Delivery Pattern** | **Security or Operability Change** (failure scenario, control, adversarial red tests written first and observed failing) **and Public-Surface / Data Migration** — expand → migrate → switch → contract, with the steps that need real elapsed time driven by a date rather than faked (see *The four steps*). |
| **Required tests** | *Unit:* the key format (prefix, 16-hex id, 256-bit secret, SHA-256 of the whole string), parsing refuses every other shape, the cutoff (default, earlier honoured, later and malformed refused), the redaction of the new shape under a neutral name. *DB integration:* fresh and upgraded schemas of `api_keys` identical; the boot import hashes every cleartext value, idempotently, without printing it; a value changed in `users.api_key` does not authenticate (only the hash does); an old-image rotation during a rollback is picked up and supersedes the earlier legacy row; after the cutoff the boot revokes every legacy row and empties the column, and a pre-migration backup booted after the cutoff yields no working key; the triggers refuse un-revoking and re-pointing a key. *ASGI/REST:* create shows the secret once and it authenticates through both shapes; nothing afterwards returns it; list is metadata only; expiry, revocation, an unknown key and a legacy key after the cutoff give the same answer per shape; key management needs a signed-in session (an API key gets 403); another account's key cannot be revoked; the active-key cap; `last_used_at`; the deprecated GET (headers, legacy value before the cutoff, `""` after, `""` for a new account); `regenerate` returns a new-format key and ends every other key, the legacy one included; revoking the legacy key empties the column; registration stores no cleartext; a password change still leaves keys alone (existing test). *Acceptance search:* after a full create–use–list–rotate–revoke cycle, the users database (`iterdump`), the audit database and the captured log stream contain neither any secret nor any hash. *Gate:* negative arms — a committed `rwk_…` key fails `RULE-DEP-003`; logging the new secret and its hash fails `RULE-OPS-002`. *Frontend pure logic:* key state, the one-time display that needs a confirmation before it is forgotten, the download text. *Container:* the existing suite, whose `register_user` now creates its key through the new route (arm64: not runnable here, `RISK-TEST-001`). *Parallel:* not named for M4 by the plan's matrix; the create path is one `BEGIN IMMEDIATE` transaction, so the cap cannot be raced. |
| **Intended scope** | M4.1 (expand) and M4.2 (migrate, the server side) in full; M4.3 (switch) as far as it is safe today — hash-only authentication from the first request, and the legacy cutoff, the wipe and the GET's silence as a **date-driven** switch; M4.4 (contract) **deferred** with its date. **Not** in scope: deleting the `users.api_key` column, `410` on the old routes, removing `WAIVER-SEC-003` (criteria not met — see *Deferred*); the old UI (`?ui=alt`, deleted in M17); key scopes; any production action. |
| **Base revision** | `1e1e229` (`security/m3-2-login-budget`) |

## Failure scenario

1. **The backup.** Mallory obtains a copy of `users.db` — a backup tarball on a laptop, a copy taken for
   debugging, a snapshot of the host volume. `SELECT username, api_key FROM users` gives her a working,
   permanent credential for every account, admins included. It survives every password change and every
   `JWT_SECRET` rotation, and it is still valid in a backup from months ago.
2. **The read-back.** Anyone who holds a session for an account — a borrowed browser, a stolen token —
   calls `GET /auth/apikey` and leaves with a credential that outlives the session and that a password
   change does not end.
3. **The multiplied key** (what a naive fix would add). If a stolen API key could mint further keys,
   revoking the stolen one would not end the intrusion: the attacker would already hold a second.
4. **The laundered key** (review round 1). Mallory's legacy key from scenario 1 calls the deprecated
   `regenerate` before the cutoff and receives a fresh `rwk_` key valid for 365 days — the backup key dies at
   the cutoff, the access it gave does not; the same call ends every key the owner holds. Any issued key can
   do the same just before it expires, indefinitely.
5. **The rollback's backfill** (review round 1). The previous image's boot gives every NULL
   `users.api_key` a fresh cleartext key. Every account this image registered or moved has a NULL there; after
   a rollback and a roll-forward the next boot would import those values as valid legacy keys, and the
   deprecated GET would hand them out.

## Decisions

- **Format.** `rwk_<key id>_<secret>`: the literal prefix `rwk_`, a public **key id** of 16 lowercase hex
  characters (64 random bits, `secrets.token_hex(8)`), and a **secret** of 43 URL-safe characters
  (`secrets.token_urlsafe(32)`, 256 random bits) — 64 characters in all. The prefix makes the key
  recognisable to a secret scanner and a redaction filter; the id makes the lookup an index read on a
  public value, so the secret is compared exactly once, with `hmac.compare_digest`.
- **What is stored.** `secret_hash` = SHA-256 of the **whole key string** (which contains the 256-bit
  secret), as 64 hex characters. No salt and no pepper (D4): with 256 bits of entropy an offline search
  is not a threat, and a server-side pepper would be a new root secret beside the database it is meant
  to protect. The secret itself is never written anywhere.
- **The table** `api_keys` (`id`, `key_id` UNIQUE, `user_id`, `kind` ∈ {`issued`, `legacy`},
  `secret_hash`, `label`, `created_at`, `expires_at`, `revoked_at`, `last_used_at`; times as UTC epoch
  seconds). A new table rather than columns on `users`: one account may hold several keys, and a
  `CREATE TABLE IF NOT EXISTS` is the same statement on a fresh and on a migrated database, so
  `RISK-SURF-001`'s drift cannot recur in it (and a test compares the two). Three triggers: a revoked key
  stays revoked; `key_id`, `user_id`, `kind` and `secret_hash` never change.
- **Expiry and the cap.** A new key expires after `expires_in_days` (1–365, default 365). An account holds
  at most **10** active issued keys; the 11th is `409`. Inactive issued keys beyond the newest 40 are
  deleted when a key is created, so the table cannot be grown without bound by a create/revoke loop.
- **Key management needs a session.** `POST /auth/apikeys` and `DELETE /auth/apikeys/{key_id}` accept
  only `Authorization: Bearer <jwt>`; an API key gets `403`. Scenario 3: otherwise a stolen key mints
  its own successor. Listing accepts any credential (it returns nothing secret). The deprecated
  `regenerate` needs a session too (review round 1 — the first version kept accepting a key, on the
  argument that it cannot multiply keys, only replace them; that missed scenarios 4 and 5).
- **One answer per shape.** An unknown, malformed, expired or revoked key, and a legacy key after the
  cutoff, all get the same `401`: `Invalid API key` on `X-Api-Key`, `Not authenticated` on the Bearer
  shim — the details those shapes already had.
- **`last_used_at`** is written at most once per minute per key, so an agent's request stream does not
  turn every read into a write.
- **The legacy keys** become rows of kind `legacy` at boot: `secret_hash` = SHA-256 of the cleartext value,
  `expires_at` = the cutoff. From the first request of this image **only the hash authenticates** — the
  `users.api_key` column is never compared again. It is still kept, holding the same value, for one
  reason: the previous image authenticates by it, so a rollback inside the window breaks no agent.
- **The cutoff** is `API_KEY_LEGACY_CUTOFF`, a date, default **2027-01-15**, 00:00 UTC — seven weeks after
  this change and sixteen days before the waiver's expiry, which leaves the contract step room. The
  setting can move the cutoff **earlier** (an incident, or every user has moved), never later: a later or
  malformed value is ignored with a boot `WARNING` and the default applies. A knob that could extend the
  life of a credential in every old backup would be the knob that gets turned.
- **At and after the cutoff** (date-driven, no deploy needed for the authentication part): a legacy key is
  refused without a lookup, and `GET /auth/apikey` returns `""`. **The first boot after the cutoff**
  marks every legacy row revoked and sets `users.api_key` to NULL in every row; from then on the database
  holds no cleartext key, and a pre-migration backup restored later is emptied by the same boot before it
  could serve a request. A restart on the cutoff day is the operator step (`docs/operations.md`).
- **Revoking the legacy key** (through `DELETE /auth/apikeys/{key_id}` or `regenerate`) also empties that
  account's `users.api_key` in the same transaction: an account that has moved holds no cleartext from
  that moment, before any cutoff.
- **Registration** stores no cleartext and mints no key; a new account creates its first key in the
  settings page. `init_db()` no longer back-fills a cleartext key into empty rows.
- **The deprecated routes** answer with `Deprecation: @1795564800` (2026-11-25, RFC 9745),
  `Sunset: <the cutoff as an HTTP date>` (RFC 8594) and `Link: <apikeys>; rel="successor-version"` — relative,
  so it resolves under `/api` externally and at the root internally alike.
- **Audit and logs.** Two new events, `auth.apikey.created` and `auth.apikey.revoked`, naming the public key
  id and never the secret or the hash; `auth.apikey.disclosed` is now written only when the deprecated GET
  actually returns a value. The redaction filter learns `rwk_<16 hex>_<secret>`; the 43-character legacy
  shape stays. The hash has no distinctive shape — 64 hex characters are also every digest this
  application handles — so it is kept out of logs by never being passed to one, by its name (`secret`
  is in both vocabularies), and by the acceptance search, not by a value pattern (`RISK-OPS-005`).
- **UI** (the new one, the default). The settings page lists the account's keys as metadata (label, the
  public prefix `rwk_<id>`, created, expires, last used, state) with a revoke button behind a question, and
  creates a key with an optional label. The new key is shown **once**: copy and download, and it stays on
  the screen until the person confirms they have stored it; then it is dropped from memory. It is never put
  into `localStorage`. The Claude and MCP snippets carry it only while it is shown. The old UI
  (`?ui=alt`) is left as it is until M17 (frontend contract): its `regenerate` button still works and
  shows the new key in that answer; after a reload it shows the empty value of the deprecated GET.

## The four steps

| Step | Plan | What happens | When |
|---|---|---|---|
| Expand | M4.1 | Table, new routes, new format, hash-only authentication, deprecation headers, scan and redaction | this change |
| Migrate | M4.2 | Every cleartext value hashed at boot; users create new keys in the settings page; revoking or regenerating empties the column | this change (server); users until the cutoff |
| Switch | M4.3 | Legacy keys refused, the deprecated GET returns nothing; the first boot after it revokes every legacy row and empties `users.api_key` | **2027-01-15** (by date) and the first boot after it |
| Contract | M4.4 | Drop `users.api_key` by a versioned table rebuild, remove legacy authentication, `410` on the old routes, remove `WAIVER-SEC-003` | its own change, **after 2027-01-15 and before 2027-01-31** |

## Control

See *Decisions*. In code: `backend/app/database.py` (`new_api_key`, `parse_api_key`, `api_key_hash`,
`legacy_cutoff`, `legacy_cutoff_problem`, `api_key_clock`, `CREATE_API_KEYS`, `API_KEY_SCHEMA`,
`migrate_legacy_api_keys`, `authenticate_api_key`, `create_api_key`, `list_api_keys`, `revoke_api_key`,
`rotate_api_keys`, `legacy_api_key`), `backend/app/dependencies.py` (`get_current_user`,
`_api_key_owner`), `backend/app/routers/auth.py` (`create_apikey`, `list_apikeys`, `revoke_apikey`,
`get_apikey`, `regenerate_apikey`, `_require_session`). The key format was first written into
`backend/app/auth.py`; `RULE-ARCH-003` then reported that file's fan-in rising from 5 to 6 (the new
`database.py` → `auth.py` edge). The baseline was **not** raised: the format moved beside the table it
describes, where `generate_api_key` used to live, and `auth.py` is unchanged by this brief.

## Test evidence

Run on 2026-11-25 on an arm64 Mac. The red column is `backend/tests/unit/test_api_keys.py` run against the
**unchanged production code** at `1e1e229` (the test file and nothing else added). Tests that need a new
name (`new_api_key`, `api_key_clock`, the `api_key_legacy_cutoff` setting) are red there by its absence,
recorded as such; the redaction tests build the key string themselves so that they are red by behaviour.

| Tier | What | Before (`1e1e229`) | After |
|---|---|---|---|
| Unit (format) | `TestTheFormat` × 3 — prefix, 16-hex id, 256-bit secret, SHA-256 of the whole string; random; only the exact shape parses | red (no `new_api_key`) | green |
| Unit (cutoff) | `TestTheCutoff` × 7 — default 2027-01-15, earlier honoured, later and malformed refused | red (no setting) | green |
| Unit (redaction) | `TestRedaction::test_a_new_key_is_redacted_under_a_neutral_name`, `::test_a_new_key_in_a_header_dump_is_redacted` | **red by behaviour**: the secret survived (`'uFnSqwg9…' is contained here`) — the 43-character pattern does not match after `_` | redacted |
| Unit (regression pin) | `TestRedaction::test_the_public_prefix_alone_survives` | green (passed) | green |
| DB integration | `TestTheSchema::test_fresh_and_upgraded_databases_have_the_same_api_keys_schema` | **red**: `set() >= {'api_keys'}` | equal |
| DB integration | `TestTheSchema::test_a_revoked_key_cannot_be_unrevoked_and_a_key_cannot_be_repointed` | red (404, no route) | four `IntegrityError`s |
| DB integration | `TestTheLegacyImport::test_every_cleartext_value_becomes_a_hash`, `::test_the_import_is_idempotent` | **red**: `no such table: api_keys` | one legacy row with the hash, no cleartext |
| DB integration | `TestTheLegacyImport::test_only_the_hash_authenticates_not_the_column` | **red: `assert 200 == 401`** — a value planted in `users.api_key` authenticated | 401 for the planted value, 200 for the real key |
| DB integration (regression pins) | `::test_the_import_prints_nothing`, `::test_the_legacy_key_still_authenticates_before_the_cutoff`, `::test_a_rotation_by_the_previous_image_supersedes_the_old_legacy_row`, `::test_the_previous_image_can_still_read_its_column` | green — the old code authenticated by the column, which these pin as still working | green |
| DB integration (cutoff) | `TestAfterTheCutoff` × 5 — refused by date without a restart (both shapes, both details); the first boot after it revokes and wipes; **a pre-migration backup restored after the cutoff yields no working key and is emptied**; the GET says nothing after it; issued keys untouched | red (no setting) | green |
| ASGI/REST | `TestShowOnce` × 5 — shown once and it authenticates via both shapes; nothing returns it afterwards; the list is metadata only; registration stores no cleartext (**red: the value was a 43-character key**); a new account has nothing to read back (**red**: `{'api_key': '…'} != {'api_key': ''}`) | red | green |
| ASGI/REST | `TestLifecycle` × 8 — expired and revoked refused like unknown (same body per shape); expiry bounds (422); a forged secret for a real id; another account's key (404, still works); `last_used_at`; the cap (409); bounded rows under a 60× create/revoke loop (≤ 50) | red (404 / clock fixture error) | green |
| ASGI/REST | `TestKeyManagementNeedsASession` × 3 — an API key cannot create (403, both shapes) or revoke; it may list | red (404) | green |
| ASGI/REST | `TestTheDeprecatedRoutes` × 4 — `Deprecation`/`Sunset`/`Link` (**red: `KeyError: 'Deprecation'`**); `deprecated: true` in the served schema (**red: `None is True`**); `regenerate` mints `rwk_…`, ends the legacy **and** the issued key, empties the column; revoking the legacy key empties the column | red | green |
| ASGI/audit | `TestTheAuditTrail::test_creation_and_revocation_are_recorded_by_public_id` | red | green |
| Acceptance search | `test_no_database_audit_row_or_log_line_holds_a_key_or_its_hash` — create, regenerate, create, use (both shapes), list, read back, revoke all, a refused use; then `iterdump` of `users.db` and `audit.db` and the whole log stream: no secret anywhere, no hash in the audit or the log | red (404) | green |
| Gate (negative arms) | `DEP-003-apikey` — a run-time-built `rwk_` key appended to `README.md` | **red before the scan change**: the scanner of `1e1e229` returned nothing for that line | `RULE-DEP-003 … looks like a committed runway API key` |
| Gate (negative arms) | `OPS-002-apikey` (`logger.info("minted %s", issued.api_key)` in `create_apikey`), `OPS-002-apikey-hash` (`extra={"looked_up": secret_hash}` in `authenticate_api_key`) | — (new code) | `RULE-OPS-002` at both lines, observed directly before the suite ran them |
| ASGI/REST (existing, changed on purpose) | `test_auth.py::TestApiKey::test_is_returned_in_cleartext` → `test_is_no_longer_returned_in_cleartext` (it pinned SEC-5 as a defect); `test_audit.py::TestEvents::test_the_api_key_disclosure` (a row only when a legacy value leaves); the audit acceptance test expects `auth.apikey.created` instead of `disclosed`; `conftest.register_user` creates its key through `POST /auth/apikeys` | — | green |
| ASGI/REST (existing, unchanged) | `test_session_revocation.py` (now also covers the three new routes through the snapshot), `test_inbox.py`, `test_mcp_session.py` (the new routes are not MCP tools), `test_login_budget.py`, `test_logging.py`, `test_security_wave.py` | green | green |
| Restore/rollback (manual, recorded) | A detached worktree of `1e1e229` and this tree on one synthetic database: old image registers `alice` (legacy key) → new image: key 200, login 200 → **back to the old image: key 200, login 200** → new again: 200, one legacy row. Then the new image with `API_KEY_LEGACY_CUTOFF=2026-01-01`: key **401**, `users.api_key` non-NULL rows **0**; the old image on that file: the backup key **401** (it minted a fresh cleartext key into the emptied row — the reason the runbook forbids that rollback after the cutoff) | — | as stated; not a gate test |
| Frontend pure logic | `frontend/tests/apiKeys.test.js` (10) — one-time display needs a confirmation, writes no storage; names, states, order, day, legacy deadline, download text. `useAccount.test.js` — one creation per double click, the list holds metadata only, the key is dropped only after confirmation, 409, no `GET /auth/apikey`, one revocation per double click | red (module absent) | green |
| Container | not runnable here (`RISK-TEST-001`); `register_user` changed, so CI's container tier is its first run | — | see Results |
| Parallel | not named for M4 by the plan's matrix; the cap is checked inside one `BEGIN IMMEDIATE` transaction | — | — |

Of the 50 tests in `test_api_keys.py`, 46 were red before the control (45 failed, 1 error) and 4 green: the
regression pins named above.

## Review round 1

Eight reviewer issues, each verified here before anything changed. The red column is the new tests run
against `126b7f3` (the tests added, nothing else).

| # | Issue | Verdict | Control | Test (red on `126b7f3` → green) |
|---|---|---|---|---|
| 1, 5 | `regenerate` accepts an API key: a legacy backup key is swapped for a 365-day `rwk_` key that works after the cutoff, and the owner's keys end (scenario 4) | **real, blocker** | `regenerate_apikey` calls `_require_session` (403 for a key, both shapes); the old UI calls it with its JWT | `TestRegenerateNeedsASession::test_a_legacy_backup_key_cannot_be_laundered_into_a_key_that_outlives_the_cutoff` — **red: `laundered`, `assert 200 == 401`** (the minted key answered 200 thirty days after the cutoff); `::test_an_issued_key_cannot_regenerate_and_lock_its_owner_out` — **red: `assert 200 == 403`**; `::test_a_signed_in_session_still_regenerates` — green pin |
| 6 | the same route lets a key extend its own life indefinitely; the docs claim a stolen key cannot mint its successor | **real** (same root) | same; README, `docs/security.md`, `docs/threat-model.md`, ADR 0044 now say regenerate needs a session | covered by the two red tests above |
| 2, 8 | a rollback before the cutoff: the previous image back-fills a cleartext key into every NULL `users.api_key`, and the next boot of this image imports them as legacy keys (scenario 5) | **real** | new nullable column `users.api_key_closed_at`, set by registration, by revoking the legacy key, by `regenerate` and by the cutoff boot; the boot imports nothing from a closed account's column and empties it instead. An account the previous image wrote keeps `NULL` and its key. Runbook *Rollback* rewritten: every rollback re-mints, what survives the roll-forward, the check query; the operator's "end every key" statement closes the account too | `TestARollbackBeforeTheCutoff::test_a_moved_and_a_new_account_get_no_working_key_from_the_previous_images_backfill` — **red: `alice`, `assert 200 == 401`**; `::test_a_regenerated_account_gets_no_working_key_from_the_backfill` — **red: `assert 200 == 401`**; `::test_an_account_the_previous_image_registered_during_the_rollback_keeps_its_key` — green pin (the other side of the line) |
| 3 | the Android app's password login reads the deprecated GET and gets `""` for every new account | **real** (documentation and trigger; the app is not in this repository) | README states it and names the "Key einfügen" workaround; ADR 0044 and *Deferred* name the app as a client that must move before the 410 | — (no code here can migrate it) |
| 4 | an earlier `API_KEY_LEGACY_CUTOFF` after the import leaves `expires_at` (and the settings page's deadline) at the later date | **real, minor** | every pre-cutoff boot lowers live legacy rows' `expires_at` to the cutoff in force (one-way); runbook says so | `TestAnEarlierCutoff::test_moving_the_cutoff_earlier_moves_the_announced_expiry` — **red: `'2027-01-15T00:00:00+00:00' == '2027-01-05T00:00:00+00:00'`** |
| 7 | `docs/threat-model.md` *API key theft* still describes cleartext, permanent keys | **real, minor** | section rewritten: what is mitigated for new keys, what stays open until the cutoff and the contract | — |

Also fixed while there: `TestTheSchema::test_a_revoked_key_cannot_be_unrevoked_and_a_key_cannot_be_repointed`
was flaky — it "changed" the hash's first digit to `0`, a no-op for one hash in sixteen, which the trigger
rightly lets through; it now flips the digit. `test_audit.py::TestEvents::test_the_api_key_disclosure` plants
its legacy value as the previous image would leave it (`api_key_closed_at` NULL), since a value planted into
an account this image registered is, correctly, no longer imported. Surfaces: `db-schema.sql` (+1 column) and
`openapi.json` (regenerate's description) updated by `./run surfaces --update`; `rules/route-guards.toml`
comment names regenerate.

## Results

- Plan M4 acceptance, as far as it can be met before the cutoff: a synthetic DB, audit and log search finds
  no **new** key anywhere and no hash in the audit or the log (test above); a key from a pre-migration
  backup does not authenticate after the cutoff (test, and the manual rollback probe); the new secret is not
  retrievable after the creation response; expiry, revocation and rotation are tested. **Not yet met:** the
  users database still holds the **old** cleartext keys of accounts that have not moved, by design, until
  the first boot after 2027-01-15.
- `WAIVER-SEC-003` is therefore **not removed and not downgraded**: its closing criterion (no cleartext
  keys; old backup keys invalid; show-once active) is met for the show-once contract only. Its mitigation
  text in `rules/waivers.yaml` now says what changed and what keeps it open; the expiry 2027-01-31 stands.
  `RISK-OPS-005` and `RISK-SURF-001` are restated, not closed. `RULE-DEP-003` is extended (META-RULE: check,
  ledger text, fixture arm, docs in one commit).
- Public surfaces: REST +3 routes (43), two deprecated, `ops/surfaces/openapi.json` updated; DB schema +1
  table, `ops/surfaces/db-schema.sql` updated; MCP tools, SPA routes and storage keys unchanged (`make
  surfaces`: no further drift); one env var documented in README (`RULE-SURF-002` green).
- Rollback: before the cutoff the previous image runs on the expanded database and its keys keep working
  (probe above); keys created by this image do not work under it. After the cutoff, rolling back past this
  image is not allowed (runbook). The cutoff is not rolled back.

- `make check` on `cfbcf5c` (after `make fix`): **GREEN** (39 s of 180 s). Before the commit it was red once
  on `RULE-ARCH-003` (`backend/app/auth.py` fan-in 5 → 6, from the first placement of the key format) and
  `RULE-OPS-002` (a startup log field named `api_key_legacy_cutoff`, which the runtime filter would also have
  redacted); both fixed in the code — the format moved to `database.py`, the field renamed
  `legacy_key_cutoff` — no baseline or rule changed.
- `make verify` on `cfbcf5c` in a clean, bootstrapped detached worktree: **GREEN** (288 s of 600 s) — unit
  1121 passed, frontend 779 passed, 60 fixture arms passed, 0 failed (the three new ones —
  `DEP-003-apikey`, `OPS-002-apikey`, `OPS-002-apikey-hash` — each went red); 47 of 50 executable rules
  proven able to fail. The **container tier was skipped** on this arm64 host (`RISK-TEST-001`: no arm64
  archlinux image) and was **not** observed here; `conftest.register_user` changed, so CI's container tier
  is its first run.

### Deferred, with trigger

- **The switch's boot** — operator, on or after **2027-01-15**: restart the backend once (any deploy does);
  check `SELECT COUNT(*) FROM users WHERE api_key IS NOT NULL` is 0 (`docs/operations.md`, *API keys*).
  Before that: tell the accounts in the "who has not moved yet" query to create new keys.
- **M4.4 contract** — its own change, **after the boot above and before 2027-01-31** (the waiver's expiry):
  drop `users.api_key` by a versioned table rebuild (SQLite cannot drop a UNIQUE column with `ALTER`; this
  also ends `RISK-SURF-001`'s drift), remove the legacy lookup and `legacy_api_key`, answer `410` on
  `GET /auth/apikey` (and decide `regenerate`'s fate under F2), add the gate rule plan M4.4 asks for — a
  cleartext-shaped key in a DB dump or an API response fails the gate, with its negative fixture — and only
  then remove `WAIVER-SEC-003`. Trigger: the date, and the count above being 0 in production.
- **Backups** — operator, by the retention policy: every `users.db` backup taken before 2027-01-15 holds the
  legacy keys in cleartext (working until then, refused after). Protect them as credentials until the
  cutoff; replace them afterwards. Not visible from this repository (plan M0).
- **Production facts** (plan M0): how many accounts hold a legacy key, and which clients read their key back
  through `GET /auth/apikey` (the `auth.apikey.disclosed` rows answer the second) — operator queries in
  `docs/operations.md`.
- **The old UI** (`?ui=alt`) still calls the deprecated routes; it goes with M17 (frontend contract), before
  the M4 contract answers 410.
- **The Android app's password login** (`docs/design/2026-10-31-unified-ui/shared/inventory.md` §3.8:
  `POST /auth/login` → `GET /auth/apikey` → `GET /auth/me`, keeping only the key) — a first-party client
  outside this repository that reads the deprecated GET. Since this change it stores an empty key for every
  account registered from 2026-11-25, for every account whose legacy key was revoked or rotated, and for
  everyone from the cutoff; its "Key einfügen" way works (README says so). Trigger: the app must create its
  key with `POST /auth/apikeys` (session JWT) **before the M4.4 contract answers 410, at the latest
  2027-01-15**; the contract change checks that a released app version does. Rejected alternative: a GET that
  mints a show-once key for a session caller without one — a GET with a side effect that hands out a secret
  is what this change removes, and the old UI's GET on every page load would rotate a user's working key.
- **The container tier** — `register_user` now creates its key through `POST /auth/apikeys`; CI's amd64
  container tier is its first run (`RISK-TEST-001`).
- **`SHIM-SEC-006` expires today (2026-11-25)** — outside this package; it carries the new keys too.
  `RULE-SEC-002` will fail the gate from tomorrow unless it is removed or re-approved. Flagged, not touched.
