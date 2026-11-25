"""Refuse to start in a configuration that is known to be unsafe.

A default signing key in a public repository is not a warning-level problem: anyone can read
it here and forge a token for any user of any deployment that never set one (finding SEC-1).
The only control that actually works is refusing to serve.

Finding SEC-002 (brief 0072, ADR 0046) widened what "known" means. A key is refused when it is
published — any value this repository has shipped or shows as an example, or one that still carries a
placeholder's wording; when it is a public key, whose holder is everyone (the precondition of
CVE-2024-33663 and CVE-2026-85394); when it is empty (CVE-2026-120459), short, one short unit repeated,
or of an estimated entropy no generated secret falls under. And the signing algorithm is the code's:
JWT_ALGORITHM may only still say what the code does.

What no check here can do is prove a value random. The entropy estimate refuses repetition and tiny
alphabets; it cannot tell a long memorable phrase from a generated string. The runbook generates the
secret (docs/operations.md); nothing in this repository ever holds one.

The check runs at startup rather than at import so that `import app.main` still succeeds with
no environment — `RULE-DEP-001`'s import check, the OpenAPI snapshot, and every unit test
that never boots the app would otherwise need a secret to exist before they could run.
"""

from __future__ import annotations

import base64
import binascii
import json
import math
import sys
from collections import Counter

from app.config import JWT_SIGNING_ALGORITHM, settings

# Every value this repository has ever published as a signing key: the defaults in the application and
# in either compose file, the examples in .env.example and README, and the throwaway values tests, tools
# and fixtures once used. A deployment can be running any of them, so all of them are fatal.
# test_jwt_hardening.py fails when a JWT_SECRET literal anywhere in the repository is not refused.
KNOWN_DEFAULT_SECRETS = frozenset(
    {
        "changeme-please-set-in-env",
        "changeme-set-in-.env",
        "changeme",
        "secret",
        "change-me",
        "replace-with-a-long-random-string",
        "your-secret-here",
        "test-secret-long-enough-to-pass-the-startup-check",
        "surface-capture-secret-long-enough-to-boot",
        "a-literal-value-that-must-not-ship",
    }
)

# Wording only a placeholder has. A secret that contains one was typed from an example, not generated —
# `replace-with-a-long-random-string-2` is as public as the original. Compared case-insensitively.
PLACEHOLDER_FRAGMENTS = (
    "changeme",
    "change-me",
    "change_me",
    "replace-with",
    "replace_with",
    "your-secret",
    "your_secret",
    "secret-here",
    "set-in-env",
    "set-in-.env",
    "long-enough-to",
    "must-not-ship",
)

MINIMUM_SECRET_LENGTH = 32

# Length × the empirical Shannon entropy of its characters. `openssl rand -hex 16`, the weakest form the
# runbook accepts, never fell under 89 in 200 000 draws (brief 0072); base64 of 48 random bytes scores
# about 330. What falls under 80 is a tiny alphabet, not bad luck.
MINIMUM_ESTIMATED_ENTROPY_BITS = 80

_GENERATE = "    openssl rand -base64 48\n"


class UnsafeConfiguration(RuntimeError):
    """Raised at startup. The message is the operator's instructions, so it is written for
    someone reading a container log at 3am with no context. It never contains the secret."""


def estimated_entropy_bits(value: str) -> float:
    """Length × empirical Shannon entropy per character. An upper bound on what a value can hold, and
    a crude one — it is here to refuse the obviously degenerate, not to certify the random."""
    if not value:
        return 0.0
    counts = Counter(value)
    n = len(value)
    return -n * sum(c / n * math.log2(c / n) for c in counts.values())


def smallest_period(value: str) -> int:
    """The shortest unit the value is a repetition of, a trailing partial copy allowed (KMP failure
    function). `passwordpasswordpassword` → 8; a value with no repetition → its own length."""
    failure = [0] * len(value)
    k = 0
    for i in range(1, len(value)):
        while k and value[i] != value[k]:
            k = failure[k - 1]
        if value[i] == value[k]:
            k += 1
        failure[i] = k
    return len(value) - (failure[-1] if value else 0)


def _der_length(raw: bytes, at: int) -> tuple[int, int] | None:
    """(content length, header length) of the DER element at `at`, or None."""
    if at + 2 > len(raw):
        return None
    first = raw[at + 1]
    if first < 0x80:
        return first, 2
    if first == 0x81 and at + 3 <= len(raw):
        return raw[at + 2], 3
    if first == 0x82 and at + 4 <= len(raw):
        return (raw[at + 2] << 8) | raw[at + 3], 4
    return None


def _is_der_structure(raw: bytes) -> bool:
    """A DER SEQUENCE spanning exactly the bytes, whose first element is a SEQUENCE or an INTEGER that
    fits inside it — the shape of a SubjectPublicKeyInfo, a PKCS#1 key and a PKCS#8 key. Random bytes
    meet all of it about once in fifteen million (two tags and an exact length), so a generated secret
    is not refused for looking like one."""
    if len(raw) < 8 or raw[0] != 0x30:
        return False
    outer = _der_length(raw, 0)
    if outer is None or sum(outer) != len(raw):
        return False
    inner_at = outer[1]
    if raw[inner_at] not in (0x30, 0x02):
        return False
    inner = _der_length(raw, inner_at)
    return inner is not None and inner_at + sum(inner) <= len(raw)


def looks_like_key_material(secret: str) -> bool:
    """A public key — or any asymmetric key — in the forms a person copies: PEM, OpenSSH, JWK, or the
    base64 DER body of a PEM block. Used as an HMAC secret, its holder is everyone it was shared with."""
    if "-----BEGIN" in secret:
        return True
    if secret.startswith(("ssh-", "ecdsa-sha2-", "sk-ssh-", "sk-ecdsa-")):
        return True
    if secret.startswith("{"):
        try:
            parsed = json.loads(secret)
        except ValueError:
            return False
        return isinstance(parsed, dict) and "kty" in parsed
    compact = "".join(secret.split())
    for decode in (base64.b64decode, base64.urlsafe_b64decode):
        try:
            raw = decode(compact + "=" * (-len(compact) % 4))
        except (binascii.Error, ValueError):
            continue
        if _is_der_structure(raw):
            return True
    return False


def _published(secret: str) -> bool:
    if secret in KNOWN_DEFAULT_SECRETS:
        return True
    lowered = secret.lower()
    return any(fragment in lowered for fragment in PLACEHOLDER_FRAGMENTS)


def assert_jwt_secret_is_safe() -> None:
    secret = (settings.jwt_secret or "").strip()

    if not secret:
        raise UnsafeConfiguration(
            "JWT_SECRET is empty. Set it to a random value and restart:\n" + _GENERATE + "Refusing "
            "to start: every session token would be signed with nothing."
        )

    if _published(secret):
        raise UnsafeConfiguration(
            "JWT_SECRET is a value published in this repository — a default, an example or a "
            "placeholder — so anyone can forge a token for any account here. Set a generated one "
            "and restart:\n" + _GENERATE + "Refusing to start."
        )

    if looks_like_key_material(secret):
        raise UnsafeConfiguration(
            "JWT_SECRET is a public key (or another asymmetric key), not a secret: tokens are "
            "signed with HMAC, so whoever holds that key can forge a token for any account. Set a "
            "generated secret and restart:\n" + _GENERATE + "Refusing to start."
        )

    if len(secret) < MINIMUM_SECRET_LENGTH:
        raise UnsafeConfiguration(
            f"JWT_SECRET is {len(secret)} characters; {MINIMUM_SECRET_LENGTH} is the minimum. "
            "A short HS256 key is brute-forceable offline from a single captured token. "
            "Set a longer one and restart:\n" + _GENERATE + "Refusing to start."
        )

    period = smallest_period(secret)
    if period <= len(secret) // 2:
        raise UnsafeConfiguration(
            f"JWT_SECRET repeats a unit of {period} characters, so it holds no more than that unit "
            "does. Set a generated one and restart:\n" + _GENERATE + "Refusing to start."
        )

    bits = estimated_entropy_bits(secret)
    if bits < MINIMUM_ESTIMATED_ENTROPY_BITS:
        raise UnsafeConfiguration(
            f"JWT_SECRET has an estimated entropy of {bits:.0f} bits "
            f"(at least {MINIMUM_ESTIMATED_ENTROPY_BITS} needed): too few distinct characters to be "
            "generated. Set a generated one and restart:\n" + _GENERATE + "Refusing to start."
        )


def assert_jwt_algorithm_is_fixed() -> None:
    """JWT_ALGORITHM no longer chooses anything (SHIM-SEC-010). A value other than the algorithm the code
    uses means the operator expects a behaviour this server does not have — say so rather than ignore it."""
    if (settings.jwt_algorithm or "").strip() != JWT_SIGNING_ALGORITHM:
        raise UnsafeConfiguration(
            f"JWT_ALGORITHM is set to something other than {JWT_SIGNING_ALGORITHM}. Tokens are "
            f"always signed and verified with {JWT_SIGNING_ALGORITHM}; the setting is no longer a "
            "choice. Remove it from the environment (or set it to "
            f"{JWT_SIGNING_ALGORITHM}) and restart. Refusing to start."
        )


def run_all() -> None:
    """Every startup check, in the order a failure is most usefully reported."""
    assert_jwt_secret_is_safe()
    assert_jwt_algorithm_is_fixed()


def main() -> int:
    """`python -m app.startup_checks`: the same checks against this environment, before a deploy.
    Prints a verdict, never a value."""
    try:
        run_all()
    except UnsafeConfiguration as refusal:
        sys.stderr.write(f"refused: {refusal}\n")
        return 1
    sys.stdout.write("ok: this configuration passes the startup checks\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
