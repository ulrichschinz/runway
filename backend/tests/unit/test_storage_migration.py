"""The storage migration CLI (SEC-001, M1.2): dry run, apply, idempotence, refusals, rollback.

Synthetic accounts and synthetic stores in a temp directory only. A "store" here is a
directory with a `.taskrc` and a file standing in for `taskchampion.sqlite3`; whether the real
binary reads a migrated store is the container tier's question.
"""

from __future__ import annotations

import asyncio
import json
import os
import sqlite3
from pathlib import Path

import pytest

from app import task_storage
from app.config import settings
from app.database import init_db
from app.services import storage_migration
from app.services.storage_migration import EX_BLOCKED, EX_OK, EX_USAGE
from app.task_storage import Account

SECRET_TEXT = b"SYNTHETIC-TASK-TEXT-never-printed"


@pytest.fixture
def root(isolated_storage: Path) -> Path:
    asyncio.run(init_db())
    return settings.data_root.resolve()


def _add(username: str, layout: str = "legacy") -> int:
    con = sqlite3.connect(settings.db_path)
    cur = con.execute(
        "INSERT INTO users (username, hashed_password, storage_id, storage_layout)"
        " VALUES (?, 'x', ?, ?)",
        (username, task_storage.new_storage_id(), layout),
    )
    con.commit()
    con.close()
    return int(cur.lastrowid or 0)


def _store(path: Path, text: bytes = SECRET_TEXT) -> Path:
    path.mkdir()
    (path / ".taskrc").write_text("data.location=.\n")
    (path / "taskchampion.sqlite3").write_bytes(text)
    (path / "sub").mkdir()
    return path


def _row(user_id: int) -> sqlite3.Row:
    con = sqlite3.connect(settings.db_path)
    con.row_factory = sqlite3.Row
    try:
        return con.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    finally:
        con.close()


def _protocol() -> list[tuple[int, str, str]]:
    con = sqlite3.connect(settings.db_path)
    try:
        return list(
            con.execute("SELECT user_id, action, reason FROM storage_migrations ORDER BY id")
        )
    finally:
        con.close()


def _tree(root: Path) -> dict[str, bytes | None]:
    out: dict[str, bytes | None] = {}
    for dirpath, dirnames, filenames in os.walk(root):
        for name in dirnames:
            out[str(Path(dirpath, name).relative_to(root))] = None
        for name in filenames:
            path = Path(dirpath, name)
            if path.name.startswith("audit.db"):
                continue
            regular = path.is_file() and not path.is_symlink()
            out[str(path.relative_to(root))] = path.read_bytes() if regular else b"<special>"
    return out


def _run(capsys, *argv: str) -> tuple[int, list[dict]]:
    code = storage_migration.main([*argv, "--json"])
    out = capsys.readouterr().out
    return code, json.loads(out)


def _by_user(entries: list[dict]) -> dict[int, dict]:
    return {e["user_id"]: e for e in entries}


class TestPlanIsADryRun:
    def test_it_changes_nothing_and_prints_no_task_text(self, root, capsys):
        alice = _add("alice")
        _store(root / "alice")
        before_tree, before_row = _tree(root), dict(_row(alice))

        code, entries = _run(capsys, "plan")

        assert code == EX_OK
        assert _tree(root) == before_tree
        assert dict(_row(alice)) == before_row
        assert _protocol() == []
        (entry,) = entries
        assert entry["status"] == "ready"
        assert entry["legacy_path"] == "alice"
        assert entry["target_path"] == _row(alice)["storage_id"]
        assert entry["files"] == 2
        assert set(entry) == {
            "user_id",
            "storage_id",
            "legacy_path",
            "target_path",
            "status",
            "reason",
            "files",
            "bytes",
        }

    def test_the_human_output_carries_no_task_text_either(self, root, capsys):
        _add("alice")
        _store(root / "alice")
        assert storage_migration.main(["plan"]) == EX_OK
        out = capsys.readouterr().out
        assert SECRET_TEXT.decode() not in out
        assert "1 ready" in out

    def test_a_control_character_in_a_name_cannot_reach_the_terminal(self, root, capsys):
        _add("evil\x1b[2J")
        storage_migration.main(["plan"])
        assert "\x1b" not in capsys.readouterr().out


class TestApply:
    def test_it_copies_verifies_switches_and_keeps_the_source(self, root, capsys):
        alice = _add("alice")
        source = _store(root / "alice")
        source_tree = _tree(source)

        code, entries = _run(capsys, "apply")

        assert code == EX_OK
        assert _by_user(entries)[alice]["status"] == "migrated"
        row = _row(alice)
        target = root / row["storage_id"]
        assert row["storage_layout"] == "storage_id"
        assert _tree(target) == source_tree, "same synthetic store before and after"
        assert _tree(source) == source_tree, "the source is never modified"
        assert not task_storage.staging_dir(row["storage_id"]).exists()
        assert [(u, a) for u, a, _ in _protocol()] == [(alice, "migrated")]
        account = Account(alice, "alice", row["storage_id"], row["storage_layout"])
        assert task_storage.resolve(account, "strict").path == target

    def test_a_second_run_changes_nothing(self, root, capsys):
        _add("alice")
        _store(root / "alice")
        _run(capsys, "apply")
        tree, protocol = _tree(root), _protocol()

        code, entries = _run(capsys, "apply")

        assert code == EX_OK
        assert [e["status"] for e in entries] == ["done"]
        assert _tree(root) == tree
        assert _protocol() == protocol

    def test_an_account_without_a_legacy_directory_is_provisioned(self, root, capsys):
        bob = _add("bob")
        code, entries = _run(capsys, "apply")
        assert code == EX_OK
        assert _by_user(entries)[bob]["status"] == "provisioned"
        assert (root / _row(bob)["storage_id"] / ".taskrc").is_file()
        assert not (root / "bob").exists()

    def test_an_interrupted_run_is_completed(self, root, capsys):
        """The rename happened, the database update did not: the next run finishes it."""
        alice = _add("alice")
        source = _store(root / "alice")
        sid = _row(alice)["storage_id"]
        import shutil

        shutil.copytree(source, root / sid)
        (task_storage.staging_dir(sid)).mkdir()  # a stale staging dir from the same crash

        code, entries = _run(capsys, "apply")
        assert code == EX_OK
        assert _by_user(entries)[alice]["status"] == "migrated"
        assert _row(alice)["storage_layout"] == "storage_id"

    def test_a_copy_that_does_not_verify_switches_nothing(self, root, capsys, monkeypatch):
        alice = _add("alice")
        _store(root / "alice")
        real_copy = storage_migration.shutil.copy2

        def lossy(src, dst, **kwargs):
            real_copy(src, dst, **kwargs)
            if str(dst).endswith("taskchampion.sqlite3"):
                Path(dst).write_bytes(b"truncated")

        monkeypatch.setattr(storage_migration.shutil, "copy2", lossy)
        code, entries = _run(capsys, "apply")
        assert code == EX_BLOCKED
        assert (
            _by_user(entries)[alice]["reason"] == "copy did not verify against the source manifest"
        )
        assert _row(alice)["storage_layout"] == "legacy"
        assert not (root / _row(alice)["storage_id"]).exists()

    def test_one_blocked_account_does_not_stop_the_others(self, root, capsys):
        good = _add("alice")
        _store(root / "alice")
        bad = _add("bob")
        _store(root / "bob")
        os.symlink("/etc/passwd", root / "bob" / "sub" / "link")

        code, entries = _run(capsys, "apply")

        assert code == EX_BLOCKED
        assert _by_user(entries)[good]["status"] == "migrated"
        assert _by_user(entries)[bad]["status"] == "blocked"
        assert _row(bad)["storage_layout"] == "legacy"
        assert (bad, "blocked", "tree contains a symlink") in _protocol()


class TestRefusals:
    """Each of these stops that account, visibly, and moves nothing."""

    def _blocked_reason(self, capsys, user_id: int) -> str:
        tree = _tree(settings.data_root.resolve())
        code, entries = _run(capsys, "apply")
        assert code == EX_BLOCKED
        assert _tree(settings.data_root.resolve()) == tree, "nothing may move"
        entry = _by_user(entries)[user_id]
        assert entry["status"] == "blocked"
        assert _row(user_id)["storage_layout"] == "legacy"
        return entry["reason"]

    def test_an_alias_blocks_both_accounts(self, root, capsys):
        alice = _add("alice")
        _store(root / "alice")
        alias = _add("alice/../alice")
        assert self._blocked_reason(capsys, alice) == "alias of another account's directory"
        assert _by_user(_run(capsys, "plan")[1])[alias]["status"] == "blocked"

    def test_a_name_that_escapes_the_root(self, root, capsys):
        evil = _add("../outside")
        (root.parent / "outside").mkdir()
        assert self._blocked_reason(capsys, evil) == "legacy name contains a separator"

    def test_a_legacy_directory_that_is_a_symlink(self, root, capsys, tmp_path):
        alice = _add("alice")
        _store(tmp_path / "elsewhere")
        os.symlink(tmp_path / "elsewhere", root / "alice")
        assert self._blocked_reason(capsys, alice) == "store is a symlink"

    def test_a_hard_linked_file(self, root, capsys, tmp_path):
        alice = _add("alice")
        _store(root / "alice")
        os.link(root / "alice" / ".taskrc", tmp_path / "second-name")
        assert self._blocked_reason(capsys, alice) == "tree contains a hard-linked file"

    def test_a_fifo(self, root, capsys):
        alice = _add("alice")
        _store(root / "alice")
        os.mkfifo(root / "alice" / "pipe")
        assert self._blocked_reason(capsys, alice) == "tree contains a device, FIFO or socket"

    def test_a_target_that_exists_with_other_content(self, root, capsys):
        alice = _add("alice")
        _store(root / "alice")
        _store(root / _row(alice)["storage_id"], text=b"something else")
        assert self._blocked_reason(capsys, alice) == "target exists with different content"

    def test_a_file_not_owned_by_the_service_user(self, root, capsys, monkeypatch):
        alice = _add("alice")
        _store(root / "alice")
        monkeypatch.setattr(storage_migration.os, "geteuid", lambda: os.getuid() + 1)
        assert self._blocked_reason(capsys, alice) == (
            "tree contains an entry not owned by the service user"
        )


class TestRollback:
    def test_an_untouched_migration_goes_back_to_its_legacy_directory(self, root, capsys):
        alice = _add("alice")
        _store(root / "alice")
        _run(capsys, "apply")

        code, (entry,) = _run(capsys, "rollback", "--user-id", str(alice))

        assert code == EX_OK
        assert entry["status"] == "rolled_back"
        row = _row(alice)
        assert row["storage_layout"] == "legacy"
        account = Account(alice, "alice", row["storage_id"], row["storage_layout"])
        assert task_storage.resolve(account, "compat").path == root / "alice"
        assert [a for _, a, _ in _protocol()] == ["migrated", "rolled_back"]
        # and forward again, idempotently, onto the identical copy
        code, entries = _run(capsys, "apply")
        assert code == EX_OK
        assert _by_user(entries)[alice]["status"] == "migrated"

    def test_a_store_written_to_since_the_migration_is_not_rolled_back(self, root, capsys):
        alice = _add("alice")
        _store(root / "alice")
        _run(capsys, "apply")
        (root / _row(alice)["storage_id"] / "taskchampion.sqlite3").write_bytes(b"new task")

        code, (entry,) = _run(capsys, "rollback", "--user-id", str(alice))

        assert code == EX_BLOCKED
        assert entry["reason"].startswith("the new store has been written to")
        assert _row(alice)["storage_layout"] == "storage_id"

    def test_an_account_created_in_the_new_layout_has_nothing_to_go_back_to(self, root, capsys):
        new = _add("new", layout="storage_id")
        _store(root / _row(new)["storage_id"])
        code, (entry,) = _run(capsys, "rollback", "--user-id", str(new))
        assert code == EX_BLOCKED
        assert "no legacy source" in entry["reason"]

    def test_rollback_needs_an_account(self, root, capsys):
        assert storage_migration.main(["rollback"]) == EX_USAGE


class TestTheCommandLine:
    def test_an_unknown_command_is_a_usage_error(self, root, capsys):
        assert storage_migration.main(["delete-everything"]) == EX_USAGE

    def test_a_missing_database_is_a_tooling_error(self, isolated_storage, capsys):
        assert storage_migration.main(["plan"]) == storage_migration.EX_TOOLING
