from fastapi import APIRouter, Depends, HTTPException, Query
from app.dependencies import get_current_user
from app.models import Task, TaskCreate, TaskModify, AnnotationCreate
from app.services import task_service

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _handle(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("", response_model=list[Task], summary="List tasks",
    description="Return all pending tasks for the current user, sorted by urgency. Set include_done=true to also include completed tasks.")
def list_tasks(
    username: str = Depends(get_current_user),
    include_done: bool = Query(default=False),
):
    filters = [] if include_done else ["status:pending"]
    return _handle(task_service.list_tasks, username, filters)


@router.post("", response_model=Task, status_code=201, summary="Create a task",
    description="Create a new task. Optionally assign a project, tags, priority (H/M/L), due date, or make it recurring.")
def create_task(body: TaskCreate, username: str = Depends(get_current_user)):
    return _handle(task_service.create_task, username, body)


@router.get("/{uuid}", response_model=Task, summary="Get a task",
    description="Fetch a single task by its UUID, including all fields and annotations.")
def get_task(uuid: str, username: str = Depends(get_current_user)):
    return _handle(task_service.get_task, username, uuid)


@router.put("/{uuid}", response_model=Task, summary="Modify a task",
    description="Update one or more fields of a task (description, project, tags, priority, due date, etc.). Only provided fields are changed.")
def modify_task(uuid: str, body: TaskModify, username: str = Depends(get_current_user)):
    return _handle(task_service.modify_task, username, uuid, body)


@router.post("/{uuid}/done", status_code=204, summary="Complete a task",
    description="Mark a task as done. It will no longer appear in pending task lists.")
def complete_task(uuid: str, username: str = Depends(get_current_user)):
    _handle(task_service.complete_task, username, uuid)


@router.delete("/{uuid}", status_code=204, summary="Delete a task",
    description="Permanently delete a task. Use complete instead if you want to keep history.")
def delete_task(uuid: str, username: str = Depends(get_current_user)):
    _handle(task_service.remove_task, username, uuid)


@router.post("/{uuid}/start", response_model=Task, summary="Start a task",
    description="Mark a task as in-progress. The task will show a start timestamp and be visually highlighted.")
def start_task(uuid: str, username: str = Depends(get_current_user)):
    return _handle(task_service.start_task, username, uuid)


@router.post("/{uuid}/stop", response_model=Task, summary="Pause a task",
    description="Remove the in-progress marker from a task without completing it.")
def stop_task(uuid: str, username: str = Depends(get_current_user)):
    return _handle(task_service.stop_task, username, uuid)


@router.post("/{uuid}/annotate", response_model=Task, summary="Annotate a task",
    description="Add a timestamped note or annotation to a task (e.g. progress update, context, link).")
def annotate_task(uuid: str, body: AnnotationCreate, username: str = Depends(get_current_user)):
    return _handle(task_service.annotate_task, username, uuid, body.text)
