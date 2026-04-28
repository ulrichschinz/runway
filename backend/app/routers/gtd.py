from fastapi import APIRouter, Depends, HTTPException
from app.dependencies import get_current_user
from app.database import get_db
from app.models import Task
from app.services import task_service
from app.services.task_runner import export_tasks

router = APIRouter(prefix="/gtd", tags=["gtd"])


def _tasks(username: str, filter_args: list[str]) -> list[Task]:
    try:
        return task_service.list_tasks(username, filter_args)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/inbox", response_model=list[Task], summary="GTD inbox",
    description="List tasks that have not been processed yet: no project and no tags assigned.")
def inbox(username: str = Depends(get_current_user)):
    return _tasks(username, ["status:pending", "-TAGGED", "-project"])


@router.get("/next", response_model=list[Task], summary="Next actions",
    description="List tasks tagged +next — concrete actions you can do right now.")
def next_actions(username: str = Depends(get_current_user)):
    return _tasks(username, ["status:pending", "+next"])


@router.get("/waiting", response_model=list[Task], summary="Waiting for",
    description="List tasks tagged +waiting — things delegated or blocked on someone/something else.")
def waiting(username: str = Depends(get_current_user)):
    return _tasks(username, ["status:pending", "+waiting"])


@router.get("/someday", response_model=list[Task], summary="Someday / maybe",
    description="List tasks tagged +someday — ideas and intentions not yet committed to.")
def someday(username: str = Depends(get_current_user)):
    return _tasks(username, ["status:pending", "+someday"])


@router.get("/projects", response_model=list[str], summary="List projects",
    description="Return all project names — both those inferred from tasks and those created explicitly.")
async def projects(username: str = Depends(get_current_user), db=Depends(get_db)):
    try:
        raw = export_tasks(username, ["status:pending"])
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    seen: dict[str, None] = {}
    for t in raw:
        p = t.get("project")
        if p:
            seen[p] = None
    async with db.execute(
        "SELECT name FROM projects WHERE username=? ORDER BY created_at",
        (username,),
    ) as cur:
        rows = await cur.fetchall()
    for row in rows:
        seen.setdefault(row["name"], None)
    return list(seen.keys())


@router.get("/projects/{name}", response_model=list[Task], summary="Project tasks",
    description="List all pending tasks belonging to a specific project.")
def project_tasks(name: str, username: str = Depends(get_current_user)):
    return _tasks(username, ["status:pending", f"project:{name}"])
