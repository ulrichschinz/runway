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
from app.services import task_runner, task_service  # noqa: E402
from tests.fake_task import FakeTaskCLI  # noqa: E402


@pytest.fixture(autouse=True)
def cheap_password_hashing(monkeypatch: pytest.MonkeyPatch) -> None:
    """REDUCED, TEST-ONLY PASSWORD-HASH PARAMETERS — never production values.

    The suite hashes or verifies a password in almost every test, and every login does one
    Argon2id verification and one bcrypt check (SEC-006: uniform work). At the production
    parameters (Argon2id t=3, 64 MiB; bcrypt cost 12) that is a quarter of a second per login,
    which would push the gate over its budget — the failure mode the budget exists to prevent.

    So for the duration of a test:
    - Argon2id runs at t=1, m=8 KiB, p=1 (the library minimum region);
    - the bcrypt dummy and the soak-time bcrypt writer run at cost 4;
    - the 7-day soak is zero, so a fresh test database is already past Switch 1 and writes
      Argon2id, which is production's steady state. `TestTheSoak` restores the real soak.

    The algorithms are unchanged; only the work factors are. Exactly one test,
    `test_password_kdf.py::TestKdfUnit::test_one_hash_at_production_parameters`, hashes at
    the production parameters (RISK-TEST-003): it proves they are valid and verify, not how
    long they take on the deploy host.
    """
    from datetime import timedelta

    from argon2 import PasswordHasher, Type

    from app import auth

    monkeypatch.setattr(
        auth,
        "_argon2",
        PasswordHasher(
            time_cost=1, memory_cost=8, parallelism=1, hash_len=32, salt_len=16, type=Type.ID
        ),
    )
    monkeypatch.setattr(auth, "LEGACY_BCRYPT_COST", 4)
    monkeypatch.setattr(auth, "KDF_SOAK", timedelta(0))


@pytest.fixture
def isolated_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point the application at a throwaway database and data root."""
    monkeypatch.setattr(settings, "db_path", str(tmp_path / "users.db"))
    monkeypatch.setattr(settings, "data_root", tmp_path / "data")
    (tmp_path / "data").mkdir()
    return tmp_path


@pytest.fixture(autouse=True)
def _bootable_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    """Every TestClient runs the app's lifespan, which now refuses to start on a default or
    short JWT_SECRET (finding SEC-1). The suite would otherwise be testing the refusal in
    every test rather than the behaviour it means to cover, so give it a real secret.

    Autouse on purpose: a test that boots the app without this would fail with a startup
    error whose cause is three layers away from the assertion that noticed.
    """
    monkeypatch.setattr(settings, "jwt_secret", "test-secret-long-enough-to-pass-the-startup-check")


@pytest.fixture(autouse=True)
def _reset_login_rate_limit() -> None:
    """The limiter is module state and outlives a TestClient. Without this, a suite that
    logs in repeatedly trips it in whichever test happens to run tenth — a failure that
    moves when tests are reordered."""
    from app import rate_limit

    rate_limit.reset_all()
    yield
    rate_limit.reset_all()


@pytest.fixture
def fake_task(monkeypatch: pytest.MonkeyPatch) -> FakeTaskCLI:
    """Replace the Taskwarrior binary at the ``_run`` choke point.

    Everything above ``_run`` — argv construction, validation, mapping, routing, error
    translation — still executes for real.
    """
    fake = FakeTaskCLI()
    monkeypatch.setattr(task_runner, "_run", fake.run)
    # One clock for both sides: what the fake calls "now" is what the service calls "now".
    # Read at call time, so a test can move `fake.now` forward.
    monkeypatch.setattr(task_service, "_now", lambda: fake.now)
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
    return register_user(client)


def register_user(client: TestClient, username: str = "alice") -> dict[str, str]:
    """Register `username` through the API and return credentials, token and API key.

    A plain function so the container tier can register a user against the real binary
    exactly the way the unit tier does against the fake.
    """
    client.app.state  # noqa: B018  # touch app state so the lifespan has certainly run
    _enable_registration(client)
    body = {"username": username, "password": "correct horse battery staple"}
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
