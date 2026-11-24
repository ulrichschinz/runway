# ADR 0043 — Account identity and Taskwarrior storage

- **Date:** 2026-11-24
- **Status:** Accepted
- **Scope:** `backend/app/task_storage.py`, `backend/app/database.py` (columns `users.storage_id`,
  `users.storage_layout`, index, trigger, table `storage_migrations`), `backend/app/dependencies.py`
  (`get_task_store`), `backend/app/services/{task_runner,task_service,user_service,storage_migration}.py`,
  the task, GTD and inbox routers, `backend/app/routers/auth.py` (registration), `TASK_STORAGE_MODE`,
  `RULE-SEC-003`, `SHIM-SEC-007`, `RISK-SEC-006`
- **Brief:** [0065](../briefs/0065-account-identity-is-not-a-storage-path.md)

## Context

Finding **SEC-001** (audit run `20261118T131510Z-claude`, upheld by the independent review of
2026-11-24): registration stored the username verbatim and the server built every Taskwarrior
path as `DATA_ROOT / username`, in two modules. A username is text the caller chooses, so
`alice/../alice` opened alice's store — read, write, complete and delete — and `../x` or an absolute
name created directories outside the data root. Reproduced on `5d85f6e` in both test tiers before
this change (brief 0065, "Failure scenario"). The SEC-3 hardening protected the *argument list* of
the binary; the *environment* — `TASKDATA`, `TASKRC`, `HOME` — was the unguarded half of the same
boundary.

Two ways to close it were on the table (remediation plan, decision gate D1):

1. **Validate the username** so that it is always one safe path component. Cheap, and it would
   have stopped the reproduced attack. But it keeps the path a function of a mutable, human,
   Unicode string: a future rename, a restore under a different name, a normalisation-insensitive
   filesystem or one forgotten check brings the finding back, and existing accounts with odd names
   would have to be renamed in place.
2. **Name the store by a random id the server generates.** The username stops having any path
   function at all.

## Decision 1 — a random, immutable `storage_id` names the store

Every account carries `users.storage_id`: 32 lower-case hex characters from `secrets.token_hex(16)`.
A unique index makes two accounts sharing one an error, a `CHECK` keeps the column to that shape,
and a trigger refuses any update once it is set. The store is `DATA_ROOT/<storage_id>/`.

`task_storage.resolve(account)` is the only function that turns an account into a directory. It
accepts only the id shape, resolves the root first, and refuses a result that is not a real
directory (`lstat`: a symlink is refused even when it points inside) directly under it.

## Decision 2 — a typed identity crosses the layers, not a name

`database.get_account` returns an `Account`; `dependencies.get_task_store` resolves it and hands the
routers a `TaskStore`; `task_service` and `task_runner._run` take that and nothing else. A router
cannot pass a username to the binary by mistake, because there is no function left that would turn
one into a path. The routes keep `Depends(get_current_user)` beside the new dependency — FastAPI
evaluates it once per request — so `RULE-SEC-001` reads the guard where it always has, and the
OpenAPI schema and the MCP tool list are byte-identical.

A refusal is a 500 with a fixed message and a `storage.refused` audit row whose detail is a fixed
reason, never a path. The caller did nothing wrong; the server will not serve that account.

## Decision 3 — the username keeps a rule, but it is hygiene

New registrations refuse a name that is empty, longer than 64 characters, not NFC, surrounded by
whitespace, containing a control or format character, a `/` or `\`, or that is `.`/`..` — with 400,
the status the route already used. It keeps escapes out of audit rows and logs and canonically
equal spellings out of the account list. **It is not the path control** and nothing relies on it as
one: the tests insert hostile names directly into the table and show they still reach only their
own store.

## Decision 4 — expand → migrate → switch → contract, with the switch as configuration

Merging deploys, and existing users have their tasks under `DATA_ROOT/<username>/`.

- **Expand (this change).** Columns and table are added by the additive migration loop. The boot
  backfills a `storage_id` for every account and leaves `storage_layout='legacy'` — which is also
  the column default, so a row the previous image inserts after a rollback is described truthfully
  and backfilled on the next start. New accounts are created in the new layout only.
- **Migrate (this change, run by the operator).** `python -m app.services.storage_migration
  plan|apply|rollback`. The dry run prints ids, paths relative to `DATA_ROOT`, statuses and counts —
  no task text. `apply` checks source, target, owner, type and collisions, refuses symlinks, hard
  links, special files, foreign owners and alias accounts (two names whose raw join opens the same
  directory — compared by inode, so `ALICE` and `alice` on a case-insensitive filesystem, or the
  NFD and NFC spellings of one name, count; and a legacy name equal to another account's storage
  id) for that account alone, copies into a staging directory, verifies a manifest of every file's size
  and SHA-256, renames into place, re-verifies, then flips the account. The source is never
  modified. It is idempotent and completes an interrupted run. `rollback` returns an account to its
  legacy directory only while the new store is unchanged since the copy, and only in `compat` (in
  `strict` it would turn the account into a 500). It renames the copy it no longer serves to
  `.<storage_id>.rolled-back.<stamp>`, so the next `apply` copies the legacy store afresh; a copy a
  rollback could not set aside is recognised by the recorded manifest and replaced. Any other
  existing target still blocks.
- **Switch (configuration).** `TASK_STORAGE_MODE=compat`, the default, serves a legacy account from
  its old directory **only when the name is one path component that is, in exactly that spelling,**
  a real directory directly under the root (the directory listing must contain the name byte for
  byte, because `lstat` and `realpath` both accept `ALICE` for `alice` on a folding filesystem) —
  so the alias accounts SEC-001 is about are refused even before the migration. Names that are
  their own directory but look odd — a leading `.`, a `\`, a non-NFC spelling — stay served; a
  32-hex name and the migration's own `.<id>.*` names are refused, and the migration moves a
  32-hex name once it has checked it against every account's storage id. `strict` refuses every
  legacy account. An unrecognised value is `strict`. Both compose files pass the variable through
  (their `environment:` lists are explicit, so a host `.env` value alone would not reach the
  container), and the startup log line carries the mode as resolved. The `compat` branch is
  `SHIM-SEC-007`, expiring 2027-02-28, which `RULE-SEC-002` enforces.
- **Contract (deferred, its own change).** Delete the legacy directories, the `compat` branch and the
  `legacy` layout value — not before `plan` reports every account `done` in production, `strict` has
  run for 14 days, and one migrated account has been restored from backup.

The switch is not flipped by this change because flipping it needs things only the deploy host has:
a restore point, the dry run's answer about existing names, and the backend stopped while `apply`
copies. Defaulting to `strict` would empty every existing user's list on the deploy.

## Decision 5 — `RULE-SEC-003` keeps the decision in one place

`tools/checks/storage-binding.sh` fails the gate when any module of `backend/app/` other than
`task_storage.py` reads `data_root` — from settings, from the resolver, or by import — with one
exemption by function, `database.audit_db_path`. The negative fixture reintroduces the original
line in `_run` and watches the gate go red. It is a name-based static scan; what it cannot see is
`RISK-SEC-006`.

## Consequences

- Rollback before `apply` is the previous image — unchanged for every account that existed
  before this deploy. **An account registered after it** has `storage_layout='storage_id'` and a
  store only in `DATA_ROOT/<storage_id>/`; the previous image looks in `DATA_ROOT/<username>/`
  and answers its task routes with 500 until the new image is rolled forward again (its data is
  untouched). The same holds for an account `apply` *provisioned* (it had no legacy directory).
  Together: `SELECT id FROM users WHERE storage_layout='storage_id' AND id NOT IN (SELECT user_id
  FROM storage_migrations WHERE action='migrated')`. Keeping registration closed (M0) keeps the
  first group empty. After `apply` and before any write, `rollback --user-id N`. After a write to a migrated store, the previous image would serve the frozen
  legacy copy; the way back is the backup or a forward fix, and `docs/operations.md` says so.
- An alias account blocks its victim's migration too: the alias may already have written into that
  store, and deciding whose data it is needs a human. That is deliberate.
- Registration can be reopened once the adversarial tests are green in CI on amd64 at the deployed
  commit; it does not need `strict`, because new accounts never use the legacy layout.
- SEC-001 is **contained, not closed**, until the operator has migrated and switched
  (`RISK-SEC-006`). Host takeover or arbitrary file writes were never demonstrated and are not claimed
  as tested effects.
