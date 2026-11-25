"""The single place this application invokes the Taskwarrior binary.

Every argument reaching `task` passes through `_run`, which is what makes the hardening
below a control rather than a convention: there is one door, and it is guarded.

**What the boundary is defending.** Taskwarrior consumes `rc.<key>=<value>` anywhere in its
argument list as a runtime configuration override, including `rc.data.location`, which
chooses *which data store it opens*. Per-user isolation here rests entirely on the TASKDATA
environment variable pointing at one user's directory, so a user-supplied token of that shape
is not a formatting nuisance — it is the only tenancy boundary the system has, addressable
from a task description (finding SEC-3).

Confirmed against the real binary (Taskwarrior 3.5.0) on 2026-08-25, not assumed:

    task add rc.data.location=/tmp/victim hello   ->  /tmp/victim/taskchampion.sqlite3 created
    task add -- rc.data.location=/tmp/victim hello ->  stored as literal description text

**Two controls, in order.**

1. `--` terminates option parsing. Everything after it is free text, so an `rc.` override in
   a description is inert *by Taskwarrior's own grammar* rather than by our filtering. This
   is the primary control: it does not depend on us enumerating dangerous shapes correctly.
   Modifiers must therefore precede it — `task add project:x +tag -- <description>` — because
   anything after `--` becomes description.
2. `reject_structural_tokens` refuses `rc.`-shaped tokens in the caller-supplied argument
   list. Defence in depth for the positions `--` cannot cover: filters and modifiers, which
   have to stay parseable and so cannot sit behind a separator.

Before this, containment was an accident: every command able to carry an override also
required free text, and the override consumed it, so writes failed. That is a property of a
third-party argument grammar, not a control we own, and it could change in any release.
"""

import errno
import json
import logging
import os
import re
import subprocess

from app.task_storage import TaskStore

logger = logging.getLogger(__name__)

# A configuration override. Taskwarrior honours these anywhere in the argument list.
_RC_OVERRIDE = re.compile(r"^rc\.", re.IGNORECASE)

# The overrides this module supplies itself. Everything else is refused.
# `rc.recurrence.confirmation=no`: modifying one instance of a recurring task otherwise asks
# "modify all pending recurrences? (yes/no)" and waits for an answer (Taskwarrior 3.5.0).
# With it, only the instance changes (verified); stdin is /dev/null as a second guard.
_OWN_OVERRIDES = (
    "rc.json.array=on",
    "rc.confirmation=off",
    "rc.verbose=nothing",
    "rc.recurrence.confirmation=no",
)

# Exit code 2 is Taskwarrior 3.5.0's generic error code, not only its refusal of input: it
# also exits 2 when it cannot reach its own store. Each pattern below is stderr observed on
# 3.5.0 for such a fault (2026-09-19): a missing rc file; a data directory it cannot create
# ("Task Database Error: Cannot create directory ..."); and every sqlite failure, which it
# reports with sqlite's "Error code N" — unable to open, read-only, corrupt, locked. These
# are the server's fault, not the caller's, and their stderr can carry the absolute data path.
_SYSTEM_FAULT = re.compile(
    r"Error code \d+"
    r"|Task Database Error"
    r"|database is locked"
    r"|unable to open database"
    r"|readonly database"
    r"|Cannot proceed without rc file",
    re.IGNORECASE,
)

# What a 500 for such a fault says. The stderr goes to the log, never to the caller.
_SYSTEM_FAULT_MESSAGE = "Taskwarrior could not access its data store"

# What a 400 says when Taskwarrior's own refusal would name the data path. The stderr is logged.
_DATA_PATH_REFUSAL = "Taskwarrior refused a value: it is not a valid date or value here"

# Free text is passed after this. Taskwarrior stops interpreting options at it.
SEPARATOR = "--"


class UnsafeArgument(ValueError):
    """A caller tried to put a configuration override into the Taskwarrior argv."""


class TaskwarriorRejected(ValueError):
    """Taskwarrior refused the command: the input, not the system, is wrong.

    A bad date, a priority outside the configured values, `recur` without `due`, clearing
    `recur` or `due` on a recurring task. Raised for exit code 2 unless the stderr matches
    `_SYSTEM_FAULT` — 2 is Taskwarrior's generic error code and also covers a locked, corrupt
    or unreachable store, which stays a RuntimeError. A ValueError, so every router maps it
    to 400; before this it surfaced as a 500. The message is Taskwarrior's stderr; for the
    input refusals checked on 3.5.0 it names the offending value and nothing about the server.
    The exception is a value the binary *evaluates*: a DOM reference such as `rc.data.location`
    is echoed as the store's absolute path. A stderr naming the data directory is therefore
    replaced by `_DATA_PATH_REFUSAL` and logged (second review of brief 0074).
    """


class ArgumentTooLong(Exception):
    """The kernel refused to start `task` because one argument, or the whole argv, is too long.

    `execve` fails with E2BIG past `MAX_ARG_STRLEN` (131 072 bytes for one argument on Linux) or
    past the total argument budget. The request models bound every field far below that
    (RISK-SEC-004, brief 0073), so this is defence in depth: it is the caller's input, not a fault
    of the system, and `app.main` answers it with 413 instead of the 500 an OSError used to be.
    Neither a ValueError nor a RuntimeError on purpose, so no router's mapping catches it first.
    """


def reject_structural_tokens(args: list[str]) -> None:
    """Refuse anything that would reconfigure Taskwarrior rather than address a task.

    Applied to modifier and filter positions, which cannot sit behind `--` because they must
    stay parseable. Free text does not need this — the separator already makes it inert — but
    it costs nothing to leave the check in front of every caller-supplied list.
    """
    for token in args:
        if _RC_OVERRIDE.match(token):
            raise UnsafeArgument(
                f"{token!r} is a Taskwarrior configuration override, not task data. "
                "Overrides can redirect the data store and are refused here."
            )


def _run(store: TaskStore, args: list[str], text: list[str] | None = None) -> str:
    """Invoke `task` for one account's store.

    `store` is a directory `task_storage.resolve` has already checked — never a username.
    Until brief 0065 this took the username and joined it onto the data root itself, which is
    how `alice/../alice` became alice's store (finding SEC-001). The type is the control: there
    is no name here left to turn into a path.

    `args` are structural: filters, subcommands, modifiers — parsed by Taskwarrior.
    `text` is free text supplied by a user and is placed after `--`, where it cannot be
    interpreted as anything else.
    """
    reject_structural_tokens(args)

    env = {
        **os.environ,
        "TASKDATA": str(store.path),
        "TASKRC": str(store.taskrc),
        "HOME": str(store.path),
    }

    cmd = ["task", *_OWN_OVERRIDES, *args]
    if text:
        cmd += [SEPARATOR, *text]

    try:
        result = subprocess.run(  # noqa: S603  # argv is validated above; shell=False by list form
            cmd,
            env=env,
            capture_output=True,
            text=True,
            timeout=10,
            # Never the server's terminal: a prompt must not wait for an answer (see above).
            stdin=subprocess.DEVNULL,
            # shell=False is the default when passing a list — shell injection is impossible
        )
    except OSError as failure:
        if failure.errno == errno.E2BIG:
            # Sizes only: the argument is user text and stays out of the log.
            logger.warning(
                "taskwarrior argument list refused by the kernel",
                extra={"argv_items": len(cmd), "argv_bytes": sum(len(a.encode()) for a in cmd)},
            )
            raise ArgumentTooLong("A value is too long for the task store") from failure
        raise

    if result.returncode == 2:
        stderr = result.stderr.strip()
        if _SYSTEM_FAULT.search(stderr):
            # Not the caller's error, and the stderr may name the data path: log it, 500.
            logger.error("taskwarrior store fault (rc 2): %s", stderr)
            raise RuntimeError(_SYSTEM_FAULT_MESSAGE)
        if str(store.path.parent) in stderr:
            # An input refusal that names the server's data directory: the binary evaluated a
            # DOM reference such as `rc.data.location` inside a value (second review of brief
            # 0074). The service grammar refuses those; this holds if something slips past it.
            logger.warning("taskwarrior refusal named the data path (rc 2): %s", stderr)
            raise TaskwarriorRejected(_DATA_PATH_REFUSAL)
        raise TaskwarriorRejected(stderr or "Taskwarrior rejected the command")
    if result.returncode not in (0, 1):
        raise RuntimeError(result.stderr.strip() or "task command failed")

    return result.stdout


def export_tasks(store: TaskStore, filter_args: list[str] | None = None) -> list[dict]:
    args = [*(filter_args or []), "export"]
    raw = _run(store, args)
    if not raw.strip():
        return []
    return json.loads(raw)


def export_latest(store: TaskStore) -> list[dict]:
    """The task most recently added, via Taskwarrior's own `+LATEST` virtual tag.

    Replaces re-querying by description text, which put user input into a *filter* position —
    the one place `--` cannot protect, and a second injection surface for the same string.
    """
    return export_tasks(store, ["+LATEST"])


def add_task(store: TaskStore, mods: list[str], text: list[str]) -> str:
    return _run(store, ["add", *mods], text)


def modify_task(store: TaskStore, uuid: str, mods: list[str], text: list[str] | None = None) -> str:
    return _run(store, [uuid, "modify", *mods], text)


def done_task(store: TaskStore, uuid: str) -> str:
    return _run(store, [uuid, "done"])


def delete_task(store: TaskStore, uuid: str) -> str:
    return _run(store, [uuid, "delete"])


def start_task(store: TaskStore, uuid: str) -> str:
    return _run(store, [uuid, "start"])


def stop_task(store: TaskStore, uuid: str) -> str:
    return _run(store, [uuid, "stop"])


def annotate_task(store: TaskStore, uuid: str, text: str) -> str:
    return _run(store, [uuid, "annotate"], [text])
