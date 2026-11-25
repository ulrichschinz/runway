# backend/AGENTS.md — scoped contract

Refines the root [`AGENTS.md`](../AGENTS.md) for this unit. It may not weaken a root rule;
`RULE-DOC-003` fails the build if it tries.

## Layers

`be/app` (assembly) → `be/routers` → `be/services` → `be/adapters/{db,task}` → `be/leaves`,
with `be/di` providing what routers inject. Declared in `architecture.toml`, enforced by
`tools/checks/boundaries.sh`.

**Only `be/adapters/task` runs the Taskwarrior subprocess.** A router reaching it directly
skips the validation in `be/services` — that was a real violation until Step 8, and it is
now a gate failure.

**Only `be/adapters/db` opens a database connection.** That unit holds two files: `database.py`,
which owns every connection, and `audit.py`, which writes the audit log through one. `audit.py`
is there rather than in `be/leaves` because a leaf may depend on nothing and so could not open
anything, and `be/di` — where the credential shape is known — may only reach `be/adapters/db`.

## Tests

Two tiers, split at `task_runner._run` (ADR 0006):

- `backend/tests/unit` — Taskwarrior faked at that seam. Everything above it runs for
  real: argv construction, validation, routing, error mapping. No binary, no Docker.
- `backend/tests/container` — the real binary, in `backend/Dockerfile.test`. Urgency,
  storage format, and **cross-tenant isolation**, which rests entirely on three
  environment variables handed to a subprocess.

These are **characterization** tests: they pin current behaviour *including its defects*.
Six defects are asserted as-is and labelled in place with the step that will change them.
A test failing after an intentional change is the point.

Coverage floor is a ratchet, not a target — raise it, never lower it to fit a change.

## Things that will surprise you

- `fastapi-mcp` turns a route into an MCP tool **named after its operation id** (handler
  function, path, method) — but only if the router's tag is on the allowlist in `main.py`
  (`tasks`, `gtd`, `projects`, `inbox`, plus `health` and `me`; ADR 0037). Auth and admin
  routes are REST-only. Renaming the Python function of an exposed route is a breaking
  public-surface change.
- Schema migrations are `ALTER TABLE` statements in `init_db()`, run on every start. Only
  "duplicate column name" passes silently — that is the re-run path. Every other database
  error is logged at ERROR and the boot continues, so a failed migration is visible but not
  fatal; the database can still be left half-migrated (`WAIVER-OPS-001`, resolved).
- There is a **second** SQLite file. `DATA_ROOT/audit.db` holds the audit log, under the only
  directory either compose file bind-mounts — anywhere else in the container it would be
  deleted by the next deploy. `users.db` alone is no longer a complete backup.
- An audit write **never** fails a request: it catches its own error and logs at `ERROR`. So a
  missing row is not the same as a missing event.
- Password hashing runs at **reduced, test-only parameters** (`tests/conftest.py`): Argon2id at
  t=1/8 KiB, bcrypt at cost 4, and no 7-day soak, so a fresh test database writes Argon2id.
  Exactly one test hashes at the production parameters; none measures their latency
  (`RISK-TEST-003`). Every login does one Argon2id and one bcrypt operation on purpose — the
  uniform work that keeps an unknown account from being faster (brief 0067).
- The **login limiter is module state** (`app/rate_limit.py`) and outlives a TestClient;
  `tests/conftest.py` resets it around every test. Every TestClient request comes from the same
  source (`testclient`), so a test that sends more than `LOGIN_SOURCE_RATE_LIMIT` (30) failed
  logins meets the source tier, not the account one — raise it in the test when that is not the
  point (brief 0069). A wrong `current_password` in `PUT /auth/password` spends the same budget.
  An `httpx.ASGITransport` peer of `127.0.0.1` or a private address with `TRUSTED_PROXIES` empty
  has no source tier at all; use a documentation address (`203.0.113.x`) to exercise it.
- **API keys are hashes and shown once** (brief 0070, ADR 0044 Decision 6). A new account has no key;
  `tests/conftest.py::register_user` creates one through `POST /auth/apikeys` with the session, the
  way the settings page does. Creating and revoking a key refuse an API key as the credential (403),
  so a test that does either needs the JWT. A legacy (pre-2026-11) key exists only in a database
  written in the old shape — `test_api_keys.py::_write_pre_m4_database` — and is refused once
  `API_KEY_LEGACY_CUTOFF` is set to a past date; the setting may only move the date earlier.
- **MCP is stateless, budgeted and bound** (brief 0071, ADR 0045, `app/mcp_gate.py`). No session id is
  issued; each POST gets its own transport. `mcp_gate` keeps module state (budget, counters) — reset it
  with `mcp_gate.reset_all()` in a test that measures it. A tool call reaches only its own route —
  `mcp_gate.bind_mcp_target` is the app's first dependency on every route and is inert for REST requests.
- **The test suite's `JWT_SECRET` is generated per run** (`tests/conftest.py::TEST_JWT_SECRET`, brief 0072).
  The backend refuses at boot every signing key published in this repository, and
  `test_jwt_hardening.py` scans the repository's text for `JWT_SECRET` literals — a test that writes a
  fixed key down fails there. Tokens are PyJWT, HS256 only (`config.JWT_SIGNING_ALGORITHM`, ADR 0046);
  `settings.jwt_algorithm` chooses nothing.
