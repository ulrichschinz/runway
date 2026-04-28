from typing import Optional
from fastapi import Depends, HTTPException, Header, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from aiosqlite import Connection
from app.auth import decode_token
from app.database import get_db

bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    x_api_key: Optional[str] = Header(None),
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

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
