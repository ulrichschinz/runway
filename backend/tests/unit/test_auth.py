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
        r = client.post("/auth/register", json={"username": "bob", "password": "pw-long-enough"})
        assert r.status_code == 201
        body = r.json()
        # `account_id` since brief 0075: the stable id the SPA namespaces browser data by.
        assert body.pop("account_id").isdigit()
        # `created_at` only on GET /auth/me (the migration's proof); register leaves it null.
        assert body.pop("created_at") is None
        assert body == {"username": "bob", "role": "user", "full_name": "", "email": ""}

    def test_is_refused_when_the_site_setting_is_off(self, client):
        _set_registration(False)
        r = client.post("/auth/register", json={"username": "bob", "password": "pw-long-enough"})
        assert r.status_code == 403
        assert r.json()["detail"] == "Registration is disabled"

    def test_duplicate_username_is_rejected(self, client):
        _set_registration(True)
        client.post("/auth/register", json={"username": "bob", "password": "pw-long-enough"})
        r = client.post("/auth/register", json={"username": "bob", "password": "another-password"})
        assert r.status_code == 400

    def test_any_insert_failure_is_reported_as_username_taken(self, client):
        """DEFECT, pinned as-is.

        The handler wraps the INSERT in `except Exception` and always reports "Username
        already taken". A disk error, a locked database or a schema problem all surface
        as a 400 blaming the user. Not fixed here: no test yet covers the error paths
        this would need to distinguish.
        """
        _set_registration(True)
        client.post("/auth/register", json={"username": "bob", "password": "pw-long-enough"})
        r = client.post("/auth/register", json={"username": "bob", "password": "pw-long-enough"})
        assert r.status_code == 400
        assert r.json()["detail"] == "Username already taken"

    def test_creates_the_per_user_data_directory_and_taskrc(self, client):
        """Since brief 0065 (SEC-001) the directory is named by the account's storage id,
        never by its name, and nothing named after the account is created."""
        _set_registration(True)
        client.post("/auth/register", json={"username": "bob", "password": "pw-long-enough"})
        con = sqlite3.connect(settings.db_path)
        storage_id, layout = con.execute(
            "SELECT storage_id, storage_layout FROM users WHERE username='bob'"
        ).fetchone()
        con.close()
        assert layout == "storage_id"
        user_dir = settings.data_root / storage_id
        assert user_dir.is_dir()
        assert (user_dir / ".taskrc").is_file()
        assert not (settings.data_root / "bob").exists()


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


def _delete_account(username: str) -> None:
    """Remove a user's row behind the API's back, the way an operator on the host would."""
    con = sqlite3.connect(settings.db_path)
    con.execute("DELETE FROM users WHERE username=?", (username,))
    con.commit()
    con.close()


class TestVanishedAccount:
    """A JWT outlives the account it names: it is signed, not looked up. Until brief 0056
    GET /auth/me answered such a token with a 500 (WAIVER-TYPE-001), and every other route
    accepted it as if the account still existed. The decision is 401: the token's user is
    gone, so the caller is not authenticated, and the client logs in again."""

    def test_auth_me_is_401_for_a_valid_jwt_whose_account_is_gone(self, client, registered, auth):
        _delete_account(registered["username"])
        r = client.get("/auth/me", headers=auth)
        assert r.status_code == 401
        assert r.json()["detail"] == "Not authenticated"

    @pytest.mark.parametrize(
        ("method", "path"),
        [("GET", "/tasks"), ("GET", "/gtd/next"), ("GET", "/auth/apikey"), ("PUT", "/auth/me")],
    )
    def test_every_user_route_refuses_the_same_token(self, client, registered, auth, method, path):
        _delete_account(registered["username"])
        r = client.request(method, path, headers=auth, json={} if method == "PUT" else None)
        assert r.status_code == 401

    def test_admin_routes_say_401_not_403(self, client, registered, auth):
        """Not "you are not an admin" — there is no "you" any more."""
        _delete_account(registered["username"])
        assert client.get("/admin/users", headers=auth).status_code == 401


class TestAccountId:
    """The browser namespaces an account's local data by `account_id` (brief 0075, ADR 0050).

    A username is not a stable identity: an account deleted and registered again under the
    same name must not inherit the old account's unsent offline queue. `account_id` is
    `users.id`, which is AUTOINCREMENT and so never handed out twice.
    """

    def test_me_names_the_account_by_a_stable_id(self, client, auth):
        first = client.get("/auth/me", headers=auth).json()["account_id"]
        assert isinstance(first, str) and first
        assert client.get("/auth/me", headers=auth).json()["account_id"] == first

    def test_two_accounts_have_two_ids(self, client, registered, auth):
        from tests.conftest import register_user

        bob = register_user(client, "bob")
        mine = client.get("/auth/me", headers=auth).json()["account_id"]
        theirs = client.get("/auth/me", headers={"Authorization": f"Bearer {bob['token']}"}).json()[
            "account_id"
        ]
        assert mine != theirs

    def test_the_same_username_registered_again_is_another_account(self, client, registered, auth):
        """The REV-006 variant a username namespace would open: delete, re-register, inherit."""
        from tests.conftest import register_user

        before = client.get("/auth/me", headers=auth).json()["account_id"]
        _delete_account(registered["username"])
        again = register_user(client, registered["username"])
        after = client.get(
            "/auth/me", headers={"Authorization": f"Bearer {again['token']}"}
        ).json()["account_id"]
        assert after != before

    def test_login_names_the_account_too(self, client, registered, auth):
        """The SPA binds the namespace at login, so a failed /auth/me leaves no unbound window."""
        r = client.post(
            "/auth/login",
            json={"username": registered["username"], "password": registered["password"]},
        )
        assert r.status_code == 200
        assert r.json()["account_id"] == client.get("/auth/me", headers=auth).json()["account_id"]

    def test_me_names_when_the_account_was_created(self, client, registered, auth):
        """Ops older than the account cannot be its own: the legacy migration's proof (ADR 0050)."""
        from datetime import datetime

        created = client.get("/auth/me", headers=auth).json()["created_at"]
        assert created.endswith("Z")
        assert datetime.fromisoformat(created.replace("Z", "+00:00")).year >= 2026

    def test_api_key_callers_see_the_same_id(self, client, registered, auth):
        by_jwt = client.get("/auth/me", headers=auth).json()["account_id"]
        by_key = client.get("/auth/me", headers={"X-Api-Key": registered["api_key"]}).json()
        assert by_key["account_id"] == by_jwt


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
            json={"current_password": "wrong", "new_password": "new-long-enough"},
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

    def test_existing_tokens_end_with_a_password_change(self, client, auth, registered):
        """Was a DEFECT pinned as-is: a token issued before the change kept working until it
        expired, up to 24 hours (finding REV-001). Every token now carries the account's
        `auth_version`, which the change raises, so the old one is refused (ADR 0044). The
        exhaustive version of this test is test_session_revocation.py.
        """
        client.put(
            "/auth/password",
            json={"current_password": registered["password"], "new_password": "brand new"},
            headers=auth,
        )
        assert client.get("/auth/me", headers=auth).status_code == 401


class TestApiKey:
    def test_is_created_in_the_hashed_format(self, client, registered):
        """Since brief 0070 an account's key is created through `POST /auth/apikeys`."""
        assert registered["api_key"].startswith("rwk_")

    def test_is_no_longer_returned_in_cleartext(self, client, auth, registered):
        """Finding SEC-5, fixed by brief 0070: the pinned defect was `GET /auth/apikey` returning
        the stored key. A hashed key cannot be returned; the deprecated route answers `""`."""
        r = client.get("/auth/apikey", headers=auth)
        assert r.status_code == 200
        assert r.json()["api_key"] == ""
        assert registered["api_key"] not in r.text

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
            client.post(
                "/auth/register", json={"username": "erin", "password": "pw-long-enough"}
            ).status_code
            == 403
        )

        _set_registration(True)
        assert client.get("/auth/registration-status").json()["allow_registration"] is True
        assert (
            client.post(
                "/auth/register", json={"username": "erin", "password": "pw-long-enough"}
            ).status_code
            == 201
        )
