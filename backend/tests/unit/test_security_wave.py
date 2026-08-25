"""The controls added by Step 11's second wave, each with the attack it refuses.

A security control nobody has watched fail is an assumption. Every test here constructs the
thing the control exists to stop and asserts the refusal, rather than asserting that the
happy path still works.
"""

import pytest
from fastapi.testclient import TestClient

from app import rate_limit, startup_checks
from app.config import cors_origin_list, settings
from app.startup_checks import UnsafeConfiguration

# Not a credential: the string exists precisely so that it is never the right one.
WRONG_PASSWORD = "not-the-password"


class TestRefusesToBootOnAnUnsafeSecret:
    """SEC-1. A default signing key in a public repository lets anyone forge a token for
    any account. The only control that works is refusing to serve."""

    @pytest.mark.parametrize(
        "secret",
        [
            "changeme-please-set-in-env",  # the application default
            "changeme-set-in-.env",  # the compose default — a different string
            "changeme",
            "secret",
        ],
    )
    def test_every_published_default_is_fatal(self, monkeypatch, secret):
        monkeypatch.setattr(settings, "jwt_secret", secret)
        with pytest.raises(UnsafeConfiguration, match="Refusing to start"):
            startup_checks.assert_jwt_secret_is_safe()

    def test_an_empty_secret_is_fatal(self, monkeypatch):
        monkeypatch.setattr(settings, "jwt_secret", "   ")
        with pytest.raises(UnsafeConfiguration, match="empty"):
            startup_checks.assert_jwt_secret_is_safe()

    def test_a_short_secret_is_fatal(self, monkeypatch):
        """31 characters of real randomness is still brute-forceable offline from one
        captured token, so length is checked separately from the default list."""
        monkeypatch.setattr(settings, "jwt_secret", "x" * 31)
        with pytest.raises(UnsafeConfiguration, match="31 characters"):
            startup_checks.assert_jwt_secret_is_safe()

    def test_a_real_secret_passes(self, monkeypatch):
        monkeypatch.setattr(settings, "jwt_secret", "x" * 32)
        startup_checks.assert_jwt_secret_is_safe()

    def test_the_app_actually_refuses_to_start(self, isolated_storage, monkeypatch):
        """Not just the function — the wiring. A check nobody calls is documentation."""
        monkeypatch.setattr(settings, "jwt_secret", "changeme-set-in-.env")
        from app.main import app

        with pytest.raises(UnsafeConfiguration):
            with TestClient(app):
                pass


class TestCorsIsNoLongerAWildcard:
    """SEC-4. `allow_origins=["*"]` with `allow_credentials=True` makes Starlette reflect
    the caller's own Origin, so every origin held full credentialed access."""

    def test_no_cors_headers_are_returned_when_nothing_is_configured(self, client):
        r = client.get("/health", headers={"Origin": "https://evil.example"})
        assert r.status_code == 200
        assert "access-control-allow-origin" not in {k.lower() for k in r.headers}

    def test_a_preflight_from_an_arbitrary_origin_is_not_granted(self, client):
        r = client.options(
            "/auth/login",
            headers={
                "Origin": "https://evil.example",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert "access-control-allow-origin" not in {k.lower() for k in r.headers}

    def test_the_configured_list_is_parsed_and_whitespace_tolerant(self, monkeypatch):
        monkeypatch.setattr(settings, "cors_origins", " https://a.example , https://b.example ,")
        assert cors_origin_list() == ["https://a.example", "https://b.example"]

    def test_empty_configuration_means_no_origins(self, monkeypatch):
        monkeypatch.setattr(settings, "cors_origins", "  ,  ")
        assert cors_origin_list() == []


class TestLoginIsRateLimited:
    """SEC-8. bcrypt is a cost ceiling, not a control: it slows a brute force without ever
    stopping one."""

    def _fail_login(self, client, username="victim", password=WRONG_PASSWORD):
        return client.post("/auth/login", json={"username": username, "password": password})

    def test_repeated_failures_eventually_get_429(self, client, registered):
        name = registered["username"]
        for _ in range(settings.login_rate_limit):
            assert self._fail_login(client, name).status_code == 401
        blocked = self._fail_login(client, name)
        assert blocked.status_code == 429
        assert "Retry-After" in blocked.headers

    def test_the_correct_password_is_refused_too_once_locked(self, client, registered):
        """The point of the lockout: guessing right on attempt eleven must not pay."""
        name = registered["username"]
        for _ in range(settings.login_rate_limit):
            self._fail_login(client, name)
        r = client.post("/auth/login", json={"username": name, "password": registered["password"]})
        assert r.status_code == 429

    def test_an_unknown_username_is_throttled_the_same_way(self, client):
        """Skipping unknown usernames would make the limiter a user-enumeration oracle:
        throttled would mean 'this account exists'."""
        for _ in range(settings.login_rate_limit):
            assert self._fail_login(client, "no-such-user").status_code == 401
        assert self._fail_login(client, "no-such-user").status_code == 429

    def test_one_username_being_locked_does_not_lock_another(self, client, registered):
        for _ in range(settings.login_rate_limit + 1):
            self._fail_login(client, "someone-else")
        r = client.post(
            "/auth/login",
            json={"username": registered["username"], "password": registered["password"]},
        )
        assert r.status_code == 200

    def test_a_successful_login_clears_the_budget(self, client, registered):
        name = registered["username"]
        for _ in range(settings.login_rate_limit - 1):
            self._fail_login(client, name)
        assert (
            client.post(
                "/auth/login", json={"username": name, "password": registered["password"]}
            ).status_code
            == 200
        )
        # Budget reset, so a fresh run of failures is needed to lock it again.
        for _ in range(settings.login_rate_limit):
            assert self._fail_login(client, name).status_code == 401

    def test_the_window_expires(self, client, registered, monkeypatch):
        name = registered["username"]
        for _ in range(settings.login_rate_limit):
            self._fail_login(client, name)
        assert self._fail_login(client, name).status_code == 429

        # Advance past the window rather than sleeping through it.
        real_now = rate_limit._now()
        monkeypatch.setattr(
            rate_limit, "_now", lambda: real_now + settings.login_rate_window_seconds + 1
        )
        assert self._fail_login(client, name).status_code == 401

    def test_api_keys_are_unaffected_by_a_lockout(self, client, registered):
        """Stated as a mitigation for keying on username: an attacker who knows a username
        can lock it out of password login, and agents must keep working through that."""
        for _ in range(settings.login_rate_limit + 1):
            self._fail_login(client, registered["username"])
        r = client.get("/auth/me", headers={"X-Api-Key": registered["api_key"]})
        assert r.status_code == 200
