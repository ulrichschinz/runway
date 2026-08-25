from aiosqlite import Connection
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth import decode_token
from app.database import get_db

bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    x_api_key: str | None = Header(None),
    db: Connection = Depends(get_db),
) -> str:
    if x_api_key:
        async with db.execute("SELECT username FROM users WHERE api_key=?", (x_api_key,)) as cur:
            row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
        return row["username"]

    if credentials:
        username = decode_token(credentials.credentials)
        if username:
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
            return row["username"]

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


async def get_current_admin(
    username: str = Depends(get_current_user),
    db: Connection = Depends(get_db),
) -> str:
    async with db.execute("SELECT role FROM users WHERE username=?", (username,)) as cur:
        row = await cur.fetchone()
    if not row or row["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return username
