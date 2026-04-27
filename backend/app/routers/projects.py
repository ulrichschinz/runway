import json
from fastapi import APIRouter, Depends, HTTPException
from app.dependencies import get_current_user
from app.database import get_db
from app.models import ProjectCreate, ProjectPlan, ProjectPlanUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


def _row_to_plan(name: str, row) -> ProjectPlan:
    return ProjectPlan(
        project_name=name,
        purpose=row["purpose"] or "",
        principles=row["principles"] or "",
        vision=row["vision"] or "",
        brainstorm=json.loads(row["brainstorm"] or "[]"),
        organized=json.loads(row["organized"] or "[]"),
        updated_at=row["updated_at"],
    )


@router.post("", response_model=ProjectPlan, status_code=201)
async def create_project(
    payload: ProjectCreate,
    username: str = Depends(get_current_user),
    db=Depends(get_db),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Project name must not be empty")
    await db.execute(
        """
        INSERT INTO projects (username, name)
        VALUES (?, ?)
        ON CONFLICT(username, name) DO NOTHING
        """,
        (username, name),
    )
    await db.commit()
    async with db.execute(
        "SELECT * FROM projects WHERE username=? AND name=?",
        (username, name),
    ) as cur:
        row = await cur.fetchone()
    return _row_to_plan(name, row)


@router.get("/plans/{name}", response_model=ProjectPlan)
async def get_plan(
    name: str,
    username: str = Depends(get_current_user),
    db=Depends(get_db),
):
    async with db.execute(
        "SELECT * FROM projects WHERE username=? AND name=?",
        (username, name),
    ) as cur:
        row = await cur.fetchone()
    if not row:
        return ProjectPlan(project_name=name)
    return _row_to_plan(name, row)


@router.put("/plans/{name}", response_model=ProjectPlan)
async def upsert_plan(
    name: str,
    payload: ProjectPlanUpdate,
    username: str = Depends(get_current_user),
    db=Depends(get_db),
):
    async with db.execute(
        "SELECT * FROM projects WHERE username=? AND name=?",
        (username, name),
    ) as cur:
        existing = await cur.fetchone()

    current = dict(existing) if existing else {}

    purpose = payload.purpose if payload.purpose is not None else current.get("purpose", "")
    principles = payload.principles if payload.principles is not None else current.get("principles", "")
    vision = payload.vision if payload.vision is not None else current.get("vision", "")
    brainstorm = (
        json.dumps([i.model_dump() for i in payload.brainstorm])
        if payload.brainstorm is not None
        else current.get("brainstorm", "[]")
    )
    organized = (
        json.dumps([i.model_dump() for i in payload.organized])
        if payload.organized is not None
        else current.get("organized", "[]")
    )

    await db.execute(
        """
        INSERT INTO projects (username, name, purpose, principles, vision, brainstorm, organized, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(username, name) DO UPDATE SET
            purpose=excluded.purpose,
            principles=excluded.principles,
            vision=excluded.vision,
            brainstorm=excluded.brainstorm,
            organized=excluded.organized,
            updated_at=CURRENT_TIMESTAMP
        """,
        (username, name, purpose, principles, vision, brainstorm, organized),
    )
    await db.commit()

    async with db.execute(
        "SELECT * FROM projects WHERE username=? AND name=?",
        (username, name),
    ) as cur:
        row = await cur.fetchone()
    return _row_to_plan(name, row)
