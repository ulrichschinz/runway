import re

from app.models import Task, TaskCreate, TaskModify
from app.services import task_runner

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
)

VALID_PRIORITIES = {"H", "M", "L"}
VALID_TAG_RE = re.compile(r"^[a-zA-Z0-9_@.-]+$")


def _validate_uuid(uuid: str) -> str:
    if not UUID_RE.match(uuid):
        raise ValueError(f"Invalid UUID: {uuid}")
    return uuid


def _validate_tag(tag: str) -> str:
    if not VALID_TAG_RE.match(tag):
        raise ValueError(f"Invalid tag: {tag}")
    return tag


def _raw_to_task(raw: dict) -> Task:
    return Task(
        uuid=raw["uuid"],
        id=raw.get("id", 0),
        description=raw["description"],
        status=raw["status"],
        urgency=raw.get("urgency", 0.0),
        project=raw.get("project"),
        tags=raw.get("tags", []),
        priority=raw.get("priority"),
        due=raw.get("due"),
        scheduled=raw.get("scheduled"),
        wait=raw.get("wait"),
        until=raw.get("until"),
        recur=raw.get("recur"),
        depends=raw.get("depends", []),
        annotations=raw.get("annotations", []),
        start=raw.get("start"),
        entry=raw.get("entry"),
        modified=raw.get("modified"),
    )


def list_tasks(username: str, filter_args: list[str] | None = None) -> list[Task]:
    raw_list = task_runner.export_tasks(username, filter_args)
    tasks = [_raw_to_task(r) for r in raw_list]
    tasks.sort(key=lambda t: t.urgency, reverse=True)
    return tasks


def get_task(username: str, uuid: str) -> Task:
    _validate_uuid(uuid)
    raw_list = task_runner.export_tasks(username, [uuid])
    if not raw_list:
        raise ValueError("Task not found")
    return _raw_to_task(raw_list[0])


VALID_RECUR_RE = re.compile(
    r"^[0-9]*\s*(daily|weekly|monthly|yearly|days?|weeks?|months?|years?|[0-9]+[dwmy])$",
    re.IGNORECASE,
)


def _build_args(
    description: str | None,
    project: str | None,
    tags: list[str] | None,
    priority: str | None,
    due: str | None,
    scheduled: str | None,
    wait: str | None,
    until: str | None,
    recur: str | None,
    depends: list[str] | None,
) -> tuple[list[str], list[str]]:
    """Split a change into (modifiers, free text).

    Taskwarrior parses everything before `--` and treats everything after it as text, so the
    two cannot be interleaved. Returning them separately makes the trust boundary explicit in
    the type: modifiers are built here from validated values, free text is whatever the user
    typed and never reaches a parsed position (finding SEC-3).
    """
    mods: list[str] = []
    text: list[str] = [description] if description is not None else []
    args = mods  # modifiers only, from here down
    if project is not None:
        args.append(f"project:{project}")
    if priority is not None:
        if priority not in VALID_PRIORITIES:
            raise ValueError(f"Invalid priority: {priority}")
        args.append(f"priority:{priority}")
    if due is not None:
        args.append(f"due:{due}")
    if scheduled is not None:
        args.append(f"scheduled:{scheduled}")
    if wait is not None:
        args.append(f"wait:{wait}")
    if until is not None:
        args.append(f"until:{until}")
    if recur is not None and recur != "":
        if not VALID_RECUR_RE.match(recur.strip()):
            raise ValueError(f"Invalid recur value: {recur}")
        args.append(f"recur:{recur.strip()}")
    if tags is not None:
        for tag in tags:
            args.append(f"+{_validate_tag(tag)}")
    if depends is not None:
        for dep in depends:
            args.append(f"depends:{_validate_uuid(dep)}")
    return mods, text


def create_task(username: str, task: TaskCreate) -> Task:
    mods, text = _build_args(
        task.description,
        task.project,
        task.tags,
        task.priority,
        task.due,
        task.scheduled,
        task.wait,
        task.until,
        task.recur,
        task.depends,
    )
    task_runner.add_task(username, mods, text)

    # Read back by Taskwarrior's own +LATEST virtual tag rather than by re-querying the
    # description. The old form put the user's text into a *filter* position — the one place
    # the `--` separator cannot protect — so the same string was an injection surface twice,
    # and it silently returned the wrong task whenever two tasks shared a description.
    latest = task_runner.export_latest(username)
    if latest:
        return _raw_to_task(latest[0])
    return list_tasks(username)[0]


def modify_task(username: str, uuid: str, task: TaskModify) -> Task:
    _validate_uuid(uuid)
    mods, text = _build_args(
        task.description,
        task.project,
        task.tags,
        task.priority,
        task.due,
        task.scheduled,
        task.wait,
        task.until,
        task.recur,
        task.depends,
    )
    # Clear fields when explicitly set to empty
    if task.recur == "":
        mods.append("recur:")
    if task.depends is not None and len(task.depends) == 0:
        mods.append("depends:")
    if not mods and not text:
        return get_task(username, uuid)
    task_runner.modify_task(username, uuid, mods, text)
    return get_task(username, uuid)


def complete_task(username: str, uuid: str) -> None:
    _validate_uuid(uuid)
    task_runner.done_task(username, uuid)


def remove_task(username: str, uuid: str) -> None:
    _validate_uuid(uuid)
    task_runner.delete_task(username, uuid)


def start_task(username: str, uuid: str) -> Task:
    _validate_uuid(uuid)
    task_runner.start_task(username, uuid)
    return get_task(username, uuid)


def stop_task(username: str, uuid: str) -> Task:
    _validate_uuid(uuid)
    task_runner.stop_task(username, uuid)
    return get_task(username, uuid)


def annotate_task(username: str, uuid: str, text: str) -> Task:
    _validate_uuid(uuid)
    task_runner.annotate_task(username, uuid, text)
    return get_task(username, uuid)


def project_names(username: str) -> list[str]:
    """Distinct project names across a user's pending tasks, in first-seen order.

    Exists so routers never reach the Taskwarrior adapter directly: every call to the
    subprocess goes through this layer, which is where validation lives. The GTD router
    previously imported task_runner.export_tasks itself, which is the boundary breach
    RULE-ARCH-001 now forbids.
    """
    seen: dict[str, None] = {}
    for raw in task_runner.export_tasks(username, ["status:pending"]):
        project = raw.get("project")
        if project:
            seen[project] = None
    return list(seen.keys())
