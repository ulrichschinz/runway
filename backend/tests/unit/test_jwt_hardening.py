"""SEC-002 (brief 0072, plan M7.1, ADR 0046): one signing algorithm, fixed in code; a signing key that is
neither published nor degenerate nor a public key; a maintained JWT library — each with the attack it
refuses.

The two python-jose CVEs the review confirmed in the lock need a precondition this application must
never meet, so the preconditions are the tests: a public key used as the HMAC secret (CVE-2024-33663 and
its DER bypass CVE-2026-85394) is refused at boot, and an empty or guessable key (CVE-2026-120459) is
refused at boot; a token with any algorithm or key but the one this server signs with is refused on
every request.

Tokens are built by hand here (base64url + HMAC from the standard library) wherever the library under
test must not be the one that also builds the probe.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa

from app import auth, startup_checks
from app.config import settings
from app.startup_checks import UnsafeConfiguration

BACKEND = Path(__file__).resolve().parents[2]
ROOT = BACKEND.parent


# --- helpers ---------------------------------------------------------------------------------------


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _segment(obj: dict) -> str:
    return _b64(json.dumps(obj, separators=(",", ":")).encode())


def _hs(header: dict, claims: dict, key: bytes, digest=hashlib.sha256) -> str:
    """A compact JWS signed with HMAC by hand — the shape python-jose produced, too."""
    signing_input = f"{_segment(header)}.{_segment(claims)}"
    signature = hmac.new(key, signing_input.encode(), digest).digest()
    return f"{signing_input}.{_b64(signature)}"


def _claims(username: str = "alice", **extra) -> dict:
    now = datetime.now(UTC)
    return {
        "sub": username,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=1)).timestamp()),
        "jti": secrets.token_urlsafe(8),
        "auth_version": 1,
        **extra,
    }


def _rsa_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _public_pem(key) -> str:
    return (
        key.public_key()
        .public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        .decode()
    )


def _public_der_b64(key) -> str:
    der = key.public_key().public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    return base64.b64encode(der).decode()


def _refused(monkeypatch, secret: str) -> UnsafeConfiguration:
    monkeypatch.setattr(settings, "jwt_secret", secret)
    with pytest.raises(UnsafeConfiguration) as raised:
        startup_checks.run_all()
    return raised.value


# --- origin: nothing published in this repository can sign --------------------------------------

_LITERAL = [
    re.compile(r"JWT_SECRET=([^\s$#\"'`]+)"),  # .env files, README, compose list form
    re.compile(r"JWT_SECRET:-([^}\s]+)\}"),  # compose defaults: ${JWT_SECRET:-…}
    re.compile(r"jwt_secret\b[^=\n]*=\s*\"([^\"]+)\""),  # Python: settings.jwt_secret = "…"
    re.compile(r"\"jwt_secret\",\s*\"([^\"]+)\""),  # Python: setattr(settings, "jwt_secret", "…")
]


# Where this repository publishes text. An allowlist, never a walk of the checkout: the checkout also
# holds the operator's own `.env`, `users.db` and `data/` (never read by a test), and untracked evidence.
_PUBLISHED_FILES = (
    ".env.example",
    "README.md",
    "AGENTS.md",
    "docker-compose.yml",
    "Makefile",
    "run",
)
_PUBLISHED_DIRS = (
    "backend/app",
    "backend/tests",
    "tools",
    "ops",
    "docs",
    "integrations",
    ".github",
)
_UNPUBLISHED = ("docs/security-audits", "docs/plan/security-remediation-2026-11.md")
_TEXT_SUFFIXES = {
    "",
    ".md",
    ".py",
    ".sh",
    ".yml",
    ".yaml",
    ".toml",
    ".json",
    ".txt",
    ".conf",
    ".env",
}


def _published_paths():
    for name in _PUBLISHED_FILES:
        if (ROOT / name).is_file():
            yield ROOT / name
    for top in _PUBLISHED_DIRS:
        for directory, subdirs, names in os.walk(ROOT / top):
            subdirs[:] = [d for d in subdirs if d not in {"__pycache__", "node_modules", ".venv"}]
            for name in names:
                path = Path(directory) / name
                rel = path.relative_to(ROOT).as_posix()
                if path.suffix in _TEXT_SUFFIXES and not rel.startswith(_UNPUBLISHED):
                    yield path


def published_secret_literals() -> set[str]:
    """Every value assigned to JWT_SECRET in the repository's published text — README,
    .env.example, compose files, docs, tools, tests, fixtures. A value someone can read here is a
    value someone can sign with."""
    found: set[str] = set()
    for path in _published_paths():
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for pattern in _LITERAL:
            found.update(m.group(1) for m in pattern.finditer(text))
    return {value for value in found if value.strip() and value not in {"...", "…"}}


class TestTheSecretIsRefusedByOrigin:
    def test_the_scan_finds_the_published_values(self):
        """A guard on the guard: the regexes must see the known examples, or the test below is vacuous."""
        found = published_secret_literals()
        assert "replace-with-a-long-random-string" in found  # .env.example
        assert "changeme-set-in-.env" in found  # docker-compose.yml
        assert "changeme-please-set-in-env" in found  # config.py
        assert "your-secret-here" in found  # README

    def test_every_secret_published_in_this_repository_is_refused(self, monkeypatch):
        accepted = []
        for value in sorted(published_secret_literals()):
            monkeypatch.setattr(settings, "jwt_secret", value)
            try:
                startup_checks.run_all()
            except UnsafeConfiguration:
                continue
            accepted.append(value)
        assert not accepted, f"published in this repository and still bootable: {accepted}"

    @pytest.mark.parametrize(
        "secret",
        [
            "replace-with-a-long-random-string",  # .env.example, 33 characters
            "please-REPLACE-WITH-a-long-random-string-0001",
            "changeme-" + "q8Zr2LpX4vNw7TyB1kMs",
            "your-secret-here-but-longer-than-thirty-two",
        ],
    )
    def test_a_placeholder_is_refused_however_it_is_dressed(self, monkeypatch, secret):
        assert "published" in str(_refused(monkeypatch, secret))


# --- shape: a public key, a repetition, a tiny alphabet ------------------------------------------


class TestTheSecretIsRefusedByShape:
    def test_a_pem_public_key_is_refused(self, monkeypatch):
        """The CVE-2024-33663 precondition: the verifier's HMAC key is a key the attacker holds."""
        assert "public key" in str(_refused(monkeypatch, _public_pem(_rsa_key())))

    def test_a_pem_block_of_any_kind_is_refused(self, monkeypatch):
        key = ec.generate_private_key(ec.SECP256R1())
        pem = key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ).decode()
        assert "public key" in str(_refused(monkeypatch, pem))

    def test_a_base64_der_public_key_is_refused(self, monkeypatch):
        """CVE-2026-85394: the DER form, which python-jose's guard did not recognise."""
        assert "public key" in str(_refused(monkeypatch, _public_der_b64(_rsa_key())))

    def test_an_ec_public_key_in_der_is_refused(self, monkeypatch):
        der = (
            ec.generate_private_key(ec.SECP256R1())
            .public_key()
            .public_bytes(
                serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
            )
        )
        assert "public key" in str(_refused(monkeypatch, base64.b64encode(der).decode()))

    def test_an_openssh_public_key_is_refused(self, monkeypatch):
        ssh = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGq3n0u5mB2cN8vX1yZ4tR7wQ9eL6kP0sJ3hF5dA2bC1 ops@host"
        assert "public key" in str(_refused(monkeypatch, ssh))

    def test_a_jwk_is_refused(self, monkeypatch):
        jwk = json.dumps({"kty": "RSA", "e": "AQAB", "n": _b64(secrets.token_bytes(256))})
        assert "public key" in str(_refused(monkeypatch, jwk))

    @pytest.mark.parametrize(
        "secret",
        ["x" * 32, "ab" * 16, "password" * 4, "0123456789abcdef" * 2, "Tr0ub4dor&3!" * 3],
    )
    def test_a_repeated_unit_is_refused(self, monkeypatch, secret):
        assert "repeat" in str(_refused(monkeypatch, secret))

    @pytest.mark.parametrize(
        "secret",
        ["aaaaaaaabbbbbbbbccccccccdddddddd", "abcdabcdabcdabcdabcdabcdabcdabcz"[::-1] + "aaaa"],
    )
    def test_a_tiny_alphabet_is_refused(self, monkeypatch, secret):
        assert "entropy" in str(_refused(monkeypatch, secret))

    def test_an_empty_secret_is_refused(self, monkeypatch):
        """CVE-2026-120459's precondition."""
        assert "empty" in str(_refused(monkeypatch, ""))

    def test_the_refusal_never_contains_the_secret(self, monkeypatch):
        for secret in ["x" * 40, _public_pem(_rsa_key()), "replace-with-a-long-random-string"]:
            assert secret.strip() not in str(_refused(monkeypatch, secret))

    @pytest.mark.parametrize(
        "generator",
        [
            lambda: base64.b64encode(secrets.token_bytes(48)).decode(),  # openssl rand -base64 48
            lambda: secrets.token_urlsafe(48),  # the bootstrap fallback
            lambda: secrets.token_hex(32),  # openssl rand -hex 32
            lambda: secrets.token_hex(16),  # openssl rand -hex 16, the weakest documented form
        ],
        ids=["base64-48", "urlsafe-48", "hex-32", "hex-16"],
    )
    def test_every_documented_generator_passes(self, monkeypatch, generator):
        for _ in range(200):
            monkeypatch.setattr(settings, "jwt_secret", generator())
            startup_checks.run_all()


class TestTheOperatorCheck:
    """`python -m app.startup_checks` — the runbook's pre-deploy check of the host's .env."""

    def test_a_refused_secret_exits_1_and_never_prints_it(self, monkeypatch, capsys):
        secret = "replace-with-a-long-random-string"
        monkeypatch.setattr(settings, "jwt_secret", secret)
        assert startup_checks.main() == 1
        out, err = capsys.readouterr()
        assert "refused" in err and secret not in out + err

    def test_a_generated_secret_exits_0(self, monkeypatch, capsys):
        secret = secrets.token_urlsafe(48)
        monkeypatch.setattr(settings, "jwt_secret", secret)
        assert startup_checks.main() == 0
        out, err = capsys.readouterr()
        assert out.startswith("ok") and secret not in out + err


# --- the algorithm is the code's, not the environment's ------------------------------------------


class TestTheAlgorithmIsFixed:
    @pytest.mark.parametrize("value", ["HS512", "HS384", "none", "RS256", "hs256", ""])
    def test_any_configured_algorithm_but_hs256_refuses_to_start(self, monkeypatch, value):
        monkeypatch.setattr(settings, "jwt_algorithm", value)
        with pytest.raises(UnsafeConfiguration, match="JWT_ALGORITHM"):
            startup_checks.run_all()

    def test_hs256_configured_still_starts(self, monkeypatch):
        """The value every existing .env may still carry (SHIM-SEC-010)."""
        monkeypatch.setattr(settings, "jwt_algorithm", "HS256")
        startup_checks.run_all()

    def test_issued_tokens_are_hs256_whatever_the_setting_says(self, monkeypatch):
        monkeypatch.setattr(settings, "jwt_algorithm", "HS512")
        token = auth.create_access_token("alice", auth_version=1)
        header = json.loads(base64.urlsafe_b64decode(token.split(".")[0] + "=="))
        assert header["alg"] == "HS256"

    def test_an_hs512_token_is_refused_even_when_the_setting_names_it(self, monkeypatch):
        monkeypatch.setattr(settings, "jwt_algorithm", "HS512")
        token = _hs(
            {"alg": "HS512", "typ": "JWT"},
            _claims(),
            settings.jwt_secret.encode(),
            hashlib.sha512,
        )
        assert auth.decode_token(token) is None


# --- every token but ours is refused -------------------------------------------------------------


def _hostile_tokens() -> dict[str, str]:
    secret = settings.jwt_secret.encode()
    attacker = _rsa_key()
    attacker_pem = attacker.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    import jwt as pyjwt  # the probe's RS256 signature; the verifier under test never sees this key

    return {
        "alg none": f"{_segment({'alg': 'none', 'typ': 'JWT'})}.{_segment(_claims())}.",
        "alg None": f"{_segment({'alg': 'None'})}.{_segment(_claims())}.",
        "HS384 with the real secret": _hs({"alg": "HS384"}, _claims(), secret, hashlib.sha384),
        "HS512 with the real secret": _hs({"alg": "HS512"}, _claims(), secret, hashlib.sha512),
        "lower-case hs256 with the real secret": _hs({"alg": "hs256"}, _claims(), secret),
        "RS256 with an attacker key": pyjwt.encode(_claims(), attacker_pem, algorithm="RS256"),
        "HS256 with an empty key": _hs({"alg": "HS256"}, _claims(), b""),
        "HS256 keyed with a public key PEM": _hs(
            {"alg": "HS256"}, _claims(), _public_pem(attacker).encode()
        ),
        "HS256 with an embedded jwk": _hs(
            {
                "alg": "HS256",
                "jwk": {"kty": "oct", "k": _b64(b"attacker-key-0123456789abcdefghij")},
            },
            _claims(),
            b"attacker-key-0123456789abcdefghij",
        ),
        "HS256 with a jku": _hs(
            {"alg": "HS256", "jku": "https://attacker.example/jwks.json", "kid": "1"},
            _claims(),
            b"attacker-key-0123456789abcdefghij",
        ),
        "HS256 with a wrong secret": _hs({"alg": "HS256"}, _claims(), b"x" * 48),
        "no alg at all": _hs({"typ": "JWT"}, _claims(), secret),
        "alg as a list": _hs({"alg": ["HS256"]}, _claims(), secret),
    }


class TestEveryOtherTokenIsRefused:
    def test_positive_control_a_hand_built_hs256_token_is_accepted(self):
        """The format the previous library issued — so a rollback, and every session alive at the
        deploy, keeps working — and the control that makes every refusal below mean something."""
        token = _hs({"alg": "HS256", "typ": "JWT"}, _claims(), settings.jwt_secret.encode())
        claims = auth.decode_token(token)
        assert claims is not None and claims.username == "alice" and claims.auth_version == 1

    def test_an_issued_token_verifies_by_hand(self):
        """And the other direction: what this server issues is plain HS256 any verifier accepts."""
        token = auth.create_access_token("alice", auth_version=3)
        signing_input, _, signature = token.rpartition(".")
        expected = hmac.new(settings.jwt_secret.encode(), signing_input.encode(), hashlib.sha256)
        assert _b64(expected.digest()) == signature
        header = json.loads(base64.urlsafe_b64decode(token.split(".")[0] + "=="))
        assert header == {"alg": "HS256", "typ": "JWT"}

    def test_every_hostile_token_is_refused_by_the_decoder(self):
        accepted = [name for name, token in _hostile_tokens().items() if auth.decode_token(token)]
        assert not accepted

    def test_every_hostile_token_gets_401_over_http(self, client, registered, auth):
        """REST and an MCP-exposed route: the same answer as no credential at all."""
        assert client.get("/auth/me", headers=auth).status_code == 200  # positive control
        for name, token in _hostile_tokens().items():
            headers = {"Authorization": f"Bearer {token}"}
            for path in ("/auth/me", "/tasks"):
                status = client.get(path, headers=headers).status_code
                assert status == 401, f"{name} on {path}: {status}"


# --- the library ---------------------------------------------------------------------------------


class TestTheJwtLibrary:
    def test_the_application_does_not_import_python_jose(self):
        import importlib

        for module in ("app.main", "app.auth", "app.dependencies"):
            importlib.import_module(module)
        assert "jose" not in sys.modules
        sources = [p for p in (BACKEND / "app").rglob("*.py")]
        importing = [
            str(p.relative_to(BACKEND))
            for p in sources
            if re.search(r"^\s*(from|import)\s+jose\b", p.read_text(encoding="utf-8"), re.M)
        ]
        assert not importing

    @pytest.mark.parametrize(
        "lock", ["requirements.txt", "requirements.lock", "requirements-dev.lock"]
    )
    def test_python_jose_and_its_unfixed_transitives_are_gone(self, lock):
        text = (BACKEND / lock).read_text(encoding="utf-8")
        pinned = {
            m.lower() for m in re.findall(r"^([A-Za-z0-9_.\-]+)(?:\[[^\]]*\])?==", text, re.M)
        }
        assert not pinned & {"python-jose", "ecdsa"}, f"still pinned in {lock}"

    def test_pyjwt_is_a_direct_pin(self):
        text = (BACKEND / "requirements.txt").read_text(encoding="utf-8")
        assert re.search(r"^PyJWT==2\.15\.1$", text, re.MULTILINE)

    def test_the_library_refuses_a_pem_public_key_as_hmac_key(self):
        """Defence in depth under the startup refusal: the installed PyJWT will not use one either."""
        import jwt as pyjwt

        with pytest.raises(pyjwt.InvalidKeyError):
            pyjwt.encode(_claims(), _public_pem(_rsa_key()), algorithm="HS256")

    def test_the_library_refuses_a_der_public_key_as_hmac_key(self):
        """GHSA-p4g4-x82p-q773 (CVE-2026-102271), fixed in PyJWT 2.14.0 — the version line matters."""
        import jwt as pyjwt

        der = (
            _rsa_key()
            .public_key()
            .public_bytes(
                serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo
            )
        )
        with pytest.raises(pyjwt.InvalidKeyError):
            pyjwt.encode(_claims(), der, algorithm="HS256")
