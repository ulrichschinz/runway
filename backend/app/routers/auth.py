from fastapi import APIRouter, Depends, HTTPException, status
from aiosqlite import Connection
from app.database import get_db
from app.auth import hash_password, verify_password, create_access_token
from app.models import UserCreate, UserLogin, Token, UserInfo
from app.dependencies import get_current_user
from app.services.user_service import init_user_data
from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserInfo, status_code=status.HTTP_201_CREATED)
async def register(body: UserCreate, db: Connection = Depends(get_db)):
    if not settings.allow_registration:
        raise HTTPException(status_code=403, detail="Registration is disabled")
    try:
        await db.execute(
            "INSERT INTO users (username, hashed_password) VALUES (?, ?)",
            (body.username, hash_password(body.password)),
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


@router.get("/me", response_model=UserInfo)
async def me(username: str = Depends(get_current_user)):
    return UserInfo(username=username)
