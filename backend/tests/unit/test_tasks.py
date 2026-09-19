"""Characterization tests for /tasks."""

import pytest


def _create(client, auth, **body):
    body.setdefault("description", "a task")
    r = client.post("/tasks", json=body, headers=auth)
    assert r.status_code == 201, r.text
    return r.json()


class TestListing:
    def test_returns_only_pending_tasks_by_default(self, client, auth):
        done = _create(client, auth, description="finished")
        _create(client, auth, description="open")
        client.post(f"/tasks/{done['uuid']}/done", headers=auth)
        descriptions = [t["description"] for t in client.get("/tasks", headers=auth).json()]
        assert descriptions == ["open"]

    def test_include_done_returns_completed_tasks_too(self, client, auth):
        done = _create(client, auth, description="finished")
        client.post(f"/tasks/{done['uuid']}/done", headers=auth)
        r = client.get("/tasks", params={"include_done": True}, headers=auth)
        assert [t["description"] for t in r.json()] == ["finished"]

    def test_is_sorted_by_urgency_descending(self, client, auth):
        _create(client, auth, description="low", tags=["someday"])
        _create(client, auth, description="high", tags=["next"])
        _create(client, auth, description="middle")
        urgencies = [t["urgency"] for t in client.get("/tasks", headers=auth).json()]
        assert urgencies == sorted(urgencies, reverse=True)

    def test_requires_authentication(self, client, registered):
        assert client.get("/tasks").status_code == 401


class TestCreate:
    def test_round_trips_every_supported_attribute(self, client, auth):
        task = _create(
            client,
            auth,
            description="write the brief",
            project="runway",
            tags=["next", "work"],
            priority="H",
            due="2026-09-01",
        )
        assert task["description"] == "write the brief"
        assert task["project"] == "runway"
        assert set(task["tags"]) == {"next", "work"}
        assert task["priority"] == "H"
        assert task["due"] == "2026-09-01"
        assert task["status"] == "pending"

    @pytest.mark.parametrize("priority", ["X", "high", "h", ""])
    def test_rejects_an_unknown_priority(self, client, auth, priority):
        r = client.post("/tasks", json={"description": "x", "priority": priority}, headers=auth)
        assert r.status_code == 400
        assert "Invalid priority" in r.json()["detail"]

    @pytest.mark.parametrize("tag", ["has space", "semi;colon", "pipe|char", "$(whoami)"])
    def test_rejects_a_tag_outside_the_allowed_character_set(self, client, auth, tag):
        r = client.post("/tasks", json={"description": "x", "tags": [tag]}, headers=auth)
        assert r.status_code == 400
        assert "Invalid tag" in r.json()["detail"]

    @pytest.mark.parametrize("recur", ["daily", "weekly", "2d", "3 weeks"])
    def test_accepts_recognised_recurrence_values(self, client, auth, recur):
        assert _create(client, auth, description=f"r {recur}", recur=recur)["uuid"]

    @pytest.mark.parametrize("recur", ["whenever", "1 fortnight", "; rm -rf /"])
    def test_rejects_an_unrecognised_recurrence_value(self, client, auth, recur):
        r = client.post("/tasks", json={"description": "x", "recur": recur}, headers=auth)
        assert r.status_code == 400
        assert "Invalid recur" in r.json()["detail"]

    def test_rejects_a_dependency_that_is_not_a_uuid(self, client, auth):
        r = client.post(
            "/tasks", json={"description": "x", "depends": ["not-a-uuid"]}, headers=auth
        )
        assert r.status_code == 400
        assert "Invalid UUID" in r.json()["detail"]


class TestSingleTaskOperations:
    def test_get_returns_the_task(self, client, auth):
        created = _create(client, auth, description="findable")
        r = client.get(f"/tasks/{created['uuid']}", headers=auth)
        assert r.status_code == 200
        assert r.json()["description"] == "findable"

    @pytest.mark.parametrize(
        "verb,path,body",
        [
            ("get", "/tasks/{}", None),
            ("put", "/tasks/{}", {"description": "x"}),
            ("delete", "/tasks/{}", None),
            ("post", "/tasks/{}/done", None),
            ("post", "/tasks/{}/start", None),
            ("post", "/tasks/{}/stop", None),
            ("post", "/tasks/{}/annotate", {"text": "n"}),
        ],
    )
    def test_every_uuid_bearing_route_validates_the_uuid(self, client, auth, verb, path, body):
        url = path.format("not-a-uuid")
        kwargs = {"headers": auth}
        if body is not None:
            kwargs["json"] = body
        r = getattr(client, verb)(url, **kwargs)
        assert r.status_code == 400, f"{verb.upper()} {url} returned {r.status_code}"
        assert "Invalid UUID" in r.json()["detail"]

    def test_modify_changes_only_the_supplied_fields(self, client, auth):
        created = _create(client, auth, description="before", project="p", priority="L")
        r = client.put(f"/tasks/{created['uuid']}", json={"description": "after"}, headers=auth)
        assert r.status_code == 200
        assert r.json()["description"] == "after"
        assert r.json()["project"] == "p"
        assert r.json()["priority"] == "L"

    def test_an_empty_modify_returns_the_task_unchanged(self, client, auth):
        created = _create(client, auth, description="untouched")
        r = client.put(f"/tasks/{created['uuid']}", json={}, headers=auth)
        assert r.status_code == 200
        assert r.json()["description"] == "untouched"

    def test_done_removes_the_task_from_the_pending_list(self, client, auth):
        created = _create(client, auth)
        assert client.post(f"/tasks/{created['uuid']}/done", headers=auth).status_code == 204
        assert client.get("/tasks", headers=auth).json() == []

    def test_delete_removes_the_task_from_the_pending_list(self, client, auth):
        created = _create(client, auth)
        assert client.delete(f"/tasks/{created['uuid']}", headers=auth).status_code == 204
        assert client.get("/tasks", headers=auth).json() == []

    def test_start_then_stop_toggles_the_active_marker(self, client, auth):
        created = _create(client, auth)
        started = client.post(f"/tasks/{created['uuid']}/start", headers=auth).json()
        assert started["start"]
        stopped = client.post(f"/tasks/{created['uuid']}/stop", headers=auth).json()
        assert stopped["start"] is None

    def test_annotate_appends_to_the_annotation_list(self, client, auth):
        created = _create(client, auth)
        r = client.post(f"/tasks/{created['uuid']}/annotate", json={"text": "a note"}, headers=auth)
        assert r.status_code == 200
        assert [a["description"] for a in r.json()["annotations"]] == ["a note"]


class TestTagsAreAFullSet:
    """The web UI sends the complete tag list on every save and expected removal to work.

    It did not: modify only ever added tags, so a removed tag silently stayed.
    """

    @staticmethod
    def _in(client, auth, view):
        return [t["uuid"] for t in client.get(f"/gtd/{view}", headers=auth).json()]

    def test_someday_to_next_moves_the_task_between_the_lists(self, client, auth):
        task = _create(client, auth, description="idea", tags=["someday"])
        r = client.put(f"/tasks/{task['uuid']}", json={"tags": ["next"]}, headers=auth)
        assert r.status_code == 200, r.text
        assert r.json()["tags"] == ["next"]
        assert task["uuid"] in self._in(client, auth, "next")
        assert task["uuid"] not in self._in(client, auth, "someday")

    def test_the_deltas_move_it_too(self, client, auth):
        task = _create(client, auth, description="idea", tags=["someday", "@home"])
        r = client.put(
            f"/tasks/{task['uuid']}",
            json={"tags_remove": ["someday"], "tags_add": ["next"]},
            headers=auth,
        )
        assert r.status_code == 200, r.text
        assert sorted(r.json()["tags"]) == ["@home", "next"]

    def test_the_full_set_and_a_delta_together_are_a_400(self, client, auth):
        task = _create(client, auth, tags=["someday"])
        r = client.put(
            f"/tasks/{task['uuid']}", json={"tags": ["next"], "tags_add": ["x"]}, headers=auth
        )
        assert r.status_code == 400
        assert "not both" in r.json()["detail"]

    def test_removing_the_last_tag_puts_a_project_less_task_back_in_the_inbox(self, client, auth):
        task = _create(client, auth, description="unclear", tags=["next"])
        assert task["uuid"] not in self._in(client, auth, "inbox")
        r = client.put(f"/tasks/{task['uuid']}", json={"tags": []}, headers=auth)
        assert r.status_code == 200, r.text
        assert task["uuid"] in self._in(client, auth, "inbox")

    @pytest.mark.parametrize("field,tag", [("tags_remove", "-x"), ("tags_add", "1abc")])
    def test_a_malformed_delta_is_a_400(self, client, auth, field, tag):
        task = _create(client, auth)
        r = client.put(f"/tasks/{task['uuid']}", json={field: [tag]}, headers=auth)
        assert r.status_code == 400

    def test_a_new_malformed_tag_in_the_full_set_is_a_400(self, client, auth):
        task = _create(client, auth)
        r = client.put(f"/tasks/{task['uuid']}", json={"tags": ["a,b"]}, headers=auth)
        assert r.status_code == 400
        assert "Invalid tag" in r.json()["detail"]

    def test_a_delta_list_is_bounded(self, client, auth):
        task = _create(client, auth)
        many = [f"t{i}" for i in range(51)]
        r = client.put(f"/tasks/{task['uuid']}", json={"tags_add": many}, headers=auth)
        assert r.status_code == 422
