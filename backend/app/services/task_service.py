import os
import re
from datetime import UTC, date, datetime, tzinfo
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.models import Task, TaskCreate, TaskModify, validate_project_name
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

# Which tasks a list sees, against Taskwarrior 3.5 (ADR 0036). A task whose `wait` lies in the
# future is hidden: `status:pending` no longer matches it, `status:waiting` does, and its export
# still says "pending". So PENDING means visible, HIDDEN means parked until a future date, and
# OPEN is both. Module constants, never interpolated: nothing a caller sends reaches them.
PENDING = ["status:pending"]
HIDDEN = ["status:waiting"]
OPEN = ["(", "status:pending", "or", "status:waiting", ")"]
COMPLETED = ["status:completed"]
# Everything a user still owns: the three statuses above, which is deliberately not "no
# filter at all". An unfiltered export also returns deleted tasks and the recurring parent
# template (status `recurring`, one row that is not a task anybody does) — verified on 3.5.0.
ALL = ["(", "status:pending", "or", "status:waiting", "or", "status:completed", ")"]

# What `status=` on the task list means (D12). `waiting` is Taskwarrior's waiting — a future
# `wait` date — not the `+waiting` GTD tag; `/gtd/waiting` is the tag.
TaskStatus = Literal["pending", "waiting", "completed", "all"]
_STATUS_FILTERS: dict[str, list[str]] = {
    "pending": PENDING,
    "waiting": HIDDEN,
    "completed": COMPLETED,
    "all": ALL,
}

# The GTD lists. The inbox is "no tag and no project": `project:` (empty) is "has no project";
# `-project` would mean "not tagged `project`" on 3.5 and let every untagged project task in.
GtdView = Literal["inbox", "next", "waiting", "someday", "tickler"]
_VIEW_FILTERS: dict[str, list[str]] = {
    "inbox": [*PENDING, "-TAGGED", "project:"],
    "next": [*PENDING, "+next"],
    "waiting": [*OPEN, "+waiting"],
    "someday": [*PENDING, "+someday"],
    "tickler": HIDDEN,
}

# At most this many tags in one list filter, and at most this many characters each. The
# tag regex bounds the alphabet but not the length, and a filter value is one of the few
# positions `--` cannot protect (RISK-SEC-004).
MAX_FILTER_TAGS = 10
MAX_FILTER_TAG_LENGTH = 100

# The stored form of every Taskwarrior date: UTC, basic ISO 8601.
_TW_STAMP = "%Y%m%dT%H%M%SZ"
_DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# How many tasks one list call may return at most, and the default of no limit.
MAX_LIMIT = 500


def _zone() -> tzinfo:
    """The server's zone as *rules*, not as today's offset (D10).

    `datetime.now().astimezone().tzinfo` is a fixed-offset snapshot of the moment it was
    taken — `CEST` (+02:00) in July, `CET` (+01:00) in December. Converting a stamp from
    the *other* half of the year with it lands a calendar day out, which is exactly the
    off-by-one the Berlin clock exists to remove: a bare `due:2026-07-15` is stored as
    `20260714T220000Z`, and read back with a +01:00 snapshot that is the 14th. `ZoneInfo`
    carries the transitions, so the conversion asks the rule that held at the stamp's own
    instant. `TZ` is what libc and the `task` binary read, so naming it here keeps the
    application, the binary and the compose declaration on one zone.
    """
    name = os.environ.get("TZ", "").lstrip(":")
    if name:
        try:
            return ZoneInfo(name)
        except (ZoneInfoNotFoundError, ValueError):
            pass  # an unset-by-rule or unknown TZ: fall back to what libc resolved
    return datetime.now().astimezone().tzinfo or UTC


def _now() -> datetime:
    """The one clock (D10): the server's local time, aware. Tests replace it with the fake's."""
    return datetime.now(_zone())


def _parse_tw(stamp: str) -> datetime:
    """A stored Taskwarrior timestamp as an aware datetime."""
    return datetime.strptime(stamp, _TW_STAMP).replace(tzinfo=UTC)


def _local_day(stamp: str) -> date:
    """The calendar day a stored timestamp falls on, in the server's zone (D10).

    Taskwarrior stores UTC and interprets a bare `YYYY-MM-DD` locally, so "due today" is a
    local-day question. The zone comes from `_now()`, the one clock, which tests replace —
    and which carries the zone's rules rather than one offset, so a stamp from the other
    side of a DST transition still lands on the day the binary wrote it (see `_zone`).
    """
    return _parse_tw(stamp).astimezone(_now().tzinfo).date()


def _validate_day(value: str) -> date:
    """A `YYYY-MM-DD` filter value. Taskwarrior's own date grammar is far wider (`eom`,
    `now+3d`); none of it reaches the binary, because these filters run in Python."""
    if not _DAY_RE.fullmatch(value):
        raise ValueError(f"Invalid date: {value!r}; use YYYY-MM-DD")
    try:
        return date.fromisoformat(value)
    except ValueError as e:
        raise ValueError(f"Invalid date: {value!r}; use YYYY-MM-DD") from e


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
        end=raw.get("end"),
    )


def _tag_filters(tags: list[str] | None) -> list[str]:
    """`+tag` filter tokens, AND-ed; each tag validated like one we would write (D3)."""
    tags = list(tags or [])
    if len(tags) > MAX_FILTER_TAGS:
        raise ValueError(f"At most {MAX_FILTER_TAGS} tags per filter")
    for t in tags:
        if len(t) > MAX_FILTER_TAG_LENGTH:
            raise ValueError(f"Tag too long: at most {MAX_FILTER_TAG_LENGTH} characters")
    return [f"+{_validate_tag(t)}" for t in tags]


def list_tasks(username: str, filter_args: list[str] | None = None) -> list[Task]:
    raw_list = task_runner.export_tasks(username, filter_args)
    tasks = [_raw_to_task(r) for r in raw_list]
    tasks.sort(key=lambda t: t.urgency, reverse=True)
    return tasks


def search_tasks(
    username: str,
    *,
    status: str | None = None,
    include_done: bool | None = None,
    project: str | None = None,
    tags: list[str] | None = None,
    due_before: str | None = None,
    due_after: str | None = None,
    scheduled_before: str | None = None,
    completed_since: str | None = None,
    q: str | None = None,
    limit: int | None = None,
) -> list[Task]:
    """The task list with filters (ADR 0038).

    Two kinds of filter, kept apart on purpose:

    * **Taskwarrior's** — status, project and tags. Each value is validated before it is
      built into a token, because a filter is one of the two positions `--` cannot protect.
      The project match is `project.is:`, which is exact; the older `project:` is a prefix
      match, so `alpha` also returned `alpha.sub` and `alphabet`.
    * **Ours** — the four date filters, the text search and `limit`, applied in Python over
      the exported tasks. Taskwarrior's date grammar is a language of its own (`eom`,
      `now+3d`, `due.before`), and none of it needs to reach the binary for "the day before
      D". `q` stays here for a second reason: a description filter would put the user's own
      words into a filter position, the one place `--` cannot protect, and Taskwarrior would
      read `(`, `or` or `rc.` in them as grammar.

    Every value is validated before anything is exported, so a refused call never runs
    `task` at all.
    """
    if include_done and status is not None:
        raise ValueError("Send either status or include_done, not both")
    if status is None:
        if include_done:
            status = "all"
        elif completed_since is not None:
            status = "completed"
        else:
            status = "pending"
    if status not in _STATUS_FILTERS:
        raise ValueError(f"Invalid status: {status}")
    if completed_since is not None and status in ("pending", "waiting"):
        raise ValueError("completed_since needs status=completed or status=all")
    if limit is not None and not 1 <= limit <= MAX_LIMIT:
        raise ValueError(f"limit must be between 1 and {MAX_LIMIT}")

    days = {
        name: _validate_day(value)
        for name, value in (
            ("due_before", due_before),
            ("due_after", due_after),
            ("scheduled_before", scheduled_before),
            ("completed_since", completed_since),
        )
        if value is not None
    }

    filters = list(_STATUS_FILTERS[status])
    if project is not None:
        filters.append(f"project.is:{validate_project_name(project)}")
    filters += _tag_filters(tags)

    tasks = list_tasks(username, filters)
    if "due_before" in days:
        tasks = [t for t in tasks if t.due and _local_day(t.due) < days["due_before"]]
    if "due_after" in days:
        tasks = [t for t in tasks if t.due and _local_day(t.due) > days["due_after"]]
    if "scheduled_before" in days:
        tasks = [
            t for t in tasks if t.scheduled and _local_day(t.scheduled) < days["scheduled_before"]
        ]
    if "completed_since" in days:
        tasks = [t for t in tasks if t.end and _local_day(t.end) >= days["completed_since"]]
    if q:
        needle = q.casefold()
        tasks = [t for t in tasks if needle in t.description.casefold()]

    if status == "completed":
        # Urgency is meaningless once a task is done; what a caller wants is the newest.
        tasks.sort(key=lambda t: t.end or "", reverse=True)
    return tasks[:limit] if limit is not None else tasks


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
    validate_project: bool = True,
) -> tuple[list[str], list[str]]:
    """Split a change into (modifiers, free text).

    Taskwarrior parses everything before `--` and treats everything after it as text, so the
    two cannot be interleaved. Returning them separately makes the trust boundary explicit in
    the type: modifiers are built here from validated values, free text is whatever the user
    typed and never reaches a parsed position (finding SEC-3).

    Tags and dependencies are emitted here only on create. On modify they are a set to
    reach from the task's current one, which needs a read first; `modify_task` does that.

    `validate_project` is False when the caller has established that the project name is the
    one the task already carries (D4). Another live user's task may hold a name today's rules
    would refuse; re-validating a value the client merely resends would lock that task.
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
        if name == "project" and validate_project:
            validate_project_name(value)
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
    # Read by uuid, which matches regardless of status, so a task hidden by a future `wait`
    # is re-tagged like any other. Needed for every set-shaped field, and for a non-empty
    # project, whose name is validated only when it differs from the current one (D4).
    needs_current = (
        task.tags is not None
        or bool(tags_add)
        or bool(tags_remove)
        or task.depends is not None
        or bool(task.project)
    )
    current = get_task(username, uuid) if needs_current else None
    project_is_new = bool(task.project) and (current is None or task.project != current.project)
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
        validate_project=project_is_new,
    )
    if current is not None:
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


def gtd_list(username: str, view: GtdView, tags: list[str] | None = None) -> list[Task]:
    """One GTD list, sorted by urgency; the tickler by `wait`, soonest first.

    The tickler sorts on the stored `wait` string: Taskwarrior exports every date in the same
    UTC basic format (`20300101T000000Z`), so string order is date order.
    """
    filters = [*_VIEW_FILTERS[view], *_tag_filters(tags)]
    tasks = list_tasks(username, filters)
    if view == "tickler":
        tasks.sort(key=lambda t: t.wait or "")
    return tasks


def project_tasks(username: str, name: str, tags: list[str] | None = None) -> list[Task]:
    """A project's visible tasks, matched exactly (D2).

    `project:X` is Taskwarrior's hierarchical prefix match, so `alpha` also returned
    `alpha.sub` and `alphabet`. A subproject is a project of its own here.

    The name is validated (D4): here it *is* the filter token, and over MCP it is an
    unencoded path segment. So a legacy name `PROJECT_RE` refuses is a 400 on this route
    even though `project_names` still lists it — its tasks stay reachable through the
    unfiltered list, and a rename brings the project view back (ADR 0038, Consequences).
    The reserved list is not applied: `overview` and `plans` are refused only where a name
    is created.
    """
    return list_tasks(
        username,
        [*PENDING, f"project.is:{validate_project_name(name)}", *_tag_filters(tags)],
    )


def project_names(username: str) -> list[str]:
    """Distinct project names across a user's open tasks, in first-seen order.

    Open includes tasks hidden by a future `wait`, so parking a project's only task in the
    tickler no longer drops the project from the list.

    Exists so routers never reach the Taskwarrior adapter directly: every call to the
    subprocess goes through this layer, which is where validation lives. The GTD router
    previously imported task_runner.export_tasks itself, which is the boundary breach
    RULE-ARCH-001 now forbids.
    """
    seen: dict[str, None] = {}
    for raw in task_runner.export_tasks(username, OPEN):
        project = raw.get("project")
        if project:
            seen[project] = None
    return list(seen.keys())
