from aiosqlite import Connection
from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app import audit
from app.auth import decode_token
from app.database import get_db

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
        async with db.execute("SELECT username FROM users WHERE api_key=?", (x_api_key,)) as cur:
            row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
        _record(row["username"], audit.SHAPE_API_KEY_HEADER, request)
        return row["username"]

    if credentials:
        username = decode_token(credentials.credentials)
        if username:
            _record(username, audit.SHAPE_BEARER_JWT, request)
            return username

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
        async with db.execute(
            "SELECT username FROM users WHERE api_key=?", (credentials.credentials,)
        ) as cur:
            row = await cur.fetchone()
        if row:
            _record(row["username"], audit.SHAPE_BEARER_API_KEY, request)
            return row["username"]

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


def _record(username: str, shape: str, request: Request) -> None:
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
