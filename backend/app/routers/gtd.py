from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

# `record_review` is the name of the handler below, because the handler name is half of the
# MCP tool name and `record_review_gtd_review_post` is what an agent reads. The storage
# function keeps its own name behind an alias rather than the route giving up a good one.
from app.database import get_db, get_reviews
from app.database import record_review as store_review
from app.dependencies import get_current_user
from app.models import GtdSummary, LastReview, Review, ReviewCreate, Task
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
    # The scope the caller is asking about, resolved to the same canonical key POST /gtd/review
    # stores (D16, D17). Asking for `?tag=ar` and getting the unscoped review back would read
    # as "this area was reviewed" when only the whole system ever was — and the other way
    # round, a repository that reviews its own area would look untouched.
    key = _mapped(task_service.scope_key, tag)
    rows = await get_reviews(db, username)
    at = {row["kind"]: row["reviewed_at"] for row in rows if row["scope"] == key}
    last_review = LastReview(daily=at.get("daily"), weekly=at.get("weekly"))
    return _mapped(task_service.summarize, username, tag, statuses, last_review)


@router.get(
    "/review",
    response_model=list[Review],
    summary="Last reviews",
    description="When each kind of review was last recorded, one entry per kind and scope. "
    "An empty list means none was ever recorded — not that the system is unreviewed, only "
    "that nothing said so here.",
)
async def last_reviews(username: str = Depends(get_current_user), db=Depends(get_db)):
    return [Review(**dict(row)) for row in await get_reviews(db, username)]


@router.post(
    "/review",
    response_model=Review,
    status_code=201,
    summary="Record a review",
    description="Note that a daily or weekly review just finished, so the next session knows "
    "how current the lists are. Recording the same kind and scope again moves the timestamp; "
    "nothing else is stored, and no task is touched.",
)
async def record_review(
    payload: ReviewCreate,
    username: str = Depends(get_current_user),
    db=Depends(get_db),
):
    # `''` is the whole system and is not a tag; anything else is the `+`-joined scope key,
    # which is re-derived here rather than trusted, so the row can be found again from the
    # summary's `tag` list however the caller happened to order it.
    scope = _mapped(task_service.scope_key, payload.scope.split("+") if payload.scope else [])
    reviewed_at = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    await store_review(db, username, payload.kind, scope, reviewed_at)
    return Review(kind=payload.kind, scope=scope, reviewed_at=reviewed_at)


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
