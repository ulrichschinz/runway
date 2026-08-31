"""The schema migration loop: what it still tolerates, and what it no longer hides.

`init_db` applies four additive `ALTER TABLE` statements on every start. Until this module
existed it wrapped them in `except Exception: pass` (`WAIVER-OPS-001`), which is how "the
column is already there" was tolerated on the second and every subsequent boot — and also
how a genuine migration failure became indistinguishable from a successful one.

Two properties are in tension and both are tested here:

* the re-run path must stay **silent**, because it happens on every single start and a log
  line per boot per statement is noise that trains an operator to ignore the stream;
* every other database error must be **loud**, and must not stop the service starting.

`test_a_migration_sqlite_refuses_is_visible_where_it_used_to_be_silent` is the adversarial
proof the Security-or-Operability pattern requires: a real statement, refused by real SQLite
for a real reason, run through the real application boot.
"""

from __future__ import annotations

import contextlib
import io
import json
import logging
import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import database
from app.database import DUPLICATE_COLUMN, MIGRATIONS, init_db
from app.logging_setup import REDACTION_MARKER, JsonFormatter, RedactionFilter

# A statement SQLite refuses outright, and not a contrived one: it is the fifth migration
# somebody adds. `ALTER TABLE` cannot add a UNIQUE column to an existing table at all, so
# this fails on every database, on every boot, forever — and until now it failed in silence.
# The same refusal is already load-bearing in this file: `CREATE_USERS` declares
# `api_key TEXT UNIQUE` while the migration that back-fills it on an older database declares
# plain `TEXT`, because the UNIQUE form is not addable.
REFUSED_BY_SQLITE = "ALTER TABLE users ADD COLUMN external_id TEXT UNIQUE"

# Not an `OperationalError`: sqlite3 raises `ProgrammingError` for two statements in one
# `execute`, which is exactly the shape of a hand-written migration list going wrong.
REFUSED_AS_PROGRAMMING_ERROR = (
    "ALTER TABLE users ADD COLUMN city TEXT; ALTER TABLE users ADD COLUMN country TEXT"
)


@contextlib.contextmanager
def migration_lines() -> Iterator[io.StringIO]:
    """Capture what `app.database` logs, through the real formatter and the real filter.

    Attached to the module's own logger rather than to the root one on purpose: the
    application's lifespan calls `configure_logging`, which replaces the root handlers, so a
    root handler installed by a test is gone before `init_db` runs. `dictConfig` is
    configured with `disable_existing_loggers: False` and says nothing about this logger, so
    a handler here survives the boot and sees the lines that boot produced.
    """
    buffer = io.StringIO()
    handler = logging.StreamHandler(buffer)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RedactionFilter())
    logger = logging.getLogger("app.database")
    previous_level = logger.level
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    try:
        yield buffer
    finally:
        logger.removeHandler(handler)
        logger.setLevel(previous_level)


def lines(buffer: io.StringIO) -> list[dict]:
    return [json.loads(line) for line in buffer.getvalue().splitlines()]


def columns(db_path: str, table: str = "users") -> set[str]:
    connection = sqlite3.connect(db_path)
    try:
        return {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
    finally:
        connection.close()


# --- the tolerated case, which is the common one -------------------------------------------


def test_the_duplicate_column_message_is_the_one_sqlite_actually_raises(tmp_path: Path):
    """Pin the string the narrowed clause keys on, against the real driver.

    The whole change rests on this message, and there is no error *code* to use instead:
    `sqlite_errorname` is the generic `SQLITE_ERROR` for a duplicate column and for `no such
    table` alike. If a SQLite upgrade ever reworded this, the clause stops recognising the
    re-run path and every boot logs — visible, not silent — and this test says so first.
    """
    connection = sqlite3.connect(tmp_path / "probe.db")
    connection.execute("CREATE TABLE users (id INTEGER PRIMARY KEY)")
    connection.execute("ALTER TABLE users ADD COLUMN api_key TEXT")
    with pytest.raises(sqlite3.OperationalError) as raised:
        connection.execute("ALTER TABLE users ADD COLUMN api_key TEXT")
    connection.close()

    assert str(raised.value) == "duplicate column name: api_key"
    assert DUPLICATE_COLUMN in str(raised.value)


@pytest.mark.anyio
async def test_a_second_init_db_is_green_and_says_nothing(isolated_storage: Path):
    """The re-run path must stay silent: it happens on every start, for every statement."""
    await init_db()
    with migration_lines() as buffer:
        await init_db()

    assert buffer.getvalue() == ""
    assert {"api_key", "role", "full_name", "email"} <= columns(str(isolated_storage / "users.db"))


@pytest.mark.anyio
async def test_a_pre_existing_database_missing_every_column_is_migrated_quietly(
    isolated_storage: Path,
):
    """The case the loop exists for: a database created before the columns were added."""
    path = str(isolated_storage / "users.db")
    connection = sqlite3.connect(path)
    connection.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,"
        " hashed_password TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
    )
    connection.commit()
    connection.close()

    with migration_lines() as buffer:
        await init_db()

    assert buffer.getvalue() == ""
    assert {"api_key", "role", "full_name", "email"} <= columns(path)


# --- the case that used to be swallowed ------------------------------------------------------


@pytest.mark.anyio
async def test_a_failing_statement_is_logged_and_does_not_propagate(
    isolated_storage: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(database, "MIGRATIONS", (*MIGRATIONS, REFUSED_BY_SQLITE))

    with migration_lines() as buffer:
        await init_db()  # must not raise

    logged = lines(buffer)
    assert len(logged) == 1, logged
    assert logged[0]["level"] == "ERROR"
    assert logged[0]["message"] == "schema migration failed"


@pytest.mark.anyio
async def test_the_log_line_names_the_statement_and_the_error(
    isolated_storage: Path, monkeypatch: pytest.MonkeyPatch
):
    """A failure nobody can act on is barely better than a silent one.

    The line is rendered by the real formatter and passed through the real redaction filter,
    so this also pins that a DDL statement survives it intact. Nothing in schema definition
    language is a credential, and an alert whose one actionable field came out `[redacted]`
    would be an alert with nothing in it.
    """
    monkeypatch.setattr(database, "MIGRATIONS", (*MIGRATIONS, REFUSED_BY_SQLITE))

    with migration_lines() as buffer:
        await init_db()

    [line] = lines(buffer)
    assert line["statement"] == REFUSED_BY_SQLITE
    assert line["sqlite_error"] == "Cannot add a UNIQUE column"
    assert REDACTION_MARKER not in json.dumps(line)


@pytest.mark.anyio
async def test_one_failure_does_not_stop_the_statements_after_it(
    isolated_storage: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(database, "MIGRATIONS", (REFUSED_BY_SQLITE, *MIGRATIONS))

    with migration_lines() as buffer:
        await init_db()

    assert len(lines(buffer)) == 1
    assert {"api_key", "role", "full_name", "email"} <= columns(str(isolated_storage / "users.db"))


@pytest.mark.anyio
async def test_a_non_operational_database_error_is_logged_rather_than_raised(
    isolated_storage: Path, monkeypatch: pytest.MonkeyPatch
):
    """`sqlite3.Error` is the boundary, not `OperationalError`.

    Decision 3 for this step is that a migration failure logs and continues; narrowing the
    catch to one subclass would turn an `IntegrityError` or a `DatabaseError` on a corrupt
    file into a refusal to boot, which is the outcome that decision rejects.
    """
    monkeypatch.setattr(database, "MIGRATIONS", (*MIGRATIONS, REFUSED_AS_PROGRAMMING_ERROR))

    with migration_lines() as buffer:
        await init_db()

    [line] = lines(buffer)
    assert line["statement"] == REFUSED_AS_PROGRAMMING_ERROR
    assert line["sqlite_error"] == "You can only execute one statement at a time."


def test_a_duplicate_column_is_the_only_error_treated_as_already_applied():
    assert database._is_already_applied(sqlite3.OperationalError("duplicate column name: role"))
    assert not database._is_already_applied(sqlite3.OperationalError("no such table: users"))
    assert not database._is_already_applied(sqlite3.OperationalError("Cannot add a UNIQUE column"))
    assert not database._is_already_applied(sqlite3.IntegrityError("duplicate column name: role"))


# --- the adversarial proof --------------------------------------------------------------------


def test_a_migration_sqlite_refuses_is_visible_where_it_used_to_be_silent(
    isolated_storage: Path, monkeypatch: pytest.MonkeyPatch
):
    """Construct a real migration failure, boot the real application, and read the stream.

    Before this change the identical run produced no line at all: the failure and a clean
    start were byte-for-byte indistinguishable in the output, which is finding SEC-10. The
    application must still come up — decision 3 — so both halves are asserted here: the
    service answers, and the failure is on the record.
    """
    monkeypatch.setattr(database, "MIGRATIONS", (*MIGRATIONS, REFUSED_BY_SQLITE))

    from app.main import app

    with migration_lines() as buffer, TestClient(app) as client:
        assert client.get("/health").status_code == 200

    [line] = lines(buffer)
    assert line["level"] == "ERROR"
    assert line["message"] == "schema migration failed"
    assert line["statement"] == REFUSED_BY_SQLITE
