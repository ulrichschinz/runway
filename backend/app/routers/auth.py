from aiosqlite import Connection
from fastapi import APIRouter, Depends, HTTPException, status

from app import rate_limit
from app.auth import create_access_token, hash_password, verify_password
from app.database import generate_api_key, get_allow_registration, get_db
from app.dependencies import get_current_user
from app.models import (
    ApiKeyInfo,
    PasswordChange,
    SiteSettings,
    Token,
    UserCreate,
    UserInfo,
    UserLogin,
    UserProfileUpdate,
)
from app.services.user_service import init_user_data

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get(
    "/registration-status",
    response_model=SiteSettings,
    summary="Whether this instance currently accepts new registrations (public)",
    description="Public so the login page can hide the register option when registration is "
    "closed, instead of inviting someone to type credentials and then refusing them. "
    "Discloses nothing: the same answer is obtainable by POSTing to /auth/register.",
)
async def registration_status(db: Connection = Depends(get_db)):
    return SiteSettings(allow_registration=await get_allow_registration(db))


@router.post("/register", response_model=UserInfo, status_code=status.HTTP_201_CREATED)
async def register(body: UserCreate, db: Connection = Depends(get_db)):
    if not await get_allow_registration(db):
        raise HTTPException(status_code=403, detail="Registration is disabled")
    try:
        await db.execute(
            "INSERT INTO users (username, hashed_password, api_key) VALUES (?, ?, ?)",
            (body.username, hash_password(body.password), generate_api_key()),
        )
        await db.commit()
    except Exception as e:
        raise HTTPException(status_code=400, detail="Username already taken") from e
    init_user_data(body.username)
    return UserInfo(username=body.username)


@router.post("/login", response_model=Token)
async def login(body: UserLogin, db: Connection = Depends(get_db)):
    # Checked before the password is verified: a locked-out username must not buy an
    # attacker the bcrypt work as a lever (finding SEC-8).
    wait = rate_limit.seconds_until_retry(body.username)
    if wait:
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts. Try again later.",
            headers={"Retry-After": str(wait)},
        )

    async with db.execute(
        "SELECT hashed_password FROM users WHERE username = ?", (body.username,)
    ) as cur:
        row = await cur.fetchone()
    if not row or not verify_password(body.password, row["hashed_password"]):
        # An unknown username counts too. Skipping it would turn the limiter into a user
        # enumeration oracle: throttled means "this account exists".
        rate_limit.record_failure(body.username)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    rate_limit.clear(body.username)
    return Token(access_token=create_access_token(body.username))


@router.get("/me", response_model=UserInfo, summary="Get current user profile")
async def me(username: str = Depends(get_current_user), db: Connection = Depends(get_db)):
    async with db.execute(
        "SELECT role, full_name, email FROM users WHERE username=?", (username,)
    ) as cur:
        row = await cur.fetchone()
    # WAIVER-TYPE-001: fetchone() may return None if the user disappeared between
    # authentication and this query, and the code below would raise TypeError -> 500.
    # Choosing the correct status for that state changes a hard-promise public surface,
    # so it needs its own step with tests rather than a drive-by fix here.
    return UserInfo(
        username=username,
        role=row["role"] or "user",  # type: ignore[index]
        full_name=row["full_name"] or "",  # type: ignore[index]
        email=row["email"] or "",  # type: ignore[index]
    )


@router.put("/me", response_model=UserInfo, summary="Update profile (name, email)")
async def update_profile(
    body: UserProfileUpdate,
    username: str = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    fields, values = [], []
    if body.full_name is not None:
        fields.append("full_name=?")
        values.append(body.full_name)
    if body.email is not None:
        fields.append("email=?")
        values.append(body.email)
    if fields:
        values.append(username)
        # noqa justification: only literals from a fixed set are interpolated; every
        # value is a bound parameter. See rules/waivers.yaml justified_suppressions.
        await db.execute(
            f"UPDATE users SET {', '.join(fields)} WHERE username=?",  # noqa: S608
            values,
        )
        await db.commit()
    return await me(username, db)


@router.put("/password", summary="Change password")
async def change_password(
    body: PasswordChange,
    username: str = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    async with db.execute("SELECT hashed_password FROM users WHERE username=?", (username,)) as cur:
        row = await cur.fetchone()
    if not row or not verify_password(body.current_password, row["hashed_password"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await db.execute(
        "UPDATE users SET hashed_password=? WHERE username=?",
        (hash_password(body.new_password), username),
    )
    await db.commit()
    return {"detail": "Password updated"}


@router.get("/apikey", response_model=ApiKeyInfo)
async def get_apikey(username: str = Depends(get_current_user), db: Connection = Depends(get_db)):
    async with db.execute("SELECT api_key FROM users WHERE username=?", (username,)) as cur:
        row = await cur.fetchone()
    return ApiKeyInfo(api_key=row["api_key"] if row else "")


@router.post("/apikey/regenerate", response_model=ApiKeyInfo)
async def regenerate_apikey(
    username: str = Depends(get_current_user), db: Connection = Depends(get_db)
):
    new_key = generate_api_key()
    await db.execute("UPDATE users SET api_key=? WHERE username=?", (new_key, username))
    await db.commit()
    return ApiKeyInfo(api_key=new_key)
