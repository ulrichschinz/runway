-- index api_keys_secret_hash
CREATE INDEX api_keys_secret_hash ON api_keys (secret_hash);

-- index api_keys_user
CREATE INDEX api_keys_user ON api_keys (user_id);

-- index users_storage_id
CREATE UNIQUE INDEX users_storage_id ON users (storage_id);

-- table api_keys
CREATE TABLE api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_id TEXT NOT NULL UNIQUE
        CHECK (length(key_id) = 16 AND key_id NOT GLOB '*[^0-9a-f]*'),
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('issued', 'legacy')),
    secret_hash TEXT NOT NULL
        CHECK (length(secret_hash) = 64 AND secret_hash NOT GLOB '*[^0-9a-f]*'),
    label TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    revoked_at INTEGER,
    last_used_at INTEGER
);

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
, role TEXT DEFAULT 'user', full_name TEXT DEFAULT '', email TEXT DEFAULT '', storage_id TEXT CHECK (storage_id IS NULL OR (length(storage_id) = 32 AND storage_id NOT GLOB '*[^0-9a-f]*')), storage_layout TEXT NOT NULL DEFAULT 'legacy' CHECK (storage_layout IN ('legacy', 'storage_id')), auth_version INTEGER NOT NULL DEFAULT 1 CHECK (auth_version >= 1));

-- trigger api_keys_identity_is_immutable
CREATE TRIGGER api_keys_identity_is_immutable
    BEFORE UPDATE OF key_id, user_id, kind, secret_hash ON api_keys
    WHEN NEW.key_id IS NOT OLD.key_id OR NEW.user_id IS NOT OLD.user_id
      OR NEW.kind IS NOT OLD.kind OR NEW.secret_hash IS NOT OLD.secret_hash
    BEGIN SELECT RAISE(ABORT, 'an api key''s identity is immutable'); END;

-- trigger api_keys_revocation_is_final
CREATE TRIGGER api_keys_revocation_is_final
    BEFORE UPDATE OF revoked_at ON api_keys
    WHEN OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at
    BEGIN SELECT RAISE(ABORT, 'a revoked api key stays revoked'); END;

-- trigger users_auth_version_monotone
CREATE TRIGGER users_auth_version_monotone
    BEFORE UPDATE OF auth_version ON users
    WHEN NEW.auth_version < OLD.auth_version
    BEGIN SELECT RAISE(ABORT, 'auth_version may only increase'); END;

-- trigger users_storage_id_immutable
CREATE TRIGGER users_storage_id_immutable
    BEFORE UPDATE OF storage_id ON users
    WHEN OLD.storage_id IS NOT NULL AND NEW.storage_id IS NOT OLD.storage_id
    BEGIN SELECT RAISE(ABORT, 'storage_id is immutable'); END;
