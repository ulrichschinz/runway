# Change Impact Brief 0020 — The audit log, and the credential shape that makes a shim removable

Step 15c, and the largest piece of Step 15. One new module, one new SQLite file, twelve event
types, and one field that is the reason for all of it: every successful authentication now
records **which of the three credential shapes** let it in. `SHIM-SEC-006` has been blocked
since Step 13 on a question nothing in this repository could answer — *is anyone still sending
`Authorization: Bearer <api_key>`?* — and the answer needed an instrument before it needed a
decision. This lands the instrument and the query. It does **not** remove the shim, and the
expiry has not moved: that needs a soak on the real deployment, which no local change produces.

| Field | Value |
|---|---|
| **Requested outcome** | A durable record of what was done to accounts and data — role changes, key regeneration, task deletion, and the auth-relevant events around them — carrying the credential shape and route that `SHIM-SEC-006`'s removal has to be decided on. Persistent enough to survive a log rotation and a container recreation; incapable of holding a credential; incapable of failing a request. |
| **Owning unit** | `be/adapters/db`, `be/app`, `be/di`, `be/routers`, `docs`, `ops`, `tests` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md), [`backend/AGENTS.md`](../../backend/AGENTS.md) |
| **Governed by** | [`adr:0026`](../adr/0026-the-audit-log.md); [`adr:0024`](../adr/0024-structured-logging.md) for the correlation id these rows join on, [`adr:0025`](../adr/0025-narrowing-the-migration-except.md) for the log-and-continue posture reused here, and [`adr:0018`](../adr/0018-cors-startup-refusal-and-the-inbox-shim.md) for the shim itself |
| **Rule IDs introduced** | **None.** Nothing here is a property a gate rule would hold better than the tests do, and a rule per change is how a gate becomes noise. The rules this change had to satisfy already exist: `RULE-ARCH-001` decided where the writer may live, `RULE-ARCH-003` made its fan-in a reviewable number, `RULE-OPS-002` governs every log line it writes, `RULE-SEC-001` and `RULE-SURF-001` hold the surfaces it must not move, and `RULE-RULE-003` is what pairs its one `# noqa` with a reviewed justification. |
| **Risks recorded** | **`RISK-OPS-006`** — nothing prunes the audit database. Deliberate: a first cut that deletes rows is a first cut that can delete the evidence the shim is waiting on. |
| **Entry points** | [`backend/app/audit.py`](../../backend/app/audit.py), [`backend/app/database.py`](../../backend/app/database.py), [`backend/app/dependencies.py`](../../backend/app/dependencies.py), [`backend/app/main.py`](../../backend/app/main.py), [`backend/app/routers/auth.py`](../../backend/app/routers/auth.py), [`backend/app/routers/admin.py`](../../backend/app/routers/admin.py), [`backend/app/routers/tasks.py`](../../backend/app/routers/tasks.py), [`backend/tests/unit/test_audit.py`](../../backend/tests/unit/test_audit.py), [`architecture.toml`](../../architecture.toml), [`ops/structure-baseline.toml`](../../ops/structure-baseline.toml), [`rules/shims.yaml`](../../rules/shims.yaml), [`rules/ledger.yaml`](../../rules/ledger.yaml), [`rules/waivers.yaml`](../../rules/waivers.yaml), [`docs/operations.md`](../operations.md#the-audit-log), [`docs/adr/0026-the-audit-log.md`](../adr/0026-the-audit-log.md) |
| **Affected public surfaces** | **None.** The index lists all 30 REST routes and their MCP tools because `database.py` and `dependencies.py` are reachable from every router; nothing about the surface moves. `Request` was injected into `get_current_user` and eight handlers for the route template alone — it is not a body or query parameter, so it appears in no schema. All five snapshots in `ops/surfaces/` regenerate byte-identically, and **no audit-read endpoint was added**, deliberately: [ADR 0026](../adr/0026-the-audit-log.md) records why reading this log is an operator activity. |
| **Known dependents** | [`backend/app/routers/gtd.py`](../../backend/app/routers/gtd.py), [`backend/app/routers/inbox.py`](../../backend/app/routers/inbox.py) and [`backend/app/routers/projects.py`](../../backend/app/routers/projects.py) inject `get_current_user` and therefore now write an authentication row each; none of them changed. Every other dependent is on `database.py`, whose existing functions are untouched — `init_db` gained a return value its only caller previously discarded. |
| **Uncertain / dynamic areas** | `BLIND-TEST-001` — protection is import-derived, so the routers and the new test module show as unprotected by construction; they are covered through the FastAPI TestClient. `BLIND-MCP-001` (resolved) and `BLIND-OPS-001` are reported for the changed set: the second bears directly on this change, because the evidence this log produces only exists on a host nothing here can reach (`RISK-OPS-002`). |
| **Analogous implementations** | [`backend/app/logging_setup.py`](../../backend/app/logging_setup.py) — the same two-part posture (a name-based control and a value-shape one), and `redact_text` is reused here as the backstop rather than reimplemented. [`backend/app/database.py`](../../backend/app/database.py)'s migration loop — the log-and-continue judgement this copies for a failed audit write. [`backend/app/middleware.py`](../../backend/app/middleware.py) — the `ContextVar` the `request_id` column reads. |
| **Delivery Pattern** | **Security or Operability Change** — failure scenario, control, adversarial proof. It is behaviour-changing: it persists new data, on every authenticated request. |
| **Required tests** | One test per event type asserting the row, the actor and the outcome; the three credential shapes producing three distinct values from one account; the documented shim query returning the caller and the route; no credential of any kind anywhere in the database over real fixture credentials; the audit row's `request_id` matching the log lines from the same request; an audit write failure not failing the request; a store that cannot be initialised not stopping the boot; a rejected credential writing nothing; and the column list pinned against the declared tuple. |
| **Intended scope** | Step 15c only. **Not** the removal of `SHIM-SEC-006` and not a change to its expiry, **not** the SEC-5 fix (the key endpoint's contract is a public-surface migration of its own), not a read endpoint, not a retention policy, not a caller fingerprint, and not `docs/threat-model.md` — which is 15e/f. |
| **Base revision** | `acab877` |
| **Index revision** | `acab877` |

## The failure scenario

Three of them, and they are the same shape: a question that has to be answered from evidence
nobody kept.

**The one this change exists for.** `SHIM-SEC-006` expires on 2026-11-25 and `RULE-SEC-002`
fails the gate when it does. On that date the choice is to delete the Bearer-as-API-key path or
to re-approve it with a new expiry, and both were going to be taken blind: this application
accepted three credential shapes and treated all three identically, so nothing anywhere
recorded which one a caller used. Deleting it breaks every agent, MCP client and webhook that
still sends a key in the Bearer slot — which is, as far as anyone knows, all of them. Renewing
it means the shim outlives its second deadline for the same reason it outlived its first.

**An administrator promotes an account and nobody can say when.** `/admin/users/{target}/role`
changes who may read every other user's data and who may open the instance to public
registration. Before this, a completed role change left a database row showing the *current*
state and nothing at all showing that it changed, who changed it, or from what.

**An API key is used after it was disclosed.** `GET /auth/apikey` returns a permanent,
unscoped, un-expiring credential in cleartext — finding SEC-5, which this change does not fix.
When that key turns up somewhere it should not be, the question is when it was last handed out
and to whom, and the answer was a log line inside a rotation window capped at 50 MB.

## The control

[ADR 0026](../adr/0026-the-audit-log.md) records the decisions; this is what shipped.

1. **Its own SQLite file at `DATA_ROOT/audit.db`.** Not a table in `users.db` — that moves the
   `RULE-SURF-001` snapshot surface and trips the "third table changing shape" clause that makes
   a `migrations/` directory due. Not stdout — a rotation policy may delete it, and evidence
   something is allowed to delete is not evidence you can wait three months on. `DATA_ROOT` is
   not incidental: it is the only directory either compose file bind-mounts, so the file
   survives the container recreation that happens on every deploy, and **no compose file was
   touched**.
2. **The connection stays in `database.py`.** `AGENTS.md` says it is the only module that opens
   one, and a second database is not a reason to make that rule mean less than it says.
   `database.audit_connection()` opens the file; `app/audit.py` — schema, vocabulary, writer —
   asks it for the connection.
3. **`audit.py` is in `be/adapters/db`, and that is the only placement that works.** The writer
   must be reachable from `be/di`, because `get_current_user` is where the credential shape is
   known, and `be/di` may depend on `be/adapters/db` and `be/leaves` and nothing else. A leaf is
   reachable from everywhere but may depend on nothing, so it could not open a connection.
   `RULE-ARCH-001` would have refused any other answer. Its fan-in of five is recorded in
   [`ops/structure-baseline.toml`](../../ops/structure-baseline.toml) with the note that a sixth
   dependent is the signal, not the fifth.
4. **The discriminator.** `api-key-header`, `bearer-jwt`, `bearer-api-key` — the third being the
   shim — plus the route *template* the shape was used on, because a shape can be dead on one
   endpoint and alive on another, and the shim exists precisely because `/inbox` was different
   from everything else. The template and never the requested path: a path is caller-controlled
   text that really does arrive with a credential in it, as the access lines quoted in
   [`docs/operations.md`](../operations.md#redaction-at-runtime) show.
5. **Only successful authentication is recorded.** A rejected credential writes nothing, so an
   unauthenticated caller cannot append to a file that has no pruning. Login failures are the
   exception and are bounded by the per-username rate limiter from finding SEC-8.
6. **A write can never fail a request.** Every entry point catches `sqlite3.Error` and `OSError`
   and logs at `ERROR`; the request is served. The same judgement the migration loop makes.
7. **No credential can be persisted, twice over.** No call site passes one — the row names the
   shape, never the value — and every string additionally passes through
   `logging_setup.redact_text`, so a JWT, a bcrypt hash, an API key or the resolved signing key
   cannot reach a column even from a future call site that gets it wrong.

## Adversarial proof

`test_no_credential_appears_anywhere_in_the_audit_database` in
[`backend/tests/unit/test_audit.py`](../../backend/tests/unit/test_audit.py) registers, logs in,
reads and rotates the API key, authenticates with the rotated key in **both** slots, changes the
password and fails a login — then concatenates every value of every column of every row and
requires the token, both API keys, both passwords, the signing key and the stored bcrypt hash to
be absent, having first asserted the rows are present so it cannot pass vacuously.

It was also run outside the suite, against `uvicorn app.main:app --log-config log_config.json`,
the command the image starts with. Twenty-two rows across registration, login, a login failure,
key disclosure, key rotation, a role change in both directions, the refused last-admin demotion,
the registration toggle and all three credential shapes on four routes. The rows the shim
question turns on:

```
 8  auth.authenticated  alice  success  api-key-header  GET /tasks                      667b2d264058
 9  auth.authenticated  alice  success  bearer-jwt      GET /tasks                      adc09385c1a8
10  auth.authenticated  alice  success  bearer-api-key  GET /tasks                      f0e3bdf4b24f
11  auth.authenticated  alice  success  bearer-api-key  GET /gtd/inbox                  e5573f326aec
16  admin.role.changed  alice  success  bob             PUT /admin/users/{target}/role  role user -> admin
```

One account, one route, three headers, three different values. The documented query then named
the caller and every endpoint:

```
{'actor': 'alice', 'route': 'GET /gtd/inbox', 'calls': 1, 'first_seen': '...769Z', 'last_seen': '...769Z'}
{'actor': 'alice', 'route': 'GET /gtd/next',  'calls': 1, 'first_seen': '...793Z', 'last_seen': '...793Z'}
{'actor': 'alice', 'route': 'GET /tasks',     'calls': 1, 'first_seen': '...760Z', 'last_seen': '...760Z'}
```

Nine credentials searched for in 2,296 characters of column values, and none present:

```
  absent      password             correct horse battery st…
  absent      jwt                  eyJhbGciOiJIUzI1NiIsInR5…
  absent      api_key (first)      Vyz8MdwvjYYxIbqgkiWvAUXc…
  absent      api_key (rotated)    VeasfKwRNKIb5QUPfgSNyd3T…
  absent      JWT_SECRET           adversarial-proof-secret…
  absent      bcrypt hash 0        $2b$12$Easns1zDwhPBLZiPf…
  absent      bcrypt hash 1        $2b$12$MvBuhYZEzhHraaRTw…
  absent      live api_key 0       AykQs7dvWam7Pxo8VDh8F1hu…
  absent      live api_key 1       VeasfKwRNKIb5QUPfgSNyd3T…
```

Six requests carrying rejected credentials added **zero** rows — 22 before, 22 after — which is
the amplification bound working. The last-admin demotion came back `409` and wrote
`refused: this is the last admin`. And the join, which is the whole reason the correlation id
landed in Step 15a rather than here: one request id, two log lines and two audit rows.

```json
{"timestamp": "2026-08-28T11:40:01.778Z", "level": "INFO", "logger": "app.routers.auth", "message": "api key regenerated", "request_id": "ed39f8663114", "username": "alice"}
{"timestamp": "2026-08-28T11:40:01.779Z", "level": "INFO", "logger": "uvicorn.access", "message": "127.0.0.1:63976 - \"POST /auth/apikey/regenerate HTTP/1.1\" 200", "request_id": "ed39f8663114"}
```
```
{'event': 'auth.authenticated',      'actor': 'alice', 'route': 'POST /auth/apikey/regenerate', 'request_id': 'ed39f8663114'}
{'event': 'auth.apikey.regenerated', 'actor': 'alice', 'route': 'POST /auth/apikey/regenerate', 'request_id': 'ed39f8663114'}
```

`RULE-GATE-002` requires nothing new: no rule was added, so there is no fixture to build, and
the conformance suite still proves 44 rules able to fail.

## Behaviour change

**New:** a second SQLite file, `data/audit.db`, created at boot and written on every
successfully authenticated request and on twelve kinds of event. A `# noqa: S105` in
[`backend/app/audit.py`](../../backend/app/audit.py) with a reviewed justified suppression in
[`rules/waivers.yaml`](../../rules/waivers.yaml) — `PASSWORD_CHANGED` is an event name, not a
credential.

**Changed:** `init_db` returns the admin-bootstrap reason string instead of discarding it. That
string has existed since Step 11 and was written for this; the lifespan now records it, including
`noop: an admin already exists`, which is the evidence that the recovery path did *not* fire on a
given start. `get_current_user` and eight handlers take a `Request` for the route template.

**Unchanged:** every route, every MCP tool, the users schema, the Taskwarrior template, the SPA,
and both compose files. No environment variable was added, so `RULE-SURF-002` had nothing to
disagree about. `SHIM-SEC-006` still accepts the Bearer-as-API-key shape and still expires on
2026-11-25.

## What the index knows

**10 production path(s) changed**, out of 15 total:

- `architecture.toml`
- `backend/app/audit.py`
- `backend/app/database.py`
- `backend/app/dependencies.py`
- `backend/app/main.py`
- `backend/app/routers/admin.py`
- `backend/app/routers/auth.py`
- `backend/app/routers/tasks.py`
- `backend/tests/unit/test_audit.py`
- `ops/structure-baseline.toml`

### Public surfaces

Decision **F2** treats these as externally consumed. A change to one of them follows expand → migrate → switch → contract, and an MCP tool name is a route handler function name — renaming the function breaks the tool.

- `DELETE /{uuid}` → MCP tool(s): `delete_task`  ·  evidence `CONFIG_CONFIRMED`
- `GET ` → MCP tool(s): `list_tasks`  ·  evidence `CONFIG_CONFIRMED`
- `GET /apikey` → MCP tool(s): `get_apikey`  ·  evidence `CONFIG_CONFIRMED`
- `GET /health` → MCP tool(s): `health`  ·  evidence `CONFIG_CONFIRMED`
- `GET /inbox` → MCP tool(s): `inbox`  ·  evidence `CONFIG_CONFIRMED`
- `GET /me` → MCP tool(s): `me`  ·  evidence `CONFIG_CONFIRMED`
- `GET /next` → MCP tool(s): `next_actions`  ·  evidence `CONFIG_CONFIRMED`
- `GET /plans/{name}` → MCP tool(s): `get_plan`  ·  evidence `CONFIG_CONFIRMED`
- `GET /projects` → MCP tool(s): `projects`  ·  evidence `CONFIG_CONFIRMED`
- `GET /projects/{name}` → MCP tool(s): `project_tasks`  ·  evidence `CONFIG_CONFIRMED`
- `GET /registration-status` → MCP tool(s): `registration_status`  ·  evidence `CONFIG_CONFIRMED`
- `GET /settings` → MCP tool(s): `get_settings`  ·  evidence `CONFIG_CONFIRMED`
- `GET /someday` → MCP tool(s): `someday`  ·  evidence `CONFIG_CONFIRMED`
- `GET /users` → MCP tool(s): `list_users`  ·  evidence `CONFIG_CONFIRMED`
- `GET /waiting` → MCP tool(s): `waiting`  ·  evidence `CONFIG_CONFIRMED`
- `GET /{uuid}` → MCP tool(s): `get_task`  ·  evidence `CONFIG_CONFIRMED`
- `POST ` → MCP tool(s): `create_task`  ·  evidence `CONFIG_CONFIRMED`
- `POST /apikey/regenerate` → MCP tool(s): `regenerate_apikey`  ·  evidence `CONFIG_CONFIRMED`
- `POST /login` → MCP tool(s): `login`  ·  evidence `CONFIG_CONFIRMED`
- `POST /register` → MCP tool(s): `register`  ·  evidence `CONFIG_CONFIRMED`
- `POST /{uuid}/annotate` → MCP tool(s): `annotate_task`  ·  evidence `CONFIG_CONFIRMED`
- `POST /{uuid}/done` → MCP tool(s): `complete_task`  ·  evidence `CONFIG_CONFIRMED`
- `POST /{uuid}/start` → MCP tool(s): `start_task`  ·  evidence `CONFIG_CONFIRMED`
- `POST /{uuid}/stop` → MCP tool(s): `stop_task`  ·  evidence `CONFIG_CONFIRMED`
- `PUT /me` → MCP tool(s): `update_profile`  ·  evidence `CONFIG_CONFIRMED`
- `PUT /password` → MCP tool(s): `change_password`  ·  evidence `CONFIG_CONFIRMED`
- `PUT /plans/{name}` → MCP tool(s): `upsert_plan`  ·  evidence `CONFIG_CONFIRMED`
- `PUT /settings` → MCP tool(s): `update_settings`  ·  evidence `CONFIG_CONFIRMED`
- `PUT /users/{target}/role` → MCP tool(s): `set_user_role`  ·  evidence `CONFIG_CONFIRMED`
- `PUT /{uuid}` → MCP tool(s): `modify_task`  ·  evidence `CONFIG_CONFIRMED`

### Tests that already protect this

- `backend/tests/unit/test_audit.py` protects `backend/app/database.py`
- `backend/tests/unit/test_logging.py` protects `backend/app/database.py`
- `backend/tests/unit/test_migrations.py` protects `backend/app/database.py`
- `backend/tests/conftest.py` protects `backend/app/main.py`
- `backend/tests/unit/test_audit.py` protects `backend/app/main.py`
- `backend/tests/unit/test_migrations.py` protects `backend/app/main.py`
- `backend/tests/unit/test_security_wave.py` protects `backend/app/main.py`

### Changed with no import-derived test protection

The index found no test reaching these. That is a claim about imports, not proof
of absence — but it is where a required test most likely belongs.

- `architecture.toml`
- `backend/app/audit.py`
- `backend/app/dependencies.py`
- `backend/app/routers/admin.py`
- `backend/app/routers/auth.py`
- `backend/app/routers/tasks.py`
- `backend/tests/unit/test_audit.py`
- `ops/structure-baseline.toml`

### Blind spots relevant to this answer

- **`BLIND-MCP-001`** — RESOLVED 2026-08-26 by runtime observation. Tool names were recorded as CONTRACT_DECLARED on the belief that fastapi-mcp derives them from route handler names. Booting the app showed otherwise: they are FastAPI operation ids — function, path and method — so `create_task` is really `create_task_tasks_post`, and none of the seven names the README documented existed. The observed list is checked in at ops/surfaces/mcp-tools.json and enforced by RULE-SURF-001. What remains blind is narrower and recorded as RISK-MCP-001: the index still derives its mcp_tool nodes by declaration, so the graph and the snapshot are produced by different means.
- **`BLIND-OPS-001`** — The deploy host's compose file is not in this repository. Its contents were read on 2026-08-24 and are recorded in docs/operations.md, so the mapping from built images to running containers is no longer unknown — but it is a transcription the index cannot verify, and nothing detects drift once the host changes. See RISK-OPS-002.
- **`BLIND-TEST-001`** — Test protection is import-derived. Code exercised only through the FastAPI TestClient — which is how every router in this repository is tested — produces no TESTED_BY edge, because no test imports it. Absence of an edge therefore means 'no import-derived protection', NOT 'untested'. Reported rather than papered over with a naming convention.

Line coverage of [`backend/app/audit.py`](../../backend/app/audit.py) and
[`backend/app/dependencies.py`](../../backend/app/dependencies.py) is 100%, and the whole backend
is 97.0% against the 90% floor (`RULE-TEST-003`) — up from 96.6%. The suite is 254 tests, 41 of
them new.

## Outstanding, and stated as outstanding

**The shim is not removed, and this change cannot remove it.** The instrument is local; the
evidence is only produced by a deployment that runs. `SHIM-SEC-006`'s `evidence:` field now
points at the query and states the asymmetry plainly: rows are proof that a caller depends on the
shape and name them, while *no* rows is a statement about the window you observed and nothing
more. A monthly reconciliation job or a client switched off for a fortnight is exactly what a
short window misses. Removal needs a soak counted from the day this reaches production — a day
that, given `RISK-OPS-002`, has to be observed rather than assumed.

**Nothing prunes the file.** `RISK-OPS-006`, recorded rather than solved. Roughly 150 bytes per
authenticated request, on the same partition as `users.db` and `data/`, with nothing measuring it
and nothing alerting on it. Building a retention policy nobody has agreed to would be inventing
an answer to a question with a legal half.

**No caller fingerprint, and that is an open question with the human.** No IP address, no
user-agent. The schema is flat and nullable specifically so the answer is one additive
`ALTER TABLE` later — and if the answer is yes, the same change has to bring a retention period,
because the reason to hesitate and the reason to prune are the same reason.

**There are now two files to back up.** `users.db` alone is no longer a complete backup of this
deployment's state. `data/` was already in the backup set for the Taskwarrior data, so in
practice the audit log arrives inside an existing one — but the sentence "back up `users.db`" has
stopped being sufficient.

**No foreign keys.** `actor` and `subject` are plain text, so a row survives the deletion of the
account it names — correct for an audit trail, and it does mean nothing enforces that an actor
was ever a real user.

**SEC-5 is instrumented, not fixed.** `GET /auth/apikey` still hands back a permanent unscoped key
in cleartext. Every disclosure is now on the record with a timestamp and an account, which is
worth having and is not the fix.

**The audit schema has no snapshot under `ops/surfaces/`, deliberately.** Generating one the way
`db-schema.sql` is generated would reproduce the fresh-path-only illusion `RISK-SURF-001` records,
for a schema that is not a public surface. A unit test pins the column list instead. Whoever adds
the next column has to land the `CREATE` and an additive `ALTER TABLE` together, or the fresh and
migrated paths part company exactly as `users.api_key` did.

## Follow-on

Step 15e/f: the threat-model document, which does not exist yet; the SEC-5 waiver with an owner
and an expiry; and the residual risks this step's own blind spots create. Then the shim soak, and a
removal change before 2026-11-25 that cites the query rather than a guess. Remaining scope is in
[`docs/plan/STATUS.md`](../plan/STATUS.md) §3.
