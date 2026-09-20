import logging
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import aiosqlite

from app.config import settings

logger = logging.getLogger(__name__)

CREATE_USERS = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    api_key TEXT UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

CREATE_PROJECT_PLANS = """
CREATE TABLE IF NOT EXISTS project_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    project_name TEXT NOT NULL,
    purpose TEXT DEFAULT '',
    principles TEXT DEFAULT '',
    vision TEXT DEFAULT '',
    brainstorm TEXT DEFAULT '[]',
    organized TEXT DEFAULT '[]',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(username, project_name)
)
"""

CREATE_PROJECTS = """
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    purpose TEXT DEFAULT '',
    principles TEXT DEFAULT '',
    vision TEXT DEFAULT '',
    brainstorm TEXT DEFAULT '[]',
    organized TEXT DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(username, name)
)
"""

CREATE_SITE_SETTINGS = """
CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
)
"""

# When a review last happened, per user, per kind and per scope. A new table rather than a
# column on anything: it is the one shape that needs no ALTER, and the migration loop below
# runs before the CREATE statements, so a column added to a table that does not exist yet on
# a fresh database would fail on first boot and succeed on the second (D15).
#
# `scope` is the canonical scope key (D16) — the review's scope tags, sorted and joined with
# `+` — or '' for an unscoped review. It is part of the uniqueness, not a detail of the row:
# a repository that reviews only its own area has not reviewed the whole system, and storing
# both under one key would tell the user their system is current when half of it is not.
#
# `reviewed_at` holds Taskwarrior's own stamp format (YYYYMMDDTHHMMSSZ, UTC), because the
# summary carries it next to `entry` and `wait` values that come from the binary and an agent
# comparing two timestamps should not have to notice which one came from where.
CREATE_REVIEWS = """
CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('daily', 'weekly')),
    scope TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT NOT NULL,
    UNIQUE(username, kind, scope)
)
"""

# The additive schema migrations, applied on every start. There is no migrations/ directory
# and no version table: with four statements against two shapes of database, re-running an
# idempotent list is cheaper than a framework, and the point at which that stops being true
# is written down in docs/adr/0025-narrowing-the-migration-except.md.
MIGRATIONS = (
    "ALTER TABLE users ADD COLUMN api_key TEXT",
    "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'",
    "ALTER TABLE users ADD COLUMN full_name TEXT DEFAULT ''",
    "ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''",
)

# SQLite's own words for "this column is already there", observed rather than guessed: on
# sqlite3 3.53.4 through aiosqlite 0.20.0, re-adding a column raises
# `sqlite3.OperationalError('duplicate column name: api_key')`. There is no error code to
# key on — `sqlite_errorname` is the generic `SQLITE_ERROR` for this and for `no such table`
# alike — so the message is the only thing that separates the expected case from a failure.
#
# Matching a message string is a real dependency on SQLite's wording, and the failure mode if
# that wording ever changes is deliberately the safe one: an unrecognised duplicate stops
# being silent and starts being logged on every boot. Noisy and visible, not quiet and wrong.
DUPLICATE_COLUMN = "duplicate column name"


def _is_already_applied(failure: sqlite3.Error) -> bool:
    """True when the statement failed only because its column already exists."""
    return isinstance(failure, sqlite3.OperationalError) and DUPLICATE_COLUMN in str(failure)


async def get_db():
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        yield db


# --- the audit database -------------------------------------------------------------------
#
# A SECOND file, deliberately, and the reasoning is in docs/adr/0026-the-audit-log.md. The
# connection lives here and not in app/audit.py because AGENTS.md states that this module is
# the only one permitted to open a database connection, and "the audit log needed its own
# file" is not a reason to make that rule mean something narrower than it says.
#
# It sits under data_root rather than beside users.db because data_root is the only directory
# either compose file bind-mounts. A path the container writes to but nothing persists would
# lose the log on the next `docker compose up -d`, which is precisely the failure mode
# (evidence that can silently disappear) that ruled out a stdout stream in the first place.

AUDIT_DB_NAME = "audit.db"

# The lock wait, not a query timeout: SQLite serialises writers, and this bounds how long an
# audit insert waits for another one to commit before giving up. It gives up rather than
# blocking a request indefinitely — an audit row is never worth a hung request.
AUDIT_LOCK_TIMEOUT_SECONDS = 5.0


def audit_db_path() -> Path:
    return Path(settings.data_root) / AUDIT_DB_NAME


@contextmanager
def audit_connection() -> Iterator[sqlite3.Connection]:
    """Open the audit database, hand it over, and always close it.

    Synchronous `sqlite3`, not `aiosqlite`, because the callers are both kinds: a FastAPI
    dependency that is `async`, and `delete_task`, which is an ordinary `def` running in the
    threadpool and cannot await anything. One writer interface that works from both is worth
    more than saving a few hundred microseconds of event loop on a local file write.
    """
    path = audit_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=AUDIT_LOCK_TIMEOUT_SECONDS)
    try:
        connection.row_factory = sqlite3.Row
        yield connection
    finally:
        connection.close()


def generate_api_key() -> str:
    """Public: routers issue keys at registration and on rotation.

    Renamed from _generate_api_key. The leading underscore claimed it was module-private
    while two routers imported it, which made the name actively misleading rather than
    merely untidy.
    """
    import secrets

    return secrets.token_urlsafe(32)


async def get_allow_registration(db) -> bool:
    async with db.execute("SELECT value FROM site_settings WHERE key='allow_registration'") as cur:
        row = await cur.fetchone()
    if row:
        return row["value"] == "true"
    return settings.allow_registration


async def get_reviews(db, username: str) -> list:
    """Every review timestamp this user has, one row per kind and scope.

    The upsert below keeps exactly one row per `(username, kind, scope)`, so "the rows" and
    "the latest review of each kind and scope" are the same set and no ordering or grouping
    is needed to answer the question the summary asks.
    """
    async with db.execute(
        "SELECT kind, scope, reviewed_at FROM reviews WHERE username=? ORDER BY kind, scope",
        (username,),
    ) as cur:
        return list(await cur.fetchall())


async def record_review(db, username: str, kind: str, scope: str, at: str) -> None:
    """Write down that a review of this kind and scope just happened.

    An upsert rather than an insert: a review is a *state* ("the lists were last looked at
    then"), not a log. Appending would grow one row per review per user forever to answer a
    question that only ever needs the newest one, and would make the read a GROUP BY over a
    table nothing else prunes. The history is the user's Taskwarrior data, not this table.
    """
    await db.execute(
        """
        INSERT INTO reviews (username, kind, scope, reviewed_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(username, kind, scope) DO UPDATE SET reviewed_at=excluded.reviewed_at
        """,
        (username, kind, scope, at),
    )
    await db.commit()


async def bootstrap_admin(db) -> str:
    """Ensure the instance has an administrator, without ever overriding a decision.

    Replaces the line this function was extracted from, which ran

        UPDATE users SET role='admin' WHERE username='uli' AND role='user'

    on **every** startup (finding SEC-2). Two defects, not one. The obvious one is the
    hard-coded name: this is a public repository, so on any third-party deployment whoever
    registers `uli` was silently promoted at the next restart. The subtler one is that it
    re-asserted every boot — demote someone through the admin UI and the next restart put
    them back, silently, with the UI reporting success.

    Making the name configurable would have fixed only the first. This fires **only when
    the database contains no admin at all**, which makes it self-limiting: it cannot
    contradict a role set through the API, and it cannot lock anyone out. It is a recovery
    path, not a policy.

    Returns a short reason string naming the branch taken, so a caller (and the tests) can
    assert on the decision rather than on its side effect.
    """
    async with db.execute("SELECT COUNT(*) AS n FROM users WHERE role='admin'") as cur:
        row = await cur.fetchone()
    if row and row["n"] > 0:
        return "noop: an admin already exists"

    wanted = (settings.bootstrap_admin or "").strip()
    if not wanted:
        return "noop: no admin, and BOOTSTRAP_ADMIN is unset"

    async with db.execute("SELECT username FROM users WHERE username=?", (wanted,)) as cur:
        target = await cur.fetchone()
    if not target:
        # Deliberately not created: a user needs a password hash, and inventing one here
        # would put a credential nobody chose into the database.
        return f"noop: BOOTSTRAP_ADMIN={wanted!r} is not a registered user"

    await db.execute("UPDATE users SET role='admin' WHERE username=?", (wanted,))
    await db.commit()
    return f"promoted {wanted!r} to admin (database had no admin)"


async def init_db() -> str:
    """Create and migrate the users database. Returns the admin-bootstrap reason.

    The reason string was written for the audit log and thrown away until Step 15c: a
    promotion that happens at boot, with no request and no acting principal behind it, is
    exactly the event that leaves no other trace. The caller (`app.main`'s lifespan) records
    it; this module does not import `app.audit`, because `app.audit` imports this one.
    """
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        await db.execute(CREATE_USERS)
        # migrations: add new columns to existing databases
        #
        # "Already applied" is the ordinary case — this loop runs on every start — and it is
        # the ONLY case that passes silently. Anything else the driver raises is logged and
        # the loop continues: a failure here must be visible, but it must not take the
        # service down at deploy time. The statements are additive and init_db runs on every
        # start, so a transient failure retries on the next boot; refusing to serve would
        # convert a retryable error into an outage. Recorded as
        # docs/adr/0025-narrowing-the-migration-except.md.
        for statement in MIGRATIONS:
            try:
                await db.execute(statement)
                await db.commit()
            except sqlite3.Error as failure:
                if _is_already_applied(failure):
                    continue
                logger.error(
                    "schema migration failed",
                    extra={"statement": statement, "sqlite_error": str(failure)},
                )
        # generate api_key for users that don't have one
        async with db.execute("SELECT username FROM users WHERE api_key IS NULL") as cur:
            rows = await cur.fetchall()
        for row in rows:
            await db.execute(
                "UPDATE users SET api_key=? WHERE username=?",
                (generate_api_key(), row["username"]),
            )
        bootstrap_reason = await bootstrap_admin(db)
        await db.execute(CREATE_PROJECT_PLANS)
        await db.execute(CREATE_PROJECTS)
        await db.execute(CREATE_SITE_SETTINGS)
        await db.execute(CREATE_REVIEWS)
        # seed allow_registration from env if not set
        await db.execute(
            "INSERT OR IGNORE INTO site_settings (key, value) VALUES ('allow_registration', ?)",
            ("true" if settings.allow_registration else "false",),
        )
        await db.execute("""
            INSERT OR IGNORE INTO projects (username, name, purpose, principles, vision, brainstorm, organized, updated_at)
            SELECT username, project_name, purpose, principles, vision, brainstorm, organized, updated_at
            FROM project_plans
        """)
        await db.commit()
    return bootstrap_reason
