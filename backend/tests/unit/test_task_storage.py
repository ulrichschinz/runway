"""The storage resolver on its own: what it accepts, what it refuses, and why (SEC-001)."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app import task_storage
from app.config import settings
from app.task_storage import (
    LAYOUT_LEGACY,
    LAYOUT_STORAGE_ID,
    MODE_COMPAT,
    MODE_STRICT,
    Account,
    StorageRefused,
    TaskStore,
)

SID = "0123456789abcdef0123456789abcdef"


@pytest.fixture
def root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    data = tmp_path / "data"
    data.mkdir()
    monkeypatch.setattr(settings, "data_root", data)
    return data.resolve()


def _account(username: str = "alice", sid: str = SID, layout: str = LAYOUT_STORAGE_ID) -> Account:
    return Account(id=1, username=username, storage_id=sid, storage_layout=layout)


class TestStorageIds:
    def test_a_new_id_is_32_lower_hex_and_never_repeats(self):
        ids = {task_storage.new_storage_id() for _ in range(1000)}
        assert len(ids) == 1000
        assert all(task_storage.is_storage_id(i) for i in ids)

    @pytest.mark.parametrize(
        "value",
        ["", "..", "../" + SID[3:], SID.upper(), SID[:-1], SID + "0", SID[:-1] + "/", None, 7],
    )
    def test_anything_else_is_not_an_id(self, value):
        assert not task_storage.is_storage_id(value)

    def test_a_malformed_id_never_becomes_a_path(self, root):
        with pytest.raises(StorageRefused, match="unavailable"):
            task_storage.storage_dir("../" + SID[3:])


class TestTheStorageIdLayout:
    def test_resolves_to_the_direct_child_named_by_the_id(self, root):
        (root / SID).mkdir()
        store = task_storage.resolve(_account("../../etc"), MODE_STRICT)
        assert store == TaskStore(root / SID, "../../etc")
        assert store.taskrc == root / SID / ".taskrc"

    def test_the_username_plays_no_part(self, root):
        (root / SID).mkdir()
        (root / "alice").mkdir()
        for name in ("alice", "alice/../alice", "/etc", "..", "bob"):
            assert task_storage.resolve(_account(name), MODE_COMPAT).path == root / SID

    def test_a_missing_store_is_refused(self, root):
        with pytest.raises(StorageRefused) as refused:
            task_storage.resolve(_account(), MODE_COMPAT)
        assert refused.value.reason == "store does not exist"

    def test_a_symlinked_store_is_refused_even_when_it_points_inside(self, root):
        (root / "elsewhere").mkdir()
        os.symlink(root / "elsewhere", root / SID)
        with pytest.raises(StorageRefused) as refused:
            task_storage.resolve(_account(), MODE_COMPAT)
        assert refused.value.reason == "store is a symlink"

    def test_a_file_where_the_store_should_be_is_refused(self, root):
        (root / SID).write_text("not a directory")
        with pytest.raises(StorageRefused) as refused:
            task_storage.resolve(_account(), MODE_COMPAT)
        assert refused.value.reason == "store is not a directory"

    def test_an_unknown_layout_is_refused(self, root):
        with pytest.raises(StorageRefused):
            task_storage.resolve(_account(layout="something"), MODE_COMPAT)

    def test_a_symlinked_data_root_is_resolved_first(self, tmp_path, monkeypatch):
        real = tmp_path / "real"
        (real / SID).mkdir(parents=True)
        os.symlink(real, tmp_path / "link")
        monkeypatch.setattr(settings, "data_root", tmp_path / "link")
        assert task_storage.resolve(_account(), MODE_STRICT).path == real.resolve() / SID


class TestTheLegacyLayout:
    def test_strict_mode_refuses_every_legacy_account(self, root):
        (root / "alice").mkdir()
        with pytest.raises(StorageRefused) as refused:
            task_storage.resolve(_account(layout=LAYOUT_LEGACY), MODE_STRICT)
        assert refused.value.reason == "legacy layout refused in strict mode"

    def test_compat_mode_serves_a_safe_name_from_its_old_directory(self, root):
        (root / "alice").mkdir()
        store = task_storage.resolve(_account(layout=LAYOUT_LEGACY), MODE_COMPAT)
        assert store.path == root / "alice"

    @pytest.mark.parametrize(
        "name",
        [
            "alice/../alice",
            "./alice",
            "../victim",
            ".",
            "..",
            "",
            "/abs/path",
            "alice\\..\\alice",
            "a/b",
            "al\x00ice",
            "al\nice",
            "alicé",
            ".hidden",
            "audit.db",
            SID,
        ],
    )
    def test_compat_mode_refuses_a_name_that_is_not_one_plain_component(self, root, name):
        (root / "alice").mkdir()
        with pytest.raises(StorageRefused):
            task_storage.resolve(_account(name, layout=LAYOUT_LEGACY), MODE_COMPAT)

    def test_compat_mode_refuses_a_legacy_symlink(self, root, tmp_path):
        (tmp_path / "outside").mkdir()
        os.symlink(tmp_path / "outside", root / "alice")
        with pytest.raises(StorageRefused) as refused:
            task_storage.resolve(_account(layout=LAYOUT_LEGACY), MODE_COMPAT)
        assert refused.value.reason == "store is a symlink"


class TestTheMode:
    @pytest.mark.parametrize(
        ("configured", "expected"),
        [
            ("compat", MODE_COMPAT),
            ("strict", MODE_STRICT),
            (" Strict ", MODE_STRICT),
            ("", MODE_STRICT),
            ("legacy", MODE_STRICT),
            ("off", MODE_STRICT),
        ],
    )
    def test_anything_unrecognised_fails_closed(self, monkeypatch, configured, expected):
        monkeypatch.setattr(settings, "task_storage_mode", configured)
        assert task_storage.storage_mode() == expected

    def test_the_default_is_compat(self):
        from app.config import Settings

        assert Settings().task_storage_mode == MODE_COMPAT


class TestTheUsernameRule:
    @pytest.mark.parametrize(
        "name", ["alice", "Alice Smith", "bob.dev", "émile", "a" * 64, "x-1_2"]
    )
    def test_plain_names_are_accepted(self, name):
        assert task_storage.username_problem(name) is None

    @pytest.mark.parametrize(
        "name",
        [
            "",
            "a" * 65,
            " alice",
            "alice ",
            "alicé",
            "al\x07ice",
            "al​ice",
            "a/b",
            "a\\b",
            ".",
            "..",
            "../victim",
        ],
    )
    def test_anything_else_is_refused_with_a_reason(self, name):
        assert task_storage.username_problem(name)
