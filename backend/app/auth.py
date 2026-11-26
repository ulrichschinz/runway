import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


@dataclass(frozen=True)
class TokenClaims:
    """What a verified token says. `auth_version` is None only for a token the previous image
    issued, before every token carried one (SHIM-SEC-008, ADR 0044)."""

    username: str
    expires_at: int
    auth_version: int | None


def create_access_token(username: str, *, auth_version: int) -> str:
    """A token bound to the account's current `auth_version` (finding REV-001, ADR 0044).

    Keyword-only and without a default on purpose: a token minted without knowing the account's
    version would be one a password change cannot revoke. `jti` is random and stored nowhere —
    it only makes two tokens of the same second distinguishable.
    """
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": username,
            "iat": int(now.timestamp()),
            "exp": now + timedelta(hours=settings.jwt_expire_hours),
            "jti": secrets.token_urlsafe(16),
            "auth_version": auth_version,
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def _version(payload: dict) -> tuple[bool, int | None]:
    """(well-formed, version). Absent is well-formed (the legacy form); anything but a positive
    int — a string, a bool, a float, null — is not."""
    if "auth_version" not in payload:
        return True, None
    value = payload["auth_version"]
    if type(value) is not int or value < 1:
        return False, None
    return True, value


def decode_token(token: str) -> TokenClaims | None:
    """The verified claims, or None for anything that is not a well-formed token of ours.

    `exp` and `sub` are required: python-jose checks `exp` only when it is present, so before
    this change a correctly signed token without one never expired.
    """
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require_exp": True, "require_sub": True},
        )
    except JWTError:
        return None
    username, expires_at = payload.get("sub"), payload.get("exp")
    if not isinstance(username, str) or not username or type(expires_at) is not int:
        return None
    ok, version = _version(payload)
    if not ok:
        return None
    return TokenClaims(username=username, expires_at=expires_at, auth_version=version)
