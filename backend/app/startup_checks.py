"""Refuse to start in a configuration that is known to be unsafe.

A default signing key in a public repository is not a warning-level problem: anyone can read
it here and forge a token for any user of any deployment that never set one (finding SEC-1).
The only control that actually works is refusing to serve.

The check runs at startup rather than at import so that `import app.main` still succeeds with
no environment — `RULE-DEP-001`'s import check, the OpenAPI snapshot, and every unit test
that never boots the app would otherwise need a secret to exist before they could run.
"""

from __future__ import annotations

from app.config import settings

# Every default this repository has ever shipped, in the application and in either compose
# file. A deployment can be running any of them, so all of them are fatal.
KNOWN_DEFAULT_SECRETS = frozenset(
    {
        "changeme-please-set-in-env",
        "changeme-set-in-.env",
        "changeme",
        "secret",
        "change-me",
    }
)

MINIMUM_SECRET_LENGTH = 32


class UnsafeConfiguration(RuntimeError):
    """Raised at startup. The message is the operator's instructions, so it is written for
    someone reading a container log at 3am with no context."""


def assert_jwt_secret_is_safe() -> None:
    secret = (settings.jwt_secret or "").strip()

    if not secret:
        raise UnsafeConfiguration(
            "JWT_SECRET is empty. Set it to a random value and restart:\n"
            "    openssl rand -base64 48\n"
            "Refusing to start: every session token would be signed with nothing."
        )

    if secret in KNOWN_DEFAULT_SECRETS:
        raise UnsafeConfiguration(
            "JWT_SECRET is a default value published in this repository, so anyone can "
            "forge a token for any account here. Set a real one and restart:\n"
            "    openssl rand -base64 48\n"
            "Refusing to start."
        )

    if len(secret) < MINIMUM_SECRET_LENGTH:
        raise UnsafeConfiguration(
            f"JWT_SECRET is {len(secret)} characters; {MINIMUM_SECRET_LENGTH} is the minimum. "
            "A short HS256 key is brute-forceable offline from a single captured token. "
            "Set a longer one and restart:\n"
            "    openssl rand -base64 48\n"
            "Refusing to start."
        )


def run_all() -> None:
    """Every startup check, in the order a failure is most usefully reported."""
    assert_jwt_secret_is_safe()
