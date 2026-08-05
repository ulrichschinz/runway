"""Shared fixtures for the backend test suite.

Every test runs against a throwaway SQLite database and a throwaway data root, so no
test can see another's users, keys or tasks — and none of them can reach the developer's
real ``users.db``.
"""

from __future__ import annotations

import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.services import task_runner  # noqa: E402
from tests.fake_task import FakeTaskCLI  # noqa: E402


@pytest.fixture(autouse=True)
def cheap_password_hashing(monkeypatch: pytest.MonkeyPatch) -> None:
    """Run bcrypt at its minimum cost factor for the duration of the tests.

    Production hashing is deliberately slow, and the suite hashes or verifies a password
    in almost every test. At the default cost that alone took ~36 seconds — long enough
    that the gate would start getting skipped, which is the failure mode the runtime
    budget exists to prevent.

    The algorithm is unchanged; only the work factor is. Nothing here asserts anything
    about the cost factor, so no test is weakened by this — but note that the production
    cost factor is consequently NOT covered by any test.
    """
    from passlib.context import CryptContext

    from app import auth

    monkeypatch.setattr(
        auth, "pwd_context", CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=4)
    )


@pytest.fixture
def isolated_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point the application at a throwaway database and data root."""
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "users.db"))
    monkeypatch.setattr(settings, "data_root", tmp_path / "data")
    (tmp_path / "data").mkdir()
    return tmp_path


@pytest.fixture
def fake_task(monkeypatch: pytest.MonkeyPatch) -> FakeTaskCLI:
    """Replace the Taskwarrior binary at the ``_run`` choke point.

    Everything above ``_run`` — argv construction, validation, mapping, routing, error
    translation — still executes for real.
    """
    fake = FakeTaskCLI()
    monkeypatch.setattr(task_runner, "_run", fake.run)
    return fake


@pytest.fixture
def client(isolated_storage: Path, fake_task: FakeTaskCLI) -> Iterator[TestClient]:
    """An unauthenticated client against a freshly initialised database."""
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def registered(client: TestClient) -> dict[str, str]:
    """Register a user and return their credentials, token and API key.

    Registration is enabled by default in a fresh database (``allow_registration`` is
    seeded from settings, which default to False) — so it is enabled explicitly here.
    """
    client.app.state  # noqa: B018  # touch app state so the lifespan has certainly run
    _enable_registration(client)
    body = {"username": "alice", "password": "correct horse battery staple"}
    r = client.post("/auth/register", json=body)
    assert r.status_code == 201, r.text
    token = client.post("/auth/login", json=body).json()["access_token"]
    api_key = client.get("/auth/apikey", headers={"Authorization": f"Bearer {token}"}).json()[
        "api_key"
    ]
    return {
        "username": body["username"],
        "password": body["password"],
        "token": token,
        "api_key": api_key,
    }


@pytest.fixture
def auth(registered: dict[str, str]) -> dict[str, str]:
    """Authorization header for the registered user."""
    return {"Authorization": f"Bearer {registered['token']}"}


def _enable_registration(client: TestClient) -> None:
    """Flip the site setting directly — there is no unauthenticated way to do it."""
    import sqlite3

    from app.config import settings as s

    con = sqlite3.connect(s.db_path)
    con.execute(
        "INSERT OR REPLACE INTO site_settings (key, value) VALUES ('allow_registration', 'true')"
    )
    con.commit()
    con.close()
