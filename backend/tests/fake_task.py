"""An in-memory stand-in for the Taskwarrior CLI, injected at ``task_runner._run``.

Why this seam. ``_run`` is the single choke point through which every Taskwarrior
invocation passes. Faking it there means the tests still exercise ``_build_args``, the
validation in ``task_service``, the routers and their error mapping — everything this
repository actually owns. Faking higher up (at ``export_tasks`` or ``task_service``)
would skip argv construction, which is precisely where finding SEC-3 lives.

What this deliberately does NOT emulate: Taskwarrior's real urgency algorithm, its date
parsing, and the full semantics of its filter DSL. Those belong to the binary, and the
container tier pins them against the real thing. A fake that claimed to reproduce them
would be asserting its own behaviour rather than the product's.
"""

from __future__ import annotations

import json
import uuid as uuidlib
from typing import Any

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

    def __init__(self) -> None:
        self.stores: dict[str, list[dict[str, Any]]] = {}
        self.calls: list[tuple[str, list[str]]] = []

    # -- the seam ---------------------------------------------------------------

    def run(self, username: str, args: list[str]) -> str:
        """Drop-in replacement for ``task_runner._run``."""
        self.calls.append((username, list(args)))
        tasks = self.stores.setdefault(username, [])

        if args and args[-1] == "export":
            return json.dumps(self._filter(tasks, args[:-1]))
        if args and args[0] == "add":
            return self._add(tasks, args[1:])
        if len(args) >= 2:
            target, command = args[0], args[1]
            task = self._by_uuid(tasks, target)
            if task is None:
                raise FakeTaskError(f"no task matches {target}")
            if command == "modify":
                return self._modify(task, args[2:])
            if command == "done":
                task["status"] = "completed"
                return "Completed 1 task."
            if command == "delete":
                task["status"] = "deleted"
                return "Deleted 1 task."
            if command == "start":
                task["start"] = "20260804T090000Z"
                return "Started 1 task."
            if command == "stop":
                task.pop("start", None)
                return "Stopped 1 task."
            if command == "annotate":
                task.setdefault("annotations", []).append(
                    {"entry": "20260804T090000Z", "description": " ".join(args[2:])}
                )
                return "Annotated 1 task."
        raise FakeTaskError(f"unsupported argv: {args!r}")

    # -- mutation ---------------------------------------------------------------

    def _add(self, tasks: list[dict[str, Any]], args: list[str]) -> str:
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
        self._apply(task, args)
        tasks.append(task)
        return f"Created task {task['id']}."

    def _modify(self, task: dict[str, Any], args: list[str]) -> str:
        self._apply(task, args)
        return "Modified 1 task."

    def _apply(self, task: dict[str, Any], args: list[str]) -> None:
        words: list[str] = []
        for arg in args:
            if arg.startswith("+"):
                tag = arg[1:]
                if tag not in task["tags"]:
                    task["tags"].append(tag)
            elif arg.startswith("-"):
                task["tags"] = [t for t in task["tags"] if t != arg[1:]]
            elif ":" in arg:
                key, _, value = arg.partition(":")
                if key == "depends":
                    task["depends"] = [d for d in value.split(",") if d] if value else []
                elif value == "":
                    task.pop(key, None)
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

    def _filter(self, tasks: list[dict[str, Any]], filters: list[str]) -> list[dict[str, Any]]:
        result = list(tasks)
        for f in filters:
            if f == "status:pending":
                result = [t for t in result if t["status"] == "pending"]
            elif f == "-TAGGED":
                result = [t for t in result if not t["tags"]]
            elif f == "-project":
                result = [t for t in result if not t.get("project")]
            elif f.startswith("+"):
                result = [t for t in result if f[1:] in t["tags"]]
            elif f.startswith("project:"):
                result = [t for t in result if t.get("project") == f[len("project:") :]]
            elif f.startswith("description:"):
                wanted = f[len("description:") :]
                result = [t for t in result if t["description"] == wanted]
            elif f.startswith("status:"):
                result = [t for t in result if t["status"] == f[len("status:") :]]
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


def _looks_like_uuid(value: str) -> bool:
    try:
        uuidlib.UUID(value)
    except ValueError:
        return False
    return True
