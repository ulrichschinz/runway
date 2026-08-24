# ADR 0017 — The admin bootstrap is self-limiting, and route guards are declared

- **Date:** 2026-08-24
- **Status:** Accepted
- **Scope:** `backend`, `ops`

## Context

`init_db()` ran this on **every** startup, and had since before this repository had any
tests:

```sql
UPDATE users SET role='admin' WHERE username='uli' AND role='user'
```

Finding **SEC-2**, rated critical, and it has two defects rather than one.

The obvious one is the hard-coded name. This is a public repository, so on any third-party
deployment whoever registers `uli` is silently promoted to administrator at the next restart.

The subtler one is that it **re-asserts on every boot**. Demote someone through the admin UI
and the next restart puts them back, silently, with the UI having reported success. A rule
that quietly overrides a decision made in the application is worse than one that refuses it,
because it looks like it obeyed.

Separately, the authorization posture of the REST surface existed only as thirty function
signatures. A one-time audit read them all — 23 `user`, 4 `admin`, 3 open — but an audit is
accurate until the next route is added, and a forgotten guard fails silently: the route
works, it just works for everybody.

## Decision

**The bootstrap fires only when the database contains no admin at all.**

```python
BOOTSTRAP_ADMIN=<username>   # promoted only if COUNT(role='admin') == 0
```

That condition is the whole design. Making the name configurable would have fixed the first
defect and kept the second — `ADMIN_USERNAME=uli` re-asserted every boot is the same trap
with a nicer label. Firing only into an empty state makes it **self-limiting**: it cannot
contradict a role set through the API, and it cannot lock anyone out, because it only ever
adds an admin to an instance that has none. It is a recovery path, not a policy.

It does not create the account if the name is unregistered — that would mean inventing a
password hash nobody chose.

**The last admin cannot be demoted.** `PUT /admin/users/{target}/role` returns 409 instead.
The two mechanisms compose deliberately: the guard makes zero admins unreachable through the
API, and the bootstrap recovers an instance that reaches zero some other way.

The check is on the admin *count*, not on self-demotion. Demoting someone else is just as
final when they are the only one left, and a self-demotion check would have missed that.

**Every route declares its guard** in `rules/route-guards.toml`, enforced by `RULE-SEC-001`.
The check reads the guard from the handler's **parameter defaults**, because that is where
FastAPI enforces a dependency — a handler that merely mentions `get_current_admin` in a
comment or calls it internally is not guarded by it, and a substring search would have said
otherwise.

An `open` route must record a reason. Three do: registration and login cannot require
credentials, and `POST /inbox` authenticates through its own API-key path rather than
`get_current_user` — finding SEC-6, declared `open` so the check reports what is true rather
than what is intended.

## Alternatives considered

- **`ADMIN_USERNAME` applied on every boot.** Rejected above: it parameterises the defect
  instead of removing it.
- **No boot-time bootstrap at all.** Attractive — roles managed only through the API and the
  CLI. Rejected because losing every admin would then have exactly one recovery path, and it
  runs on the deploy host as root against a live SQLite file. Keeping a second, safer path
  costs one query at startup.
- **A `CHECK` constraint on `users.role`.** Wanted, and deferred. SQLite cannot add one
  without rebuilding the table, and migrations here swallow every exception
  (`WAIVER-OPS-001`), so a half-applied rebuild would be silent — a worse failure than the
  one being prevented, given every in-application writer already validates and an
  unrecognised value fails closed. Recorded as `RISK-SEC-002`, re-opening when
  `WAIVER-OPS-001` is resolved.
- **`Literal["admin", "user"]` on the pydantic models.** Tried, and reverted. On the request
  model it turns the API's documented `400` with a specific detail string into FastAPI's
  `422` — a breaking change to a surface that decision **F2** treats as externally consumed.
  On the response model it would turn a legacy junk role in the database into a 500. The
  closed set lives in `VALID_ROLES` and is enforced in the handler, where the status code is
  ours to choose.
- **Deriving the route guard by searching the handler's source text.** Rejected: it reports
  a guard where there is only a mention.

## Consequences

- SEC-2 is closed. An unconfigured instance now promotes nobody, and a configured one
  promotes only into an empty state.
- **The change is a no-op for the current production database**, which was read on
  2026-08-24 and contains one admin and one user. The bootstrap's first branch returns
  immediately.
- A characterization test that pinned the old behaviour — *"an admin can demote themselves,
  after which no account can reach `/admin` at all"* — expired with the defect it described,
  and was removed. It said in its own docstring that the repair belonged to this step.
- Adding a route now requires a line in `rules/route-guards.toml`. That is friction on
  purpose, and it is the only part of this change that survives contact with a future
  contributor who has not read any of it.
- **The frontend's role check remains cosmetic** (`RISK-SEC-001`) — `auth.role` comes from
  `localStorage`. Server-side guards make it a display bug rather than an escalation.
- SEC-4 (CORS), SEC-6 (`/inbox` unification) and SEC-8 (login rate limiting) are untouched
  and remain open.
