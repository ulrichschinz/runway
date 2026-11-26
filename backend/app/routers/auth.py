import hmac
import logging
import time
from datetime import UTC, datetime
from email.utils import format_datetime

from aiosqlite import Connection
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError

from app import audit, database, rate_limit
from app.auth import (
    KdfPhase,
    check_password,
    create_access_token,
    hash_for,
    hash_password,
    kdf_phase,
    keeps_the_ambiguous_prefix,
    new_password_problem,
)
from app.config import settings
from app.database import (
    API_KEY_PREFIX,
    TooManyApiKeys,
    create_account,
    create_api_key,
    delete_account,
    get_allow_registration,
    get_db,
    get_password_kdf_expand_at,
    legacy_api_key,
    list_api_keys,
    rehash_password,
    replace_password,
    revoke_api_key,
    rotate_api_keys,
)
from app.dependencies import get_current_user
from app.models import (
    API_KEY_MAX_DAYS,
    ApiKeyCreate,
    ApiKeyCreated,
    ApiKeyInfo,
    ApiKeyMetadata,
    PasswordChange,
    SiteSettings,
    Token,
    UserCreate,
    UserInfo,
    UserLogin,
    UserProfileUpdate,
)
from app.services.user_service import provision_store
from app.task_storage import username_problem

router = APIRouter(prefix="/auth", tags=["auth"])

# The identity, never the proof of identity: a username says which account, and it is already
# in the database in the clear. RULE-OPS-002 refuses the alternative at the call site.
logger = logging.getLogger(__name__)


async def _phase(db: Connection) -> KdfPhase:
    """Where the password-hash timeline stands (ADR 0044 Decision 5)."""
    return kdf_phase(await get_password_kdf_expand_at(db), time.time())


def _refuse_new_password(phase: KdfPhase, password: str, field: str) -> None:
    """422 in FastAPI's own validation shape — the one the OpenAPI document already declares for
    these routes — for a password the current phase cannot store safely (brief 0067, R2). Raised
    before any hash is computed. The rejected value is not echoed."""
    problem = new_password_problem(phase, password)
    if problem:
        raise RequestValidationError(
            [{"type": "value_error", "loc": ("body", field), "msg": problem}]
        )


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
    # A login and display rule, not the path control: the store is named by a random id
    # whatever the name is (SEC-001, ADR 0043). 400, the status this route already uses for a
    # name it will not accept, so the OpenAPI document does not move.
    problem = username_problem(body.username)
    if problem:
        audit.record(
            audit.REGISTERED,
            outcome=audit.REFUSED,
            actor=body.username,
            route=route,
            detail="username is not a plain name",
        )
        raise HTTPException(status_code=400, detail=problem)
    phase = await _phase(db)
    _refuse_new_password(phase, body.password, "password")
    try:
        account = await create_account(db, body.username, hash_for(phase, body.password))
    except Exception as e:
        audit.record(
            audit.REGISTERED,
            outcome=audit.FAILURE,
            actor=body.username,
            route=route,
            detail="username already taken",
        )
        raise HTTPException(status_code=400, detail="Username already taken") from e
    try:
        provision_store(account)
    except OSError as e:
        # An account without a store would be refused on every task route; better no account.
        await delete_account(db, account.id)
        logger.error("account store could not be provisioned", extra={"username": body.username})
        raise HTTPException(status_code=500, detail="Could not create the account") from e
    logger.info("account registered", extra={"username": body.username})
    audit.record(audit.REGISTERED, outcome=audit.SUCCESS, actor=body.username, route=route)
    return UserInfo(username=body.username)


def _report_refusals(reports, route: str | None) -> None:
    """Write what the limiter counted. One row per key and window, plus a summary when a key is
    swept, so a hammered account or source cannot grow `audit.db` one row per request; every
    row says how many refused attempts it stands for (brief 0069). A source row names no
    address and no account — the address is a caller fingerprint (ADR 0026)."""
    for report in reports:
        logger.warning(
            "login throttled",
            extra={
                "username": report.actor,
                "tier": report.tier,
                "refusals": report.refusals,
                "retry_after": report.retry_after,
            },
        )
        audit.record(
            audit.LOGIN_THROTTLED,
            outcome=audit.REFUSED,
            actor=report.actor,
            route=route,
            detail=report.detail,
        )


def _source(request: Request) -> str | None:
    """The network source the limiter counts: the socket peer, or behind a proxy listed in
    TRUSTED_PROXIES the client address it forwarded; None for no source tier (rate_limit.source_of)."""
    return rate_limit.source_of(
        request.client.host if request.client else None,
        request.headers.getlist("x-forwarded-for"),
        rate_limit.trusted_networks(settings.trusted_proxies),
    )


@router.post("/login", response_model=Token)
async def login(request: Request, body: UserLogin, db: Connection = Depends(get_db)):
    # Reserved before the account lookup and the KDF, atomically (REV-003, brief 0069): a
    # refused attempt costs no work, and parallel requests cannot all pass a check that only
    # counts finished failures.
    route = audit.route_of(request)
    decision = rate_limit.reserve(body.username, _source(request))
    _report_refusals(decision.reports, route)
    if decision.reservation is None:
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts. Try again later.",
            headers={"Retry-After": str(decision.retry_after)},
        )

    # Leaving this block by any path but `succeed` counts as a failure — including an
    # exception in the lookup or a cancelled request.
    with decision.reservation as attempt:
        async with db.execute(
            "SELECT hashed_password, auth_version FROM users WHERE username = ?",
            (body.username,),
        ) as cur:
            row = await cur.fetchone()
        stored = row["hashed_password"] if row else None
        # The same work whether or not the account exists and whichever scheme its hash is: one
        # Argon2id verification and one bcrypt check, the missing one against a dummy (SEC-006).
        check = check_password(body.password, stored, phase=await _phase(db))
        if not check.ok or row is None or stored is None:
            # An unknown username counts too. Skipping it would turn the limiter into a user
            # enumeration oracle: throttled means "this account exists".
            attempt.fail()
            # Deliberately does not distinguish "no such account" from "wrong password". The
            # response does not, and a log line that did would be the user-enumeration oracle
            # the limiter above was written to avoid, moved from the API to the log file.
            logger.warning("login rejected", extra={"username": body.username})
            # Same reasoning as the log line above, with one exception that leaks nothing: the
            # legacy >=72-byte case after its window is reached only by a caller who has the
            # password's first 72 bytes, and the operator needs the row to offer the reset.
            # One row per failure inside the budget, so at most LOGIN_GLOBAL_RATE_LIMIT a window.
            audit.record(
                audit.LOGIN_FAILED,
                outcome=audit.FAILURE,
                actor=body.username,
                route=route,
                detail=(
                    "bcrypt-era password of 72 bytes or more is no longer accepted; operator reset"
                    if check.legacy_refused
                    else None
                ),
            )
            raise HTTPException(status_code=401, detail="Invalid credentials")
        attempt.succeed()

    if check.rehash:
        # The same password under Argon2id; no session ends. A compare-and-swap on the hash that
        # was verified: a password change in between wins, and nothing is written.
        if await rehash_password(db, body.username, stored, hash_password(body.password)):
            audit.record(
                audit.PASSWORD_REHASHED,
                outcome=audit.SUCCESS,
                actor=body.username,
                route=route,
                detail="stored hash replaced by argon2id on login",
            )
    logger.info("login succeeded", extra={"username": body.username})
    audit.record(
        audit.LOGIN_SUCCEEDED,
        outcome=audit.SUCCESS,
        actor=body.username,
        route=route,
        detail=(
            "bcrypt-era password of 72 bytes or more: a password change is required"
            if check.change_required
            else None
        ),
    )
    # The version read with the hash: a password change between the read and now raised it, and
    # this token is then refused on its first use — fail closed (ADR 0044).
    return Token(
        access_token=create_access_token(body.username, auth_version=row["auth_version"]),
        password_change_required=check.change_required,
    )


@router.get("/me", response_model=UserInfo, summary="Get current user profile")
async def me(username: str = Depends(get_current_user), db: Connection = Depends(get_db)):
    async with db.execute(
        "SELECT role, full_name, email FROM users WHERE username=?", (username,)
    ) as cur:
        row = await cur.fetchone()
    # get_current_user already refuses a token whose account is gone; this is the narrow race
    # in which the row disappears after that check. Same answer: the caller is no longer
    # anyone (brief 0056).
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return UserInfo(
        username=username,
        role=row["role"] or "user",
        full_name=row["full_name"] or "",
        email=row["email"] or "",
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
    phase = await _phase(db)
    _refuse_new_password(phase, body.new_password, "new_password")
    # The current password is a password verification like a login's, and this route accepts an
    # API key: outside the budget it was an unlimited password oracle for a stolen key, also
    # while the account's login was locked (brief 0069, R1). Same budget, same tiers, same
    # aggregated refusal rows; reserved before the lookup and the KDF.
    decision = rate_limit.reserve(username, _source(request))
    _report_refusals(decision.reports, route)
    if decision.reservation is None:
        raise HTTPException(
            status_code=429,
            detail="Too many failed password attempts. Try again later.",
            headers={"Retry-After": str(decision.retry_after)},
        )
    with decision.reservation as attempt:
        async with db.execute(
            "SELECT hashed_password FROM users WHERE username=?", (username,)
        ) as cur:
            row = await cur.fetchone()
        check = (
            check_password(body.current_password, row["hashed_password"], phase=phase)
            if row
            else None
        )
        if row is None or check is None or not check.ok:
            attempt.fail()
            # One row per failure inside the budget: at most LOGIN_RATE_LIMIT per account and
            # window, LOGIN_GLOBAL_RATE_LIMIT in total.
            audit.record(
                audit.PASSWORD_CHANGED,
                outcome=audit.FAILURE,
                actor=username,
                route=route,
                detail="the current password did not verify",
            )
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        attempt.succeed()
    if check.change_required and keeps_the_ambiguous_prefix(
        body.current_password, body.new_password
    ):
        # The current password was accepted only by its first 72 bytes (a bcrypt-era hash). A new
        # one with the same 72 bytes would make that value — possibly a guessed prefix plus junk —
        # the account's only password: refused before any hash (brief 0067, R6; ADR 0044).
        audit.record(
            audit.PASSWORD_CHANGED,
            outcome=audit.REFUSED,
            actor=username,
            route=route,
            detail="the new password keeps the first 72 bytes of a bcrypt-era password",
        )
        raise RequestValidationError(
            [
                {
                    "type": "value_error",
                    "loc": ("body", "new_password"),
                    "msg": "the new password must differ from the current one in its first "
                    "72 bytes in UTF-8",
                }
            ]
        )
    # Hash and auth_version in one compare-and-swap statement (REV-001, ADR 0044): every token
    # issued before this line is refused from now on, on every REST route and every MCP tool.
    # None means another change replaced the hash after it was verified above — the password
    # given as current is then no longer current, and the answer says exactly that.
    version = await replace_password(
        db, username, row["hashed_password"], hash_for(phase, body.new_password)
    )
    if version is None:
        audit.record(
            audit.PASSWORD_CHANGED,
            outcome=audit.FAILURE,
            actor=username,
            route=route,
            detail="the password was changed concurrently",
        )
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    audit.record(
        audit.PASSWORD_CHANGED,
        outcome=audit.SUCCESS,
        actor=username,
        route=route,
        detail=f"every earlier session ended (auth_version {version})",
    )
    # The session that made the change continues with a token at the new version; every other
    # one gets 401 on its next request. The API key is untouched: it has its own rotation.
    # The response stays untyped, so the OpenAPI document does not move.
    # `password_change_required` is a login's answer; this response's body stays what it was.
    fresh = Token(access_token=create_access_token(username, auth_version=version))
    return {"detail": "Password updated", **fresh.model_dump(exclude={"password_change_required"})}


# --- API keys (WAIVER-SEC-003, ADR 0044 Decision 6, brief 0070) ------------------------------
#
# A key is stored as the SHA-256 of itself and shown exactly once, in the answer that minted it.
# The two old routes stay for the announced window, marked deprecated; after the legacy cutoff the
# GET has nothing left to return, and the contract step (its own change) answers 410.

# When the old routes were deprecated (RFC 9745 `Deprecation: @<epoch>`): 2026-11-25T00:00Z.
APIKEY_DEPRECATED_AT = 1795564800
_KEY_DAY = 86400
_DEPRECATED = "Deprecated since 2026-11-25 (brief 0070): API keys are stored as hashes. "


def _iso(epoch: int | None) -> str | None:
    return None if epoch is None else datetime.fromtimestamp(epoch, UTC).isoformat()


def _key_state(row: dict, now: int, cutoff: int) -> str:
    if row["revoked_at"] is not None:
        return "revoked"
    if row["expires_at"] is not None and now >= row["expires_at"]:
        return "expired"
    if row["kind"] == "legacy" and now >= cutoff:
        return "expired"
    return "active"


def _metadata(row: dict, now: int, cutoff: int) -> dict:
    return {
        "key_id": row["key_id"],
        "label": row["label"],
        "kind": row["kind"],
        "prefix": f"{API_KEY_PREFIX}{row['key_id']}" if row["kind"] == "issued" else "",
        "created_at": _iso(row["created_at"]),
        "expires_at": _iso(row["expires_at"]),
        "revoked_at": _iso(row["revoked_at"]),
        "last_used_at": _iso(row["last_used_at"]),
        "state": _key_state(row, now, cutoff),
    }


def _require_session(request: Request) -> None:
    """Key management needs a signed-in session, not a key: a stolen key must not be able to mint
    its own successor, or revoking it would not end the intrusion (brief 0070, scenario 3). The
    deprecated read-back holds the same line in `_may_read_legacy_key` (scenario 6)."""
    if getattr(request.state, "auth_shape", None) != audit.SHAPE_BEARER_JWT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Managing API keys needs a signed-in session, not an API key",
        )


def _may_read_legacy_key(request: Request, value: str) -> bool:
    """A signed-in session may read the legacy key; an API key only if it IS that key."""
    shape = getattr(request.state, "auth_shape", None)
    if shape == audit.SHAPE_BEARER_JWT:
        return True
    if shape == audit.SHAPE_API_KEY_HEADER:
        presented = request.headers.get("x-api-key", "")
    elif shape == audit.SHAPE_BEARER_API_KEY:
        scheme, _, presented = request.headers.get("authorization", "").partition(" ")
        if scheme.lower() != "bearer":
            return False
    else:
        return False
    return hmac.compare_digest(presented.strip().encode(), value.encode())


def _deprecation_headers(response: Response) -> None:
    cutoff = datetime.fromtimestamp(database.legacy_cutoff(), UTC)
    response.headers["Deprecation"] = f"@{APIKEY_DEPRECATED_AT}"
    response.headers["Sunset"] = format_datetime(cutoff, usegmt=True)
    # Relative, so it resolves under /api externally and at the root internally alike.
    response.headers["Link"] = '<apikeys>; rel="successor-version"'


@router.post(
    "/apikeys",
    response_model=ApiKeyCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Create an API key; the key is shown in this response only",
    description="Needs a signed-in session (`Authorization: Bearer <jwt>`); an API key gets 403. "
    "The key is stored as a hash and cannot be retrieved again. At most 10 active keys per "
    "account (409 beyond).",
)
async def create_apikey(
    request: Request,
    body: ApiKeyCreate | None = None,
    username: str = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    _require_session(request)
    body = body or ApiKeyCreate.model_validate({})
    now = database.api_key_clock()
    try:
        made = await create_api_key(
            db,
            username,
            label=body.label.strip(),
            now=now,
            expires_at=now + body.expires_in_days * _KEY_DAY,
        )
    except TooManyApiKeys as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Too many active API keys; revoke one first",
        ) from e
    if made is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    issued, row = made
    logger.info("api key created", extra={"username": username, "key_id": issued.key_id})
    audit.record(
        audit.APIKEY_CREATED,
        outcome=audit.SUCCESS,
        actor=username,
        route=audit.route_of(request),
        detail=f"key {issued.key_id}, expires {_iso(row['expires_at'])}",
    )
    return {**_metadata(row, now, database.legacy_cutoff()), "api_key": issued.api_key}


@router.get(
    "/apikeys",
    response_model=list[ApiKeyMetadata],
    summary="The account's API keys, as metadata (never a key, never its hash)",
)
async def list_apikeys(
    username: str = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    now, cutoff = database.api_key_clock(), database.legacy_cutoff()
    return [_metadata(row, now, cutoff) for row in await list_api_keys(db, username)]


@router.delete(
    "/apikeys/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke one API key (it stops working immediately)",
    description="Needs a signed-in session; an API key gets 403. 404 when this account holds no "
    "key with this id. Revoking an already revoked key is not an error.",
)
async def revoke_apikey(
    key_id: str,
    request: Request,
    username: str = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    _require_session(request)
    kind = await revoke_api_key(db, username, key_id, database.api_key_clock())
    if kind is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such API key")
    logger.info("api key revoked", extra={"username": username, "key_id": key_id})
    audit.record(
        audit.APIKEY_REVOKED,
        outcome=audit.SUCCESS,
        actor=username,
        route=audit.route_of(request),
        detail=f"{kind} key {key_id}",
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/apikey",
    response_model=ApiKeyInfo,
    deprecated=True,
    description=_DEPRECATED + "Returns a key issued before then until the legacy cutoff "
    "(`API_KEY_LEGACY_CUTOFF`, at the latest 2027-01-15), and an empty string after it and for "
    "every key created since. Only a signed-in session, or the legacy key itself, reads it; any "
    'other API key gets `""`. Use `GET /auth/apikeys` (metadata) and `POST /auth/apikeys`.',
)
async def get_apikey(
    request: Request,
    response: Response,
    username: str = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    _deprecation_headers(response)
    value = ""
    if database.api_key_clock() < database.legacy_cutoff():
        value = await legacy_api_key(db, username)
    if value and not _may_read_legacy_key(request, value):
        # Brief 0070, scenario 6 (review round 2): the legacy key is a second credential, alive
        # until the cutoff and independent of the key asking. Handed to an `rwk_` key it would
        # turn a stolen short-lived key into a long-lived one that survives the stolen key's
        # revocation. Only a session, or the legacy key reading itself back, gets it.
        value = ""
    # Recorded only when a value actually leaves: what an operator asks this row is "when was a
    # cleartext key last disclosed, and to whom" (finding SEC-5).
    if value:
        audit.record(
            audit.APIKEY_DISCLOSED,
            outcome=audit.SUCCESS,
            actor=username,
            route=audit.route_of(request),
            detail="a legacy API key was returned in cleartext (deprecated route, WAIVER-SEC-003)",
        )
    return ApiKeyInfo(api_key=value)


@router.post(
    "/apikey/regenerate",
    response_model=ApiKeyInfo,
    deprecated=True,
    description=_DEPRECATED + "Needs a signed-in session (`Authorization: Bearer <jwt>`); an "
    "API key gets 403. Ends EVERY key of the account and returns one new key, shown in this "
    "response only. Use `POST /auth/apikeys` and `DELETE /auth/apikeys/{key_id}`.",
)
async def regenerate_apikey(
    request: Request,
    response: Response,
    username: str = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    _deprecation_headers(response)
    # Like create and revoke: a key that could call this would swap itself for a fresh 365-day
    # key — a legacy one from a backup outliving the cutoff that way — and end its owner's keys.
    _require_session(request)
    now = database.api_key_clock()
    made = await rotate_api_keys(
        db, username, label="regenerated", now=now, expires_at=now + API_KEY_MAX_DAYS * _KEY_DAY
    )
    if made is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    issued, _ = made
    new_key = issued.api_key
    # That it happened, and to whom. The key itself is returned to the caller and goes
    # nowhere else — the row below records the rotation, never the value.
    logger.info("api key regenerated", extra={"username": username, "key_id": issued.key_id})
    audit.record(
        audit.APIKEY_REGENERATED,
        outcome=audit.SUCCESS,
        actor=username,
        route=audit.route_of(request),
        detail=f"every earlier key stopped working at this moment; new key {issued.key_id}",
    )
    return ApiKeyInfo(api_key=new_key)
