# Change Impact Brief 0067 — Passwords are hashed with Argon2id

| Field | Value |
|---|---|
| **Requested outcome** | Finding **SEC-006** (audit run `20261118T131510Z-claude`, upheld by the Codex review of 2026-11-24): passwords were hashed with bcrypt through passlib, which uses only the first 72 UTF-8 bytes, so two passwords with the same 72-byte prefix authenticated interchangeably; no password field and no request body had a size limit. Ordered by Uli on **2026-11-24** as milestone M2.2 of the security remediation plan (decision gate D2: Argon2id with measured server parameters and rehash-on-login). Closing criterion (plan §5): Argon2id, byte and body limits, safe legacy handling, the 72-byte test. |
| **Owning unit** | `be/leaves` — `backend/app/auth.py` (the password policy, Argon2id, legacy bcrypt verification, uniform work), `backend/app/models.py` (byte-bounded password fields, `Token.password_change_required`), `backend/app/middleware.py` (the request-body limit). `be/adapters/db` — `backend/app/database.py` (the `password_kdf_expand_at` row, the KDF phase, `rehash_password`), `backend/app/audit.py` (one event, `auth.password.rehashed`). `be/routers` — `backend/app/routers/auth.py` (login, register, password change). `be/app` — `backend/app/main.py` (mounts the body limit). `fe/shared` — `frontend/src/shared/passwordPolicy.js` (new), `frontend/src/shared/settingsRules.js`, the message catalogues. `fe/identity` — `frontend/src/stores/auth.js`, `frontend/src/identity/useAccount.js`, `frontend/src/identity/LoginPage.vue`, `frontend/src/identity/SettingsPage.vue`, `frontend/src/views/LoginView.vue`, `frontend/src/views/SettingsView.vue`. `ops` — `backend/requirements.txt` and both locks (passlib out, argon2-cffi in), `frontend/nginx.conf` (a body limit on `/api/auth/`), `ops/surfaces/openapi.json`, `rules/shims.yaml` (`SHIM-SEC-009`), `rules/ledger.yaml` (risk statements whose re-open triggers this change fires). `docs` — this brief, ADR 0044 (new section), `docs/security.md`, `docs/threat-model.md`, `docs/operations.md`, `README.md`, `backend/AGENTS.md`. `tests`. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §2–§5 (REST through the migration pattern; SQLite schema forward-only and additive; locks regenerated, never hand-edited); [`backend/AGENTS.md`](../../backend/AGENTS.md) (only `be/adapters/db` opens a connection); [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (pure rules in `fe/shared`, tested). No gate rule is added or changed, so the META-RULE is not engaged. |
| **Governed by** | **Amended:** [ADR 0044 — Credential lifecycle: JWT, password and API key](../adr/0044-credential-lifecycle-jwt-password-and-api-key.md), new Decision 5. Respected: [ADR 0021](../adr/0021-supply-chain-pinning.md) and [ADR 0034](../adr/0034-the-lock-must-match-the-intent.md) (the lock workflow), [ADR 0037](../adr/0037-the-mcp-surface-is-an-allowlist.md) (auth routes are REST-only), [ADR 0024](../adr/0024-structured-logging.md) (value-shape redaction). |
| **Rule IDs introduced** | None. Shim **`SHIM-SEC-009`** — bcrypt hashes from before this change are still verified, expiring 2027-04-30 (`RULE-SEC-002` enforces the date). |
| **Entry points** | `POST /auth/login`, `POST /auth/register`, `PUT /auth/password`; the request-body limit sits in front of every route and `/mcp`. The boot path `init_db()`. |
| **Affected public surfaces** | **REST/OpenAPI — changed, additive and restrictive:** the three password-carrying bodies declare `maxLength: 1024` and say the byte rule in their description; `Token` gains `password_change_required` (boolean, default false). A password outside the rule is **422** before any hashing or database query; a body over the limit is **413** (16 KiB on `/auth/*`, 1 MiB elsewhere — the nginx default the SPA path already had). `ops/surfaces/openapi.json` updated. **MCP tools — unchanged** (27; the auth routes are REST-only, `/me` is untouched). **DB schema — unchanged** (one `site_settings` row, no column). **Env vars — none.** **SPA** routes and `localStorage` keys unchanged (the login page passes `?password=change` to `/settings`, a query, not a route). |
| **Known dependents** | From `./run impact` (index `current`, revision `85dec7f4fe71`, 1723 nodes / 2716 edges): `auth.py` → `dependencies.py`, `routers/auth.py` → every router and `main.py`; `models.py` and `database.py` reach every surface; `middleware.py` → `main.py`; `routers/auth.py` → `main.py`. `frontend/nginx.conf` is `ops`, no import edges (`BLIND-NGINX-001`: templated at start). Frontend: `stores/auth.js` and `useAccount.js` → the identity pages; `settingsRules.js` → `useAccount.js`. |
| **Uncertain / dynamic areas** | `BLIND-TEST-001` — routers are exercised through the TestClient only. `BLIND-NGINX-001` — the effective nginx configuration is the templated one; the checked-in text is what is tested. The **target hardware** for the Argon2id parameters is the production host, which this repository cannot see; the parameters are measured here and the measurement on the host is a deferred operator step. Whether any stored password is 72 bytes or longer is unknowable from a bcrypt hash; the design does not need to know. |
| **Analogous implementations** | `SHIM-SEC-008` / brief 0066: a date-driven switch anchored on the first boot of the image, in `site_settings`, failing closed when the row is missing. `replace_password`: a compare-and-swap on the stored hash. `conftest.cheap_password_hashing`: the reduced work factor in tests. |
| **Delivery Pattern** | **Security or Operability Change** (failure scenario, control, adversarial red test first) **and Public-Surface or Data Migration** (expand → migrate → switch → contract) for the stored hashes and the REST bodies. |
| **Required tests** | Unit: byte limits and the policy (`test_password_kdf.py`), KDF selection, legacy verification against hashes **passlib itself produced**, uniform work per login, production parameters exercised once. ASGI/REST: the 72-byte pair, 422 before KDF/DB, 413 before routing (declared and chunked), uniform login failures, rehash-on-login, the ambiguous legacy case before and after its window. DB integration: the phase row written once, the rehash compare-and-swap does not overwrite a concurrent change or bump `auth_version`. Parallel: login rehash racing a password change. Frontend pure logic: byte counting, the password rule, the 422 mapping, the login flag. Container: not applicable — no Taskwarrior path changes; the existing suite runs. |
| **Intended scope** | Expand, the date-driven switch and the rehash migration. **Not** in scope: the login budget (M3.2, REV-003), uniform limits on non-password fields (M8, `RISK-SEC-004`), the contract step (removing bcrypt), any production action. |
| **Base revision** | `85dec7f` (`security/m2-1-auth-version`) |

## Failure scenario

1. **The 72-byte alias.** Alice registers with an 80-byte passphrase. Mallory has watched or guessed its
   first 72 bytes (a passphrase built from a long shared prefix, a password manager's long generated
   string with a known structure). Mallory logs in with the prefix plus anything: bcrypt never saw byte
   73, so she is Alice. Reproduced at `85dec7f` by `TestTheSeventyTwoBytePair`.
2. **Unbounded input.** A client posts a 10 MB password to `/auth/login` or `/auth/register` directly on
   the backend (a peer on the shared Docker network, `review.md` operational question 3): the whole body
   is read and parsed, and passlib hashes it. Nothing refused it before work.
3. **The enumeration timing.** An unknown username returned without any hash work, a known one after a
   bcrypt verify: the response time said whether an account exists, the very oracle the identical 401
   text and the uniform throttle were written to avoid.
4. **A NUL byte.** passlib refuses a password with a NUL byte by raising — `/auth/login` answered 500 for
   it, a different answer from 401.

## Control

1. **Policy in UTF-8 bytes** (`auth.py`, `models.py`): every password field at most **1024 bytes**; a new
   password (register, change) at least **8 bytes**. Pydantic refuses with 422 before the handler runs —
   no hash, no query. Login keeps no minimum, so an existing short password still logs in.
2. **Body limit** at the earliest edge the repository controls: an ASGI middleware outermost after the
   request id refuses a declared `Content-Length` over the limit without reading it and stops reading a
   chunked body at the limit — **16 KiB** for `/auth/*`, **1 MiB** elsewhere; and nginx gets the same
   16 KiB on `/api/auth/` (its 1 MiB default already covered the rest).
3. **Argon2id** through `argon2-cffi` (`PasswordHasher`, type ID), with parameters measured on this host
   against a documented budget (Results). passlib is removed; legacy bcrypt hashes are verified by the
   `bcrypt` package directly, with the 72-byte truncation made explicit.
4. **Rehash-on-login**: an exact bcrypt match (input of **71 bytes or fewer**, no NUL — bcrypt then saw
   all of it) is rehashed to Argon2id by a compare-and-swap on the old hash, without touching
   `auth_version`. An Argon2id hash with outdated parameters is rehashed the same way.
5. **The ambiguous case** (bcrypt hash, input of 72 bytes or more): bcrypt cannot tell the real password
   from its prefix plus anything, so the input is **never** written as the new hash. During a window the
   login still succeeds and the response says `password_change_required: true`; the SPA sends the user to
   Einstellungen. After the window it is refused (401) and the account needs the operator reset in
   `docs/operations.md`.
6. **Uniform work**: every login runs exactly one Argon2id verification and — while bcrypt is still
   accepted — one bcrypt check at the production cost, against the stored hash where it is of that kind
   and against a dummy otherwise. An unknown account, a wrong password, a bcrypt account and an Argon2id
   account cost the same; the answer is the same 401.
7. NUL bytes and any other malformed input are a 401, never a 500.

## Expand → migrate → switch → contract

| Step | What | State in this change |
|---|---|---|
| Expand | Verify both schemes; write `password_kdf_expand_at` on the first boot; policy, body limit and uniform work apply at once. New and changed passwords are **still bcrypt for 7 days**, so the previous image can still verify every hash if this one is rolled back. | **Done, deploys on merge.** |
| Switch 1 | From `expand_at` + 7 days, new and changed passwords are Argon2id, and rehash-on-login starts. | **Automatic, by date** — no deploy, no setting. A missing row fails closed (Argon2id). |
| Migrate | Every exact bcrypt account is rehashed on its next login; ambiguous ones are told to change the password. | Runs from Switch 1, per login. |
| Switch 2 | From `expand_at` + 67 days (60 days after Switch 1) the ambiguous case is refused. | **Automatic, by date.** A missing row fails closed (refused). |
| Contract | Remove bcrypt verification, the dummy, the row and the `bcrypt` dependency. | **Deferred**, own change, when no `$2…` hash is left in `users` (the rest reset by the operator); `SHIM-SEC-009` expires 2027-04-30. |

Rollback: within the first 7 days the previous image reads every hash this one wrote. After Switch 1 an
Argon2id hash cannot be verified by the previous image (passlib raises on an unknown hash: login 500 for
those accounts) — roll forward or reset those accounts. The rollback target after Switch 1 is this image
or later (`docs/operations.md`).

## Test evidence

Every result below was run on 2026-11-24/25 on an arm64 Mac. The red column is the new tests against the
unchanged production code at `85dec7f` (passlib still installed), before any line of the control was written.

| Tier | What | Before the control (`85dec7f`) | After |
|---|---|---|---|
| ASGI/REST | `TestTheSeventyTwoBytePair` — register with `x*72 + "-the-real-suffix"`, log in with `x*72 + "-anything-else"` and with the bare prefix | **red: `assert 200 == 401`** — the other suffix logged in | 401 for both; the two hashes are different Argon2id strings and neither verifies the other's password |
| ASGI/REST | `TestPasswordLimitsInBytes` — 1025 bytes, 513 × `ä`, 7 bytes, the change route, an oversized login that must not reach `check_password` | **red: `assert 201 == 422`** — a 1025-byte password was registered | 422 before any hash or query; `ääää` (8 bytes) accepted; login keeps no minimum |
| ASGI/REST | `TestTheBodyLimit` — a declared 20 KB and a chunked 41 KB `/auth/login` body; 1 MiB + 10 on `/tasks` | **red: `assert 401 == 413`** | 413 with an `X-Request-Id`; a 30 KB description still accepted |
| ASGI/REST | `TestNulBytes` — a NUL byte against a legacy account | **red: `PasswordValueError` — a 500** | 401 |
| Unit, uniform work | `TestUniformWork` — KDF calls per failed login for an unknown, a bcrypt and an Argon2id account | **red** (precondition: no Argon2id at all); a probe at `85dec7f` counted **0 hash calls for an unknown account, 1 for a known one** — the timing oracle | `["argon2", "bcrypt"]` for all three; the same `401 {"detail":"Invalid credentials"}` |
| Migration | `TestRehashOnLogin` — passlib's own vectors (`short`, 71 bytes) log in, are rehashed once to Argon2id, `auth_version` unchanged, old token still valid, `auth.password.rehashed` audited | **red** (hash stays `$2b$`) | green |
| Migration | `TestTheAmbiguousLegacyCase` — passlib vectors of 72 bytes, 83 ASCII, 40 × `ä`, 20 × 🔑: inside the window 200 with `password_change_required`, hash unchanged; a forged suffix never written; after day 67 401; exact accounts still migrate; the change route is the way out; a missing row fails closed | **red** (no flag; no window) | green |
| Migration | `TestTheSoak` — real 7-day soak: new hashes are bcrypt that bcrypt itself verifies, nothing rehashed; after it Argon2id | **error** (no `KDF_SOAK`) | green |
| Unit | `TestKdfUnit` — every passlib vector verifies (`rehash` iff < 72 bytes), the cost-12 vector, the 71-byte vector refuses a suffix, phase boundaries, `password_problem` table (incl. a lone surrogate), malformed hashes never verify (a truncated bcrypt hash made the Rust binding **panic** — a `BaseException` — found here and guarded by a shape check), constants | **red** (no such API) | green |
| Unit, production parameters | `test_one_hash_at_production_parameters` — one hash and verify at t=3/64 MiB; the test hasher is genuinely reduced and flags a production hash for rehash; OWASP floor | **red** | green (the only test at production cost) |
| DB integration / parallel | `TestRehashCompareAndSwap` — the timeline row written once across two `init_db`; `rehash_password` does not overwrite a changed hash; a login held between verification and rehash while the hash is changed underneath leaves the owner's new hash in place | **red** | green |
| Recovery | `TestTheOperatorReset` — the runbook's statement recovers an account refused after day 67 and ends its old session | — (added after the control, with the runbook) | green |
| Characterization | 15 existing tests registered with `pw`, `x`, `other`, `new` (under 8 bytes) | — | updated to synthetic passwords of 8+ bytes: the intended behaviour change, not a weakened test. One consequence pinned: a short password on a **closed** registration is now 422, not 403 (validation runs before the handler) |
| Logging | `test_a_password_hash_is_redacted_under_a_neutral_name[bcrypt, argon2id]` | the Argon2id case is new | green; the filter learned the PHC shape (`RISK-OPS-005`'s trigger: a new credential format) |
| Frontend pure logic | `passwordPolicy.test.js` (bytes, rule, landing after login), `settingsRules.test.js` (the rule on the new password), `useAccount.test.js` (422 → `set.pw.rule`) | **red**: module missing; the rule test; `expected { error: 'set.failed' } to deeply equal { error: 'set.pw.rule' }` | green |
| Config pin | `nginxConf.test.js` — `/api/auth/` has `client_max_body_size 16k` and proxies to `/auth/` | **1 red** against the old `nginx.conf` | green. **A text pin, not a proxy test** (`BLIND-NGINX-001`; no nginx or Docker on this host) |
| Container (host Taskwarrior 3.5.0) | whole `tests/container` suite — no Taskwarrior path changed | — | **94 passed** (host binary, not the image) |

In all 53 of the first 60 new backend tests were red before the control; the 7 green ones assert what
already held (a normal login works, a wrong password on a legacy account changes nothing, an old token
survives, an unknown account with a NUL byte is 401, all failures already had the same text, a short
password reaches verification on login, the normal-size body passes).

## Results

- **Argon2id parameters:** t=3, m=65536 KiB, p=1, hash 32 bytes, salt 16. Measured on the development
  host (Apple M5, 2026-11-24, median of 15): t=2/19 MiB 12.6 ms, t=1/46 MiB 16.2 ms, t=2/64 MiB 49.0 ms,
  **t=3/64 MiB 74.9 ms**, t=3/64 MiB/p=4 21.4 ms, t=4/64 MiB 100.7 ms; bcrypt cost 12 172.8 ms. Budget:
  ≤ 250 ms and ≤ 64 MiB per verification on the deploy host, one at a time on the event loop. The deploy
  host is **not** measured (deferred).
- **Dependencies (lock workflow, `./run lock`):** `passlib` removed; `argon2-cffi==25.1.0` (2025-06-03, MIT)
  and `argon2-cffi-bindings==25.1.0` (2025-07-30, MIT) added — the binding pinned in the intent because
  the resolver chose 26.2.0, 11 days old. `cffi`/`pycparser` were already in the lock. `bcrypt==4.0.1`
  kept for legacy verification only. The local venv was synced from `requirements-dev.lock`.
- `./run surfaces`: **only `openapi.json` moved** — `maxLength`/description on the four password fields
  and `Token.password_change_required`. The 27 MCP tools, the DB schema, the SPA snapshot and the env-var
  table are unchanged.
- Unit tier **951 passed**; frontend **764 passed**; container suite against the host binary **94 passed**.
- `make check`: **GREEN** (29 s), after `make fix` rebuilt the index (revision `85dec7f4fe71`, 1744 nodes /
  2774 edges). One earlier run in this session reported foreign failures (another workstream's brief and decision record, an
  `edge-headers` step) that exist in none of this branch's files; sibling workflow worktrees live under
  `.claude/worktrees/` in this checkout. Re-run after `make fix`: green.
- `make verify`: first run on `14316e9` in a clean, bootstrapped detached worktree was **RED** — the secret
  scan (`RULE-DEP-003`) read a quoted placeholder hash in a test's SQL as a committed
  credential (the main checkout's `make check` had not seen it: the file was untracked there, and the scan
  reads tracked files), and `RULE-GATE-002` failed with it. Fixed in `8732c06` by binding the value as a
  parameter, no suppression. Re-run on `8732c06`: **GREEN** (218 s): unit 951 passed, frontend 764 passed,
  57 fixture arms passed, 0 failed, 47 of 50 executable rules proven able to fail (unchanged — no rule
  added). **`py-test-container` was skipped** (arm64, `RISK-TEST-001`): the 94 container results above are
  from the host's Taskwarrior 3.5.0, not from the image, and have to be observed in CI on amd64.
  **Branch protection was skipped** (cannot resolve the repository, `RISK-GOV-002`).
 **SEC-006** — Argon2id for new and changed
  passwords (after the 7-day soak), byte limits and a body limit before any work, safe legacy handling
  (exact → rehash; ambiguous → never rehashed, flagged, refused after the window), and the 72-byte test.
  During the 7-day soak new passwords are still bcrypt, and since the review fixes a new password of
  72 bytes or more is refused in that week (R2), so the alias is never created new.
- Registers: `RISK-DEP-003` narrowed (passlib gone, bcrypt verification-only), `RISK-TEST-003` narrowed
  (one test at production parameters; latency still unmeasured), `RISK-OPS-005` (the Argon2id shape is
  redacted), `RISK-SEC-004` narrowed (password fields and bodies bounded; other fields still M8). None
  removed. New shim `SHIM-SEC-009`.
- Noticed, not in scope: a lone UTF-16 surrogate in **any** JSON string field makes FastAPI's own 422
  renderer fail with 500 (it cannot encode the echoed input); pydantic's 422 also echoes the rejected
  input, so an over-long password is echoed back to its sender. Both belong to M8's uniform request
  handling. `SHIM-SEC-006` expired on 2026-11-25 by its own date; this change does not touch it.

## Review fixes (2026-11-25)

Two independent reviews of `f2cef64` found five real defects. Each fix below got a test first, observed
red against `f2cef64`'s code, before the fix was written. **Base revision of the fixes:** `f2cef64`.

| # | Finding | Failure scenario | Control |
|---|---|---|---|
| R1 | The "oversized login never reaches `check_password`" test patched `app.auth.check_password`, a name the router does not use (it imports the function directly) | A version that hashes first and refuses late passes the test: the acceptance criterion "überlange Requests werden vor KDF/DB-Arbeit abgewiesen" rested on a pseudo-proof | The test patches the name the router calls (`app.routers.auth.check_password`) **and** the database entry points the handler would reach (`get_db`'s connection is never opened); observed red against a router that checks the length after hashing |
| R2 | During the 7-day soak a new or changed password of **72 bytes or more** was stored as a truncated bcrypt hash | Bob registers `x*72 + "-real"` on day 2; `x*72 + "-guess"` logs in as Bob — the 72-byte alias, created new by this change; a user told to change a long password who picks another long one is flagged again and locked out after Switch 2 | While the soak writer is active, a new password of 72 bytes or more is refused with **422** before any work (`auth.new_password_problem`). bcrypt stores a shorter password without ambiguity, so the soak keeps its rollback property; from Switch 1 the limit is 1024 again. The plan's acceptance (no two passwords with the same 72-byte prefix are interchangeable) now holds in every phase |
| R3 | A new password with a **NUL byte** was accepted and, during the soak, stored as bcrypt that `check_password` never accepts | The account cannot log in with the password it just set, and cannot change it | `password_problem(new=True)` refuses NUL (422) in every phase; passlib refused it before this change, so nothing that worked stops working |
| R4 | The **operator reset** in `docs/operations.md` could not run: the script came through stdin (`python - <<PY`) and then called `input()`/`getpass` on the same, exhausted stdin; its test ran only a copy of the SQL; it always wrote Argon2id, also inside the soak | The recovery path the plan requires for refused ≥72-byte accounts fails with `EOFError` when the operator needs it | A module in the image, `python -m app.services.password_reset <account>`, reads the temporary password twice with `getpass` from the terminal, applies the same policy as a password change (including R2), hashes with `hash_for(phase)`, writes hash and `auth_version + 1` in one statement through `database.reset_password`, and records `auth.password.changed` with actor `operator`. The test calls that entry point |
| R5 | `python -m app.auth` timed one Argon2id verification, but every login also does a cost-12 bcrypt check (stored or dummy) — about 3× the printed number | The operator's pre-Switch-1 check passes on a host where a login costs far more than the budget | `measure()` times a whole failed `check_password` (both prepared dummies, unknown account) as well as each part, and compares against two documented budgets: **Argon2id ≤ 250 ms per verification** (the parameter choice, unchanged) and **≤ 500 ms per login** until the contract step removes bcrypt (new: there was no per-login figure before) |

**Red before the fix** (all on 2026-11-25, against `f2cef64`'s production code):

- R1: the corrected `test_an_oversized_login_is_refused_before_any_hash_or_query` was run against a
  mutation that validates late (no byte rule on `UserLogin`, a length check in the router *after*
  `check_password`): **red** (`AssertionError: password work ran for an oversized password`). The old
  test, against the same mutation: **passed** — confirming it proved nothing. Against the real code the
  new test is green: no SQL statement runs for an oversized login.
- R2: `TestNoAliasDuringTheSoak` (real 7-day soak) — register / change with `x*72 + suffix`: **red**
  (`assert 201 == 422`, `assert 200 == 422`). The 71-byte case, the post-soak case and the
  "way out with a shorter password" case were green already and pin that the fix does not overreach.
- R3: `TestNulInANewPassword`: **red** (`assert 201 == 422`; the policy returned None).
- R4: `TestTheOperatorResetEntryPoint`: **red** (`ImportError: cannot import name 'password_reset'`; the
  runbook still had `python - <<'PY'`). It replaces `TestTheOperatorReset`, which ran only a copy of the
  SQL.
- R5: `TestTheMeasurement`: **red** (`measure()` never called `check_password`; no per-login figure).
- After the fixes, `python -m app.auth` on the development host (Apple M5) prints: Argon2id verify
  78.5 ms (budget 250), bcrypt cost-12 check 172.7 ms, **per login 247.8 ms (budget 500) — within
  budget**. The deploy host is still unmeasured (deferred).
- `ops/surfaces/openapi.json`: only the description of the two new-password fields moved (it now names
  the NUL rule and the soak's 72-byte limit). The SPA's German message for a 422 names the whole rule;
  the two older views show the server's sentence.

- Gate after the fixes: `make check` on `7357a3f` was **RED** once — `RULE-ARCH-003`, the new CLI raised
  the fan-in of `database.py`, `audit.py` and `auth.py`; recorded with reasons in `474b325`, then **GREEN**
  (unit 968 passed, frontend 764 passed). `make verify` on `474b325` in a clean, bootstrapped detached
  worktree: **GREEN** (216 s of 600 s) — 57 fixture arms passed, 0 failed; 47 of 50 executable rules proven
  able to fail (no rule added); live branch protection matched `ops/github/ruleset.json`.
  **`py-test-container` was skipped** (arm64, `RISK-TEST-001`) and has to be observed in CI on amd64.

Minor, documented, not coded: lowering `ARGON2_TIME_COST` **after** Switch 1 makes an account whose hash
is still at the old parameters measurably slower to refuse than an unknown one (a hash-age timing oracle)
until it logs in once. The runbook now makes it a rule: change the parameters only before Switch 1, when no
Argon2id hash exists yet; a later change is recorded here and in the threat model as a residual until every
hash is rehashed or reset.

Units touched by the fixes: `be/leaves` (`auth.py`), `be/routers` (`routers/auth.py`), `be/adapters/db`
(`database.py`: `reset_password`), `be/services` (`services/password_reset.py`, new — added to the unit's
paths in `architecture.toml`; its imports raise the recorded fan-in of `database.py` 8→9 and `audit.py`
6→7 and record `auth.py` at 5 in `ops/structure-baseline.toml`, each with its reason, as brief 0065 did for
the storage migration CLI — both files need owner approval, `RISK-GOV-001`), `fe/shared` (message text),
`docs`, `tests`. Public surfaces: the REST bodies are unchanged (the soak refusal is a 422 in FastAPI's own
validation shape, which the OpenAPI document already declares); MCP, DB schema, env vars, SPA unchanged.

## Deferred, with triggers

| Step | Trigger / date | Owner |
|---|---|---|
| Measure on the deploy host (`docker compose exec backend python -m app.auth`), lower `ARGON2_TIME_COST` if Argon2id is over 250 ms or a login over 500 ms | after the first deploy, before Switch 1 (first boot + 7 days) | operator |
| Post-deploy check with a synthetic account: 7-byte password 422, 20 KB login 413, after Switch 1 its hash starts `$argon2id$` | first deploy; again after day 7 | maintainer |
| Tell the accounts listed by the "who must change a long password" query (`docs/operations.md`) | from Switch 1 until Switch 2 (first boot + 67 days) | operator |
| Operator reset (`python -m app.services.password_reset <account>`) for accounts refused after Switch 2 | on request, after out-of-band confirmation | operator |
| Contract: remove bcrypt verification, the dummy, the soak writer, `password_kdf_expand_at` and the `bcrypt` dependency | no `$2…` hash left in `users` and day 67 passed; before 2027-04-30 (`SHIM-SEC-009`) | maintainer |
| nginx limit observed on the real proxy and the TLS terminator (only the text is tested here) | first deploy | operator |
| Login budget before KDF work (REV-003), uniform limits on other fields (`RISK-SEC-004`), the 422 surrogate/echo issue | M3.2, M8 | maintainer |
| Owner sign-off on `SHIM-SEC-009`, the ledger edits and the `architecture.toml` path for `services/password_reset.py` — written by the implementing agent (`RISK-GOV-001`) | before merge | maintainer |
