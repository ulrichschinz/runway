from aiosqlite import Connection
from fastapi import APIRouter, Depends, HTTPException, Request

from app import audit
from app.database import LastAdminError, get_allow_registration, get_db, set_role
from app.dependencies import get_current_admin
from app.models import VALID_ROLES, RoleUpdate, SiteSettings, UserInfo

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/settings", response_model=SiteSettings, summary="Get site settings (admin only)")
async def get_settings(
    username: str = Depends(get_current_admin), db: Connection = Depends(get_db)
):
    return SiteSettings(allow_registration=await get_allow_registration(db))


@router.put("/settings", response_model=SiteSettings, summary="Update site settings (admin only)")
async def update_settings(
    request: Request,
    body: SiteSettings,
    username: str = Depends(get_current_admin),
    db: Connection = Depends(get_db),
):
    await db.execute(
        "INSERT OR REPLACE INTO site_settings (key, value) VALUES ('allow_registration', ?)",
        ("true" if body.allow_registration else "false",),
    )
    await db.commit()
    # Who opened the instance to the public, and when. This is the one admin setting that
    # changes who can obtain an account at all, so it is the one whose history matters.
    audit.record(
        audit.REGISTRATION_TOGGLED,
        outcome=audit.SUCCESS,
        actor=username,
        route=audit.route_of(request),
        detail="registration enabled" if body.allow_registration else "registration disabled",
    )
    return SiteSettings(allow_registration=body.allow_registration)


@router.get("/users", response_model=list[UserInfo], summary="List all users (admin only)")
async def list_users(username: str = Depends(get_current_admin), db: Connection = Depends(get_db)):
    async with db.execute(
        "SELECT username, role, full_name, email FROM users ORDER BY username"
    ) as cur:
        rows = await cur.fetchall()
    return [
        UserInfo(
            username=r["username"],
            role=r["role"] or "user",
            full_name=r["full_name"] or "",
            email=r["email"] or "",
        )
        for r in rows
    ]


@router.put(
    "/users/{target}/role", response_model=UserInfo, summary="Promote or demote a user (admin only)"
)
async def set_user_role(
    request: Request,
    target: str,
    body: RoleUpdate,
    username: str = Depends(get_current_admin),
    db: Connection = Depends(get_db),
):
    route = audit.route_of(request)
    if body.role not in VALID_ROLES:
        audit.record(
            audit.ROLE_CHANGED,
            outcome=audit.FAILURE,
            actor=username,
            subject=target,
            route=route,
            detail="the requested role is not one this instance has",
        )
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")
    # Refuse to remove the last administrator. Without this an admin can demote themselves
    # — or the only other admin — leaving an instance nobody can administer: /admin/users
    # and /admin/settings both require an admin, so there is no route back through the API.
    # Recovery would mean editing the database on the host. The check is on the count, not
    # on self-demotion, because demoting someone else is just as final when they are the
    # only one left.
    #
    # `set_role` reads, writes and checks in ONE serialised transaction (REV-002, brief 0068):
    # a count read here first and an UPDATE after it let two overlapping demotions both pass.
    try:
        previous = await set_role(db, target, body.role)
    except LastAdminError:
        # A refusal is an event. This one in particular: it is the control standing
        # between the instance and a state nobody can administer, so an operator asking
        # "did someone try to demote the last admin" should not have to hope the log
        # file from that week still exists.
        audit.record(
            audit.ROLE_CHANGED,
            outcome=audit.REFUSED,
            actor=username,
            subject=target,
            route=route,
            detail="refused: this is the last admin",
        )
        raise HTTPException(
            status_code=409,
            detail="Refusing to demote the last admin — promote another user first",
        ) from None
    if previous is None:
        audit.record(
            audit.ROLE_CHANGED,
            outcome=audit.FAILURE,
            actor=username,
            subject=target,
            route=route,
            detail="no such user",
        )
        raise HTTPException(status_code=404, detail="User not found")

    audit.record(
        audit.ROLE_CHANGED,
        outcome=audit.SUCCESS,
        actor=username,
        subject=target,
        route=route,
        detail=f"role {previous} -> {body.role}",
    )
    async with db.execute(
        "SELECT username, role, full_name, email FROM users WHERE username=?", (target,)
    ) as cur:
        r = await cur.fetchone()
    # The row was just updated on the same connection, so None is reachable only if another
    # request deleted it in between; the check is also what lets the types prove it (brief
    # 0056). The answer is the one this handler already gives for a missing target.
    if r is None:
        raise HTTPException(status_code=404, detail="User not found")
    return UserInfo(
        username=r["username"],
        role=r["role"] or "user",
        full_name=r["full_name"] or "",
        email=r["email"] or "",
    )
