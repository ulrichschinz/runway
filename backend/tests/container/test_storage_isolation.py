"""SEC-001 against the REAL Taskwarrior binary, end to end over HTTP.

The unit tier (`tests/unit/test_storage_identity.py`) proves which directory the application
hands the binary. This proves what the binary then does with it: that an account whose name
spells a path to another account's store cannot read, write, modify, complete or delete a
single task in it, and that no name creates anything outside `DATA_ROOT`.

Every account is synthetic and every path is under pytest's temp directory.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from tests.conftest import _enable_registration

pytestmark = pytest.mark.container

PASSWORD = "correct horse battery staple"  # noqa: S105  # a synthetic test account

ALIASES = ("alice/../alice", "./alice", "alice/.", "alice//")


@pytest.fixture
def client(isolated_storage: Path) -> Iterator[TestClient]:
    from app.main import app

    with TestClient(app, raise_server_exceptions=False) as c:
        _enable_registration(c)
        yield c


def _account(client: TestClient, username: str) -> dict[str, str] | None:
    r = client.post("/auth/register", json={"username": username, "password": PASSWORD})
    if r.status_code != 201:
        assert r.status_code in (400, 422), r.text
        return None
    token = client.post("/auth/login", json={"username": username, "password": PASSWORD}).json()[
        "access_token"
    ]
    return {"Authorization": f"Bearer {token}"}


def _descriptions(client: TestClient, headers: dict[str, str]) -> list[str]:
    r = client.get("/tasks", params={"status": "all"}, headers=headers)
    assert r.status_code == 200, r.text
    return [t["description"] for t in r.json()]


class TestAnAliasNameReachesNoOtherStore:
    def test_read_write_modify_complete_and_delete_stay_inside_one_account(self, client):
        alice = _account(client, "alice")
        assert alice is not None
        secret = client.post("/tasks", json={"description": "alice private"}, headers=alice)
        assert secret.status_code == 201, secret.text
        uuid = secret.json()["uuid"]

        for name in ALIASES:
            attacker = _account(client, name)
            if attacker is None:
                continue
            # read
            assert "alice private" not in _descriptions(client, attacker), name
            assert client.get(f"/tasks/{uuid}", headers=attacker).status_code in (400, 404)
            # modify, complete, start, annotate, delete — every one must miss
            for method, path, body in (
                ("PUT", f"/tasks/{uuid}", {"description": "owned"}),
                ("POST", f"/tasks/{uuid}/done", None),
                ("POST", f"/tasks/{uuid}/start", None),
                ("POST", f"/tasks/{uuid}/annotate", {"text": "owned"}),
                ("DELETE", f"/tasks/{uuid}", None),
            ):
                r = client.request(method, path, json=body, headers=attacker)
                assert r.status_code in (400, 404), f"{name!r} {method} {path}: {r.status_code}"
            # write
            planted = client.post("/tasks", json={"description": "planted"}, headers=attacker)
            assert planted.status_code == 201, planted.text

        after = client.get(f"/tasks/{uuid}", headers=alice)
        assert after.status_code == 200
        assert after.json()["description"] == "alice private"
        assert after.json()["status"] == "pending"
        assert after.json()["annotations"] == []
        assert _descriptions(client, alice) == ["alice private"]

    def test_no_name_creates_anything_above_the_data_root(self, client, isolated_storage):
        before = {p.name for p in isolated_storage.iterdir()}
        for name in ("../escape", f"{isolated_storage}/abs-escape", "../../escape2"):
            headers = _account(client, name)
            if headers is not None:
                client.post("/tasks", json={"description": "x"}, headers=headers)
        after = {p.name for p in isolated_storage.iterdir()}
        assert after - before <= {"users.db-journal"}, after - before
        assert not (settings.data_root.parent / "escape").exists()


def _legacy_account(username: str) -> None:
    """An account as the previous image left it: a row without the new layout, and a store
    under DATA_ROOT/<username>/ with the template installed."""
    import shutil
    import sqlite3

    from app.services.user_service import TASKRC_TEMPLATE
    from app.task_storage import new_storage_id

    con = sqlite3.connect(settings.db_path)
    con.execute(
        "INSERT INTO users (username, hashed_password, storage_id, storage_layout)"
        " VALUES (?, 'x', ?, 'legacy')",
        (username, new_storage_id()),
    )
    con.commit()
    con.close()
    path = settings.data_root.resolve() / username
    path.mkdir()
    shutil.copy(TASKRC_TEMPLATE, path / ".taskrc")


def _bearer(username: str) -> dict[str, str]:
    from app.auth import create_access_token

    return {"Authorization": f"Bearer {create_access_token(username)}"}


class TestAnExistingAccountAcrossTheMigration:
    def test_it_sees_the_same_tasks_before_and_after_and_the_old_store_is_kept(
        self, client, monkeypatch
    ):
        from app.services import storage_migration

        _legacy_account("carol")
        headers = _bearer("carol")
        for description in ("one", "two", "three"):
            assert (
                client.post(
                    "/tasks", json={"description": description}, headers=headers
                ).status_code
                == 201
            )
        done = client.get("/tasks", headers=headers).json()[0]["uuid"]
        assert client.post(f"/tasks/{done}/done", headers=headers).status_code == 204
        before = sorted(
            (t["uuid"], t["description"], t["status"])
            for t in client.get("/tasks", params={"status": "all"}, headers=headers).json()
        )

        assert storage_migration.main(["apply"]) == storage_migration.EX_OK
        monkeypatch.setattr(settings, "task_storage_mode", "strict")

        after = sorted(
            (t["uuid"], t["description"], t["status"])
            for t in client.get("/tasks", params={"status": "all"}, headers=headers).json()
        )
        assert after == before
        assert (settings.data_root.resolve() / "carol" / ".taskrc").is_file(), "source kept"
        # and the migrated store is the one written to from now on
        assert (
            client.post("/tasks", json={"description": "four"}, headers=headers).status_code == 201
        )
        assert (
            storage_migration.main(["rollback", "--user-id", "1"]) == storage_migration.EX_BLOCKED
        )

    def test_a_legacy_alias_is_refused_in_compat_and_blocked_by_the_migration(self, client):
        from app.services import storage_migration

        _legacy_account("alice")
        alice = _bearer("alice")
        assert (
            client.post("/tasks", json={"description": "alice private"}, headers=alice).status_code
            == 201
        )
        import sqlite3

        con = sqlite3.connect(settings.db_path)
        con.execute(
            "INSERT INTO users (username, hashed_password, storage_id, storage_layout)"
            " VALUES ('alice/../alice', 'x', ?, 'legacy')",
            ("f" * 32,),
        )
        con.commit()
        con.close()

        r = client.get("/tasks", headers=_bearer("alice/../alice"))
        assert r.status_code == 500
        assert "alice private" not in r.text
        assert storage_migration.main(["apply"]) == storage_migration.EX_BLOCKED
        # alice is blocked too: the alias may have written into her store, a human decides
        assert client.get("/tasks", headers=alice).json()[0]["description"] == "alice private"
