# Security — roles, guards and the authorization posture

Who may do what, how that is enforced, and which parts of it the gate checks.

Open findings with owners and expiry dates live in [`rules/waivers.yaml`](../rules/waivers.yaml).
This document describes the model that is in place, not the backlog.

## Two roles

`admin` and `user`. The set is closed and lives in one place — `VALID_ROLES` in
[`backend/app/models.py`](../backend/app/models.py) — which every writer validates against:
the admin API, the startup bootstrap, and the CLI escape hatch.

`user` is the default for a newly registered account, and it is what the `role` column
defaults to. `admin` additionally may read and change site settings, list all users, and
change any user's role.

Roles are **not** a data-isolation mechanism. Every user's tasks are separated by the
per-user Taskwarrior data directory, not by role; an admin has no route to another user's
tasks and does not get one by being an admin.

## Authentication

Two credentials reach the same principal, checked in this order by `get_current_user` in
[`backend/app/dependencies.py`](../backend/app/dependencies.py):

1. **`X-Api-Key`** — looked up as a **hash** in the `api_keys` table (ADR 0044 Decision 6, brief
   0070, `WAIVER-SEC-003`): a key `rwk_<key id>_<secret>` by its public id, its SHA-256 compared in
   constant time; a key from before 2026-11 (43 characters) by its SHA-256, and only until the legacy
   cutoff (`API_KEY_LEGACY_CUTOFF`, at the latest 2027-01-15). The `users.api_key` column is never
   compared. Unknown, malformed, expired, revoked and post-cutoff legacy keys get one answer, `401
   Invalid API key`. Checked **first**, before any token work, which is why rotating `JWT_SECRET`
   does not disturb agents, MCP clients or automations, and why an account locked out of password
   login can still be used by them. A key is shown once, by `POST /auth/apikeys`; creating,
   revoking and the deprecated `regenerate` need a signed-in session (a key gets 403), so a stolen
   key cannot mint its own successor — and a legacy key from a backup cannot be swapped for one that
   outlives the cutoff. The deprecated `GET /auth/apikey` returns the legacy key only to a session or
   to that legacy key itself (any other key gets `""`), so a stolen `rwk_` key cannot read back a
   second credential that would survive its revocation. `GET /auth/apikeys` lists metadata only.
2. **`Authorization: Bearer <jwt>`** — signed with `JWT_SECRET`, `HS256`, 24h. `HS256` is a constant
   in the code, not a setting (ADR 0046, finding SEC-002): a token whose header names any other
   algorithm — `none`, `HS512`, `RS256` — or carries its own key (`jwk`, `jku`, `kid`) is refused, and
   PyJWT, not python-jose, verifies it. `JWT_SECRET` itself is refused at startup when it is published,
   a public key, degenerate or short (see `docs/threat-model.md` §3). A valid
   signature is not enough: the account the token names must still exist, or the request
   gets the same **401** as no credential at all, on every route. A token outlives the row
   it was issued for; until 2026-11-10 it kept working everywhere except `GET /auth/me`,
   which answered 500 (`WAIVER-TYPE-001`, [brief 0056](briefs/0056-a-vanished-user-gets-401.md)).
   **And the token must carry the account's current `auth_version`** (ADR 0044, finding
   REV-001). Every token holds `sub`, `iat`, `exp`, a random `jti` and `auth_version`;
   `PUT /auth/password` raises the version in the same statement that writes the new hash, so
   every token issued before the change — other browsers, other devices, a stolen one — gets
   401 on its next REST request and its next MCP tool call. The session that made the change
   receives a new token in the response. A token without `exp` or `sub`, or with a malformed
   version, is refused. The operator ends one account's sessions, or everyone's, with one
   `UPDATE` ([`docs/operations.md`](operations.md#ending-sessions)). For one JWT lifetime after
   the deploy, a token from the previous image (no `auth_version`) still counts as version 1:
   `SHIM-SEC-008`. **API keys are not revoked by a password change** — they are revoked separately
   (`DELETE /auth/apikeys/{key_id}`, or the deprecated `POST /auth/apikey/regenerate`, which ends
   every key of the account); both settings pages say so before the change and point to it after.
3. **`Authorization: Bearer <api_key>`** — an API key in the Bearer slot, tried last, only
   after a JWT decode fails. This is `SHIM-SEC-006`, not a design: it is the shape `/inbox`
   used before it was unified onto `get_current_user` (finding SEC-6), kept because every
   agent and MCP client sends it today. Recorded in
   [`rules/shims.yaml`](../rules/shims.yaml) with a removal step and an expiry, enforced by
   `RULE-SEC-002`.

**What is stored, and where a key may appear** (brief 0070). The secret of a key exists in exactly
one response — the `201` of `POST /auth/apikeys` (or of the deprecated `regenerate`) — and in the
caller's hands; the server keeps its SHA-256, and no response, audit row or log line carries either.
`RULE-DEP-003` refuses a committed `rwk_` key anywhere in the tree, `RULE-OPS-002` a key or its hash
at a logging call, and the redaction filter removes the `rwk_` shape from every emitted line; each has
a negative fixture arm that commits or logs one. Until the legacy cutoff the deprecated
`GET /auth/apikey` is the one remaining place a (legacy) cleartext key leaves the server; it is
`WAIVER-SEC-003`'s open part.

`get_current_admin` builds on `get_current_user` and additionally requires `role = 'admin'`,
returning **403** when the principal is authenticated but not an admin — distinct from the
**401** an unauthenticated request gets.

## The browser session and logout

What the SPA keeps in the browser, by data class, is declared in one place,
[`frontend/src/shared/browserStorage.js`](../frontend/src/shared/browserStorage.js), the only file
that touches `localStorage` ([ADR 0050](adr/0050-local-browser-data-on-logout.md)):

| Class | Keys | Account-bound | Removed by an explicit logout |
|---|---|---|---|
| credential | `token` | yes | yes (a 401 removes it too) |
| identity | `username`, `accountId` | yes | yes |
| outbox (task text) | `outbox:<accountId>` | yes | yes, after asking when it is not empty |
| draft (task text) | `captureDraft:<accountId>` | yes | yes |
| UI preference | `theme`, `ui`, `inboxMode` | no | no |
| legacy (`SHIM-FE-001`) | `outbox`, `captureDraft`, `role`, `fullName`, `email` | — | yes; this account's entries are migrated first (after a fresh login only ops not older than the account's `created_at`; the legacy draft is dropped); swept on every bind from 2027-03-01 |

- **Namespace by a stable id.** `accountId` is `account_id` from `POST /auth/login` and
  `GET /auth/me` — `users.id`, never handed out twice — not the username, which a deleted account
  frees for someone else. Only declared keys can be read or written (`isDeclared`).
- **Explicit logout** asks *Abbrechen* / *abmelden und verwerfen* when unsent changes exist, then
  removes the account's keys and leaves with a full page load. The count includes ops only the page
  holds (storage refused them). Other tabs follow: any tab that sees the token go, change to another
  sign-in, or the account id change, leaves or reloads.
- **A 401 locks.** Only the token goes; the account's queue waits for the same account. What that
  leaves in a profile is `RISK-FE-001`.
- **The role is the server's.** `auth.role` comes from `GET /auth/me` on every page load and is
  never read from storage; the frontend's admin screens are display, the `/admin` guards are the
  boundary.
- Logging out does not revoke the JWT on the server: a copied token stays valid until it expires.

## The route guard declaration

[`rules/route-guards.toml`](../rules/route-guards.toml) names every HTTP route the application
serves and the guard it requires. It is normative: **`RULE-SEC-001`** fails the gate when the file
and the running application disagree in either direction. Since brief 0073 (`RISK-SEC-005`,
ADR 0047) `tools/checks/route_guards.py` boots the application and takes its inventory from
`fastapi.routing.iter_route_contexts(app.routes)` — every route FastAPI dispatches to, wherever it
was declared, with included routers' prefixes and dependencies applied — and reads each route's
guard from its **resolved dependency tree**, which is what FastAPI runs, router-level dependencies
included. The served OpenAPI operations must all be in that inventory, and a mounted
sub-application is declared as `MOUNT <path>` and a WebSocket route as `WS <path>` — it has no HTTP method and no OpenAPI entry, so until the second review of brief 0073 the inventory dropped it silently; a route kind with no methods that the checker does not know fails the gate. Before, it parsed `backend/app/routers/*.py` only, and
six served routes — `GET /health`, the three methods of `/mcp` and the framework's documentation
routes — were declared nowhere.

| Guard | Meaning |
|---|---|
| `admin` | `get_current_admin` in the dependency tree — authenticated, and `role = 'admin'` |
| `user` | `get_current_user` in the tree (and not the admin guard) — any authenticated principal |
| `open` | neither: reachable unauthenticated, or authenticating by some other means |

**Adding a route means adding a line to that file.** That is the point of it. A forgotten
guard fails silently — the route works, it just works for everybody — which is not something
a passing test suite notices, and not something a reviewer reliably notices either, because
the evidence is one missing parameter default among thirty handlers.

An `open` route must record a `reason`. A route anyone can reach is a decision, and a
decision with no recorded reason cannot be told apart from an oversight. Thirteen are open today —
the five below, and eight infrastructure routes outside the routers package whose reasons are in the
declaration file: `GET /health` (the healthcheck and post-deploy probe), `POST`/`GET`/`DELETE /mcp`
(the transport; each tool call is a request to its own route and meets that route's guard, ADR 0045),
and `GET /openapi.json`, `/docs`, `/docs/oauth2-redirect`, `/redoc` (the public schema of a public API):

- `POST /auth/register` and `POST /auth/login` — the routes that create and exchange
  credentials cannot require them. Registration is additionally gated at runtime by the
  `allow_registration` site setting, which an admin controls.
- `GET /auth/registration-status` — read-only, reports whether registration is open so the
  login page can hide the register option instead of inviting someone to type credentials and
  then refusing them. Discloses nothing that POSTing to `/auth/register` does not already
  reveal.
- `GET /skill` and `GET /skill/runway.zip` — the Claude skill this build carries, and the
  skill itself as a zip (ADR 0040). Both answer the same bytes to everyone: text from a public
  repository, its content hash, and the commit sha of a build whose image tags are public too.
  They are open because the consumers cannot send a header — a browser's `<a download>` on the
  settings page — or do not yet hold a key — the post-deploy job, which reads `GET /skill` to
  decide whether the build it just shipped is the one answering. Neither route takes a
  parameter or reads a user's data, so there is nothing to vary by principal and nothing to
  traverse.


## How an instance gets its first admin

`bootstrap_admin()` in [`backend/app/database.py`](../backend/app/database.py) runs at
startup and promotes `BOOTSTRAP_ADMIN` **only when the database contains no admin at all**.

That condition is what makes it safe. It cannot contradict a role set through the API, so a
demotion made in the admin UI is not silently undone by the next restart; and it cannot lock
anyone out, because it only ever adds an admin to an instance that has none. It is a
recovery path, not a policy.

If `BOOTSTRAP_ADMIN` names an account that does not exist, nothing happens — creating one
would mean inventing a password hash nobody chose.

This replaced a line that ran `UPDATE users SET role='admin' WHERE username='uli'` on every
startup (finding **SEC-2**). See [ADR 0017](adr/0017-admin-bootstrap-and-route-guards.md) for
why configurability alone would not have fixed it.

## The last admin cannot be removed

`PUT /admin/users/{target}/role` returns **409** rather than demote the only remaining admin.
Without that, an instance can be left with nobody who can administer it: every `/admin` route
requires an admin, so there is no route back through the API, and recovery means editing
`users.db` on the deploy host.

The check is on the admin *count*, not on self-demotion — demoting someone else is just as
final when they are the only one left.

**It holds under concurrency** (REV-002, [brief 0068](briefs/0068-the-last-admin-survives-concurrent-writes.md)).
Until November 2026 the count was read in autocommit and the role written by a separate statement, so
two admins demoting each other at the same moment both read "two admins" and both succeeded — zero
admins, the state the guard exists to prevent. Every write that can remove an admin now runs inside
`database.admin_preserving_write`: one transaction on the request's own connection, opened with
`BEGIN IMMEDIATE` so SQLite's write lock is held **before** anything is read, and the invariant is
checked **after** the write — if the instance had an admin when the transaction began and has none at
its end, the whole transaction is rolled back and the route answers 409. A second writer waits for the
lock (up to SQLite's 5 s busy timeout; past it the request fails with 500, never with a silent wrong
answer). The paths held to it: `PUT /admin/users/{target}/role`, account deletion (`delete_account`,
today only the rollback of a registration whose store could not be provisioned), and
`./run grant-admin --role user`. A future bulk operation gets the same guarantee by running inside the
same guard; the post-write check does not need to know what the statements were. An instance with no
admin at all is not blocked — there is nothing to protect until the bootstrap or the escape hatch
creates one.

The two mechanisms compose: the guard makes zero admins unreachable through the API, and the
bootstrap recovers an instance that reaches zero some other way.

## The escape hatch

```sh
./run grant-admin --db /path/to/users.db <username>
```

Promotes an account directly, bypassing the API. `--db` has no
default on purpose: this writes to a live database, and the path should be a deliberate
keystroke rather than an inherited one. It does **not** bypass the last-admin invariant:
`--role user` on the only admin is refused (exit 1) in the same serialised transaction the API
uses, so it cannot race a request either: a test holds a request's guard open mid-demotion while
the CLI demotes the other admin, and the CLI waits for the lock and refuses
(`test_last_admin_concurrency.py::TestTheOperatorCli::test_it_cannot_race_a_request`). Exit 1
means only that refusal; a database error — a write lock held past the CLI's 5 s busy timeout, a
file without a `users` table — exits 3 and changes nothing.

Use it when an instance has no admin and restarting with `BOOTSTRAP_ADMIN` set is not
practical.

## Refusing to start

`startup_checks.run_all()` runs before the database is touched. It refuses every JWT signing
key this repository has ever published as a default, an empty key, and anything shorter than
32 characters (finding SEC-1). A container that will not start is a louder signal than one
that serves forgeable tokens quietly.

The literal default stays in [`backend/app/config.py`](../backend/app/config.py) so that
`import app.main` still succeeds with no environment — the import check, the unit tier and
the OpenAPI tooling all need that — and it is now inert, because it cannot reach a serving
process.

## Cross-origin access

`CORS_ORIGINS` is **empty by default** and the middleware is not mounted at all when it is.

This is not caution. The SPA reaches the API through a same-origin `/api` proxy — nginx in
production, vite in development — so no browser ever makes a cross-origin request to it, and
agents and MCP clients are not browsers. Set `CORS_ORIGINS` only for a real browser consumer
on another origin.

The previous configuration paired `allow_origins=["*"]` with `allow_credentials=True`, which
makes Starlette reflect the caller's own `Origin` back — every origin held full credentialed
access (finding SEC-4).

## MCP surface

The MCP server at `/mcp` exposes an **allowlist**, not the whole API: every operation of the
`tasks`, `gtd`, `projects` and `inbox` routers, plus `health` and `me`
(`include_tags` and `include_operations` in `backend/app/main.py`). Login, registration, API-key,
profile, password, user and admin operations are REST-only. An agent holding a key therefore
cannot read the key back, rotate it, or reach an admin route through MCP, whatever the account's
role. The list fails closed — a router with a new tag is not a tool until it is added — and
`backend/tests/unit/test_mcp_session.py` pins it as a client receives it. ADR 0037.

**A tool call runs only its own handler** (finding REV-005, brief 0071, ADR 0045). The allowlist used to
check the tool's *name* only, and `fastapi-mcp` substitutes a path argument into the URL unencoded, so
`get_task(uuid="../auth/apikey")` reached `GET /auth/apikey` and `modify_task(uuid="../auth/me", …)`
changed the profile — with an admin's key, `../admin/settings` changed site settings. Now every path
argument is sent as one percent-encoded segment, and `mcp_gate.bind_mcp_target` — the first
dependency of every route — refuses with 400 a tool call whose selected route is not the tool's own,
before the credential is looked up. `backend/tests/unit/test_mcp_target_binding.py` asserts the final
handler for every path-parameter tool against traversal, encoded, double-encoded, query, fragment and
Unicode look-alike values, not the status code. Encoding stops dot segments and query or fragment
splitting only; an encoded `/` is decoded before routing, and a plain value like `plans` in
`set_project_status(name="plans")` would select the sibling `upsert_plan` route. Those cases are
stopped by the binding alone, and `TestOnlyTheBindingStopsASiblingRoute` fails when it is removed.

**The transport holds no session and has a budget** (finding REV-004). Stateless Streamable HTTP: no
`Mcp-Session-Id`, a fresh transport per request torn down when it ends; `GET`/`DELETE` are 405. Every
request reserves a slot before any work — 32 in total, 8 per source, a quarter of the total for requests
without a credential header (`MCP_MAX_INFLIGHT`, `MCP_SOURCE_MAX_INFLIGHT`) — and is cancelled after 30
seconds, which is also what frees the slot of a client that disconnects. The anonymous share counts the
*presence* of a credential header, not its validity: a made-up `X-Api-Key` escapes the share but not the
total and per-source ceilings, and with `TRUSTED_PROXIES` unset behind nginx the total is the only
ceiling, so unauthenticated traffic can still crowd out real users up to it. Closing that needs the
deferred handshake authentication (`RISK-MCP-002`). `backend/tests/unit/test_mcp_budget.py`.

**The handshake is not authenticated yet** (`RISK-MCP-002`): anyone who can reach the endpoint may
list the tools; every call is authenticated by its route. The dated switch to 401 is designed and
deferred (ADR 0045).

## Passwords

Since brief 0067 (finding SEC-006, ADR 0044 Decision 5):

- **Hash: Argon2id** (argon2-cffi; t=3, 64 MiB, one lane — measured against a 250 ms / 64 MiB
  budget per verification and 500 ms per login, bcrypt check included). Hashes from before are passlib-era bcrypt and are still verified (`SHIM-SEC-009`).
- **Limits, in UTF-8 bytes:** a password being set (register, change) **8 to 1024** and without a
  NUL character; a password being given (login, the current password) at most **4096** — the bound
  the previous image enforced (passlib), so an account with a long bcrypt-era password still reaches
  the flagged or audited path instead of a silent 422 (brief 0067, R7). Outside the rule is **422**,
  before any hash or query. A login has no minimum, so a password set before the rule still works.
- **Body limit:** **16 KiB** on `/auth/*`, **1 MiB** elsewhere, **413** before routing — in the
  backend itself and, for `/api/auth/`, at nginx.
- **Migration:** an exact bcrypt login (input of 71 bytes or fewer) is rehashed to Argon2id by a
  compare-and-swap on the old hash; no session ends. A bcrypt match for 72 bytes or more is never
  rehashed from what was typed — bcrypt saw only the first 72 — so the login answers
  `password_change_required: true`, both UIs send the person to Einstellungen — where a new
  password sharing the current one's first 72 bytes (the same value retyped, or a guessed prefix
  plus anything) is refused with 422, so the prefix-accepted value never becomes the hash on this
  route either (brief 0067, R6) — and after the window
  such a login is refused and needs the operator reset (`docs/operations.md`).
- **No oracle:** every login costs one Argon2id and one bcrypt operation whatever the account, and
  every failure is the same 401 `Invalid credentials`. A NUL byte is a 401, no longer a 500.
- **Timeline**, from the image's first boot (`site_settings.password_kdf_expand_at`): 7 days of
  bcrypt writes (so a rollback can still verify — and in that week a new password must be shorter
  than 72 bytes, so bcrypt stores it whole), then Argon2id writes and rehash-on-login, and from
  day 67 the ambiguous case refused. No deploy and no setting moves a step; a missing row fails
  closed.

## Login throttling

Every password verification — `POST /auth/login`, and the current-password check of
`PUT /auth/password` whatever credential authenticated it — reserves a slot in three budgets
**before** it looks the account up or runs the KDF (findings SEC-8 and REV-003, brief 0069), and
answers **429** with `Retry-After` when any of them is full:

| Tier | Key | Default per `LOGIN_RATE_WINDOW_SECONDS` (300) | Stops |
|---|---|---|---|
| account | the username, NFKC-normalised and casefolded — `Alice`, `ALICE` and `ａlice` are one | `LOGIN_RATE_LIMIT` = 10 | guessing one account's password |
| source | the network source (below); IPv6 by /64 | `LOGIN_SOURCE_RATE_LIMIT` = 30 | a spray across many names from one place |
| global | one key | `LOGIN_GLOBAL_RATE_LIMIT` = 300 | a spray from everywhere; caps the KDF work failed verifications cause |

- **Reserved, then closed.** A tier counts its failures *and the attempts in flight*, under one
  lock, so parallel requests cannot all pass a check that only counts finished failures. A refused
  attempt costs no lookup and no KDF work. Every reservation is closed once: a success releases it
  and clears the **account** tier only (so a valid account cannot refill the budget of the place a
  spray comes from), and there only the failures recorded under its **exact** name — `Alice` and
  `alice` can be two accounts sharing one budget, and a success on one must not wipe the guesses
  against the other (brief 0069, R10); a failure is counted; an exception or a cancelled request
  counts as a failure.
- **Bounded memory.** Failures expire after the window; a sweep on a clock drops every expired key,
  not only the one being tried. The account and source tiers hold at most `LOGIN_RATE_MAX_KEYS`
  keys; a new key beyond that is **refused**, never made room for by forgetting an old one — that
  would let a flood of random names reset a victim's counter. Account keys are 16-byte digests.
- **The source.** The socket peer — unless the peer is listed in `TRUSTED_PROXIES`; then
  `X-Forwarded-For` is read from the right, past every trusted proxy, to the first address that is
  not one. What a client wrote to the left of that is never read. A malformed entry or `0.0.0.0/0`
  is ignored and reported at boot. uvicorn's own proxy-header handling is off (`--no-proxy-headers`),
  so this is the only place a forwarded address is believed, and nginx appends to the header rather
  than passing a client's through. With `TRUSTED_PROXIES` empty — the default — a public peer is
  counted as itself, but a loopback, RFC 1918, link-local or IPv6 ULA peer gets **no** source key:
  it is a proxy nobody declared, and counting its address would make every client behind it one
  budget that any one of them could exhaust for everyone. In the shipped topology that means the
  source tier is off until the operator sets `TRUSTED_PROXIES` (a boot `WARNING` says so), and a
  spray is bounded by the global tier alone (`docs/operations.md`). With `TRUSTED_PROXIES` set, a
  proxy-shaped peer that is not listed but sends `X-Forwarded-For` gets no source key either: it is
  a declared proxy that came back at another address after a recreate, and counting it would be the
  same one-budget-for-everybody failure. The backend logs a `WARNING` (`login request from an
  undeclared proxy`) at most once per window, without the address (brief 0069, R9).
- **The global brake's size.** One failed verification (Argon2id + bcrypt) measured 0.26 s on the
  development machine, and it runs on the event loop. 300 failures per 300 s window is therefore
  about a quarter of the loop — enough to stop a spray before it degrades the service, high enough
  that it is not the first thing an attacker trips.
- **Audit and log.** Every failure inside the budget is an `auth.login.failed` row, as before — at
  most `LOGIN_GLOBAL_RATE_LIMIT` per window; a wrong current password in a password change is an
  `auth.password.changed` failure row, under the same budget. A refusal writes an `auth.login.throttled` row only for
  the first refusal of a key in a window; later ones are counted and carried by the next row, or by a
  summary when the key is swept. Every throttled row says `(refusals: N)`. Account rows name the
  attempted username, as before; source and global rows name nothing — no address is recorded
  (ADR 0026). The `login throttled` log line follows the same rule.

**The balance against lockout.** Keyed on the username because rotating source addresses is cheap.
The trade is real and accepted, and it lasts **as long as the attack**, not one window — an attacker
simply repeats the spray each window:

- someone who knows a username can deny it password login with 10 wrong guesses per 5 minutes;
- with `TRUSTED_PROXIES` set, one address can deny nobody but the names it guesses (30 per window);
- anyone who can send 300 failures per 5 minutes (1 per second; from 10 IPv4 addresses at the
  source budget, or from one IPv6 /60 or larger, which holds 16 /64 keys) denies *every* account
  password login — the admin's too — for as long as they keep it up. That is the emergency brake
  doing its job without costing KDF work; it is not free for the attacker, and it is recorded:
  the throttled rows carry the counts. The recovery path is an API key or the `grant-admin` CLI on
  the host, neither of which goes through the budget.

Unknown usernames are throttled identically — exempting them would make the limiter a
user-enumeration oracle. **Requests authenticated by an API key are not throttled**, so agents, MCP
clients and the webhook keep working through any lockout. What an API key cannot do is guess the
account's password: `PUT /auth/password` verifies the current password through the same budget, so
a stolen key gets the account budget's ten guesses per window and nothing while the account is
locked. The other side remains: a lockout does nothing against what a stolen API key can do with
the key itself. Recovery after a suspected compromise must deal with **both** credentials — a
password change ends every JWT session (brief 0066) but not the API keys, which are revoked
separately (`docs/operations.md`, *Ending API keys*).

## The Taskwarrior boundary

Per-user isolation rests entirely on three environment variables handed to a subprocess:
`TASKDATA`, `TASKRC` and `HOME`, each pointing at one user's directory. There is no ownership
column and no second gate. So two things have to hold: the argument list must not redirect the
store (SEC-3, below), and the directory itself must be the account's and no one else's.

**Which directory (finding SEC-001, [ADR 0043](adr/0043-account-identity-and-taskwarrior-storage.md)).**
Until brief 0065 the directory was `DATA_ROOT/<username>`, built from the registered name in
two modules, so `alice/../alice` opened alice's store and `../x` created directories outside
the data root. Now:

1. Every account has a **`storage_id`** — 32 hex characters from the OS CSPRNG, unique by
   index, shaped by a `CHECK`, and immutable by trigger. The store is `DATA_ROOT/<storage_id>/`.
2. [`backend/app/task_storage.py`](../backend/app/task_storage.py) `resolve` is the only
   function that turns an account into a directory. It accepts only the id shape and refuses
   anything that is not a real directory (not a symlink) directly under the resolved root.
   `get_task_store` hands the routers a resolved `TaskStore`; `task_runner._run` accepts
   nothing else, so no code path is left that turns a name into a path.
3. **`RULE-SEC-003`** fails the gate when any other module of `backend/app/` reads
   `data_root`, except the audit database's fixed name. Non-waivable.
4. New accounts are created only in the new layout. The username keeps a hygiene rule at
   registration (plain, NFC, no control characters or separators, at most 64 characters; 400
   otherwise) that is explicitly *not* the path control.
5. **Transition (`SHIM-SEC-007`, `RISK-SEC-006`).** An account created before the change is
   `storage_layout='legacy'` and, in the default `TASK_STORAGE_MODE=compat`, is served from
   `DATA_ROOT/<username>/` only when that name is one path component that is, in exactly that
   spelling, a real directory under the root — an alias name, including a spelling a case- or
   normalisation-insensitive filesystem folds onto another directory, is refused with 500 and a
   `storage.refused` audit row. The migration groups accounts by inode, not by spelling. `strict` refuses every legacy account. The operator moves accounts with
   `python -m app.services.storage_migration`
   ([runbook](operations.md#moving-task-storage-off-the-username)).

Registration may be opened again once `tests/unit/test_storage_identity.py` and
`tests/container/test_storage_isolation.py` are green in CI on amd64 at the deployed commit.

Taskwarrior consumes `rc.<key>=<value>` **anywhere in its argument list** as a runtime
configuration override — including `rc.data.location`, which chooses which store it opens. A
task description of that shape was therefore addressed at the only tenancy boundary the system
has (finding **SEC-3**). Confirmed against the real binary, twice, on 2026-08-05 and again on
2026-08-25 against Taskwarrior 3.5.0:

```
task add rc.data.location=/tmp/victim hello      ->  /tmp/victim/taskchampion.sqlite3 created
task add -- rc.data.location=/tmp/victim hello   ->  stored as literal description text
```

Three controls, in order of how much they are relied on:

1. **`--` terminates option parsing.** All free text — descriptions, annotations — is passed
   after it, so an override is inert *by Taskwarrior's own grammar* rather than by our
   filtering. This is the primary control precisely because it does not depend on us
   enumerating dangerous shapes correctly. Modifiers must precede it, since anything after
   `--` becomes text. That includes tag removals: `-tag` is a modifier, and after `--` it
   would silently become part of the description. Tag names are therefore shaped so that
   they cannot turn into something else: a tag written or added must match `TAG_RE`
   (letter, `_` or `@` first; no leading `+`, `-`, `.` or digit, no comma or whitespace),
   and a stored tag being removed must match the looser `EXISTING_TAG_RE`, so legacy tags
   such as `@home,@office` stay removable while nothing that could reshape the modifier gets
   through. Its first character is still a letter, `_`, `@`, `$` or `#`: Taskwarrior 3.5.0
   reads `-1abc` or `-.x` as description text, so such a removal would overwrite the
   description and keep the tag. It is refused (400) instead.
2. **`reject_structural_tokens`** refuses `rc.`-shaped tokens in the caller-supplied argument
   list — the filter and modifier positions, which must stay parseable and so cannot sit
   behind a separator.
3. **Every value that becomes a filter or a modifier is shaped first.** `--` cannot cover
   these positions, so each has a regex of its own in the service layer, and a refused value
   raises before anything is exported — the binary never sees it. A tag is `TAG_RE`; a
   project name is `PROJECT_RE` in
   [`backend/app/models.py`](../backend/app/models.py), which allows spaces, umlauts and dots
   but refuses control characters, parentheses, quotes, a backslash, `:` and `/ ? # %`, and a
   leading `+`, `-` or space; a date filter is `YYYY-MM-DD` and is applied in Python rather
   than handed to Taskwarrior's much wider date grammar. A project name is never a token by
   itself — it is always the tail of `project:` or `project.is:` — so an `rc.`-shaped name is
   inert; the `/` of a real data path is refused anyway, because it would also break an MCP
   path parameter ([ADR 0038](adr/0038-validated-filters-and-exact-project-match.md)).
   A date **modifier** (`due`, `scheduled`, `wait`, `until`) is one word, `DATE_VALUE_RE`:
   ASCII letters, digits and `: + - .`, surrounding whitespace stripped, and with no dot next to
   a letter and no `rc:` at a word start (`DATE_DOM_RE`), so neither a Taskwarrior DOM
   reference (`rc.data.location`, `system.os`, `tw.version`) nor an override in its colon
   spelling (`rc.data.location:<dir>`, `rc:<file>`) reaches the binary (brief 0074). That is
   defence in depth: finding SEC-007 — an `rc.` override inside a date value — is refuted on
   Taskwarrior 3.5.0 by the container regression `TestDateValuesAreOneArgument`, which also fails
   on purpose when the binary's major or minor version changes, so the refutation is re-run
   before an upgrade ships ([runbook](operations.md#upgrading-taskwarrior)).
   Values a client merely resends unchanged — a kept tag, the project a task already has —
   are **not** re-validated, or live users' legacy data would become uneditable.
4. **`RULE-ARCH-004`** keeps `subprocess` importable only from
   [`backend/app/services/task_runner.py`](../backend/app/services/task_runner.py). A choke
   point only works while it stays the only door, and a second caller would bypass both
   controls above with nothing going red.

**How the boundary reports failure.** `_run` reads Taskwarrior's exit code: 0 and 1 are
success (1 is "nothing matched"). **2 is Taskwarrior's generic error code.** Mostly it is
Taskwarrior refusing the input — an unparseable date, a priority outside `H`/`M`/`L`, `recur`
without `due`, stripping `recur` or `due` from a recurring task — and `_run` raises
`TaskwarriorRejected`, a `ValueError`, so every router answers 400 with Taskwarrior's stderr as
the detail. But 3.5.0 also exits 2 when it cannot reach its own store: a missing rc file, a
data directory it cannot create, and every sqlite failure (unable to open, read-only, corrupt,
locked), which it reports with sqlite's `Error code N`. Those are the server's fault and their
stderr can name the absolute data path, so when the stderr matches `_SYSTEM_FAULT` `_run` logs
it and raises a `RuntimeError` with a generic message: 500, no path. Any other code stays a
`RuntimeError`, 500. Until this, all of them were 500. The stderr of the input refusals checked
names the offending value and nothing about the server, no data path (checked on 3.5.0, pinned
in `tests/container`) — **except when the value is one the binary evaluates**: a DOM reference
in a date (`due:rc.data.location`) came back as `'<absolute store path>' is not a valid date`,
`system.os` as the OS, `tw.version` as the version, and an authenticated caller read them from
the 400 until the second review of brief 0074. Two controls now: the date grammar refuses every
DOM reference before the argv, and `_run` replaces any rc-2 stderr that names the data directory
with a generic refusal (the stderr is logged). The no-path claim covers the refusals checked
plus that substitution; a refusal that echoes some other evaluated value not under the data
directory is not covered by it. The
binary never inherits the server's stdin (`/dev/null`), and `rc.recurrence.confirmation=no`
is one of `_run`'s own overrides: modifying one instance of a recurring task otherwise asks
whether to modify all of them and, on a terminal, waited for an answer until the timeout.

Reading back a created task uses Taskwarrior's `+LATEST` virtual tag rather than re-querying
by description. The old form put user text into a *filter* position — the one place `--`
cannot protect — so the same string was an injection surface twice, and it returned the wrong
task whenever two shared a description.

**What was there before was not a control.** Every command able to carry an override also
required free text, and the override consumed it, so writes failed. That is a property of a
third-party argument parser, and it could change in any release — as the theme-file break of
2026-08-25 showed, that binary does change under us.

## Browser headers

Since 2026-11-24 ([ADR 0048](adr/0048-container-hardening-and-the-browser-edge.md), finding SEC-004) the
frontend's nginx sends six headers on **every** response — the SPA, its assets, the `index.html` fallback, the
proxied API and MCP, and the 4xx/5xx nginx generates itself:

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | `frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'` | Enforced now: nothing may frame the app, no plugin content, no `<base>` rewriting, forms post only here |
| `Content-Security-Policy-Report-Only` | same origin for everything, no inline script or style, no `eval`, `data:` images only | The strict policy, **report-only** until `SHIM-WEB-001` (expires 2027-01-15) |
| `X-Content-Type-Options` | `nosniff` | A response is never sniffed into script |
| `Referrer-Policy` | `no-referrer` | No URL of this app leaves in a `Referer` |
| `X-Frame-Options` | `DENY` | Framing blocked for browsers that predate `frame-ancestors` |
| `Permissions-Policy` | every powerful feature denied; `clipboard-write=(self)` | Settings copies the API key and the MCP snippets; nothing else is used |

`RULE-OPS-005` fails the gate if a header goes missing, loses `always` (it would then vanish from every error
page), is overridden by an `add_header` in a `location` (which strips all of them there), allows anything but
`'self'`/`'none'`, names a reporting endpoint, or if HSTS appears — that belongs on the TLS terminator
([docs/operations.md](operations.md#hsts-belongs-on-the-tls-terminator)).

**Why the strict policy is report-only.** The JWT lives in `localStorage`, readable by any script on the origin,
so the strict policy is the one that bounds an injection. `frontend/tests/cspBuild.test.js` builds the SPA
and refuses anything the policy would block; one headless-browser pass under the **enforced** strict policy
over every route of both UIs saw no violation (brief 0076). Report-only is how the rest of real use gets
checked before the policy can break it. There is no reporting endpoint: violations show in the browser
console as `[Report Only] Refused to …`. To move it to enforced, use every view with the console open for 14
days of normal use, then change the header and remove `SHIM-WEB-001` in the same commit.

**FastAPI's interactive docs do not fit the strict policy.** nginx proxies `/api/docs` and `/api/redoc`, and
both load Swagger UI / ReDoc from `cdn.jsdelivr.net` and run an inline script. They report violations today
and will break once the strict policy is enforced. The change that removes `SHIM-WEB-001` decides them —
turned off (`docs_url=None`, a public-surface change through the migration pattern) or their breakage accepted
in writing. Their violations during the soak are expected and are not SPA violations.

**What this does not establish.** No script-injection sink is known; this adds the missing layer, it fixes no
exploit. The headers the public origin sends are read only after a deploy, by `verify-deploy`, because Traefik
sits in front (`RISK-OPS-008`).

## What is not enforced here

- **Frontend role checks are display, not a control.** Since ADR 0050 `auth.role` comes from
  `GET /auth/me` on every page load and storage no longer decides it (`RISK-SEC-001`, resolved).
  Code running in the page can still change the in-memory store and see admin screens; every
  `/admin` route is guarded server-side, so the result is 403s rather than access.
- **Only an explicit logout clears the browser.** A session that ends by a 401 or a closed browser
  leaves the account's unsent queue and draft in the profile, locked to that account
  (`RISK-FE-001`).
- **`role` is constrained only from schema version 1 on.** Version 1 (brief 0073, ADR 0047)
  rebuilds `users` with `role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'))`, so a
  value written outside the application is refused by the database. A database that already holds
  such a value refuses the rebuild instead (ERROR `schema migration refused`, counted, never named)
  and stays at version 0, where the column is the old `TEXT DEFAULT 'user'`; every in-application
  writer validates against `VALID_ROLES` and an unrecognised value is not an admin, so it still fails
  closed. Recorded as `RISK-SEC-002` until production reports version 1.
- **The login limiter is in-process and per-worker** (`RISK-SEC-003`). Under one host and
  one worker — decision F1 — that is the whole population; a second worker would multiply the
  effective limit by the process count. The re-open trigger is executable:
  `test_login_budget.py` (`TestTheSingleWorkerAssumption`, `TestTheSingleWorkerPinIsWholeFile`)
  fails when the Dockerfile's CMD stops pinning `--workers 1`, the Dockerfile sets
  `WEB_CONCURRENCY`, an `ENTRYPOINT` or gunicorn, or a compose file sets `WEB_CONCURRENCY`,
  `replicas`, `scale` or `--workers`. It reads those files; it does not see a host that runs the
  image some other way. When it fires, a
  limiter shared by every worker — at the edge (Traefik) or in a datastore all workers reach — is a
  precondition of the change, not a follow-up.
