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

import uuid as uuidlib

import pytest

from app.models import TaskCreate, TaskModify
from app.services import task_service
from tests.fake_task import FakeTaskError


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
    @pytest.mark.parametrize(
        "tag",
        ["ok", "with-dash", "with_underscore", "@context", "a.b", "_u", "Büro", "@büro"],
    )
    def test_accepts_tags_in_the_allowed_character_set(self, fake_task, tag):
        task_service.create_task("alice", TaskCreate(description="t", tags=[tag]))
        assert f"+{tag}" in _args_of(fake_task)

    @pytest.mark.parametrize(
        "tag",
        [
            "with space",
            "semi;colon",
            "$(whoami)",
            "back`tick`",
            # Taskwarrior reads a leading sign as a modifier and a leading digit or dot as
            # description text, so each would silently become something else (D3).
            "-next",
            "+x",
            "1abc",
            ".x",
            # One stored tag, not two (`+@home,@office` is kept as a single tag).
            "a,b",
            "trailing\n",
        ],
    )
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


def _seed(fake, username="alice", **fields):
    """Put a task straight into the fake's store, bypassing validation.

    This is how legacy data looks to the service: tags Taskwarrior accepted long before
    today's regex existed, which must stay editable (D3).
    """
    task = {
        "uuid": str(uuidlib.uuid4()),
        "id": len(fake.stores.get(username, [])) + 1,
        "description": "seeded",
        "status": "pending",
        "tags": [],
        "depends": [],
        "annotations": [],
        "entry": "20260804T090000Z",
    }
    task.update(fields)
    fake.stores.setdefault(username, []).append(task)
    return task


def _modify_call(fake):
    """The argv of the single recorded `modify` call."""
    calls = [(a, t) for _u, a, t in fake.calls if "modify" in a]
    assert len(calls) == 1, f"expected one modify call, got {fake.calls!r}"
    return calls[0]


class TestTagsAreAFullSet:
    """`tags` on modify is the complete desired set; `tags_add`/`tags_remove` are deltas.

    Before this, modify emitted only `+tag`, so no tag could ever be removed — the web UI's
    tag removal silently did nothing, and every status swap left both tags behind.
    """

    def test_a_status_swap_removes_the_old_tag_as_a_modifier(self, fake_task):
        seeded = _seed(fake_task, tags=["someday", "@home"])
        task_service.modify_task("alice", seeded["uuid"], TaskModify(tags=["next", "@home"]))
        args, text = _modify_call(fake_task)
        assert "-someday" in args
        assert "+next" in args
        assert "+@home" not in args, "a kept tag is not re-sent"
        assert text == [], "a tag token after `--` would become description text"

    def test_removals_come_before_additions(self, fake_task):
        seeded = _seed(fake_task, tags=["someday"])
        task_service.modify_task("alice", seeded["uuid"], TaskModify(tags=["next"]))
        args, _text = _modify_call(fake_task)
        assert args.index("-someday") < args.index("+next")

    def test_an_empty_set_removes_every_current_tag(self, fake_task):
        seeded = _seed(fake_task, tags=["next", "@home", "work"])
        task = task_service.modify_task("alice", seeded["uuid"], TaskModify(tags=[]))
        args, _text = _modify_call(fake_task)
        assert {"-next", "-@home", "-work"} <= set(args)
        assert task.tags == []

    def test_deltas_edit_without_sending_the_full_set(self, fake_task):
        seeded = _seed(fake_task, tags=["someday", "@home"])
        task = task_service.modify_task(
            "alice",
            seeded["uuid"],
            TaskModify(tags_add=["next"], tags_remove=["someday"]),
        )
        args, _text = _modify_call(fake_task)
        assert args[args.index("modify") + 1 :] == ["-someday", "+next"]
        assert sorted(task.tags) == ["@home", "next"]

    def test_the_full_set_and_a_delta_together_are_refused(self, fake_task):
        seeded = _seed(fake_task, tags=["someday"])
        with pytest.raises(ValueError, match="not both"):
            task_service.modify_task(
                "alice", seeded["uuid"], TaskModify(tags=["next"], tags_add=["x"])
            )
        with pytest.raises(ValueError, match="not both"):
            task_service.modify_task(
                "alice", seeded["uuid"], TaskModify(tags=["next"], tags_remove=["someday"])
            )
        assert not [c for c in fake_task.calls if "modify" in c[1]]

    def test_removing_an_absent_tag_emits_nothing(self, fake_task):
        seeded = _seed(fake_task, tags=["next"])
        task_service.modify_task("alice", seeded["uuid"], TaskModify(tags_remove=["someday"]))
        assert not [c for c in fake_task.calls if "modify" in c[1]], "nothing to change"

    def test_adding_a_present_tag_emits_nothing(self, fake_task):
        seeded = _seed(fake_task, tags=["next"])
        task_service.modify_task("alice", seeded["uuid"], TaskModify(tags_add=["next"]))
        assert not [c for c in fake_task.calls if "modify" in c[1]]

    def test_a_legacy_comma_tag_is_split_into_its_parts(self, fake_task):
        seeded = _seed(fake_task, tags=["@home,@office"])
        task_service.modify_task("alice", seeded["uuid"], TaskModify(tags=["@home", "@office"]))
        args, _text = _modify_call(fake_task)
        assert args[args.index("modify") + 1 :] == ["-@home,@office", "+@home", "+@office"]

    @pytest.mark.parametrize(
        "change",
        [
            TaskModify(tags=["@home,@office", "1abc", "next"]),  # what the web UI sends
            TaskModify(tags_add=["next"]),
        ],
    )
    def test_kept_legacy_tags_are_never_revalidated(self, fake_task, change):
        seeded = _seed(fake_task, tags=["@home,@office", "1abc"])
        task = task_service.modify_task("alice", seeded["uuid"], change)
        args, _text = _modify_call(fake_task)
        assert args[args.index("modify") + 1 :] == ["+next"]
        assert "1abc" in task.tags

    def test_a_task_with_legacy_tags_can_change_its_description(self, fake_task):
        seeded = _seed(fake_task, tags=["@home,@office", "1abc"])
        task = task_service.modify_task("alice", seeded["uuid"], TaskModify(description="new"))
        args, text = _modify_call(fake_task)
        assert args[args.index("modify") + 1 :] == []
        assert text == ["new"]
        assert task.tags == ["@home,@office", "1abc"]

    @pytest.mark.parametrize("tag", ["a,b", "1abc", "-next", "+x", ".x", "has space"])
    def test_a_new_tag_in_the_full_set_is_validated(self, fake_task, tag):
        seeded = _seed(fake_task)
        with pytest.raises(ValueError, match="Invalid tag"):
            task_service.modify_task("alice", seeded["uuid"], TaskModify(tags=[tag]))

    @pytest.mark.parametrize("tag", ["-x", "+x", "1abc", "a b"])
    def test_tags_add_is_validated(self, fake_task, tag):
        seeded = _seed(fake_task)
        with pytest.raises(ValueError, match="Invalid tag"):
            task_service.modify_task("alice", seeded["uuid"], TaskModify(tags_add=[tag]))

    @pytest.mark.parametrize("tag", ["-x", "+x", "a b", "a:b", "(x)", 'q"', "1abc", ".x"])
    def test_tags_remove_is_validated_with_the_looser_rule(self, fake_task, tag):
        seeded = _seed(fake_task)
        with pytest.raises(ValueError, match="cannot remove tag"):
            task_service.modify_task("alice", seeded["uuid"], TaskModify(tags_remove=[tag]))

    def test_tags_remove_admits_a_legacy_tag(self, fake_task):
        seeded = _seed(fake_task, tags=["@home,@office", "a/b", "keep"])
        task = task_service.modify_task(
            "alice", seeded["uuid"], TaskModify(tags_remove=["@home,@office", "a/b"])
        )
        args, _text = _modify_call(fake_task)
        assert args[args.index("modify") + 1 :] == ["-@home,@office", "-a/b"]
        assert task.tags == ["keep"]

    @pytest.mark.parametrize("tag", ["1abc", ".x", "2026-09-19", "/a/", "[a]", "~x"])
    @pytest.mark.parametrize("how", ["delta", "full set"])
    def test_a_tag_taskwarrior_cannot_remove_is_refused(self, fake_task, tag, how):
        """Taskwarrior 3.5.0 reads `-1abc` as description text: the tag stays, the description
        is overwritten. Refuse before the call instead (pinned in tests/container)."""
        seeded = _seed(fake_task, description="Pay rent", tags=[tag, "next"])
        change = TaskModify(tags_remove=[tag]) if how == "delta" else TaskModify(tags=["next"])
        with pytest.raises(ValueError, match="cannot remove tag"):
            task_service.modify_task("alice", seeded["uuid"], change)
        assert not [c for c in fake_task.calls if "modify" in c[1]]
        assert seeded["description"] == "Pay rent"
        assert seeded["tags"] == [tag, "next"]

    def test_the_fake_refuses_a_removal_the_binary_reads_as_text(self, fake_task):
        seeded = _seed(fake_task, tags=["1abc"])
        with pytest.raises(FakeTaskError, match="not a tag removal"):
            fake_task.run("alice", [seeded["uuid"], "modify", "-1abc"])

    def test_a_removal_token_never_lands_after_the_separator(self, fake_task):
        seeded = _seed(fake_task, tags=["someday"])
        task_service.modify_task(
            "alice", seeded["uuid"], TaskModify(description="d", tags=["next"])
        )
        _args, text = _modify_call(fake_task)
        assert text == ["d"]

    def test_a_future_wait_task_can_be_retagged(self, fake_task):
        """The current tags are read by uuid, which does not depend on status or wait."""
        seeded = _seed(fake_task, tags=["waiting"], wait="20300101T000000Z")
        task = task_service.modify_task(
            "alice", seeded["uuid"], TaskModify(tags_remove=["waiting"], tags_add=["next"])
        )
        assert task.tags == ["next"]

    def test_create_still_emits_every_tag(self, fake_task):
        task_service.create_task("alice", TaskCreate(description="t", tags=["next", "@home"]))
        assert {"+next", "+@home"} <= set(_args_of(fake_task))


class TestDependsIsAFullSet:
    """Same bug class as tags: `depends:X` only ever adds; `depends:-X` removes (3.5.0)."""

    A = "11111111-1111-4111-8111-111111111111"
    B = "22222222-2222-4222-8222-222222222222"
    C = "33333333-3333-4333-8333-333333333333"

    def test_a_dropped_dependency_is_removed(self, fake_task):
        seeded = _seed(fake_task, depends=[self.A, self.B])
        task = task_service.modify_task("alice", seeded["uuid"], TaskModify(depends=[self.B]))
        args, _text = _modify_call(fake_task)
        assert args[args.index("modify") + 1 :] == [f"depends:-{self.A}"]
        assert task.depends == [self.B]

    def test_only_new_dependencies_are_added(self, fake_task):
        seeded = _seed(fake_task, depends=[self.A])
        task = task_service.modify_task(
            "alice", seeded["uuid"], TaskModify(depends=[self.A, self.C])
        )
        args, _text = _modify_call(fake_task)
        assert args[args.index("modify") + 1 :] == [f"depends:{self.C}"]
        assert sorted(task.depends) == [self.A, self.C]

    def test_an_empty_list_still_clears(self, fake_task):
        seeded = _seed(fake_task, depends=[self.A])
        task = task_service.modify_task("alice", seeded["uuid"], TaskModify(depends=[]))
        args, _text = _modify_call(fake_task)
        assert args[args.index("modify") + 1 :] == ["depends:"]
        assert task.depends == []

    def test_an_unchanged_set_emits_nothing(self, fake_task):
        seeded = _seed(fake_task, depends=[self.A])
        task_service.modify_task("alice", seeded["uuid"], TaskModify(depends=[self.A]))
        assert not [c for c in fake_task.calls if "modify" in c[1]]

    def test_every_new_dependency_is_validated(self, fake_task):
        seeded = _seed(fake_task)
        with pytest.raises(ValueError, match="Invalid UUID"):
            task_service.modify_task("alice", seeded["uuid"], TaskModify(depends=["../x"]))
