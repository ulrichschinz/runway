from aiosqlite import Connection
from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app import audit, database, task_storage
from app.auth import TokenClaims, decode_token
from app.config import settings
from app.database import (
    authenticate_api_key,
    get_account,
    get_auth_version,
    get_auth_version_expand_at,
    get_db,
)
from app.task_storage import StorageRefused, TaskStore

bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    x_api_key: str | None = Header(None),
    db: Connection = Depends(get_db),
) -> str:
    """Authenticate, and record WHICH OF THE THREE SHAPES did it.

    Three credential shapes reach this function and until Step 15c all three left the same
    trace — none. That is why `SHIM-SEC-006` could not be removed: "is anyone still sending
    an API key in the Bearer slot?" was unanswerable from anything this deployment kept. Each
    successful path now writes one audit row naming its shape and the route it was used on,
    because a shape can be dead on `/tasks` and alive on `/inbox`.

    Only *successful* authentication is recorded. A rejected credential is already visible in
    the access log, and writing a row for it would let an unauthenticated caller append to the
    audit database at will — see `RISK-OPS-006`, which this deliberately keeps smaller.

    `request` is here for the route template alone. It is not a body or query parameter, so it
    adds nothing to the OpenAPI schema and no route or MCP tool moves.
    """
    if x_api_key:
        # WAIVER-SEC-003 (ADR 0044 Decision 6): only the hash is compared, never the cleartext
        # column. Unknown, malformed, expired, revoked, and legacy after the cutoff: one answer.
        username = await _api_key_owner(db, x_api_key)
        if username is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
        _record(username, audit.SHAPE_API_KEY_HEADER, request)
        return username

    if credentials:
        claims = decode_token(credentials.credentials)
        if claims:
            # A JWT is signed, not looked up: it outlives the account it names, and it used to
            # outlive every password change too (finding REV-001). So it is held to the row it
            # names: the account must exist (brief 0056) AND the token must carry the account's
            # current `auth_version`, which a password change raises (ADR 0044). One answer for
            # every refusal — no such account, stale, outside the legacy window — so a caller
            # cannot tell a revoked token from a forged one.
            stored = await get_auth_version(db, claims.username)
            presented = await _presented_version(db, claims)
            if stored is None or presented != stored:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
                )
            _record(claims.username, audit.SHAPE_BEARER_JWT, request)
            return claims.username

        # SHIM-SEC-006 — an API key presented in the Bearer slot.
        #
        # /inbox authenticated this way through its own inline lookup, which was a second
        # implementation of authentication with a different accepted header shape (finding
        # SEC-6). Divergent auth paths drift, so /inbox now comes through here — and every
        # agent, MCP client and webhook caller already sends `Authorization: Bearer <key>`,
        # so removing the shape in the same change would break all of them at once.
        #
        # Tracked in rules/shims.yaml with a removal step. Deliberately last: a real JWT is
        # tried first, so this costs one database read only for a credential that was going
        # to be rejected anyway.
        owner = await _api_key_owner(db, credentials.credentials)
        if owner is not None:
            _record(owner, audit.SHAPE_BEARER_API_KEY, request)
            return owner

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


async def _presented_version(db: Connection, claims: TokenClaims) -> int:
    """The version a token stands for; 0 matches no account.

    SHIM-SEC-008: a token without `auth_version` was issued by the previous image. It counts as
    version 1 — so the first password change after the deploy revokes it like any other — but
    only while it expires within one JWT lifetime of this image's first boot here, i.e. only if
    it can have been issued before that boot. After that window no such token can qualify and
    the branch is dead (the switch, by date); a missing record refuses them all.
    """
    if claims.auth_version is not None:
        return claims.auth_version
    expand_at = await get_auth_version_expand_at(db)
    if expand_at is None:
        return 0
    if claims.expires_at > expand_at + settings.jwt_expire_hours * 3600:
        return 0
    return 1


async def _api_key_owner(db: Connection, api_key: str) -> str | None:
    return await authenticate_api_key(
        db, api_key, database.api_key_clock(), database.legacy_cutoff()
    )


def _record(username: str, shape: str, request: Request) -> None:
    # Which shape authenticated this request, for the routes that accept only a signed-in
    # session (API-key management, brief 0070). Request state, so no route or schema moves.
    request.state.auth_shape = shape
    audit.record(
        audit.AUTHENTICATED,
        outcome=audit.SUCCESS,
        actor=username,
        auth_shape=shape,
        route=audit.route_of(request),
    )


async def get_current_admin(
    username: str = Depends(get_current_user),
    db: Connection = Depends(get_db),
) -> str:
    async with db.execute("SELECT role FROM users WHERE username=?", (username,)) as cur:
        row = await cur.fetchone()
    if not row or row["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return username


async def get_task_store(
    request: Request,
    username: str = Depends(get_current_user),
    db: Connection = Depends(get_db),
) -> TaskStore:
    """The authenticated account's Taskwarrior directory — never a path built from its name.

    Finding SEC-001 (ADR 0043). Every route that reaches Taskwarrior takes this instead of a
    username, so the only thing that can arrive at `task_runner._run` is a directory
    `task_storage.resolve` has already checked. It adds no parameter of its own: the OpenAPI
    schema and the MCP tool list are unchanged by it.

    A refusal is a 500 with a fixed message and an audit row naming the reason, never the path.
    The caller did nothing wrong; the server will not serve this account's data until an
    operator has looked (docs/operations.md#moving-task-storage-off-the-username).
    """
    account = await get_account(db, username)
    if account is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        store = task_storage.resolve(account)
    except StorageRefused as refused:
        audit.record(
            audit.STORAGE_REFUSED,
            outcome=audit.REFUSED,
            actor=username,
            route=audit.route_of(request),
            detail=refused.reason,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(refused)
        ) from refused
    return store
