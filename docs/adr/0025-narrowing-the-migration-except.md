# ADR 0025 — A migration that fails says so, and the service still starts

- **Date:** 2026-08-28
- **Status:** Accepted
- **Scope:** `backend`

## Context

`init_db()` runs on every start. After creating the tables it walks a list of four additive
`ALTER TABLE` statements and applies them, so that a database created before a column existed
gains it on the next boot. On the second boot — and every boot after that — those same four
statements fail, because the columns are already there.

That is the whole reason the loop was written as:

```python
try:
    await db.execute(col_sql)
    await db.commit()
except Exception:  # noqa: S110
    pass
```

The broad catch was not carelessness; it was the cheapest way to make a re-run idempotent
without asking what the failure was. It cost nothing while the only failure it ever saw was
the expected one. What it also did was swallow every other failure identically: a statement
SQLite refuses outright, a locked database, a disk that filled between two `commit()` calls.
The process continued as if the column existed, later code read a column that did not, and
nothing anywhere recorded that anything had happened. That is finding SEC-10, and it has been
carried as `WAIVER-OPS-001` since 2026-08-04.

The waiver's own `alternatives_evaluated` field says why it was not fixed then: narrowing the
clause means the failures it stops swallowing have to go *somewhere*, and this repository had
no logging at all. [ADR 0024](0024-structured-logging.md) built the somewhere. This record
spends it.

This is a behaviour change at boot against a live production database, so it follows the
**Security or Operability** pattern in [`docs/change-workflow.md`](../change-workflow.md):
failure scenario, control, adversarial proof.

## Decision

### The tolerated case is one exception type and one message, both observed

The clause catches `sqlite3.Error` — the base class of everything the driver raises — and
passes silently for exactly one thing: a `sqlite3.OperationalError` whose message contains
`duplicate column name`.

That string was measured, not guessed. Against the pinned driver (`aiosqlite` 0.20.0 over
SQLite 3.53.4, the version the image ships), re-adding a column raises

```
sqlite3.OperationalError: duplicate column name: api_key
```

There is deliberately no error *code* in the condition, because SQLite does not offer a usable
one here: `sqlite_errorname` is the generic `SQLITE_ERROR` for a duplicate column, for
`no such table`, and for a syntax error alike. The message is the only thing that separates the
expected case from a failure, so the message is what the code reads — and
`test_the_duplicate_column_message_is_the_one_sqlite_actually_raises` in
[`backend/tests/unit/test_migrations.py`](../../backend/tests/unit/test_migrations.py) pins it
against the real driver rather than against a memory of it.

Depending on a vendor's wording is a real dependency, and the reason it is acceptable here is
the direction it fails in. If a future SQLite rewords the message, the clause stops recognising
the re-run path and the migration loop starts logging four errors on every boot: noisy,
immediate, and pointing straight at the line that needs updating. The alternative failure — a
condition that silently starts matching things it should not — is the one that would be
dangerous, and a substring this specific cannot drift that way.

### The boundary is `sqlite3.Error`, not `OperationalError`

Catching only `OperationalError` would have looked narrower and been worse. An
`IntegrityError`, a `ProgrammingError` from a malformed entry in the list, or a
`DatabaseError` on a corrupt file would then propagate out of `init_db()`, out of the lifespan,
and the container would refuse to start. `sqlite3.Error` is the honest boundary: everything the
database driver raises is a migration failure and is handled as one, while a `TypeError` or an
`asyncio.CancelledError` — which are bugs in this code, not conditions in the database — still
propagate as they should.

### A genuine failure logs and continues; it does not refuse to start

This is the human's decision, recorded as decision 3 in
[`docs/plan/STATUS.md`](../plan/STATUS.md) §3, and it runs deliberately against the posture the
rest of the repository takes.

[`backend/app/startup_checks.py`](../../backend/app/startup_checks.py) refuses to serve on a
published or short `JWT_SECRET` ([ADR 0018](0018-cors-startup-refusal-and-the-inbox-shim.md)),
and that is right there: an unsafe signing key means forgeable tokens for every user, forever,
and the refusal costs one restart. Migrations are not that. They are additive, and `init_db`
runs on every start, so a transient failure retries on the next boot — which is precisely the
mitigation `WAIVER-OPS-001` recorded. Extending refuse-to-serve to this loop would mean a
locked database or a momentary disk-full during a deploy takes production down and keeps it
down, and it would do so at the exact moment an operator is least able to look at it.

So the loop logs at `ERROR` and carries on. `ERROR` rather than `WARNING` because a failed
schema migration is not a condition anyone should page past, and this stream is now the thing
an operator reads — one line, wrapped here for reading:

```json
{"timestamp": "2026-08-28T10:35:57.129Z", "level": "ERROR", "logger": "app.database",
 "message": "schema migration failed",
 "statement": "ALTER TABLE users ADD COLUMN external_id TEXT UNIQUE",
 "sqlite_error": "Cannot add a UNIQUE column"}
```

The line names the statement and SQLite's own words for what was wrong, which together are
enough to act on without reproducing anything. Nothing in schema definition language is a
credential, so the redaction filter passes it through unchanged — and a test asserts that,
because an alert whose one actionable field arrived as `[redacted]` would be an alert with
nothing in it.

### The re-run path stays silent

Not a `DEBUG` line, not an `INFO` line: nothing. This loop runs four statements on every start
of every deployment, and every one of them fails with `duplicate column name` on every boot
after the first. Logging that would put four lines of pure noise at the head of every restart,
and the cost of routine noise is not disk — it is that the operator learns the migration
section of the boot log is something to scroll past. The silence is load-bearing, and
`test_a_second_init_db_is_green_and_says_nothing` holds it.

## Consequences

The `# noqa: S110` is gone from [`backend/app/database.py`](../../backend/app/database.py) and
ruff passes without it, which is the finding SEC-10 line item closed. `WAIVER-OPS-001` moves
into the `resolved:` block of [`rules/waivers.yaml`](../../rules/waivers.yaml) rather than being
deleted, so this record and the four others that cite it keep resolving.

The migration list is now a module constant, `MIGRATIONS`, instead of a literal inside
`init_db()`. That is not tidying: it is what lets a test substitute a statement that really
fails and watch what the real `init_db` does with it.

**The adversarial proof.** `test_a_migration_sqlite_refuses_is_visible_where_it_used_to_be_silent`
constructs a genuine migration failure — `ALTER TABLE users ADD COLUMN external_id TEXT UNIQUE`,
which SQLite refuses outright because `ALTER TABLE` cannot add a UNIQUE column to an existing
table — boots the real application through `TestClient`, and asserts both halves of the
decision: `/health` answers 200, *and* the failure is on the record with the statement named.
Run against the previous code the identical scenario produces no line at all. Eight further
tests cover the ordinary paths: a second `init_db`, a database predating every column, a
failure that does not stop the statements after it, a `ProgrammingError` rather than an
`OperationalError`, and the predicate itself.

**A real divergence this made visible, which is not fixed here.** `CREATE_USERS` declares
`api_key TEXT UNIQUE`; the migration that back-fills that column on an older database declares
plain `TEXT`, because the UNIQUE form is one of the statements SQLite refuses. A database
created fresh and a database migrated up therefore do not have the same schema, and the obvious
edit to close that gap fails forever. It is out of scope here — closing it needs the table
copied, not a column added — but it is now the kind of thing that would announce itself rather
than pass in silence.

**What log-and-continue does not mean.** It does not mean the process survives any migration
failure. If a statement the *rest of `init_db` depends on* fails — the `api_key` column, which
the next query filters on — the failure is logged and the very next statement raises anyway, and
the boot fails there instead. That is the correct outcome and it is worth being explicit that it
is still possible: what changed is that the log now says which migration caused it.

**What is still missing.** There is no `migrations/` directory and no version table. The schema
is whatever four `ALTER TABLE` statements and three `CREATE TABLE IF NOT EXISTS` statements
happen to produce, there is no record of which migrations a given database has seen, nothing is
reversible, and any change that is not an added column has nowhere to live. `WAIVER-OPS-001`
named the trigger for building one and this record keeps it: **a third table changing shape**.
Until then, a framework would be more machinery than the thing it manages.

Half the re-open trigger on `RISK-SEC-002` fired with this change — a `CHECK` constraint on
`users.role` would need that table copy, and the argument against attempting it was partly that
a half-applied rebuild would be silent. It would now be loud. It would still be half-applied, so
the risk stands with its statement corrected and its trigger moved to the missing
`migrations/` directory.

**No new gate rule, and no rule was weakened.** `RULE-RULE-003` still refuses an inline
suppression with no waiver behind it — and now that `backend/app/database.py` is no longer any
waiver's scope, it would refuse the `# noqa` this change deleted if anyone put it back. The
conformance suite still proves 44 rules able to fail.
