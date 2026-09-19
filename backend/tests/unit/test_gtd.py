"""Characterization tests for the GTD views."""


def _create(client, auth, **body):
    body.setdefault("description", "a task")
    return client.post("/tasks", json=body, headers=auth).json()


class TestViews:
    def test_inbox_holds_only_tasks_with_no_project_and_no_tags(self, client, auth):
        _create(client, auth, description="unprocessed")
        _create(client, auth, description="has project", project="p")
        _create(client, auth, description="has tag", tags=["next"])
        r = client.get("/gtd/inbox", headers=auth)
        assert [t["description"] for t in r.json()] == ["unprocessed"]

    def test_next_holds_tasks_tagged_next(self, client, auth):
        _create(client, auth, description="do it", tags=["next"])
        _create(client, auth, description="not it", tags=["someday"])
        assert [t["description"] for t in client.get("/gtd/next", headers=auth).json()] == ["do it"]

    def test_waiting_holds_tasks_tagged_waiting(self, client, auth):
        _create(client, auth, description="blocked", tags=["waiting"])
        _create(client, auth, description="not blocked", tags=["next"])
        r = client.get("/gtd/waiting", headers=auth)
        assert [t["description"] for t in r.json()] == ["blocked"]

    def test_someday_holds_tasks_tagged_someday(self, client, auth):
        _create(client, auth, description="maybe", tags=["someday"])
        _create(client, auth, description="now", tags=["next"])
        r = client.get("/gtd/someday", headers=auth)
        assert [t["description"] for t in r.json()] == ["maybe"]

    def test_completed_tasks_are_excluded_from_every_view(self, client, auth):
        task = _create(client, auth, description="done soon", tags=["next"])
        client.post(f"/tasks/{task['uuid']}/done", headers=auth)
        assert client.get("/gtd/next", headers=auth).json() == []

    def test_every_view_requires_authentication(self, client, registered):
        for view in ("inbox", "next", "waiting", "someday", "projects"):
            assert client.get(f"/gtd/{view}").status_code == 401, view


class TestProjectListing:
    def test_lists_projects_inferred_from_tasks(self, client, auth):
        _create(client, auth, description="a", project="alpha")
        _create(client, auth, description="b", project="beta")
        assert set(client.get("/gtd/projects", headers=auth).json()) == {"alpha", "beta"}

    def test_lists_explicitly_created_projects_with_no_tasks(self, client, auth):
        client.post("/projects", json={"name": "empty"}, headers=auth)
        assert "empty" in client.get("/gtd/projects", headers=auth).json()

    def test_merges_both_sources_without_duplicating(self, client, auth):
        _create(client, auth, description="a", project="shared")
        client.post("/projects", json={"name": "shared"}, headers=auth)
        names = client.get("/gtd/projects", headers=auth).json()
        assert names.count("shared") == 1

    def test_a_project_from_a_completed_task_disappears_from_the_list(self, client, auth):
        """CURRENT behaviour, worth knowing.

        The project list is derived from *pending* tasks only. Completing the last task
        of a project silently removes the project from the sidebar unless it was also
        created explicitly.
        """
        task = _create(client, auth, description="only task", project="vanishing")
        client.post(f"/tasks/{task['uuid']}/done", headers=auth)
        assert "vanishing" not in client.get("/gtd/projects", headers=auth).json()

    def test_project_tasks_returns_only_that_project(self, client, auth):
        _create(client, auth, description="mine", project="alpha")
        _create(client, auth, description="theirs", project="beta")
        r = client.get("/gtd/projects/alpha", headers=auth)
        assert [t["description"] for t in r.json()] == ["mine"]


class TestErrorMapping:
    """A refused filter is the caller's error (400); a failing binary is ours (500). Both
    used to be 500 here (D6)."""

    @staticmethod
    def _raising(monkeypatch, exc):
        from app.services import task_runner

        def run(username, args, text=None):
            raise exc

        monkeypatch.setattr(task_runner, "_run", run)

    def test_a_rejection_by_taskwarrior_is_a_400(self, client, auth, monkeypatch):
        from app.services import task_runner

        self._raising(monkeypatch, task_runner.TaskwarriorRejected("Mismatched parentheses"))
        for path in ("/gtd/next", "/gtd/projects", "/gtd/projects/p"):
            r = client.get(path, headers=auth)
            assert r.status_code == 400, path
            assert r.json()["detail"] == "Mismatched parentheses"

    def test_a_failure_of_the_binary_is_a_500(self, client, auth, monkeypatch):
        self._raising(monkeypatch, RuntimeError("database is locked"))
        for path in ("/gtd/next", "/gtd/projects"):
            assert client.get(path, headers=auth).status_code == 500, path
