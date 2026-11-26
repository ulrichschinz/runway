"""The volume-ownership migration: dry-run first, targeted, never through a link.

`ops/deploy/volume_ownership.py` is what an operator runs on the deploy host before the backend
stops running as uid 0 (brief 0076, ADR 0048). It changes the owner and mode of files that hold
every account's tasks and credentials, as root, so the tests are about what it must NOT do as
much as what it does: it must not change anything in a dry-run, must not follow a symlink or a
hard link out of the two roots it was given, must refuse to apply anything while an anomaly is
present, and must not act on a file that was swapped between the plan and the change.

The tests chown to the test process's own uid and gid, which an unprivileged user may do to its
own files. The real migration targets 10001; the dry-run tests cover a foreign target too,
because planning needs no privilege.
"""

from __future__ import annotations

import importlib.util
import json
import os
import stat
import sys
from pathlib import Path

import pytest

TOOL = Path(__file__).resolve().parents[3] / "ops" / "deploy" / "volume_ownership.py"


def _load():
    spec = importlib.util.spec_from_file_location("volume_ownership", TOOL)
    assert spec is not None and spec.loader is not None, f"{TOOL} is missing"
    module = importlib.util.module_from_spec(spec)
    sys.modules["volume_ownership"] = module
    spec.loader.exec_module(module)
    return module


vo = _load()

UID = os.getuid()
GID = os.getgid()


def _mode(path: Path) -> int:
    return stat.S_IMODE(os.lstat(path).st_mode)


@pytest.fixture
def layout(tmp_path: Path) -> dict[str, Path]:
    """The deploy host's layout as the container sees it, with the default umask's modes."""
    data = tmp_path / "data"
    db_dir = tmp_path / "db"
    (data / "alice").mkdir(parents=True)
    (data / "bob").mkdir()
    db_dir.mkdir()
    for f in (
        data / "audit.db",
        data / "alice" / "taskchampion.sqlite3",
        data / "alice" / ".taskrc",
        data / "bob" / ".taskrc",
        db_dir / "users.db",
        db_dir / "users.db-journal",
    ):
        f.write_bytes(b"x")
        f.chmod(0o644)
    for d in (data, data / "alice", data / "bob", db_dir):
        d.chmod(0o755)
    outside = tmp_path / "outside"
    outside.write_bytes(b"not ours")
    outside.chmod(0o644)
    return {"data": data, "db": db_dir / "users.db", "outside": outside, "tmp": tmp_path}


def _plan(layout, uid=UID, gid=GID):
    return vo.plan(layout["data"], layout["db"], uid, gid)


def _snapshot(root: Path) -> dict[str, tuple[int, int, int]]:
    out = {}
    for dirpath, dirnames, filenames in os.walk(root):
        for name in [*dirnames, *filenames, ""]:
            p = Path(dirpath) / name if name else Path(dirpath)
            st = os.lstat(p)
            out[str(p)] = (st.st_uid, st.st_gid, stat.S_IMODE(st.st_mode))
    return out


class TestDryRun:
    def test_it_plans_every_entry_of_both_roots_and_changes_nothing(self, layout):
        before = _snapshot(layout["tmp"])
        result = _plan(layout)
        assert result.anomalies == []
        planned = {c.path for c in result.changes}
        assert planned == {
            str(layout["data"]),
            str(layout["data"] / "alice"),
            str(layout["data"] / "bob"),
            str(layout["data"] / "audit.db"),
            str(layout["data"] / "alice" / "taskchampion.sqlite3"),
            str(layout["data"] / "alice" / ".taskrc"),
            str(layout["data"] / "bob" / ".taskrc"),
            str(layout["db"].parent),
            str(layout["db"]),
            str(layout["db"].parent / "users.db-journal"),
        }
        assert _snapshot(layout["tmp"]) == before

    def test_the_target_modes_are_owner_only(self, layout):
        modes = {c.path: c.new_mode for c in _plan(layout).changes}
        assert modes[str(layout["data"])] == 0o700
        assert modes[str(layout["data"] / "alice" / ".taskrc")] == 0o600
        assert modes[str(layout["db"])] == 0o600

    def test_a_foreign_target_uid_is_planned_without_privilege(self, layout):
        result = _plan(layout, uid=10001, gid=10001)
        assert result.anomalies == []
        assert all((c.new_uid, c.new_gid) == (10001, 10001) for c in result.changes)

    def test_the_cli_dry_run_exits_1_and_changes_nothing(self, layout, capsys):
        before = _snapshot(layout["tmp"])
        code = vo.main(_argv(layout))
        assert code == vo.EXIT_PENDING
        assert _snapshot(layout["tmp"]) == before
        assert "dry-run" in capsys.readouterr().out

    def test_json_output_is_one_parseable_document(self, layout, capsys):
        vo.main([*_argv(layout), "--json"])
        doc = json.loads(capsys.readouterr().out)
        assert doc["mode"] == "dry-run"
        assert doc["anomalies"] == []
        assert len(doc["changes"]) == 10


def _argv(layout, *extra):
    return [
        "--data-root",
        str(layout["data"]),
        "--db-path",
        str(layout["db"]),
        "--uid",
        str(UID),
        "--gid",
        str(GID),
        *extra,
    ]


class TestApply:
    def test_apply_converges_and_a_second_run_is_clean(self, layout):
        assert vo.main(_argv(layout, "--apply")) == vo.EXIT_CLEAN
        assert _mode(layout["data"]) == 0o700
        assert _mode(layout["data"] / "alice" / "taskchampion.sqlite3") == 0o600
        assert _mode(layout["db"]) == 0o600
        assert _plan(layout).changes == []
        assert vo.main(_argv(layout)) == vo.EXIT_CLEAN
        assert vo.main(_argv(layout, "--apply")) == vo.EXIT_CLEAN

    def test_apply_never_touches_a_path_outside_the_two_roots(self, layout):
        vo.main(_argv(layout, "--apply"))
        assert _mode(layout["outside"]) == 0o644

    def test_a_file_swapped_after_planning_is_refused_not_changed(self, layout):
        result = _plan(layout)
        target = layout["data"] / "alice" / ".taskrc"
        replacement = layout["tmp"] / "replacement"
        replacement.write_bytes(b"swapped in")
        replacement.chmod(0o644)
        os.replace(replacement, target)
        errors = vo.apply(result)
        assert any(str(target) in e for e in errors)
        assert _mode(target) == 0o644


class TestAnomaliesRefuseApply:
    """Every case that could carry a change out of the roots stops the whole apply."""

    def _assert_refused(self, layout):
        before = _snapshot(layout["tmp"])
        assert vo.main(_argv(layout, "--apply")) == vo.EXIT_ANOMALY
        assert _snapshot(layout["tmp"]) == before

    def test_a_symlink_to_a_file_outside(self, layout):
        (layout["data"] / "alice" / "evil").symlink_to(layout["outside"])
        assert any("symlink" in a.reason for a in _plan(layout).anomalies)
        self._assert_refused(layout)

    def test_a_symlinked_account_directory(self, layout):
        (layout["data"] / "carol").symlink_to(layout["tmp"], target_is_directory=True)
        assert any("symlink" in a.reason for a in _plan(layout).anomalies)
        self._assert_refused(layout)

    def test_a_hard_link_to_a_file_outside(self, layout):
        os.link(layout["outside"], layout["data"] / "alice" / "linked")
        assert any("hard link" in a.reason for a in _plan(layout).anomalies)
        self._assert_refused(layout)

    def test_a_fifo(self, layout):
        os.mkfifo(layout["data"] / "alice" / "pipe")
        assert any("not a regular file" in a.reason for a in _plan(layout).anomalies)
        self._assert_refused(layout)

    def test_an_entry_deeper_than_an_account_directory(self, layout):
        (layout["data"] / "alice" / "sub").mkdir()
        assert any("deeper" in a.reason for a in _plan(layout).anomalies)
        self._assert_refused(layout)

    def test_an_unexpected_file_beside_the_database(self, layout):
        (layout["db"].parent / "notes.txt").write_bytes(b"?")
        assert any("unexpected" in a.reason for a in _plan(layout).anomalies)
        self._assert_refused(layout)


class TestRootsAreResolvedBeforeAnything:
    def test_a_relative_root_is_refused(self, layout):
        with pytest.raises(vo.RootError):
            vo.plan(Path("data"), layout["db"], UID, GID)

    def test_the_filesystem_root_is_refused(self, layout):
        with pytest.raises(vo.RootError):
            vo.plan(Path("/"), layout["db"], UID, GID)

    def test_a_root_reached_through_a_symlink_is_refused(self, layout):
        link = layout["tmp"] / "data-link"
        link.symlink_to(layout["data"], target_is_directory=True)
        with pytest.raises(vo.RootError):
            vo.plan(link, layout["db"], UID, GID)

    def test_nested_roots_are_refused(self, layout):
        inner = layout["data"] / "alice" / "taskchampion.sqlite3"
        with pytest.raises(vo.RootError):
            vo.plan(layout["data"], inner, UID, GID)

    def test_the_cli_reports_a_bad_root_as_exit_3(self, layout):
        argv = _argv(layout)
        argv[1] = "relative/data"
        assert vo.main(argv) == vo.EXIT_USAGE
