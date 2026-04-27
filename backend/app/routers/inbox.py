from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional
from app.config import settings
from app.services import task_service

router = APIRouter(prefix="/inbox", tags=["inbox"])


class InboxItem(BaseModel):
    description: str
    note: Optional[str] = None
    priority: Optional[str] = None  # H, M, L


@router.post("", status_code=201)
def webhook_inbox(
    item: InboxItem,
    authorization: str = Header(...),
):
    if not settings.webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook not configured")
    if not settings.webhook_user:
        raise HTTPException(status_code=503, detail="Webhook user not configured")

    token = authorization.removeprefix("Bearer ").strip()
    if token != settings.webhook_secret:
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    from app.models import TaskCreate
    task = task_service.create_task(
        settings.webhook_user,
        TaskCreate(
            description=item.description,
            priority=item.priority,
        ),
    )

    if item.note:
        task_service.annotate_task(settings.webhook_user, task.uuid, item.note)

    return {"uuid": task.uuid, "description": task.description}
