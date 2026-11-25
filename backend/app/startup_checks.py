"""Refuse to start in a configuration that is known to be unsafe.

A default signing key in a public repository is not a warning-level problem: anyone can read
it here and forge a token for any user of any deployment that never set one (finding SEC-1).
The only control that actually works is refusing to serve.

Finding SEC-002 (brief 0072, ADR 0046) widened what "known" means. A key is refused when it is
published — any value this repository has shipped or shows as an example, or one that still carries a
placeholder's wording; when it is a public key, whose holder is everyone (the precondition of
CVE-2024-33663 and CVE-2026-85394), or anything PyJWT itself would refuse as an HMAC key; when it is
empty (CVE-2026-120459), short, one short unit repeated, mostly a copy of its own earlier characters, or
of an estimated entropy no generated secret falls under. And the signing algorithm is the code's:
JWT_ALGORITHM may only still say what the code does.

What no check here can do is prove a value random. The estimates refuse repetition, runs and tiny
alphabets; they cannot tell a long memorable phrase or a keyboard row from a generated string. The runbook generates the
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

from jwt.algorithms import HMACAlgorithm
from jwt.exceptions import InvalidKeyError

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

# The same estimate, charged only for the characters that are not a copy of earlier text — in the value
# or in its successive character differences (`estimated_novel_bits`). In 500 000 draws of
# `openssl rand -hex 16` the minimum was 65.4 (brief 0072, review round 1); `password`×4 with one
# character appended scores 26, the alphabet in order 15, `Tr0ub4dor&3!`×3+`x` 46.
MINIMUM_NOVEL_BITS = 56

# Only the start of a long value is measured: the parse is quadratic, and 256 characters of anything
# generated hold far more than the minimum.
_NOVELTY_WINDOW = 256
_MIN_COPY = 3

# Short-Weierstrass curves y² = x³ + ax + b over GF(p) whose public keys travel as an uncompressed
# point, 0x04 ‖ X ‖ Y: (p, a, b). A random byte string lies on one with probability about 2^-256.
_CURVES = {
    32: (
        (
            2**256 - 2**224 + 2**192 + 2**96 - 1,
            -3,
            0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B,
        ),  # P-256
        (2**256 - 2**32 - 977, 0, 7),  # secp256k1
    ),
    48: (
        (
            2**384 - 2**128 - 2**96 + 2**32 - 1,
            -3,
            0xB3312FA7E23EE7E4988E056BE3F82D19181D9C6EFE8141120314088F5013875AC656398D8A2ED19D2A85C8EDD3EC2AEF,
        ),  # P-384
    ),
    66: (
        (
            2**521 - 1,
            -3,
            0x0051953EB9618E1C9A1F929A21A0B68540EEA2DA725B99B315F3B8B489918EF109E156193951EC7E937B1652C0BD3BB1BF073573DF883D2C34F1EF451FD46B503F00,
        ),  # P-521
    ),
}

_URLSAFE = str.maketrans("-_", "+/")

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


def _uncopied(seq: list) -> int:
    """How many elements of `seq` a greedy LZ77 parse cannot explain as a copy (of at least _MIN_COPY,
    overlap allowed) of what came before. `passwordpassword!` → 9: `password`, then a copy, then `!`."""
    literal, i, n = 0, 0, len(seq)
    while i < n:
        longest = 0
        for j in range(i):
            k = 0
            while i + k < n and seq[j + k] == seq[i + k]:
                k += 1
            longest = max(longest, k)
        if longest >= _MIN_COPY:
            i += longest
        else:
            literal += 1
            i += 1
    return literal


def estimated_novel_bits(value: str) -> float:
    """The entropy estimate charged only for what is new: per-character Shannon entropy × the number
    of characters that are not a copy of earlier text, in the value itself or in its successive
    character differences (so `abcdef…` and `zyx…` — every difference the same — hold almost nothing).
    Catches what exact periodicity misses: `password`×4 + `!`, a run, a long run then an alphabet.
    It is still an estimate — a keyboard row or a memorable phrase is new to it."""
    window = value[:_NOVELTY_WINDOW]
    if not window:
        return 0.0
    per_char = estimated_entropy_bits(window) / len(window)
    differences = [ord(b) - ord(a) for a, b in zip(window, window[1:], strict=False)]
    return per_char * min(_uncopied(list(window)), 1 + _uncopied(differences))


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


def _on_a_curve(raw: bytes) -> bool:
    """An uncompressed EC point (0x04 ‖ X ‖ Y) that satisfies a known curve's equation. Compressed
    points and raw Ed25519 keys are deliberately not recognised: about half of all 33-byte strings that
    start with 0x02 decompress to a point, and every 32 bytes are an Ed25519 key — refusing those would
    refuse generated secrets."""
    if not raw or raw[0] != 0x04 or (len(raw) - 1) % 2:
        return False
    size = (len(raw) - 1) // 2
    x, y = int.from_bytes(raw[1 : 1 + size], "big"), int.from_bytes(raw[1 + size :], "big")
    return any(
        x < p and y < p and (y * y - (x * x * x + a * x + b)) % p == 0
        for p, a, b in _CURVES.get(size, ())
    )


def _has_jwk_member(document: object) -> bool:
    """A JWK (`kty`) or a JWK set (`keys`) anywhere in a JSON document."""
    pending = [document]
    while pending:
        node = pending.pop()
        if isinstance(node, dict):
            if "kty" in node or "keys" in node:
                return True
            pending.extend(node.values())
        elif isinstance(node, list):
            pending.extend(node)
    return False


def _decodings(secret: str):
    """The bytes a person may have meant: hex (any case, whitespace ignored), base64 and base64url."""
    compact = "".join(secret.split())
    if len(compact) % 2 == 0 and all(c in "0123456789abcdefABCDEF" for c in compact):
        yield bytes.fromhex(compact)
    padded = compact + "=" * (-len(compact) % 4)
    for text in {padded, padded.translate(_URLSAFE)}:  # base64, and base64url read as base64
        try:
            yield base64.b64decode(text, validate=True)
        except (binascii.Error, ValueError):
            continue


def looks_like_key_material(secret: str) -> bool:
    """A public key — or any asymmetric key — in the forms a person copies: PEM, OpenSSH, a JWK, a JWK
    set or array, DER (a SubjectPublicKeyInfo, PKCS#1 or PKCS#8 body) or an uncompressed EC point in
    hex, base64 or base64url. Used as an HMAC secret, its holder is everyone it was shared with."""
    if "-----BEGIN" in secret:
        return True
    if secret.startswith(("ssh-", "ecdsa-sha2-", "sk-ssh-", "sk-ecdsa-")):
        return True
    if secret.startswith(("{", "[")):
        try:
            return _has_jwk_member(json.loads(secret))
        except (ValueError, RecursionError):
            return False
    return any(_is_der_structure(raw) or _on_a_curve(raw) for raw in _decodings(secret))


def _the_library_refuses(secret: str) -> bool:
    """PyJWT's own HMAC key check, run at boot: whatever it would refuse at the first login, the
    startup refuses instead, so the two can never disagree (a JWKS once booted and failed every login)."""
    try:
        HMACAlgorithm(HMACAlgorithm.SHA256).prepare_key(secret)
    except InvalidKeyError:
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

    if looks_like_key_material(secret) or _the_library_refuses(settings.jwt_secret):
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

    novel = estimated_novel_bits(secret)
    if novel < MINIMUM_NOVEL_BITS:
        raise UnsafeConfiguration(
            f"JWT_SECRET mostly repeats its own earlier characters (or steps through them in order): "
            f"an estimated {novel:.0f} bits are new (at least {MINIMUM_NOVEL_BITS} needed). Set a "
            "generated one and restart:\n" + _GENERATE + "Refusing to start."
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
