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


def _generate_api_key() -> str:
    import secrets
    return secrets.token_urlsafe(32)


async def get_allow_registration(db) -> bool:
    async with db.execute("SELECT value FROM site_settings WHERE key='allow_registration'") as cur:
        row = await cur.fetchone()
    if row:
        return row["value"] == "true"
    return settings.allow_registration


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
            except Exception:
                pass
        # generate api_key for users that don't have one
        async with db.execute("SELECT username FROM users WHERE api_key IS NULL") as cur:
            rows = await cur.fetchall()
        for row in rows:
            await db.execute(
                "UPDATE users SET api_key=? WHERE username=?",
                (_generate_api_key(), row["username"]),
            )
        # set uli as admin
        await db.execute("UPDATE users SET role='admin' WHERE username='uli' AND role='user'")
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
