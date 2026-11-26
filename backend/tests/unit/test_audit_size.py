"""RISK-OPS-006 (plan M8, brief 0073, ADR 0047 Decision 1): the audit file is measured, warned about
above a threshold, and remembered at its largest — and nothing deletes a row.

Before, `audit.db` grew for the life of the deployment and nothing measured it; the first sign of a
full partition would have been the users database failing beside it. These tests drive the
measurement through the real formatter, at boot and on its timer, and pin that it never raises,
never reads a row's contents and never removes one.
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

from fastapi.testclient import TestClient

from app import audit, database
from app.config import settings
from app.logging_setup import JsonFormatter


@contextlib.contextmanager
def audit_lines() -> Iterator[io.StringIO]:
    buffer = io.StringIO()
    handler = logging.StreamHandler(buffer)
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger("app.audit")
    previous = logger.level
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    try:
        yield buffer
    finally:
        logger.removeHandler(handler)
        logger.setLevel(previous)


def size_lines(buffer: io.StringIO) -> list[dict]:
    entries = [json.loads(line) for line in buffer.getvalue().splitlines()]
    return [e for e in entries if e["message"] == "audit store size"]


def _grow(rows: int) -> None:
    for i in range(rows):
        audit.record(
            audit.TASK_DELETED, outcome=audit.SUCCESS, actor="alice", detail="x" * 200 + str(i)
        )


def _files_size() -> int:
    path = database.audit_db_path()
    return sum(
        p.stat().st_size for p in (path, Path(f"{path}-wal"), Path(f"{path}-shm")) if p.exists()
    )


def test_the_measurement_is_the_files_on_disk(isolated_storage: Path):
    audit.init_store()
    _grow(50)
    with audit_lines() as buffer:
        measured = audit.measure()
    assert measured is not None
    assert measured.bytes == _files_size() > 0
    [line] = size_lines(buffer)
    assert line["level"] == "INFO"
    assert line["audit_db_bytes"] == measured.bytes
    assert line["audit_db_high_water_bytes"] == measured.high_water_bytes >= measured.bytes
    assert line["audit_db_warn_bytes"] == settings.audit_db_warn_bytes


def test_above_the_threshold_it_is_a_warning(isolated_storage: Path, monkeypatch):
    audit.init_store()
    _grow(20)
    monkeypatch.setattr(settings, "audit_db_warn_bytes", 1024)
    with audit_lines() as buffer:
        measured = audit.measure()
    assert measured is not None and measured.over_threshold
    [line] = size_lines(buffer)
    assert line["level"] == "WARNING"
    assert "AUDIT_DB_WARN_BYTES" in line["hint"]


def test_the_default_threshold_is_the_risks_own_trigger():
    from app.config import Settings

    assert Settings.model_fields["audit_db_warn_bytes"].default == 100 * 1024 * 1024


def test_the_high_water_mark_survives_a_smaller_file(isolated_storage: Path):
    """After an archive or a VACUUM the file is smaller; the mark says how large it once was."""
    audit.init_store()
    _grow(300)
    first = audit.measure()
    assert first is not None
    con = sqlite3.connect(database.audit_db_path())
    con.execute("DELETE FROM audit_events")
    con.commit()
    con.execute("VACUUM")
    con.close()
    second = audit.measure()
    assert second is not None
    assert second.bytes < first.bytes
    assert second.high_water_bytes == first.high_water_bytes


def test_measuring_deletes_nothing_and_reads_no_row(isolated_storage: Path, monkeypatch):
    audit.init_store()
    _grow(10)
    statements: list[str] = []
    real_connection = database.audit_connection

    @contextlib.contextmanager
    def spying():
        with real_connection() as connection:
            connection.set_trace_callback(statements.append)
            yield connection

    monkeypatch.setattr(database, "audit_connection", spying)
    audit.measure()
    joined = " ".join(statements).upper()
    assert "AUDIT_EVENTS" not in joined
    assert "DELETE" not in joined and "VACUUM" not in joined
    con = sqlite3.connect(database.audit_db_path())
    assert con.execute("SELECT COUNT(*) FROM audit_events").fetchone() == (10,)
    con.close()


def test_a_measurement_that_cannot_run_never_raises(isolated_storage: Path, monkeypatch):
    @contextlib.contextmanager
    def broken():
        raise sqlite3.OperationalError("unable to open database file")
        yield  # pragma: no cover

    audit.init_store()
    monkeypatch.setattr(database, "audit_connection", broken)
    with audit_lines() as buffer:
        assert audit.measure() is None
    entries = [json.loads(line) for line in buffer.getvalue().splitlines()]
    assert [e["level"] for e in entries] == ["ERROR"]


def test_the_boot_measures(client: TestClient):
    # `client` has already booted; measure through a second boot to read its line.
    from app.main import app

    with audit_lines() as buffer, TestClient(app):
        pass
    assert len(size_lines(buffer)) >= 1


def test_the_timer_measures_again(isolated_storage: Path, monkeypatch):
    audit.init_store()
    calls: list[int] = []
    monkeypatch.setattr(audit, "measure", lambda: calls.append(1))

    async def run() -> None:
        task = asyncio.create_task(audit.watch_size(0.01))
        await asyncio.sleep(0.1)
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task

    asyncio.run(run())
    assert len(calls) >= 3
