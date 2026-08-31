# Change Impact Brief 0019 — Narrowing the migration `except`, and resolving `WAIVER-OPS-001`

Step 15b. One commit, and it is small: an `except Exception: pass` in the schema migration loop
becomes an `except sqlite3.Error` that stays silent for one observed condition and logs
everything else. The reason it took until now is that the failures it stops swallowing had
nowhere to go until [ADR 0024](../adr/0024-structured-logging.md) landed a log stream hours
earlier.

| Field | Value |
|---|---|
| **Requested outcome** | Stop the migration loop hiding genuine failures, without making the ordinary re-run noisy and without letting a migration failure take production down at deploy time. Close finding SEC-10 and resolve `WAIVER-OPS-001`. |
| **Owning unit** | `be/adapters/db`, `docs`, `tests` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md), [`backend/AGENTS.md`](../../backend/AGENTS.md) |
| **Governed by** | [`adr:0025`](../adr/0025-narrowing-the-migration-except.md), and [`adr:0024`](../adr/0024-structured-logging.md) for the stream it writes to |
| **Rule IDs introduced** | **None.** No property here needs a new gate rule: `RULE-RULE-003` already refuses an inline suppression with no waiver behind it, and it is what would catch the deleted `# noqa: S110` coming back. |
| **Risks recorded** | **None new.** `RISK-SEC-002` is amended: half its re-open trigger fired, its statement no longer claims migrations swallow every exception, and its trigger moves to the missing `migrations/` directory. |
| **Entry points** | [`backend/app/database.py`](../../backend/app/database.py), [`backend/tests/unit/test_migrations.py`](../../backend/tests/unit/test_migrations.py), [`rules/waivers.yaml`](../../rules/waivers.yaml), [`rules/ledger.yaml`](../../rules/ledger.yaml), [`backend/AGENTS.md`](../../backend/AGENTS.md), [`docs/adr/0025-narrowing-the-migration-except.md`](../adr/0025-narrowing-the-migration-except.md) |
| **Affected public surfaces** | **None.** The index lists all 30 REST routes and their MCP tools because `database.py` is reachable from every router; nothing about the surface moves. No route, tool name, schema, template or SPA surface changes, and every snapshot in `ops/surfaces/` regenerates byte-identically. `init_db` has no callers outside the lifespan. |
| **Known dependents** | [`backend/app/main.py`](../../backend/app/main.py) is the only caller of `init_db`. [`backend/app/dependencies.py`](../../backend/app/dependencies.py) and the five routers depend on `database.py` for `get_db`, `generate_api_key` and `get_allow_registration`, none of which this change touches. |
| **Uncertain / dynamic areas** | `BLIND-TEST-001` — protection is import-derived, so the new test module shows as unprotected by construction. `BLIND-MCP-001` (resolved) and `RISK-MCP-001` are reported for the changed set but bear on nothing here: no tool name moves. |
| **Analogous implementations** | [`backend/app/logging_setup.py`](../../backend/app/logging_setup.py)'s `resolve_level` — the same fall-back-rather-than-refuse judgement, taken for the same reason. [`backend/app/startup_checks.py`](../../backend/app/startup_checks.py) — the refuse-to-serve posture this change deliberately does **not** extend. |
| **Delivery Pattern** | **Security or Operability Change** — failure scenario, control, adversarial proof. It is behaviour-changing at boot, against a live production database. |
| **Required tests** | A second `init_db` against the same database is green and logs nothing; a database predating every column is migrated silently; a non-duplicate `sqlite3.Error` is logged and does not propagate; the log line names the failing statement and SQLite's own error text; a failure does not stop the statements after it; a `ProgrammingError` is caught as well as an `OperationalError`; and the adversarial proof — a real refused migration, the real application booted, the service answering and the failure on the record. |
| **Intended scope** | Step 15b only. Not a `migrations/` directory, not a version table, not the `users.role` `CHECK` constraint, not the audit log (15c). |
| **Base revision** | `48565f8` |
| **Index revision** | `48565f8` |

## The failure scenario

An operator deploys. `init_db()` runs, as it does on every start, and applies four additive
`ALTER TABLE` statements. One of them fails — the file is locked by a stray process, the disk
filled between two commits, or the statement is one SQLite refuses outright. The old clause
caught it, discarded it, and continued.

What the operator sees is a container that started cleanly. What actually happened is that the
database is missing a column, and the next query that reads it either raises a 500 on a live
request or, worse, quietly returns nothing. The output of the failed run and the output of a
successful run were byte-for-byte identical: nothing raised, nothing errored, nothing was
written down. Diagnosing it starts with someone noticing an unrelated symptom days later and
guessing.

That is finding SEC-10, carried as `WAIVER-OPS-001` since 2026-08-04 with the mitigation
"migrations are additive and `init_db` runs on every start, so a transient failure retries" —
true, and no help at all for a failure that is not transient.

## The control

Recorded in full in [ADR 0025](../adr/0025-narrowing-the-migration-except.md):

1. **The tolerated case is one type and one message, both observed.** `sqlite3.OperationalError`
   whose message contains `duplicate column name` — measured against `aiosqlite` 0.20.0 over
   SQLite 3.53.4, not recalled. There is no error code to use instead: `sqlite_errorname` is the
   generic `SQLITE_ERROR` for this, for `no such table` and for a syntax error alike.
2. **The catch boundary is `sqlite3.Error`, not `OperationalError`.** Everything the driver
   raises is a migration failure and is handled as one; a `TypeError` or a cancellation is a bug
   in this code and still propagates.
3. **A genuine failure logs at `ERROR` and the loop continues.** This is the human's decision
   (decision 3, [`docs/plan/STATUS.md`](../plan/STATUS.md) §3), taken deliberately against the
   refuse-to-serve posture `startup_checks` takes for `JWT_SECRET`: migrations are additive and
   retry on the next boot, so refusing would convert a retryable error into a deploy-time
   outage.
4. **The re-run path stays silent.** Four statements, every boot, every deployment. Logging
   them would teach the operator to scroll past the migration section of the boot log, which is
   the section this change exists to make worth reading.

The line a real failure produces — one line, wrapped here:

```json
{"timestamp": "2026-08-28T10:35:57.129Z", "level": "ERROR", "logger": "app.database",
 "message": "schema migration failed",
 "statement": "ALTER TABLE users ADD COLUMN external_id TEXT UNIQUE",
 "sqlite_error": "Cannot add a UNIQUE column"}
```

`RULE-OPS-002` is satisfied rather than escaped: the field names are `statement` and
`sqlite_error`, neither of which is credential-bearing in this repository's vocabulary, and no
`# log-secrets: allow` marker was needed. Nothing in schema definition language is a credential,
and a test asserts the runtime redaction filter leaves the statement intact — an alert whose one
actionable field arrived as `[redacted]` would be an alert with nothing in it.

## Adversarial proof

`test_a_migration_sqlite_refuses_is_visible_where_it_used_to_be_silent` in
[`backend/tests/unit/test_migrations.py`](../../backend/tests/unit/test_migrations.py)
constructs a genuine failure rather than a mocked one: `ALTER TABLE users ADD COLUMN
external_id TEXT UNIQUE`, which SQLite refuses because `ALTER TABLE` cannot add a UNIQUE column
to an existing table. It appends that to the real migration list, boots the real application
through `TestClient` with the real logging configuration, and asserts both halves of decision 3
— `/health` answers 200, **and** the failure is on the record, at `ERROR`, naming the statement.

Run against the previous code, that same scenario emits nothing at all. That is the whole
change, watched: the identical input, previously silent, now visible.

Eight further tests hold the rest. `test_the_duplicate_column_message_is_the_one_sqlite_actually_raises`
pins the string the clause keys on against the real driver, so a SQLite upgrade that reworded it
is caught by a test rather than by a production boot suddenly logging four errors.
`test_a_second_init_db_is_green_and_says_nothing` holds the silence.
`test_a_non_operational_database_error_is_logged_rather_than_raised` uses a `ProgrammingError`
— two statements in one `execute`, the shape a hand-maintained migration list actually goes
wrong in — to prove the boundary is `sqlite3.Error` and not one subclass of it.

`RULE-GATE-002` requires nothing here: no rule was added, so there is no new fixture to build.
The rule this change interacts with, `RULE-RULE-003`, already has one, and it is now the thing
standing between the deleted `# noqa: S110` and its return — `backend/app/database.py` is no
longer any waiver's scope, so a bare suppression there fails the gate.

## Behaviour change

**New:** a failed schema migration writes one `ERROR` line per failing statement to the JSON
stream, naming the statement and SQLite's error text, and the boot continues.

**Changed:** the migration list moved out of `init_db()` into the module constant `MIGRATIONS`.
That is not tidying — it is what lets a test substitute a statement that really fails and watch
the real `init_db` handle it.

**Unchanged:** the ordinary boot. On a fresh database and on a re-run the output is exactly what
it was: nothing from `app.database`. Every route, every MCP tool, the schema itself, the
Taskwarrior template and the SPA are untouched.

## What the index knows

**3 production path(s) changed**, out of 6 total: `backend/AGENTS.md`,
`backend/app/database.py`, `backend/tests/unit/test_migrations.py`. The other three are records
and registers: `docs/adr/0025-narrowing-the-migration-except.md`, `rules/waivers.yaml`,
`rules/ledger.yaml`.

The index reports both `backend/tests/unit/test_migrations.py` and
`backend/tests/unit/test_logging.py` protecting `backend/app/database.py` by import, and the new
module also protecting `backend/app/main.py` — it boots the application to prove the failure is
survivable. `backend/AGENTS.md` and the test module itself show as unprotected, which is
`BLIND-TEST-001` doing its job: a contract document has no tests and a test protects no test.

Line coverage of `backend/app/database.py` is 97%, and the whole backend is 96.6% against a 90%
floor (`RULE-TEST-003`).

### Blind spots relevant to this answer

- **`BLIND-TEST-001`** — test protection is import-derived; absence of an edge means "no
  import-derived protection", not "untested".
- **`BLIND-MCP-001`** (resolved) and **`RISK-MCP-001`** are reported for the changed set because
  `database.py` is reachable from every router. No tool name moves, so neither bears on this
  change.

## Outstanding, and stated as outstanding

**There is still no `migrations/` directory and no version table.** The schema is whatever four
`ALTER TABLE` statements and three `CREATE TABLE IF NOT EXISTS` statements happen to produce. No
database records which migrations it has seen, nothing is reversible, and any change that is not
an added column has nowhere to live. `WAIVER-OPS-001` named the trigger for building one and
[ADR 0025](../adr/0025-narrowing-the-migration-except.md) keeps it: **a third table changing
shape**.

**A real divergence is now visible and is not fixed.** `CREATE_USERS` declares
`api_key TEXT UNIQUE`; the migration that back-fills that column on an older database declares
plain `TEXT`, because the UNIQUE form is exactly what SQLite refuses. A database created fresh
and a database migrated up do not have the same schema. Closing it needs the table copied, which
is the `migrations/` directory above.

**Log-and-continue does not mean the process survives every migration failure.** If a statement
the rest of `init_db` depends on fails — `api_key`, which the very next query filters on — the
failure is logged and the next statement raises anyway. That is the right outcome; what changed
is that the log now says which migration caused it.

**`RISK-SEC-002` is half-triggered and amended, not closed.** A `CHECK` constraint on
`users.role` would need that same table copy. The argument against attempting it was partly that
a half-applied rebuild would be silent; it would now be loud, and still half-applied.

## Follow-on

Step 15c (the audit log, whose rows carry the request id from Step 15a) and 15e/f
(`docs/threat-model.md`, the shim evidence runbook, the SEC-5 waiver). Remaining scope is in
[`docs/plan/STATUS.md`](../plan/STATUS.md) §3.
