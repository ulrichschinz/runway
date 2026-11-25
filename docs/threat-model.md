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

**A role is not a data boundary.** Task data is separated by the per-account Taskwarrior data
directory that [`backend/app/task_storage.py`](../backend/app/task_storage.py) resolves from the
account's random, immutable `storage_id` — never from the username since brief 0065 (finding
SEC-001) — and that [`backend/app/services/task_runner.py`](../backend/app/services/task_runner.py)
hands to the binary as `TASKDATA`, `TASKRC` and `HOME`. An admin has
no route to another account's tasks and does not acquire one by being an admin. This matters more
than the role model does: it means a compromised admin account reads *settings and usernames*, not
everybody's data.

**Three actors reach the system, not two.** The browser SPA, which authenticates with a JWT held in
`localStorage` (`token`, `role`, `username` and four more, snapshotted in
[`ops/surfaces/spa.json`](../ops/surfaces/spa.json)); agents and MCP clients, which authenticate with
a permanent API key — over MCP they reach only the task, GTD, project and inbox operations plus
`health` and `me`, never an authentication, API-key, user or admin operation (ADR 0037); and the
operator with shell on the deploy host, who is outside every control in this repository. The third is the largest trusted actor and there is exactly one of them
(`RISK-GOV-001`), which is also why nothing here can be enforced by review.

**The frontend's role check is decoration.** `auth.role` is read from `localStorage`, so a viewer can
make the admin UI render for themselves; every `/admin` route is guarded server-side, so the result is
a screenful of 403s rather than access. `RISK-SEC-001`.

**Nobody can lock the instance out of administration.** `bootstrap_admin` at
[`backend/app/database.py:158-197`](../backend/app/database.py) promotes `BOOTSTRAP_ADMIN` **only
when the database contains no admin at all**, so it cannot contradict a decision made through the
API; and the last-admin guard answers `409` rather than removing the final administrator.
[ADR 0017](adr/0017-admin-bootstrap-and-route-guards.md) records both. The guard is
`database.admin_preserving_write` at [`backend/app/database.py`](../backend/app/database.py): one
`BEGIN IMMEDIATE` transaction with the admin count checked **after** the write, so two concurrent
demotions cannot both pass it (REV-002, closed by
[brief 0068](briefs/0068-the-last-admin-survives-concurrent-writes.md)); the role route, account
deletion and `./run grant-admin --role user` all run through it (the CLI with its own `BEGIN IMMEDIATE`
on its own connection), and parallel tests — two connections with a barrier, and the CLI against a request's
guard held open mid-write (`backend/tests/unit/test_last_admin_concurrency.py`) — run on every gate. It holds for
every writer of the same `users.db` on one host; it relies on SQLite file locking, so a database on a
filesystem without working locks would void it (not a supported deployment).

**Enforced**
- `RULE-SEC-001` — every route the booted application serves declares its guard in
  [`rules/route-guards.toml`](../rules/route-guards.toml), the declaration must match the guard the
  route's resolved dependency tree enforces, and an `open` route must carry a reason. Fifty routes:
  thirty-three `user`, four `admin`, thirteen `open` (brief 0073).
- `RULE-GOV-001` — the live branch protection matches [`ops/github/ruleset.json`](../ops/github/ruleset.json),
  so the rule that an unverified commit cannot reach `main` is itself checked-in state.
- `RULE-TEST-001` and `RULE-TEST-002` — the bootstrap branches, the last-admin refusal and the
  cross-tenant isolation tests run on every gate, the second against the real Taskwarrior binary.

**Asserted**
- **The route-guard rule sees what the application object serves, not what is in front of it.** Since
  brief 0073 the inventory is the booted app (`GET /health`, `/mcp` and the documentation routes
  included). What it cannot see: a path nginx answers itself, and a handler that authenticates inside
  its body instead of by dependency (classified `open`, so it must be declared with a reason).
  `RISK-SEC-005`.
- The `role` column refuses anything but `user` and `admin` (`CHECK`, schema version 1, brief 0073) —
  once the database has reached version 1, which a hand-written role prevents. `RISK-SEC-002`.
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

1. **`--`.** `SEPARATOR = "--"` (line 78) and `cmd += [SEPARATOR, *text]` (lines 131-133). Everything
   after it is free text, so an override in a description is inert *by Taskwarrior's own grammar*
   rather than by our filtering. This is the primary control and it does not depend on us enumerating
   dangerous shapes correctly.
2. **`reject_structural_tokens`** (lines 97-109), refusing any token matching `^rc\.` in the positions
   `--` cannot cover — filters and modifiers, which have to stay parseable. Defence in depth.

`shell=False` follows from the list form at line 135, so no shell metacharacter can start a process;
that was never the vulnerability, and saying so is worth a line because the linter's `S603` finding
is about the wrong risk. [ADR 0019](adr/0019-the-taskwarrior-argv-boundary.md) records the whole
boundary. Structured fields are validated separately before they get near it:
[`backend/app/services/task_service.py:8-25`](../backend/app/services/task_service.py) pins UUID,
priority and tag shapes (`TAG_RE` for a tag written or added, the looser `EXISTING_TAG_RE` for a
stored tag being removed, whose first character still excludes a digit or `.`, because the
binary reads `-1abc` as description text), and lines 277-280 pin the recurrence grammar. A tag removal is a `-tag`
modifier and goes before `--` like every other modifier; after it, it would be description text.

### The account name, which used to be a path

A username is chosen by whoever registers. Until brief 0065 it was also the name of the
Taskwarrior directory, so `alice/../alice` was alice's store and `../x` a directory outside the
data root (finding SEC-001, reproduced in both test tiers on `5d85f6e`). **Enforced:** the store is
named by a random `storage_id` and resolved in one module (`RULE-SEC-003`); the HTTP path is pinned
by `tests/unit/test_storage_identity.py` and, against the real binary, by
`tests/container/test_storage_isolation.py`. **Asserted only:** that production holds no alias
account created before the change, that the production data volume does not fold case or Unicode
normalisation, and that no legacy account is served once the switch is made — all depend on the
operator (M0 checks, the migration, `TASK_STORAGE_MODE=strict`, which the startup line confirms)
(`RISK-SEC-006`).

### Values that must stay parseable: filters and modifiers

A filter or a modifier cannot sit behind `--`, so the second control is all that stands there,
and it only knows the `rc.` shape. Since [ADR 0038](adr/0038-validated-filters-and-exact-project-match.md)
every such value is also shaped before it is built into a token: the project name
(`PROJECT_RE` in [`backend/app/models.py`](../backend/app/models.py) — no control characters,
parentheses, quotes, backslash, `:`, `/ ? # %`, no leading sign or space, at most 100
characters), each filter tag (`TAG_RE`, at most ten of them, at most 100 characters each), and
the four date filters (`YYYY-MM-DD` only, then compared in Python — Taskwarrior's own date
grammar never sees them). The text search `q` is the opposite case and is listed here so it is
not mistaken for one: it is bounded at 200 characters and compared in Python against the
exported descriptions, so no part of it is ever built into a token — a description filter would
put the user's own words back into the one position `--` cannot protect, which is the mistake
`create_task` made below. Validation runs before the export, so a refused value never reaches
an argument vector at all; `backend/tests/unit/test_tasks.py` asserts exactly that for a fuzz
list, and the container tier repeats it against the binary.

The four date **modifiers** — `due`, `scheduled`, `wait`, `until` on create and modify — sit in
the same position. Finding SEC-007 asked whether `due:2026-01-01 rc.data.location=<victim>` would
redirect the store, since `reject_structural_tokens` only refuses a token that *starts* with
`rc.`. **Enforced, for Taskwarrior 3.5.0:** it does not — the binary lexes a date value
(`now + 1d` evaluates) but drops an embedded `rc.` or `rc:` term, and the value is one argv
element with no shell. `TestDateValuesAreOneArgument` in `backend/tests/container/test_real_task.py`
proves it for every field and nine payload shapes (space, tab, newline, the override as the whole
value, an `rc:` file, three shell forms), past the service, next to positive controls showing
that a standalone override does redirect and a standalone `rc:` file is loaded (its launch hook
runs, its `default.project` applies). On top, as defence in depth and not as the control the
refutation rests on, the service holds a date to one word — `DATE_VALUE_RE`, ASCII letters,
digits and `: + - .` (brief 0074) — so whitespace, `=`, `/`, quotes, shell characters and control
characters never reach the argv; and `DATE_DOM_RE` refuses a dot next to a letter and `rc:` at a
word start, so no DOM reference (`rc.<key>`, `system.os`, `tw.version`, `1.due`) and neither the
colon spelling of an override (`rc.data.location:<dir>`) nor the rc-file form (`rc:<file>`) reaches
it either. The documented `YYYY-MM-DD`/`YYYY-MM-DDTHH:MM` and every one-word Taskwarrior date
expression still do. Those colon forms are inert inside a date on 3.5.0 too (rc 2, in the
regression's payloads), but a DOM reference is not: 3.5.0 evaluates it and echoed the result in
its refusal — `rc.data.location` gave the store's absolute path, a disclosure through the same
field (second review of brief 0074). Besides the grammar, `_run` answers any rc-2 stderr that names
the data directory with a generic 400 and logs it. **Asserted only:** that another Taskwarrior version behaves the
same. The re-open trigger is executable — a major or minor upgrade fails the container tier until
the regression is re-run and `DATE_EVIDENCE_VERSION` moved ([operations](operations.md#upgrading-taskwarrior));
a redirect seen then is a new finding, not SEC-007 reinterpreted.

Two exclusions are worth naming. `/ ? # %` are refused not because Taskwarrior minds them but
because fastapi-mcp 0.4.0 substitutes a path parameter into the URL unencoded, so a project
named `a/b` would address a different route over MCP. That refusal only ever covered *new*
names, and an MCP caller can send any value: finding REV-005 showed `uuid="../auth/apikey"`
reaching a REST-only route. Since brief 0071 every MCP path argument is percent-encoded (which
stops dot segments and query or fragment splitting; an encoded `/` is still decoded before routing)
and `bind_mcp_target` refuses a call whose selected route is not its tool's own — the only control
for a value that selects a sibling route, such as a `/` or the name `plans`
(enforced: `backend/tests/unit/test_mcp_target_binding.py`, ADR 0045). And a value a client merely resends —
a tag the task already carries, the project it already has — is deliberately **not** validated:
live users hold data that predates these rules, and re-checking it would lock their tasks.

One historical detail is worth keeping visible: `create_task` used to re-query by
`["description:" + task.description]`, putting the same user string into a *filter* position, which
is the one place `--` cannot protect. It is now `+LATEST`, Taskwarrior's own virtual tag
([`task_runner.py:167-173`](../backend/app/services/task_runner.py)).

### Request bodies

Pydantic models at [`backend/app/models.py`](../backend/app/models.py) constrain types. They
bound every free-text field too, since brief 0073 (plan M8): username 256 characters at login and
registration, description 2 000 characters, annotation and inbox note 32 KiB of UTF-8 (the capture
clients' cut), date-like fields 64, tags 100 each and 50 per task, plan texts 20 000. One past a
limit is 422 while the body is parsed; an `E2BIG` from `execve` that still occurs is 413
(`task_runner.ArgumentTooLong`), not 500. Volume — how many tasks one account writes — is not bounded.
`RISK-SEC-004`.

### Headers, and the three credential shapes

`get_current_user` at [`backend/app/dependencies.py:14-80`](../backend/app/dependencies.py) accepts
`X-Api-Key` (line 35), `Authorization: Bearer <jwt>` (line 43) — held to the account's current
`auth_version`, so a password change ends it (ADR 0044) — and — last, only after a JWT decode
fails — an API key in the Bearer slot (line 72). The third is `SHIM-SEC-006`, kept because every
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

Two routes take no caller input at all. `GET /skill` and `GET /skill/runway.zip`
([`backend/app/routers/skill.py`](../backend/app/routers/skill.py)) have no path parameter, no query
parameter and no body; the archive is built from a fixed file list under one directory, so there is
no name for a caller to supply and therefore nothing to traverse. What they *disclose* is in §8.

**Asserted**
- Field and body sizes are bounded (brief 0067, brief 0073); the number of tasks an account writes is
  not. A capacity question, excluded by decision **F1** and recorded rather than assumed. `RISK-SEC-004`.
- `--` is a property of a third-party argument parser. It is pinned and tested, not owned.
- The audit log's route template protects one sink. Nothing structurally prevents a future call site
  from logging a raw path.

---

## 3. Secrets

Four kinds, and each is handled differently because each fails differently.

**`JWT_SECRET`** — the only thing standing between an attacker and a forged token for any account.
`assert_jwt_secret_is_safe` in [`backend/app/startup_checks.py`](../backend/app/startup_checks.py)
refuses to start on an empty secret; on any value this repository has published — the defaults, the
examples in `.env.example` and README, former test and fixture values — or one that reads like a
placeholder; on a public key (PEM, OpenSSH, a JWK, JWK set or array, DER or an uncompressed EC point in
hex, base64 or base64url — and on anything PyJWT itself refuses as an HMAC key), which as an HMAC key is
known to everyone who holds it (the CVE-2024-33663/CVE-2026-85394 precondition); on one shorter than 32
characters; on one short unit repeated; on an estimated entropy (length × empirical Shannon entropy) under
80 bits; and on one whose characters are mostly a copy of earlier ones or step through a run (under 56
bits charged only for what is new) (finding SEC-002, brief 0072, ADR 0046). A raw Ed25519 key and a
compressed EC point are **not** recognised: they are indistinguishable from random bytes of that length. `assert_jwt_algorithm_is_fixed` refuses `JWT_ALGORITHM` set to
anything but `HS256`; tokens are signed and verified with the code's constant, never the setting. The
checks run from the lifespan in [`backend/app/main.py`](../backend/app/main.py), *before* the database and
before anything binds. The working default in [`backend/app/config.py`](../backend/app/config.py) is
retained so `import app.main` succeeds with no environment, and it is inert: a serving process cannot hold
it. That was finding SEC-1. The test suite and the surface capture generate their key per run, so no
bootable key is written anywhere in the repository — `test_jwt_hardening.py` scans for one.

What no check can do is prove a value random: a long memorable phrase or a keyboard row passes the
entropy estimates. The
origin check covers what a reader of this repository knows; the runbook generates the key
([`docs/operations.md`](operations.md#the-signing-key-jwt_secret)).

**Password hashes** — Argon2id through argon2-cffi since brief 0067 (finding SEC-006, ADR 0044
Decision 5), at parameters measured against a 64 MiB / 250 ms budget
([`backend/app/auth.py`](../backend/app/auth.py)). Hashes written before it are passlib-era bcrypt,
which read only the first 72 UTF-8 bytes; they are still verified (`SHIM-SEC-009`) and replaced by
Argon2id on the next exact login. A bcrypt match for an input of 72 bytes or more is ambiguous —
the hash cannot tell the real password from its prefix plus anything — so it is never written as
the new hash: it is accepted for a window with `password_change_required` and refused after it.
During the 7-day soak, when new hashes are still bcrypt, a new password must be shorter than 72 bytes,
so the alias is never created new, and the forced change refuses a new password that keeps the
ambiguous current one's first 72 bytes (brief 0067, R6). A password being set is bounded at 1024 UTF-8
bytes and needs 8 and no NUL; one being given (login, current password) at 4096, the previous image's
bound (R7); and the body of an auth
request at 16 KiB. A hash is treated as credential-equivalent throughout, because it is
offline-attackable; the log redaction knows both shapes.

**API keys** — since 2026-11-25 (ADR 0044 Decision 6, brief 0070) `rwk_<key id>_<secret>`: a public
16-hex id and a 256-bit secret (`new_api_key` in
[`backend/app/database.py`](../backend/app/database.py)), so guessing one is not the threat. **Storing one
was.** A key is now stored only as the SHA-256 of itself in the `api_keys` table
([`backend/app/database.py`](../backend/app/database.py), `CREATE_API_KEYS`), shown once by
`POST /auth/apikeys`, and it expires (at most 365 days), can be revoked, and records its last use.
Creating and revoking keys, and the deprecated `regenerate`, need a signed-in session, so a stolen key
cannot mint a successor that survives its revocation or its expiry, and a legacy key read from a backup
cannot be swapped for an `rwk_` key that outlives the cutoff. The keys of the previous image (`secrets.token_urlsafe(32)`, held in
cleartext in `users.api_key`) were hashed into `legacy` rows at the first boot and only the hash
authenticates; they are refused from the legacy cutoff (`API_KEY_LEGACY_CUTOFF`, default and latest
2027-01-15), and the first boot after it revokes them and empties the column. **Until then finding
SEC-5 is mitigated, not closed**: the column still holds the cleartext of every account that has not
moved — the rollback target reads it — `GET /auth/apikey` (deprecated) still returns it, and every
backup taken before the cutoff holds working keys until that day. `WAIVER-SEC-003`, expiring
2027-01-31 in [`rules/waivers.yaml`](../rules/waivers.yaml), stays open until the contract step drops
the column.

**The log stream** — the place all three of the above most easily end up. Two halves of one control,
and neither is sufficient alone:

- *By name, statically.* `RULE-OPS-002` parses every tracked file under `backend/app/` and refuses a
  credential-bearing expression at a logging call ([ADR 0023](adr/0023-no-secrets-in-logs.md)). It
  landed before there was any logging to break it.
- *By value shape, at runtime.* The filter at
  [`backend/app/logging_setup.py:236-257`](../backend/app/logging_setup.py) is attached to the
  handler, so every emitted line passes through it whatever logger produced it — uvicorn's access
  lines included. It removes a value by the name it arrives under (lines 62-87), by shape — JWT,
  bcrypt hash, Argon2id hash, an API key `rwk_<id>_<secret>` and the 43-character `token_urlsafe(32)`
  a legacy API key is — and by
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
- `RULE-DEP-003` — no credential is committed anywhere in the tree, this application's own
  `rwk_` API keys included (brief 0070).
- `RULE-RULE-002` — `WAIVER-SEC-003` cannot silently outlive 2027-01-31; the gate stops on the date.
- `RULE-TEST-001` — the boot refusal, the redaction filter and the "no credential anywhere in the
  audit database" adversarial test all run every gate.

**Asserted**
- The static rule matches names, so a credential under a neutral name is invisible to it.
  `RISK-OPS-004`.
- The runtime filter matches shapes, so a credential with no recognisable shape — a plain password is
  the case that matters — passes it. `RISK-OPS-005`.
- Until the legacy cutoff (2027-01-15) the keys issued before 2026-11 still sit in cleartext in
  `users.db` and in every backup of it, and authenticate. `WAIVER-SEC-003`. After it they are refused
  and the column is emptied at the next boot, but backups taken before it keep the (then dead)
  values until the operator's retention replaces them. New keys are hashes only; the hash itself has
  no distinctive shape and is kept out of logs by never being logged, not by the filter
  (`RISK-OPS-005`).
- Secret scanning is pattern-based and reads only the current tree. `RISK-DEP-002`.
- `bcrypt` 4.0.1 stays only to verify the hashes passlib wrote, until `SHIM-SEC-009`'s contract;
  passlib itself is gone (brief 0067). `RISK-DEP-003`.
- The Argon2id latency on the deploy host is the operator's measurement, not a test's
  (`python -m app.auth` times a whole login, bcrypt check included). `RISK-TEST-003`.
- Uniform login work holds only while every Argon2id hash is at the current parameters. Changing them
  after Switch 1 makes a not-yet-rehashed account slower or faster to refuse than an unknown one until
  it logs in once; the runbook allows a change only before Switch 1 (brief 0067).

---

## 4. Side effects

Everything this application does to the world outside its own process, exhaustively:

| Effect | Where | Bound |
|---|---|---|
| Execute the `task` binary | [`task_runner.py:93-100`](../backend/app/services/task_runner.py) | `timeout=10`, `shell=False`, argv validated, one call site |
| Write `users.db` | [`database.py:89-92`](../backend/app/database.py) via `get_db` | the only module permitted to open a connection |
| Write `data/audit.db` | [`database.py:119-135`](../backend/app/database.py) via `audit_connection` | 5s lock wait; a failed write logs and the request still succeeds |
| Create a user's data directory and copy a `.taskrc` into it | [`user_service.py`](../backend/app/services/user_service.py) `provision_store` | once, at registration; `DATA_ROOT/<storage_id>/` only, mode 0700 |
| Copy a legacy store to `DATA_ROOT/<storage_id>/` | [`storage_migration.py`](../backend/app/services/storage_migration.py) | operator CLI only, never a request; source never modified |
| Write lines to stdout | [`logging_setup.py:290-297`](../backend/app/logging_setup.py) | one handler, one formatter, one redaction filter |

That is the complete list. `grep` for `subprocess` across `backend/app/` returns exactly one import
and one call, both in `task_runner.py`. There is no file write outside the `mkdir` calls above and the operator-run migration, no
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

**`users.db`** — accounts, password hashes, API-key hashes (and, until the legacy cutoff, the
cleartext keys of the previous image), roles, profile fields, project plans, site
settings, when each kind of review last happened and which projects are on hold or done, and the
storage migration's protocol. Eight tables (`api_keys` added by brief 0070), created and migrated at
[`backend/app/database.py:13-106`](../backend/app/database.py) and lines 112-117. Bind-mounted from
`/opt/services/runway/users.db` ([`ops/deploy/docker-compose.yml:22-24`](../ops/deploy/docker-compose.yml)).
Its schema is a protected surface, snapshotted at
[`ops/surfaces/db-schema.sql`](../ops/surfaces/db-schema.sql).

**`data/audit.db`** — the audit trail. One table, ten columns, created at
[`backend/app/audit.py:142-155`](../backend/app/audit.py). It lives under `DATA_ROOT` because that is
the only directory either compose file bind-mounts; anywhere else inside the container it would be
silently emptied by the next deploy while continuing to look present. It holds no credential and no
caller fingerprint — no IP address, no user-agent — which is a deliberate deferral of a retention
question, recorded in [ADR 0026](adr/0026-the-audit-log.md).

**The Taskwarrior data directory** — `DATA_ROOT/<storage_id>/`, holding a TaskChampion SQLite file
and a `.taskrc`, created by `provision_store` in
[`backend/app/services/user_service.py`](../backend/app/services/user_service.py), resolved only by
[`backend/app/task_storage.py`](../backend/app/task_storage.py) (`RULE-SEC-003`) and addressed only
through `TASKDATA` in [`backend/app/services/task_runner.py`](../backend/app/services/task_runner.py).
**This is the tenancy boundary**, which is why §2 is as long as it is. Accounts created before
brief 0065 still live in `DATA_ROOT/<username>/` until the operator migrates them, served in
`compat` mode only for a single-component name that is, in exactly that spelling, a directory under
the root (so a case- or normalisation-folded alias is refused too); that residual is `RISK-SEC-006`.

**The browser** — `localStorage` holds `token`, `role`, `username`, `email`, `fullName`, `theme`
and `ui` ([`ops/surfaces/spa.json`](../ops/surfaces/spa.json)); `ui` is the non-secret choice
between the old and the new UI, removed again with the switch (ADR 0042). A JWT in `localStorage` is readable by any
script running on the origin; the compensating position is that the app serves no third-party script
and CORS is closed.

**Enforced**
- `RULE-SURF-001` — the migrated database schema, the served OpenAPI schema, the runtime MCP tool
  list, the Taskwarrior template and the SPA's routes and `localStorage` keys are all snapshotted, so
  none of them moves silently.
- `RULE-SURF-005` — the schema a fresh database gets and the one every historical baseline is migrated
  to are semantically identical (brief 0073).
- `RULE-HYG-001` and `RULE-HYG-002` — no store is tracked in git, and `.gitignore` covers each.
- `RULE-TEST-002` — cross-tenant isolation is tested against the real binary, so the boundary these
  directories provide is exercised rather than reasoned about.

**Asserted**
- **That production has reached schema version 1 is not visible from here.** Since brief 0073 a fresh
  and a migrated database end with the same `users` table (version 1 rebuilds it, with the role
  `CHECK`), and `RULE-SURF-005` builds every historical baseline and compares it with a fresh one. A
  production database with a hand-written role refuses the step and stays at version 0 with an ERROR;
  `verify-deploy` fails on that. `RISK-SURF-001`, `RISK-SEC-002`.
- **Nothing prunes `audit.db`.** It is measured at boot and hourly, with a high-water mark and a WARNING
  above `AUDIT_DB_WARN_BYTES` (brief 0073), but its growth — roughly one row per authenticated request, on
  the same partition as `users.db` and the task data — is unbounded until the retention decision (D7,
  ADR 0047). `RISK-OPS-006`.
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
- `RULE-DEP-005` — the lock installs exactly what `requirements*.txt` pins.
- **Installed, not only locked** (brief 0072). `test_dependency_fixes.py` holds the venv the unit tier
  imports to the intent, and `tests/container/test_installed_dependencies.py` holds the test image to its
  lock, every package at exactly its locked version. `python-multipart` is 0.0.33: past CVE-2024-53981
  (finding SEC-005, first fix 0.0.18) and every later advisory OSV listed for 0.0.12 on 2026-11-25. It is
  in the image because `mcp` needs it, not because a route does: no route declares `Form`/`File`, and a
  multipart body sent to a JSON route reaches no multipart parser — both are tests, so the first upload
  route fails them and has to bring its own size, file and parser regressions.
- `RULE-DEP-003` — no credential committed.
- **The JWT library is PyJWT 2.15.1** (brief 0072, ADR 0046), a direct pin. python-jose 3.5.0, whose CVEs
  (CVE-2024-33663/CVE-2026-85394, CVE-2026-120459) have no fixed release, is gone, and with it `ecdsa`
  (CVE-2024-23342, unfixed), `rsa`, `pyasn1` and `six`. `test_jwt_hardening.py` refuses a pin or an import
  of it.
- `RULE-TI-002` — the runtime versions in `tools/versions.env` match what the Dockerfiles build on.

**Asserted**
- **passlib was removed in brief 0067.** Argon2id comes from `argon2-cffi`, whose native binding is
  pinned in the intent file to a release older than two weeks; `bcrypt` 4.0.1 remains only to verify
  legacy hashes, and its pin is no longer load-bearing. `RISK-DEP-003`.
- The Arch archive snapshot is a date somebody must move deliberately. Nothing announces that a
  pinned date has aged, and a snapshot left alone accumulates unpatched packages. `RISK-DEP-001`.
- Pinning is not provenance. Nothing here verifies image signatures or attestations, and a digest
  says *what* was used, not that it was trustworthy when it was published.
- `platforms: linux/amd64` is a declaration nothing inspects. `RISK-OPS-001`.

---

## 8. Abuse cases

Eight, each with what actually stops it and what does not.

### Credential stuffing against `POST /auth/login`

**Stopped by** a login budget **reserved before the account lookup and the KDF**, atomically, in
three tiers (brief 0069, findings SEC-8 and REV-003): per normalised username (ten per five minutes by
default), per network source (30), and in total (300) — `rate_limit.reserve`, called first thing in
`routers/auth.py::login` and before the current-password check of `change_password`, so an API key
cannot guess the password either. A tier is full when its failures *plus the attempts still in flight* reach
its budget, so a parallel burst cannot all pass a check that counts only finished failures, and a
refused attempt costs no lookup and no KDF work (`test_login_budget.py::TestAParallelBurst`: 40
parallel requests for one account, 10 reach the password check, 30 are 429). A spray across many
names is stopped by the source tier, one from many sources by the global one. The store is bounded: a
clock-driven sweep drops every expired key, and the username and source tiers hold at most
`LOGIN_RATE_MAX_KEYS` keys, beyond which a new one is refused rather than an old one forgotten
(`TestTheStoreIsBounded`). An unknown username counts too, deliberately: skipping it would turn the
limiter into a user enumeration oracle, and the log line and the audit row are written not to
distinguish "no such account" from "wrong password" for exactly the same reason. Every failure inside
the budget is an audit row — so at most `LOGIN_GLOBAL_RATE_LIMIT` per window — and refusals are
counted into one row per key and window plus a summary, so a hammered account cannot grow
`audit.db` one row per request. **Nor does the time** (since brief 0067): every login does one
Argon2id verification and one bcrypt check at the production cost, against a dummy where the account
has no hash of that kind, so an unknown account, a bcrypt account and an Argon2id account cost the
same and answer the same 401 (`test_password_kdf.py::TestUniformWork`). That is equal work, not a
constant-time guarantee: the event loop, the database lookup and the rehash on a *successful* login
still differ, and nothing measures response times.

**Not stopped:** someone who knows a username can deny it password login, and anyone who sends 300
failures per five minutes (one a second, from ten addresses or one IPv6 /60) can deny every account
password login — and either lasts **as long as the attack**, because the spray can be repeated every
window. That is the emergency brake working as designed, at no KDF cost; the throttled rows count it.
API-key requests are not throttled, so agents keep working through any lockout, and for the same
reason the limiter does nothing against what a stolen key can do — except guess the password, which
goes through the budget. The source tier is only as precise as `TRUSTED_PROXIES`: empty (the default)
counts a public peer as itself and a proxy-shaped one (loopback, private) not at all, so behind an
undeclared proxy only the account and global tiers apply; listing a whole network trusts every peer
on it to write `X-Forwarded-For`. Which addresses Traefik and nginx have in production is not visible from this
repository (`RISK-OPS-002`). The counters are in-process and per-worker, so they are the whole
population only under one host and one worker (decision **F1**); a test fails if the Dockerfile
stops pinning `--workers 1` or sets `WEB_CONCURRENCY`, an `ENTRYPOINT` or gunicorn, or a compose file
scales the backend — it reads the files, not the running host. `RISK-SEC-003`.

### A stolen session token

**The exposure:** a JWT in `localStorage` (§3) can be copied by a script on the origin, from an
unlocked device, or out of a header a proxy kept. Until brief 0066 a password change did not end it:
the token stayed valid for its full lifetime, up to 24 hours, on every REST route and MCP tool
(finding REV-001).

**Stopped by** a per-account `users.auth_version` carried in every token and compared on every
request in `get_current_user`; `PUT /auth/password` raises it in the same statement that writes the
new hash (a compare-and-swap, so two concurrent changes cannot both write). Every earlier token is
then 401 everywhere; the changing session gets a fresh token. A trigger keeps the version from going
down. The operator can end one account's sessions, or all, with one `UPDATE`
([`docs/operations.md`](operations.md#ending-sessions)). Held by
`backend/tests/unit/test_session_revocation.py`, which takes every protected route from the OpenAPI
snapshot and every protected MCP tool from the tool snapshot over a real client session (ADR 0044).

**Not stopped:** a request already authenticated when the password changes runs to completion
(authorization is decided once, at the start of a request). For one JWT lifetime after the deploy a
token from the previous image — without a version — is accepted as version 1 (`SHIM-SEC-008`); the
first password change ends it too. The API key survives a password change by design and is
`WAIVER-SEC-003`'s exposure; both settings pages point to its rotation before and after the change. A leaked
`JWT_SECRET` mints tokens at any version — rotating the secret remains the only answer to that. A
restore of `users.db` from a backup undoes every revocation made since the backup, and a
rollback to an image before brief 0066 disables the check for its duration; the runbook bumps every
version after rolling forward.

### API key theft

**The exposure:** a key is unscoped — it authenticates on every route including the admin ones when
the account holds that role — and a stolen key survives a password change. `users.db` is a bind-mounted
file and is in every backup.

**Mitigated for new keys** (brief 0070, ADR 0044 Decision 6): a key is `rwk_<id>_<256-bit secret>`,
stored only as its SHA-256, shown once by `POST /auth/apikeys`, expires after at most 365 days, can be
revoked one by one, and records its last use. A read of the file or a backup yields hashes, not keys.
Creating, revoking and the deprecated `regenerate` need a signed-in session, and the deprecated
`GET /auth/apikey` hands the legacy key only to a session or to the legacy key itself (any other key gets
`""`), so a stolen key can neither mint its successor, nor read back a second credential, nor extend its
own life, nor end its owner's other keys. Every authenticated request
records the credential shape and the route, so a stolen key's *use* is reconstructable.

**Still open until the cutoff and the contract step:** the keys of the previous image are hashed into
`legacy` rows and authenticate until `API_KEY_LEGACY_CUTOFF` (at the latest 2027-01-15); until then the
column still holds the cleartext of every account that has not moved, `GET /auth/apikey` (deprecated)
returns it and writes an `auth.apikey.disclosed` row, and every backup taken before the cutoff holds
working keys until that day. An account this image has closed (registered here, legacy key revoked or
rotated) gets nothing imported from the column again, so a rollback's backfill does not hand it a
working key. `WAIVER-SEC-003`, expiring 2027-01-31, stays open until the contract step drops the column.

**Mitigated for agent sessions:** the MCP surface is an allowlist (ADR 0037). No authentication,
API-key, user or admin operation is a tool, so an agent — or a prompt injected into one — holding a
key over MCP cannot read it back through `GET /auth/apikey`, rotate it, change the password, or reach
an admin route, even when the account is an admin. `backend/tests/unit/test_mcp_session.py` pins the
list as a client receives it, and a call to a removed name returns "Unknown tool" without the key.
Until brief 0071 a listed tool could still be *pointed* at a removed route with a `..` path argument
(finding REV-005); every call is now bound to its own handler (`test_mcp_target_binding.py`, ADR 0045).
REST is unchanged: the same key used directly against the API still reaches every route.

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

**Not stopped:** anyone with shell on the deploy host can write the `role` column directly. Since
schema version 1 (brief 0073) the database refuses a value that is not a role, but `admin` is a role:
the constraint stops a typo or a third role, not an operator. `RISK-SEC-002`.

### Log and audit poisoning

**Stopped by** minting the correlation id locally rather than reading `X-Request-Id`
([`backend/app/middleware.py:48-51`](../backend/app/middleware.py)), by storing route templates rather
than requested paths ([`backend/app/audit.py:258-273`](../backend/app/audit.py)), and by
`json.dumps` — a JSON-per-line stream is not line-oriented text a newline can forge a record in.

**Bounded by** the fact that only *successful* authentication writes a row, so an unauthenticated
caller cannot append to a file nothing prunes; login failures are the exception and the per-username
limiter bounds them ([ADR 0026](adr/0026-the-audit-log.md)). A caller cycling usernames can still
append faster than a legitimate one. `RISK-OPS-006`.

### Reading the public skill routes

**Discloses**, to anyone, the commit sha this image was built from, the skill version it carries and
that skill's text. Deliberately (ADR 0040): the repository is public, the image tags in the registry
are the same sha, and the whole point of `GET /skill` is that a client — or the post-deploy job —
can tell which build is answering. **Not stopped**, because there is nothing to stop; there is also
nothing user-specific to leak, since neither route reads the database, the Taskwarrior data or the
caller's identity.

**What it would mean if that changed.** A version stamp turns into a vulnerability disclosure the
moment the thing it stamps has a known CVE. The mitigation is the one this repository already
runs — the deploy is a full rebuild on every merge to `main`, so the sha names a build that is a few
minutes old — and the re-open trigger is the first field here that is not already public.

### Denial of service

Largely **out of scope by decision F1**, and stated rather than assumed. What exists: `timeout=10` on
the Taskwarrior call, so a hung binary is a failed request rather than a worker that never returns;
`restart: unless-stopped` and healthchecks in both compose files; container log rotation at 50 MB per
service, checked in; request bodies and fields bounded (briefs 0067 and 0073). What does not exist: a
bound on how much one account writes (`RISK-SEC-004`), any pruning of
`audit.db` (`RISK-OPS-006`; it is measured and warned about since brief 0073), any capacity budget, and
any measurement of the partition all three stores share.

**The MCP endpoint is the exception** (finding REV-004, brief 0071, ADR 0045). It used to keep a session
— a server transport and a task — for every `initialize`, anonymous ones included, with no expiry and no
cap. It is now stateless (nothing outlives a request; `live_transports` returns to zero), reserves a slot
before any work under a global, a per-source and an anonymous ceiling, and cancels a request after 30
seconds. Enforced: `backend/tests/unit/test_mcp_budget.py` (the request above each ceiling refused,
capacity returned after completion, after the deadline and after a client disconnects mid-call, a
50-request burst leaving no transport). The anonymous ceiling counts the presence of a credential
header, not its validity: a made-up header escapes it but not the global and per-source ceilings, and
with `TRUSTED_PROXIES` unset behind nginx the per-source ceiling does not apply, so the global one is
all that bounds unauthenticated traffic; closing that needs the deferred handshake authentication
(`RISK-MCP-002`). The ceilings are per process (`RISK-SEC-003`), and anyone who can reach the endpoint
may still list the tools (`RISK-MCP-002`).

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
- **Nothing here reaches the host itself.** After every deploy `verify-deploy` checks what the running
  server reports — commit, build id, the SHA-256 of the baked and of the host-applied compose file, the
  schema version — and that the registry's `:latest` and `:<sha>` are the digest this run pushed
  (brief 0073). Between deploys nothing compares, and which digest the host's container runs is inferred
  through the build id, not read (`RISK-OPS-002`). Every other claim about the host is a dated read.
- **Physical, host and network security are outside the boundary.** No claim is made about the
  operating system, the SSH configuration, Traefik, TLS renewal, or backups.
- **Frontend rendering, routing and gestures are untested** (`RISK-TEST-004`), and the container test
  tier cannot run on arm64 (`RISK-TEST-001`).
- **This document is not an audit.** It is what one reading of the code on one day found, written so
  the next reader can check it rather than trust it. `RISK-DOC-003`.
