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


@router.get("", response_model=list[Task])
def list_tasks(
    username: str = Depends(get_current_user),
    include_done: bool = Query(default=False),
):
    filters = [] if include_done else ["status:pending"]
    return _handle(task_service.list_tasks, username, filters)


@router.post("", response_model=Task, status_code=201)
def create_task(body: TaskCreate, username: str = Depends(get_current_user)):
    return _handle(task_service.create_task, username, body)


@router.get("/{uuid}", response_model=Task)
def get_task(uuid: str, username: str = Depends(get_current_user)):
    return _handle(task_service.get_task, username, uuid)


@router.put("/{uuid}", response_model=Task)
def modify_task(uuid: str, body: TaskModify, username: str = Depends(get_current_user)):
    return _handle(task_service.modify_task, username, uuid, body)


@router.post("/{uuid}/done", status_code=204)
def complete_task(uuid: str, username: str = Depends(get_current_user)):
    _handle(task_service.complete_task, username, uuid)


@router.delete("/{uuid}", status_code=204)
def delete_task(uuid: str, username: str = Depends(get_current_user)):
    _handle(task_service.remove_task, username, uuid)


@router.post("/{uuid}/start", response_model=Task)
def start_task(uuid: str, username: str = Depends(get_current_user)):
    return _handle(task_service.start_task, username, uuid)


@router.post("/{uuid}/stop", response_model=Task)
def stop_task(uuid: str, username: str = Depends(get_current_user)):
    return _handle(task_service.stop_task, username, uuid)


@router.post("/{uuid}/annotate", response_model=Task)
def annotate_task(uuid: str, body: AnnotationCreate, username: str = Depends(get_current_user)):
    return _handle(task_service.annotate_task, username, uuid, body.text)
