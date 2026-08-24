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
        assert r.json()["detail"] == "Registration is disabled"

    def test_re_enabling_the_flag_actually_reopens_registration(self, client, admin):
        """The half that matters when an instance has registration closed.

        Production runs with allow_registration = false, so the question "can we let someone
        in again" has to be answerable without a deployment. It is: the flag is read from
        site_settings on every request, so flipping it back takes effect immediately, and the
        account that results is a working one — registered, able to log in, and a plain user.
        """
        client.put("/admin/settings", json={"allow_registration": False}, headers=admin)
        assert (
            client.post("/auth/register", json={"username": "dana", "password": "pw"}).status_code
            == 403
        )

        client.put("/admin/settings", json={"allow_registration": True}, headers=admin)
        created = client.post("/auth/register", json={"username": "dana", "password": "pw"})
        assert created.status_code == 201
        assert created.json()["role"] == "user"

        token = client.post("/auth/login", json={"username": "dana", "password": "pw"})
        assert token.status_code == 200
        me = client.get(
            "/auth/me", headers={"Authorization": f"Bearer {token.json()['access_token']}"}
        )
        assert me.status_code == 200
        assert me.json()["username"] == "dana"


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

    # The defect this class used to pin — "an admin can demote themselves, after which no
    # account can reach /admin at all" — is fixed in this change. Its characterization test
    # expired with it; TestLastAdminGuard below asserts the repaired behaviour.


class TestLastAdminGuard:
    """An instance must never be left with nobody who can administer it.

    /admin/users and /admin/settings both require an admin, so an instance with zero
    admins has no route back through the API — recovery means editing the database on the
    deploy host. The guard is on the admin *count*, not on self-demotion: demoting someone
    else is just as final when they are the only one left.
    """

    def test_the_only_admin_cannot_demote_themselves(self, client, admin, registered):
        r = client.put(
            f"/admin/users/{registered['username']}/role", json={"role": "user"}, headers=admin
        )
        assert r.status_code == 409
        assert "last admin" in r.json()["detail"]

    def test_the_role_survives_the_refusal(self, client, admin, registered):
        client.put(
            f"/admin/users/{registered['username']}/role", json={"role": "user"}, headers=admin
        )
        r = client.get("/admin/users", headers=admin)
        roles = {u["username"]: u["role"] for u in r.json()}
        assert roles[registered["username"]] == "admin"

    def test_demotion_is_allowed_once_a_second_admin_exists(self, client, admin, registered):
        client.post("/auth/register", json={"username": "second", "password": "pw-for-second"})
        assert (
            client.put(
                "/admin/users/second/role", json={"role": "admin"}, headers=admin
            ).status_code
            == 200
        )
        r = client.put(
            f"/admin/users/{registered['username']}/role", json={"role": "user"}, headers=admin
        )
        assert r.status_code == 200
        assert r.json()["role"] == "user"

    def test_an_unknown_role_is_refused_without_changing_the_surface(
        self, client, admin, registered
    ):
        """The 400 and its exact detail string are a public surface (decision F2)."""
        r = client.put(
            f"/admin/users/{registered['username']}/role", json={"role": "superuser"}, headers=admin
        )
        assert r.status_code == 400
        assert r.json()["detail"] == "Role must be 'admin' or 'user'"


class TestAdminBootstrap:
    """SEC-2: the hard-coded `uli` promotion is gone, and what replaced it is inert
    whenever an admin already exists."""

    @pytest.mark.anyio
    async def test_no_promotion_happens_when_an_admin_exists(self, monkeypatch):
        from app import database

        monkeypatch.setattr(settings, "bootstrap_admin", "somebody")
        db = _FakeDb(admin_count=1)
        assert "noop" in await database.bootstrap_admin(db)
        assert db.updates == []

    @pytest.mark.anyio
    async def test_nothing_happens_without_configuration(self, monkeypatch):
        from app import database

        monkeypatch.setattr(settings, "bootstrap_admin", "")
        db = _FakeDb(admin_count=0)
        assert "BOOTSTRAP_ADMIN is unset" in await database.bootstrap_admin(db)
        assert db.updates == []

    @pytest.mark.anyio
    async def test_an_unregistered_name_is_not_created(self, monkeypatch):
        from app import database

        monkeypatch.setattr(settings, "bootstrap_admin", "ghost")
        db = _FakeDb(admin_count=0, existing_user=None)
        assert "not a registered user" in await database.bootstrap_admin(db)
        assert db.updates == []

    @pytest.mark.anyio
    async def test_a_registered_name_is_promoted_when_there_is_no_admin(self, monkeypatch):
        from app import database

        monkeypatch.setattr(settings, "bootstrap_admin", "uli")
        db = _FakeDb(admin_count=0, existing_user="uli")
        assert "promoted 'uli'" in await database.bootstrap_admin(db)
        assert db.updates == [("UPDATE users SET role='admin' WHERE username=?", ("uli",))]

    @pytest.mark.anyio
    async def test_the_hard_coded_uli_rule_is_gone(self, monkeypatch):
        """The exact defect: an unconfigured instance must never promote anyone."""
        from app import database

        monkeypatch.setattr(settings, "bootstrap_admin", "")
        db = _FakeDb(admin_count=0, existing_user="uli")
        await database.bootstrap_admin(db)
        assert db.updates == []


class _FakeDb:
    """Minimal aiosqlite stand-in: enough to observe which branch bootstrap_admin takes."""

    def __init__(self, admin_count: int, existing_user: str | None = None):
        self.admin_count = admin_count
        self.existing_user = existing_user
        self.updates: list[tuple] = []

    def execute(self, sql, params=()):
        if sql.strip().upper().startswith("UPDATE"):
            self.updates.append((sql, params))
            return _NullCursor()
        if "COUNT(*)" in sql:
            return _RowCursor({"n": self.admin_count})
        if "SELECT username FROM users WHERE username=?" in sql:
            found = self.existing_user is not None and params[0] == self.existing_user
            return _RowCursor({"username": params[0]} if found else None)
        return _RowCursor(None)

    async def commit(self):
        return None


class _RowCursor:
    def __init__(self, row):
        self._row = row

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def fetchone(self):
        return self._row

    def __await__(self):
        async def _self():
            return self

        return _self().__await__()


class _NullCursor(_RowCursor):
    def __init__(self):
        super().__init__(None)
