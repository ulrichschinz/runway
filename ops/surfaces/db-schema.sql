-- index users_storage_id
CREATE UNIQUE INDEX users_storage_id ON users (storage_id);

-- table project_plans
CREATE TABLE project_plans (
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
);

-- table project_status
CREATE TABLE project_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'on_hold', 'done')),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(username, name)
);

-- table projects
CREATE TABLE projects (
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
);

-- table reviews
CREATE TABLE reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('daily', 'weekly')),
    scope TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT NOT NULL,
    UNIQUE(username, kind, scope)
);

-- table site_settings
CREATE TABLE site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- table storage_migrations
CREATE TABLE storage_migrations (
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
);

-- table users
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    api_key TEXT UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
, role TEXT DEFAULT 'user', full_name TEXT DEFAULT '', email TEXT DEFAULT '', storage_id TEXT CHECK (storage_id IS NULL OR (length(storage_id) = 32 AND storage_id NOT GLOB '*[^0-9a-f]*')), storage_layout TEXT NOT NULL DEFAULT 'legacy' CHECK (storage_layout IN ('legacy', 'storage_id')));

-- trigger users_storage_id_immutable
CREATE TRIGGER users_storage_id_immutable
    BEFORE UPDATE OF storage_id ON users
    WHEN OLD.storage_id IS NOT NULL AND NEW.storage_id IS NOT OLD.storage_id
    BEGIN SELECT RAISE(ABORT, 'storage_id is immutable'); END;
