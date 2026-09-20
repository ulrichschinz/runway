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
        # Stored as Taskwarrior stores it: UTC basic format (the fake models the TZ=UTC image).
        assert task["due"] == "20260901T000000Z"
        assert task["status"] == "pending"

    @pytest.mark.parametrize("priority", ["X", "high", "h"])
    def test_rejects_an_unknown_priority(self, client, auth, priority):
        r = client.post("/tasks", json={"description": "x", "priority": priority}, headers=auth)
        assert r.status_code == 400
        assert "Invalid priority" in r.json()["detail"]

    def test_an_empty_priority_means_none_given(self, client, auth):
        """On create `""` is "not given" for every field (D7); it used to be a 400."""
        task = _create(client, auth, priority="", project="", due="")
        assert task["priority"] is None
        assert task["project"] is None
        assert task["due"] is None

    @pytest.mark.parametrize("tag", ["has space", "semi;colon", "pipe|char", "$(whoami)"])
    def test_rejects_a_tag_outside_the_allowed_character_set(self, client, auth, tag):
        r = client.post("/tasks", json={"description": "x", "tags": [tag]}, headers=auth)
        assert r.status_code == 400
        assert "Invalid tag" in r.json()["detail"]

    @pytest.mark.parametrize("recur", ["daily", "weekly", "2d", "3 weeks"])
    def test_accepts_recognised_recurrence_values(self, client, auth, recur):
        task = _create(client, auth, description=f"r {recur}", recur=recur, due="2026-10-01")
        assert task["uuid"]

    def test_a_recurring_task_without_a_due_date_is_a_400(self, client, auth):
        """Taskwarrior refuses it (rc 2); it used to be a 500."""
        r = client.post("/tasks", json={"description": "r", "recur": "weekly"}, headers=auth)
        assert r.status_code == 400, r.text
        assert "due" in r.json()["detail"]

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


class TestEmptyStringClears:
    @pytest.mark.parametrize(
        "field,value,stored",
        [
            ("project", "p", "p"),
            ("priority", "H", "H"),
            ("due", "2026-09-01", "20260901T000000Z"),
            ("wait", "2026-09-01", "20260901T000000Z"),
        ],
    )
    def test_an_empty_string_clears_the_field(self, client, auth, field, value, stored):
        task = _create(client, auth, **{field: value})
        assert task[field] == stored
        r = client.put(f"/tasks/{task['uuid']}", json={field: ""}, headers=auth)
        assert r.status_code == 200, r.text
        assert r.json()[field] is None

    def test_an_empty_description_leaves_the_description_alone(self, client, auth):
        """The one field an empty string does not clear, as the route description says.

        `""` reaches Taskwarrior as free text after `--`, which 3.5.0 takes with rc 0 and
        ignores (pinned in `tests/container`). The API therefore answers 200 with the old
        description rather than an empty one.
        """
        task = _create(client, auth, description="hello world")
        r = client.put(f"/tasks/{task['uuid']}", json={"description": ""}, headers=auth)
        assert r.status_code == 200, r.text
        assert r.json()["description"] == "hello world"

    def test_null_still_means_unchanged(self, client, auth):
        task = _create(client, auth, priority="H")
        r = client.put(f"/tasks/{task['uuid']}", json={"priority": None}, headers=auth)
        assert r.status_code == 200, r.text
        assert r.json()["priority"] == "H"


class TestTaskwarriorRejections:
    """Exit code 2 is Taskwarrior refusing the input: the caller's error, so 400 (D6)."""

    @staticmethod
    def _rejecting(fake_task, monkeypatch, message):
        from app.services import task_runner

        real = fake_task.run

        def run(username, args, text=None):
            if "modify" in args or "add" in args:
                raise task_runner.TaskwarriorRejected(message)
            return real(username, args, text)

        monkeypatch.setattr(task_runner, "_run", run)

    def test_a_rejected_modify_is_a_400_with_the_reason(self, client, auth, fake_task, monkeypatch):
        task = _create(client, auth)
        self._rejecting(
            fake_task, monkeypatch, "You cannot remove the recurrence from a recurring task."
        )
        r = client.put(f"/tasks/{task['uuid']}", json={"recur": ""}, headers=auth)
        assert r.status_code == 400
        assert r.json()["detail"] == "You cannot remove the recurrence from a recurring task."

    def test_a_rejected_create_is_a_400(self, client, auth, fake_task, monkeypatch):
        self._rejecting(
            fake_task, monkeypatch, "'notadate' is not a valid date in the 'Y-M-D' format."
        )
        r = client.post("/tasks", json={"description": "x", "due": "notadate"}, headers=auth)
        assert r.status_code == 400
        assert "not a valid date" in r.json()["detail"]


class TestListFiltersOverHttp:
    """The filters of ADR 0038, as an MCP client or the SPA sends them."""

    def test_the_status_parameter_selects_completed_tasks(self, client, auth):
        done = _create(client, auth, description="finished")
        _create(client, auth, description="open")
        client.post(f"/tasks/{done['uuid']}/done", headers=auth)
        r = client.get("/tasks", params={"status": "completed"}, headers=auth)
        assert [t["description"] for t in r.json()] == ["finished"]
        assert r.json()[0]["end"] == "20260919T100000Z"

    def test_status_waiting_is_a_future_wait_not_the_waiting_tag(self, client, auth):
        _create(client, auth, description="hidden", wait="2026-10-01")
        _create(client, auth, description="delegated", tags=["waiting"])
        r = client.get("/tasks", params={"status": "waiting"}, headers=auth)
        assert [t["description"] for t in r.json()] == ["hidden"]

    def test_include_done_no_longer_returns_deleted_tasks(self, client, auth):
        """It used to send no filter at all, so deleted tasks and recurring templates
        came back with everything else (D12)."""
        gone = _create(client, auth, description="deleted")
        done = _create(client, auth, description="finished")
        client.delete(f"/tasks/{gone['uuid']}", headers=auth)
        client.post(f"/tasks/{done['uuid']}/done", headers=auth)
        r = client.get("/tasks", params={"include_done": True}, headers=auth)
        assert [t["description"] for t in r.json()] == ["finished"]

    def test_include_done_false_is_ignored_rather_than_a_conflict(self, client, auth):
        """The SPA sends it on every context-tag refresh, and agents fill defaults."""
        r = client.get(
            "/tasks", params={"include_done": False, "status": "completed"}, headers=auth
        )
        assert r.status_code == 200

    def test_include_done_true_with_a_status_is_a_400(self, client, auth):
        r = client.get("/tasks", params={"include_done": True, "status": "all"}, headers=auth)
        assert r.status_code == 400
        assert "include_done" in r.json()["detail"]

    def test_the_project_filter_is_exact(self, client, auth):
        _create(client, auth, description="mine", project="alpha")
        _create(client, auth, description="sub", project="alpha.sub")
        _create(client, auth, description="other", project="alphabet")
        r = client.get("/tasks", params={"project": "alpha"}, headers=auth)
        assert [t["description"] for t in r.json()] == ["mine"]

    def test_tags_are_repeatable_and_combine_with_and(self, client, auth):
        _create(client, auth, description="both", tags=["next", "@home"])
        _create(client, auth, description="one", tags=["next"])
        r = client.get("/tasks", params=[("tag", "next"), ("tag", "@home")], headers=auth)
        assert [t["description"] for t in r.json()] == ["both"]

    def test_the_date_filters_and_the_limit(self, client, auth):
        _create(client, auth, description="yesterday", due="2026-09-18")
        _create(client, auth, description="tomorrow", due="2026-09-20")
        r = client.get("/tasks", params={"due_before": "2026-09-19"}, headers=auth)
        assert [t["description"] for t in r.json()] == ["yesterday"]
        assert len(client.get("/tasks", params={"limit": 1}, headers=auth).json()) == 1

    @pytest.mark.parametrize(
        "params",
        [
            {"project": "a/b"},
            {"project": "rc.data.location=/tmp/x"},
            {"project": "a\nb"},
            {"tag": "-next"},
            {"due_before": "2026-9-3"},
            {"completed_since": "2026-09-01", "status": "pending"},
        ],
    )
    def test_a_refused_filter_value_is_a_400(self, client, auth, params):
        assert client.get("/tasks", params=params, headers=auth).status_code == 400

    @pytest.mark.parametrize(
        "params",
        [
            {"status": "archived"},
            {"limit": 0},
            {"limit": 501},
            {"project": "x" * 101},
            {"due_before": "x" * 11},
        ],
    )
    def test_a_parameter_outside_its_declared_type_is_a_422(self, client, auth, params):
        assert client.get("/tasks", params=params, headers=auth).status_code == 422

    def test_more_than_ten_tags_is_a_422(self, client, auth):
        params = [("tag", f"t{i}") for i in range(11)]
        assert client.get("/tasks", params=params, headers=auth).status_code == 422

    def test_no_refused_value_ever_reaches_the_binary(self, fake_task, client, auth):
        """The fuzz check from the plan: a refused filter is a 400 or a 422, never a 500,
        and never a token in an argument vector."""
        poison = ["(", ")", " or ", "\n", "rc.data.location=/tmp/x", "-x", "+x", "z" * 10000]
        fake_task.calls.clear()
        for value in poison:
            for field in ("project", "tag", "due_before", "completed_since"):
                r = client.get("/tasks", params={field: value}, headers=auth)
                assert r.status_code in (400, 422), (field, value, r.status_code)
        for _user, args, _text in fake_task.calls:
            for token in args:
                assert not any(value in token for value in poison), args


class TestTheTextSearch:
    """`q` is ours, not Taskwarrior's.

    It is a casefold substring of the description, applied in Python over the export, so no
    part of what the user typed ever becomes an argv token — a description filter would sit
    in the one position `--` cannot protect (ADR 0038).
    """

    def test_it_matches_case_insensitively_including_umlauts(self, client, auth):
        _create(client, auth, description="Büro aufräumen")
        _create(client, auth, description="Rechnung schreiben")
        r = client.get("/tasks", params={"q": "büro"}, headers=auth)
        assert [t["description"] for t in r.json()] == ["Büro aufräumen"]

    def test_a_duplicate_check_needs_the_waiting_status_too(self, client, auth):
        """The skill's duplicate check: once pending, once waiting, because a hidden
        tickler is not pending."""
        _create(client, auth, description="Vertrag Meyer prüfen", wait="2026-10-01")
        # A visible task and a second hidden one, neither matching: without them both
        # assertions would hold with `q` ignored entirely.
        _create(client, auth, description="Angebot Berg")
        _create(client, auth, description="Rechnung Berg", wait="2026-10-01")
        assert client.get("/tasks", params={"q": "meyer"}, headers=auth).json() == []
        r = client.get("/tasks", params={"q": "meyer", "status": "waiting"}, headers=auth)
        assert [t["description"] for t in r.json()] == ["Vertrag Meyer prüfen"]

    def test_it_narrows_before_the_limit_applies(self, client, auth):
        _create(client, auth, description="Angebot Meyer", priority="H")
        _create(client, auth, description="Angebot Berg", priority="M")
        _create(client, auth, description="Rechnung Meyer", priority="L")
        r = client.get("/tasks", params={"q": "meyer", "limit": 2}, headers=auth)
        assert [t["description"] for t in r.json()] == ["Angebot Meyer", "Rechnung Meyer"]

    def test_it_is_bounded(self, client, auth):
        assert client.get("/tasks", params={"q": "x" * 201}, headers=auth).status_code == 422

    def test_no_part_of_it_ever_reaches_the_binary(self, fake_task, client, auth):
        _create(client, auth, description="safe")
        poison = ["(", " or ", "\n", "rc.data.location=/tmp/x", "description.has:x", "-x"]
        fake_task.calls.clear()
        for value in poison:
            r = client.get("/tasks", params={"q": value}, headers=auth)
            assert r.status_code == 200, (value, r.text)
            assert r.json() == []
        for _user, args, text in fake_task.calls:
            for token in [*args, *text]:
                assert not any(value in token for value in poison), args
