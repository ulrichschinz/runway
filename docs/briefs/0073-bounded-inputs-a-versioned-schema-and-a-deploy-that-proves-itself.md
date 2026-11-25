# Change Impact Brief 0073 — Bounded inputs, a versioned schema, every route classified, and a deploy that proves itself

| Field | Value |
|---|---|
| **Requested outcome** | Milestone **M8** of the security remediation plan ("Kapazität, Audit und DB-Integrität"), ordered by Uli on 2026-11-24, covering `RISK-SEC-004`, `RISK-OPS-006`, `RISK-SURF-001`, `RISK-SEC-002`, `RISK-SEC-005` and `RISK-OPS-002`. (1) Uniform request-body and field limits for login, task description, annotation, inbox and MCP; over the limit is 413/422, never a Taskwarrior 500. (2) For `audit.db` a metric, a warning threshold and a high-water mark; the retention period is set by the operator/legal decision (gate **D7**) and only then are rows archived/deleted and `VACUUM` planned — security-relevant revocation and migration events must not disappear before their evidence period. (3) A versioned migration mechanism with a schema version and tests for fresh **and** historically migrated databases; only with it the table rebuilds for the API-key contract and, optionally, `CHECK(role IN ('user','admin'))`. (4) The route-guard inventory derived from the running app/OpenAPI instead of globbing `backend/app/routers/*.py`; a new route outside the routers package must turn the negative test red. (5) Post-deploy evidence extended by image digest, commit and the hash of the compose configuration actually applied, without serving secrets or host files. Acceptance (plan M8): synthetic load cannot grow limiter state, the audit file or a single request body without bound; fresh and upgraded schema are semantically equal; every running route has an explicit guard classification. |
| **Owning unit** | `be/leaves` — `backend/app/models.py` (field limits), `backend/app/config.py` (one setting). `be/adapters/task` — `backend/app/services/task_runner.py` (an argument the kernel refuses). `be/services` — `backend/app/services/task_service.py` (re-export). `be/adapters/db` — `backend/app/database.py` (the versioned migrations, the `users` rebuild, the schema fingerprint), `backend/app/audit.py` (the size measurement). `be/app` — `backend/app/main.py` (the 413 handler, the measurement at boot and hourly). `be/routers` — `backend/app/routers/inbox.py` (its body model). `be/feature/skill` — `backend/app/services/skill_service.py`, `backend/app/skill_models.py` (the deploy evidence on `GET /skill`). `ops` — `backend/Dockerfile` (a build id), `ops/deploy/docker-compose.yml` (the applied compose, read-only, and one variable), `.github/workflows/deploy.yml` (digest and evidence checks). `tools` — `tools/checks/route_guards.py`, `tools/surfaces.py`, `tools/fixtures/negative.sh`. `rules` — `rules/route-guards.toml`, `rules/ledger.yaml`. `docs` — this brief, ADR 0047, `README.md`, `AGENTS.md`, `backend/AGENTS.md`, `docs/security.md`, `docs/threat-model.md`, `docs/operations.md`, `docs/task-interface.md`. `tests` — new and changed unit tests, `backend/tests/fixtures/schema_history/`. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 (a database change goes in `database.py`; a gate rule is four places), §4 (layers), §5 (REST/OpenAPI, the SQLite schema and env vars are public surfaces; "Forward-only, additive" for the schema changes its wording here), §6 (ledger and gate configuration are owner-approved; `RISK-GOV-001`), §7 (`RULE-GATE-002`: every rule has a negative fixture), §9 (**the META-RULE is engaged twice**: `RULE-SEC-001` changes its check, and `RULE-SURF-005` is new), §10 (the `RISK-OPS-002` bullet). [`backend/AGENTS.md`](../../backend/AGENTS.md) (tests at the `_run` seam; schema migrations are a "surprise" whose text changes). Rules: `RULE-SEC-001`, `RULE-SURF-001`, `RULE-SURF-002`, `RULE-OPS-003` (the new bind mount must stay inside the service directory), `RULE-HYG-003`, `RULE-DOC-004`. |
| **Governed by** | New: [ADR 0047](../adr/0047-audit-retention-and-versioned-migrations.md) (audit retention and versioned migrations — the plan names it "0046", which brief 0072 took for the JWT library). Amends [ADR 0025](../adr/0025-narrowing-the-migration-except.md) (the additive loop is frozen; new schema changes are versioned), [ADR 0026](../adr/0026-the-audit-log.md) (the size is measured; retention still not decided), [ADR 0017](../adr/0017-admin-bootstrap-and-route-guards.md) (the guard declaration covers every route the app serves), [ADR 0027](../adr/0027-the-threat-model.md) (`RISK-SEC-004`/`RISK-SEC-005` narrowed), [ADR 0032](../adr/0032-the-deploy-mechanism-correction.md) (the host's compose file is now read after a deploy). Respected: [ADR 0044](../adr/0044-credential-lifecycle-jwt-password-and-api-key.md) (the API-key contract waits for its cutoff), [ADR 0045](../adr/0045-mcp-authentication-and-resource-budget.md) (MCP stays stateless; its body is the 1 MiB limit and its tool arguments meet the same models). |
| **Rule IDs introduced** | **`RULE-SURF-005`** (new): the schema `init_db()` produces from an empty file and from every recorded historical baseline MUST be semantically identical. **`RULE-SEC-001`** (changed check): the inventory is every route the booted application serves (`fastapi.routing.iter_route_contexts(app.routes)`), cross-checked against the served OpenAPI paths, with the guard read from the resolved dependency tree — no longer an AST walk over one directory. |
| **Entry points** | Every request with a body: FastAPI's model validation (422) before any handler. Every Taskwarrior call: `task_runner._run` → `subprocess.run` (an `E2BIG` becomes 413 through `main`'s exception handler). Boot: `main.lifespan` → `init_db()` → `apply_versioned_migrations()`, then `audit.measure()`; hourly `audit.measure()` in a lifespan task. `GET /skill` → `skill_service.skill_info()` (the deploy evidence). CI: `deploy.yml` `build-and-push` (digest output) → `verify-deploy`. Gate: `route-guards.sh` → `route_guards.py`; `surfaces.sh` → `tools/surfaces.py`. |
| **Affected public surfaces** | **REST/OpenAPI: input narrowed, output extended.** `maxLength`/`maxItems` appear on request fields that had none (see *Decisions* for the numbers); a request over a limit that used to be accepted is now **422**. `GET /skill`'s `server` object gains four fields (additive). Snapshot `ops/surfaces/openapi.json` regenerated. **MCP tools:** names and count unchanged (27); their input schemas carry the same limits. **DB schema:** `users` is rebuilt once (version 1) into one declared shape — same columns and data, `role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin'))`, `api_key TEXT` without the `UNIQUE` that only fresh databases had; a new table `schema_migrations`; `audit.db` gains `audit_meta`. Snapshot `ops/surfaces/db-schema.sql` regenerated. **Env vars:** one added, `AUDIT_DB_WARN_BYTES`, documented in README (`RULE-SURF-002`) and listed in the deploy compose. **SPA:** unchanged. |
| **Known dependents** | From `./run impact` (index `current`, revision `c6a0070c7d1f`, 1908 nodes / 3202 edges): `models.py` → every router and `task_service.py`, transitively `main.py`, connected to every MCP tool; `task_runner.py` → `task_service.py` → `tasks`, `gtd`, `inbox` routers; `database.py` → `audit.py`, `dependencies.py`, `main.py`, four routers, `password_reset.py`, `storage_migration.py`; `audit.py` → seven modules; `skill_service.py`/`skill_models.py` → `routers/skill.py`, `main.py`. Protected by every TestClient suite through `main.py`. |
| **Uncertain / dynamic areas** | **Production data the repository cannot see.** The `users` rebuild refuses to run, and the boot continues at version 0 with an ERROR line, if any row's `role` is neither `user`, `admin`, NULL nor empty — such a row could only have been written by hand on the host. Whether production has one is a production read (deferred). **The host deploy script** (`/opt/scripts/deploy.sh`) is outside this repository; the compose bind mount of `./docker-compose.yml` assumes it runs compose from the service directory, which ADR 0032 records it does. **The image digest is evidenced indirectly**: CI has no host access, so the running container cannot be asked for its digest; the chain is "the server reports the build id baked only into the image this run pushed" + "the tag the host pulls resolves at the registry to the digest this run built". `BLIND-OPS-001`, `BLIND-TEST-001` (routers are protected import-derived). |
| **Analogous implementations** | `admin_preserving_write` (one `BEGIN IMMEDIATE` transaction, rolled back whole); `migrate_legacy_api_keys` (a boot-time migration that logs counts only); `BodyLimitMiddleware` (413 before any work); the `verify-deploy` job (CI asks the running server about itself); `tools/surfaces.py` (runtime observation over declaration, which is exactly what `RULE-SEC-001` lacked). |
| **Delivery Pattern** | **Security or Operability Change** for every part (failure scenario, control, adversarial red test written first and observed failing). **Public-Surface / Data Migration** for the field limits (narrowing — limits set far above any value the product writes, see R1), the `users` rebuild (expand-compatible: the previous image reads and writes the rebuilt table unchanged) and the `/skill` fields (additive). The API-key **contract** rebuild is deferred to its date. |
| **Required tests** | Plan §6 names for M8: *Unit* (limits, size measurement, schema fingerprint), *DB-Integration* (idempotent versioned migrations, **fresh-vs-upgrade schema**, a refused rebuild leaves the database untouched, the id sequence survives), *ASGI/REST* (limits on every named route and through MCP; 413 for an `E2BIG`), *Restore/Rollback* (the previous image's boot sequence against a rebuilt database). Gate: negative fixtures for `RULE-SEC-001` (a route declared in `main.py`) and `RULE-SURF-005` (a `CREATE` edited instead of migrated). CI: the `verify-deploy` script run against stubs that serve a wrong build, a wrong compose hash, no applied compose and a wrong digest. |
| **Intended scope** | All five M8 items, up to the furthest step safe to deploy now. **Deferred** (with triggers in *Deferred*): audit retention/archival/`VACUUM` until the operator decides D7; the API-key contract rebuild (drop `users.api_key`) after the `API_KEY_LEGACY_CUTOFF` of 2027-01-15 and its soak; every production confirmation. **Not** in scope: a capacity model (decision F1), a shared limiter, M7.3/M7.4, M9. |
| **Base revision** | `c6a0070` (`security/m7-jwt-and-deps`) |

## Failure scenarios

1. **The huge description (`RISK-SEC-004`).** An authenticated client — or an agent in a loop — posts a
   900 KiB description, annotation or inbox note. It fits the 1 MiB body limit, is accepted, travels into
   the Taskwarrior argv and into that user's store on the partition `users.db` and `audit.db` share. On
   Linux an argument past `MAX_ARG_STRLEN` (128 KiB) makes `execve` fail with `E2BIG`, which surfaces as
   an unhandled 500 that says nothing about the input.
2. **The silent audit file (`RISK-OPS-006`).** Every authenticated request writes a row; nothing measures
   the file. The first sign of a full partition is the database failing.
3. **The schema that is two schemas (`RISK-SURF-001`, `RISK-SEC-002`).** A fresh database has
   `api_key TEXT UNIQUE` and its columns in one order; production, migrated by `ALTER TABLE`, has neither
   the constraint nor the order, and the snapshot describes only the fresh one. A `role` written by hand
   (`Admin`, `root`) is accepted by the database. And the next table rebuild — the API-key contract — has
   no mechanism that knows whether it already ran.
4. **The route nobody declared (`RISK-SEC-005`).** `RULE-SEC-001` reads `backend/app/routers/*.py`. A route
   on the app object, a router-level dependency, or a framework route is invisible to it: `GET /health`,
   `POST /mcp`, `GET /docs`, `GET /redoc`, `GET /openapi.json` and `GET /docs/oauth2-redirect` are served
   today and declared nowhere. The next authenticated route added in `main.py` without a guard ships green.
5. **The deploy that applied nothing (`RISK-OPS-002`).** The host script extracts the compose from the
   image and writes it to disk; if that write silently fails, the new image runs under the old compose
   and every check CI has passes, because the containers it already runs answer correctly. And CI never
   compares what the registry serves under `:latest` with what it built.

## Decisions

See ADR 0047 for the reasoning; in short:

- **R1 — field limits at or above what the clients send, below the kernel.** Username 256 at login and
  registration, description 2 000, annotation and inbox note 32 768 characters **and** 32 KiB of UTF-8,
  date-like fields 64, priority 16, tag 100 (at most 50 tags), dependency id 64 (at most
  100), profile name 200, email 320, role 32, plan texts 20 000 each, a plan list 500 items of id 200 and
  text 4 000. The note bound is the capture clients' own rule: `capping.js` and Android's `Capping.kt`
  (outside this repository, not changeable in this change) cut a note at 32 KiB of UTF-8, which the previous
  deploy accepted — the first draft's 8 000 characters refused such captures (review, see *Review
  findings*). The largest Taskwarrior argument is 32 KiB (a note) or 8 000 bytes (a description at 4 bytes
  a character), a quarter of `MAX_ARG_STRLEN`. The username bound only stops a name of any size reaching
  the audit row and the log line written before any check; registration still refuses more than 64 with its
  400, and 256 is wide enough that no account registered under any earlier rule is expected to be locked
  out (production's longest name is an operator check at merge, see *Deferred*). A refusal is pydantic's 422 at body parsing. An `E2BIG` that still occurs is
  `task_runner.ArgumentTooLong` → **413** from one exception handler in `main.py`. The 1 MiB / 16 KiB body
  limits stay; MCP tool calls meet the same models because each is a request to its own route.
  **Stored values (second review):** the bounds hold what a request *changes*, never what the previous deploy
  already stored. The update models carry only the old effective ceilings (131 072 characters for a task
  text — the per-argument limit every stored one passed; 1 MiB for a plan value — the body it arrived in); a
  changed description, plan text, new tag or new plan item over its bound is 422 (`LimitExceeded`, naming the
  field), and a tag, dependency or plan-item set over its bound is refused only when it is larger than the
  stored one too. So a task with a 3 000-character description or 60 tags, or a plan with a 25 000-character
  purpose or 505 items, stays editable from the SPA and over MCP; existing over-limit data is kept as it is
  and needs no operator query.
- **R2 — audit size is measured, not pruned.** `audit.measure()` stats `audit.db` (+ `-wal`, `-shm`), keeps a
  high-water mark in `audit_meta`, logs `audit store size` at INFO at boot and hourly, and at WARNING above
  `AUDIT_DB_WARN_BYTES` (default 100 MiB, `RISK-OPS-006`'s own re-open trigger). No row is deleted: D7 is
  the operator's.
- **R3 — versioned migrations after a frozen additive baseline.** `MIGRATIONS` stays as it is (version 0:
  the state every database reaches by the additive loop). `VERSIONED_MIGRATIONS` are applied in order,
  each in one `BEGIN IMMEDIATE` transaction that also records it in `schema_migrations`; a failure rolls
  back, logs ERROR and stops the chain, the boot continues (ADR 0025's judgement). Version 1 rebuilds
  `users` into one declared shape with the role `CHECK`, preserving ids, the AUTOINCREMENT sequence, and
  every index and trigger on the table. `role` NULL or empty becomes `user` (what every reader already
  treats it as); any other value refuses the rebuild.
- **R4 — the guard of a route is read from what FastAPI will run.** The checker boots the app, walks
  every route context and its resolved dependency tree (router-level dependencies included), and requires
  a declaration for each method/path; a `Mount` must be declared too. Framework and transport routes are
  declared `open` with reasons.
- **R2a — refusals an unauthenticated caller can repeat are coalesced (second review).** The three
  refusals of `POST /auth/register` go through `audit.record_refusal`: one row per kind and login window,
  later ones counted and carried by the next row or a summary (hourly task, shutdown). Row volume from
  anonymous callers is thereby bounded; authenticated volume is D7's.
- **R5 — the deploy proves itself.** The image carries a build id (`github.run_id`); `GET /skill` reports
  it, the SHA-256 of the baked compose, the SHA-256 of the host's compose (bind-mounted read-only at
  `/etc/runway/applied-compose.yml`) and the schema version. `verify-deploy` requires each to match what
  this run built and this commit records, and the registry's `:latest` and `:<sha>` to resolve to the pushed digest.

## Control

Six commits on `security/m8-capacity-and-schema`, each green under `make check` and each deployable on its own:

1. **Field limits** (`RISK-SEC-004`). `backend/app/models.py`: the limit constants, `Tag` and `DependsId`
   item types, `max_length` on every free-text request field (the usernames of `UserCreate`/`UserLogin`
   and the note's byte rule `NoteText` added after review; `audit._identity` cuts actor/subject at 256); `StoredBrainstormItem` (unbounded) for the
   plan *response*, so a plan written before the limits still reads back. `routers/inbox.py`: `InboxItem`
   bounded like a task and its annotation. `task_runner._run`: `OSError(E2BIG)` → `ArgumentTooLong`
   (sizes logged, never the text); `task_service.ArgumentTooLong` re-export; `main.py`: one handler → 413.
2. **Route-guard inventory** (`RISK-SEC-005`, `RULE-SEC-001`'s check). `tools/checks/route_guards.py`
   rewritten: boots the app, `iter_route_contexts(app.routes)`, guard from the resolved dependency tree,
   OpenAPI cross-check, `MOUNT` entries. `rules/route-guards.toml`: eight `open` declarations with reasons.
   Two new fixture arms (a route in `main.py`; a guard moved to the router level).
3. **Versioned migrations** (`RISK-SURF-001`, `RISK-SEC-002`, `RULE-SURF-005` new). `database.py`:
   `MIGRATIONS` frozen; `schema_migrations`; `VERSIONED_MIGRATIONS = ((1, "users_declared_shape", …),)`;
   `apply_versioned_migrations` (one `BEGIN IMMEDIATE` per step, rollback and stop on failure);
   `CREATE_USERS_V1`/`COPY_USERS_V1` and the step (column-set check, role check, sequence kept, dependents
   re-created, row count verified); `schema_fingerprint`/`schema_differences`. `tools/surfaces.py`: the
   snapshot records `-- schema_version 1`; `check_schema_history` emits `RULE-SURF-005`. Three baselines in
   `backend/tests/fixtures/schema_history/`. Ledger, fixture arm, `AGENTS.md` §5, docs.
4. **Audit size** (`RISK-OPS-006`). `audit.py`: `audit_meta`, `measure()` (stat, high-water upsert, INFO/
   WARNING line, never raises), `watch_size()`; `main.py`: at boot and as a lifespan task, cancelled at
   shutdown; `config.audit_db_warn_bytes` (`AUDIT_DB_WARN_BYTES`, README, deploy compose).
5. **Deploy evidence** (`RISK-OPS-002`). `Dockerfile`: `ARG RUNWAY_BUILD` → `/app/BUILD_ID`. Deploy
   compose: `./docker-compose.yml:/etc/runway/applied-compose.yml:ro`. `ServerBuild` gains `build`,
   `compose_sha256`, `applied_compose_sha256`, `schema_version` (handed to `skill_service` by the lifespan,
   so `database.py`'s fan-in does not grow). `deploy.yml`: `RUNWAY_BUILD` build-arg, the digest as a job
   output, four new comparisons in the existing step, a registry-digest step, `packages: read`.
6. A test fix (the extracted job step ran in the repository and left `skill.zip` there), then this record.

No budget, baseline, waiver or suppression changed; `ops/structure-baseline.toml` untouched (the first draft
of step 5 raised `database.py`'s fan-in to 10 and `RULE-ARCH-003` refused it — the version is now handed in).

## Test evidence

Run on 2026-11-25 on an arm64 Mac. "Red" is each new test file against the code **before** its commit. Where
the test needs a name the new code introduces, the red run used a shim that defines the name and enforces
nothing (stated per row).

| Tier | What | Red | Green |
|---|---|---|---|
| ASGI/REST | `test_input_limits.py::TestEveryFieldIsBounded` — one past each limit (13 fields over `POST /tasks`, `POST /inbox`, `PUT /auth/me`, `PUT /projects/plans/{name}`) is 422 and the store is untouched; at the limit the length is never the refusal; a 900 KiB description; annotate and modify; the OpenAPI schema states the limits | **16 red** (shim: the constants exist, nothing enforces them): every over-limit request was 200/201 — the 900 000-character description was **stored** — or 400 from a later validator; no `maxLength` in the schema | green |
| Unit | `TestTheKernelRefusalIsNot500` — `E2BIG` from `subprocess.run` is `ArgumentTooLong`; another `OSError` is not; `ArgumentTooLong` is 413 on `POST /tasks`, `POST /inbox`, `GET /gtd/inbox` | **red**: `OSError: [Errno 7] Argument list too long` escaped `_run` (a 500) | green |
| ASGI/MCP | `TestMcpMeetsTheSameLimits` — `create_task_tasks_post` over MCP with a 2 001-character description is an error and writes nothing | **red**: `isError=False`, the task was created | green: refused by the tool's own input schema ("is too long") before any request |
| Gate | `RULE-SEC-001` with a route appended to `main.py` | **red observed as green**: the old checker printed `ok 42 route(s) declared` and exited 0 | the new checker names it; on the unchanged tree it named the eight undeclared served routes (`GET /health`, `POST`/`GET`/`DELETE /mcp`, `GET /openapi.json`, `/docs`, `/docs/oauth2-redirect`, `/redoc`) before they were declared. Fixture arms run by hand against a copy: outside-route, router-level guard, stripped guard — all three red |
| DB-Integration | `test_schema_versions.py` (18) — every baseline upgraded equals fresh; both reach version 1; the role `CHECK` on fresh and every baseline (`Admin`, `root`, `''`, NULL refused; `user`→`admin` allowed); every value of every row kept (NULL role → `user`); a deleted account's id never reused; the storage-id and auth-version triggers and both uniqueness constraints survive; the step runs once and logs once; a hand-written role refuses the step, changes nothing, names no account; the service still starts; a step failing half-way is rolled back whole; the copy statement names every declared column | **10 red** (shim: `VERSIONED_MIGRATIONS = ()`, i.e. the unchanged schema behaviour): `2026-04-27-initial` — production's shape — differs from fresh (`api_key` UNIQUE, column order); **no path refused `role='root'`**; no version | green |
| Rollback | `test_the_previous_image_boots_and_writes_on_a_rebuilt_database` — boot this image, register/use/change password/revoke a key; boot without the versioned step (the previous image: `MIGRATIONS` and every `CREATE` are unchanged, its writers are the same functions) and do the same; boot this image again and do it a third time | red under the shim only because the version is never 1 | green: three accounts, all `user`, version 1 kept |
| Gate | `RULE-SURF-005` with a column added to `CREATE_PROJECT_STATUS` | — (the rule is new) | red by hand: "a database upgraded from 2026-11-25-m7.sql differs from a fresh one: table project_status: columns differ"; the fixture arm also rewrites the snapshot first, so `RULE-SURF-001` alone could not explain the red |
| Unit | `test_audit_size.py` (8) — size = the three files; INFO line with the three fields; WARNING above the threshold; default 100 MiB; the high-water mark survives `DELETE` + `VACUUM`; measuring touches no `audit_events` and deletes nothing (SQLite trace); a failing connection is one ERROR and no exception; the boot measures; the timer measures again | **8 red**: no `measure`, no setting, **the boot logged no size line** | green |
| Unit | `test_deploy_evidence.py::TestTheServerReportsItsDeployment` (6) — build, both compose hashes, schema version; a differing host file is reported as it is; absent files are `dev`/null; the route serves hashes and no file content or path; the compose mounts itself read-only at the path the server reads; the Dockerfile and workflow bake the build id | **6 red/error**: no fields, no mount, no build id | green |
| CI (stubbed) | `TestTheJobFailsForEveryFalseSuccess` (10) — the two `verify-deploy` steps extracted from `deploy.yml` and run with `sh` against stub `curl`/`docker`: this run passes; build `111`/`dev`, a wrong baked compose, a wrong or **null applied compose**, schema version 0 or null each fail naming the field; a registry digest that is not the pushed one fails; the job receives the digest | **red: the unchanged step exited 0 for all seven false successes**; no registry step; no digest output | green |
| Changed expectations | `test_migrations.py::lines` sets aside the one INFO line `schema migration applied` (once per database); six `buffer.getvalue() == ""` became `lines(buffer) == []` | — | green; the "silent re-run" property is unchanged for every other line |

| ASGI/REST (review) | `CASES` rows for `POST /auth/login` and `POST /auth/register` (username 257 is 422, 256 is 401/400); `test_the_largest_capture_a_client_sends_is_accepted` ×4 (ASCII, 2-, 3-, 4-byte letters: a 500-code-point description and a note cut at 32 KiB of UTF-8, on `POST /inbox` and as an annotation); a note over 32 KiB in bytes but under the character bound is 422; `test_an_oversized_username_leaves_no_audit_row_or_log_line` | **8 red** (shim: `USERNAME_GIVEN_MAX`, `ANNOTATION_MAX_BYTES` defined, nothing enforced): a 257-character name was 401/403 instead of 422; every largest-capture case was 422 (`String should have at most 8000 characters`); a 15 000-character name wrote an audit row and a log line | green |
| Unit (review) | `test_audit.py::test_an_identity_column_is_bounded_whatever_a_caller_passes` | **red**: actor and subject stored at 15 000 characters | green |

Not run here: the container tier (arm64, `RISK-TEST-001`) — see *Gate*. The `E2BIG` itself was not reproduced
(macOS); the 413 path is tested at the subprocess seam. No browser test: nothing in the SPA changed.

## Results

- **`RISK-SEC-004` narrowed** — sizes bounded at 422/413; volume (how many tasks an account writes) is not,
  decision F1. MCP meets the same bounds.
- **`RISK-SEC-005` narrowed** — every served route classified; remaining: what nginx answers itself, and a
  handler that authenticates inside its body.
- **`RISK-SURF-001`, `RISK-SEC-002` closed in this repository, open until production reports version 1** —
  `verify-deploy` now fails if it does not.
- **`RISK-OPS-006` narrowed** — measured, high-water mark, warning; rows an unauthenticated caller can cause
  are bounded per kind and window (login: brief 0069; registration: R2a). **Not bounded**: the volume of
  authenticated activity, so the plan's acceptance "synthetic load cannot grow the audit file without bound"
  is met for anonymous load only and fully not until D7. The limiter (brief 0069) and request bodies/fields
  (this brief) are bounded.
- **`RISK-OPS-002` narrowed** — commit, build, baked and applied compose, schema version, registry digest;
  remaining: the host's own digest, and anything between deploys.
- **Public surfaces:** OpenAPI regenerated (limits; four additive `server` fields); MCP names and count
  unchanged (27; their schemas carry the limits); DB snapshot regenerated (`users` v1, `schema_migrations`,
  `-- schema_version 1`); one env var added and documented; SPA unchanged.
- **Rollback:** every commit runs on the previous deploy's data. The previous image boots on a version-1
  database (tested as above); it ignores `/etc/runway/applied-compose.yml` and the new `/skill` fields; it
  does not bound fields, which is the only thing a rollback gives back.

### Review findings (after the first gate)

- **Usernames unbounded (two reviewers, important) — real, fixed.** `UserLogin`/`UserCreate.username` had no
  `max_length`; an unauthenticated request wrote a ~15 KB actor into `audit.db` and the log on every failed
  login and on every refused registration (no limiter there). Now 422 above 256 characters while the body is
  parsed, and `audit.py` cuts actor and subject at 256 whatever a call site passes.
- **Inbox note / annotation below the clients' capture (important) — real, fixed.** 8 000 characters refused
  what `capping.js` and Android send (a note up to 32 KiB of UTF-8); the outbox treats that 4xx as failed, so
  captures would have been lost. The bound is now the clients' rule, so no client change and no compatibility
  window is needed; nothing of the previous deploy's client traffic is refused.

### Review findings (second review)

- **Stored over-limit task values became uneditable (two reviewers, important) — real, fixed.** The SPA
  sends the full description, tags and depends on every save; with `TaskModify` bounded at 2 000 / 50 × 100 /
  100, a task the previous deploy stored with a 3 000-character description returned 422 for a due-date
  change. Same for a plan (`planBody` resends everything). Fixed by R1's stored-values rule (option (b) of
  the review, without an SPA change): ceilings in the update models, the bound applied to the changed value
  in `task_service.modify_task` and `models.plan_limit_problem`. Red first:
  `test_stored_values_stay_editable.py`, 7 of 8 tests red on `bd5ad1f` (422 for every unchanged legacy
  value; `tags_add` growing a 55-tag set past 50 was 200).
- **Refused registrations grew `audit.db` without bound (important) — real, fixed.** 300 refused
  registrations wrote 300 rows; now one (R2a). Red first: `test_audit.py::TestRefusedRegistrationsAreCoalesced`,
  4 of 4 red (300 rows instead of 1; no `_clock`/`flush_refusals`; 40 rows instead of 2).
- **WebSocket routes skipped by the route-guard inventory (important) — real, fixed.** `observed()` keyed
  routes by HTTP method; a WebSocket route has none and no OpenAPI entry. Now `WS <path>`, and an unknown
  method-less route kind fails the gate. Red first: an `@app.websocket` appended to `main.py` in a scratch
  copy left the old checker silent (exit 0, no line); the new one names `WS /undeclared-socket`. New fixture
  arm `SEC-001-ws`.
- **The SPA shows a 422 detail array as `[object Object]` (minor) — not fixed here, deferred.** Pre-existing
  for every pydantic 422 the SPA can receive; after the fix above a 422 on save only follows a value the user
  actually typed over its bound. See *Deferred*.

### Deferred, with trigger

- **Audit retention, archival and `VACUUM`** — after the operator decides gate D7 (period, size budget,
  protected event classes). ADR 0047 Decision 1 lists what the job must respect. Trigger: the D7 decision, or
  the first WARNING `audit store size`.
- **API-key contract (versioned step 2)** — drop `users.api_key`/`api_key_closed_at` by rebuild, after
  `API_KEY_LEGACY_CUTOFF` (2027-01-15) and its soak; then `WAIVER-SEC-003` can close (ADR 0044).
- **Production confirmations (not possible from this repository):** the first `verify-deploy` of this branch
  passing the new checks (build, both compose hashes, schema version 1, registry digest); that no production
  row carries a role outside the two (else the step refuses — `docs/operations.md`, *Schema migrations*);
  a copy of `users.db` and `audit.db` before that deploy (plan §7); and that no production account has a
  username longer than 256 characters (`SELECT max(length(username)) FROM users` — such an account could no
  longer log in; not readable from here). Owner, at merge.
- **SPA field-level message for a 422** — `TaskModal.vue`, `ProjectPlanModal.vue` and `usePlan.js` show
  `detail` as a string or the status; a validation array reads as `[object Object]` or `422`. A frontend
  change of its own (one formatter in `src/shared`, tests in the browser tier). Trigger: the next SPA change
  touching these components, or the first user report.
- **Not built:** an alert outside the log stream, a measurement of the partition's free space, a scheduled
  host-side comparison between deploys.

### Gate

- `make check`: **GREEN** on every commit of the branch (29–53 s of 180 s; 159 s once while `make verify`
  ran beside it).
- `make verify` on `ea6718b`, in a clean, bootstrapped, detached worktree (the untracked audit evidence in the
  main checkout trips `RULE-RULE-003` inside the fixture sandbox): **GREEN**, 495 s of 600 s. Fixture suite:
  63 arms passed, 0 failed; 48 of 51 executable rules proven able to fail — among them the new arms
  `SEC-001-outside`, `SEC-001-router` and `SURF-005`.
- After the review fixes: `make check` **GREEN** on `e494591` (52 s); `make verify` on `e494591`, again in a
  clean detached worktree: **GREEN**, 377 s of 600 s, exit 0; 63 fixture arms passed, 0 failed; 48 of 51
  executable rules proven able to fail.
- After the second review: `make check` **GREEN** on `de778c6` (53 s). `make verify` on `de778c6` in a clean,
  bootstrapped, detached worktree: the first run was **RED** — `RULE-GATE-002`, because the fixture suite's
  sanity `./run check` of its pristine sandbox failed once, while the diagnostic re-run it prints immediately
  after was GREEN (cause not identified; no tracked file differed). The second run, unchanged: **GREEN**,
  383 s of 600 s, exit 0; 64 fixture arms passed, 0 failed (the new `SEC-001-ws` among them); 48 of 51
  executable rules proven able to fail.
- **The container tier did not run**: `py-test-container` is skipped on arm64 (`RISK-TEST-001`) and runs in CI
  only. No test of this brief is in that tier; none was claimed to pass there. The changed `backend/Dockerfile`
  (`BUILD_ID`) and the deploy compose mount were not built or started here — the first CI build and
  `verify-deploy` of the merge are their test.
