"""Tests for `task_runner._run` itself: how it invokes the binary and reads its exit code.

Everything else in the unit tier replaces `_run` with the fake. These do not: they replace
`subprocess.run` one level lower, so the argv, the stdin and the exit-code mapping that
`_run` owns are asserted directly.
"""

import subprocess

import pytest

from app.services import task_runner


class _Completed:
    def __init__(self, returncode: int, stdout: str = "", stderr: str = "") -> None:
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


@pytest.fixture
def spawned(isolated_storage, monkeypatch):
    """Record every `subprocess.run` call `_run` makes; answer with `spawned.result`."""

    class Recorder:
        calls: list[tuple[list[str], dict]] = []
        result = _Completed(0, "[]")

    def fake_run(cmd, **kwargs):
        Recorder.calls.append((cmd, kwargs))
        return Recorder.result

    Recorder.calls = []
    monkeypatch.setattr(task_runner.subprocess, "run", fake_run)
    return Recorder


class TestInvocation:
    def test_stdin_is_never_inherited(self, spawned):
        """A recurring instance's modify prompts "modify all pending recurrences?" and would
        block on an inherited terminal until the timeout (500). /dev/null answers no."""
        task_runner._run("alice", ["export"])
        _cmd, kwargs = spawned.calls[0]
        assert kwargs["stdin"] is subprocess.DEVNULL

    def test_recurrence_confirmation_is_off_and_precedes_the_caller_args(self, spawned):
        task_runner.modify_task("alice", "11111111-1111-4111-8111-111111111111", ["+next"])
        cmd, _kwargs = spawned.calls[0]
        assert "rc.recurrence.confirmation=no" in cmd
        assert cmd.index("rc.recurrence.confirmation=no") < cmd.index("modify")

    def test_every_own_override_precedes_the_caller_args(self, spawned):
        task_runner._run("alice", ["export"])
        cmd, _kwargs = spawned.calls[0]
        assert cmd[0] == "task"
        assert cmd[1 : 1 + len(task_runner._OWN_OVERRIDES)] == list(task_runner._OWN_OVERRIDES)
        assert cmd[-1] == "export"


class TestExitCodes:
    @pytest.mark.parametrize("rc", [0, 1])
    def test_zero_and_one_return_stdout(self, spawned, rc):
        spawned.result = _Completed(rc, "out")
        assert task_runner._run("alice", ["export"]) == "out"

    def test_two_is_a_rejection_carrying_stderr(self, spawned):
        """Taskwarrior exits 2 for input it refuses: a bad date, a bad priority, recur
        without due. That is the caller's error, so it is a ValueError (400), not a 500."""
        spawned.result = _Completed(
            2, stderr="'notadate' is not a valid date in the 'Y-M-D' format.\n"
        )
        with pytest.raises(task_runner.TaskwarriorRejected, match="not a valid date") as exc:
            task_runner._run("alice", ["add", "due:notadate"], ["t"])
        assert isinstance(exc.value, ValueError)

    def test_two_without_stderr_still_says_what_happened(self, spawned):
        spawned.result = _Completed(2)
        with pytest.raises(task_runner.TaskwarriorRejected, match="rejected"):
            task_runner._run("alice", ["export"])

    @pytest.mark.parametrize(
        "stderr",
        [
            # Each observed on Taskwarrior 3.5.0 with exit code 2 (2026-09-19).
            'Task Database Error: Cannot create directory "/data/alice/x": Permission denied',
            "unable to open database file: /data/alice/taskchampion.sqlite3: Error code 14",
            "attempt to write a readonly database: Error code 8",
            "Setting journal_mode=WAL: file is not a database: Error code 26",
            "database is locked: Error code 5: database is locked",
            "Cannot proceed without rc file.",
        ],
    )
    def test_two_from_a_store_fault_is_a_runtime_error_without_the_path(
        self, spawned, stderr, caplog
    ):
        """2 is Taskwarrior's generic error code: a store it cannot reach exits 2 as well.
        That is the server's fault (500, not 400), and its stderr can carry the data path,
        so the caller gets a generic message and the log gets the stderr."""
        spawned.result = _Completed(2, stderr=stderr + "\n")
        with caplog.at_level("ERROR", logger=task_runner.__name__):
            with pytest.raises(RuntimeError) as exc:
                task_runner._run("alice", ["add"], ["t"])
        assert not isinstance(exc.value, ValueError)
        assert str(exc.value) == task_runner._SYSTEM_FAULT_MESSAGE
        assert "/data" not in str(exc.value)
        assert stderr in caplog.text

    def test_any_other_code_stays_a_runtime_error(self, spawned):
        spawned.result = _Completed(3, stderr="boom")
        with pytest.raises(RuntimeError, match="boom") as exc:
            task_runner._run("alice", ["export"])
        assert not isinstance(exc.value, ValueError)
