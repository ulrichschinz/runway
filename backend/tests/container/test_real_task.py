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

    def test_a_description_shaped_like_a_config_override_cannot_redirect_the_data_store(self):
        """FINDING SEC-3, adversarially tested against the real binary.

        Taskwarrior consumes ``rc.<key>=<value>`` anywhere in its argument list as a
        runtime configuration override, and ``task_runner._run`` places user-supplied
        tokens AFTER its own ``rc.`` flags. A task description is a bare positional
        argument and is not validated.

        If the binary treats such a description as an override rather than as text, then
        ``rc.data.location`` redirects the store and the only cross-tenant boundary in
        this system is bypassable by typing a task title.

        A failure here is a confirmed critical vulnerability, not a flaky test.
        """
        task_service.create_task("bob", TaskCreate(description="bob private note"))

        payload = f"rc.data.location={settings.data_root / 'bob'}"
        task_service.create_task("alice", TaskCreate(description=payload))

        alice_tasks = [t.description for t in task_service.list_tasks("alice")]
        assert "bob private note" not in alice_tasks, (
            "SEC-3 CONFIRMED: a task description containing rc.data.location redirected "
            "the Taskwarrior data store and exposed another user's tasks"
        )

    def test_an_annotation_shaped_like_a_config_override_is_also_contained(self):
        created = task_service.create_task("alice", TaskCreate(description="host"))
        task_service.annotate_task(
            "alice", created.uuid, f"rc.data.location={settings.data_root / 'bob'}"
        )
        task_service.create_task("bob", TaskCreate(description="bob second note"))
        alice_tasks = [t.description for t in task_service.list_tasks("alice")]
        assert "bob second note" not in alice_tasks
