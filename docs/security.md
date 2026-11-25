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

1. **`X-Api-Key`** — matched against the `api_key` column. Checked **first**, before any
   token work, which is why rotating `JWT_SECRET` does not disturb agents, MCP clients or
   automations, and why an account locked out of password login can still be used by them.
2. **`Authorization: Bearer <jwt>`** — signed with `JWT_SECRET`, `HS256`, 24h. A valid
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
   `SHIM-SEC-008`. **API keys are not revoked by a password change** — they rotate separately
   (`POST /auth/apikey/regenerate`); both settings pages say so before the change and point to it after.
3. **`Authorization: Bearer <api_key>`** — an API key in the Bearer slot, tried last, only
   after a JWT decode fails. This is `SHIM-SEC-006`, not a design: it is the shape `/inbox`
   used before it was unified onto `get_current_user` (finding SEC-6), kept because every
   agent and MCP client sends it today. Recorded in
   [`rules/shims.yaml`](../rules/shims.yaml) with a removal step and an expiry, enforced by
   `RULE-SEC-002`.

`get_current_admin` builds on `get_current_user` and additionally requires `role = 'admin'`,
returning **403** when the principal is authenticated but not an admin — distinct from the
**401** an unauthenticated request gets.

## The route guard declaration

[`rules/route-guards.toml`](../rules/route-guards.toml) names every HTTP route and the guard
it requires. It is normative: **`RULE-SEC-001`** fails the gate when the file and the code
disagree in either direction, and `tools/checks/route_guards.py` reads the guard out of the
handler's parameter defaults — where FastAPI actually enforces a dependency — rather than by
searching the function text.

| Guard | Meaning |
|---|---|
| `admin` | `Depends(get_current_admin)` — authenticated, and `role = 'admin'` |
| `user` | `Depends(get_current_user)` — any authenticated principal |
| `open` | reachable unauthenticated, or authenticating by some other means |

**Adding a route means adding a line to that file.** That is the point of it. A forgotten
guard fails silently — the route works, it just works for everybody — which is not something
a passing test suite notices, and not something a reviewer reliably notices either, because
the evidence is one missing parameter default among thirty handlers.

An `open` route must record a `reason`. A route anyone can reach is a decision, and a
decision with no recorded reason cannot be told apart from an oversight. Five are open today:

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

The two mechanisms compose: the guard makes zero admins unreachable through the API, and the
bootstrap recovers an instance that reaches zero some other way.

## The escape hatch

```sh
./run grant-admin --db /path/to/users.db <username>
```

Promotes an account directly, bypassing the API and its last-admin guard. `--db` has no
default on purpose: this writes to a live database, and the path should be a deliberate
keystroke rather than an inherited one.

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

## Passwords

Since brief 0067 (finding SEC-006, ADR 0044 Decision 5):

- **Hash: Argon2id** (argon2-cffi; t=3, 64 MiB, one lane — measured against a 250 ms / 64 MiB
  budget per verification and 500 ms per login, bcrypt check included). Hashes from before are passlib-era bcrypt and are still verified (`SHIM-SEC-009`).
- **Limits, in UTF-8 bytes:** every password field at most **1024**; a password being set
  (register, change) at least **8** and without a NUL character. Outside the rule is **422**, before any hash or query. A login
  has no minimum, so a password set before the rule still works.
- **Body limit:** **16 KiB** on `/auth/*`, **1 MiB** elsewhere, **413** before routing — in the
  backend itself and, for `/api/auth/`, at nginx.
- **Migration:** an exact bcrypt login (input of 71 bytes or fewer) is rehashed to Argon2id by a
  compare-and-swap on the old hash; no session ends. A bcrypt match for 72 bytes or more is never
  rehashed from what was typed — bcrypt saw only the first 72 — so the login answers
  `password_change_required: true`, both UIs send the person to Einstellungen, and after the window
  such a login is refused and needs the operator reset (`docs/operations.md`).
- **No oracle:** every login costs one Argon2id and one bcrypt operation whatever the account, and
  every failure is the same 401 `Invalid credentials`. A NUL byte is a 401, no longer a 500.
- **Timeline**, from the image's first boot (`site_settings.password_kdf_expand_at`): 7 days of
  bcrypt writes (so a rollback can still verify — and in that week a new password must be shorter
  than 72 bytes, so bcrypt stores it whole), then Argon2id writes and rehash-on-login, and from
  day 67 the ambiguous case refused. No deploy and no setting moves a step; a missing row fails
  closed.

## Login throttling

`POST /auth/login` allows `LOGIN_RATE_LIMIT` failed attempts per username per
`LOGIN_RATE_WINDOW_SECONDS`, then answers **429** with `Retry-After` (finding SEC-8). Only
failures count, a success clears the budget, and the check runs *before* the password is
verified so a locked-out username buys an attacker no bcrypt work.

Keyed on username rather than IP, because rotating source addresses is cheap. The trade is
real and accepted: someone who knows a username can deny it password login for the window.
API keys are unaffected, so agents keep working through a lockout. Unknown usernames are
throttled identically — exempting them would make the limiter a user-enumeration oracle.

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
in `tests/container`); the no-path claim covers those refusals only. The
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

## What is not enforced here

- **Frontend role checks are cosmetic.** `auth.role` in the Vue store is read from
  `localStorage`, so a viewer can make the admin UI appear. Every `/admin` route is guarded
  server-side, so the result is 403s rather than access — a display bug, not a privilege
  escalation. Recorded as `RISK-SEC-001`.
- **`role` has no database-level constraint.** The column is `TEXT DEFAULT 'user'` and would
  accept anything written outside the application. Every in-application writer validates
  against `VALID_ROLES`; a value written by hand would not be an admin, so it fails closed.
  Recorded as `RISK-SEC-002`.
- **The login limiter is in-process and per-worker** (`RISK-SEC-003`). Under one host and
  one worker — decision F1 — that is the whole population; a second worker would multiply the
  effective limit by the process count.
