import re
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import bcrypt
from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from jose import JWTError, jwt

from app.config import settings

# --- the password policy (finding SEC-006, ADR 0044 Decision 5) --------------------------------
#
# Counted in UTF-8 bytes, because bytes are what the KDF reads and what a body costs. The minimum
# applies to a password being SET (register, change); login keeps none, so an account created
# before the rule still logs in. The maximum applies everywhere a password is accepted, login
# included: it bounds the work an unauthenticated request can ask for.
PASSWORD_MIN_BYTES = 8
PASSWORD_MAX_BYTES = 1024

# bcrypt reads at most this many bytes of its input (passlib truncated silently; bcrypt 5 raises).
BCRYPT_INPUT_BYTES = 72


def password_problem(value: str, *, new: bool) -> str | None:
    """Why `value` is not an acceptable password, or None. `new` adds the minimum."""
    try:
        size = len(value.encode("utf-8"))
    except UnicodeEncodeError:
        return "password must be valid UTF-8 text"
    if size > PASSWORD_MAX_BYTES:
        return f"password must be at most {PASSWORD_MAX_BYTES} bytes in UTF-8"
    if new and size < PASSWORD_MIN_BYTES:
        return f"password must be at least {PASSWORD_MIN_BYTES} bytes in UTF-8"
    return None


# --- Argon2id ----------------------------------------------------------------------------------
#
# Measured on 2026-11-24 (brief 0067) against a budget of at most 64 MiB and at most 250 ms per
# verification on the target host, with logins hashed one at a time on the event loop (so the
# memory budget is also the peak). On the development host (Apple M5) one verification took
# 75 ms. The production host is not visible from here: `python -m app.auth` prints the same
# measurement there, and the operator runs it before Switch 1 (docs/operations.md).
# RFC 9106's memory figure with one lane, because the deploy host is a small VM where four lanes
# would buy nothing; t=3 to stay well above the OWASP floor (m=19 MiB, t=2).
ARGON2_TIME_COST = 3
ARGON2_MEMORY_KIB = 65536
ARGON2_PARALLELISM = 1

PRODUCTION_ARGON2 = PasswordHasher(
    time_cost=ARGON2_TIME_COST,
    memory_cost=ARGON2_MEMORY_KIB,
    parallelism=ARGON2_PARALLELISM,
    hash_len=32,
    salt_len=16,
    type=Type.ID,
)
# The hasher in use. Tests replace it with reduced parameters (backend/tests/conftest.py); a
# hash at other parameters still verifies, and is flagged for rehash.
_argon2 = PRODUCTION_ARGON2

# The cost passlib wrote every stored bcrypt hash with (its default). The dummy check runs at it
# so a bcrypt account and any other account cost the same. Tests lower it with the hashes.
LEGACY_BCRYPT_COST = 12

# --- the expand -> switch timeline (ADR 0044 Decision 5) ---------------------------------------
#
# Anchored on `site_settings.password_kdf_expand_at`, written once on this image's first boot.
#   [0, KDF_SOAK)                     new hashes still bcrypt: the previous image can verify them
#   [KDF_SOAK, ...)                   new hashes Argon2id, exact bcrypt logins rehashed (Switch 1)
#   [KDF_SOAK + LONG_BCRYPT_WINDOW,)  the ambiguous >=72-byte bcrypt login refused (Switch 2)
KDF_SOAK = timedelta(days=7)
LONG_BCRYPT_WINDOW = timedelta(days=60)


@dataclass(frozen=True)
class KdfPhase:
    write_argon2: bool
    accept_long_bcrypt: bool


def kdf_phase(expand_at: int | None, now: float) -> KdfPhase:
    """Where the timeline stands. A missing anchor fails closed: Argon2id, no ambiguous login."""
    if expand_at is None:
        return KdfPhase(write_argon2=True, accept_long_bcrypt=False)
    elapsed = now - expand_at
    return KdfPhase(
        write_argon2=elapsed >= KDF_SOAK.total_seconds(),
        accept_long_bcrypt=elapsed < (KDF_SOAK + LONG_BCRYPT_WINDOW).total_seconds(),
    )


def hash_password(password: str) -> str:
    """An Argon2id hash. Every password stored from Switch 1 on is one of these."""
    return _argon2.hash(password)


def legacy_bcrypt_hash(password: str) -> str:
    """The hash the previous image would have written — only during the soak, so a rollback can
    still verify it. Truncated explicitly, exactly as passlib did silently."""
    raw = password.encode("utf-8")[:BCRYPT_INPUT_BYTES]
    return bcrypt.hashpw(raw, bcrypt.gensalt(LEGACY_BCRYPT_COST)).decode("ascii")


def hash_for(phase: KdfPhase, password: str) -> str:
    return hash_password(password) if phase.write_argon2 else legacy_bcrypt_hash(password)


@dataclass(frozen=True)
class PasswordCheck:
    """`ok`: the password is accepted. `rehash`: store `hash_password(input)` in place of the stored
    hash. `change_required`: a bcrypt hash matched an input of 72 bytes or more — bcrypt cannot
    tell it from the real password's prefix plus anything, so it is never rehashed from this input
    and the user must set a new password. `legacy_refused`: that case, after its window."""

    ok: bool
    rehash: bool = False
    change_required: bool = False
    legacy_refused: bool = False


_dummies: dict[tuple, str] = {}


def _dummy(kind: str) -> str:
    """A hash of a random secret at the current parameters, for an account that has no hash of
    this kind — so its login does the same work as one that has."""
    if kind == "argon2":
        key: tuple = ("argon2", _argon2.time_cost, _argon2.memory_cost, _argon2.parallelism)
    else:
        key = ("bcrypt", LEGACY_BCRYPT_COST)
    if key not in _dummies:
        secret = secrets.token_hex(16)
        _dummies[key] = hash_password(secret) if kind == "argon2" else legacy_bcrypt_hash(secret)
    return _dummies[key]


def prepare_dummies() -> None:
    _dummy("argon2")
    _dummy("bcrypt")


def _scheme(stored: str | None) -> str | None:
    if not stored:
        return None
    if stored.startswith("$argon2id$"):
        return "argon2"
    if stored.startswith(("$2a$", "$2b$", "$2y$")):
        return "bcrypt"
    return None


def _argon2_matches(stored: str, raw: bytes) -> bool:
    try:
        return _argon2.verify(stored, raw)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


# The modular-crypt shape passlib wrote. Checked before the binding sees a hash: bcrypt 4.0.1
# panics in Rust on a truncated one, and a pyo3 panic is a BaseException that no `except
# Exception` in the request path would catch.
_BCRYPT_SHAPE = re.compile(r"\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}")


def _bcrypt_matches(raw: bytes, stored: str) -> bool:
    if not _BCRYPT_SHAPE.fullmatch(stored):
        return False
    try:
        return bcrypt.checkpw(raw[:BCRYPT_INPUT_BYTES], stored.encode("ascii"))
    except (ValueError, TypeError, UnicodeEncodeError):
        return False


def check_password(password: str, stored: str | None, *, phase: KdfPhase) -> PasswordCheck:
    """Verify `password` against `stored` — an Argon2id hash, a passlib-era bcrypt hash, or None
    for an account that does not exist.

    The work is the same in every case: exactly one Argon2id verification and one bcrypt check
    at the production cost, each against the stored hash when it is of that kind and against a
    dummy otherwise. So neither the time nor the answer says whether the account exists or which
    scheme its hash is (SEC-006). Malformed input is a mismatch, never an exception.
    """
    try:
        raw = password.encode("utf-8")
        encodable = True
    except UnicodeEncodeError:
        raw, encodable = b"", False
    scheme = _scheme(stored)
    argon2_ok = _argon2_matches(stored if stored and scheme == "argon2" else _dummy("argon2"), raw)
    bcrypt_ok = _bcrypt_matches(raw, stored if stored and scheme == "bcrypt" else _dummy("bcrypt"))
    if not encodable or stored is None:
        return PasswordCheck(ok=False)
    if scheme == "argon2":
        if not argon2_ok:
            return PasswordCheck(ok=False)
        return PasswordCheck(ok=True, rehash=_argon2.check_needs_rehash(stored))
    if scheme == "bcrypt":
        # passlib refused a NUL byte, so no stored bcrypt hash covers one.
        if not bcrypt_ok or b"\x00" in raw:
            return PasswordCheck(ok=False)
        if len(raw) < BCRYPT_INPUT_BYTES:
            # bcrypt saw every byte (it appends a NUL inside its 72): this is the password.
            return PasswordCheck(ok=True, rehash=phase.write_argon2)
        if phase.accept_long_bcrypt:
            return PasswordCheck(ok=True, change_required=True)
        return PasswordCheck(ok=False, legacy_refused=True)
    return PasswordCheck(ok=False)


def measure(rounds: int = 15) -> str:
    """The median verification time at the production parameters, for the operator's check on the
    target host (`python -m app.auth`). Prints nothing secret: the input is random."""
    import time

    secret = secrets.token_hex(16)
    stored = PRODUCTION_ARGON2.hash(secret)
    times = []
    for _ in range(rounds):
        start = time.perf_counter()
        PRODUCTION_ARGON2.verify(stored, secret)
        times.append(time.perf_counter() - start)
    times.sort()
    return (
        f"argon2id t={ARGON2_TIME_COST} m={ARGON2_MEMORY_KIB} KiB p={ARGON2_PARALLELISM}: "
        f"median verify {times[len(times) // 2] * 1000:.1f} ms over {rounds} rounds "
        f"(budget: 250 ms, 64 MiB)"
    )


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


if __name__ == "__main__":
    import sys

    # Operator output on a terminal, not a log line: nothing secret, the input is random.
    sys.stdout.write(measure() + "\n")
