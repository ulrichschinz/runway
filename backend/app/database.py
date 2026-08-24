import aiosqlite

from app.config import settings

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


async def get_db():
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        yield db


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


async def init_db():
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        await db.execute(CREATE_USERS)
        # migrations: add new columns to existing databases
        for col_sql in [
            "ALTER TABLE users ADD COLUMN api_key TEXT",
            "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'",
            "ALTER TABLE users ADD COLUMN full_name TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''",
        ]:
            try:
                await db.execute(col_sql)
                await db.commit()
            except Exception:  # noqa: S110  # WAIVER-OPS-001 — Step 15 adds logging
                pass
        # generate api_key for users that don't have one
        async with db.execute("SELECT username FROM users WHERE api_key IS NULL") as cur:
            rows = await cur.fetchall()
        for row in rows:
            await db.execute(
                "UPDATE users SET api_key=? WHERE username=?",
                (generate_api_key(), row["username"]),
            )
        await bootstrap_admin(db)
        await db.execute(CREATE_PROJECT_PLANS)
        await db.execute(CREATE_PROJECTS)
        await db.execute(CREATE_SITE_SETTINGS)
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
