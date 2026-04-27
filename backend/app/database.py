import aiosqlite
from app.config import settings

CREATE_USERS = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
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


async def get_db():
    async with aiosqlite.connect(settings.db_path) as db:
        db.row_factory = aiosqlite.Row
        yield db


async def init_db():
    async with aiosqlite.connect(settings.db_path) as db:
        await db.execute(CREATE_USERS)
        await db.execute(CREATE_PROJECT_PLANS)
        await db.execute(CREATE_PROJECTS)
        await db.execute("""
            INSERT OR IGNORE INTO projects (username, name, purpose, principles, vision, brainstorm, organized, updated_at)
            SELECT username, project_name, purpose, principles, vision, brainstorm, organized, updated_at
            FROM project_plans
        """)
        await db.commit()
