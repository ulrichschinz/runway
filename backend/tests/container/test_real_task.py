"""Container-tier tests: the REAL Taskwarrior binary.

The unit tier fakes Taskwarrior at the ``task_runner._run`` seam, which covers everything
this repository owns. It cannot cover what the binary itself does — its urgency
algorithm, its date parsing, its argument grammar, and the per-user isolation that rests
entirely on the ``TASKDATA`` environment variable handed to a subprocess.

These tests run only inside ``backend/Dockerfile.test``, where a real ``task`` exists.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

from app.config import settings
from app.models import TaskCreate
from app.services import task_service, user_service

pytestmark = pytest.mark.container


@pytest.fixture(autouse=True)
def real_data_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point the service at a throwaway data root and provision users in it."""
    monkeypatch.setattr(settings, "data_root", tmp_path)
    for name in ("alice", "bob"):
        user_service.init_user_data(name)
    return tmp_path


def _task_dirs(root: Path) -> dict[str, Path]:
    return {name: root / name for name in ("alice", "bob")}


class TestTheBinaryItself:
    def test_taskwarrior_is_present_and_is_version_3(self):
        """The engine assumption, made explicit.

        Taskwarrior 3 replaced the flat-file store with TaskChampion/SQLite. A silent
        downgrade to 2.x would change the storage format under the users' data.
        """
        assert shutil.which("task"), "the task binary is missing from this image"
        task_bin = shutil.which("task")
        version = subprocess.run(  # noqa: S603  # absolute path resolved above
            [task_bin, "--version"], capture_output=True, text=True, timeout=10
        ).stdout.strip()
        assert version.startswith("3."), f"expected Taskwarrior 3.x, got {version!r}"

    def test_the_taskrc_template_is_installed_for_each_user(self, real_data_root):
        for _name, directory in _task_dirs(real_data_root).items():
            taskrc = directory / ".taskrc"
            assert taskrc.is_file()
            assert "urgency.user.tag.next.coefficient" in taskrc.read_text()


class TestRoundTrip:
    def test_a_created_task_can_be_read_back(self):
        created = task_service.create_task("alice", TaskCreate(description="real task"))
        fetched = task_service.get_task("alice", created.uuid)
        assert fetched.description == "real task"
        assert fetched.status == "pending"

    def test_attributes_survive_the_binary(self):
        created = task_service.create_task(
            "alice",
            TaskCreate(description="attributed", project="runway", tags=["next"], priority="H"),
        )
        fetched = task_service.get_task("alice", created.uuid)
        assert fetched.project == "runway"
        assert "next" in fetched.tags
        assert fetched.priority == "H"

    def test_completing_removes_a_task_from_the_pending_list(self):
        created = task_service.create_task("alice", TaskCreate(description="finish me"))
        task_service.complete_task("alice", created.uuid)
        pending = task_service.list_tasks("alice", ["status:pending"])
        assert created.uuid not in [t.uuid for t in pending]


class TestUrgency:
    """Urgency is Taskwarrior's, computed from the checked-in coefficients."""

    def test_the_next_tag_outranks_the_someday_tag(self):
        task_service.create_task("alice", TaskCreate(description="soon", tags=["next"]))
        task_service.create_task("alice", TaskCreate(description="later", tags=["someday"]))
        by_description = {t.description: t.urgency for t in task_service.list_tasks("alice")}
        assert by_description["soon"] > by_description["later"]

    def test_the_list_is_returned_in_descending_urgency_order(self):
        for description, tags in [("c", ["someday"]), ("a", ["next"]), ("b", [])]:
            task_service.create_task("alice", TaskCreate(description=description, tags=tags))
        urgencies = [t.urgency for t in task_service.list_tasks("alice")]
        assert urgencies == sorted(urgencies, reverse=True)

    def test_urgency_is_non_zero_so_the_coefficients_are_actually_loaded(self):
        created = task_service.create_task("alice", TaskCreate(description="u", tags=["next"]))
        assert task_service.get_task("alice", created.uuid).urgency > 10


class TestCrossTenantIsolation:
    """The only boundary between users is three environment variables on a subprocess.

    There is no database row-level check, no ownership column and no second gate. If
    these fail, one user can read or write another user's tasks.
    """

    def test_a_users_tasks_are_invisible_to_another_user(self):
        task_service.create_task("alice", TaskCreate(description="alice private"))
        bob_tasks = [t.description for t in task_service.list_tasks("bob")]
        assert "alice private" not in bob_tasks

    def test_a_task_uuid_from_one_user_cannot_be_read_by_another(self):
        created = task_service.create_task("alice", TaskCreate(description="alice private"))
        with pytest.raises(ValueError, match="Task not found"):
            task_service.get_task("bob", created.uuid)

    def test_each_user_gets_a_separate_store_on_disk(self, real_data_root):
        task_service.create_task("alice", TaskCreate(description="hers"))
        dirs = _task_dirs(real_data_root)
        assert any(dirs["alice"].rglob("*.sqlite3"))

    def test_an_rc_shaped_description_is_stored_as_text(self):
        """FINDING SEC-3, closed against the real binary on 2026-08-25.

        This test used to assert the opposite. The override WAS honoured — confirmed on
        2026-08-05 — and what stopped it being exploitable was an accident of Taskwarrior's
        own grammar: the override consumed the description, so `task add` had no text left
        and refused. A third-party argument parser rejecting the payload for us is not a
        control, and it could change in any release. Taskwarrior 3.5.0 is a different
        version than the one that investigation ran against.

        Now the description travels after `--`, where Taskwarrior stops interpreting
        options. The payload is data.
        """
        task_service.create_task("bob", TaskCreate(description="bob private note"))
        payload = f"rc.data.location={settings.data_root / 'bob'}"

        created = task_service.create_task("alice", TaskCreate(description=payload))
        assert created.description == payload, "the override should be stored verbatim"

        alice = [t.description for t in task_service.list_tasks("alice")]
        assert payload in alice
        assert "bob private note" not in alice, "the store was redirected"

    def test_the_redirect_no_longer_reaches_another_users_store(self, real_data_root):
        """The decisive test, inverted. Alice writes an override naming Bob's directory and
        Bob's store must be untouched — no new file, no new task, nothing."""
        task_service.create_task("bob", TaskCreate(description="bob private note"))
        bob_dir = real_data_root / "bob"
        before = sorted(f.name for f in bob_dir.rglob("*") if f.is_file())

        payload = f"rc.data.location={bob_dir}"
        # Both paths that carry free text: add, and the annotate path that used to be the
        # sharp edge because it applied the override and still returned success.
        alice_task = task_service.create_task("alice", TaskCreate(description=payload))
        task_service.annotate_task("alice", alice_task.uuid, payload)

        after_files = sorted(f.name for f in bob_dir.rglob("*") if f.is_file())
        assert after_files == before, "alice's command touched bob's data directory"

        bob_tasks = [t.description for t in task_service.list_tasks("bob")]
        assert bob_tasks == ["bob private note"]

    def test_an_rc_shaped_annotation_is_stored_as_annotation_text(self):
        """The annotate path was the sharp edge: it returned success while applying the
        override, so a user could run Taskwarrior against another store and get a 200.
        Now the text is text."""
        payload = f"rc.data.location={settings.data_root / 'bob'}"
        created = task_service.create_task("alice", TaskCreate(description="host"))
        task = task_service.annotate_task("alice", created.uuid, payload)
        assert [a.description for a in task.annotations] == [payload]

    def test_annotating_another_users_task_still_fails(self):
        """The uuid is a filter, not free text, so the isolation that always held must
        still hold: alice cannot reach bob's task at all."""
        bob_task = task_service.create_task("bob", TaskCreate(description="bob private note"))
        with pytest.raises((ValueError, RuntimeError)):
            task_service.annotate_task("alice", bob_task.uuid, "sneaky")

        after = task_service.get_task("bob", bob_task.uuid)
        assert after.annotations == []
        assert after.description == "bob private note"

    def test_an_rc_override_embedded_after_real_text_is_inert(self):
        """The old containment argument was that a description is ONE argv token, so the
        whole string became the override's value. That argument is gone — the string is
        text now, whatever its shape — and this asserts the outcome rather than the
        accident."""
        payload = f"rc.data.location={settings.data_root / 'bob'} buy milk"
        created = task_service.create_task("alice", TaskCreate(description=payload))
        assert created.description == payload

    def test_the_choke_point_refuses_an_override_in_a_structural_position(self):
        """Defence in depth, against the real binary: `--` covers free text, and this
        covers the positions that must stay parseable."""
        from app.services import task_runner

        with pytest.raises(task_runner.UnsafeArgument):
            task_runner.export_tasks("alice", [f"rc.data.location={settings.data_root / 'bob'}"])
