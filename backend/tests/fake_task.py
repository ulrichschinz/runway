"""An in-memory stand-in for the Taskwarrior CLI, injected at ``task_runner._run``.

Why this seam. ``_run`` is the single choke point through which every Taskwarrior
invocation passes. Faking it there means the tests still exercise ``_build_args``, the
validation in ``task_service``, the routers and their error mapping — everything this
repository actually owns. Faking higher up (at ``export_tasks`` or ``task_service``)
would skip argv construction, which is precisely where finding SEC-3 lives.

What this deliberately does NOT emulate: Taskwarrior's real urgency algorithm, its
date grammar beyond the three forms below, and the full semantics of its filter DSL. Those
belong to the binary. A fake that claimed to reproduce them would be asserting its own
behaviour rather than the product's.

What it does model, because the lists depend on it (ADR 0036), each claim pinned against
the binary in ``tests/container`` (``TestWhatTheFakeClaims`` and ``TestListSemantics``):

- a clock, ``now``; ``done`` and ``delete`` set ``end`` to it;
- dates in three forms (``YYYY-MM-DD`` as UTC midnight, ``YYYY-MM-DDTHH:MM``, and the stored
  ``YYYYMMDDTHHMMSSZ``), anything else a ``TaskwarriorRejected``, as the binary's rc 2;
- virtual waiting: a pending task whose ``wait`` is after ``now`` is hidden — not
  ``status:pending``, but ``status:waiting`` and ``+WAITING`` — and still exports "pending";
- ``project:`` (no project), ``project:X`` (prefix match), ``project.is:X`` (exact), ``-word``
  (tag exclusion; ``-project`` is the tag ``project``), ``status:completed`` and the exact
  ``OPEN`` / ``ALL`` token groups;
- refusals: a priority outside H/M/L and ``recur`` without ``due`` are ``TaskwarriorRejected``
  and change nothing; a ``+tag`` failing ``TAG_RE`` is a ``FakeTaskError``, because the binary
  would silently turn it into description text.
"""

from __future__ import annotations

import copy
import json
import uuid as uuidlib
from datetime import UTC, datetime
from typing import Any

from app.services.task_runner import TaskwarriorRejected
from app.services.task_service import EXISTING_TAG_RE, OPEN, TAG_RE

# `ALL` of P1-5 (D12): every task that is not deleted and not a recurring template.
ALL = ["(", "status:pending", "or", "status:waiting", "or", "status:completed", ")"]

_DATE_FIELDS = ("due", "scheduled", "wait", "until")
_STAMP = "%Y%m%dT%H%M%SZ"
_DEFAULT_NOW = datetime(2026, 9, 19, 10, 0, 0, tzinfo=UTC)

# Coefficients mirroring backend/taskrc_template.txt closely enough that ordering tests
# are meaningful. This is NOT Taskwarrior's algorithm and does not claim to be.
_URGENCY = {
    "next": 15.0,
    "waiting": -3.0,
    "someday": -5.0,
}
_PRIORITY_URGENCY = {"H": 6.0, "M": 3.9, "L": 1.8}


class FakeTaskError(RuntimeError):
    """Raised for an argv the fake does not understand.

    Loud on purpose: a silently ignored argument would make a test pass while the real
    binary did something else entirely.
    """


class FakeTaskCLI:
    """Holds one task store per username, exactly as the real per-user TASKDATA does."""

    def __init__(self, now: datetime | None = None) -> None:
        self.now = now or _DEFAULT_NOW
        self.stores: dict[str, list[dict[str, Any]]] = {}
        self.calls: list[tuple[str, list[str], list[str]]] = []
        self.latest: dict[str, str] = {}

    # -- the seam ---------------------------------------------------------------

    def run(self, username: str, args: list[str], text: list[str] | None = None) -> str:
        """Drop-in replacement for ``task_runner._run``.

        `text` models what the real binary does with everything after `--`: it is joined
        into the description verbatim and **never parsed**. A fake that quietly parsed it
        would make the hardening look like it worked while the real binary disagreed —
        which is the whole reason SEC-3 needed the container tier to confirm it.
        """
        text = list(text or [])
        self.calls.append((username, list(args), text))
        tasks = self.stores.setdefault(username, [])

        if args and args[-1] == "export":
            return json.dumps(self._filter(tasks, args[:-1], username))
        if args and args[0] == "add":
            return self._add(tasks, args[1:], text, username)
        if len(args) >= 2:
            target, command = args[0], args[1]
            task = self._by_uuid(tasks, target)
            if task is None:
                raise FakeTaskError(f"no task matches {target}")
            if command == "modify":
                return self._modify(task, args[2:], text)
            if command == "done":
                task["status"] = "completed"
                task["end"] = self._stamp()
                return "Completed 1 task."
            if command == "delete":
                task["status"] = "deleted"
                task["end"] = self._stamp()
                return "Deleted 1 task."
            if command == "start":
                task["start"] = "20260804T090000Z"
                return "Started 1 task."
            if command == "stop":
                task.pop("start", None)
                return "Stopped 1 task."
            if command == "annotate":
                task.setdefault("annotations", []).append(
                    {"entry": "20260804T090000Z", "description": " ".join(text)}
                )
                return "Annotated 1 task."
        raise FakeTaskError(f"unsupported argv: {args!r}")

    # -- mutation ---------------------------------------------------------------

    def _add(
        self,
        tasks: list[dict[str, Any]],
        args: list[str],
        text: list[str],
        username: str,
    ) -> str:
        task: dict[str, Any] = {
            "uuid": str(uuidlib.uuid4()),
            "id": len(tasks) + 1,
            "description": "",
            "status": "pending",
            "tags": [],
            "depends": [],
            "annotations": [],
            "entry": "20260804T090000Z",
        }
        self._apply(task, args, text)
        tasks.append(task)
        self.latest[username] = task["uuid"]
        return f"Created task {task['id']}."

    def _modify(self, task: dict[str, Any], args: list[str], text: list[str]) -> str:
        self._apply(task, args, text)
        return "Modified 1 task."

    def _apply(self, task: dict[str, Any], args: list[str], text: list[str]) -> None:
        # All or nothing, like the binary: a refused command leaves the task as it was.
        changed = copy.deepcopy(task)
        self._change(changed, args, text)
        if changed.get("recur") and not changed.get("due"):
            raise TaskwarriorRejected("A recurring task must also have a 'due' date.")
        task.clear()
        task.update(changed)

    def _change(self, task: dict[str, Any], args: list[str], text: list[str]) -> None:
        # Free text is description, verbatim. It is never inspected for tags, attributes
        # or rc. overrides — that is exactly what `--` buys from the real binary.
        words: list[str] = list(text)
        for arg in args:
            if arg.startswith("+"):
                tag = arg[1:]
                # The binary reads `+1abc` or `+.x` as description text (pinned).
                if not TAG_RE.fullmatch(tag):
                    raise FakeTaskError(f"not a tag on Taskwarrior 3.5: {arg!r}")
                if tag not in task["tags"]:
                    task["tags"].append(tag)
            elif arg.startswith("-"):
                # The real binary reads `-1abc` or `-.x` as description text, not a removal
                # (pinned in tests/container); refuse loudly rather than pretend it works.
                if not EXISTING_TAG_RE.fullmatch(arg[1:]):
                    raise FakeTaskError(f"not a tag removal on Taskwarrior 3.5: {arg!r}")
                task["tags"] = [t for t in task["tags"] if t != arg[1:]]
            elif ":" in arg:
                key, _, value = arg.partition(":")
                if key == "depends":
                    # As on Taskwarrior 3.5 (pinned in tests/container): `depends:X` adds,
                    # `depends:-X` removes one, `depends:` clears.
                    if not value:
                        task["depends"] = []
                    elif value.startswith("-"):
                        task["depends"] = [d for d in task["depends"] if d != value[1:]]
                    else:
                        for dep in (d for d in value.split(",") if d):
                            if dep not in task["depends"]:
                                task["depends"].append(dep)
                elif value == "":
                    task.pop(key, None)
                elif key == "priority" and value not in ("H", "M", "L"):
                    raise TaskwarriorRejected(
                        f"The 'priority' attribute does not allow a value of '{value}'."
                    )
                elif key in _DATE_FIELDS:
                    task[key] = _parse_date(value)
                else:
                    task[key] = value
            else:
                words.append(arg)
        if words:
            task["description"] = " ".join(words)
        task["modified"] = "20260804T090000Z"
        task["urgency"] = self._urgency(task)

    # -- query ------------------------------------------------------------------

    def _by_uuid(self, tasks: list[dict[str, Any]], target: str) -> dict[str, Any] | None:
        return next((t for t in tasks if t["uuid"] == target), None)

    def _stamp(self) -> str:
        return self.now.astimezone(UTC).strftime(_STAMP)

    def _is_hidden(self, task: dict[str, Any]) -> bool:
        """Virtual waiting: pending, with a `wait` still in the future."""
        wait = task.get("wait")
        return task["status"] == "pending" and bool(wait) and wait > self._stamp()

    def _status(self, task: dict[str, Any]) -> str:
        """The status a filter sees: `waiting` for a hidden task, else the stored one."""
        return "waiting" if self._is_hidden(task) else task["status"]

    def _filter(
        self, tasks: list[dict[str, Any]], filters: list[str], username: str = ""
    ) -> list[dict[str, Any]]:
        result = list(tasks)
        filters = list(filters)
        while filters:
            group = next((g for g in (OPEN, ALL) if filters[: len(g)] == g), None)
            if group is not None:
                del filters[: len(group)]
                wanted = {"pending", "waiting"} | ({"completed"} if group is ALL else set())
                result = [t for t in result if self._status(t) in wanted]
                continue
            f = filters.pop(0)
            if f == "+LATEST":
                newest = self.latest.get(username)
                result = [t for t in result if t["uuid"] == newest]
            elif f == "+WAITING":
                result = [t for t in result if self._is_hidden(t)]
            elif f == "-TAGGED":
                result = [t for t in result if not t["tags"]]
            elif f.startswith("+"):
                result = [t for t in result if f[1:] in t["tags"]]
            elif f.startswith("-"):
                # A tag exclusion, whatever the word: `-project` is the tag `project`.
                result = [t for t in result if f[1:] not in t["tags"]]
            elif f == "project:":
                result = [t for t in result if not t.get("project")]
            elif f.startswith("project:"):
                # Taskwarrior's `project:X` is a prefix match: X, X.sub, and Xanything.
                prefix = f[len("project:") :]
                result = [t for t in result if t.get("project", "").startswith(prefix)]
            elif f.startswith("project.is:"):
                result = [t for t in result if t.get("project") == f[len("project.is:") :]]
            elif f.startswith("description:"):
                wanted_text = f[len("description:") :]
                result = [t for t in result if t["description"] == wanted_text]
            elif f.startswith("status:"):
                result = [t for t in result if self._status(t) == f[len("status:") :]]
            elif _looks_like_uuid(f):
                result = [t for t in result if t["uuid"] == f]
            else:
                raise FakeTaskError(f"unsupported filter: {f!r}")
        for t in result:
            t["urgency"] = self._urgency(t)
        return result

    def _urgency(self, task: dict[str, Any]) -> float:
        score = 0.0
        for tag in task.get("tags", []):
            score += _URGENCY.get(tag, 1.0)
        score += _PRIORITY_URGENCY.get(task.get("priority", ""), 0.0)
        if task.get("due"):
            score += 12.0
        if task.get("start"):
            score += 4.0
        if task.get("project"):
            score += 1.0
        return round(score, 4)


def _parse_date(value: str) -> str:
    """The three date forms the fake accepts, stored as Taskwarrior stores them.

    `YYYY-MM-DD` is UTC midnight: the container tier and the shipped image run in UTC.
    """
    for form in ("%Y-%m-%d", "%Y-%m-%dT%H:%M", _STAMP):
        try:
            return datetime.strptime(value, form).strftime(_STAMP)
        except ValueError:
            continue
    raise TaskwarriorRejected(f"'{value}' is not a valid date in the 'Y-M-D' format.")


def _looks_like_uuid(value: str) -> bool:
    try:
        uuidlib.UUID(value)
    except ValueError:
        return False
    return True
