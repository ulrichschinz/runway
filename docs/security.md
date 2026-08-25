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
2. **`Authorization: Bearer <jwt>`** — signed with `JWT_SECRET`, `HS256`, 24h.
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
decision with no recorded reason cannot be told apart from an oversight. Three are open today:

- `POST /auth/register` and `POST /auth/login` — the routes that create and exchange
  credentials cannot require them. Registration is additionally gated at runtime by the
  `allow_registration` site setting, which an admin controls.
- `GET /auth/registration-status` — read-only, reports whether registration is open so the
  login page can hide the register option instead of inviting someone to type credentials and
  then refusing them. Discloses nothing that POSTing to `/auth/register` does not already
  reveal.


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
column and no second gate.

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
   `--` becomes text.
2. **`reject_structural_tokens`** refuses `rc.`-shaped tokens in the caller-supplied argument
   list — the filter and modifier positions, which must stay parseable and so cannot sit
   behind a separator.
3. **`RULE-ARCH-004`** keeps `subprocess` importable only from
   [`backend/app/services/task_runner.py`](../backend/app/services/task_runner.py). A choke
   point only works while it stays the only door, and a second caller would bypass both
   controls above with nothing going red.

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
