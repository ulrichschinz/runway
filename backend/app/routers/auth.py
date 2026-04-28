from fastapi import APIRouter, Depends, HTTPException, status
from aiosqlite import Connection
from app.database import get_db, get_allow_registration
from app.auth import hash_password, verify_password, create_access_token
from app.models import UserCreate, UserLogin, Token, UserInfo, UserProfileUpdate, PasswordChange, ApiKeyInfo
from app.dependencies import get_current_user
from app.services.user_service import init_user_data
from app.database import _generate_api_key
from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserInfo, status_code=status.HTTP_201_CREATED)
async def register(body: UserCreate, db: Connection = Depends(get_db)):
    if not await get_allow_registration(db):
        raise HTTPException(status_code=403, detail="Registration is disabled")
    try:
        await db.execute(
            "INSERT INTO users (username, hashed_password, api_key) VALUES (?, ?, ?)",
            (body.username, hash_password(body.password), _generate_api_key()),
        )
        await db.commit()
    except Exception:
        raise HTTPException(status_code=400, detail="Username already taken")
    init_user_data(body.username)
    return UserInfo(username=body.username)


@router.post("/login", response_model=Token)
async def login(body: UserLogin, db: Connection = Depends(get_db)):
    async with db.execute(
        "SELECT hashed_password FROM users WHERE username = ?", (body.username,)
    ) as cur:
        row = await cur.fetchone()
    if not row or not verify_password(body.password, row["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return Token(access_token=create_access_token(body.username))


@router.get("/me", response_model=UserInfo, summary="Get current user profile")
async def me(username: str = Depends(get_current_user), db: Connection = Depends(get_db)):
    async with db.execute("SELECT role, full_name, email FROM users WHERE username=?", (username,)) as cur:
        row = await cur.fetchone()
    return UserInfo(
        username=username,
        role=row["role"] or "user",
        full_name=row["full_name"] or "",
        email=row["email"] or "",
    )


@router.put("/me", response_model=UserInfo, summary="Update profile (name, email)")
async def update_profile(body: UserProfileUpdate, username: str = Depends(get_current_user), db: Connection = Depends(get_db)):
    fields, values = [], []
    if body.full_name is not None:
        fields.append("full_name=?")
        values.append(body.full_name)
    if body.email is not None:
        fields.append("email=?")
        values.append(body.email)
    if fields:
        values.append(username)
        await db.execute(f"UPDATE users SET {', '.join(fields)} WHERE username=?", values)
        await db.commit()
    return await me(username, db)


@router.put("/password", summary="Change password")
async def change_password(body: PasswordChange, username: str = Depends(get_current_user), db: Connection = Depends(get_db)):
    async with db.execute("SELECT hashed_password FROM users WHERE username=?", (username,)) as cur:
        row = await cur.fetchone()
    if not row or not verify_password(body.current_password, row["hashed_password"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await db.execute("UPDATE users SET hashed_password=? WHERE username=?", (hash_password(body.new_password), username))
    await db.commit()
    return {"detail": "Password updated"}


@router.get("/apikey", response_model=ApiKeyInfo)
async def get_apikey(username: str = Depends(get_current_user), db: Connection = Depends(get_db)):
    async with db.execute("SELECT api_key FROM users WHERE username=?", (username,)) as cur:
        row = await cur.fetchone()
    return ApiKeyInfo(api_key=row["api_key"] if row else "")


@router.post("/apikey/regenerate", response_model=ApiKeyInfo)
async def regenerate_apikey(username: str = Depends(get_current_user), db: Connection = Depends(get_db)):
    new_key = _generate_api_key()
    await db.execute("UPDATE users SET api_key=? WHERE username=?", (new_key, username))
    await db.commit()
    return ApiKeyInfo(api_key=new_key)
