import subprocess
import os
import json
from pathlib import Path
from app.config import settings


def _run(username: str, args: list[str]) -> str:
    user_data_dir = settings.data_root / username
    taskrc_path = user_data_dir / ".taskrc"

    env = {
        **os.environ,
        "TASKDATA": str(user_data_dir),
        "TASKRC": str(taskrc_path),
        "HOME": str(user_data_dir),
    }

    cmd = ["task", "rc.json.array=on", "rc.confirmation=off", "rc.verbose=nothing", *args]

    result = subprocess.run(
        cmd,
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
        # shell=False is the default when passing a list — injection is impossible
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


def add_task(username: str, args: list[str]) -> str:
    return _run(username, ["add", *args])


def modify_task(username: str, uuid: str, args: list[str]) -> str:
    return _run(username, [uuid, "modify", *args])


def done_task(username: str, uuid: str) -> str:
    return _run(username, [uuid, "done"])


def delete_task(username: str, uuid: str) -> str:
    return _run(username, [uuid, "delete"])


def start_task(username: str, uuid: str) -> str:
    return _run(username, [uuid, "start"])


def stop_task(username: str, uuid: str) -> str:
    return _run(username, [uuid, "stop"])


def annotate_task(username: str, uuid: str, text: str) -> str:
    return _run(username, [uuid, "annotate", text])
