"""The four date modifiers — `due`, `scheduled`, `wait`, `until` — at the argv boundary (brief 0074).

Finding SEC-007 asked whether a date value could carry an `rc.data.location=` override past `--`
and past `reject_structural_tokens`, which only refuses a token that *starts* with `rc.`. The real
Taskwarrior 3.5.0 refutes it (``tests/container/test_real_task.py::TestDateValuesAreOneArgument``):
each argv element is one value and an embedded override is dropped. These tests are the unit half:

* the argv shape the refutation rests on — each date is exactly one element, before `--`, and
  `subprocess.run` gets a list and never `shell=True`;
* a date grammar as defence in depth, not as a fix: a value is one word of ASCII letters, digits
  and ``: + - .``. Every documented form and every one-word Taskwarrior expression still passes
  unchanged; whitespace inside the value, `=`, `/`, quotes and shell characters are a 400 before
  the binary runs.
"""

from __future__ import annotations

import pytest

from app.models import TaskCreate, TaskModify
from app.services import task_runner, task_service
from tests.unit.test_task_runner import ALICE as STORE
from tests.unit.test_task_runner import _Completed

# The fake keys its stores by whatever `_run` is handed; a name is enough at this tier.
ALICE = "alice"

FIELDS = ("due", "scheduled", "wait", "until")

# The documented syntax (`YYYY-MM-DD`, `YYYY-MM-DDTHH:MM`), the stored form a client may resend,
# and one-word Taskwarrior expressions probed on 3.5.0. None of these may start failing.
ACCEPTED = [
    "2030-01-01",
    "2030-01-01T10:00",
    "2030-01-01T10:00:00",
    "2030-01-01T10:00Z",
    "2030-01-01T10:00+02:00",
    "20301031T230000Z",
    "tomorrow",
    "eom",
    "now+3d",
    "eom-1wk",
    "3d",
    "P3D",
    "2030-W05",
    "monday",
    "9am",
    "later",
    "-1d",
    "2030-01-01T10:00:00.5Z",
    "march",
]

# The shapes the SEC-007 hypothesis needs, and their neighbours. Inert on 3.5.0 — refused anyway.
REFUSED = [
    "2026-01-01 rc.data.location=/app/data/victim",
    "2026-01-01\trc.data.location=/app/data/victim",
    "2026-01-01\nrc.data.location=/app/data/victim",
    "rc.data.location=/app/data/victim",
    "2026-01-01 rc:/tmp/evilrc",
    "now + 1d",
    "2026-01-01 10:00",
    "$(touch /tmp/x)",
    "`touch /tmp/x`",
    "2026-01-01;touch",
    "2026/01/01",
    "(now+1d)",
    "'2026-01-01'",
    '"2026-01-01"',
    "2026-01-01,x",
    "2026-01-01\x00",
    "2026​-01-01",
    "2026-01-01 ",
    "２０２６-01-01",
    # Taskwarrior DOM references, which 3.5.0 evaluates inside a date and echoes in its rc-2
    # stderr: the data path, the OS, the version, any rc key (second review of brief 0074).
    "rc.data.location",
    "rc.dateformat",
    "RC.data.location",
    "system.os",
    "tw.version",
    "now+rc.data.location",
    "1.description",
    "context.name",
    # The one-word colon spelling of an override, and the rc-file form as the whole value.
    "rc.data.location:victim",
    "rc.data.location:..",
    "rc.hooks:on",
    "rc:rc",
    "RC:evilrc",
    "now+rc:evilrc",
]


def _date_tokens(args: list[str]) -> list[str]:
    return [a for a in args if a.split(":", 1)[0] in FIELDS]


class TestEachDateIsOneArgument:
    @pytest.mark.parametrize("field", FIELDS)
    def test_on_create_the_value_is_one_element_before_the_separator(self, fake_task, field):
        task_service.create_task(ALICE, TaskCreate(description="t", **{field: "2030-01-01"}))
        _store, args, text = fake_task.calls[0]
        assert _date_tokens(args) == [f"{field}:2030-01-01"]
        assert text == ["t"], "a date token reached the free-text side of `--`"

    @pytest.mark.parametrize("field", FIELDS)
    def test_on_modify_the_value_is_one_element_before_the_separator(self, fake_task, field):
        created = task_service.create_task(ALICE, TaskCreate(description="t"))
        fake_task.calls.clear()
        task_service.modify_task(ALICE, created.uuid, TaskModify(**{field: "2030-01-01"}))
        modify = next(c for c in fake_task.calls if "modify" in c[1])
        assert _date_tokens(modify[1]) == [f"{field}:2030-01-01"]
        assert modify[2] == []

    def test_the_subprocess_gets_a_list_and_no_shell(self, isolated_storage, monkeypatch):
        """No shell is the reason `$(…)` is never a command: the value is one argv string."""
        seen: list[tuple[object, dict]] = []

        def fake_run(cmd, **kwargs):
            seen.append((cmd, kwargs))
            return _Completed(0, "[]")

        monkeypatch.setattr(task_runner.subprocess, "run", fake_run)
        task_runner.add_task(STORE, ["due:2030-01-01", "wait:2029-12-01"], ["t"])
        cmd, kwargs = seen[0]
        assert isinstance(cmd, list)
        assert kwargs.get("shell", False) is False
        assert cmd.count("due:2030-01-01") == 1
        assert cmd.index("wait:2029-12-01") < cmd.index(task_runner.SEPARATOR)


class TestTheDateGrammar:
    @pytest.mark.parametrize("value", ACCEPTED)
    @pytest.mark.parametrize("field", FIELDS)
    def test_a_documented_or_one_word_value_passes_unchanged(self, fake_task, field, value):
        args, _text = task_service._build_args(
            "t", None, None, None, *_dates(field, value), None, None, mode="modify"
        )
        assert _date_tokens(args) == [f"{field}:{value}"]

    @pytest.mark.parametrize("value", REFUSED)
    @pytest.mark.parametrize("field", FIELDS)
    def test_anything_else_is_refused_before_argv_on_create(self, fake_task, field, value):
        with pytest.raises(ValueError, match="not a valid date"):
            task_service.create_task(ALICE, TaskCreate(description="t", **{field: value}))
        assert fake_task.calls == [], "a refused date must never reach the binary"

    @pytest.mark.parametrize("field", FIELDS)
    def test_anything_else_is_refused_before_argv_on_modify(self, fake_task, field):
        created = task_service.create_task(ALICE, TaskCreate(description="t"))
        fake_task.calls.clear()
        with pytest.raises(ValueError, match="not a valid date"):
            task_service.modify_task(ALICE, created.uuid, TaskModify(**{field: REFUSED[0]}))
        assert not [c for c in fake_task.calls if "modify" in c[1]]

    @pytest.mark.parametrize("field", FIELDS)
    def test_surrounding_whitespace_is_stripped(self, fake_task, field):
        """Taskwarrior 3.5.0 ignored it; the value it stored is the value we now pass."""
        task_service.create_task(ALICE, TaskCreate(description="t", **{field: " 2030-01-01 "}))
        assert _date_tokens(fake_task.calls[0][1]) == [f"{field}:2030-01-01"]

    @pytest.mark.parametrize("field", FIELDS)
    def test_whitespace_only_keeps_its_meaning(self, fake_task, field):
        """`due:  ` was `due:` to the binary: clear on modify, nothing on create (D7)."""
        task_service.create_task(ALICE, TaskCreate(description="t", **{field: "   "}))
        assert _date_tokens(fake_task.calls[0][1]) == []
        created = task_service.create_task(
            ALICE, TaskCreate(description="u", **{field: "2030-01-01"})
        )
        fake_task.calls.clear()
        task_service.modify_task(ALICE, created.uuid, TaskModify(**{field: "  "}))
        modify = next(c for c in fake_task.calls if "modify" in c[1])
        assert _date_tokens(modify[1]) == [f"{field}:"]

    def test_recur_is_not_held_to_the_date_grammar(self, fake_task):
        """`recur` has its own grammar, and `3 weeks` is documented there."""
        task_service.create_task(
            ALICE, TaskCreate(description="t", due="2030-01-01", recur="3 weeks")
        )
        assert "recur:3 weeks" in fake_task.calls[0][1]


class TestTheStorePathNeverReachesTheCaller:
    """Second review of brief 0074: an rc-2 stderr that names the store's directory is the binary
    having evaluated something server-side (a DOM reference such as `rc.data.location`). `_run`
    answers it with a generic refusal and keeps the stderr for the log, whatever let it through."""

    def test_a_refusal_naming_the_data_path_is_generic(self, isolated_storage, monkeypatch):
        stderr = f"'{STORE.path}' is not a valid date in the 'Y-M-D' format."
        monkeypatch.setattr(
            task_runner.subprocess, "run", lambda cmd, **kw: _Completed(2, "", stderr)
        )
        with pytest.raises(task_runner.TaskwarriorRejected) as refused:
            task_runner.add_task(STORE, ["due:2030-01-01"], ["t"])
        assert str(STORE.path.parent) not in str(refused.value)
        assert "not a valid" in str(refused.value)

    def test_an_ordinary_refusal_still_names_the_value(self, isolated_storage, monkeypatch):
        stderr = "'garbage' is not a valid date in the 'Y-M-D' format."
        monkeypatch.setattr(
            task_runner.subprocess, "run", lambda cmd, **kw: _Completed(2, "", stderr)
        )
        with pytest.raises(task_runner.TaskwarriorRejected, match="'garbage' is not a valid"):
            task_runner.add_task(STORE, ["due:garbage"], ["t"])


class TestOverHttp:
    """The fake refuses every date outside its three forms, as the binary's rc 2 — so a 400 alone
    would pass without the grammar. The binary *accepts* this payload (rc 0, the override
    dropped); what these assert is that it never reaches an argument vector."""

    PAYLOAD = "2026-01-01 rc.data.location=/app/data/victim"

    def _reached_argv(self, fake_task) -> bool:
        return any(self.PAYLOAD in token for _s, args, _t in fake_task.calls for token in args)

    @pytest.mark.parametrize("field", FIELDS)
    def test_create_is_400_and_writes_nothing(self, client, registered, fake_task, field):
        headers = {"Authorization": f"Bearer {registered['token']}"}
        r = client.post("/tasks", json={"description": "t", field: self.PAYLOAD}, headers=headers)
        assert r.status_code == 400, r.text
        assert "not a valid date" in r.json()["detail"]
        assert not self._reached_argv(fake_task)
        assert client.get("/tasks", headers=headers).json() == []

    @pytest.mark.parametrize("field", FIELDS)
    def test_modify_is_400_and_changes_nothing(self, client, registered, fake_task, field):
        headers = {"Authorization": f"Bearer {registered['token']}"}
        task = client.post(
            "/tasks", json={"description": "t", field: "2030-01-01"}, headers=headers
        ).json()
        r = client.put(f"/tasks/{task['uuid']}", json={field: self.PAYLOAD}, headers=headers)
        assert r.status_code == 400, r.text
        assert not self._reached_argv(fake_task)
        after = client.get(f"/tasks/{task['uuid']}", headers=headers).json()
        assert after[field] == task[field]

    @pytest.mark.parametrize("value", ["2030-01-01", "2030-01-01T10:00"])
    def test_the_documented_forms_still_work(self, client, registered, fake_task, value):
        headers = {"Authorization": f"Bearer {registered['token']}"}
        r = client.post("/tasks", json={"description": "t", "due": value}, headers=headers)
        assert r.status_code == 201, r.text
        assert r.json()["due"]


def _dates(field: str, value: str) -> list[str | None]:
    """`_build_args`' four date positions with `value` in `field`'s."""
    return [value if f == field else None for f in FIELDS]
