"""Characterization tests for the admin surface and the role boundary."""

import sqlite3

import pytest

from app.config import settings


@pytest.fixture
def admin(client, registered):
    """Promote the registered user to admin directly in the database.

    There is no API path to the first admin: the only promotion mechanism in the running
    application is the hard-coded `username='uli'` rule in init_db (finding SEC-2), which
    Step 11 deletes and replaces with an explicit bootstrap.
    """
    con = sqlite3.connect(settings.db_path)
    con.execute("UPDATE users SET role='admin' WHERE username=?", (registered["username"],))
    con.commit()
    con.close()
    return {"Authorization": f"Bearer {registered['token']}"}


class TestRoleBoundary:
    @pytest.mark.parametrize(
        "verb,path,body",
        [
            ("get", "/admin/settings", None),
            ("put", "/admin/settings", {"allow_registration": True}),
            ("get", "/admin/users", None),
            ("put", "/admin/users/alice/role", {"role": "admin"}),
        ],
    )
    def test_a_plain_user_is_refused_everywhere(self, client, auth, verb, path, body):
        kwargs = {"headers": auth}
        if body is not None:
            kwargs["json"] = body
        r = getattr(client, verb)(path, **kwargs)
        assert r.status_code == 403
        assert r.json()["detail"] == "Admin access required"

    def test_an_unauthenticated_caller_is_refused(self, client, registered):
        assert client.get("/admin/users").status_code == 401


class TestSettings:
    def test_reads_and_writes_the_registration_flag(self, client, admin):
        client.put("/admin/settings", json={"allow_registration": False}, headers=admin)
        assert client.get("/admin/settings", headers=admin).json() == {"allow_registration": False}
        client.put("/admin/settings", json={"allow_registration": True}, headers=admin)
        assert client.get("/admin/settings", headers=admin).json() == {"allow_registration": True}

    def test_the_flag_actually_gates_registration(self, client, admin):
        client.put("/admin/settings", json={"allow_registration": False}, headers=admin)
        r = client.post("/auth/register", json={"username": "late", "password": "pw"})
        assert r.status_code == 403


class TestUserManagement:
    def test_lists_users(self, client, admin, registered):
        names = [u["username"] for u in client.get("/admin/users", headers=admin).json()]
        assert registered["username"] in names

    def test_promotes_and_demotes(self, client, admin, registered):
        client.put("/admin/settings", json={"allow_registration": True}, headers=admin)
        client.post("/auth/register", json={"username": "carol", "password": "pw"})

        r = client.put("/admin/users/carol/role", json={"role": "admin"}, headers=admin)
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

        r = client.put("/admin/users/carol/role", json={"role": "user"}, headers=admin)
        assert r.json()["role"] == "user"

    def test_rejects_an_unknown_role(self, client, admin):
        r = client.put("/admin/users/alice/role", json={"role": "superuser"}, headers=admin)
        assert r.status_code == 400
        assert r.json()["detail"] == "Role must be 'admin' or 'user'"

    def test_reports_an_unknown_user(self, client, admin):
        r = client.put("/admin/users/ghost/role", json={"role": "admin"}, headers=admin)
        assert r.status_code == 404

    def test_an_admin_can_demote_themselves(self, client, admin, registered):
        """DEFECT, pinned as-is.

        Nothing stops the last administrator demoting themselves, after which no account
        can reach /admin at all and the only recovery is editing users.db by hand. Not
        fixed here: the repair belongs with the admin-bootstrap work in Step 11.
        """
        r = client.put(
            f"/admin/users/{registered['username']}/role", json={"role": "user"}, headers=admin
        )
        assert r.status_code == 200
        assert client.get("/admin/users", headers=admin).status_code == 403
