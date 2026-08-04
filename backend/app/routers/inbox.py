from aiosqlite import Connection
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.database import get_db
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
    description="Add a task to the inbox of the user identified by their API key. "
    "Pass the key as 'Authorization: Bearer <api_key>'. "
    "Intended for agents and automations — no login required.",
)
async def webhook_inbox(
    item: InboxItem,
    authorization: str = Header(...),
    db: Connection = Depends(get_db),
):
    token = authorization.removeprefix("Bearer ").strip()

    async with db.execute("SELECT username FROM users WHERE api_key=?", (token,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid API key")

    username = row["username"]

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
