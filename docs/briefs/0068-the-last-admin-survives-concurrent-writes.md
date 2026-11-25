# Change Impact Brief 0068 — The last admin survives concurrent writes

| Field | Value |
|---|---|
| **Requested outcome** | Finding **REV-002** (Codex review of audit run `20261118T131510Z-claude`, 2026-11-24): the last-admin guard read the admin count and wrote the role in separate, uncoordinated statements on a request's own connection, so two overlapping demotions on an instance with two admins could both pass the check and leave **no** admin. The serial 409 was tested, concurrency was not. Ordered by Uli on **2026-11-24** as milestone M3.1 of the security remediation plan. Closing criterion (plan §5): a parallel demotion leaves at least one admin. Plan §4 M3.1 adds: check and write on **one** connection in `BEGIN IMMEDIATE`; the invariant checked server-side **after** the write and the whole write rolled back on violation; a two-connection test with a barrier in which exactly one of two demotions is refused; account deletion and future bulk operations held to the same invariant. |
| **Owning unit** | `be/adapters/db` — `backend/app/database.py` (new: `LastAdminError`, `count_admins`, `admin_preserving_write`, `set_role`; `delete_account` now runs inside the guard). `be/routers` — `backend/app/routers/admin.py` (`set_user_role` calls `set_role` instead of its own count and update). `ops` — `tools/grant-admin.py` (the operator CLI's demotion runs in the same serialised transaction and refuses to remove the last admin). `docs` — this brief, `docs/security.md`, `docs/threat-model.md`, `docs/task-interface.md`. `tests` — `backend/tests/unit/test_last_admin_concurrency.py` (new). |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 (anything reading or writing a database goes in `database.py`), §5 (REST through the migration pattern; the SQLite schema forward-only and additive); [`backend/AGENTS.md`](../../backend/AGENTS.md) (only `be/adapters/db` opens a connection; routers reach the database through it). No gate rule is added or changed, so the META-RULE is not engaged. |
| **Governed by** | Respected: [ADR 0017 — Admin bootstrap and route guards](../adr/0017-admin-bootstrap-and-route-guards.md) (the last-admin guard and the zero-admin bootstrap; this change makes the guard hold under concurrency, it does not change what it decides), [ADR 0026 — The audit log](../adr/0026-the-audit-log.md) (the refused demotion stays an `auth.role.changed` event with outcome `refused` and the same detail). No new ADR: the decision — a serialising transaction with a post-write check — is the one the plan names and nothing about it is non-obvious enough to need one. |
| **Rule IDs introduced** | None. |
| **Entry points** | `PUT /admin/users/{target}/role` (REST-only, admin-guarded, not an MCP tool — ADR 0037). `POST /auth/register`'s rollback path (`delete_account`, called when a new account's store cannot be provisioned). `./run grant-admin --role user`. |
| **Affected public surfaces** | **None changed.** REST/OpenAPI: same route, same status codes (200 / 400 / 404 / 409), same 409 detail `Refusing to demote the last admin — promote another user first`; `ops/surfaces/openapi.json` unchanged. MCP tools unchanged (27; admin routes are REST-only). DB schema unchanged (no column, no table, no constraint). No env var. SPA routes and `localStorage` keys unchanged. A new **failure mode** on the role route under heavy write contention: a request that waits longer than SQLite's 5 s busy timeout for the write lock gets 500 rather than a silent wrong answer — fail closed. |
| **Known dependents** | From `./run impact` (index `current`, revision `c7132f6a2789`, 1760 nodes / 2828 edges): `database.py` → `audit.py`, `dependencies.py`, `main.py`, `routers/{admin,auth,gtd,projects}.py`, `services/{password_reset,storage_migration}.py`, transitively `routers/{inbox,tasks}.py`; `routers/admin.py` → `main.py` (routes `GET/PUT /admin/settings`, `GET /admin/users`, `PUT /admin/users/{target}/role`); `routers/auth.py` → `main.py`; `tools/grant-admin.py` (unit `ops`) has no import dependents. |
| **Uncertain / dynamic areas** | `BLIND-TEST-001` — `admin.py` and `grant-admin.py` have no import-derived test protection; both are exercised by tests that call them (TestClient, and loading the CLI module by path), which the index cannot see. SQLite locking is the serialisation mechanism, so the guarantee holds for every writer of the same `users.db` file on one host — the application, the operator CLI and any second worker alike — but not for a database on a network filesystem whose locks do not work (not a supported deployment). |
| **Analogous implementations** | `replace_password` / `rehash_password` (brief 0066/0067): a write whose correctness under concurrency is enforced **in the database**, not by a read in Python first. `test_password_kdf.py::TestRehashCompareAndSwap`: a parallel test that holds one request between its read and its write. |
| **Delivery Pattern** | **Security or Operability Change** — failure scenario, control, adversarial red test written first and observed failing. Not a data or public-surface migration: no stored data and no surface changes shape, so expand → migrate → switch → contract has no step to take (stated rather than skipped). |
| **Required tests** | Parallel (ASGI, two requests, two connections, a barrier): two admins demoted at the same time — exactly one 409, at least one admin left; demotion racing the deletion of the other admin. DB integration: the guard refuses a deletion of the only admin and keeps the row; a bulk demotion inside the guard is rolled back whole; a database with no admin at all is not blocked from ordinary writes; a non-admin write passes; the guard refuses to open inside a transaction already in progress. ASGI/REST: the existing serial 409, its audit row and its exact detail stay green. Ops CLI: `grant-admin --role user` on the last admin is refused and changes nothing; promotion still works. Container: not applicable — no Taskwarrior path changes; the existing suite runs. Frontend: not applicable — no response changes. |
| **Intended scope** | The atomic invariant for every path in this repository that can remove an admin: role change through the API, account deletion, the operator CLI, and a reusable guard for any future bulk path. **Not** in scope: the login budget (M3.2, REV-003); a `CHECK(role IN ('user','admin'))` constraint (needs the versioned migration mechanism of M8, `RISK-SEC-002`); any production action. |
| **Base revision** | `c7132f6` (`security/m2-2-argon2id`) |

## Failure scenario

Alice and Bob are the instance's only admins. Each, in their own browser, demotes the other (or one of
them demotes both, from two tabs). Each request runs on its own SQLite connection (`get_db`):

1. Request A: `SELECT role` for Bob → `admin`; `SELECT COUNT(*) … role='admin'` → **2**, so the guard passes.
2. Request B: the same for Alice → **2**, the guard passes.
3. A: `UPDATE users SET role='user' WHERE username='bob'`; commit.
4. B: `UPDATE users SET role='user' WHERE username='alice'`; commit.

Both answer 200. The instance has **zero** admins: every `/admin` route now requires an admin nobody has, so
there is no route back through the API, and recovery is a restart with `BOOTSTRAP_ADMIN` set or
`./run grant-admin` on the host — the state the guard exists to make unreachable. The read in steps 1–2 ran
in autocommit (Python's `sqlite3` opens a transaction only before a write), so nothing held the count still
between the check and the write.

Two further paths remove an admin without the guard at all: `delete_account` (today called only to undo a
registration whose store could not be provisioned, so on a fresh `user` row — but nothing in the function
said so), and `./run grant-admin --role user`, which demoted the last admin without a word.

## Control

1. **One serialised write transaction** (`database.admin_preserving_write`): `BEGIN IMMEDIATE` on the
   request's one connection takes SQLite's write lock **before** anything is read, so a second writer of the
   same file waits (up to the 5 s busy timeout) until the first commits or rolls back. Count, read, write and
   check all happen inside it.
2. **The invariant is checked after the write**, not only before: if the instance had at least one admin when
   the transaction began and has none at its end, the whole transaction is rolled back and
   `LastAdminError` is raised. A check after the write cannot be raced by a write the check did not foresee,
   and it holds for any statement run inside the guard — including a future bulk operation.
3. **Every path that can remove an admin goes through it:** `set_role` (the API route), `delete_account`
   (registration rollback), and the operator CLI's demotion (`tools/grant-admin.py`, same `BEGIN IMMEDIATE`
   and post-write check over its own `sqlite3` connection; promotion — the escape hatch — is unchanged).
4. **An instance with no admin is not blocked.** The condition is "had one, has none", so a fresh database
   before `BOOTSTRAP_ADMIN`, or one being recovered, can still register users and change roles.
5. The router keeps its answer: 409 with the same detail and the same `refused` audit row. There is now one
   mechanism, not a Python pre-check plus a database one, so the refusal cannot disagree with the write.
6. The guard refuses to open on a connection that is already inside a transaction (a programming error that
   would otherwise make `BEGIN` fail or, worse, commit someone else's half-done work).

## Test evidence

Run on 2026-11-25 on an arm64 Mac. The red column is `backend/tests/unit/test_last_admin_concurrency.py`
copied into a detached worktree of the unchanged production code at `c7132f6`, before the control was
applied there.

| Tier | What | Before the control (`c7132f6`) | After |
|---|---|---|---|
| Parallel (ASGI, two requests, two connections, barrier before the write) | `test_each_admin_demotes_the_other` — Alice demotes Bob while Bob demotes Alice | **red: `assert [200, 200] == [200, 409]`** — both succeeded, zero admins: the race reproduced, not argued | exactly one 200 and one 409 with the unchanged detail; one admin left; both requests reached their write (`barrier.arrived == 2`) but never stood at the barrier together (`barrier.met <= 1`) |
| Parallel | `test_one_admin_demotes_both_from_two_tabs` | **red: `[200, 200]`** | one 200, one 409, one admin |
| Parallel / audit | `test_the_refusal_is_audited_as_a_refusal` | **red: `['success', 'success']`** | `refused` + `success`; detail `refused: this is the last admin` |
| Parallel (two connections, barrier, no HTTP) | `test_demotion_racing_the_deletion_of_the_other_admin` — connection 1 deletes Bob, connection 2 demotes Alice | **red** (`delete_account` had no guard; `LastAdminError` absent) | exactly one `LastAdminError`, no other exception, one admin left |
| DB integration | `TestDeletion` — the only admin cannot be deleted; a plain account still is | **red** (no guard) | green |
| DB integration (bulk) | `TestTheGuardItself` — a bulk `UPDATE users SET role='user'` inside the guard is rolled back **whole** (an earlier statement in the same transaction too); a bulk write that keeps an admin commits; an instance with no admin is not blocked; an unknown account is `None` and leaves no open transaction; the guard refuses to open inside a transaction already in progress | **red** (no API) | green |
| Ops CLI | `TestTheOperatorCli` — `grant-admin --role user` on the last admin exits 1 and changes nothing; demotion with another admin left still works; promotion unchanged | **red: `assert 0 == 1`** — the CLI demoted the last admin | green |
| ASGI/REST (existing) | `test_admin.py` incl. `TestLastAdminGuard` (serial 409, its audit row and detail) | green | green, unchanged |
| Container | not applicable — no Taskwarrior path changed; the existing suite runs in `make verify` | — | see Results |
| Frontend | not applicable — no response changed | — | — |

13 of the 14 new tests were red before the control; the one green one,
`test_promotion_the_escape_hatch_is_unchanged`, pins behaviour that must not change.

`./run impact` lists `mcp_tools: ['set_user_role']` against `PUT /users/{target}/role`; that is the
index's name-derived guess, not the surface: `ops/surfaces/mcp-tools.json` has no `set_user_role`, the
admin routes are REST-only (ADR 0037), and the snapshot is unchanged.

## Results

- REV-002's closing criterion (plan §5: a parallel demotion leaves at least one admin) is met and proved by
  a test observed red on the old code and green on the new; it runs in every `make check`.
- No public surface changed (`make surfaces` reports no drift), no rule, budget or waiver changed, no
  residual risk was added or removed.
- Nothing is deferred to a date or trigger: the change needs no elapsed time, data migration or
  deprecation window. Out of scope by the plan, and not done here: M3.2 (REV-003, login budget) and the
  `CHECK(role …)` constraint, which waits for the versioned migration mechanism (M8, `RISK-SEC-002`).
- Rollback: reverting the commit restores the old (racy) guard; no stored data changed shape, so the
  previous deploy runs on the same database.
- Gate: recorded below after the run.
