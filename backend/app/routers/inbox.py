from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.dependencies import get_current_user
from app.services import task_service

router = APIRouter(prefix="/inbox", tags=["inbox"])


class InboxItem(BaseModel):
    description: str
    note: str | None = None
    priority: str | None = None  # H, M, L


@router.post(
    "",
    status_code=201,
    summary="Add to inbox via API key",
    description="Add a task to the inbox of the authenticated user. Accepts the same "
    "credentials as every other route — 'X-Api-Key: <key>' or 'Authorization: Bearer "
    "<jwt>' — and, for compatibility with existing agents, an API key in the Bearer slot. "
    "Intended for agents and automations.",
)
async def webhook_inbox(
    item: InboxItem,
    username: str = Depends(get_current_user),
):
    from app.models import TaskCreate

    task = task_service.create_task(
        username,
        TaskCreate(
            description=item.description,
            priority=item.priority,
        ),
    )

    if item.note:
        task_service.annotate_task(username, task.uuid, item.note)

    return {"uuid": task.uuid, "description": task.description}
