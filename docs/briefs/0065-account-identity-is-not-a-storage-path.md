# Change Impact Brief 0065 — Account identity is not a storage path

| Field | Value |
|---|---|
| **Requested outcome** | Finding **SEC-001** (audit run `20261118T131510Z-claude`, upheld by the Codex review of 2026-11-24): the registered username was joined onto `DATA_ROOT` verbatim and handed to Taskwarrior as `TASKDATA`/`TASKRC`/`HOME`, so `alice/../alice` opened alice's store and `../x` created a directory above the data root. Ordered by Uli on **2026-11-24** as milestones M0 and M1 of the security remediation plan (decision gate D1: a random, immutable `storage_id`, never the username). |
| **Owning unit** | `be/leaves` — `backend/app/task_storage.py` (new: the account identity type, the storage resolver, the username rule). `be/adapters/db` — `backend/app/database.py` (columns, backfill, the protocol table, the account lookup), `backend/app/audit.py` (four events). `be/di` — `backend/app/dependencies.py` (`get_task_store`). `be/routers` — `auth.py`, `tasks.py`, `gtd.py`, `inbox.py`. `be/services` — `task_service.py`, `user_service.py`, `storage_migration.py` (new). `be/adapters/task` — `task_runner.py`. `be/leaves` — `config.py`. `ops` — `tools/checks/storage-binding.sh` + `storage_binding.py` (new rule), `profiles.conf`, `budgets`-neutral, `architecture.toml` (two paths), `rules/ledger.yaml`, `rules/shims.yaml`, `tools/fixtures/negative.sh`, `ops/surfaces/db-schema.sql`. `docs` — this brief, ADR 0043, `docs/security.md`, `docs/threat-model.md`, `docs/operations.md`, `docs/task-interface.md`, `README.md`, `AGENTS.md` (§3 one row). `tests`. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §2–§5 and §9 (the META-RULE: a new gate rule lands with check, ledger entry, fixture and docs); [`backend/AGENTS.md`](../../backend/AGENTS.md) (only `be/adapters/task` runs the subprocess; only `be/adapters/db` opens a connection; migrations are additive `ALTER TABLE`s in `init_db()`). |
| **Governed by** | **New:** [ADR 0043 — Account identity and Taskwarrior storage](../adr/0043-account-identity-and-taskwarrior-storage.md). Respected: [ADR 0025](../adr/0025-narrowing-the-migration-except.md) (the migration loop), [ADR 0026](../adr/0026-the-audit-log.md) (the audit log), [ADR 0006](../adr/0006-two-tier-backend-tests.md) (two test tiers). |
| **Rule IDs introduced** | **`RULE-SEC-003`** — only `backend/app/task_storage.py` may build a path from `settings.data_root`, other than the audit database's fixed name. Shim **`SHIM-SEC-007`** — the legacy username layout, accepted in `compat` mode until 2027-02-28. Residual risk **`RISK-SEC-006`** — until the operator has migrated and switched, existing accounts still live in `DATA_ROOT/<username>/`. |
| **Entry points** | Every authenticated route that reaches Taskwarrior: 22 REST routes, 21 of them MCP tools (from `./run impact backend/app/services/task_runner.py`). `POST /auth/register`. The boot path `init_db()`. The new operator CLI `python -m app.services.storage_migration`. |
| **Affected public surfaces** | **DB schema** — additive: `users.storage_id`, `users.storage_layout`, a unique index, the table `storage_migrations` (`ops/surfaces/db-schema.sql` updated). **Env vars** — one new, `TASK_STORAGE_MODE` (README). **REST/OpenAPI and MCP tools — unchanged**: the routes take a new injected dependency built only from the existing credential parameters, so the served schema and the tool list are byte-identical (`./run surfaces` reports no drift on either). Registration now refuses a username that is not a plain name with **400**, the status it already used for "taken"; 400 is not part of the OpenAPI document. **Taskwarrior data** — new accounts are created at `DATA_ROOT/<storage_id>/`; existing ones move there only through the migration. SPA: none. |
| **Known dependents** | From `./run impact`: `task_runner.py` → `task_service.py` → `routers/{tasks,gtd,inbox}.py` → `main.py`; `database.py` has 7 direct dependents and reaches all 38 surfaces; `dependencies.py` 6; `user_service.py` 1 (`routers/auth.py`). Index `current`, revision `5d85f6ee539e`, 1636 nodes / 2405 edges. |
| **Uncertain / dynamic areas** | `BLIND-TASK-001` — what the binary does with a path is known only from the container tier. `BLIND-TEST-001` — routers are reached through the TestClient, so no import-derived protection is reported for them. The production state (registration history, existing names, directory layout) is not visible from this repository — see M0 below. |
| **Analogous implementations** | SEC-3 (`task_runner.py`): one door to the binary, a control inside it. `SHIM-SEC-006`: a compatibility shape with an expiry `RULE-SEC-002` enforces. `tools/grant-admin.py`: an operator CLI with exact exit codes. |
| **Delivery Pattern** | **Security or Operability Change** (failure scenario, control, adversarial red test) **and Public-Surface or Data Migration** (expand → migrate → switch → contract) for the schema and the on-disk layout. |
| **Required tests** | Unit: resolver (`test_task_storage.py`), registration and the HTTP path with `subprocess.run` spied (`test_storage_identity.py`), migration plan/apply/rollback/idempotence/refusals (`test_storage_migration.py`), schema fresh-vs-upgrade (`test_migrations.py`). Container: cross-account read/write/modify/complete/delete with the real binary, an existing account's tasks before and after migration (`tests/container/test_storage_isolation.py`). Gate: a negative fixture for `RULE-SEC-003`. |
| **Intended scope** | Expand, migrate and switch, with the switch as configuration. **Not** in scope: deleting the legacy directories (the contract step), changing login, JWT, API-key or rate-limit behaviour (M2–M4), and any production action. |
| **Base revision** | `5d85f6e` (`main`) |

## M0 — baseline

**What was done here, in the repository.**

- `./run map` and `./run impact` on every file listed above, against a **current** index (revision
  `5d85f6ee539e`, `index current`). No `make fix` was needed; the plan recorded `STALE` on 2026-11-24
  before a rebuild, this brief's queries were made afterwards.
- `make check` on the unchanged tree: **GREEN**, 648 unit tests, 747 frontend tests, 17 s.
- Surface snapshots before the first change, as committed at `5d85f6e` (SHA-256 prefixes):
  `db-schema.sql 159e3a677d8f5748`, `mcp-tools.json e55ee9c127ef61fc`, `openapi.json 7433e94bd23be77f`,
  `spa.json fa1084fe60b1d570`, `taskrc.txt c025b42c64690027`. Env vars: the README table as of `5d85f6e`.
- The review's findings checked against `HEAD`: the reviewed revision **is** `HEAD` (`5d85f6e`), so no
  finding is "changed in the current state". The four SEC-001 locations still hold as described.

**What cannot be done from here and is an operator step** (none of it is claimed; each is in
[`docs/operations.md`](../operations.md#moving-task-storage-off-the-username) as a checklist):

1. Whether public registration is active — `site_settings.allow_registration` in the live `users.db`.
   **If it is, close it** (`PUT /admin/settings`) until the switch below; that is containment, not the fix.
2. Whether existing usernames contain separators, `.`/`..`, control characters or canonical collisions,
   and which account directories are not direct children of `DATA_ROOT` — answered by the migration's
   dry run (`plan`), which prints ids, relative paths and counts only.
3. Commit and image digest running, the process UID and mount permissions, the edge's headers and limits.
4. An encrypted, restore-tested backup of `users.db`, `data/audit.db` and every Taskwarrior directory
   **before** `apply`.
5. If the dry run shows an alias account (`blocked: alias of another account's directory`), treat it as a
   possible incident: lock the account, keep the originals, and follow the incident process.

## Failure scenario

Whoever can create an account — open registration, or anyone an admin registers — chooses
`alice/../alice` as the name, logs in, and lists, edits, completes and deletes alice's tasks; or chooses
`../x` and has the server create directories outside `DATA_ROOT`. Reproduced here before the fix:

- Unit tier, `subprocess.run` spied: `AssertionError: 'alice/../alice': TASKDATA is alice's store`
  (`tests/unit/test_storage_identity.py`, 2 of 3 failing on `5d85f6e`).
- Real Taskwarrior 3.5.0 (host binary, see "Test evidence"): the alias account's `GET /tasks` returned
  `['alice private']`, and `../escape` and an absolute name created `escape` and `abs-escape` next to
  `DATA_ROOT` (`tests/container/test_storage_isolation.py`, 2 of 2 failing on `5d85f6e`).

## Control

1. **The path comes from a random id, never the name.** `users.storage_id` is 32 hex characters from
   `secrets.token_hex(16)`, unique, immutable — nothing writes it after it is set. `task_storage.resolve`
   is the one function that turns an account into a directory: it accepts only that shape, joins it onto
   `DATA_ROOT`, and refuses a result that is not a real directory (not a symlink) and a direct child of
   the resolved root.
2. **A typed identity crosses the layers.** `get_task_store` (be/di) looks the account up and hands the
   routers a `TaskStore`; `task_service` and `task_runner` take that, not a username. `_run` can no longer
   be given a name to turn into a path.
3. **New accounts never get the old layout.** Registration writes `storage_layout='storage_id'` and creates
   `DATA_ROOT/<storage_id>/` only. The username is a login and display attribute with its own rule
   (1–64 characters, NFC, no control or format characters, no `/` or `\`, not `.`/`..`, no surrounding
   whitespace) — hygiene, explicitly not the path control.
4. **Existing accounts (`storage_layout='legacy'`) are served from `DATA_ROOT/<username>/` only in
   `compat` mode, and only when the name is a safe single component** that resolves to a real directory
   directly under the root; anything else is refused with a 500 and an audit row (`storage.refused`).
   `strict` mode refuses every legacy account. That shape is `SHIM-SEC-007`, expiring 2027-02-28.
5. **`RULE-SEC-003`** fails the gate when any module but `task_storage.py` builds a path from
   `settings.data_root` — the regression this finding was.

## Expand → migrate → switch → contract

| Step | What | State in this change |
|---|---|---|
| Expand | Columns, index, protocol table, backfill of `storage_id` at boot; new accounts in the new layout; resolver with `compat`. | **Done, deploys on merge.** Old code reads the expanded DB unchanged (it ignores the columns). |
| Migrate | `python -m app.services.storage_migration plan` (dry run) / `apply` / `rollback --user-id N`. Copies, verifies by manifest, renames atomically, keeps the source. | **Done as code and tests.** Running it against production is an operator step. |
| Switch | `TASK_STORAGE_MODE=strict`: legacy access becomes an error with an audit row. | **Done as configuration; default stays `compat`.** Flipping it is an operator step after `apply` reports every account `done`, no later than the shim expiry 2027-02-28. |
| Contract | Delete `DATA_ROOT/<username>/` sources, remove the `compat` branch, the shim and `storage_layout='legacy'` handling. | **Deferred**, own change: not before 14 days after the switch **and** a restore drill of a migrated account, and not before the switch itself. |

Rollback at every step: before `apply`, the previous image runs unchanged. After `apply` and before any
write, `rollback --user-id N` returns an account to its untouched legacy directory. After a write to the
new directory, rollback refuses (the copy has diverged) and the way back is the backup or a forward fix;
the previous image would serve the frozen legacy copy, which is why `docs/operations.md` says so in bold.

## Registration re-open condition

Registration may be opened again once `tests/unit/test_storage_identity.py` and
`tests/container/test_storage_isolation.py` are green **in CI on amd64** at the deployed commit — the
container tier did not run in its image locally (RISK-TEST-001). Opening it does not require `strict`:
new accounts never use the legacy layout.

## Test evidence

Every result below was run, on 2026-11-24, on an arm64 Mac.

| Tier | What | Before the control (`5d85f6e`) | After |
|---|---|---|---|
| Unit, `subprocess.run` spied | `tests/unit/test_storage_identity.py` — registration, the HTTP path, every Taskwarrior route behind the resolver, legacy `compat`/`strict`, hostile names inserted directly | **2 of 3 red** (`'alice/../alice': TASKDATA is alice's store`; the store was named after the account) | 17 passed |
| Unit | `test_task_storage.py` (resolver, id shape, username rule, mode), `test_storage_migration.py` (dry run, apply, idempotence, resume, refusals, rollback), `test_migrations.py` (fresh-vs-upgrade schema, backfill, immutability, previous-image rows), `test_task_runner.py` (the env comes from the store) | — (new) | whole unit tier: **754 passed** |
| Real Taskwarrior 3.5.0 | `tests/container/test_storage_isolation.py` — alias accounts over HTTP cannot read, modify, complete, start, annotate or delete alice's task; no name creates anything above `DATA_ROOT`; an existing account sees the same tasks before and after `apply`; a legacy alias is refused and blocks the migration | **2 of 2 red** (`'alice private'` listed by the alias; `escape` and `abs-escape` created beside the data root) | whole container suite: **92 passed** |

**The container tier ran against the host's Homebrew `task` 3.5.0, not inside `backend/Dockerfile.test`**:
that image cannot be built on arm64 (`RISK-TEST-001`), and `make verify` skips it here. It has to be observed
green in CI on amd64 before SEC-001 counts as closed and before registration is reopened.

`RULE-SEC-003`'s negative fixture reintroduces `settings.data_root / store.account` into `_run`.

## Results

- Fan-in baseline (`ops/structure-baseline.toml`, `RULE-ARCH-003`) raised deliberately, with dated reasons:
  `database.py` 7 → 8 and `audit.py` 5 → 6 (the migration CLI), `task_storage.py` recorded at 10 (the identity
  type every Taskwarrior layer carries). The main checkout's index had not seen the then-untracked new
  module, so only the clean-worktree `verify` showed it.
- REST/OpenAPI and MCP snapshots: **unchanged**. DB schema snapshot: additive change only. Env: one variable.
- `make check`: **GREEN** on the final commit (main checkout).
- `make verify`: **GREEN** at `7d38d95` in a clean worktree of this branch (133 s): gate conformance **57 fixture
  arms passed, 0 failed; 47 of 50 executable rules proven able to fail** (was 56 / 46 of 49; the new arm is
  `RULE-SEC-003`). **`py-test-container` was skipped** (`docker daemon is not running`; the image cannot run on
  arm64 anyway, `RISK-TEST-001`) — the container results above come from the host binary, not from that gate.
  The clean worktree was needed because the untracked audit evidence in the main checkout
  (`docs/security-audits/`, not part of this change) is copied into the fixture sandbox and fails
  `RULE-RULE-003` there.
- Closed by this change: nothing is removed from the waiver or risk registers. SEC-001 was never registered;
  it is now tracked as `RISK-SEC-006` until migrate + switch + the amd64 container run.

## Deferred, with triggers

| Step | Trigger / date | Owner |
|---|---|---|
| M0 production checks (registration state, names, layout, digest, UID, mounts, edge headers) and the restore-tested backup | before `apply`; operator runbook step 1 | maintainer |
| `apply` in production | after the backup; with the backend stopped | maintainer |
| `TASK_STORAGE_MODE=strict` | after `plan` reports every account `done`; no later than 2027-02-28 (`SHIM-SEC-007`) | maintainer |
| Container tier green in CI (amd64) at the deployed commit | first CI run of this branch | CI |
| Reopen registration | after the CI run above | maintainer |
| Contract: delete `data/<username>/`, the `compat` branch and the `legacy` layout | ≥ 14 days after `strict` **and** one migrated account restored from backup | maintainer |
| Downgrade then close `RISK-SEC-006` | `strict` set (downgrade); contract done (close) | maintainer |
