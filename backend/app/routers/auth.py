import logging

from aiosqlite import Connection
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app import audit, rate_limit
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

# The identity, never the proof of identity: a username says which account, and it is already
# in the database in the clear. RULE-OPS-002 refuses the alternative at the call site.
logger = logging.getLogger(__name__)


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
async def register(request: Request, body: UserCreate, db: Connection = Depends(get_db)):
    route = audit.route_of(request)
    if not await get_allow_registration(db):
        audit.record(
            audit.REGISTERED,
            outcome=audit.REFUSED,
            actor=body.username,
            route=route,
            detail="registration is disabled on this instance",
        )
        raise HTTPException(status_code=403, detail="Registration is disabled")
    try:
        await db.execute(
            "INSERT INTO users (username, hashed_password, api_key) VALUES (?, ?, ?)",
            (body.username, hash_password(body.password), generate_api_key()),
        )
        await db.commit()
    except Exception as e:
        audit.record(
            audit.REGISTERED,
            outcome=audit.FAILURE,
            actor=body.username,
            route=route,
            detail="username already taken",
        )
        raise HTTPException(status_code=400, detail="Username already taken") from e
    init_user_data(body.username)
    logger.info("account registered", extra={"username": body.username})
    audit.record(audit.REGISTERED, outcome=audit.SUCCESS, actor=body.username, route=route)
    return UserInfo(username=body.username)


@router.post("/login", response_model=Token)
async def login(request: Request, body: UserLogin, db: Connection = Depends(get_db)):
    # Checked before the password is verified: a locked-out username must not buy an
    # attacker the bcrypt work as a lever (finding SEC-8).
    route = audit.route_of(request)
    wait = rate_limit.seconds_until_retry(body.username)
    if wait:
        logger.warning("login throttled", extra={"username": body.username, "retry_after": wait})
        audit.record(
            audit.LOGIN_THROTTLED,
            outcome=audit.REFUSED,
            actor=body.username,
            route=route,
            detail=f"locked out, retry in {wait}s",
        )
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
        # Deliberately does not distinguish "no such account" from "wrong password". The
        # response does not, and a log line that did would be the user-enumeration oracle the
        # limiter above was written to avoid, moved from the API to the log file.
        logger.warning("login rejected", extra={"username": body.username})
        # Same reasoning as the log line above: the row does not distinguish "no such
        # account" from "wrong password", because a record that did would be the user
        # enumeration oracle the rate limiter exists to prevent, moved into a file.
        audit.record(audit.LOGIN_FAILED, outcome=audit.FAILURE, actor=body.username, route=route)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    rate_limit.clear(body.username)
    logger.info("login succeeded", extra={"username": body.username})
    audit.record(audit.LOGIN_SUCCEEDED, outcome=audit.SUCCESS, actor=body.username, route=route)
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
    request: Request,
    body: PasswordChange,
    username: str = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    route = audit.route_of(request)
    async with db.execute("SELECT hashed_password FROM users WHERE username=?", (username,)) as cur:
        row = await cur.fetchone()
    if not row or not verify_password(body.current_password, row["hashed_password"]):
        audit.record(
            audit.PASSWORD_CHANGED,
            outcome=audit.FAILURE,
            actor=username,
            route=route,
            detail="the current password did not verify",
        )
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await db.execute(
        "UPDATE users SET hashed_password=? WHERE username=?",
        (hash_password(body.new_password), username),
    )
    await db.commit()
    audit.record(audit.PASSWORD_CHANGED, outcome=audit.SUCCESS, actor=username, route=route)
    return {"detail": "Password updated"}


@router.get("/apikey", response_model=ApiKeyInfo)
async def get_apikey(
    request: Request,
    username: str = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    async with db.execute("SELECT api_key FROM users WHERE username=?", (username,)) as cur:
        row = await cur.fetchone()
    # This route hands back a permanent, unscoped credential in cleartext, which is finding
    # SEC-5 and is not fixed here — the fix changes this response contract and is therefore a
    # public-surface migration of its own. What this row buys meanwhile is the ability to
    # answer "when was this key last disclosed, and to whom" after the fact.
    audit.record(
        audit.APIKEY_DISCLOSED,
        outcome=audit.SUCCESS,
        actor=username,
        route=audit.route_of(request),
        detail="the API key was returned in cleartext (finding SEC-5)",
    )
    return ApiKeyInfo(api_key=row["api_key"] if row else "")


@router.post("/apikey/regenerate", response_model=ApiKeyInfo)
async def regenerate_apikey(
    request: Request,
    username: str = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    new_key = generate_api_key()
    await db.execute("UPDATE users SET api_key=? WHERE username=?", (new_key, username))
    await db.commit()
    # That it happened, and to whom. The key itself is returned to the caller and goes
    # nowhere else — the row below records the rotation, never the value.
    logger.info("api key regenerated", extra={"username": username})
    audit.record(
        audit.APIKEY_REGENERATED,
        outcome=audit.SUCCESS,
        actor=username,
        route=audit.route_of(request),
        detail="the previous key stopped working at this moment",
    )
    return ApiKeyInfo(api_key=new_key)
