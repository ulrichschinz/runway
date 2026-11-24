import logging
import sqlite3
import time
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path

import aiosqlite

from app.config import settings
from app.task_storage import LAYOUT_STORAGE_ID, Account, new_storage_id

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

# What the user decided about a project, where the decision is not visible in the tasks
# themselves (D15). "On hold" and "done" are the two states a GTD review has to be able to
# express and Taskwarrior cannot: a project with no next action is either stalled — the most
# valuable finding a review makes — or deliberately parked, and nothing in the task data can
# tell the two apart. No row means `active`, which is what every project is until somebody
# says otherwise.
#
# Separate from `projects`, which means "created explicitly": a project that exists only
# because tasks name it can be put on hold without being created, and one created explicitly
# starts active without a row here. It is also a table rather than a column on `projects` for
# the reason the reviews table gives — the migration loop runs before the CREATE statements,
# so an ALTER against a table a fresh database does not have yet fails on the first boot.
CREATE_PROJECT_STATUS = """
CREATE TABLE IF NOT EXISTS project_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'on_hold', 'done')),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(username, name)
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
    # SEC-001, ADR 0043 — expand. The Taskwarrior directory is named by this id, never by the
    # username. NULL only between this ALTER and the backfill below, and for a row an older
    # image inserts after a rollback; the backfill fills both on the next start. UNIQUE cannot
    # be declared by ALTER TABLE, so the index after it carries it.
    "ALTER TABLE users ADD COLUMN storage_id TEXT"
    " CHECK (storage_id IS NULL OR (length(storage_id) = 32"
    " AND storage_id NOT GLOB '*[^0-9a-f]*'))",
    # 'legacy' is the default so a row written by the previous image — which knows nothing of
    # this column and still creates DATA_ROOT/<username>/ — is described truthfully.
    "ALTER TABLE users ADD COLUMN storage_layout TEXT NOT NULL DEFAULT 'legacy'"
    " CHECK (storage_layout IN ('legacy', 'storage_id'))",
    "CREATE UNIQUE INDEX IF NOT EXISTS users_storage_id ON users (storage_id)",
    # Immutable once set: an id that could be rewritten would be a path that could be chosen.
    """CREATE TRIGGER IF NOT EXISTS users_storage_id_immutable
    BEFORE UPDATE OF storage_id ON users
    WHEN OLD.storage_id IS NOT NULL AND NEW.storage_id IS NOT OLD.storage_id
    BEGIN SELECT RAISE(ABORT, 'storage_id is immutable'); END""",
    # REV-001, ADR 0044 — expand. Every token carries the account's version; a password change
    # raises it, and a token with any other version is refused. 1 is the default so every
    # existing row, and a row the previous image inserts after a rollback, starts where the
    # versionless tokens of that image are counted (dependencies.get_current_user).
    "ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1"
    " CHECK (auth_version >= 1)",
    # Monotone: a version that went down would make revoked tokens valid again.
    """CREATE TRIGGER IF NOT EXISTS users_auth_version_monotone
    BEFORE UPDATE OF auth_version ON users
    WHEN NEW.auth_version < OLD.auth_version
    BEGIN SELECT RAISE(ABORT, 'auth_version may only increase'); END""",
)

# The `site_settings` key holding the moment (UTC epoch seconds) this image first booted on this
# database. A token without `auth_version` was issued by the previous image; it is accepted only
# if it expires within one JWT lifetime of this moment (SHIM-SEC-008, ADR 0044). Written once.
AUTH_VERSION_EXPAND_KEY = "auth_version_expand_at"

# The moment (UTC epoch seconds) this image first booted on this database, for the password-hash
# timeline of ADR 0044 Decision 5 (`auth.kdf_phase`): bcrypt writes for KDF_SOAK, then Argon2id;
# the ambiguous >=72-byte bcrypt login accepted until KDF_SOAK + LONG_BCRYPT_WINDOW. Written
# once (SEC-006, brief 0067). Missing means Argon2id and no ambiguous login: fail closed.
KDF_EXPAND_KEY = "password_kdf_expand_at"

# The migration's protocol (SEC-001, M1.2): one row per decision the operator CLI took about
# one account. Ids, a path relative to DATA_ROOT, counts and a manifest digest — never a task's
# text and never a credential. `manifest` is a SHA-256 over the sorted (path, size, SHA-256)
# list of the copied files; rollback compares against it to know whether the new store has
# been written to since.
CREATE_STORAGE_MIGRATIONS = """
CREATE TABLE IF NOT EXISTS storage_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    storage_id TEXT NOT NULL,
    legacy_path TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('migrated', 'provisioned', 'blocked', 'rolled_back')),
    reason TEXT NOT NULL DEFAULT '',
    files INTEGER NOT NULL DEFAULT 0,
    bytes INTEGER NOT NULL DEFAULT 0,
    manifest TEXT NOT NULL DEFAULT '',
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

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


@asynccontextmanager
async def users_connection() -> AsyncIterator[aiosqlite.Connection]:
    """The users database outside a request — for the storage migration CLI."""
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        yield db


# --- accounts and their storage (SEC-001, ADR 0043) ----------------------------------------


def _account(row) -> Account:
    return Account(
        id=row["id"],
        username=row["username"],
        storage_id=row["storage_id"] or "",
        storage_layout=row["storage_layout"],
    )


async def get_account(db, username: str) -> Account | None:
    """The typed identity of one account, or None. What `get_task_store` resolves."""
    async with db.execute(
        "SELECT id, username, storage_id, storage_layout FROM users WHERE username=?",
        (username,),
    ) as cur:
        row = await cur.fetchone()
    return _account(row) if row else None


async def list_accounts(db) -> list[Account]:
    async with db.execute(
        "SELECT id, username, storage_id, storage_layout FROM users ORDER BY id"
    ) as cur:
        return [_account(row) for row in await cur.fetchall()]


async def create_account(db, username: str, hashed_password: str, api_key: str) -> Account:
    """Insert a new account in the storage-id layout. Raises sqlite3.IntegrityError when the
    username is taken. Never the legacy layout: that is created by nothing any more."""
    storage_id = new_storage_id()
    cur = await db.execute(
        "INSERT INTO users (username, hashed_password, api_key, storage_id, storage_layout)"
        " VALUES (?, ?, ?, ?, ?)",
        (username, hashed_password, api_key, storage_id, LAYOUT_STORAGE_ID),
    )
    await db.commit()
    return Account(
        id=cur.lastrowid or 0,
        username=username,
        storage_id=storage_id,
        storage_layout=LAYOUT_STORAGE_ID,
    )


async def delete_account(db, account_id: int) -> None:
    """Undo `create_account` when its store could not be provisioned."""
    await db.execute("DELETE FROM users WHERE id=?", (account_id,))
    await db.commit()


async def backfill_storage_ids(db) -> int:
    """Give every account without one a storage id. Idempotent; returns how many it set.

    Runs at every boot. It never changes the layout: an account backfilled here is still
    served from its legacy directory until the migration has copied it.
    """
    async with db.execute("SELECT id FROM users WHERE storage_id IS NULL OR storage_id=''") as cur:
        rows = await cur.fetchall()
    for row in rows:
        await db.execute(
            "UPDATE users SET storage_id=? WHERE id=? AND (storage_id IS NULL OR storage_id='')",
            (new_storage_id(), row["id"]),
        )
    await db.commit()
    return len(rows)


# --- sessions (REV-001, ADR 0044) -------------------------------------------------------------


async def get_auth_version(db, username: str) -> int | None:
    """The account's current `auth_version`, or None when there is no such account."""
    async with db.execute("SELECT auth_version FROM users WHERE username=?", (username,)) as cur:
        row = await cur.fetchone()
    return int(row[0]) if row else None


async def get_auth_version_expand_at(db) -> int | None:
    """When this image first booted here, or None — which refuses every versionless token."""
    async with db.execute(
        "SELECT value FROM site_settings WHERE key=?", (AUTH_VERSION_EXPAND_KEY,)
    ) as cur:
        row = await cur.fetchone()
    try:
        return int(row[0]) if row else None
    except (TypeError, ValueError):
        return None


async def get_password_kdf_expand_at(db) -> int | None:
    """When this image first booted here, for `auth.kdf_phase`; None fails closed."""
    async with db.execute("SELECT value FROM site_settings WHERE key=?", (KDF_EXPAND_KEY,)) as cur:
        row = await cur.fetchone()
    try:
        return int(row[0]) if row else None
    except (TypeError, ValueError):
        return None


async def rehash_password(db, username: str, expected_hash: str, new_hash: str) -> bool:
    """Replace a hash with a stronger hash OF THE SAME PASSWORD (rehash-on-login, SEC-006).

    Unlike `replace_password` the version is untouched: the password did not change, so no
    session ends. A compare-and-swap on the hash that was verified: if a password change (or
    another login's rehash) replaced it meanwhile, nothing is written and False is returned —
    the login that verified the old hash must never put the old password back.
    """
    cur = await db.execute(
        "UPDATE users SET hashed_password=? WHERE username=? AND hashed_password=?",
        (new_hash, username, expected_hash),
    )
    await db.commit()
    return cur.rowcount == 1


async def replace_password(db, username: str, expected_hash: str, new_hash: str) -> int | None:
    """Replace the hash and end every session, in ONE statement. Returns the new version, or
    None when the stored hash is no longer `expected_hash` (another change won).

    One statement is one transaction: there is no state with the new hash and the old version,
    or the reverse. The `hashed_password=?` condition makes it a compare-and-swap, so of two
    changes that both verified the old password exactly one writes.
    """
    async with db.execute(
        "UPDATE users SET hashed_password=?, auth_version=auth_version+1"
        " WHERE username=? AND hashed_password=? RETURNING auth_version",
        (new_hash, username, expected_hash),
    ) as cur:
        row = await cur.fetchone()
    await db.commit()
    return int(row[0]) if row else None


async def set_storage_layout(db, account_id: int, layout: str) -> None:
    await db.execute("UPDATE users SET storage_layout=? WHERE id=?", (layout, account_id))
    await db.commit()


async def record_storage_migration(
    db,
    account: Account,
    *,
    legacy_path: str,
    action: str,
    reason: str = "",
    files: int = 0,
    size: int = 0,
    manifest: str = "",
) -> None:
    await db.execute(
        "INSERT INTO storage_migrations"
        " (user_id, storage_id, legacy_path, action, reason, files, bytes, manifest)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (account.id, account.storage_id, legacy_path, action, reason, files, size, manifest),
    )
    await db.commit()


async def last_migration_manifest(db, account_id: int) -> str | None:
    """The manifest the most recent successful migration of this account recorded."""
    async with db.execute(
        "SELECT manifest FROM storage_migrations WHERE user_id=? AND action='migrated'"
        " ORDER BY id DESC LIMIT 1",
        (account_id,),
    ) as cur:
        row = await cur.fetchone()
    return row["manifest"] if row else None


async def last_storage_action(db, account_id: int) -> str | None:
    """The latest action that changed this account's layout — `migrated`, `provisioned` or
    `rolled_back` — ignoring `blocked` rows, which change nothing."""
    async with db.execute(
        "SELECT action FROM storage_migrations WHERE user_id=?"
        " AND action IN ('migrated', 'provisioned', 'rolled_back') ORDER BY id DESC LIMIT 1",
        (account_id,),
    ) as cur:
        row = await cur.fetchone()
    return row["action"] if row else None


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


async def get_project_statuses(db, username: str) -> dict[str, str]:
    """Every project this user has said something about, mapped to what they said.

    Only the projects with a row: a project with none is `active`, and writing that out for
    every project a user has would make "nobody has decided anything about this yet" and
    "somebody decided it is running" the same fact. The caller defaults.
    """
    async with db.execute(
        "SELECT name, status FROM project_status WHERE username=? ORDER BY id",
        (username,),
    ) as cur:
        return {row["name"]: row["status"] for row in await cur.fetchall()}


async def set_project_status(db, username: str, name: str, status: str) -> None:
    """Record what a project's status is now. State, not history, so this upserts.

    It deliberately does not create the project: a project exists because a task names it or
    because somebody created it explicitly, and saying "this one is on hold" is a statement
    about a project, not a way of making one. A status set on a name no project carries is
    listed by `GET /gtd/projects/overview` with zero counts, so it can be seen and corrected,
    and it is never reported as stalled — a typo must not become a permanent finding.
    """
    await db.execute(
        """
        INSERT INTO project_status (username, name, status, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(username, name) DO UPDATE SET
            status=excluded.status,
            updated_at=CURRENT_TIMESTAMP
        """,
        (username, name, status),
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
        # SEC-001: every account gets its storage id before anything can resolve it.
        await backfill_storage_ids(db)
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
        # REV-001: the start of the versionless-token window, once and never moved.
        await db.execute(
            "INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)",
            (AUTH_VERSION_EXPAND_KEY, str(int(time.time()))),
        )
        # SEC-006: the start of the password-hash timeline, once and never moved.
        await db.execute(
            "INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, ?)",
            (KDF_EXPAND_KEY, str(int(time.time()))),
        )
        await db.execute(CREATE_REVIEWS)
        await db.execute(CREATE_PROJECT_STATUS)
        await db.execute(CREATE_STORAGE_MIGRATIONS)
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
