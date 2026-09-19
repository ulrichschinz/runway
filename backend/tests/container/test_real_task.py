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


class TestTagsAreAFullSet:
    """`PUT /tasks/{uuid}` against the real binary: the `-tag` modifier and `depends:-uuid`.

    Pins what the unit fake claims about both (see ``tests/fake_task.py``).
    """

    @staticmethod
    def _in(client, headers, view):
        return [t["uuid"] for t in client.get(f"/gtd/{view}", headers=headers).json()]

    @staticmethod
    def _create(client, headers, **body):
        body.setdefault("description", "a task")
        r = client.post("/tasks", json=body, headers=headers)
        assert r.status_code == 201, r.text
        return r.json()

    def test_someday_to_next_moves_the_task(self, real_client):
        client, headers = real_client
        task = self._create(client, headers, description="idea", tags=["someday", "@home"])
        r = client.put(f"/tasks/{task['uuid']}", json={"tags": ["next", "@home"]}, headers=headers)
        assert r.status_code == 200, r.text
        assert sorted(r.json()["tags"]) == ["@home", "next"]
        assert r.json()["description"] == "idea", "a tag token became description text"
        assert task["uuid"] in self._in(client, headers, "next")
        assert task["uuid"] not in self._in(client, headers, "someday")

    def test_the_deltas_move_it_too(self, real_client):
        client, headers = real_client
        task = self._create(client, headers, tags=["someday"])
        r = client.put(
            f"/tasks/{task['uuid']}",
            json={"tags_remove": ["someday"], "tags_add": ["next"]},
            headers=headers,
        )
        assert r.status_code == 200, r.text
        assert r.json()["tags"] == ["next"]

    def test_removing_the_last_tag_puts_the_task_back_in_the_inbox(self, real_client):
        client, headers = real_client
        task = self._create(client, headers, description="unclear", tags=["next"])
        assert task["uuid"] not in self._in(client, headers, "inbox")
        r = client.put(f"/tasks/{task['uuid']}", json={"tags": []}, headers=headers)
        assert r.status_code == 200, r.text
        assert r.json()["tags"] == []
        assert task["uuid"] in self._in(client, headers, "inbox")

    def test_a_legacy_comma_tag_is_split(self):
        """`+@home,@office` is stored as ONE tag; `-@home,@office` removes exactly it."""
        from app.models import TaskModify
        from app.services import task_runner

        task_runner.add_task("alice", ["+@home,@office"], ["legacy"])
        uuid = task_runner.export_latest("alice")[0]["uuid"]
        assert task_service.get_task("alice", uuid).tags == ["@home,@office"]

        task = task_service.modify_task("alice", uuid, TaskModify(tags=["@home", "@office"]))
        assert sorted(task.tags) == ["@home", "@office"]
        assert task.description == "legacy"

    @pytest.mark.parametrize("tag", ["1abc", ".x"])
    def test_the_binary_reads_a_removal_with_a_leading_digit_or_dot_as_text(self, tag):
        """Why EXISTING_TAG_RE refuses these: `-1abc` is not a removal on 3.5.0, it replaces
        the description and keeps the tag. The fake refuses the token for the same reason."""
        from app.services import task_runner

        task_runner.add_task("alice", [f"tags:{tag}"], ["legacy"])
        uuid = task_runner.export_latest("alice")[0]["uuid"]
        task_runner.modify_task("alice", uuid, [f"-{tag}"])
        raw = task_runner.export_tasks("alice", [uuid])[0]
        assert raw["tags"] == [tag]
        assert raw["description"] == f"-{tag}"

    @pytest.mark.parametrize("body", [{"tags_remove": ["1abc"]}, {"tags": ["next"]}])
    def test_a_tag_the_binary_cannot_remove_is_refused_and_nothing_changes(self, real_client, body):
        from app.services import task_runner

        client, headers = real_client
        task_runner.add_task("alice", ["tags:1abc,next"], ["Pay rent"])
        uuid = task_runner.export_latest("alice")[0]["uuid"]
        r = client.put(f"/tasks/{uuid}", json=body, headers=headers)
        assert r.status_code == 400, r.text
        assert "cannot remove tag" in r.text
        task = task_service.get_task("alice", uuid)
        assert task.description == "Pay rent"
        assert sorted(task.tags) == ["1abc", "next"]

    def test_a_dropped_dependency_is_removed_and_the_rest_kept(self):
        from app.models import TaskModify

        a = task_service.create_task("alice", TaskCreate(description="a")).uuid
        b = task_service.create_task("alice", TaskCreate(description="b")).uuid
        c = task_service.create_task("alice", TaskCreate(description="c")).uuid
        task = task_service.create_task("alice", TaskCreate(description="t", depends=[a]))

        task = task_service.modify_task("alice", task.uuid, TaskModify(depends=[a, b]))
        assert sorted(task.depends) == sorted([a, b]), "depends:X must add, not replace"

        task = task_service.modify_task("alice", task.uuid, TaskModify(depends=[b, c]))
        assert sorted(task.depends) == sorted([b, c])

        task = task_service.modify_task("alice", task.uuid, TaskModify(depends=[]))
        assert task.depends == []

    def test_a_future_wait_task_can_be_retagged(self):
        from app.models import TaskModify

        task = task_service.create_task(
            "alice", TaskCreate(description="later", tags=["someday"], wait="2030-01-01")
        )
        task = task_service.modify_task(
            "alice", task.uuid, TaskModify(tags_remove=["someday"], tags_add=["next"])
        )
        assert task.tags == ["next"]


class TestEmptyStringClears:
    """`""` on modify emits `field:`, and the real binary removes the attribute (D7).

    Also pins what the rc 2 mapping rests on: Taskwarrior refuses to strip a recurring task
    of `recur` or `due`, and refuses a date it cannot parse, with exit code 2.
    """

    FULL = {
        "project": "p",
        "priority": "H",
        "due": "2030-01-01",
        "scheduled": "2029-12-01",
        "wait": "2020-01-01",
        "until": "2030-02-01",
    }

    @pytest.mark.parametrize("field", list(FULL))
    def test_each_field_is_cleared_for_real(self, real_client, field):
        client, headers = real_client
        r = client.post("/tasks", json={"description": "full", **self.FULL}, headers=headers)
        assert r.status_code == 201, r.text
        task = r.json()
        assert task[field], f"{field} was not set to begin with"
        r = client.put(f"/tasks/{task['uuid']}", json={field: ""}, headers=headers)
        assert r.status_code == 200, r.text
        assert r.json()[field] is None
        kept = {k for k in self.FULL if k != field and r.json()[k]}
        assert kept == set(self.FULL) - {field}, "clearing one field touched another"
        assert r.json()["description"] == "full"

    def test_create_with_empty_strings_sets_nothing(self, real_client):
        client, headers = real_client
        body = {"description": "bare", **dict.fromkeys(self.FULL, ""), "recur": ""}
        r = client.post("/tasks", json=body, headers=headers)
        assert r.status_code == 201, r.text
        for field in [*self.FULL, "recur"]:
            assert r.json()[field] is None, field

    def test_clearing_recur_on_a_plain_task_is_a_no_op(self, real_client):
        client, headers = real_client
        task = client.post("/tasks", json={"description": "plain"}, headers=headers).json()
        r = client.put(f"/tasks/{task['uuid']}", json={"recur": ""}, headers=headers)
        assert r.status_code == 200, r.text
        assert r.json()["recur"] is None

    @pytest.mark.parametrize("field", ["recur", "due"])
    def test_a_recurring_task_cannot_lose_recur_or_due(self, field):
        from app.models import TaskModify

        task_service.create_task(
            "alice", TaskCreate(description="rent", recur="monthly", due="2030-01-01")
        )
        instance = task_service.list_tasks("alice", ["status:pending"])[0]
        assert instance.recur == "monthly"
        with pytest.raises(ValueError, match="recurring task"):
            task_service.modify_task("alice", instance.uuid, TaskModify(**{field: ""}))

    def test_an_unparseable_date_is_a_rejection_that_names_no_path(self, real_data_root):
        from app.services import task_runner

        with pytest.raises(task_runner.TaskwarriorRejected) as exc:
            task_service.create_task("alice", TaskCreate(description="t", due="notadate"))
        assert "notadate" in str(exc.value)
        assert str(real_data_root) not in str(exc.value)
        assert "/" not in str(exc.value)

    def test_an_unparseable_date_is_a_400_over_http(self, real_client):
        client, headers = real_client
        r = client.post("/tasks", json={"description": "t", "due": "notadate"}, headers=headers)
        assert r.status_code == 400, r.text
        assert "not a valid date" in r.json()["detail"]


class TestRecurringInstances:
    """Modifying one instance of a recurring task asks "modify all pending recurrences?"
    unless `rc.recurrence.confirmation=no`; on a terminal it waited for the 10 s timeout."""

    def test_an_instance_is_retagged_alone_and_quickly(self, real_client):
        import datetime
        import time

        from app.services import task_runner

        client, headers = real_client
        start = (datetime.date.today() - datetime.timedelta(days=15)).isoformat()
        r = client.post(
            "/tasks",
            json={"description": "water plants", "recur": "weekly", "due": start},
            headers=headers,
        )
        assert r.status_code == 201, r.text
        # Any report generates the instances; the pending export is one.
        instances = [
            t for t in task_service.list_tasks("alice", ["status:pending"]) if t.recur == "weekly"
        ]
        assert len(instances) >= 2, "expected several generated instances"
        parent_before = task_runner.export_tasks("alice", ["status:recurring"])
        assert len(parent_before) == 1

        target = instances[0].uuid
        began = time.monotonic()
        r = client.put(f"/tasks/{target}", json={"tags_add": ["next"]}, headers=headers)
        elapsed = time.monotonic() - began
        assert r.status_code == 200, r.text
        assert elapsed < 2, f"modify took {elapsed:.1f}s: a confirmation prompt waited"
        assert r.json()["tags"] == ["next"]

        parent_after = task_runner.export_tasks("alice", ["status:recurring"])
        assert parent_after[0].get("tags", []) == parent_before[0].get("tags", [])
        others = [
            t
            for t in task_service.list_tasks("alice", ["status:pending"])
            if t.recur == "weekly" and t.uuid != target
        ]
        assert others and all("next" not in t.tags for t in others)


class TestListSemantics:
    """What the GTD lists mean on the real binary (ADR 0036).

    A future `wait` hides a task: `status:pending` no longer matches it, `status:waiting` and
    `+WAITING` do, and its export still says "pending". Every list used to filter on
    `status:pending` alone, so a +waiting task with a future wait vanished from `/gtd/waiting`
    and a project whose only task was parked vanished from `/gtd/projects`. The inbox used
    `-project`, which on 3.5 means "not tagged `project`", so untagged project tasks landed in
    the inbox.
    """

    FUTURE = "2030-06-01"
    PAST = "2020-01-01"

    @staticmethod
    def _create(client, headers, **body):
        body.setdefault("description", "a task")
        r = client.post("/tasks", json=body, headers=headers)
        assert r.status_code == 201, r.text
        return r.json()

    @staticmethod
    def _names(client, headers, path):
        r = client.get(path, headers=headers)
        assert r.status_code == 200, r.text
        return [t["description"] for t in r.json()]

    def test_the_inbox_excludes_an_untagged_project_task(self, real_client):
        """The D1 regression: `-project` let this task into the inbox."""
        client, headers = real_client
        self._create(client, headers, description="loose")
        self._create(client, headers, description="planned", project="alpha")
        self._create(client, headers, description="tagged", tags=["next"])
        assert self._names(client, headers, "/gtd/inbox") == ["loose"]

    def test_a_future_wait_hides_a_task_from_every_visible_list(self, real_client):
        client, headers = real_client
        self._create(client, headers, description="inbox later", wait=self.FUTURE)
        self._create(client, headers, description="next later", tags=["next"], wait=self.FUTURE)
        self._create(
            client, headers, description="someday later", tags=["someday"], wait=self.FUTURE
        )
        self._create(client, headers, description="alpha later", project="alpha", wait=self.FUTURE)
        self._create(client, headers, description="alpha now", project="alpha")
        assert self._names(client, headers, "/gtd/inbox") == []
        assert self._names(client, headers, "/gtd/next") == []
        assert self._names(client, headers, "/gtd/someday") == []
        assert self._names(client, headers, "/gtd/projects/alpha") == ["alpha now"]

    def test_a_past_wait_shows_the_task_normally(self, real_client):
        client, headers = real_client
        self._create(client, headers, description="back", wait=self.PAST)
        self._create(client, headers, description="back next", tags=["next"], wait=self.PAST)
        assert self._names(client, headers, "/gtd/inbox") == ["back"]
        assert self._names(client, headers, "/gtd/next") == ["back next"]
        assert self._names(client, headers, "/gtd/tickler") == []

    def test_waiting_includes_a_waiting_task_with_a_future_wait(self, real_client):
        client, headers = real_client
        self._create(client, headers, description="reply due", tags=["waiting"])
        self._create(client, headers, description="reply later", tags=["waiting"], wait=self.FUTURE)
        self._create(client, headers, description="parked", wait=self.FUTURE)
        assert sorted(self._names(client, headers, "/gtd/waiting")) == ["reply due", "reply later"]

    def test_a_project_whose_only_task_is_hidden_is_still_listed(self, real_client):
        client, headers = real_client
        self._create(client, headers, description="parked", project="dormant", wait=self.FUTURE)
        assert "dormant" in client.get("/gtd/projects", headers=headers).json()

    def test_the_tickler_lists_hidden_tasks_soonest_first(self, real_client):
        """Across month and year boundaries, and whatever the urgency says."""
        client, headers = real_client
        self._create(client, headers, description="jan 2031", wait="2031-01-05")
        self._create(client, headers, description="dec 2030", tags=["next"], wait="2030-12-31")
        self._create(client, headers, description="feb 2030", priority="L", wait="2030-02-01")
        self._create(client, headers, description="visible")
        self._create(client, headers, description="over", wait=self.PAST)
        r = client.get("/gtd/tickler", headers=headers)
        assert r.status_code == 200, r.text
        assert [t["description"] for t in r.json()] == ["feb 2030", "dec 2030", "jan 2031"]
        assert {t["status"] for t in r.json()} == {"pending"}, "status stays Taskwarrior's"

    def test_a_future_scheduled_date_does_not_hide_a_task(self, real_client):
        client, headers = real_client
        self._create(client, headers, description="start later", scheduled=self.FUTURE)
        assert self._names(client, headers, "/gtd/inbox") == ["start later"]
        assert self._names(client, headers, "/gtd/tickler") == []

    def test_a_recurring_task_without_a_due_date_is_refused(self, real_client):
        client, headers = real_client
        with pytest.raises(ValueError, match="due"):
            task_service.create_task("alice", TaskCreate(description="r", recur="weekly"))
        r = client.post("/tasks", json={"description": "r", "recur": "weekly"}, headers=headers)
        assert r.status_code == 400, r.text


class TestWhatTheFakeClaims:
    """Each claim ``tests/fake_task.py`` makes about the binary, pinned against the binary.

    Written against `task_runner` directly, so the filter tokens are exactly the ones the fake
    interprets; the unit tier trusts the fake only as far as this class reaches.
    """

    @staticmethod
    def _add(mods, text="t"):
        from app.services import task_runner

        task_runner.add_task("alice", mods, [text])
        return task_runner.export_latest("alice")[0]

    @staticmethod
    def _descriptions(filters):
        from app.services import task_runner

        return sorted(t["description"] for t in task_runner.export_tasks("alice", filters))

    def test_hidden_is_status_waiting_and_plus_waiting_yet_exports_pending(self):
        hidden = self._add(["wait:2030-01-01"], "hidden")
        self._add([], "visible")
        assert hidden["status"] == "pending"
        assert self._descriptions(["status:pending"]) == ["visible"]
        assert self._descriptions(["status:waiting"]) == ["hidden"]
        assert self._descriptions(["+WAITING"]) == ["hidden"]
        assert self._descriptions(task_service.OPEN) == ["hidden", "visible"]

    def test_project_colon_is_a_prefix_match_and_project_is_exact(self):
        for project in ("alpha", "alpha.sub", "alphabet", "beta"):
            self._add([f"project:{project}"], project)
        self._add([], "none")
        assert self._descriptions(["project:alpha"]) == ["alpha", "alpha.sub", "alphabet"]
        assert self._descriptions(["project.is:alpha"]) == ["alpha"]
        assert self._descriptions(["project:"]) == ["none"]

    def test_minus_word_excludes_a_tag_and_minus_project_is_not_the_project(self):
        self._add(["+foo"], "foo")
        self._add(["project:p"], "in p")
        self._add([], "plain")
        assert self._descriptions(["-foo"]) == ["in p", "plain"]
        assert self._descriptions(["-project"]) == ["foo", "in p", "plain"]
        assert self._descriptions(["-TAGGED"]) == ["in p", "plain"]

    def test_completed_and_the_all_group(self):
        from app.services import task_runner

        done = self._add([], "done")
        gone = self._add([], "gone")
        self._add(["wait:2030-01-01"], "hidden")
        task_runner.done_task("alice", done["uuid"])
        task_runner.delete_task("alice", gone["uuid"])
        assert self._descriptions(["status:completed"]) == ["done"]
        all_group = ["(", "status:pending", "or", "status:waiting", "or", "status:completed", ")"]
        assert self._descriptions(all_group) == ["done", "hidden"]

    def test_done_and_delete_set_end(self):
        from app.services import task_runner

        done = self._add([], "done")
        gone = self._add([], "gone")
        task_runner.done_task("alice", done["uuid"])
        task_runner.delete_task("alice", gone["uuid"])
        for uuid in (done["uuid"], gone["uuid"]):
            assert task_runner.export_tasks("alice", [uuid])[0]["end"]

    @pytest.mark.parametrize(
        "value,stored",
        [
            ("2030-01-01", "20300101T000000Z"),
            ("2030-01-01T10:30", "20300101T103000Z"),
            ("20300101T120000Z", "20300101T120000Z"),
        ],
    )
    def test_the_date_forms_the_fake_accepts(self, value, stored):
        """Under TZ=UTC, which is what the shipped image runs and what the fake assumes."""
        for field in ("due", "scheduled", "wait", "until"):
            task = self._add([f"{field}:{value}"], field)
            assert task[field] == stored, field

    def test_a_bad_priority_is_a_rejection(self):
        from app.services import task_runner

        with pytest.raises(task_runner.TaskwarriorRejected, match="priority"):
            task_runner.add_task("alice", ["priority:X"], ["t"])

    def test_a_tag_with_a_leading_digit_becomes_text(self):
        """Why the fake refuses `+1abc` rather than storing it as a tag."""
        task = self._add(["+1abc"], "t")
        assert task.get("tags", []) == []
