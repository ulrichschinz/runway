from fastapi import APIRouter, Depends, HTTPException
from typing import List
from aiosqlite import Connection
from app.database import get_db, get_allow_registration
from app.dependencies import get_current_admin
from app.models import SiteSettings, UserInfo, RoleUpdate

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/settings", response_model=SiteSettings, summary="Get site settings (admin only)")
async def get_settings(username: str = Depends(get_current_admin), db: Connection = Depends(get_db)):
    return SiteSettings(allow_registration=await get_allow_registration(db))


@router.put("/settings", response_model=SiteSettings, summary="Update site settings (admin only)")
async def update_settings(body: SiteSettings, username: str = Depends(get_current_admin), db: Connection = Depends(get_db)):
    await db.execute(
        "INSERT OR REPLACE INTO site_settings (key, value) VALUES ('allow_registration', ?)",
        ("true" if body.allow_registration else "false",),
    )
    await db.commit()
    return SiteSettings(allow_registration=body.allow_registration)


@router.get("/users", response_model=List[UserInfo], summary="List all users (admin only)")
async def list_users(username: str = Depends(get_current_admin), db: Connection = Depends(get_db)):
    async with db.execute("SELECT username, role, full_name, email FROM users ORDER BY username") as cur:
        rows = await cur.fetchall()
    return [UserInfo(username=r["username"], role=r["role"] or "user", full_name=r["full_name"] or "", email=r["email"] or "") for r in rows]


@router.put("/users/{target}/role", response_model=UserInfo, summary="Promote or demote a user (admin only)")
async def set_user_role(target: str, body: RoleUpdate, username: str = Depends(get_current_admin), db: Connection = Depends(get_db)):
    if body.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")
    async with db.execute("SELECT username FROM users WHERE username=?", (target,)) as cur:
        row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    await db.execute("UPDATE users SET role=? WHERE username=?", (body.role, target))
    await db.commit()
    async with db.execute("SELECT username, role, full_name, email FROM users WHERE username=?", (target,)) as cur:
        r = await cur.fetchone()
    return UserInfo(username=r["username"], role=r["role"] or "user", full_name=r["full_name"] or "", email=r["email"] or "")
