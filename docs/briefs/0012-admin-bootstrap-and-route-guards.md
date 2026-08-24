# Change Impact Brief 0012 — The admin bootstrap, and a declared authorization posture

| Field | Value |
|---|---|
| **Requested outcome** | Remove the hard-coded `uli` → admin promotion (SEC-2) without anyone losing admin access, make roles real everywhere in the app, and stop a forgotten route guard from being something only a careful reader would catch. |
| **Owning unit** | `be/adapters/db`, `be/routers`, `be/leaves`, `docs`, `ops`, `tests` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md), [`docs/security.md`](../security.md) |
| **Rule IDs introduced** | `RULE-SEC-001` |
| **Risks recorded** | `RISK-SEC-001` (frontend role check is cosmetic), `RISK-SEC-002` (no DB-level constraint on `role`) |
| **Entry points** | [`backend/app/database.py`](../../backend/app/database.py) (`bootstrap_admin`), [`backend/app/routers/admin.py`](../../backend/app/routers/admin.py) (`set_user_role`), [`rules/route-guards.toml`](../../rules/route-guards.toml), [`tools/checks/route_guards.py`](../../tools/checks/route_guards.py) |
| **Affected public surfaces** | `PUT /admin/users/{target}/role` gains a **409** for the last-admin case. No route is added, removed or renamed; no MCP tool name changes. The `400` on an invalid role and its exact detail string are preserved deliberately — see below. |
| **Known dependents** | `backend/app/main.py` calls `init_db`; every router depends on `dependencies.py`, which is unchanged. |
| **Uncertain / dynamic areas** | `RISK-SEC-001`, `RISK-SEC-002`. `BLIND-TEST-001` applies as usual: router coverage is TestClient-driven, so it produces no `TESTED_BY` edge. |
| **Analogous implementations** | [`tools/checks/contract_check.py`](../../tools/checks/contract_check.py) — the same shape as the new route-guard check: declared state in a checked-in file, compared against what the repository actually contains, emitting `RULE-ID|message`. |
| **Delivery Pattern** | **Security or Operability Change** — failure scenario, control, adversarial proof. Two negative fixtures construct the violation and observe the gate go red. |
| **Required tests** | Nine unit tests: five pinning each branch of `bootstrap_admin`, four on the last-admin guard. Two negative fixtures for `RULE-SEC-001`. |
| **Intended scope** | Step 11's SEC-2 half, plus the role work. SEC-1 needed no code change (production was never on a default). SEC-4, SEC-6 and SEC-8 remain open. |
| **Base revision** | `617059e` |

## The failure scenario

`init_db()` ran, on **every** startup:

```sql
UPDATE users SET role='admin' WHERE username='uli' AND role='user'
```

Two defects, not one. The obvious one: this is a public repository, so on any third-party
deployment whoever registers `uli` is promoted to administrator at the next restart.

The subtler one is that it **re-asserts every boot**. Demote someone through the admin UI,
restart, and they are an admin again — silently, with the UI having reported success. This is
why making the name configurable would not have been a fix. `ADMIN_USERNAME=uli` applied on
every boot is the same trap with a nicer label; configuration that quietly overrides a
decision made in the application is worse than a hard-coded rule, because it looks like it
obeyed.

## The control

`bootstrap_admin()` fires **only when the database contains no admin at all**. That makes it
self-limiting: it cannot contradict a role set through the API, and it cannot lock anyone
out, because it only ever adds an admin to an instance that has none. It is a recovery path,
not a policy. An unregistered `BOOTSTRAP_ADMIN` is not created — that would mean inventing a
password hash nobody chose.

Paired with it, `PUT /admin/users/{target}/role` now returns **409** rather than demote the
only remaining admin. The two compose: the guard makes zero admins unreachable through the
API, the bootstrap recovers an instance that reaches zero some other way. The check is on the
admin *count*, not on self-demotion — demoting someone else is just as final when they are
the only one left.

**This is a no-op for production.** The deploy host's database was read on 2026-08-24 and
holds one admin and one user, so the bootstrap returns on its first branch.

## The audit, and why it is not the deliverable

Thirty routes: 23 `user`, 4 `admin`, 3 open. That audit was worth doing once and worth
nothing afterwards — it is accurate until the next route is added, and a forgotten guard
fails silently, because the route still works. It just works for everybody.

So the posture is checked-in state. [`rules/route-guards.toml`](../../rules/route-guards.toml)
names every route and its guard, and `RULE-SEC-001` fails the gate when the file and the code
disagree **in either direction** — a guard removed, and a route added without a decision.
Adding a route now means adding a line. That friction is the point, and it is the only part
of this change that survives a future contributor who has read none of it.

The check reads the guard from the handler's **parameter defaults**, because that is where
FastAPI enforces a dependency. A substring search would report a guard on a handler that only
mentions `get_current_admin` in a comment.

An `open` route must record a reason, because a route anyone can reach is a decision and a
decision with no reason cannot be told apart from an oversight. `POST /inbox` is declared
open and says why: it authenticates through its own API-key path instead of
`get_current_user`, which is finding SEC-6. Declaring what is true beats declaring what was
intended.

## A public surface preserved on purpose

The first attempt typed `RoleUpdate.role` as `Literal["admin", "user"]`. It is better typing
and it broke a surface: FastAPI rejects at validation, so the documented `400` with detail
`"Role must be 'admin' or 'user'"` became a `422`. Decision **F2** treats REST as externally
consumed, so that was reverted. On the response model the same annotation would have turned a
legacy junk role into a 500.

The closed set lives in `VALID_ROLES` and is enforced in the handler, where the status code is
ours to choose. Caught by an existing characterization test, which is what those are for.

## A test that expired

`test_an_admin_can_demote_themselves` pinned the old behaviour and said so in its docstring:
*"the repair belongs with the admin-bootstrap work in Step 11."* This is Step 11, so the test
went with the defect. `TestLastAdminGuard` asserts the repaired behaviour in its place.

## Behaviour change

**Yes, three.** Stated explicitly because this is not a refactor:

1. An instance with no `BOOTSTRAP_ADMIN` set promotes nobody at startup, where it previously
   promoted `uli`. No effect on production, which already has an admin.
2. `PUT /admin/users/{target}/role` returns 409 when the target is the last admin.
3. `./run grant-admin` exists. New command, no existing behaviour touched.
