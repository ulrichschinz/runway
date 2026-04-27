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


VALID_RECUR_RE = re.compile(r"^[0-9]*\s*(daily|weekly|monthly|yearly|days?|weeks?|months?|years?|[0-9]+[dwmy])$", re.IGNORECASE)


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
) -> list[str]:
    args: list[str] = []
    if description is not None:
        args.append(description)
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
    return args


def create_task(username: str, task: TaskCreate) -> Task:
    args = _build_args(
        task.description, task.project, task.tags, task.priority,
        task.due, task.scheduled, task.wait, task.until, task.recur, task.depends,
    )
    task_runner.add_task(username, args)
    tasks = list_tasks(username, ["description:" + task.description])
    return tasks[0] if tasks else list_tasks(username)[0]


def modify_task(username: str, uuid: str, task: TaskModify) -> Task:
    _validate_uuid(uuid)
    args = _build_args(
        task.description, task.project, task.tags, task.priority,
        task.due, task.scheduled, task.wait, task.until, task.recur, task.depends,
    )
    # Clear fields when explicitly set to empty
    if task.recur == "":
        args.append("recur:")
    if task.depends is not None and len(task.depends) == 0:
        args.append("depends:")
    if not args:
        return get_task(username, uuid)
    task_runner.modify_task(username, uuid, args)
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
