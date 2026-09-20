"""Characterization tests for the GTD views."""

from datetime import UTC, datetime

import pytest

from tests.conftest import register_user

# A `wait` far past the fake's clock (2026-09-19T10:00:00Z), so the task is hidden.
HIDDEN = "2026-10-01"


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
        views = (
            "inbox",
            "next",
            "waiting",
            "someday",
            "tickler",
            "summary",
            "review",
            "projects",
            "projects/p",
        )
        for view in views:
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


class TestSummary:
    """One call, every counter a review needs, and no task description anywhere (D14, D17).

    The fake's clock stands at 2026-09-19T10:00:00Z, and the unit tier runs the day logic in
    UTC, so "today" is 2026-09-19 throughout.
    """

    FIXTURE = [
        ("unprocessed", {}),
        ("returned from the tickler", {"wait": "2026-09-19"}),
        ("overdue thing", {"due": "2026-09-18", "tags": ["next"]}),
        ("due today thing", {"due": "2026-09-19", "tags": ["next"]}),
        ("plain next thing", {"tags": ["next"]}),
        ("could have started", {"tags": ["next"], "scheduled": "2026-09-18"}),
        ("waiting on a reply", {"tags": ["waiting"]}),
        ("follow up today", {"tags": ["waiting"], "scheduled": "2026-09-19"}),
        ("maybe one day", {"tags": ["someday"]}),
        ("parked until october", {"wait": "2026-10-01"}),
        ("only a context", {"tags": ["@home"]}),
        ("alpha step", {"project": "alpha", "tags": ["next"]}),
        ("beta step", {"project": "beta"}),
        # Six of the counters are defined by the visible/open difference, so each side of it
        # needs a task carrying the same tag or date as its visible twin above. Without
        # these, `waiting` (open) and `next` (visible) could be swapped without a red test.
        ("chased and parked", {"tags": ["waiting"], "scheduled": "2026-09-18", "wait": HIDDEN}),
        ("next but parked", {"tags": ["next"], "wait": HIDDEN}),
        ("someday and parked", {"tags": ["someday"], "wait": HIDDEN}),
        ("overdue and parked", {"tags": ["@home"], "due": "2026-09-18", "wait": HIDDEN}),
        ("due today and parked", {"tags": ["@home"], "due": "2026-09-19", "wait": HIDDEN}),
    ]

    def _seed(self, client, auth):
        for description, body in self.FIXTURE:
            _create(client, auth, description=description, **body)

    def test_every_counter(self, client, auth):
        self._seed(client, auth)
        r = client.get("/gtd/summary", headers=auth)
        assert r.status_code == 200, r.text
        assert r.json() == {
            "today": "2026-09-19",
            # "parked until october" is inbox-shaped but hidden, so it is not in the inbox;
            # "returned from the tickler" came back this morning, so it is.
            "inbox": 2,
            "inbox_oldest_entry": "20260804T090000Z",
            # The parked twins land in the open counters and stay out of the visible ones:
            # overdue, due today, waiting and its follow-up count them; next and someday
            # do not, because a task the user parked is not on offer today.
            "overdue": 2,
            "due_today": 2,
            "next": 5,
            "waiting": 3,
            "waiting_followup_due": 2,
            "someday": 1,
            "hidden": 6,
            "tickler_returned_today": 1,
            "scheduled_passed": 1,
            "unclarified": 1,
            "stalled_projects": ["beta"],
            "last_review": {"daily": None, "weekly": None},
        }

    def test_it_names_no_task(self, client, auth):
        """The summary is printable by a shell hook in a logged repository, which only holds
        while it carries counters and project names and nothing else."""
        self._seed(client, auth)
        body = client.get("/gtd/summary", headers=auth).text
        for description, _ in self.FIXTURE:
            assert description not in body

    def test_a_task_due_today_is_not_also_overdue(self, client, auth):
        _create(client, auth, description="today only", due="2026-09-19")
        summary = client.get("/gtd/summary", headers=auth).json()
        assert (summary["overdue"], summary["due_today"]) == (0, 1)

    def test_the_day_boundary_moves_the_counters(self, client, auth, fake_task):
        """Both sides of midnight, on the same task: the clock is the only thing that moves."""
        _create(client, auth, description="dated", due="2026-09-19")
        fake_task.now = datetime(2026, 9, 19, 23, 59, tzinfo=UTC)
        late = client.get("/gtd/summary", headers=auth).json()
        assert (late["today"], late["overdue"], late["due_today"]) == ("2026-09-19", 0, 1)
        fake_task.now = datetime(2026, 9, 20, 0, 1, tzinfo=UTC)
        early = client.get("/gtd/summary", headers=auth).json()
        assert (early["today"], early["overdue"], early["due_today"]) == ("2026-09-20", 1, 0)

    def test_it_requires_authentication(self, client, registered):
        assert client.get("/gtd/summary").status_code == 401


class TestSummaryProjects:
    """Which projects the summary calls stalled: active, no `next`, nothing waiting, nothing
    parked in the tickler (D14). A project waiting on someone, or parked, is not stalled."""

    def test_an_explicit_project_without_a_single_task_is_stalled(self, client, auth):
        client.post("/projects", json={"name": "empty"}, headers=auth)
        assert client.get("/gtd/summary", headers=auth).json()["stalled_projects"] == ["empty"]

    def test_a_project_with_only_a_waiting_task_is_not_stalled(self, client, auth):
        _create(client, auth, description="chasing", project="patient", tags=["waiting"])
        assert client.get("/gtd/summary", headers=auth).json()["stalled_projects"] == []

    def test_a_project_whose_only_task_is_parked_is_not_stalled(self, client, auth):
        _create(client, auth, description="later", project="dormant", wait="2026-10-01")
        assert client.get("/gtd/summary", headers=auth).json()["stalled_projects"] == []

    def test_a_project_with_a_next_action_is_not_stalled(self, client, auth):
        _create(client, auth, description="go", project="moving", tags=["next"])
        assert client.get("/gtd/summary", headers=auth).json()["stalled_projects"] == []


class TestSummaryScoping:
    """`tag` narrows every counter but the inbox, and a scoped summary names no project of
    another area (P1-5a, D14)."""

    def test_the_inbox_stays_unscoped_while_everything_else_narrows(self, client, auth):
        _create(client, auth, description="unprocessed")
        _create(client, auth, description="mine", tags=["next", "ar"])
        _create(client, auth, description="theirs", tags=["next", "privat"])
        scoped = client.get("/gtd/summary", params={"tag": "ar"}, headers=auth).json()
        assert (scoped["inbox"], scoped["next"]) == (1, 1)
        whole = client.get("/gtd/summary", headers=auth).json()
        assert (whole["inbox"], whole["next"]) == (1, 2)

    def test_the_hidden_counter_is_narrowed_too(self, client, auth):
        """`hidden` reads the scoped open tasks, not every open task: a tickler item of
        another area is not this repository's business either."""
        _create(client, auth, description="mine, parked", tags=["ar"], wait=HIDDEN)
        _create(client, auth, description="theirs, parked", tags=["privat"], wait=HIDDEN)
        scoped = client.get("/gtd/summary", params={"tag": "ar"}, headers=auth).json()
        whole = client.get("/gtd/summary", headers=auth).json()
        assert (scoped["hidden"], whole["hidden"]) == (1, 2)

    def test_a_private_project_is_neither_named_nor_counted_under_a_scope(self, client, auth):
        """The privacy property of scoping: a project with nothing in the scope is another
        area's business, so it is dropped before the stalled test — whether it is an explicit
        row with no task at all or a project whose open tasks all fall outside the scope,
        and while both are findings in the unscoped summary."""
        client.post("/projects", json={"name": "Privat X"}, headers=auth)
        _create(client, auth, description="therapy notes", project="Privat Y")
        _create(client, auth, description="work step", project="Arbeit", tags=["ar"])
        scoped = client.get("/gtd/summary", params={"tag": "ar"}, headers=auth)
        assert "Privat X" not in scoped.text
        assert "Privat Y" not in scoped.text
        assert scoped.json()["stalled_projects"] == ["Arbeit"]
        whole = client.get("/gtd/summary", headers=auth).json()
        assert whole["stalled_projects"] == ["Arbeit", "Privat X", "Privat Y"]

    def test_a_project_named_by_the_scope_is_judged_by_all_of_its_tasks(self, client, auth):
        """A scope decides which projects are named; it does not decide whether one has a
        next action. Capture in a scoped repository stays untagged, so a project whose next
        action carries no scope tag is moving, and saying otherwise is a finding the user
        cannot check: section 5 of the daily review reports names and makes no further call."""
        _create(client, auth, description="scoped step", project="shared", tags=["ar"])
        _create(client, auth, description="stuck step", project="stuck", tags=["ar"])
        _create(client, auth, description="the actual next step", project="shared", tags=["next"])
        scoped = client.get("/gtd/summary", params={"tag": "ar"}, headers=auth).json()
        assert scoped["stalled_projects"] == ["stuck"]

    def test_two_tags_are_and_ed(self, client, auth):
        _create(client, auth, description="both", tags=["next", "ar", "@home"])
        _create(client, auth, description="one", tags=["next", "ar"])
        params = [("tag", "ar"), ("tag", "@home")]
        assert client.get("/gtd/summary", params=params, headers=auth).json()["next"] == 1

    @pytest.mark.parametrize("tag", ["-next", "", "a,b", "1abc"])
    def test_a_refused_tag_is_a_400(self, client, auth, tag):
        assert client.get("/gtd/summary", params={"tag": tag}, headers=auth).status_code == 400


class TestReviewTimestamps:
    """When a review last happened: the one piece of GTD state Taskwarrior cannot hold.

    Without it an agent has to guess from the newest `modified` date among the tasks, which
    answers a different question — touching one task is not reviewing the lists — and quietly
    says "reviewed today" to a user who has not looked at anything for three weeks.
    """

    def test_a_recorded_review_comes_back(self, client, auth):
        posted = client.post("/gtd/review", json={"kind": "daily"}, headers=auth)
        assert posted.status_code == 201, posted.text
        assert posted.json()["kind"] == "daily"
        assert posted.json()["scope"] == ""
        assert client.get("/gtd/review", headers=auth).json() == [posted.json()]

    def test_nothing_recorded_is_an_empty_list_not_an_error(self, client, auth):
        assert client.get("/gtd/review", headers=auth).json() == []

    def test_reviewed_at_is_taskwarriors_own_stamp_format(self, client, auth):
        """The summary carries this next to `entry` and `wait`, which come from the binary."""
        at = client.post("/gtd/review", json={"kind": "weekly"}, headers=auth).json()["reviewed_at"]
        assert datetime.strptime(at, "%Y%m%dT%H%M%SZ").tzinfo is None  # parses, and is UTC by form

    def test_recording_the_same_kind_again_moves_the_timestamp_without_adding_a_row(
        self, client, auth
    ):
        first = client.post("/gtd/review", json={"kind": "daily"}, headers=auth).json()
        second = client.post("/gtd/review", json={"kind": "daily"}, headers=auth).json()
        rows = client.get("/gtd/review", headers=auth).json()
        assert len(rows) == 1
        assert rows[0]["reviewed_at"] == second["reviewed_at"] >= first["reviewed_at"]

    def test_the_two_kinds_are_separate_rows(self, client, auth):
        client.post("/gtd/review", json={"kind": "daily"}, headers=auth)
        client.post("/gtd/review", json={"kind": "weekly"}, headers=auth)
        assert {r["kind"] for r in client.get("/gtd/review", headers=auth).json()} == {
            "daily",
            "weekly",
        }

    def test_another_user_never_sees_the_review(self, client, auth):
        """Cross-user isolation, asserted rather than assumed: every other row in this
        database is scoped by username, and a review timestamp leaking would tell one user
        how another works."""
        client.post("/gtd/review", json={"kind": "daily"}, headers=auth)
        bob = register_user(client, "bob")
        bobs = {"Authorization": f"Bearer {bob['token']}"}
        assert client.get("/gtd/review", headers=bobs).json() == []
        client.post("/gtd/review", json={"kind": "weekly"}, headers=bobs)
        assert [r["kind"] for r in client.get("/gtd/review", headers=auth).json()] == ["daily"]

    def test_it_requires_authentication(self, client, registered):
        assert client.get("/gtd/review").status_code == 401
        assert client.post("/gtd/review", json={"kind": "daily"}).status_code == 401

    @pytest.mark.parametrize("kind", ["monthly", "", "DAILY"])
    def test_a_kind_the_server_does_not_know_is_a_422(self, client, auth, kind):
        assert client.post("/gtd/review", json={"kind": kind}, headers=auth).status_code == 422


class TestReviewScope:
    """A review covers what it covered. A repository that reviews its own area has not
    reviewed the whole system, and one key for both would say otherwise (D16)."""

    def test_the_scope_key_is_canonical_however_it_arrives(self, client, auth):
        posted = client.post(
            "/gtd/review", json={"kind": "daily", "scope": "ar+@work"}, headers=auth
        )
        assert posted.json()["scope"] == "@work+ar"

    def test_the_same_scope_in_another_order_updates_the_same_row(self, client, auth):
        client.post("/gtd/review", json={"kind": "daily", "scope": "ar+@work"}, headers=auth)
        client.post("/gtd/review", json={"kind": "daily", "scope": "@work+ar"}, headers=auth)
        client.post("/gtd/review", json={"kind": "daily", "scope": "@work+ar+ar"}, headers=auth)
        rows = client.get("/gtd/review", headers=auth).json()
        assert [(r["kind"], r["scope"]) for r in rows] == [("daily", "@work+ar")]

    def test_a_scoped_review_is_a_different_row_from_the_unscoped_one(self, client, auth):
        client.post("/gtd/review", json={"kind": "daily"}, headers=auth)
        client.post("/gtd/review", json={"kind": "daily", "scope": "ar"}, headers=auth)
        rows = client.get("/gtd/review", headers=auth).json()
        assert sorted(r["scope"] for r in rows) == ["", "ar"]

    @pytest.mark.parametrize(
        "scope", ["-x", "a++b", "+ar", "ar+", "a b", "a\nb", "+".join("abcdefghijk")]
    )
    def test_a_scope_that_is_not_a_set_of_tags_is_a_400(self, client, auth, scope):
        r = client.post("/gtd/review", json={"kind": "daily", "scope": scope}, headers=auth)
        assert r.status_code == 400, r.text

    def test_a_scope_longer_than_the_field_allows_is_a_422(self, client, auth):
        body = {"kind": "daily", "scope": "a" * 201}
        assert client.post("/gtd/review", json=body, headers=auth).status_code == 422


class TestSummaryLastReview:
    """The summary answers "how current are these lists" in the same call as the counters,
    because a reminder that needs two calls to decide whether to speak will not be written."""

    def test_the_summary_reports_the_unscoped_review(self, client, auth):
        assert client.get("/gtd/summary", headers=auth).json()["last_review"] == {
            "daily": None,
            "weekly": None,
        }
        at = client.post("/gtd/review", json={"kind": "weekly"}, headers=auth).json()["reviewed_at"]
        assert client.get("/gtd/summary", headers=auth).json()["last_review"] == {
            "daily": None,
            "weekly": at,
        }

    def test_the_summary_matches_its_tag_list_to_the_scope_key(self, client, auth):
        """`?tag=ar&tag=@work` and the stored `@work+ar` are the same scope, whichever order
        the caller sends — and `?tag=ar` alone is a smaller scope, which was never reviewed."""
        at = client.post(
            "/gtd/review", json={"kind": "daily", "scope": "ar+@work"}, headers=auth
        ).json()["reviewed_at"]
        both = [("tag", "ar"), ("tag", "@work")]
        assert client.get("/gtd/summary", params=both, headers=auth).json()["last_review"] == {
            "daily": at,
            "weekly": None,
        }
        narrower = client.get("/gtd/summary", params={"tag": "ar"}, headers=auth).json()
        assert narrower["last_review"] == {"daily": None, "weekly": None}

    def test_an_unscoped_review_does_not_answer_for_a_scope(self, client, auth):
        client.post("/gtd/review", json={"kind": "daily"}, headers=auth)
        scoped = client.get("/gtd/summary", params={"tag": "ar"}, headers=auth).json()
        assert scoped["last_review"]["daily"] is None
