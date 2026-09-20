from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app import audit
from app.dependencies import get_current_user
from app.models import AnnotationCreate, Task, TaskCreate, TaskModify
from app.services import task_service

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _handle(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get(
    "",
    response_model=list[Task],
    summary="List tasks",
    description="Search the current user's tasks. Without filters it returns the visible "
    "pending ones, most urgent first; completed tasks come back newest first. Filters "
    "combine with AND. Dates are compared per calendar day in the server's local time.",
)
def list_tasks(
    username: str = Depends(get_current_user),
    status: Literal["pending", "waiting", "completed", "all"] | None = Query(
        None,
        description="`pending` (the default) is every visible task; `waiting` is only the "
        "ones hidden by a future `wait` date, which is Taskwarrior's waiting and NOT the "
        "`waiting` GTD tag (use the waiting list for that); `completed` is done tasks; "
        "`all` is pending, hidden and completed together.",
    ),
    project: str | None = Query(
        None,
        max_length=100,
        description="Exact project name. A subproject is a project of its own, so "
        "`home` does not include `home.garden`.",
    ),
    tag: list[str] | None = Query(
        None,
        max_length=10,
        description="Only tasks carrying ALL of these tags, written without `+`. Repeat "
        "the parameter for more than one.",
    ),
    due_before: str | None = Query(
        None, max_length=10, description="Only tasks due before this day. `YYYY-MM-DD`."
    ),
    due_after: str | None = Query(
        None, max_length=10, description="Only tasks due after this day. `YYYY-MM-DD`."
    ),
    scheduled_before: str | None = Query(
        None,
        max_length=10,
        description="Only tasks scheduled before this day. `YYYY-MM-DD`.",
    ),
    completed_since: str | None = Query(
        None,
        max_length=10,
        description="Only tasks completed on or after this day. `YYYY-MM-DD`. It implies "
        "`status=completed` when no status is given, and is refused with `pending` or "
        "`waiting`.",
    ),
    limit: int | None = Query(
        None, ge=1, le=500, description="Return at most this many tasks, after sorting."
    ),
    include_done: bool | None = Query(
        None,
        description="Deprecated alias: true means `status=all`, false is ignored. Sending "
        "true together with `status` is refused; use `status` instead.",
    ),
):
    return _handle(
        task_service.search_tasks,
        username,
        status=status,
        include_done=include_done,
        project=project,
        tags=tag,
        due_before=due_before,
        due_after=due_after,
        scheduled_before=scheduled_before,
        completed_since=completed_since,
        limit=limit,
    )


@router.post(
    "",
    response_model=Task,
    status_code=201,
    summary="Create a task",
    description="Create a new task. Optionally assign a project, tags, priority (H/M/L), due date, or make it recurring.",
)
def create_task(body: TaskCreate, username: str = Depends(get_current_user)):
    return _handle(task_service.create_task, username, body)


@router.get(
    "/{uuid}",
    response_model=Task,
    summary="Get a task",
    description="Fetch a single task by its UUID, including all fields and annotations.",
)
def get_task(uuid: str, username: str = Depends(get_current_user)):
    return _handle(task_service.get_task, username, uuid)


@router.put(
    "/{uuid}",
    response_model=Task,
    summary="Modify a task",
    description="Update one or more fields of a task (description, project, tags, priority, due date, etc.). Only provided fields are changed.",
)
def modify_task(uuid: str, body: TaskModify, username: str = Depends(get_current_user)):
    return _handle(task_service.modify_task, username, uuid, body)


@router.post(
    "/{uuid}/done",
    status_code=204,
    summary="Complete a task",
    description="Mark a task as done. It will no longer appear in pending task lists.",
)
def complete_task(uuid: str, username: str = Depends(get_current_user)):
    _handle(task_service.complete_task, username, uuid)


@router.delete(
    "/{uuid}",
    status_code=204,
    summary="Delete a task",
    description="Permanently delete a task. Use complete instead if you want to keep history.",
)
def delete_task(request: Request, uuid: str, username: str = Depends(get_current_user)):
    # Recorded AFTER the delete, so the row means "this task is gone" rather than "someone
    # asked". Taskwarrior's own `delete` is the only destructive operation this API exposes
    # that leaves nothing behind to inspect — completing a task keeps it.
    _handle(task_service.remove_task, username, uuid)
    audit.record(
        audit.TASK_DELETED,
        outcome=audit.SUCCESS,
        actor=username,
        subject=uuid,
        route=audit.route_of(request),
    )


@router.post(
    "/{uuid}/start",
    response_model=Task,
    summary="Start a task",
    description="Mark a task as in-progress. The task will show a start timestamp and be visually highlighted.",
)
def start_task(uuid: str, username: str = Depends(get_current_user)):
    return _handle(task_service.start_task, username, uuid)


@router.post(
    "/{uuid}/stop",
    response_model=Task,
    summary="Pause a task",
    description="Remove the in-progress marker from a task without completing it.",
)
def stop_task(uuid: str, username: str = Depends(get_current_user)):
    return _handle(task_service.stop_task, username, uuid)


@router.post(
    "/{uuid}/annotate",
    response_model=Task,
    summary="Annotate a task",
    description="Add a timestamped note or annotation to a task (e.g. progress update, context, link).",
)
def annotate_task(uuid: str, body: AnnotationCreate, username: str = Depends(get_current_user)):
    return _handle(task_service.annotate_task, username, uuid, body.text)
