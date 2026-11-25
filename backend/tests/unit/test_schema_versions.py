"""Versioned migrations (ADR 0047, brief 0073): a fresh database and every historically migrated one
end with the same schema, the role column refuses what is not a role, and the step that gets them
there is applied once, whole, and never loses an account or reuses an id.

`RISK-SURF-001`: a fresh database had `api_key TEXT UNIQUE` and its columns in one order; one migrated
by `ALTER TABLE` — production — had neither, and the snapshot only described the fresh one.
`RISK-SEC-002`: `users.role` accepted any text. The baselines in `tests/fixtures/schema_history/` are
real historical shapes; `RULE-SURF-005` runs the same comparison in the gate.
"""

from __future__ import annotations

import asyncio
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
from app.config import settings
from app.database import init_db, schema_differences, schema_fingerprint
from tests.conftest import register_user

HISTORY = Path(__file__).resolve().parents[1] / "fixtures" / "schema_history"
BASELINES = sorted(HISTORY.glob("*.sql"))
STEPS = database.VERSIONED_MIGRATIONS


@contextlib.contextmanager
def database_lines() -> Iterator[io.StringIO]:
    from app.logging_setup import JsonFormatter

    buffer = io.StringIO()
    handler = logging.StreamHandler(buffer)
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger("app.database")
    previous = logger.level
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    try:
        yield buffer
    finally:
        logger.removeHandler(handler)
        logger.setLevel(previous)


def _lines(buffer: io.StringIO) -> list[dict]:
    return [json.loads(line) for line in buffer.getvalue().splitlines()]


def _boot(path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "db_path", str(path))
    data = path.parent / f"{path.stem}-data"
    data.mkdir(exist_ok=True)
    monkeypatch.setattr(settings, "data_root", data)
    asyncio.run(init_db())


def _from_baseline(baseline: Path, target: Path) -> Path:
    connection = sqlite3.connect(target)
    connection.executescript(baseline.read_text(encoding="utf-8"))
    connection.commit()
    connection.close()
    return target


@pytest.fixture
def fresh(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict:
    path = tmp_path / "fresh.db"
    _boot(path, monkeypatch)
    return schema_fingerprint(path)


def test_the_copy_statement_names_every_declared_column_in_order():
    import re

    insert = re.search(r"INSERT INTO users_v1 \((.*?)\)", database.COPY_USERS_V1, re.S)
    assert insert is not None
    named = [c.strip() for c in insert.group(1).split(",")]
    assert tuple(named) == database.USERS_V1_COLUMNS
    connection = sqlite3.connect(":memory:")
    connection.execute(database.CREATE_USERS_V1)
    declared = [row[1] for row in connection.execute("PRAGMA table_info(users_v1)")]
    connection.close()
    assert tuple(declared) == database.USERS_V1_COLUMNS


def test_there_are_baselines_and_they_are_real_shapes():
    names = [p.name for p in BASELINES]
    assert names == ["2026-04-27-initial.sql", "2026-04-28-profiles.sql", "2026-11-25-m7.sql"]


@pytest.mark.parametrize("baseline", BASELINES, ids=lambda p: p.stem)
def test_an_upgraded_database_has_the_fresh_schema(
    baseline: Path, fresh: dict, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    path = _from_baseline(baseline, tmp_path / f"{baseline.stem}.db")
    _boot(path, monkeypatch)
    assert schema_differences(fresh, schema_fingerprint(path)) == []


def test_both_paths_reach_the_current_version(fresh: dict):
    assert fresh["schema_version"] == database.SCHEMA_VERSION == 1


@pytest.mark.parametrize("baseline", [None, *BASELINES], ids=lambda p: p.stem if p else "fresh")
def test_the_role_column_refuses_what_is_not_a_role(
    baseline, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    path = tmp_path / "roles.db"
    if baseline is not None:
        _from_baseline(baseline, path)
    _boot(path, monkeypatch)
    connection = sqlite3.connect(path)
    try:
        for bad in ("Admin", "root", "", None):
            with pytest.raises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO users (username, hashed_password, role) VALUES ('mallory', 'x', ?)",
                    (bad,),
                )
        connection.execute("INSERT INTO users (username, hashed_password) VALUES ('carol', 'x')")
        connection.execute("UPDATE users SET role='admin' WHERE username='carol'")
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute("UPDATE users SET role='superuser' WHERE username='carol'")
        assert connection.execute("SELECT role FROM users WHERE username='carol'").fetchone() == (
            "admin",
        )
    finally:
        connection.close()


def _seed_initial(path: Path) -> None:
    """Three accounts in the oldest shape; the third deleted again, so the sequence is above MAX(id)."""
    _from_baseline(HISTORY / "2026-04-27-initial.sql", path)
    connection = sqlite3.connect(path)
    connection.executemany(
        "INSERT INTO users (username, hashed_password) VALUES (?, ?)",
        [("alice", "h-a"), ("bob", "h-b"), ("gone", "h-g")],
    )
    connection.execute("DELETE FROM users WHERE username='gone'")
    connection.commit()
    connection.close()


def test_the_rebuild_keeps_every_account_and_every_value(tmp_path: Path, monkeypatch):
    path = tmp_path / "data.db"
    _seed_initial(path)
    # Boot the previous image's way first (no versioned step): the additive loop and the backfills
    # give every column a value; then set some by hand, the way the application would have.
    monkeypatch.setattr(database, "VERSIONED_MIGRATIONS", ())
    _boot(path, monkeypatch)
    connection = sqlite3.connect(path)
    connection.execute(
        "UPDATE users SET role='admin', full_name='Alice', email='a@example.org', auth_version=3"
        " WHERE username='alice'"
    )
    connection.execute("UPDATE users SET role=NULL WHERE username='bob'")
    connection.commit()
    before = connection.execute("SELECT * FROM users ORDER BY id").fetchall()
    names = [d[0] for d in connection.execute("SELECT * FROM users").description]
    connection.close()
    monkeypatch.setattr(database, "VERSIONED_MIGRATIONS", STEPS)

    _boot(path, monkeypatch)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    after = {row["id"]: dict(row) for row in connection.execute("SELECT * FROM users")}
    connection.close()
    for row in before:
        old = dict(zip(names, row, strict=True))
        new = after[old["id"]]
        if old["role"] is None:
            old["role"] = "user"  # the one normalisation, and what every reader already read
        assert new == old


def test_a_deleted_accounts_id_is_never_handed_out_again(tmp_path: Path, monkeypatch):
    path = tmp_path / "seq.db"
    _seed_initial(path)
    _boot(path, monkeypatch)
    connection = sqlite3.connect(path)
    connection.execute("INSERT INTO users (username, hashed_password) VALUES ('dave', 'h-d')")
    new_id = connection.execute("SELECT id FROM users WHERE username='dave'").fetchone()[0]
    connection.close()
    assert new_id == 4  # alice 1, bob 2, gone 3 (deleted) — never 3 again


def test_the_controls_on_users_survive_the_rebuild(tmp_path: Path, monkeypatch):
    path = tmp_path / "controls.db"
    _seed_initial(path)
    _boot(path, monkeypatch)
    connection = sqlite3.connect(path)
    try:
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute("UPDATE users SET storage_id='0' WHERE username='alice'")
        with pytest.raises(sqlite3.IntegrityError, match="immutable"):
            connection.execute("UPDATE users SET storage_id=? WHERE username='alice'", ("a" * 32,))
        connection.execute("UPDATE users SET auth_version=2 WHERE username='alice'")
        with pytest.raises(sqlite3.IntegrityError, match="only increase"):
            connection.execute("UPDATE users SET auth_version=1 WHERE username='alice'")
        sid = connection.execute("SELECT storage_id FROM users WHERE username='alice'").fetchone()[
            0
        ]
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                "INSERT INTO users (username, hashed_password, storage_id) VALUES ('eve', 'x', ?)",
                (sid,),
            )
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                "INSERT INTO users (username, hashed_password) VALUES ('alice', 'x')"
            )
    finally:
        connection.close()


def test_the_step_runs_once_and_says_so_once(tmp_path: Path, monkeypatch):
    path = tmp_path / "once.db"
    _seed_initial(path)
    with database_lines() as buffer:
        _boot(path, monkeypatch)
        _boot(path, monkeypatch)
    applied = [line for line in _lines(buffer) if line["message"] == "schema migration applied"]
    assert len(applied) == 1
    assert applied[0]["schema_version"] == 1
    connection = sqlite3.connect(path)
    rows = connection.execute("SELECT version, name FROM schema_migrations").fetchall()
    connection.close()
    assert rows == [(1, "users_declared_shape")]
    assert database.applied_schema_version == 1


def test_a_role_that_is_not_a_role_refuses_the_step_and_changes_nothing(
    tmp_path: Path, monkeypatch
):
    path = tmp_path / "hand-edited.db"
    _seed_initial(path)
    monkeypatch.setattr(database, "VERSIONED_MIGRATIONS", ())
    _boot(path, monkeypatch)
    monkeypatch.setattr(database, "VERSIONED_MIGRATIONS", STEPS)
    connection = sqlite3.connect(path)
    connection.execute("UPDATE users SET role='Admin' WHERE username='bob'")
    connection.commit()
    before_sql = connection.execute("SELECT sql FROM sqlite_master WHERE name='users'").fetchone()
    before_rows = connection.execute("SELECT * FROM users ORDER BY id").fetchall()
    connection.close()

    with database_lines() as buffer:
        _boot(path, monkeypatch)
    refused = [line for line in _lines(buffer) if line["message"] == "schema migration refused"]
    assert len(refused) == 1
    assert refused[0]["level"] == "ERROR"
    assert "1 account(s)" in refused[0]["migration_error"]
    assert "bob" not in buffer.getvalue()
    assert database.applied_schema_version == 0

    connection = sqlite3.connect(path)
    assert (
        connection.execute("SELECT sql FROM sqlite_master WHERE name='users'").fetchone()
        == before_sql
    )
    assert connection.execute("SELECT * FROM users ORDER BY id").fetchall() == before_rows
    assert connection.execute("SELECT COUNT(*) FROM schema_migrations").fetchone() == (0,)
    assert (
        connection.execute("SELECT name FROM sqlite_master WHERE name='users_v1'").fetchone()
        is None
    )
    connection.close()


def test_a_refused_step_does_not_stop_the_service(isolated_storage: Path, fake_task, monkeypatch):
    connection = sqlite3.connect(isolated_storage / "users.db")
    connection.executescript((HISTORY / "2026-04-27-initial.sql").read_text())
    connection.execute("INSERT INTO users (username, hashed_password) VALUES ('x', 'y')")
    connection.commit()
    connection.close()
    monkeypatch.setattr(database, "VERSIONED_MIGRATIONS", ())
    asyncio.run(init_db())
    monkeypatch.setattr(database, "VERSIONED_MIGRATIONS", STEPS)
    connection = sqlite3.connect(isolated_storage / "users.db")
    connection.execute("UPDATE users SET role='root'")
    connection.commit()
    connection.close()
    from app.main import app

    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok"}
    assert database.applied_schema_version == 0


def test_a_step_that_fails_halfway_is_rolled_back_whole(tmp_path: Path, monkeypatch):
    path = tmp_path / "half.db"
    _seed_initial(path)
    monkeypatch.setattr(database, "VERSIONED_MIGRATIONS", ())
    _boot(path, monkeypatch)
    monkeypatch.setattr(database, "VERSIONED_MIGRATIONS", STEPS)

    async def broken(db):
        await database._users_v1(db)
        raise sqlite3.OperationalError("disk I/O error (synthetic)")

    monkeypatch.setattr(database, "VERSIONED_MIGRATIONS", ((1, "users_declared_shape", broken),))
    connection = sqlite3.connect(path)
    before = connection.execute("SELECT sql FROM sqlite_master WHERE name='users'").fetchone()
    connection.close()
    _boot(path, monkeypatch)
    connection = sqlite3.connect(path)
    assert (
        connection.execute("SELECT sql FROM sqlite_master WHERE name='users'").fetchone() == before
    )
    assert connection.execute("SELECT COUNT(*) FROM users").fetchone() == (2,)
    assert connection.execute("SELECT COUNT(*) FROM schema_migrations").fetchone() == (0,)
    connection.close()


# --- rollback: the previous image on a rebuilt database ----------------------------------------


def register_and_use(client: TestClient, username: str) -> None:
    """Register, sign in, write a task, change the password (auth_version), create and revoke a key."""
    creds = register_user(client, username)
    auth = {"Authorization": f"Bearer {creds['token']}"}
    assert client.post("/tasks", json={"description": "t"}, headers=auth).status_code == 201
    changed = client.put(
        "/auth/password",
        json={
            "current_password": creds["password"],
            "new_password": "another horse battery staple",
        },
        headers=auth,
    )
    assert changed.status_code == 200, changed.text
    token = changed.json()["access_token"]
    auth = {"Authorization": f"Bearer {token}"}
    keys = client.get("/auth/apikeys", headers=auth).json()
    for key in keys:
        if not key.get("revoked_at"):
            assert client.delete(f"/auth/apikeys/{key['key_id']}", headers=auth).status_code == 204


def test_the_previous_image_boots_and_writes_on_a_rebuilt_database(
    isolated_storage: Path, fake_task, monkeypatch
):
    """The image before brief 0073 is this init_db without the versioned step (MIGRATIONS is frozen,
    every CREATE is unchanged), and its writers are the same functions. Boot it on a rebuilt database,
    use it, then boot this image again."""
    from app.main import app

    with TestClient(app) as client:
        register_and_use(client, "alice")
    assert database.applied_schema_version == 1

    monkeypatch.setattr(database, "VERSIONED_MIGRATIONS", ())
    with TestClient(app) as client:
        register_and_use(client, "bob")
    monkeypatch.setattr(database, "VERSIONED_MIGRATIONS", STEPS)

    with TestClient(app) as client:
        register_and_use(client, "carol")
    assert database.applied_schema_version == 1
    connection = sqlite3.connect(isolated_storage / "users.db")
    roles = connection.execute("SELECT username, role FROM users ORDER BY id").fetchall()
    connection.close()
    assert roles == [("alice", "user"), ("bob", "user"), ("carol", "user")]
