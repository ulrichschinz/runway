from fastapi import APIRouter, Depends
from aiosqlite import Connection
from app.database import get_db, get_allow_registration
from app.dependencies import get_current_admin
from app.models import SiteSettings

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
