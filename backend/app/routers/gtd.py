from collections.abc import Callable

from fastapi import APIRouter, Depends, HTTPException

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Task
from app.services import task_service

router = APIRouter(prefix="/gtd", tags=["gtd"])


def _tasks(fn: Callable[..., list[Task]], *args: str) -> list[Task]:
    # ValueError is the caller's (including Taskwarrior refusing a filter, rc 2); a
    # RuntimeError is the binary failing. The first used to be a 500 here as well.
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
    description="List tasks that have not been processed yet: no project and no tags assigned.",
)
def inbox(username: str = Depends(get_current_user)):
    return _tasks(task_service.gtd_list, username, "inbox")


@router.get(
    "/next",
    response_model=list[Task],
    summary="Next actions",
    description="List tasks tagged +next — concrete actions you can do right now.",
)
def next_actions(username: str = Depends(get_current_user)):
    return _tasks(task_service.gtd_list, username, "next")


@router.get(
    "/waiting",
    response_model=list[Task],
    summary="Waiting for",
    description="List tasks tagged +waiting — things delegated or blocked on someone/something else.",
)
def waiting(username: str = Depends(get_current_user)):
    return _tasks(task_service.gtd_list, username, "waiting")


@router.get(
    "/someday",
    response_model=list[Task],
    summary="Someday / maybe",
    description="List tasks tagged +someday — ideas and intentions not yet committed to.",
)
def someday(username: str = Depends(get_current_user)):
    return _tasks(task_service.gtd_list, username, "someday")


@router.get(
    "/tickler",
    response_model=list[Task],
    summary="Tickler",
    description="Tasks hidden by a future wait date, soonest first. They return to their list "
    "(untagged ones to the inbox) when the date passes.",
)
def tickler(username: str = Depends(get_current_user)):
    return _tasks(task_service.gtd_list, username, "tickler")


@router.get(
    "/projects",
    response_model=list[str],
    summary="List projects",
    description="Return all project names — both those inferred from tasks and those created explicitly.",
)
async def projects(username: str = Depends(get_current_user), db=Depends(get_db)):
    try:
        names = task_service.project_names(username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    seen: dict[str, None] = dict.fromkeys(names)
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
def project_tasks(name: str, username: str = Depends(get_current_user)):
    return _tasks(task_service.project_tasks, username, name)
