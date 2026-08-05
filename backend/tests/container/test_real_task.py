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

    def test_an_rc_shaped_description_is_consumed_as_configuration_not_as_text(self):
        """FINDING SEC-3, resolved against the real binary on 2026-08-05.

        Taskwarrior consumes ``rc.<key>=<value>`` anywhere in its argument list as a
        runtime configuration override, and ``task_runner._run`` places user-supplied
        tokens AFTER its own ``rc.`` flags. A description is a bare, unvalidated argv
        token, so the override IS honoured — this test proves it.

        What saves the system today is an accident of Taskwarrior's own grammar, not any
        control in this repository: the description is a single argv token, so an override
        consumes the whole of it and ``task add`` then has no text left and refuses. The
        attacker gets a redirected data store on a command that cannot run.

        That is a confirmed injection mechanism whose only reachable exploit path happens
        to be blocked. Step 12 still validates at the ``_run`` choke point, because
        "a third-party binary's argument parser rejects it for us" is not a security
        boundary anyone should rely on.
        """
        task_service.create_task("bob", TaskCreate(description="bob private note"))
        payload = f"rc.data.location={settings.data_root / 'bob'}"

        with pytest.raises(RuntimeError, match="Additional text must be provided"):
            task_service.create_task("alice", TaskCreate(description=payload))

    def test_the_rejected_override_leaks_nothing_and_creates_nothing(self):
        """The other half: the failed command must not leave state behind either."""
        task_service.create_task("bob", TaskCreate(description="bob private note"))
        payload = f"rc.data.location={settings.data_root / 'bob'}"

        with pytest.raises(RuntimeError):
            task_service.create_task("alice", TaskCreate(description=payload))

        alice_tasks = [t.description for t in task_service.list_tasks("alice")]
        assert alice_tasks == [], "the rejected command left a task behind"
        assert "bob private note" not in alice_tasks

    def test_an_rc_shaped_annotation_succeeds_silently_rather_than_failing(self):
        """The annotate path behaves DIFFERENTLY from add, and this is the sharp edge.

        `task add` refuses when an override eats the description, so the caller gets an
        error. `task <uuid> annotate` with the same shape returns success: the override is
        applied, the command runs against whatever data store it names, matches nothing,
        and reports nothing wrong.

        So a user can make this service run Taskwarrior against another user's data
        directory and get a 200 back. Whether anything can be read or written through that
        redirect is the next two tests.
        """
        created = task_service.create_task("alice", TaskCreate(description="host"))
        task = task_service.annotate_task(
            "alice", created.uuid, f"rc.data.location={settings.data_root / 'bob'}"
        )
        assert task.annotations == [], (
            "the override was consumed as configuration, so no annotation text remained"
        )

    def test_the_redirect_reaches_the_other_users_store_but_cannot_write_to_it(self):
        """The decisive test for SEC-3, and the error IS the evidence.

        Alice annotates using BOB's task UUID while redirecting the data store to Bob's
        directory. Contrast the two outcomes:

        * redirect + a UUID that matches nothing there -> succeeds silently (previous test)
        * redirect + a UUID that DOES match -> "Additional text must be provided"

        The second only happens if Taskwarrior opened Bob's store and found Bob's task.
        So the redirect is real and it reaches another user's data. The write is stopped
        one step later, because the override consumed the annotation text that the write
        requires — again the grammar, not a control in this repository.

        Nothing is written, which is why this asserts the error and then checks Bob's task
        is untouched.
        """
        bob_task = task_service.create_task("bob", TaskCreate(description="bob private note"))

        with pytest.raises(RuntimeError, match="Additional text must be provided"):
            task_service.annotate_task(
                "alice", bob_task.uuid, f"rc.data.location={settings.data_root / 'bob'}"
            )

        after = task_service.get_task("bob", bob_task.uuid)
        assert after.annotations == [], (
            "SEC-3 ESCALATION: a redirected data store allowed one user to write into "
            "another user's task"
        )
        assert after.description == "bob private note"

    def test_the_redirect_cannot_read_another_users_store(self):
        """And the read direction: no user-controlled token reaches a filter position.

        Export filters are fixed strings chosen by the routers, and the one
        user-influenced filter is prefixed (`description:...`), so it can never be parsed
        as an `rc.` override.
        """
        task_service.create_task("bob", TaskCreate(description="bob private note"))
        created = task_service.create_task("alice", TaskCreate(description="alice note"))
        task_service.annotate_task(
            "alice", created.uuid, f"rc.data.location={settings.data_root / 'bob'}"
        )

        alice_tasks = [t.description for t in task_service.list_tasks("alice")]
        assert "bob private note" not in alice_tasks
        assert "alice note" in alice_tasks

    def test_an_rc_override_embedded_after_real_text_is_still_one_token(self):
        """A description is ONE argv element, which is what keeps this contained.

        `task add "rc.data.location=/x buy milk"` does not become an override plus a
        description: the whole string is the override's value. If any future change ever
        splits a description into multiple argv tokens, this containment disappears —
        which is the regression this test exists to catch.
        """
        payload = f"rc.data.location={settings.data_root / 'bob'} buy milk"
        with pytest.raises(RuntimeError, match="Additional text must be provided"):
            task_service.create_task("alice", TaskCreate(description=payload))
