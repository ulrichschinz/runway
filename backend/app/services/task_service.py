import re
from typing import Literal

from app.models import Task, TaskCreate, TaskModify
from app.services import task_runner

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
)

VALID_PRIORITIES = {"H", "M", "L"}
# A tag we write or filter on (D3). Letters include umlauts (Python's Unicode `\w`); the first
# character is a letter, `_` or `@`, because Taskwarrior reads a leading `+`/`-` as a modifier
# and a leading digit or `.` as description text (`+1abc` becomes text, verified on 3.5.0).
# A comma is refused: `+@home,@office` is stored as ONE tag, never two.
TAG_RE = re.compile(r"^(?:@|[^\W\d])[\w@.-]*$")

# A tag Taskwarrior already holds, checked only when it is removed. Looser than TAG_RE after the
# first character, so legacy tags such as `@home,@office` or `a/b` stay removable, while nothing
# that could reshape the `-tag` modifier (whitespace, a sign, `:`, parentheses, quotes) gets
# through. The first character is a letter, `_`, `@`, `$` or `#`: Taskwarrior 3.5.0 reads `-1abc`,
# `-.x`, `-/a/`, `-[a]` and the like as description text, so `modify -1abc` would overwrite the
# description and keep the tag (verified). Such a tag cannot be removed through runway (400).
EXISTING_TAG_RE = re.compile(r"^(?:[^\W\d]|[@$#])[^\s():\"']*$")


def _validate_uuid(uuid: str) -> str:
    if not UUID_RE.match(uuid):
        raise ValueError(f"Invalid UUID: {uuid}")
    return uuid


def _validate_tag(tag: str) -> str:
    # fullmatch, not match: `$` also matches before a trailing newline.
    if not TAG_RE.fullmatch(tag):
        raise ValueError(f"Invalid tag: {tag}")
    return tag


def _validate_existing_tag(tag: str) -> str:
    if not EXISTING_TAG_RE.fullmatch(tag):
        raise ValueError(f"Invalid tag: cannot remove tag {tag!r}")
    return tag


def _tag_diff(current: list[str], desired: set[str]) -> tuple[list[str], list[str]]:
    """The (removals, additions) that turn `current` into `desired`.

    Only the difference is validated: a tag the task already carries and keeps is never
    checked, so a task holding a legacy tag stays editable from the web UI, which resends
    the full set on every save (D3).
    """
    have = set(current)
    removes = [_validate_existing_tag(t) for t in sorted(have - desired)]
    adds = [_validate_tag(t) for t in sorted(desired - have)]
    return removes, adds


def _depends_diff(current: list[str], desired: list[str]) -> list[str]:
    """Modifiers that turn `current` dependencies into `desired`.

    `depends:X` only ever adds on Taskwarrior 3.5; `depends:-X` removes one (verified).
    """
    wanted = {_validate_uuid(d) for d in desired}
    have = set(current)
    return [f"depends:-{d}" for d in sorted(have - wanted)] + [
        f"depends:{d}" for d in sorted(wanted - have)
    ]


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
    mode: Literal["create", "modify"],
) -> tuple[list[str], list[str]]:
    """Split a change into (modifiers, free text).

    Taskwarrior parses everything before `--` and treats everything after it as text, so the
    two cannot be interleaved. Returning them separately makes the trust boundary explicit in
    the type: modifiers are built here from validated values, free text is whatever the user
    typed and never reaches a parsed position (finding SEC-3).

    Tags and dependencies are emitted here only on create. On modify they are a set to
    reach from the task's current one, which needs a read first; `modify_task` does that.
    """
    mods: list[str] = []
    text: list[str] = [description] if description is not None else []
    args = mods  # modifiers only, from here down
    # One clear semantic for every scalar field (D7): on modify `""` emits `field:`, which
    # Taskwarrior reads as "remove it"; on create there is nothing to clear, so `""` is "not
    # given". Clearing recur or due on a recurring task is refused by Taskwarrior (rc 2, 400).
    fields = {
        "project": project,
        "priority": priority,
        "due": due,
        "scheduled": scheduled,
        "wait": wait,
        "until": until,
        "recur": recur,
    }
    for name, value in fields.items():
        if value is None or (value == "" and mode == "create"):
            continue
        if value == "":
            args.append(f"{name}:")
            continue
        if name == "priority" and value not in VALID_PRIORITIES:
            raise ValueError(f"Invalid priority: {value}")
        if name == "recur":
            if not VALID_RECUR_RE.match(value.strip()):
                raise ValueError(f"Invalid recur value: {value}")
            value = value.strip()
        args.append(f"{name}:{value}")
    if mode == "create":
        for tag in tags or []:
            args.append(f"+{_validate_tag(tag)}")
        for dep in depends or []:
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
        mode="create",
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
    """Change the fields that are set; leave the rest alone.

    `tags` is the complete desired set, `tags_add`/`tags_remove` are deltas, and `depends`
    is a complete set too. Each set is reached from the task's current one by emitting
    `-tag`/`+tag` and `depends:-uuid`/`depends:uuid` as modifiers, before `--`: after it they
    would become description text. Before this, modify only ever added, so a tag or a
    dependency could never be removed.
    """
    _validate_uuid(uuid)
    if task.tags is not None and (task.tags_add or task.tags_remove):
        raise ValueError("Send either tags (full set) or tags_add/tags_remove, not both")
    tags_add = [_validate_tag(t) for t in task.tags_add or []]
    tags_remove = [_validate_existing_tag(t) for t in task.tags_remove or []]
    mods, text = _build_args(
        task.description,
        task.project,
        None,
        task.priority,
        task.due,
        task.scheduled,
        task.wait,
        task.until,
        task.recur,
        None,
        mode="modify",
    )
    if task.tags is not None or tags_add or tags_remove or task.depends is not None:
        # Read by uuid, which matches regardless of status, so a task hidden by a future
        # `wait` is re-tagged like any other.
        current = get_task(username, uuid)
        if task.tags is not None or tags_add or tags_remove:
            if task.tags is not None:
                desired = set(task.tags)
            else:
                desired = (set(current.tags) | set(tags_add)) - set(tags_remove)
            removes, adds = _tag_diff(current.tags, desired)
            mods += [f"-{t}" for t in removes] + [f"+{t}" for t in adds]
        if task.depends is not None:
            if not task.depends:
                mods.append("depends:")
            else:
                mods += _depends_diff(current.depends, task.depends)

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
