"""Characterization tests for argv construction — the Taskwarrior boundary.

These assert what reaches `task_runner._run`, which is the argument vector handed to the
`task` binary. They exist mainly to make finding SEC-3 concrete and to make Step 12's
hardening show up as a visible behaviour change rather than a silent one.

`shell=False` with an argv list is already correct: no shell metacharacter can start a
new process. The open question is different — Taskwarrior interprets its OWN arguments,
and `rc.<key>=<value>` anywhere in the list overrides configuration at runtime.
"""

import pytest

from app.models import TaskCreate, TaskModify
from app.services import task_service


def _args_of(fake, index=0):
    """The argv of the fake's nth recorded call."""
    return fake.calls[index][1]


def _argv_containing(fake, token):
    """The first recorded argv containing `token`.

    Counting call indexes is brittle: create_task alone issues two invocations (the add,
    then a follow-up export filtered on the description), so an index that is correct
    today shifts the moment a service adds a lookup.
    """
    for _user, args in fake.calls:
        if token in args:
            return args
    raise AssertionError(f"no recorded call contained {token!r}; calls were {fake.calls!r}")


class TestValidationThatExistsToday:
    @pytest.mark.parametrize("tag", ["ok", "with-dash", "with_underscore", "@context", "a.b"])
    def test_accepts_tags_in_the_allowed_character_set(self, fake_task, tag):
        task_service.create_task("alice", TaskCreate(description="t", tags=[tag]))
        assert f"+{tag}" in _args_of(fake_task)

    @pytest.mark.parametrize("tag", ["with space", "semi;colon", "$(whoami)", "back`tick`"])
    def test_rejects_tags_outside_it(self, fake_task, tag):
        with pytest.raises(ValueError, match="Invalid tag"):
            task_service.create_task("alice", TaskCreate(description="t", tags=[tag]))

    def test_rejects_a_non_uuid_dependency(self, fake_task):
        with pytest.raises(ValueError, match="Invalid UUID"):
            task_service.create_task("alice", TaskCreate(description="t", depends=["../../etc"]))

    def test_rejects_an_unknown_priority(self, fake_task):
        with pytest.raises(ValueError, match="Invalid priority"):
            task_service.create_task("alice", TaskCreate(description="t", priority="CRITICAL"))

    def test_rejects_an_unrecognised_recurrence(self, fake_task):
        with pytest.raises(ValueError, match="Invalid recur"):
            task_service.create_task("alice", TaskCreate(description="t", recur="rm -rf /"))


class TestArgvShape:
    def test_the_description_is_a_bare_positional_argument(self, fake_task):
        task_service.create_task("alice", TaskCreate(description="write the brief"))
        assert _args_of(fake_task)[:2] == ["add", "write the brief"]

    def test_attributes_become_key_colon_value_tokens(self, fake_task):
        task_service.create_task(
            "alice",
            TaskCreate(description="t", project="runway", priority="H", due="2026-09-01"),
        )
        args = _args_of(fake_task)
        assert "project:runway" in args
        assert "priority:H" in args
        assert "due:2026-09-01" in args

    def test_clearing_recurrence_emits_an_empty_value(self, fake_task):
        created = task_service.create_task("alice", TaskCreate(description="t"))
        task_service.modify_task("alice", created.uuid, TaskModify(recur=""))
        assert "modify" in _argv_containing(fake_task, "recur:")

    def test_create_re_queries_the_task_by_its_description(self, fake_task):
        """CURRENT behaviour, and fragile.

        `task add` output is not parsed for the new UUID. Instead the service runs a
        second lookup filtered on the description, so two tasks with identical text make
        the return value ambiguous. Step 12 replaces this with the UUID from `task add`.
        """
        task_service.create_task("alice", TaskCreate(description="duplicate me"))
        assert ["description:duplicate me", "export"] in [a for _u, a in fake_task.calls]


class TestUnvalidatedInput:
    """Finding SEC-3 made concrete.

    Every assertion here documents input that reaches argv WITHOUT validation. They are
    expected to change in Step 12; a failure there is the hardening working, not a
    regression.
    """

    def test_a_description_beginning_with_rc_reaches_argv_unchanged(self, fake_task):
        payload = "rc.data.location=/app/data/victim"
        task_service.create_task("alice", TaskCreate(description=payload))
        assert payload in _args_of(fake_task), (
            "SEC-3: a task description that looks like a Taskwarrior config override is "
            "passed straight through to argv"
        )

    def test_it_also_reaches_the_filter_position_on_the_follow_up_query(self, fake_task):
        payload = "rc.data.location=/app/data/victim"
        task_service.create_task("alice", TaskCreate(description=payload))
        assert [f"description:{payload}", "export"] in [a for _u, a in fake_task.calls]

    def test_annotation_text_is_unvalidated(self, fake_task):
        created = task_service.create_task("alice", TaskCreate(description="t"))
        task_service.annotate_task("alice", created.uuid, "rc.verbose=nothing")
        assert "annotate" in _argv_containing(fake_task, "rc.verbose=nothing")

    def test_a_project_name_is_unvalidated(self, fake_task):
        task_service.create_task("alice", TaskCreate(description="t", project="a b; c"))
        assert "project:a b; c" in _args_of(fake_task)

    def test_date_fields_are_unvalidated(self, fake_task):
        task_service.create_task("alice", TaskCreate(description="t", due="not a date at all"))
        assert "due:not a date at all" in _args_of(fake_task)


class TestPerUserRouting:
    def test_every_call_carries_the_username_that_selects_the_data_store(self, fake_task):
        task_service.create_task("alice", TaskCreate(description="hers"))
        task_service.create_task("bob", TaskCreate(description="his"))
        assert {call[0] for call in fake_task.calls} == {"alice", "bob"}

    def test_the_fake_keeps_the_two_stores_apart(self, fake_task):
        task_service.create_task("alice", TaskCreate(description="hers"))
        task_service.create_task("bob", TaskCreate(description="his"))
        assert [t.description for t in task_service.list_tasks("alice")] == ["hers"]
        assert [t.description for t in task_service.list_tasks("bob")] == ["his"]
