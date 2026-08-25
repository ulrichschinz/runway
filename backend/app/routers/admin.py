from aiosqlite import Connection
from fastapi import APIRouter, Depends, HTTPException

from app.database import get_allow_registration, get_db
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
    body: SiteSettings, username: str = Depends(get_current_admin), db: Connection = Depends(get_db)
):
    await db.execute(
        "INSERT OR REPLACE INTO site_settings (key, value) VALUES ('allow_registration', ?)",
        ("true" if body.allow_registration else "false",),
    )
    await db.commit()
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
    target: str,
    body: RoleUpdate,
    username: str = Depends(get_current_admin),
    db: Connection = Depends(get_db),
):
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")
    async with db.execute("SELECT username, role FROM users WHERE username=?", (target,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    # Refuse to remove the last administrator. Without this an admin can demote themselves
    # — or the only other admin — leaving an instance nobody can administer: /admin/users
    # and /admin/settings both require an admin, so there is no route back through the API.
    # Recovery would mean editing the database on the host. The check is on the count, not
    # on self-demotion, because demoting someone else is just as final when they are the
    # only one left.
    if row["role"] == "admin" and body.role != "admin":
        async with db.execute("SELECT COUNT(*) AS n FROM users WHERE role='admin'") as cur:
            admins = await cur.fetchone()
        if admins and admins["n"] <= 1:
            raise HTTPException(
                status_code=409,
                detail="Refusing to demote the last admin — promote another user first",
            )

    await db.execute("UPDATE users SET role=? WHERE username=?", (body.role, target))
    await db.commit()
    async with db.execute(
        "SELECT username, role, full_name, email FROM users WHERE username=?", (target,)
    ) as cur:
        r = await cur.fetchone()
    # WAIVER-TYPE-001: the row's existence was checked above and it was just updated on
    # the same connection, so None is not reachable in practice — but it is not proven
    # by the types either. Left as-is with the rest of the family.
    return UserInfo(
        username=r["username"],  # type: ignore[index]
        role=r["role"] or "user",  # type: ignore[index]
        full_name=r["full_name"] or "",  # type: ignore[index]
        email=r["email"] or "",  # type: ignore[index]
    )
