"""Tests for argv construction — the Taskwarrior boundary.

These assert what reaches `task_runner._run`: the argument vector handed to the `task`
binary, split into structural arguments and free text.

`shell=False` with an argv list was always correct — no shell metacharacter can start a new
process. The real question is different, and it is what finding SEC-3 was about: Taskwarrior
interprets its OWN arguments, and `rc.<key>=<value>` anywhere in the list overrides
configuration at runtime, including which data store it opens.

Step 12 closed that. The assertions that used to pin the defect now pin the control, and the
control is structural rather than a filter: free text goes after `--`, where Taskwarrior's own
grammar stops interpreting it.
"""

import pytest

from app.models import TaskCreate, TaskModify
from app.services import task_service


def _args_of(fake, index=0):
    """The structural argv of the fake's nth recorded call — everything before `--`."""
    return fake.calls[index][1]


def _text_of(fake, index=0):
    """The free-text argv of the fake's nth recorded call — everything after `--`."""
    return fake.calls[index][2]


def _argv_containing(fake, token):
    """The first recorded argv containing `token`.

    Counting call indexes is brittle: create_task alone issues two invocations (the add,
    then a follow-up export filtered on the description), so an index that is correct
    today shifts the moment a service adds a lookup.
    """
    for _user, args, _text in fake.calls:
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
    def test_the_description_travels_as_free_text_not_as_an_argument(self, fake_task):
        task_service.create_task("alice", TaskCreate(description="write the brief"))
        assert _args_of(fake_task) == ["add"]
        assert _text_of(fake_task) == ["write the brief"]

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

    def test_create_reads_back_by_latest_not_by_description(self, fake_task):
        """The old form filtered on the description, which put user text into a filter
        position — the one place `--` cannot protect — and returned the wrong task whenever
        two shared a description."""
        task_service.create_task("alice", TaskCreate(description="duplicate me"))
        argvs = [a for _u, a, _t in fake_task.calls]
        assert ["+LATEST", "export"] in argvs
        assert not any("description:" in token for argv in argvs for token in argv)

    def test_two_tasks_with_the_same_description_return_the_right_one(self, fake_task):
        first = task_service.create_task("alice", TaskCreate(description="duplicate me"))
        second = task_service.create_task("alice", TaskCreate(description="duplicate me"))
        assert first.uuid != second.uuid


class TestTheOverrideIsNeutralised:
    """Finding SEC-3, closed.

    Each of these used to assert the opposite — that the payload reached argv unchanged —
    and said Step 12 would flip them. This is Step 12.
    """

    PAYLOAD = "rc.data.location=/app/data/victim"

    def test_a_description_shaped_like_an_override_is_free_text(self, fake_task):
        task_service.create_task("alice", TaskCreate(description=self.PAYLOAD))
        assert self.PAYLOAD not in _args_of(fake_task), (
            "an override must never reach a parsed position"
        )
        assert _text_of(fake_task) == [self.PAYLOAD]

    def test_it_is_stored_as_ordinary_text(self, fake_task):
        created = task_service.create_task("alice", TaskCreate(description=self.PAYLOAD))
        assert created.description == self.PAYLOAD

    def test_it_no_longer_reaches_a_filter_position(self, fake_task):
        task_service.create_task("alice", TaskCreate(description=self.PAYLOAD))
        for _user, args, _text in fake_task.calls:
            assert not any(self.PAYLOAD in token for token in args)

    def test_annotation_text_is_free_text_too(self, fake_task):
        created = task_service.create_task("alice", TaskCreate(description="t"))
        task_service.annotate_task("alice", created.uuid, "rc.verbose=nothing")
        annotate = next(c for c in fake_task.calls if "annotate" in c[1])
        assert "rc.verbose=nothing" not in annotate[1]
        assert annotate[2] == ["rc.verbose=nothing"]

    def test_the_choke_point_refuses_an_override_in_a_structural_position(self):
        """Defence in depth. `--` protects free text; this protects the positions that must
        stay parseable, where a future caller could otherwise reintroduce the hole."""
        from app.services import task_runner

        with pytest.raises(task_runner.UnsafeArgument, match="configuration override"):
            task_runner.reject_structural_tokens(["rc.data.location=/app/data/victim"])

    def test_the_choke_point_is_case_insensitive(self):
        from app.services import task_runner

        with pytest.raises(task_runner.UnsafeArgument):
            task_runner.reject_structural_tokens(["RC.Data.Location=/tmp/x"])

    def test_ordinary_modifiers_still_pass(self):
        from app.services import task_runner

        task_runner.reject_structural_tokens(["project:runway", "+urgent", "priority:H"])


class TestStillUnvalidated:
    """Deliberately unchanged: these reach argv as attribute values, are parsed by
    Taskwarrior, and are not overrides. Recorded rather than hardened."""

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
