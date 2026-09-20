import json

from fastapi import APIRouter, Depends, HTTPException

from app.database import get_db
from app.database import set_project_status as store_project_status
from app.dependencies import get_current_user
from app.models import (
    ProjectCreate,
    ProjectPlan,
    ProjectPlanUpdate,
    ProjectStatus,
    ProjectStatusUpdate,
    validate_project_name,
)

router = APIRouter(prefix="/projects", tags=["projects"])


def _created(name: str) -> str:
    """A project name this router is about to write, or a 400 (D4, ADR 0039).

    Only where a name is *created*. A name that is merely read, filtered by or resent
    unchanged stays usable, because live users hold names that predate these rules and
    re-validating what the server itself handed out would make their projects uneditable.
    `reserved=True` here and nowhere else: `overview` and `plans` would address a sibling
    route rather than reach `{name}`, so they must not become project names.
    """
    try:
        return validate_project_name(name, reserved=True)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


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


@router.post(
    "",
    response_model=ProjectPlan,
    status_code=201,
    summary="Create a project",
    description="Create a project explicitly (it also exists implicitly as soon as a task "
    "names it). Creating the same name twice changes nothing and returns the stored plan.",
)
async def create_project(
    payload: ProjectCreate,
    username: str = Depends(get_current_user),
    db=Depends(get_db),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Project name must not be empty")
    _created(name)
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


@router.get(
    "/plans/{name}",
    response_model=ProjectPlan,
    summary="Get a project plan",
    description="Read a project's plan (GTD Natural Planning Model: purpose, principles, "
    "vision, brainstorm, organized). Unknown names return an empty plan.",
)
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


@router.put(
    "/plans/{name}",
    response_model=ProjectPlan,
    summary="Update a project plan",
    description="Create or update the plan; omitted fields are kept. It also creates the "
    "project when it does not exist yet.",
)
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
    # The second creation path: the upsert below INSERTs a `projects` row for any name it has
    # not seen, so validating only `POST /projects` would leave the rule half applied. An
    # existing row is an update and is left alone, for the live-user reason in `_created`.
    if existing is None:
        _created(name)

    current = dict(existing) if existing else {}

    purpose = payload.purpose if payload.purpose is not None else current.get("purpose", "")
    principles = (
        payload.principles if payload.principles is not None else current.get("principles", "")
    )
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


# Declared after `/plans/{name}`, which therefore wins for `PUT /projects/plans/status`: that
# call upserts the plan of a project called `status`, not the status of a project called
# `plans`. Pinned by a test and recorded in ADR 0039; `plans` is a reserved name for exactly
# this reason, so a project that cannot have a status set can no longer be created.
@router.put(
    "/{name}/status",
    response_model=ProjectStatus,
    summary="Set a project's status",
    description="Say whether a project is `active`, `on_hold` or `done`. Only that is "
    "stored: no task is touched, and no project is created — a project exists because a "
    "task names it or because it was created explicitly. An `on_hold` or `done` project is "
    "never reported as stalled, which is what makes 'nothing is moving here' a finding "
    "worth acting on rather than a list of everything the user has parked.",
)
async def set_project_status(
    name: str,
    payload: ProjectStatusUpdate,
    username: str = Depends(get_current_user),
    db=Depends(get_db),
):
    _created(name)
    await store_project_status(db, username, name, payload.status)
    return ProjectStatus(name=name, status=payload.status)
