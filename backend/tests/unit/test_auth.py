"""Characterization tests for the identity surface.

These pin CURRENT observable behaviour, including behaviour that is known to be wrong.
Where a test documents a defect, it says so and names the step that will change it — so
that step's diff shows the behaviour change instead of hiding it.
"""

import sqlite3

import pytest

from app.config import settings


def _set_registration(enabled: bool) -> None:
    con = sqlite3.connect(settings.db_path)
    con.execute(
        "INSERT OR REPLACE INTO site_settings (key, value) VALUES ('allow_registration', ?)",
        ("true" if enabled else "false",),
    )
    con.commit()
    con.close()


class TestRegistration:
    def test_registers_and_returns_the_profile(self, client):
        _set_registration(True)
        r = client.post("/auth/register", json={"username": "bob", "password": "pw"})
        assert r.status_code == 201
        assert r.json() == {"username": "bob", "role": "user", "full_name": "", "email": ""}

    def test_is_refused_when_the_site_setting_is_off(self, client):
        _set_registration(False)
        r = client.post("/auth/register", json={"username": "bob", "password": "pw"})
        assert r.status_code == 403
        assert r.json()["detail"] == "Registration is disabled"

    def test_duplicate_username_is_rejected(self, client):
        _set_registration(True)
        client.post("/auth/register", json={"username": "bob", "password": "pw"})
        r = client.post("/auth/register", json={"username": "bob", "password": "other"})
        assert r.status_code == 400

    def test_any_insert_failure_is_reported_as_username_taken(self, client):
        """DEFECT, pinned as-is.

        The handler wraps the INSERT in `except Exception` and always reports "Username
        already taken". A disk error, a locked database or a schema problem all surface
        as a 400 blaming the user. Not fixed here: no test yet covers the error paths
        this would need to distinguish.
        """
        _set_registration(True)
        client.post("/auth/register", json={"username": "bob", "password": "pw"})
        r = client.post("/auth/register", json={"username": "bob", "password": "pw"})
        assert r.status_code == 400
        assert r.json()["detail"] == "Username already taken"

    def test_creates_the_per_user_data_directory_and_taskrc(self, client):
        _set_registration(True)
        client.post("/auth/register", json={"username": "bob", "password": "pw"})
        user_dir = settings.data_root / "bob"
        assert user_dir.is_dir()
        assert (user_dir / ".taskrc").is_file()


class TestLogin:
    def test_returns_a_bearer_token(self, client, registered):
        r = client.post(
            "/auth/login",
            json={"username": registered["username"], "password": registered["password"]},
        )
        assert r.status_code == 200
        assert r.json()["token_type"] == "bearer"
        assert r.json()["access_token"]

    @pytest.mark.parametrize(
        "username,password",
        [("alice", "wrong"), ("nobody", "correct horse battery staple")],
        ids=["wrong-password", "unknown-user"],
    )
    def test_rejects_bad_credentials_identically(self, client, registered, username, password):
        """Both failures return the same 401 and message — no user enumeration."""
        r = client.post("/auth/login", json={"username": username, "password": password})
        assert r.status_code == 401
        assert r.json()["detail"] == "Invalid credentials"


class TestAuthenticationPaths:
    """Two accepted credential types, and one endpoint that accepts a third shape."""

    def test_jwt_in_authorization_header(self, client, auth):
        assert client.get("/auth/me", headers=auth).status_code == 200

    def test_api_key_in_x_api_key_header(self, client, registered):
        r = client.get("/auth/me", headers={"X-Api-Key": registered["api_key"]})
        assert r.status_code == 200
        assert r.json()["username"] == registered["username"]

    def test_no_credentials_is_401(self, client, registered):
        assert client.get("/auth/me").status_code == 401

    def test_unknown_api_key_is_401(self, client, registered):
        r = client.get("/auth/me", headers={"X-Api-Key": "not-a-real-key"})
        assert r.status_code == 401
        assert r.json()["detail"] == "Invalid API key"

    def test_api_key_takes_precedence_over_a_valid_jwt(self, client, registered, auth):
        """CURRENT behaviour: X-Api-Key is checked first and short-circuits.

        A request carrying a valid JWT and an invalid API key is rejected, even though
        one valid credential was supplied.
        """
        headers = dict(auth)
        headers["X-Api-Key"] = "not-a-real-key"
        assert client.get("/auth/me", headers=headers).status_code == 401


class TestProfile:
    def test_updates_only_the_supplied_fields(self, client, auth):
        client.put("/auth/me", json={"full_name": "Alice A"}, headers=auth)
        client.put("/auth/me", json={"email": "alice@example.com"}, headers=auth)
        body = client.get("/auth/me", headers=auth).json()
        assert body["full_name"] == "Alice A"
        assert body["email"] == "alice@example.com"

    def test_an_empty_update_is_accepted_and_changes_nothing(self, client, auth):
        before = client.get("/auth/me", headers=auth).json()
        assert client.put("/auth/me", json={}, headers=auth).status_code == 200
        assert client.get("/auth/me", headers=auth).json() == before

    def test_new_users_are_not_admins(self, client, auth):
        assert client.get("/auth/me", headers=auth).json()["role"] == "user"


class TestPasswordChange:
    def test_requires_the_current_password(self, client, auth):
        r = client.put(
            "/auth/password",
            json={"current_password": "wrong", "new_password": "new"},
            headers=auth,
        )
        assert r.status_code == 400
        assert r.json()["detail"] == "Current password is incorrect"

    def test_changes_the_password_and_the_old_one_stops_working(self, client, auth, registered):
        r = client.put(
            "/auth/password",
            json={"current_password": registered["password"], "new_password": "brand new"},
            headers=auth,
        )
        assert r.status_code == 200
        old = client.post(
            "/auth/login",
            json={"username": registered["username"], "password": registered["password"]},
        )
        assert old.status_code == 401
        new = client.post(
            "/auth/login", json={"username": registered["username"], "password": "brand new"}
        )
        assert new.status_code == 200

    def test_existing_tokens_survive_a_password_change(self, client, auth, registered):
        """DEFECT, pinned as-is.

        JWTs are stateless and carry only `sub` and `exp`, so a token issued before the
        change keeps working until it expires — up to 24 hours. Changing a password does
        not end other sessions, which is what a user changing a password expects.
        """
        client.put(
            "/auth/password",
            json={"current_password": registered["password"], "new_password": "brand new"},
            headers=auth,
        )
        assert client.get("/auth/me", headers=auth).status_code == 200


class TestApiKey:
    def test_is_issued_at_registration(self, client, registered):
        assert registered["api_key"]

    def test_is_returned_in_cleartext(self, client, auth, registered):
        """CURRENT behaviour, and finding SEC-5: keys are stored and returned in the clear."""
        r = client.get("/auth/apikey", headers=auth)
        assert r.status_code == 200
        assert r.json()["api_key"] == registered["api_key"]

    def test_regeneration_invalidates_the_previous_key(self, client, auth, registered):
        new_key = client.post("/auth/apikey/regenerate", headers=auth).json()["api_key"]
        assert new_key != registered["api_key"]
        assert client.get("/auth/me", headers={"X-Api-Key": new_key}).status_code == 200
        assert (
            client.get("/auth/me", headers={"X-Api-Key": registered["api_key"]}).status_code == 401
        )


class TestRegistrationStatus:
    """The public endpoint the login page reads to decide whether to offer registration.

    Public on purpose: the page is shown to people who are not logged in, so the endpoint
    that tells it what to render cannot require an account. It discloses nothing that POSTing
    to /auth/register does not already reveal.
    """

    def test_it_needs_no_credentials(self, client):
        assert client.get("/auth/registration-status").status_code == 200

    def test_it_reports_open_when_registration_is_open(self, client):
        _set_registration(True)
        assert client.get("/auth/registration-status").json() == {"allow_registration": True}

    def test_it_reports_closed_when_registration_is_closed(self, client):
        _set_registration(False)
        assert client.get("/auth/registration-status").json() == {"allow_registration": False}

    def test_it_agrees_with_what_register_actually_does(self, client):
        """The whole point: a status the login page can trust to match the real refusal."""
        _set_registration(False)
        assert client.get("/auth/registration-status").json()["allow_registration"] is False
        assert (
            client.post("/auth/register", json={"username": "erin", "password": "pw"}).status_code
            == 403
        )

        _set_registration(True)
        assert client.get("/auth/registration-status").json()["allow_registration"] is True
        assert (
            client.post("/auth/register", json={"username": "erin", "password": "pw"}).status_code
            == 201
        )
