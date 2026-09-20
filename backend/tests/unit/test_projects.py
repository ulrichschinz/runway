"""Characterization tests for project plans (GTD Natural Planning)."""

import sqlite3

import pytest

from app.config import settings


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


class TestTheProjectToolsDocumentThemselves:
    """An agent sees a route's summary, its description and its field descriptions — nothing else.

    A model class docstring never reaches MCP, and `ops/surfaces/mcp-tools.json` records the
    name and the summary only, so what a schema says is asserted here against the served
    OpenAPI document. Before this, the three project routes carried FastAPI's summary derived
    from the handler name, no description at all, and unlabelled fields: an agent could read
    `POST /projects` and not learn that a project also exists as soon as a task names it.
    """

    # The phrase each description must carry is the fact an agent cannot infer from the
    # signature: implicit creation, what a plan is, and that an omitted field is kept.
    ROUTES = {
        ("/projects", "post"): "implicitly",
        ("/projects/plans/{name}", "get"): "Natural Planning Model",
        ("/projects/plans/{name}", "put"): "omitted fields are kept",
    }
    SCHEMAS = ("ProjectCreate", "ProjectPlanUpdate", "BrainstormItem")

    def test_every_project_route_carries_a_summary_and_a_description(self, client):
        from app.main import app

        paths = app.openapi()["paths"]
        for (path, method), phrase in self.ROUTES.items():
            operation = paths[path][method]
            assert operation["summary"].strip()
            assert phrase in operation["description"]

    def test_every_request_field_of_a_project_body_is_described(self, client):
        from app.main import app

        schemas = app.openapi()["components"]["schemas"]
        for name in self.SCHEMAS:
            for field, spec in schemas[name]["properties"].items():
                assert spec.get("description", "").strip(), f"{name}.{field} has no description"


class TestProjectNamesAreValidatedWhereTheyAreCreated:
    """Both creation paths, and only them (ADR 0039).

    `POST /projects` is the obvious one. `PUT /projects/plans/{name}` is the second, because
    it inserts a `projects` row for whatever name it is given, so "validate project names on
    creation" was only half done without it. Reading or filtering by a name is untouched: a
    legacy name stays listed and stays editable, which is the same rule kept tags and an
    unchanged project modifier already follow (D4).
    """

    # Each of these would be written into the database and then handed back as a filter
    # token and as an unencoded MCP path segment. `plans` and `overview` are refused for a
    # different reason: they address a sibling route rather than reaching `{name}`.
    REFUSED = ["a\nb", "(x", 'say "hi"', "Marketing/Sales", "plans", "overview"]

    @pytest.mark.parametrize("name", REFUSED)
    def test_creating_one_is_a_400_and_writes_nothing(self, client, auth, name):
        r = client.post("/projects", json={"name": name}, headers=auth)
        assert r.status_code == 400, r.text
        assert client.get("/gtd/projects", headers=auth).json() == []

    def test_surrounding_whitespace_is_still_stripped_rather_than_refused(self, client, auth):
        """`PROJECT_RE` refuses a leading space, and this route never sees one: it strips
        first, so ` lead` is created as `lead` exactly as it was before this rule."""
        r = client.post("/projects", json={"name": " lead "}, headers=auth)
        assert r.status_code == 201, r.text
        assert r.json()["project_name"] == "lead"

    @pytest.mark.parametrize("path", ["a%0Ab", "(x", "plans", "overview"])
    def test_upserting_a_plan_for_one_is_a_400_and_writes_nothing(self, client, auth, path):
        r = client.put(f"/projects/plans/{path}", json={"purpose": "x"}, headers=auth)
        assert r.status_code == 400, r.text
        assert client.get("/gtd/projects", headers=auth).json() == []

    def test_a_row_that_already_carries_a_refused_name_stays_editable(
        self, client, auth, registered
    ):
        """The live-user rule: a name the API wrote before these rules existed can still be
        updated, because the client is resending what the server itself gave it."""
        con = sqlite3.connect(settings.db_path)
        con.execute(
            "INSERT INTO projects (username, name) VALUES (?, ?)", (registered["username"], "(alt)")
        )
        con.commit()
        con.close()
        r = client.put("/projects/plans/(alt)", json={"purpose": "kept"}, headers=auth)
        assert r.status_code == 200, r.text
        assert r.json()["purpose"] == "kept"

    def test_an_ordinary_name_with_a_space_and_an_umlaut_still_works(self, client, auth):
        r = client.post("/projects", json={"name": "Haus Umbau Büro"}, headers=auth)
        assert r.status_code == 201, r.text


class TestProjectStatus:
    """`PUT /projects/{name}/status`: the one project fact the task store cannot hold."""

    def test_a_status_round_trips(self, client, auth):
        r = client.put("/projects/website/status", json={"status": "on_hold"}, headers=auth)
        assert r.status_code == 200, r.text
        assert r.json() == {"name": "website", "status": "on_hold"}

    def test_it_creates_no_project(self, client, auth):
        """Status is a decision about a project, not a way of making one: a project exists
        because a task names it or because somebody created it, and neither happened here."""
        client.put("/projects/inferred/status", json={"status": "done"}, headers=auth)
        assert client.get("/gtd/projects", headers=auth).json() == []

    def test_setting_it_again_moves_the_one_row(self, client, auth, registered):
        client.put("/projects/website/status", json={"status": "on_hold"}, headers=auth)
        r = client.put("/projects/website/status", json={"status": "active"}, headers=auth)
        assert r.json()["status"] == "active"
        con = sqlite3.connect(settings.db_path)
        try:
            rows = list(
                con.execute(
                    "SELECT status FROM project_status WHERE username=?",
                    (registered["username"],),
                )
            )
        finally:
            con.close()
        assert rows == [("active",)]

    @pytest.mark.parametrize("status", ["paused", "", "ACTIVE"])
    def test_a_status_the_server_does_not_know_is_a_422(self, client, auth, status):
        r = client.put("/projects/website/status", json={"status": status}, headers=auth)
        assert r.status_code == 422, r.text

    @pytest.mark.parametrize("name", ["(x", "a%0Ab", "overview"])
    def test_a_name_it_would_have_to_write_is_a_400(self, client, auth, name):
        r = client.put(f"/projects/{name}/status", json={"status": "done"}, headers=auth)
        assert r.status_code == 400, r.text

    def test_a_project_whose_name_predates_the_rules_cannot_be_given_a_status(
        self, client, auth, registered
    ):
        """The accepted gap, pinned rather than papered over (ADR 0039).

        The status route writes the name as the key of a new row, so it validates it like
        every other place a name is written — and like `GET /gtd/projects/{name}`, which
        writes it into a filter. A plan row that already exists is an update and stays
        editable. A project carrying a name from before these rules is therefore listed and
        reported as stalled, and cannot be put on hold; moving its tasks to a valid name is
        the way out.
        """
        con = sqlite3.connect(settings.db_path)
        con.execute(
            "INSERT INTO projects (username, name) VALUES (?, ?)", (registered["username"], "(alt)")
        )
        con.commit()
        con.close()
        plan = client.put("/projects/plans/(alt)", json={"purpose": "x"}, headers=auth)
        assert plan.status_code == 200, plan.text
        r = client.put("/projects/(alt)/status", json={"status": "on_hold"}, headers=auth)
        assert r.status_code == 400, r.text

    def test_a_status_is_per_user(self, client, auth, registered):
        client.put("/projects/website/status", json={"status": "done"}, headers=auth)
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
        headers = {"Authorization": f"Bearer {other}"}
        client.post("/tasks", json={"description": "t", "project": "website"}, headers=headers)
        rows = client.get("/gtd/projects/overview", headers=headers).json()
        assert [(r["name"], r["status"]) for r in rows] == [("website", "active")]

    def test_it_requires_authentication(self, client, registered):
        assert client.put("/projects/website/status", json={"status": "done"}).status_code == 401

    def test_plans_status_reaches_the_plan_route_not_the_status_route(self, client, auth):
        """Pinned as current routing, and the reason `plans` is reserved (ADR 0039).

        `PUT /projects/plans/status` matches `PUT /projects/plans/{name}`, which is declared
        first, so it upserts the plan of a project called `status`. A project literally named
        `plans` therefore cannot have a status set — which is why the name cannot be created.
        """
        r = client.put("/projects/plans/status", json={"purpose": "x"}, headers=auth)
        assert r.status_code == 200, r.text
        assert r.json()["project_name"] == "status"
