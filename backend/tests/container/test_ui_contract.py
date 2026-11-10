"""Container tier: the API behaviour the new web UI's shared rules rely on (brief 0048).

The rules in ``frontend/src/shared/gtdRules.js``, ``sections.js`` and ``dayProgress.js``
compute every list move and its inverse on the client and send them as deltas. Each test
here pins one answer of the real binary those rules were written against; the answers were
first observed over HTTP against Taskwarrior 3.5.0 and are recorded in the brief.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.services import task_runner

pytestmark = pytest.mark.container

Client = tuple[TestClient, dict[str, str]]


def _create(client: TestClient, headers: dict[str, str], **body: object) -> dict:
    body.setdefault("description", "a task")
    r = client.post("/tasks", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def _put(client: TestClient, headers: dict[str, str], uuid: str, body: dict) -> dict:
    r = client.put(f"/tasks/{uuid}", json=body, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _in(client: TestClient, headers: dict[str, str], view: str) -> list[str]:
    return [t["uuid"] for t in client.get(f"/gtd/{view}", headers=headers).json()]


def _legacy(tag: str, description: str) -> str:
    """A task with a comma tag, as an older client wrote it (the API refuses to)."""
    task_runner.add_task("alice", [f"+{tag}"], [description])
    return task_runner.export_latest("alice")[0]["uuid"]


class TestTheFollowUpDay:
    """Warten auf keeps its follow-up day in ``scheduled``; leaving the list clears it."""

    def test_an_empty_scheduled_clears_it_and_nothing_else(self, real_client: Client):
        client, headers = real_client
        task = _create(
            client,
            headers,
            description="Kaution",
            tags=["waiting", "@anrufe"],
            scheduled="2026-10-31",
        )
        assert task["scheduled"]
        after = _put(client, headers, task["uuid"], {"scheduled": ""})
        assert after["scheduled"] is None
        assert sorted(after["tags"]) == ["@anrufe", "waiting"]
        assert after["description"] == "Kaution"

    def test_a_list_move_and_its_inverse_each_go_in_one_put(self, real_client: Client):
        """``listPayload`` Warten auf → Nächste, then the ``inversePayload`` Rückgängig sends."""
        client, headers = real_client
        task = _create(client, headers, tags=["waiting", "@anrufe"], scheduled="2026-10-31")
        stored = task["scheduled"]

        moved = _put(
            client,
            headers,
            task["uuid"],
            {"tags_add": ["next"], "tags_remove": ["waiting"], "scheduled": ""},
        )
        assert sorted(moved["tags"]) == ["@anrufe", "next"]
        assert moved["scheduled"] is None
        assert task["uuid"] in _in(client, headers, "next")
        assert task["uuid"] not in _in(client, headers, "waiting")

        undone = _put(
            client,
            headers,
            task["uuid"],
            {"tags_add": ["waiting"], "tags_remove": ["next"], "scheduled": "2026-10-31"},
        )
        assert sorted(undone["tags"]) == ["@anrufe", "waiting"]
        assert undone["scheduled"] == stored, "the day sent back is stored as it was first"


class TestLegacyCommaTags:
    """F2: a comma tag can be removed but never added, so a move restores its parts."""

    def test_a_comma_tag_is_refused_as_a_new_tag(self, real_client: Client):
        client, headers = real_client
        uuid = _legacy("next,@home", "legacy")
        r = client.put(f"/tasks/{uuid}", json={"tags_add": ["next,@home"]}, headers=headers)
        assert r.status_code == 400, r.text
        assert "Invalid tag" in r.json()["detail"]

    def test_removing_it_and_adding_its_parts_moves_the_task(self, real_client: Client):
        """``listPayload`` of ``next,@home`` → Warten auf, then its part-wise inverse."""
        client, headers = real_client
        uuid = _legacy("next,@home", "legacy")
        # The binary matches whole tags: the server's Nächste misses it, the client's
        # `listOf` (which splits) puts it in Nächste. The parity check expects this.
        assert uuid not in _in(client, headers, "next")

        moved = _put(
            client, headers, uuid, {"tags_remove": ["next,@home"], "tags_add": ["waiting", "@home"]}
        )
        assert sorted(moved["tags"]) == ["@home", "waiting"]
        assert moved["description"] == "legacy", "a tag token became description text"
        assert uuid in _in(client, headers, "waiting")

        undone = _put(client, headers, uuid, {"tags_remove": ["waiting"], "tags_add": ["next"]})
        assert sorted(undone["tags"]) == ["@home", "next"]
        assert uuid in _in(client, headers, "next")

    def test_a_present_tag_added_and_an_absent_one_removed_change_nothing(
        self, real_client: Client
    ):
        client, headers = real_client
        task = _create(client, headers, description="same", tags=["next", "@home"])
        after = _put(
            client, headers, task["uuid"], {"tags_add": ["@home"], "tags_remove": ["someday"]}
        )
        assert sorted(after["tags"]) == ["@home", "next"]
        assert after["description"] == "same"


class TestCompletingToday:
    """What the day progress reads after a tick."""

    def test_done_drops_start(self, real_client: Client):
        """F6: a running task loses ``start`` on completion, so ``dayProgress`` cannot see
        that it was running; the client records ``plannedAtHold`` at the tick instead."""
        client, headers = real_client
        task = _create(client, headers, tags=["next", "@home"])
        assert client.post(f"/tasks/{task['uuid']}/start", headers=headers).status_code == 200
        assert client.get(f"/tasks/{task['uuid']}", headers=headers).json()["start"]

        assert client.post(f"/tasks/{task['uuid']}/done", headers=headers).status_code == 204
        done = client.get(f"/tasks/{task['uuid']}", headers=headers).json()
        assert done["status"] == "completed"
        assert done["end"]
        assert done["start"] is None

    def test_completed_since_the_servers_today_returns_todays_ticks(self, real_client: Client):
        client, headers = real_client
        done = _create(client, headers, description="ticked", tags=["next", "@home"])
        _create(client, headers, description="still open")
        assert client.post(f"/tasks/{done['uuid']}/done", headers=headers).status_code == 204

        today = client.get("/gtd/summary", headers=headers).json()["today"]
        r = client.get("/tasks", params={"completed_since": today}, headers=headers)
        assert r.status_code == 200, r.text
        assert [(t["description"], t["status"]) for t in r.json()] == [("ticked", "completed")]
        assert r.json()[0]["end"]
