# Threat model

**Written 2026-08-28, against commit `e84b2bf`.** Every claim below was read out of the code on that
day and is cited to a file and a line. Nothing re-derives it: this document is an assertion, and its
decay is recorded as `RISK-DOC-003`.

[`docs/plan/phase-0-2.md`](plan/phase-0-2.md), Step 15, asks for it in one sentence:

> `docs/threat-model.md` (trusted actors, untrusted inputs, secrets, side effects, egress,
> persistence, supply chain, abuse cases) with its mechanically enforceable parts entering the gate
> and the rest entering the residual-risk register with re-open triggers.

Those eight headings are the sections below, in that order, and the last clause is why each one ends
the same way.

## How to read it

Every section closes with two lists.

**Enforced** — a property some check in [`tools/checks/profiles.conf`](../tools/checks/profiles.conf)
fails the gate over, named by its rule. If the property stops holding, `./run verify` goes red before
the change can merge. Every rule named here already existed; this document added none. That is a
deliberate choice and [ADR 0027](adr/0027-the-threat-model.md) argues it: a rule invented to make a
prose section look enforced is a rule with no failure anyone has seen, and the gate proves **44**
rules able to fail on every run precisely because none of them are decoration.

**Asserted** — true on 2026-08-28 because somebody read it, and held there by nothing. Each one is
either already in the residual-risk register or was put there by this change. An asserted property is
not a weaker claim about today; it is a claim with no defence against tomorrow.

The distinction is the whole point of writing this down. A threat model that does not say which half
of itself the machine is holding invites the reader to assume all of it.

---

## 1. Trusted actors

**Two roles, and the set is closed.** `VALID_ROLES` is `("admin", "user")` at
[`backend/app/models.py:7`](../backend/app/models.py). The admin API refuses anything outside it at
[`backend/app/routers/admin.py:71`](../backend/app/routers/admin.py); the startup bootstrap writes
only the literal `'admin'`, and only into an instance that has none
([`backend/app/database.py:179-197`](../backend/app/database.py)); the CLI escape hatch constrains
its own argument to the same pair, though it declares a second copy of the tuple rather than
importing the first ([`tools/grant-admin.py:24`](../tools/grant-admin.py)). `admin` may read and
change site settings, list every account, and change any account's role.

**A role is not a data boundary.** Task data is separated by the per-user Taskwarrior data directory
that [`backend/app/services/task_runner.py:79-87`](../backend/app/services/task_runner.py) builds
from the authenticated username — `TASKDATA`, `TASKRC` and `HOME` all point inside it. An admin has
no route to another account's tasks and does not acquire one by being an admin. This matters more
than the role model does: it means a compromised admin account reads *settings and usernames*, not
everybody's data.

**Three actors reach the system, not two.** The browser SPA, which authenticates with a JWT held in
`localStorage` (`token`, `role`, `username` and three more, snapshotted in
[`ops/surfaces/spa.json`](../ops/surfaces/spa.json)); agents and MCP clients, which authenticate with
a permanent API key; and the operator with shell on the deploy host, who is outside every control in
this repository. The third is the largest trusted actor and there is exactly one of them
(`RISK-GOV-001`), which is also why nothing here can be enforced by review.

**The frontend's role check is decoration.** `auth.role` is read from `localStorage`, so a viewer can
make the admin UI render for themselves; every `/admin` route is guarded server-side, so the result is
a screenful of 403s rather than access. `RISK-SEC-001`.

**Nobody can lock the instance out of administration.** `bootstrap_admin` at
[`backend/app/database.py:158-197`](../backend/app/database.py) promotes `BOOTSTRAP_ADMIN` **only
when the database contains no admin at all**, so it cannot contradict a decision made through the
API; and the last-admin guard at
[`backend/app/routers/admin.py:100-119`](../backend/app/routers/admin.py) answers `409` rather than
removing the final administrator. [ADR 0017](adr/0017-admin-bootstrap-and-route-guards.md) records
both.

**Enforced**
- `RULE-SEC-001` — every route in [`backend/app/routers/`](../backend/app/routers) declares its guard
  in [`rules/route-guards.toml`](../rules/route-guards.toml), the declaration must match the guard the
  handler's parameter defaults actually enforce, and an `open` route must carry a reason. Thirty-one
  routes: twenty-four `user`, four `admin`, three `open`.
- `RULE-GOV-001` — the live branch protection matches [`ops/github/ruleset.json`](../ops/github/ruleset.json),
  so the rule that an unverified commit cannot reach `main` is itself checked-in state.
- `RULE-TEST-001` and `RULE-TEST-002` — the bootstrap branches, the last-admin refusal and the
  cross-tenant isolation tests run on every gate, the second against the real Taskwarrior binary.

**Asserted**
- **The route-guard rule does not see the whole surface.** `tools/checks/route_guards.py` globs
  `backend/app/routers/*.py` only. The served schema has **32** operations
  ([`ops/surfaces/openapi.json`](../ops/surfaces/openapi.json)) and the declaration file has 31: the
  odd one is `GET /health` at [`backend/app/main.py:91-93`](../backend/app/main.py), declared on the
  app object. Harmless in itself, and the proof that the next route added there would need no guard
  declaration. `RISK-SEC-005`.
- The `role` column is `TEXT` with no database constraint, so a value written outside the application
  is not rejected — closed rather than open, since an unrecognised value is not `admin`. `RISK-SEC-002`.
- One maintainer means no independent review of a change to the rules themselves. `RISK-GOV-001`.
- The deploy host operator is trusted absolutely and nothing here observes them. `RISK-OPS-002`.

---

## 2. Untrusted inputs

Everything a caller sends is untrusted. Three kinds of it matter, and they matter for different
reasons.

### Free text that reaches a subprocess argv

Task descriptions, annotation text and inbox notes travel from a request body into the argument list
of the `task` binary. Taskwarrior consumes `rc.<key>=<value>` **anywhere in its argument list** as a
runtime configuration override, including `rc.data.location`, which chooses which data store it opens
— the only tenancy boundary the system has. That was finding SEC-3, and it was confirmed against the
real binary on 2026-08-25 rather than assumed; the transcript is in the module docstring at
[`backend/app/services/task_runner.py:13-16`](../backend/app/services/task_runner.py).

Two controls, in order, both in that file:

1. **`--`.** `SEPARATOR = "--"` (line 48) and `cmd += [SEPARATOR, *text]` (lines 90-91). Everything
   after it is free text, so an override in a description is inert *by Taskwarrior's own grammar*
   rather than by our filtering. This is the primary control and it does not depend on us enumerating
   dangerous shapes correctly.
2. **`reject_structural_tokens`** (lines 55-67), refusing any token matching `^rc\.` in the positions
   `--` cannot cover — filters and modifiers, which have to stay parseable. Defence in depth.

`shell=False` follows from the list form at line 93, so no shell metacharacter can start a process;
that was never the vulnerability, and saying so is worth a line because the linter's `S603` finding
is about the wrong risk. [ADR 0019](adr/0019-the-taskwarrior-argv-boundary.md) records the whole
boundary. Structured fields are validated separately before they get near it:
[`backend/app/services/task_service.py:6-11`](../backend/app/services/task_service.py) pins UUID,
priority and tag shapes, and line 64-67 pins the recurrence grammar.

One historical detail is worth keeping visible: `create_task` used to re-query by
`["description:" + task.description]`, putting the same user string into a *filter* position, which
is the one place `--` cannot protect. It is now `+LATEST`, Taskwarrior's own virtual tag
([`task_runner.py:116-122`](../backend/app/services/task_runner.py)).

### Request bodies

Pydantic models at [`backend/app/models.py`](../backend/app/models.py) constrain types. They
constrain nothing else — there is no `Field(max_length=...)`, no `constr`, no bound of any kind on
any string field in that file. `RISK-SEC-004`.

### Headers, and the three credential shapes

`get_current_user` at [`backend/app/dependencies.py:12-66`](../backend/app/dependencies.py) accepts
`X-Api-Key` (line 33), `Authorization: Bearer <jwt>` (line 41), and — last, only after a JWT decode
fails — an API key in the Bearer slot (line 58). The third is `SHIM-SEC-006`, kept because every
agent and MCP client sends it today, and it now leaves a distinguishable trace: each successful
authentication records which shape let it in (`api-key-header`, `bearer-jwt`, `bearer-api-key`, at
[`backend/app/audit.py:98-100`](../backend/app/audit.py)).

Two header-shaped inputs are deliberately never trusted. `X-Request-Id` is **not** read from the
request — the correlation id is minted locally, because an inbound one would be attacker-controlled
text copied verbatim into every log line of the request, which is how a log injection reads
([`backend/app/middleware.py:48-51`](../backend/app/middleware.py)). And the audit log stores the
route *template*, never the requested path, because a path is caller-controlled text that really does
arrive with a credential in it ([`backend/app/audit.py:258-273`](../backend/app/audit.py)).

Cross-origin access is closed by default: CORS middleware is mounted only when `CORS_ORIGINS` is
non-empty ([`backend/app/main.py:68-76`](../backend/app/main.py)), which is correct for every shape
this repository ships, since the SPA reaches the API through a same-origin `/api` proxy. Finding
SEC-4 was the previous pairing of `allow_origins=["*"]` with `allow_credentials=True`.

**Enforced**
- `RULE-ARCH-004` — `subprocess` may be imported nowhere under `backend/app/` except
  `task_runner.py` ([`architecture.toml:239-249`](../architecture.toml)). This is what makes the argv
  hardening a control rather than a convention: one door, and it is guarded.
- `RULE-TEST-002` — the argv boundary is re-proven against Taskwarrior 3.5.0 in the container tier,
  including the cross-tenant isolation tests, so the `--` behaviour this rests on is verified against
  the binary rather than remembered.
- `RULE-SURF-001` and `RULE-SURF-002` — the request surface itself is snapshotted, so a new field or
  a new route cannot arrive unremarked.
- `RULE-DEP-004` — the `task` binary is pinned to a dated Arch archive snapshot, so the grammar the
  first control depends on cannot change under a rebuild.

**Asserted**
- No length limit on any request field, and no body-size limit from uvicorn or Starlette. A capacity
  question, excluded by decision **F1** and recorded rather than assumed. `RISK-SEC-004`.
- `--` is a property of a third-party argument parser. It is pinned and tested, not owned.
- The audit log's route template protects one sink. Nothing structurally prevents a future call site
  from logging a raw path.

---

## 3. Secrets

Four kinds, and each is handled differently because each fails differently.

**`JWT_SECRET`** — the only thing standing between an attacker and a forged token for any account.
[`backend/app/startup_checks.py:36-61`](../backend/app/startup_checks.py) refuses to start on an
empty secret, on any of the five published defaults this repository has ever shipped (lines 18-26),
or on one shorter than 32 characters. The check runs from the lifespan at
[`backend/app/main.py:28`](../backend/app/main.py), *before* the database and before anything binds.
The working default at [`backend/app/config.py:9`](../backend/app/config.py) is retained so
`import app.main` succeeds with no environment, and it is inert: a serving process cannot hold it.
That was finding SEC-1.

**Password hashes** — bcrypt through passlib
([`backend/app/auth.py:8`](../backend/app/auth.py)). A hash is treated as credential-equivalent
throughout, because it is offline-attackable.

**API keys** — `secrets.token_urlsafe(32)` at
[`backend/app/database.py:138-147`](../backend/app/database.py), so guessing one is not the threat.
**Storing one is.** They are held in `users.db` as the cleartext value that authenticates, they are
permanent, unscoped and un-expiring, and `GET /auth/apikey` hands the value back in cleartext
([`backend/app/routers/auth.py:190-209`](../backend/app/routers/auth.py)). That is finding **SEC-5**,
severity High, and it is the one open finding of its severity in this repository. It is not fixed
here: the fix changes that endpoint's response contract, which decision **F2** makes a public-surface
migration with its own step. It now has an owner and a date — `WAIVER-SEC-003`, expiring 2027-01-31
in [`rules/waivers.yaml`](../rules/waivers.yaml).

**The log stream** — the place all three of the above most easily end up. Two halves of one control,
and neither is sufficient alone:

- *By name, statically.* `RULE-OPS-002` parses every tracked file under `backend/app/` and refuses a
  credential-bearing expression at a logging call ([ADR 0023](adr/0023-no-secrets-in-logs.md)). It
  landed before there was any logging to break it.
- *By value shape, at runtime.* The filter at
  [`backend/app/logging_setup.py:236-257`](../backend/app/logging_setup.py) is attached to the
  handler, so every emitted line passes through it whatever logger produced it — uvicorn's access
  lines included. It removes a value by the name it arrives under (lines 62-87), by shape — JWT,
  bcrypt hash, and the 43-character `token_urlsafe(32)` an API key is (lines 102-106) — and by
  matching the resolved `JWT_SECRET` literally (lines 125-134).

The same `redact_text` is reused as a backstop on every string written to the audit database
([`backend/app/audit.py:197-206`](../backend/app/audit.py)), so a credential cannot be persisted
there even by a future call site that gets it wrong.

`JWT_SECRET` reaches the deploy host through a `.env` file beside the compose file, referenced as
`${JWT_SECRET}` at [`ops/deploy/docker-compose.yml:26`](../ops/deploy/docker-compose.yml) and never as
a literal.

**Enforced**
- `RULE-OPS-002` — no credential-bearing expression at a logging call, checked in source.
- `RULE-HYG-001` and `RULE-HYG-002` — `users.db`, `data/` and `.env` are untracked *and* git-ignored,
  both directions checked ([`.gitignore:1-3`](../.gitignore)).
- `RULE-HYG-003` — the checked-in deploy compose file must reference every secret as `${VAR}`. A
  literal replacing a reference there looks like almost nothing in a diff, which is exactly why.
- `RULE-DEP-003` — no credential is committed anywhere in the tree.
- `RULE-RULE-002` — `WAIVER-SEC-003` cannot silently outlive 2027-01-31; the gate stops on the date.
- `RULE-TEST-001` — the boot refusal, the redaction filter and the "no credential anywhere in the
  audit database" adversarial test all run every gate.

**Asserted**
- The static rule matches names, so a credential under a neutral name is invisible to it.
  `RISK-OPS-004`.
- The runtime filter matches shapes, so a credential with no recognisable shape — a plain password is
  the case that matters — passes it. `RISK-OPS-005`.
- API keys sit in cleartext in `users.db` and in every backup of it. `WAIVER-SEC-003`, and the
  mitigation is observation, not prevention: `auth.apikey.disclosed` records that a key was handed
  out, which says nothing about a key read from the file directly.
- Secret scanning is pattern-based and reads only the current tree. `RISK-DEP-002`.
- `passlib` has been unmaintained since 2020 and holds `bcrypt` frozen at 4.0.1. `RISK-DEP-003`.

---

## 4. Side effects

Everything this application does to the world outside its own process, exhaustively:

| Effect | Where | Bound |
|---|---|---|
| Execute the `task` binary | [`task_runner.py:93-100`](../backend/app/services/task_runner.py) | `timeout=10`, `shell=False`, argv validated, one call site |
| Write `users.db` | [`database.py:89-92`](../backend/app/database.py) via `get_db` | the only module permitted to open a connection |
| Write `data/audit.db` | [`database.py:119-135`](../backend/app/database.py) via `audit_connection` | 5s lock wait; a failed write logs and the request still succeeds |
| Create a user's data directory and copy a `.taskrc` into it | [`user_service.py:9-14`](../backend/app/services/user_service.py) | once, at registration |
| Write lines to stdout | [`logging_setup.py:290-297`](../backend/app/logging_setup.py) | one handler, one formatter, one redaction filter |

That is the complete list. `grep` for `subprocess` across `backend/app/` returns exactly one import
and one call, both in `task_runner.py`. There is no file write outside the two `mkdir` calls above, no
mail, no queue, no scheduler, no background task.

The single-choke-point property is the structurally important one. It is why the argv hardening in
§2 is a control: a second caller of `subprocess` would bypass both the separator and the override
refusal with nothing going red — which is what `RULE-ARCH-004` exists to make impossible.

**Enforced**
- `RULE-OPS-001` — every blocking outward call the serving application makes declares a timeout at
  the call site, and both arms are proven able to fail: the subprocess arm by deleting the real
  `timeout=10`, the egress arm by introducing an HTTP client
  ([ADR 0022](adr/0022-timeouts-are-declared.md)).
- `RULE-ARCH-004` — one door to `subprocess`.
- `RULE-ARCH-001`, `RULE-ARCH-002`, `RULE-ARCH-003` — which unit may reach which, no new cycles, and
  fan-in against [`ops/structure-baseline.toml`](../ops/structure-baseline.toml). The audit writer's
  fan-in of five is a number in that file, so a sixth dependent — meaning a new class of recorded
  event — is a reviewable change rather than a silent one.

**Asserted**
- `RULE-OPS-001` checks that a timeout is *declared*, not that it is sensible, and it knows only the
  call shapes it has been taught. `RISK-OPS-003`.
- A failed audit write logs and continues, so a missing row is not the same as a missing event. The
  line that says so is the thing to grep for before concluding otherwise
  ([ADR 0026](adr/0026-the-audit-log.md)).

---

## 5. Egress

**There is none.** Verified 2026-08-28 by searching every file under `backend/app/` for `httpx`,
`requests`, `urllib`, `aiohttp`, `socket`, `smtplib` and `http.client`: no import of any of them
exists. The serving process opens no outbound connection at all. Its only outward call is the
Taskwarrior subprocess, which reads and writes a local directory.

This is the shortest section in the document and the one most likely to stop being true, so it is
worth being precise about what holds it. `RULE-OPS-001`'s egress arm requires a timeout on an HTTP
call *once one exists* — it makes the first outbound call survivable, not visible. Nothing forbids
one, nothing announces one, and `httpx` is already installed as a transitive dependency of `mcp`
([`backend/requirements.lock`](../backend/requirements.lock)), so adding one is an import away.
`RISK-OPS-007`.

Two kinds of network activity happen *around* the application and are not egress from it. The
container images are built with network access — `pacman` against a pinned Arch archive snapshot at
[`backend/Dockerfile:19-22`](../backend/Dockerfile) — and the deploy host pulls images from `ghcr.io`.
Both are supply chain, §7, not runtime.

Inbound, the deployment publishes no ports: traffic arrives through Traefik on an external network,
TLS terminated by Let's Encrypt, routed to the frontend on port 4000
([`ops/deploy/docker-compose.yml:87-96`](../ops/deploy/docker-compose.yml)). The backend is not
reachable from outside the compose network except through the frontend.

**Enforced**
- `RULE-OPS-001` — the first egress call, whenever it arrives, must declare a timeout. The egress arm
  has a negative fixture, so this is a proven failure and not a hope.
- `RULE-DEP-004` — build-time network fetches come from pinned digests and a dated archive, so "the
  build has network" does not mean "the build has whatever was published today".

**Asserted**
- **Nothing keeps the no-egress property true.** An agent adding an outbound call would satisfy every
  rule in the gate, and this section would silently become wrong. `RISK-OPS-007`.
- The inbound topology is a transcription of the host, not an observation of it. `RISK-OPS-002`.

---

## 6. Persistence

Four stores, three of them on one partition on the deploy host.

**`users.db`** — accounts, password hashes, API keys, roles, profile fields, project plans and site
settings. Four tables, created and migrated at
[`backend/app/database.py:13-59`](../backend/app/database.py) and lines 65-70. Bind-mounted from
`/opt/services/runway/users.db` ([`ops/deploy/docker-compose.yml:22-24`](../ops/deploy/docker-compose.yml)).
Its schema is a protected surface, snapshotted at
[`ops/surfaces/db-schema.sql`](../ops/surfaces/db-schema.sql).

**`data/audit.db`** — the audit trail. One table, ten columns, created at
[`backend/app/audit.py:142-155`](../backend/app/audit.py). It lives under `DATA_ROOT` because that is
the only directory either compose file bind-mounts; anywhere else inside the container it would be
silently emptied by the next deploy while continuing to look present. It holds no credential and no
caller fingerprint — no IP address, no user-agent — which is a deliberate deferral of a retention
question, recorded in [ADR 0026](adr/0026-the-audit-log.md).

**The Taskwarrior data directory** — `DATA_ROOT/<username>/`, holding a TaskChampion SQLite file and
a `.taskrc`, created at
[`backend/app/services/user_service.py:9-14`](../backend/app/services/user_service.py) and addressed
only through `TASKDATA` at
[`backend/app/services/task_runner.py:79-87`](../backend/app/services/task_runner.py). **This is the
tenancy boundary**, which is why §2 is as long as it is.

**The browser** — `localStorage` holds `token`, `role`, `username`, `email`, `fullName` and `theme`
([`ops/surfaces/spa.json`](../ops/surfaces/spa.json)). A JWT in `localStorage` is readable by any
script running on the origin; the compensating position is that the app serves no third-party script
and CORS is closed.

**Enforced**
- `RULE-SURF-001` — the migrated database schema, the served OpenAPI schema, the runtime MCP tool
  list, the Taskwarrior template and the SPA's routes and `localStorage` keys are all snapshotted, so
  none of them moves silently.
- `RULE-HYG-001` and `RULE-HYG-002` — no store is tracked in git, and `.gitignore` covers each.
- `RULE-TEST-002` — cross-tenant isolation is tested against the real binary, so the boundary these
  directories provide is exercised rather than reasoned about.

**Asserted**
- **A fresh database and a migrated one do not have the same schema, and the snapshot only ever
  describes the fresh one.** `CREATE_USERS` declares `api_key TEXT UNIQUE`; the migration that
  back-fills the column declares plain `TEXT`, because SQLite cannot add a `UNIQUE` column by
  `ALTER TABLE`. Production is the migrated kind. `RULE-SURF-001` compares the snapshot against
  itself and passes. `RISK-SURF-001`.
- **Nothing prunes `audit.db`**, and nothing measures it. Roughly one row per authenticated request,
  on the same partition as `users.db` and the task data. `RISK-OPS-006`.
- There are now two files to back up. `users.db` alone is no longer a complete backup of this
  deployment's state.
- Backups themselves are outside this repository entirely — nothing here creates, encrypts, verifies
  or restores one, and API keys in a backup are the second half of `WAIVER-SEC-003`.

---

## 7. Supply chain

Everything that enters the running image is pinned by content, not by name.

- **Base images by digest.** `archlinux@sha256:b860af…` and `python:3.12-slim@sha256:7a8b47…`
  ([`backend/Dockerfile:1`, `:25`](../backend/Dockerfile)); `node:20-alpine@sha256:fb4cd1…` and
  `nginx:alpine@sha256:db35bf…` ([`frontend/Dockerfile:1`, `:8`](../frontend/Dockerfile)).
- **The `task` binary from a dated archive snapshot.** `archive.archlinux.org/repos/2026/08/25`
  ([`backend/Dockerfile:19-22`](../backend/Dockerfile)), with `pacman -Syu` rather than the
  partial-upgrade `pacman -Sy` that finding SEC-9 was about. A digest alone would not have pinned it,
  because `pacman` fetches from a live mirror.
- **Python dependencies hash-pinned.** [`backend/requirements.lock`](../backend/requirements.lock) is
  `uv pip compile --generate-hashes` output; every install verifies the hash.
- **Licences classified.** [`policy/licenses.yaml`](../policy/licenses.yaml) classifies all 305
  installed dependencies across both ecosystems into `allowed`, `review`, `forbidden` and `unknown`
   — and `unknown` fails closed, because a dependency whose licence nobody could determine is not one
  whose licence is fine, it is one nobody has looked at. [ADR 0021](adr/0021-supply-chain-pinning.md).
- **The build platform pinned** to `linux/amd64`, and the images CI pushes are the images that run:
  both services on the host name `ghcr.io/ulrichschinz/runway-*`
  ([`ops/deploy/docker-compose.yml:20`, `:64`](../ops/deploy/docker-compose.yml)).

**Enforced**
- `RULE-DEP-004` — base images by digest, Arch packages from a dated archive, Python from a
  hash-pinned lock.
- `RULE-DEP-002` — every dependency's licence classified, and not forbidden, unclassified or an
  unapproved review case.
- `RULE-DEP-001` — the backend imports cleanly from its pinned set. This rule exists because of a
  real outage: an unpinned transitive `mcp` broke the import and two green deploys shipped a backend
  that could not start ([ADR 0004](adr/0004-pin-transitive-mcp.md)).
- `RULE-DEP-003` — no credential committed.
- `RULE-TI-002` — the runtime versions in `tools/versions.env` match what the Dockerfiles build on.

**Asserted**
- **`passlib` 1.7.4 is the latest release and it is from 2020-10-08** — unmaintained, not merely
  pinned, and it is the only thing hashing passwords here. `bcrypt` is held at 4.0.1 because passlib
  reads an attribute bcrypt removed; bcrypt 5.0.0 does not warn, it fails every hash. A
  security-relevant dependency frozen in place by a dead one, and Dependabot will keep offering the
  bump that breaks every login. `RISK-DEP-003`.
- The Arch archive snapshot is a date somebody must move deliberately. Nothing announces that a
  pinned date has aged, and a snapshot left alone accumulates unpatched packages. `RISK-DEP-001`.
- Pinning is not provenance. Nothing here verifies image signatures or attestations, and a digest
  says *what* was used, not that it was trustworthy when it was published.
- `platforms: linux/amd64` is a declaration nothing inspects. `RISK-OPS-001`.

---

## 8. Abuse cases

Six, each with what actually stops it and what does not.

### Credential stuffing against `POST /auth/login`

**Stopped by** a fixed-window attempt counter checked *before* the password is verified, so a
locked-out username does not buy an attacker the bcrypt work as a lever
([`backend/app/rate_limit.py:46-57`](../backend/app/rate_limit.py), called at
[`backend/app/routers/auth.py:79`](../backend/app/routers/auth.py)). Ten attempts per five minutes by
default. An unknown username counts too, deliberately: skipping it would turn the limiter into a user
enumeration oracle, and the log line and the audit row are written not to distinguish "no such
account" from "wrong password" for exactly the same reason (lines 100-111). Every failure is an audit
row.

**Not stopped:** the limiter is keyed on **username, not IP**, which is a deliberate trade in both
directions — an attacker rotating source addresses is unaffected by an IP limiter, and someone who
knows a username can deny it password login for the window. It is also in-process and per-worker, so
it is the whole population only under one host and one worker (decision **F1**). `RISK-SEC-003`.

### API key theft

**The exposure:** the key is stored in cleartext, is permanent, unscoped and un-expiring, and
authenticates on every route including the admin ones when the account holds that role. A stolen key
survives a password change. `users.db` is a bind-mounted file and is in every backup.

**Partially mitigated:** every disclosure through `GET /auth/apikey` writes an
`auth.apikey.disclosed` row, and every authenticated request records the credential shape and the
route, so a stolen key's *use* is reconstructable and rotation is one `POST` away. That is
observation, not prevention, and it says nothing about a key read from the file directly.
`WAIVER-SEC-003`, expiring 2027-01-31.

### The compatibility shim

`SHIM-SEC-006` accepts an API key in the Bearer slot. It is not a vulnerability — the same credential
is accepted in the correct header — but it is an accepted-but-deprecated shape past one removal date
already, and every one of those becomes permanent by default rather than by decision. It is tried
**last**, only after a JWT decode fails, so it costs one database read for a credential that was
going to be rejected anyway.

**Held by** `RULE-SEC-002`, which fails the gate on 2026-11-25. **Answerable now** because the audit
log records which of the three shapes authenticated, on which route — the query is written out in
[`docs/operations.md`](operations.md#the-audit-log). **Not answered:** rows are positive evidence and
their absence is only a statement about the observed window, so removal needs a soak on the real
deployment, which nothing local produces.

### Administrator escalation

**Stopped by** the two guards in §1: the bootstrap fires only into an instance with no admin at all,
so it cannot contradict a decision made through the API and cannot lock anyone out; and the last
administrator cannot be demoted. Both branches are audited, including the refusal and including
`noop: an admin already exists`, which is the evidence that the recovery path did *not* fire on a
given start ([`backend/app/main.py:38-42`](../backend/app/main.py)).

**Not stopped:** anyone with shell on the deploy host can write the `role` column directly, and
nothing at the database level would refuse it. `RISK-SEC-002`.

### Log and audit poisoning

**Stopped by** minting the correlation id locally rather than reading `X-Request-Id`
([`backend/app/middleware.py:48-51`](../backend/app/middleware.py)), by storing route templates rather
than requested paths ([`backend/app/audit.py:258-273`](../backend/app/audit.py)), and by
`json.dumps` — a JSON-per-line stream is not line-oriented text a newline can forge a record in.

**Bounded by** the fact that only *successful* authentication writes a row, so an unauthenticated
caller cannot append to a file nothing prunes; login failures are the exception and the per-username
limiter bounds them ([ADR 0026](adr/0026-the-audit-log.md)). A caller cycling usernames can still
append faster than a legitimate one. `RISK-OPS-006`.

### Denial of service

Largely **out of scope by decision F1**, and stated rather than assumed. What exists: `timeout=10` on
the Taskwarrior call, so a hung binary is a failed request rather than a worker that never returns;
`restart: unless-stopped` and healthchecks in both compose files; container log rotation at 50 MB per
service, checked in. What does not exist: any request size limit (`RISK-SEC-004`), any pruning of
`audit.db` (`RISK-OPS-006`), any capacity budget, and any measurement of the partition all three
stores share.

---

## What this model deliberately does not cover

Decision **F1** of [`docs/plan/phase-0-2.md`](plan/phase-0-2.md) puts horizontal scaling, high
availability and multi-tenant SaaS operation out of scope, and requires load, latency and capacity
budgets to be **written down as excluded rather than silently assumed covered**. This section is that
record, and [`AGENTS.md`](../AGENTS.md) §10 carries the short form.

- **Load, latency and capacity are not modelled.** Single host, single operator, single worker.
  Several controls above depend on that and say so — the login limiter's counters are per-process
  (`RISK-SEC-003`), and the three stores sharing one partition is only survivable at this size
  (`RISK-OPS-006`).
- **Nothing here reaches production.** Every claim about the deploy host is a transcription of a read
  taken on a date, and nothing continuously compares the checked-in copy against the host
  (`RISK-OPS-002`). CI has no host access; closing it needs a scheduled job somewhere that does.
- **Physical, host and network security are outside the boundary.** No claim is made about the
  operating system, the SSH configuration, Traefik, TLS renewal, or backups.
- **Frontend rendering, routing and gestures are untested** (`RISK-TEST-004`), and the container test
  tier cannot run on arm64 (`RISK-TEST-001`).
- **This document is not an audit.** It is what one reading of the code on one day found, written so
  the next reader can check it rather than trust it. `RISK-DOC-003`.
