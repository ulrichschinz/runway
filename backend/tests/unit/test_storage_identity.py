"""SEC-001: the account name must never choose a Taskwarrior storage path.

The adversarial proof for brief 0065 (Security or Operability Change). Until this module the
registered username was joined onto `DATA_ROOT` verbatim and handed to the binary as
`TASKDATA`, `TASKRC` and `HOME`, so `alice/../alice` opened alice's store and `../x` created a
directory above the data root (finding SEC-001, audit run 20261118T131510Z-claude).

These tests sit one level below the fake: `subprocess.run` is replaced, so everything the
application owns — registration, the account lookup, the storage resolver, `_run`'s
environment — runs for real, and the assertion is on the environment the binary would have
been given. Whether the real binary then isolates two accounts is the container tier's job
(`tests/container/test_storage_isolation.py`).
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.services import task_runner
from tests.conftest import _enable_registration

PASSWORD = "correct horse battery staple"  # noqa: S105  # a synthetic test account


def hostile_names(tmp_path: Path) -> list[str]:
    """Names that address a path rather than an account. The absolute one points into the
    test's own temp directory, so a regression creates a directory there and nowhere else."""
    return [
        "alice/../alice",
        "./alice",
        "../victim",
        ".",
        "..",
        f"{tmp_path}/outside",
        "alice\\..\\alice",
        "a/b",
        # NFD of "alicé": canonically equal to the NFC spelling, and an alias of it on a
        # normalisation-insensitive filesystem.
        "alicé",
    ]


class _Completed:
    def __init__(self, stdout: str = "[]") -> None:
        self.returncode = 0
        self.stdout = stdout
        self.stderr = ""


@pytest.fixture
def spy(isolated_storage: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[list[dict]]:
    """Record the environment of every Taskwarrior invocation; answer every one with `[]`."""
    seen: list[dict] = []

    def fake_run(cmd, **kwargs):
        seen.append(kwargs["env"])
        return _Completed()

    monkeypatch.setattr(task_runner.subprocess, "run", fake_run)
    yield seen


@pytest.fixture
def real_runner_client(spy: list[dict]) -> Iterator[TestClient]:
    from app.main import app

    with TestClient(app, raise_server_exceptions=False) as c:
        _enable_registration(c)
        yield c


def _register_and_list(client: TestClient, spy: list[dict], username: str) -> dict | None:
    """Register `username`, list its tasks, and return the env the binary was given —
    or None when registration refused the name."""
    r = client.post("/auth/register", json={"username": username, "password": PASSWORD})
    if r.status_code != 201:
        assert r.status_code in (400, 422), r.text
        return None
    token = client.post("/auth/login", json={"username": username, "password": PASSWORD}).json()[
        "access_token"
    ]
    spy.clear()
    r = client.get("/tasks", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    assert spy, "listing tasks did not reach the binary"
    return spy[-1]


def _entries_outside_data_root(tmp_path: Path) -> set[str]:
    """Everything in the test's temp dir that is neither the data root nor the users DB."""
    allowed = {"data", "users.db", "users.db-journal"}
    return {p.name for p in tmp_path.iterdir() if p.name not in allowed}


class TestTheUsernameChoosesNoPath:
    def test_no_name_reaches_another_accounts_store_or_leaves_the_data_root(
        self, real_runner_client, spy, isolated_storage
    ):
        root = settings.data_root.resolve()
        victim = _register_and_list(real_runner_client, spy, "alice")
        assert victim is not None
        victim_dir = Path(victim["TASKDATA"]).resolve()

        for name in hostile_names(isolated_storage):
            env = _register_and_list(real_runner_client, spy, name)
            if env is None:
                continue  # refused at the door; the storage check below still applies
            for var in ("TASKDATA", "HOME"):
                resolved = Path(env[var]).resolve()
                assert resolved.parent == root, f"{name!r}: {var} leaves DATA_ROOT: {resolved}"
                assert resolved != victim_dir, f"{name!r}: {var} is alice's store"
            assert Path(env["TASKRC"]).resolve().parent.parent == root

        assert _entries_outside_data_root(isolated_storage) == set()

    def test_the_storage_directory_is_not_named_after_the_account(self, real_runner_client, spy):
        env = _register_and_list(real_runner_client, spy, "alice")
        assert env is not None
        assert Path(env["TASKDATA"]).name != "alice"
        assert not (settings.data_root / "alice").exists()

    def test_two_accounts_never_share_a_storage_directory(self, real_runner_client, spy):
        dirs = set()
        for name in ("alice", "bob", "Alice"):
            env = _register_and_list(real_runner_client, spy, name)
            assert env is not None
            dirs.add(Path(env["TASKDATA"]).resolve())
        assert len(dirs) == 3


def _users(db_path: str) -> list[sqlite3.Row]:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    try:
        return list(con.execute("SELECT * FROM users"))
    finally:
        con.close()


def _insert_account(username: str, layout: str, storage_id: str | None = None) -> str:
    """An account row as an older image, or an operator, would have left it — no API."""
    from app.task_storage import new_storage_id

    storage_id = storage_id or new_storage_id()
    con = sqlite3.connect(settings.db_path)
    con.execute(
        "INSERT INTO users (username, hashed_password, api_key, storage_id, storage_layout)"
        " VALUES (?, 'x', NULL, ?, ?)",
        (username, storage_id, layout),
    )
    con.commit()
    con.close()
    return storage_id


def _bearer(username: str) -> dict[str, str]:
    from app.auth import create_access_token

    return {"Authorization": f"Bearer {create_access_token(username)}"}


def _audit_rows(event: str) -> list[sqlite3.Row]:
    con = sqlite3.connect(settings.data_root / "audit.db")
    con.row_factory = sqlite3.Row
    try:
        return list(con.execute("SELECT * FROM audit_events WHERE event=?", (event,)))
    finally:
        con.close()


class TestPathSafetyDoesNotDependOnTheUsernameRule:
    """Even if a hostile name got into the table — through an older image, by hand — an
    account in the storage-id layout is served from its id and from nothing else."""

    def test_a_hostile_name_with_a_storage_id_reaches_only_its_own_directory(
        self, real_runner_client, spy, isolated_storage
    ):
        root = settings.data_root.resolve()
        alice = _register_and_list(real_runner_client, spy, "alice")
        assert alice is not None
        for name in hostile_names(isolated_storage):
            sid = _insert_account(name, "storage_id")
            (root / sid).mkdir()
            spy.clear()
            r = real_runner_client.get("/tasks", headers=_bearer(name))
            assert r.status_code == 200, (name, r.text)
            assert Path(spy[-1]["TASKDATA"]) == root / sid
        assert _entries_outside_data_root(isolated_storage) == set()


class TestTheLegacyLayout:
    def _legacy(self, name: str) -> Path:
        _insert_account(name, "legacy")
        path = settings.data_root.resolve() / name
        path.mkdir()
        return path

    def test_compat_serves_an_untouched_legacy_account_from_its_old_directory(
        self, real_runner_client, spy
    ):
        legacy = self._legacy("carol")
        spy.clear()
        r = real_runner_client.get("/tasks", headers=_bearer("carol"))
        assert r.status_code == 200
        assert Path(spy[-1]["TASKDATA"]) == legacy

    def test_compat_refuses_an_alias_name_with_500_and_an_audit_row(self, real_runner_client, spy):
        self._legacy("alice")
        _insert_account("alice/../alice", "legacy")
        spy.clear()
        r = real_runner_client.get("/tasks", headers=_bearer("alice/../alice"))
        assert r.status_code == 500
        assert r.json()["detail"] == "Task storage is unavailable for this account"
        assert spy == [], "the binary must not be reached at all"
        rows = _audit_rows("storage.refused")
        assert [(row["actor"], row["outcome"]) for row in rows] == [("alice/../alice", "refused")]
        assert "alice" not in (rows[0]["detail"] or "").replace("legacy", "")

    def test_strict_refuses_every_legacy_account(self, real_runner_client, spy, monkeypatch):
        self._legacy("carol")
        monkeypatch.setattr(settings, "task_storage_mode", "strict")
        spy.clear()
        r = real_runner_client.get("/tasks", headers=_bearer("carol"))
        assert r.status_code == 500
        assert spy == []
        assert _audit_rows("storage.refused")[0]["detail"] == "legacy layout refused in strict mode"

    def test_strict_still_serves_a_storage_id_account(self, real_runner_client, spy, monkeypatch):
        monkeypatch.setattr(settings, "task_storage_mode", "strict")
        assert _register_and_list(real_runner_client, spy, "dave") is not None

    def test_every_route_that_reaches_taskwarrior_is_behind_the_resolver(
        self, real_runner_client, spy, monkeypatch
    ):
        """A route that took the username straight to the service would bypass the refusal;
        each of these must answer 500 without reaching the binary."""
        self._legacy("carol")
        monkeypatch.setattr(settings, "task_storage_mode", "strict")
        uuid = "11111111-1111-4111-8111-111111111111"
        calls = [
            ("GET", "/tasks", None),
            ("POST", "/tasks", {"description": "x"}),
            ("GET", f"/tasks/{uuid}", None),
            ("PUT", f"/tasks/{uuid}", {"description": "x"}),
            ("POST", f"/tasks/{uuid}/done", None),
            ("DELETE", f"/tasks/{uuid}", None),
            ("POST", f"/tasks/{uuid}/start", None),
            ("POST", f"/tasks/{uuid}/stop", None),
            ("POST", f"/tasks/{uuid}/annotate", {"text": "x"}),
            ("GET", "/gtd/inbox", None),
            ("GET", "/gtd/next", None),
            ("GET", "/gtd/waiting", None),
            ("GET", "/gtd/someday", None),
            ("GET", "/gtd/tickler", None),
            ("GET", "/gtd/summary", None),
            ("GET", "/gtd/projects", None),
            ("GET", "/gtd/projects/overview", None),
            ("GET", "/gtd/projects/home", None),
            ("POST", "/inbox", {"description": "x"}),
        ]
        spy.clear()
        for method, path, body in calls:
            r = real_runner_client.request(method, path, json=body, headers=_bearer("carol"))
            assert r.status_code == 500, (method, path, r.status_code)
        assert spy == []


class TestRegistration:
    @pytest.mark.parametrize("name", ["../victim", "a/b", ".", "alicé", " alice", "a\x07"])
    def test_a_name_that_is_not_plain_is_refused_with_400(self, real_runner_client, name):
        r = real_runner_client.post("/auth/register", json={"username": name, "password": PASSWORD})
        assert r.status_code == 400
        assert not _users(settings.db_path) or all(
            u["username"] != name for u in _users(settings.db_path)
        )

    def test_a_new_account_is_never_created_in_the_legacy_layout(self, real_runner_client, spy):
        _register_and_list(real_runner_client, spy, "erin")
        (row,) = _users(settings.db_path)
        assert row["storage_layout"] == "storage_id"
        assert (settings.data_root / row["storage_id"] / ".taskrc").is_file()
        assert sorted(p.name for p in settings.data_root.iterdir()) == sorted(
            [row["storage_id"], "audit.db"]
        )

    def test_a_store_that_cannot_be_created_leaves_no_account(
        self, real_runner_client, monkeypatch
    ):
        from app.routers import auth as auth_router

        def fail(_account):
            raise OSError("disk full")

        monkeypatch.setattr(auth_router, "provision_store", fail)
        r = real_runner_client.post(
            "/auth/register", json={"username": "fay", "password": PASSWORD}
        )
        assert r.status_code == 500
        assert _users(settings.db_path) == []
