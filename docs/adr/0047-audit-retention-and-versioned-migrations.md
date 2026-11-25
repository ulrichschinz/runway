# ADR 0047 — Audit retention and versioned migrations

- **Date:** 2026-11-25
- **Status:** Accepted
- **Scope:** `backend/app/database.py` (versioned migrations, the `users` rebuild, the schema fingerprint),
  `backend/app/audit.py` (the size measurement), `backend/app/models.py` (field limits),
  `tools/checks/route_guards.py`, `tools/surfaces.py`, `.github/workflows/deploy.yml`
- **Brief:** [0073](../briefs/0073-bounded-inputs-a-versioned-schema-and-a-deploy-that-proves-itself.md)
- **Amends:** [ADR 0025](0025-narrowing-the-migration-except.md) (the additive loop is frozen),
  [ADR 0026](0026-the-audit-log.md) (the file is measured), [ADR 0017](0017-admin-bootstrap-and-route-guards.md)
  (the guard declaration covers every served route), [ADR 0032](0032-the-deploy-mechanism-correction.md)
  (the host's compose file is read after a deploy)

Milestone **M8** of the security remediation plan ("Kapazität, Audit und DB-Integrität"). The plan names
this record "0046"; that number went to the JWT library (brief 0072), so it is 0047. It records gate
**D7** ("Frist und Größenbudget vor dem ersten Löschjob festlegen") as *not yet taken* and says what is
built until it is.

## Context

- `audit.db` grows by one row per authenticated request (~150 bytes) and nothing measured it
  (`RISK-OPS-006`). It shares a partition with `users.db` and the Taskwarrior stores. `SHIM-SEC-006`'s
  removal and every credential revocation are decided from its rows.
- `init_db()` applies additive `ALTER TABLE` statements on every start (ADR 0025). That loop cannot add a
  `CHECK` or `UNIQUE`, cannot reorder columns, and does not know whether a one-time step already ran. A
  fresh database and a migrated one therefore differ (`RISK-SURF-001`: `api_key UNIQUE` and the column
  order), and the role `CHECK` has had no home (`RISK-SEC-002`). The API-key contract (ADR 0044) needs a
  table rebuild after its cutoff of 2027-01-15.
- `RULE-SEC-001` read one directory; six served routes were declared nowhere (`RISK-SEC-005`).
- The post-deploy check reads the running server but not the host's compose file (`RISK-OPS-002`).
- No request field except the passwords had a length limit (`RISK-SEC-004`).

## Decision 1 — audit retention: measured now, deleted only after D7

**Not decided here, and not decidable by this repository:** how long audit rows must be kept. It has a
legal half (what the operator owes as evidence, what personal data a row holds — the `actor`/`subject`
username) and an operational half (how long `SHIM-SEC-006`'s soak and the credential migrations need their
evidence live). Until the operator decides, **no row is deleted, archived or vacuumed** by anything in this
repository.

Built now: `audit.measure()` stats `audit.db`, `-wal` and `-shm` (no query, no row count), keeps the largest
size ever seen as a high-water mark in a one-row-per-key table `audit_meta` in the same file, and logs
`audit store size` with `audit_db_bytes`, `audit_db_high_water_bytes` and `audit_db_warn_bytes` at INFO, at
WARNING when the size is over `AUDIT_DB_WARN_BYTES` (default 100 MiB — `RISK-OPS-006`'s own re-open trigger).
It runs at boot and hourly in a lifespan task; it never raises.

**What the retention job must respect when it is built** (the input to D7, recorded so the job cannot be
written without it):

1. A retention period in days, set by the operator, and a size budget below the warning threshold.
2. Batched deletion (bounded rows per transaction) of rows older than the period, oldest first, never
   holding the write lock long enough to stall requests.
3. Event classes kept regardless of age until their own evidence period ends: `auth.password.changed`,
   `auth.apikey.created`/`revoked`/`regenerated`/`disclosed`, `admin.role.changed`, `admin.bootstrap`,
   `admin.registration.toggled`, `storage.migrated`/`storage.rolled_back`/`storage.refused`, and every
   `auth.authenticated` row with `auth_shape = 'bearer-api-key'` until `SHIM-SEC-006` is removed.
4. Optional export of what is deleted to an operator-owned archive outside the container, before deletion.
5. `VACUUM` only in a planned window (it rewrites the whole file and needs as much free space again).
6. Its own audit row: how many rows, which period, which classes kept — counts, never contents.

## Decision 2 — versioned migrations after a frozen additive baseline

- `MIGRATIONS` (the additive loop) is **frozen**: it is how every historical database reaches the common
  baseline, called **version 0**. Nothing new is appended to it.
- `VERSIONED_MIGRATIONS` is an ordered tuple of `(version, name, step)`. `init_db()` runs it last, after
  every `CREATE … IF NOT EXISTS`, so each step sees every table. Each pending step runs in **one
  `BEGIN IMMEDIATE` transaction** that also inserts its row into `schema_migrations(version, name,
  applied_at)`; SQLite DDL is transactional, so a step is applied whole or not at all.
- A step that fails is rolled back, logged at ERROR with its version and the reason (never row contents),
  and **stops the chain**; the boot continues at the last applied version (ADR 0025's judgement: a
  retryable failure must not become an outage). The version a database is at is in the `startup complete`
  log line and in `GET /skill`'s `server.schema_version`.
- A step refuses data it cannot carry over unchanged rather than guessing. It may normalise only what every
  reader already treats as equal.
- Rollback: a step must leave a database the **previous image** can boot and serve. That image ignores
  `schema_migrations`; its additive loop sees every column present.

**Version 1 — `users` in one declared shape.** The table is rebuilt into `CREATE_USERS_V1`: the same columns
with the same types and defaults, in the declared order, plus `role TEXT NOT NULL DEFAULT 'user'
CHECK (role IN ('user','admin'))` (`RISK-SEC-002`). `api_key` is plain `TEXT`, as production has it: the
`UNIQUE` only fresh databases had is not relied on by anything (the legacy lookup refuses a hash two rows
share, brief 0070), the column is written by no current code and goes with the API-key contract — so
requiring it would only add a way for the rebuild to fail. Ids are copied as they are and the
AUTOINCREMENT sequence is set to the larger of its old value and the highest id, so a deleted account's id
is never handed out again (rows in `api_keys` and `storage_migrations` refer to ids). Every index and
trigger on the old table is re-created from its stored SQL. `role` NULL or empty becomes `user` — what
`set_role` and every guard already read it as; any other value refuses the step (ERROR, counted, never
named), because only a hand edit on the host can have written it and deciding what it meant is the
operator's.

**Version 2 — the API-key contract (deferred).** Drop `users.api_key` and `api_key_closed_at` by the same
rebuild, after `API_KEY_LEGACY_CUTOFF` (2027-01-15) and its soak, in its own change (ADR 0044).

`RULE-SURF-005` holds the mechanism to its purpose: the schema `init_db()` builds from an empty file and from
every recorded historical baseline (`backend/tests/fixtures/schema_history/`) must be semantically identical
— columns with types, defaults, `NOT NULL` and keys in order, indexes with their columns, uniqueness and
predicates, `CHECK` clauses, triggers, and the applied version.

## Decision 3 — every served route is classified

`RULE-SEC-001` boots the application and reads `fastapi.routing.iter_route_contexts(app.routes)` — every
route FastAPI serves, with included routers flattened and their prefixes and dependencies applied — instead
of parsing `backend/app/routers/*.py`. A route's guard is read from its resolved dependency tree:
`get_current_admin` anywhere is `admin`, else `get_current_user` is `user`, else `open`. A `Mount` is a
route too. The served OpenAPI paths must be a subset of the inventory. Framework and transport routes are
declared `open` with reasons: `GET /health`, `POST|GET|DELETE /mcp`, `GET /openapi.json`, `GET /docs`,
`GET /docs/oauth2-redirect`, `GET /redoc`.

## Decision 4 — the deploy proves itself

- The image carries `/app/BUILD_ID` (`github.run_id`), written beside `/app/BUILD_COMMIT`.
- `ops/deploy/docker-compose.yml` bind-mounts itself read-only — `./docker-compose.yml:/etc/runway/applied-compose.yml:ro`,
  inside the service directory (`RULE-OPS-003`) — so the container sees the file the host's compose read.
- `GET /skill` (open) reports in `server`: `build`, `compose_sha256` (the baked `/opt/stack/docker-compose.yml`),
  `applied_compose_sha256` (the mounted host file) and `schema_version`. Hashes and a number only: never a
  file, a path on the host or a value from `.env`.
- `verify-deploy` requires: commit and build equal to this run; both compose hashes equal to the SHA-256 of
  `ops/deploy/docker-compose.yml` at this commit; `schema_version` equal to the one `ops/surfaces/db-schema.sql`
  records; and the registry's digest for `:latest` and `:<sha>` equal to the digest `build-and-push` pushed.
- **What stays indirect:** CI cannot ask the host which digest its container runs. The chain is the build id
  (baked only into the image this run pushed) plus the registry digest of the tag the host pulls.

## Decision 5 — field limits

Characters (JSON Schema's `maxLength`), at or above what the SPA, Android, the skill or an agent writes. An
annotation and an inbox note are also bounded in bytes, at the capture clients' own 32 KiB of UTF-8, so a
capture the previous deploy accepted is still accepted (amended after review: the first draft's 8 000
characters refused them). A username is bounded at 256 at login and registration, and the audit store cuts
actor and subject at 256, so no request can grow an audit row to its body's size. The largest Taskwarrior
argument is at most 32 KiB, a quarter of `MAX_ARG_STRLEN`. A refusal is 422 at body
parsing. Stored plan items are read back through an unbounded model, so a plan written before the limits
stays readable. `E2BIG` is `ArgumentTooLong` → 413 from one handler in `app.main`.

## Consequences

- `RISK-SEC-004` narrowed (size bounded, volume not). `RISK-OPS-006` narrowed (measured and warned, not
  bounded) — it closes only with D7 and the retention job. `RISK-SURF-001` and `RISK-SEC-002` are closed in
  this repository by version 1 and `RULE-SURF-005`; in production when `verify-deploy` has seen
  `schema_version` 1. `RISK-SEC-005` narrowed to what the application object does not serve. `RISK-OPS-002`
  narrowed to the indirect digest.
- The SQLite promise in `AGENTS.md` changes from "forward-only, additive" to "forward-only; additive
  baseline, then versioned steps".
- A migration step can now leave the boot at an older version with an ERROR; the version is visible in the
  log and over HTTP, and `verify-deploy` fails on it.
