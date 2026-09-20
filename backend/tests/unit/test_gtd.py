"""Characterization tests for the GTD views."""

import pytest


def _create(client, auth, **body):
    body.setdefault("description", "a task")
    return client.post("/tasks", json=body, headers=auth).json()


class TestViews:
    def test_inbox_holds_only_tasks_with_no_project_and_no_tags(self, client, auth):
        """ "has project" is untagged: the old `-project` filter (the tag `project`, D1) let it
        in on the real binary, and the fake now reads `-project` the same way."""
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
        for view in ("inbox", "next", "waiting", "someday", "tickler", "projects", "projects/p"):
            assert client.get(f"/gtd/{view}").status_code == 401, view


class TestWaitHidesATask:
    """A future `wait` hides a task until the date passes (ADR 0036). The fake's clock stands
    at 2026-09-19T10:00:00Z."""

    FUTURE = "2026-10-01"
    PAST = "2026-09-01"

    @staticmethod
    def _names(client, auth, view):
        r = client.get(f"/gtd/{view}", headers=auth)
        assert r.status_code == 200, r.text
        return [t["description"] for t in r.json()]

    def test_a_hidden_task_is_in_no_visible_list(self, client, auth):
        _create(client, auth, description="inbox later", wait=self.FUTURE)
        _create(client, auth, description="next later", tags=["next"], wait=self.FUTURE)
        _create(client, auth, description="someday later", tags=["someday"], wait=self.FUTURE)
        _create(client, auth, description="alpha later", project="alpha", wait=self.FUTURE)
        for view in ("inbox", "next", "someday", "projects/alpha"):
            assert self._names(client, auth, view) == [], view

    def test_a_past_wait_is_shown_normally(self, client, auth):
        _create(client, auth, description="back", wait=self.PAST)
        assert self._names(client, auth, "inbox") == ["back"]
        assert self._names(client, auth, "tickler") == []

    def test_waiting_includes_a_hidden_waiting_task(self, client, auth):
        _create(client, auth, description="reply due", tags=["waiting"])
        _create(client, auth, description="reply later", tags=["waiting"], wait=self.FUTURE)
        _create(client, auth, description="parked", wait=self.FUTURE)
        assert sorted(self._names(client, auth, "waiting")) == ["reply due", "reply later"]

    def test_the_tickler_lists_hidden_tasks_by_wait_not_by_urgency(self, client, auth):
        _create(client, auth, description="jan 2027", wait="2027-01-05")
        _create(client, auth, description="dec 2026", tags=["next"], wait="2026-12-31")
        _create(client, auth, description="oct 2026", priority="L", wait="2026-10-01T08:00")
        _create(client, auth, description="visible", tags=["next"])
        tickler = client.get("/gtd/tickler", headers=auth).json()
        assert [t["description"] for t in tickler] == ["oct 2026", "dec 2026", "jan 2027"]
        assert {t["status"] for t in tickler} == {"pending"}, "status stays Taskwarrior's"

    def test_a_task_returns_when_its_wait_passes_between_two_calls(self, client, auth, fake_task):
        import datetime

        _create(client, auth, description="later", wait=self.FUTURE)
        assert self._names(client, auth, "tickler") == ["later"]
        fake_task.now = datetime.datetime(2026, 10, 2, tzinfo=datetime.UTC)
        assert self._names(client, auth, "tickler") == []
        assert self._names(client, auth, "inbox") == ["later"]

    def test_a_project_whose_only_task_is_hidden_is_listed(self, client, auth):
        _create(client, auth, description="parked", project="dormant", wait=self.FUTURE)
        assert "dormant" in client.get("/gtd/projects", headers=auth).json()

    def test_a_future_scheduled_date_does_not_hide_a_task(self, client, auth):
        _create(client, auth, description="start later", scheduled=self.FUTURE)
        assert self._names(client, auth, "inbox") == ["start later"]


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
        for path in ("/gtd/next", "/gtd/tickler", "/gtd/projects", "/gtd/projects/p"):
            r = client.get(path, headers=auth)
            assert r.status_code == 400, path
            assert r.json()["detail"] == "Mismatched parentheses"

    def test_a_failure_of_the_binary_is_a_500(self, client, auth, monkeypatch):
        self._raising(monkeypatch, RuntimeError("database is locked"))
        for path in ("/gtd/next", "/gtd/tickler", "/gtd/projects"):
            assert client.get(path, headers=auth).status_code == 500, path


class TestProjectTasksMatchExactly:
    """`project:alpha` is Taskwarrior's hierarchical prefix match, so the project view
    used to mix in `alpha.sub` and `alphabet` (D2, ADR 0038)."""

    def test_a_sibling_and_a_subproject_stay_out(self, client, auth):
        _create(client, auth, description="mine", project="alpha")
        _create(client, auth, description="sub", project="alpha.sub")
        _create(client, auth, description="other", project="alphabet")
        r = client.get("/gtd/projects/alpha", headers=auth)
        assert [t["description"] for t in r.json()] == ["mine"]

    def test_a_subproject_is_reachable_by_its_own_name(self, client, auth):
        _create(client, auth, description="sub", project="alpha.sub")
        r = client.get("/gtd/projects/alpha.sub", headers=auth)
        assert [t["description"] for t in r.json()] == ["sub"]

    def test_a_name_with_a_space_and_an_umlaut_survives_the_path(self, client, auth):
        _create(client, auth, description="renovieren", project="Haus Umbau Büro")
        r = client.get("/gtd/projects/Haus Umbau Büro", headers=auth)
        assert [t["description"] for t in r.json()] == ["renovieren"]

    def test_a_refused_name_is_a_400(self, client, auth):
        """A parenthesis is Taskwarrior filter grammar, so it never becomes a name."""
        r = client.get("/gtd/projects/a(b)", headers=auth)
        assert r.status_code == 400
        assert "Invalid project name" in r.json()["detail"]


class TestTagScoping:
    """Every GTD list takes `tag`, repeatable and AND-ed (D13).

    A repository that declares a scope passes its tags on every list call, so the titles of
    everything else never reach the transcript. The filter is Taskwarrior's `+tag`, built
    from validated values only.
    """

    @staticmethod
    def _names(client, auth, view, params=None):
        r = client.get(f"/gtd/{view}", params=params or [], headers=auth)
        assert r.status_code == 200, r.text
        return [t["description"] for t in r.json()]

    def test_each_status_list_narrows_to_the_tagged_tasks(self, client, auth):
        for view in ("next", "waiting", "someday"):
            _create(client, auth, description=f"{view} mine", tags=[view, "ar"])
            _create(client, auth, description=f"{view} theirs", tags=[view, "privat"])
            assert self._names(client, auth, view, [("tag", "ar")]) == [f"{view} mine"]

    def test_the_tickler_and_a_project_narrow_too(self, client, auth):
        _create(client, auth, description="parked mine", wait="2026-10-01", tags=["ar"])
        _create(client, auth, description="parked theirs", wait="2026-10-02", tags=["privat"])
        _create(client, auth, description="alpha mine", project="alpha", tags=["ar"])
        _create(client, auth, description="alpha theirs", project="alpha", tags=["privat"])
        assert self._names(client, auth, "tickler", [("tag", "ar")]) == ["parked mine"]
        assert self._names(client, auth, "projects/alpha", [("tag", "ar")]) == ["alpha mine"]

    def test_two_tags_are_and_ed(self, client, auth):
        _create(client, auth, description="both", tags=["next", "ar", "@home"])
        _create(client, auth, description="one", tags=["next", "ar"])
        params = [("tag", "ar"), ("tag", "@home")]
        assert self._names(client, auth, "next", params) == ["both"]

    def test_any_tag_empties_the_inbox_because_the_inbox_is_untagged(self, client, auth):
        _create(client, auth, description="unprocessed")
        assert self._names(client, auth, "inbox") == ["unprocessed"]
        assert self._names(client, auth, "inbox", [("tag", "ar")]) == []

    @pytest.mark.parametrize("tag", ["-next", "", "a,b", "1abc"])
    def test_a_refused_tag_is_a_400_on_every_list(self, client, auth, tag):
        for view in ("inbox", "next", "waiting", "someday", "tickler", "projects/alpha"):
            r = client.get(f"/gtd/{view}", params={"tag": tag}, headers=auth)
            assert r.status_code == 400, (view, tag)
            assert "Invalid tag" in r.json()["detail"]

    def test_more_than_ten_tags_is_a_422(self, client, auth):
        params = [("tag", f"t{i}") for i in range(11)]
        assert client.get("/gtd/next", params=params, headers=auth).status_code == 422

    def test_no_refused_tag_ever_reaches_the_binary(self, fake_task, client, auth):
        poison = ["(", ")", " or ", "\n", "rc.data.location=/tmp/x", "-x", "+x", "z" * 200]
        fake_task.calls.clear()
        for value in poison:
            for view in ("next", "waiting", "someday", "tickler", "projects/alpha"):
                r = client.get(f"/gtd/{view}", params={"tag": value}, headers=auth)
                assert r.status_code in (400, 422), (view, value, r.status_code)
        for _user, args, _text in fake_task.calls:
            for token in args:
                assert not any(value in token for value in poison), args
