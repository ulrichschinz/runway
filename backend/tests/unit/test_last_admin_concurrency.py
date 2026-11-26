"""REV-002: the last-admin invariant holds under concurrency (brief 0068, plan M3.1).

The serial guard (`test_admin.py::TestLastAdminGuard`) has existed since brief 0012. What it
never proved is that two overlapping writes cannot both pass it: each request runs on its own
SQLite connection, and a count read in autocommit holds nothing still until the write.

The parallel tests here run two real requests through the ASGI app, each on its own
connection, and hold both at a barrier immediately before their write to `users`. Without a
serialising transaction both reach the barrier having read "two admins", and both write. With
one, the second request cannot even begin until the first has committed, so the barrier
times out for the first and the second sees the first's result.
"""

from __future__ import annotations

import asyncio
import importlib.util
import sqlite3
from pathlib import Path
from typing import Any

import aiosqlite
import httpx
import pytest

from app.config import settings
from tests.conftest import register_user

# How long the first writer waits for a second one at the barrier. Long enough that two
# unserialised requests certainly both arrive (they need milliseconds); short enough that a
# serialised run — where the second can never arrive while the first holds the lock — costs
# one second, well inside SQLite's 5 s busy timeout the second request is waiting on.
BARRIER_TIMEOUT = 1.0

BASE = "http://last-admin-under-test"


def _set_role_directly(username: str, role: str) -> None:
    con = sqlite3.connect(settings.db_path)
    con.execute("UPDATE users SET role=? WHERE username=?", (role, username))
    con.commit()
    con.close()


def _admins() -> list[str]:
    con = sqlite3.connect(settings.db_path)
    rows = con.execute("SELECT username FROM users WHERE role='admin' ORDER BY username").fetchall()
    con.close()
    return [r[0] for r in rows]


def _usernames() -> list[str]:
    con = sqlite3.connect(settings.db_path)
    rows = con.execute("SELECT username FROM users ORDER BY username").fetchall()
    con.close()
    return [r[0] for r in rows]


class _Barrier:
    """Two parties; a party that waits alone gives up after `timeout` and goes on.

    `asyncio.Barrier` breaks for every party when one waiter is cancelled, which is exactly
    what a timeout does; this one just lets the lonely party through.
    """

    def __init__(self, parties: int, timeout: float) -> None:
        self.parties, self.timeout = parties, timeout
        self.arrived = 0
        self.met = 0  # how many parties found the others there (or were found)
        self._all_here = asyncio.Event()

    async def wait(self) -> None:
        self.arrived += 1
        if self.arrived >= self.parties:
            self._all_here.set()
        try:
            await asyncio.wait_for(self._all_here.wait(), self.timeout)
            self.met += 1
        except TimeoutError:
            pass


def _is_admin_removing_write(sql: str) -> bool:
    s = " ".join(sql.split()).upper()
    return s.startswith("UPDATE USERS SET ROLE") or s.startswith("DELETE FROM USERS")


class _BarrierConnection:
    """An aiosqlite connection that stops at the barrier before writing a role or a deletion.

    Everything else is delegated, so the code under test runs unchanged on a real
    connection of its own.
    """

    def __init__(self, inner: aiosqlite.Connection, barrier: _Barrier) -> None:
        self._inner = inner
        self._barrier = barrier

    def __getattr__(self, name: str) -> Any:
        return getattr(self._inner, name)

    def execute(self, sql: str, parameters: Any = None) -> Any:
        if not _is_admin_removing_write(sql):
            return self._inner.execute(sql, parameters)
        return _HeldExecute(self._inner, self._barrier, sql, parameters)


class _HeldExecute:
    """Both shapes aiosqlite's `execute` result has: awaitable and async context manager."""

    def __init__(self, inner, barrier, sql, parameters) -> None:
        self._inner, self._barrier, self._sql, self._parameters = inner, barrier, sql, parameters
        self._cursor = None

    async def _run(self):
        await self._barrier.wait()
        return await self._inner.execute(self._sql, self._parameters)

    def __await__(self):
        return self._run().__await__()

    async def __aenter__(self):
        self._cursor = await self._run()
        return self._cursor

    async def __aexit__(self, *exc) -> None:
        await self._cursor.close()


@pytest.fixture
def barrier(client):
    """Route every request's connection through one shared barrier."""
    from app.database import get_db
    from app.main import app

    shared = _Barrier(parties=2, timeout=BARRIER_TIMEOUT)

    async def held_db():
        async with aiosqlite.connect(settings.db_path) as db:
            db.row_factory = aiosqlite.Row
            yield _BarrierConnection(db, shared)

    app.dependency_overrides[get_db] = held_db
    yield shared
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def two_admins(client):
    """alice and bob, both admins, each with a token."""
    alice = register_user(client, "alice")
    bob = register_user(client, "bob")
    _set_role_directly("alice", "admin")
    _set_role_directly("bob", "admin")
    return {
        "alice": {"Authorization": f"Bearer {alice['token']}"},
        "bob": {"Authorization": f"Bearer {bob['token']}"},
    }


async def _put_role(headers: dict[str, str], target: str, role: str) -> httpx.Response:
    from app.main import app

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url=BASE, timeout=30
    ) as c:
        return await c.put(f"/admin/users/{target}/role", json={"role": role}, headers=headers)


class TestTwoParallelDemotions:
    """The plan's acceptance: two admins demoted at the same time — exactly one refused."""

    @pytest.mark.anyio
    async def test_each_admin_demotes_the_other(self, two_admins, barrier):
        a, b = await asyncio.gather(
            _put_role(two_admins["alice"], "bob", "user"),
            _put_role(two_admins["bob"], "alice", "user"),
        )
        assert sorted([a.status_code, b.status_code]) == [200, 409], (a.text, b.text)
        assert len(_admins()) == 1
        # Both requests reached their write, so the scenario really ran; they never stood at
        # the barrier together, because the second could not begin until the first committed.
        assert barrier.arrived == 2
        assert barrier.met <= 1
        refused = a if a.status_code == 409 else b
        assert refused.json()["detail"] == (
            "Refusing to demote the last admin — promote another user first"
        )

    @pytest.mark.anyio
    async def test_one_admin_demotes_both_from_two_tabs(self, two_admins, barrier):
        a, b = await asyncio.gather(
            _put_role(two_admins["alice"], "alice", "user"),
            _put_role(two_admins["alice"], "bob", "user"),
        )
        assert sorted([a.status_code, b.status_code]) == [200, 409], (a.text, b.text)
        assert len(_admins()) == 1

    @pytest.mark.anyio
    async def test_the_refusal_is_audited_as_a_refusal(self, two_admins, barrier):
        from app import audit, database

        await asyncio.gather(
            _put_role(two_admins["alice"], "bob", "user"),
            _put_role(two_admins["bob"], "alice", "user"),
        )
        con = sqlite3.connect(database.audit_db_path())
        rows = con.execute(
            "SELECT outcome, detail FROM audit_events WHERE event=? ORDER BY id",
            (audit.ROLE_CHANGED,),
        ).fetchall()
        con.close()
        outcomes = sorted(r[0] for r in rows)
        assert outcomes == [audit.REFUSED, audit.SUCCESS]
        assert (audit.REFUSED, "refused: this is the last admin") in rows


class TestDeletion:
    """Account deletion is held to the same invariant (plan M3.1, last bullet)."""

    @pytest.mark.anyio
    async def test_the_only_admin_cannot_be_deleted(self, client):
        from app import database

        register_user(client, "alice")
        _set_role_directly("alice", "admin")
        async with aiosqlite.connect(settings.db_path) as db:
            db.row_factory = aiosqlite.Row
            account = await database.get_account(db, "alice")
            assert account is not None
            with pytest.raises(database.LastAdminError):
                await database.delete_account(db, account.id)
        assert _admins() == ["alice"]

    @pytest.mark.anyio
    async def test_a_plain_account_is_still_deleted(self, client):
        from app import database

        register_user(client, "alice")
        register_user(client, "bob")
        _set_role_directly("alice", "admin")
        async with aiosqlite.connect(settings.db_path) as db:
            db.row_factory = aiosqlite.Row
            account = await database.get_account(db, "bob")
            assert account is not None
            await database.delete_account(db, account.id)
        assert _usernames() == ["alice"]

    @pytest.mark.anyio
    async def test_demotion_racing_the_deletion_of_the_other_admin(self, two_admins):
        """Connection 1 deletes bob, connection 2 demotes alice, both held at a barrier."""
        from app import database

        shared = _Barrier(parties=2, timeout=BARRIER_TIMEOUT)
        async with (
            aiosqlite.connect(settings.db_path) as one,
            aiosqlite.connect(settings.db_path) as two,
        ):
            one.row_factory = two.row_factory = aiosqlite.Row
            bob = await database.get_account(one, "bob")
            assert bob is not None

            async def delete_bob():
                await database.delete_account(_BarrierConnection(one, shared), bob.id)

            async def demote_alice():
                await database.set_role(_BarrierConnection(two, shared), "alice", "user")

            results = await asyncio.gather(delete_bob(), demote_alice(), return_exceptions=True)
        refused = [r for r in results if isinstance(r, database.LastAdminError)]
        assert len(refused) == 1, results
        assert not [r for r in results if isinstance(r, BaseException) and r not in refused]
        assert len(_admins()) == 1


class TestTheGuardItself:
    """`admin_preserving_write` is the one mechanism — for today's paths and any bulk one."""

    @pytest.mark.anyio
    async def test_a_bulk_demotion_is_rolled_back_whole(self, two_admins):
        from app import database

        async with aiosqlite.connect(settings.db_path) as db:
            db.row_factory = aiosqlite.Row
            with pytest.raises(database.LastAdminError):
                async with database.admin_preserving_write(db):
                    await db.execute("UPDATE users SET full_name='touched'")
                    await db.execute("UPDATE users SET role='user'")
        assert _admins() == ["alice", "bob"]
        con = sqlite3.connect(settings.db_path)
        names = {r[0] for r in con.execute("SELECT full_name FROM users")}
        con.close()
        assert "touched" not in names  # the WHOLE transaction, not only the role statement

    @pytest.mark.anyio
    async def test_a_bulk_write_that_keeps_an_admin_commits(self, two_admins):
        from app import database

        async with aiosqlite.connect(settings.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with database.admin_preserving_write(db):
                await db.execute("UPDATE users SET role='user' WHERE username='bob'")
        assert _admins() == ["alice"]

    @pytest.mark.anyio
    async def test_an_instance_without_any_admin_is_not_blocked(self, client):
        """Before BOOTSTRAP_ADMIN, or during recovery, there is no admin to protect."""
        from app import database

        register_user(client, "alice")
        register_user(client, "bob")
        assert _admins() == []
        async with aiosqlite.connect(settings.db_path) as db:
            db.row_factory = aiosqlite.Row
            assert await database.set_role(db, "alice", "user") == "user"
            bob = await database.get_account(db, "bob")
            assert bob is not None
            await database.delete_account(db, bob.id)
        assert _usernames() == ["alice"]

    @pytest.mark.anyio
    async def test_an_unknown_account_is_none_and_writes_nothing(self, two_admins):
        from app import database

        async with aiosqlite.connect(settings.db_path) as db:
            db.row_factory = aiosqlite.Row
            assert await database.set_role(db, "ghost", "user") is None
            assert not db.in_transaction
        assert _admins() == ["alice", "bob"]

    @pytest.mark.anyio
    async def test_the_guard_will_not_open_inside_another_transaction(self, two_admins):
        from app import database

        async with aiosqlite.connect(settings.db_path) as db:
            await db.execute("UPDATE users SET full_name='half-done' WHERE username='alice'")
            assert db.in_transaction
            with pytest.raises(RuntimeError):
                async with database.admin_preserving_write(db):
                    pass
            await db.rollback()


def _grant_admin():
    path = Path(__file__).resolve().parents[3] / "tools" / "grant-admin.py"
    spec = importlib.util.spec_from_file_location("grant_admin_under_test", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestTheOperatorCli:
    """`./run grant-admin --role user` is a demotion path too."""

    def test_it_refuses_to_demote_the_last_admin(self, client, capsys):
        register_user(client, "alice")
        _set_role_directly("alice", "admin")
        tool = _grant_admin()
        code = tool.main(["--db", settings.db_path, "--role", "user", "alice"])
        assert code == tool.EX_RULE
        assert "last admin" in capsys.readouterr().err
        assert _admins() == ["alice"]

    def test_it_still_demotes_when_another_admin_remains(self, two_admins):
        tool = _grant_admin()
        assert tool.main(["--db", settings.db_path, "--role", "user", "bob"]) == tool.EX_OK
        assert _admins() == ["alice"]

    def test_promotion_the_escape_hatch_is_unchanged(self, client):
        register_user(client, "alice")
        assert _admins() == []
        tool = _grant_admin()
        assert tool.main(["--db", settings.db_path, "alice"]) == tool.EX_OK
        assert _admins() == ["alice"]

    def test_a_held_write_lock_is_a_tooling_failure_not_a_refusal(self, two_admins, monkeypatch):
        """Exit 1 means "would remove the last admin" and nothing else (review of brief 0068).

        A second connection holds the write lock past the CLI's busy timeout: the CLI must
        answer 3 (tooling), not crash with a traceback that exits 1, and change nothing.
        """
        tool = _grant_admin()
        monkeypatch.setattr(tool, "BUSY_TIMEOUT", 0.2)
        holder = sqlite3.connect(settings.db_path, isolation_level=None)
        try:
            holder.execute("BEGIN IMMEDIATE")
            code = tool.main(["--db", settings.db_path, "--role", "user", "bob"])
        finally:
            holder.rollback()
            holder.close()
        assert code == tool.EX_TOOLING
        assert _admins() == ["alice", "bob"]

    def test_a_database_without_a_users_table_is_a_tooling_failure(self, tmp_path):
        tool = _grant_admin()
        wrong = tmp_path / "not-users.db"
        con = sqlite3.connect(wrong)
        con.execute("CREATE TABLE something_else (x INTEGER)")
        con.commit()
        con.close()
        assert tool.main(["--db", str(wrong), "--role", "user", "bob"]) == tool.EX_TOOLING

    @pytest.mark.anyio
    async def test_it_cannot_race_a_request(self, two_admins):
        """The CLI's own transaction against a request's guard that is mid-write.

        Connection 1 (the application's guard) has demoted alice and not yet committed. The
        CLI then demotes bob from its own `sqlite3` connection. It must wait for the write
        lock, see the committed state (bob the only admin) and refuse — not read the stale
        count of two and leave none.
        """
        from app import database

        tool = _grant_admin()
        async with aiosqlite.connect(settings.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with database.admin_preserving_write(db):
                await db.execute("UPDATE users SET role='user' WHERE username='alice'")
                cli = asyncio.create_task(
                    asyncio.to_thread(
                        tool.main, ["--db", settings.db_path, "--role", "user", "bob"]
                    )
                )
                await asyncio.sleep(0.5)
                assert not cli.done(), "the CLI did not wait for the request's write lock"
            code = await cli
        assert code == tool.EX_RULE
        assert _admins() == ["bob"]
