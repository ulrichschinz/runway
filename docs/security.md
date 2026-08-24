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
   automations.
2. **`Authorization: Bearer <jwt>`** — signed with `JWT_SECRET`, `HS256`, 24h.

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
decision with no recorded reason cannot be told apart from an oversight. Four are open today:

- `POST /auth/register` and `POST /auth/login` — the routes that create and exchange
  credentials cannot require them. Registration is additionally gated at runtime by the
  `allow_registration` site setting, which an admin controls.
- `GET /auth/registration-status` — read-only, reports whether registration is open so the
  login page can hide the register option instead of inviting someone to type credentials and
  then refusing them. Discloses nothing that POSTing to `/auth/register` does not already
  reveal.
- `POST /inbox` — not actually unauthenticated: it implements its own API-key check instead
  of using `get_current_user`. Finding SEC-6, and owed a unification.

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

## What is not enforced here

- **Frontend role checks are cosmetic.** `auth.role` in the Vue store is read from
  `localStorage`, so a viewer can make the admin UI appear. Every `/admin` route is guarded
  server-side, so the result is 403s rather than access — a display bug, not a privilege
  escalation. Recorded as `RISK-SEC-001`.
- **`role` has no database-level constraint.** The column is `TEXT DEFAULT 'user'` and would
  accept anything written outside the application. Every in-application writer validates
  against `VALID_ROLES`; a value written by hand would not be an admin, so it fails closed.
  Recorded as `RISK-SEC-002`.
- Rate limiting on login (SEC-8), the CORS allowlist (SEC-4), and the `/inbox` unification
  (SEC-6) are open findings, not part of this model yet.
