"""Characterization tests for project plans (GTD Natural Planning)."""


class TestProjectCreation:
    def test_creates_a_project_with_empty_plan_fields(self, client, auth):
        r = client.post("/projects", json={"name": "runway"}, headers=auth)
        assert r.status_code == 201
        assert r.json()["project_name"] == "runway"
        assert r.json()["purpose"] == ""
        assert r.json()["brainstorm"] == []

    def test_rejects_a_blank_name(self, client, auth):
        for name in ("", "   "):
            r = client.post("/projects", json={"name": name}, headers=auth)
            assert r.status_code == 422

    def test_strips_surrounding_whitespace_from_the_name(self, client, auth):
        r = client.post("/projects", json={"name": "  spaced  "}, headers=auth)
        assert r.json()["project_name"] == "spaced"

    def test_creating_the_same_project_twice_is_idempotent(self, client, auth):
        client.post("/projects", json={"name": "dup"}, headers=auth)
        r = client.post("/projects", json={"name": "dup"}, headers=auth)
        assert r.status_code == 201
        assert client.get("/gtd/projects", headers=auth).json().count("dup") == 1


class TestPlans:
    def test_an_unknown_project_returns_an_empty_plan_rather_than_404(self, client, auth):
        """CURRENT behaviour: reading a plan never fails, it invents an empty one."""
        r = client.get("/projects/plans/never-created", headers=auth)
        assert r.status_code == 200
        assert r.json() == {
            "project_name": "never-created",
            "purpose": "",
            "principles": "",
            "vision": "",
            "brainstorm": [],
            "organized": [],
            "updated_at": None,
        }

    def test_upsert_creates_then_updates(self, client, auth):
        r = client.put("/projects/plans/np", json={"purpose": "ship it"}, headers=auth)
        assert r.status_code == 200
        assert r.json()["purpose"] == "ship it"
        r = client.put("/projects/plans/np", json={"vision": "shipped"}, headers=auth)
        assert r.json()["purpose"] == "ship it"
        assert r.json()["vision"] == "shipped"

    def test_brainstorm_items_round_trip(self, client, auth):
        items = [{"id": "1", "text": "an idea"}, {"id": "2", "text": "another"}]
        r = client.put("/projects/plans/np", json={"brainstorm": items}, headers=auth)
        assert r.json()["brainstorm"] == items

    def test_an_upsert_creates_a_project_visible_in_the_project_list(self, client, auth):
        client.put("/projects/plans/implicit", json={"purpose": "x"}, headers=auth)
        assert "implicit" in client.get("/gtd/projects", headers=auth).json()

    def test_plans_are_per_user(self, client, auth, registered):
        client.put("/projects/plans/mine", json={"purpose": "secret"}, headers=auth)
        import sqlite3

        from app.config import settings

        con = sqlite3.connect(settings.db_path)
        con.execute(
            "INSERT OR REPLACE INTO site_settings (key, value) VALUES ('allow_registration','true')"
        )
        con.commit()
        con.close()
        client.post("/auth/register", json={"username": "mallory", "password": "pw"})
        other = client.post("/auth/login", json={"username": "mallory", "password": "pw"}).json()[
            "access_token"
        ]
        r = client.get("/projects/plans/mine", headers={"Authorization": f"Bearer {other}"})
        assert r.json()["purpose"] == ""

    def test_requires_authentication(self, client, registered):
        assert client.get("/projects/plans/x").status_code == 401
        assert client.post("/projects", json={"name": "x"}).status_code == 401
