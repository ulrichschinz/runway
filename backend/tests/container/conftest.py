"""Fixtures for the container tier: the real Taskwarrior binary, never the fake.

This tier inherits ``tests/conftest.py``. None of its autouse fixtures touches
``task_runner._run`` — only the ``client`` fixture pulls in ``fake_task`` — so everything
here reaches the real ``task``. ``real_client`` deliberately does not depend on ``client``.
"""

from __future__ import annotations

import asyncio
import os
import time
from collections.abc import Iterator
from pathlib import Path

import aiosqlite
import pytest
from fastapi.testclient import TestClient

from app import task_storage
from app.config import settings
from app.database import get_account
from app.task_storage import TaskStore
from tests.conftest import register_user


@pytest.fixture(autouse=True)
def _utc() -> Iterator[None]:
    """Run every container test, and the ``task`` it spawns, in UTC.

    Taskwarrior interprets a bare ``YYYY-MM-DD`` in local time and exports UTC. Pinning the
    zone makes the assertions independent of the machine; CI's image already runs UTC.
    ``_run`` hands ``os.environ`` to the subprocess, so the binary sees the same zone.
    """
    before = os.environ.get("TZ")
    os.environ["TZ"] = "UTC"
    time.tzset()
    yield
    if before is None:
        os.environ.pop("TZ", None)
    else:
        os.environ["TZ"] = before
    time.tzset()


@pytest.fixture
def real_client(isolated_storage: Path) -> Iterator[tuple[TestClient, dict[str, str]]]:
    """A client against the real binary, with alice registered; yields (client, headers)."""
    from app.main import app

    with TestClient(app) as c:
        creds = register_user(c)
        yield c, {"Authorization": f"Bearer {creds['token']}"}


def store_of(username: str) -> TaskStore:
    """A registered account's store, resolved the way `get_task_store` resolves it.

    Since brief 0065 (SEC-001) the directory is named by the account's storage id, so a test
    that registers over HTTP and then reaches the binary directly has to look it up.
    """

    async def lookup():
        async with aiosqlite.connect(settings.db_path) as db:
            db.row_factory = aiosqlite.Row
            return await get_account(db, username)

    account = asyncio.run(lookup())
    assert account is not None, username
    return task_storage.resolve(account)
