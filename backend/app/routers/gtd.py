from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import get_db
from app.dependencies import get_current_user
from app.models import GtdSummary, Task
from app.services import task_service

router = APIRouter(prefix="/gtd", tags=["gtd"])

# One filter, six lists. Repeatable and AND-ed, so a repository that works inside one area
# passes its scope tags on every call and never receives another area's titles. Each value is
# validated in the service before it becomes a `+tag` token (D13).
TAG_FILTER = Query(
    None,
    max_length=10,
    description="Only tasks carrying ALL of these tags, written without `+`. Repeat the "
    "parameter for more than one. The inbox is untagged by definition, so any tag yields "
    "an empty inbox.",
)


def _mapped[T](fn: Callable[..., T], *args: Any) -> T:
    # ValueError is the caller's (including Taskwarrior refusing a filter, rc 2); a
    # RuntimeError is the binary failing. The first used to be a 500 here as well.
    # Generic in the result, because not everything this router asks the service for is
    # a list of tasks: the summary is counters.
    try:
        return fn(*args)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get(
    "/inbox",
    response_model=list[Task],
    summary="GTD inbox",
    description="List tasks that have not been processed yet: no project and no tags. A tag "
    "means the task has been clarified, so giving it one takes it out of the inbox.",
)
def inbox(
    username: str = Depends(get_current_user),
    tag: list[str] | None = TAG_FILTER,
):
    return _mapped(task_service.gtd_list, username, "inbox", tag)


@router.get(
    "/next",
    response_model=list[Task],
    summary="Next actions",
    description="List tasks tagged +next — concrete actions you can do right now.",
)
def next_actions(
    username: str = Depends(get_current_user),
    tag: list[str] | None = TAG_FILTER,
):
    return _mapped(task_service.gtd_list, username, "next", tag)


@router.get(
    "/waiting",
    response_model=list[Task],
    summary="Waiting for",
    description="List tasks tagged +waiting — things delegated or blocked on someone/something else.",
)
def waiting(
    username: str = Depends(get_current_user),
    tag: list[str] | None = TAG_FILTER,
):
    return _mapped(task_service.gtd_list, username, "waiting", tag)


@router.get(
    "/someday",
    response_model=list[Task],
    summary="Someday / maybe",
    description="List tasks tagged +someday — ideas and intentions not yet committed to.",
)
def someday(
    username: str = Depends(get_current_user),
    tag: list[str] | None = TAG_FILTER,
):
    return _mapped(task_service.gtd_list, username, "someday", tag)


@router.get(
    "/tickler",
    response_model=list[Task],
    summary="Tickler",
    description="Tasks hidden by a future wait date, soonest first. They return to their list "
    "(untagged ones to the inbox) when the date passes.",
)
def tickler(
    username: str = Depends(get_current_user),
    tag: list[str] | None = TAG_FILTER,
):
    return _mapped(task_service.gtd_list, username, "tickler", tag)


@router.get(
    "/summary",
    response_model=GtdSummary,
    summary="GTD summary",
    description="Counters for a review or a reminder, from one pass over the open tasks: how "
    "much is in the inbox and how old it is, what is overdue or due today, how many next, "
    "waiting, someday and hidden tasks there are, which follow-ups are due, what is in no "
    "list, and which active projects are stalled. It carries no task descriptions, so it is "
    "safe to print anywhere. Fetch a list only when its counter is above zero.",
)
async def summary(
    username: str = Depends(get_current_user),
    db=Depends(get_db),
    # Not TAG_FILTER: the filter is the same, but the sentence about the inbox is the
    # opposite one here. A list narrowed by a tag is empty; the inbox *counter* is never
    # narrowed at all, and that exception is the only reason a scoped repository can use
    # this route. An MCP client sees this description and nothing else about `tag`.
    tag: list[str] | None = Query(
        None,
        max_length=10,
        description="Only tasks carrying ALL of these tags, written without `+`. Repeat the "
        "parameter for more than one. Every counter is narrowed except `inbox` and "
        "`inbox_oldest_entry`, which are always counted whole: an inbox item carries no tags "
        "by definition, so a scoped inbox count would always be zero.",
    ),
):
    # Explicitly created projects are the rows this router already reads for `/gtd/projects`;
    # a project that exists only because tasks name it is active by definition. Stored
    # statuses arrive later and change these values, never the shape (D17).
    async with db.execute(
        "SELECT name FROM projects WHERE username=? ORDER BY created_at",
        (username,),
    ) as cur:
        rows = await cur.fetchall()
    statuses = {row["name"]: "active" for row in rows}
    return _mapped(task_service.summarize, username, tag, statuses, None)


@router.get(
    "/projects",
    response_model=list[str],
    summary="List projects",
    description="Return all project names — both those inferred from tasks and those created explicitly.",
)
async def projects(username: str = Depends(get_current_user), db=Depends(get_db)):
    seen: dict[str, None] = dict.fromkeys(_mapped(task_service.project_names, username))
    async with db.execute(
        "SELECT name FROM projects WHERE username=? ORDER BY created_at",
        (username,),
    ) as cur:
        rows = await cur.fetchall()
    for row in rows:
        seen.setdefault(row["name"], None)
    return list(seen.keys())


@router.get(
    "/projects/{name}",
    response_model=list[Task],
    summary="Project tasks",
    description="List all pending tasks belonging to a specific project.",
)
def project_tasks(
    name: str,
    username: str = Depends(get_current_user),
    tag: list[str] | None = TAG_FILTER,
):
    return _mapped(task_service.project_tasks, username, name, tag)
