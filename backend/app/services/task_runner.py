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

import json
import os
import re
import subprocess

from app.config import settings

# A configuration override. Taskwarrior honours these anywhere in the argument list.
_RC_OVERRIDE = re.compile(r"^rc\.", re.IGNORECASE)

# The three overrides this module supplies itself. Everything else is refused.
_OWN_OVERRIDES = ("rc.json.array=on", "rc.confirmation=off", "rc.verbose=nothing")

# Free text is passed after this. Taskwarrior stops interpreting options at it.
SEPARATOR = "--"


class UnsafeArgument(ValueError):
    """A caller tried to put a configuration override into the Taskwarrior argv."""


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


def _run(username: str, args: list[str], text: list[str] | None = None) -> str:
    """Invoke `task` for one user.

    `args` are structural: filters, subcommands, modifiers — parsed by Taskwarrior.
    `text` is free text supplied by a user and is placed after `--`, where it cannot be
    interpreted as anything else.
    """
    reject_structural_tokens(args)

    user_data_dir = settings.data_root / username
    taskrc_path = user_data_dir / ".taskrc"

    env = {
        **os.environ,
        "TASKDATA": str(user_data_dir),
        "TASKRC": str(taskrc_path),
        "HOME": str(user_data_dir),
    }

    cmd = ["task", *_OWN_OVERRIDES, *args]
    if text:
        cmd += [SEPARATOR, *text]

    result = subprocess.run(  # noqa: S603  # argv is validated above; shell=False by list form
        cmd,
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
        # shell=False is the default when passing a list — shell injection is impossible
    )

    if result.returncode not in (0, 1):
        raise RuntimeError(result.stderr.strip() or "task command failed")

    return result.stdout


def export_tasks(username: str, filter_args: list[str] | None = None) -> list[dict]:
    args = [*(filter_args or []), "export"]
    raw = _run(username, args)
    if not raw.strip():
        return []
    return json.loads(raw)


def export_latest(username: str) -> list[dict]:
    """The task most recently added, via Taskwarrior's own `+LATEST` virtual tag.

    Replaces re-querying by description text, which put user input into a *filter* position —
    the one place `--` cannot protect, and a second injection surface for the same string.
    """
    return export_tasks(username, ["+LATEST"])


def add_task(username: str, mods: list[str], text: list[str]) -> str:
    return _run(username, ["add", *mods], text)


def modify_task(username: str, uuid: str, mods: list[str], text: list[str] | None = None) -> str:
    return _run(username, [uuid, "modify", *mods], text)


def done_task(username: str, uuid: str) -> str:
    return _run(username, [uuid, "done"])


def delete_task(username: str, uuid: str) -> str:
    return _run(username, [uuid, "delete"])


def start_task(username: str, uuid: str) -> str:
    return _run(username, [uuid, "start"])


def stop_task(username: str, uuid: str) -> str:
    return _run(username, [uuid, "stop"])


def annotate_task(username: str, uuid: str, text: str) -> str:
    return _run(username, [uuid, "annotate"], [text])
