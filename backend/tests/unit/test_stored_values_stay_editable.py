"""A value the previous deploy stored stays editable after the field limits (second review of brief 0073).

The limits of brief 0073 (`RISK-SEC-004`) bound what a request may *write*. The previous deploy had no
such bounds, so a live store can hold a description over 2 000 characters, more than 50 tags, a tag
over 100 characters, more than 100 dependencies, or a plan text, item or list over its bound. The SPA
resends the whole task (`buildTaskPayload`) and the whole plan (`planBody`) on every save, and an
agent over MCP echoes the description back. If the bounds also applied to the value already stored,
such a task or plan could no longer be edited at all — not even its due date.

The rule is the one `_tag_diff` already follows for legacy tags (D3): **only what changes is held to
the bound**. A value equal to the stored one is kept as it is; a value that differs must be within it.
"""

from __future__ import annotations

import json
import sqlite3

from app import models
from app.config import settings

LONG_DESCRIPTION = "d" * (models.DESCRIPTION_MAX + 1_000)


def _task(client, auth, fake_task, **stored) -> str:
    """A task created today and then given `stored` the way the previous deploy could have written it."""
    uuid = client.post("/tasks", json={"description": "x"}, headers=auth).json()["uuid"]
    for tasks in fake_task.stores.values():
        for task in tasks:
            if task["uuid"] == uuid:
                task.update(stored)
    return uuid


def _spa_save(client, auth, uuid: str, **changes):
    """What TaskModal sends on save: the full current description, tags and depends, plus the edit."""
    current = client.get(f"/tasks/{uuid}", headers=auth).json()
    body = {
        "description": current["description"],
        "tags": current["tags"],
        "depends": current["depends"],
        **changes,
    }
    return client.put(f"/tasks/{uuid}", json=body, headers=auth)


class TestAStoredTaskStaysEditable:
    def test_a_description_over_the_limit_survives_an_unrelated_edit(self, client, auth, fake_task):
        uuid = _task(client, auth, fake_task, description=LONG_DESCRIPTION)
        r = _spa_save(client, auth, uuid, due="2026-12-01")
        assert r.status_code == 200, r.text[:300]
        assert r.json()["description"] == LONG_DESCRIPTION
        assert r.json()["due"]

    def test_a_changed_description_over_the_limit_is_still_422(self, client, auth, fake_task):
        uuid = _task(client, auth, fake_task, description=LONG_DESCRIPTION)
        r = _spa_save(client, auth, uuid, description=LONG_DESCRIPTION + "!")
        assert r.status_code == 422, r.text[:300]
        assert client.get(f"/tasks/{uuid}", headers=auth).json()["description"] == LONG_DESCRIPTION

    def test_an_over_long_or_over_many_tag_set_survives_an_unrelated_edit(
        self, client, auth, fake_task
    ):
        tags = [f"t{i}" for i in range(models.TAGS_MAX_ITEMS + 10)] + ["l" * (models.TAG_MAX + 50)]
        uuid = _task(client, auth, fake_task, tags=list(tags))
        r = _spa_save(client, auth, uuid, due="2026-12-01")
        assert r.status_code == 200, r.text[:300]
        assert sorted(r.json()["tags"]) == sorted(tags)

    def test_a_stored_over_long_tag_can_be_removed(self, client, auth, fake_task):
        long_tag = "l" * (models.TAG_MAX + 50)
        uuid = _task(client, auth, fake_task, tags=["a", long_tag])
        r = client.put(f"/tasks/{uuid}", json={"tags_remove": [long_tag]}, headers=auth)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["tags"] == ["a"]

    def test_a_new_tag_over_the_limit_is_still_422(self, client, auth, fake_task):
        uuid = _task(client, auth, fake_task, tags=["a"])
        for body in (
            {"tags": ["a", "n" * (models.TAG_MAX + 1)]},
            {"tags_add": ["n" * (models.TAG_MAX + 1)]},
        ):
            r = client.put(f"/tasks/{uuid}", json=body, headers=auth)
            assert r.status_code == 422, (body.keys(), r.text[:300])
        assert client.get(f"/tasks/{uuid}", headers=auth).json()["tags"] == ["a"]

    def test_a_tag_set_cannot_grow_past_the_limit(self, client, auth, fake_task):
        """Over the bound only by what was stored: the set may keep its size, never grow past both."""
        stored = [f"t{i}" for i in range(models.TAGS_MAX_ITEMS + 5)]
        uuid = _task(client, auth, fake_task, tags=list(stored))
        r = client.put(f"/tasks/{uuid}", json={"tags": [*stored, "one_more"]}, headers=auth)
        assert r.status_code == 422, r.text[:300]
        r = client.put(f"/tasks/{uuid}", json={"tags_add": ["one_more"]}, headers=auth)
        assert r.status_code == 422, r.text[:300]
        fresh = _task(client, auth, fake_task, tags=[])
        r = client.put(
            f"/tasks/{fresh}",
            json={"tags": [f"n{i}" for i in range(models.TAGS_MAX_ITEMS + 1)]},
            headers=auth,
        )
        assert r.status_code == 422, r.text[:300]

    def test_more_stored_dependencies_than_the_limit_survive_an_unrelated_edit(
        self, client, auth, fake_task
    ):
        many = [f"00000000-0000-4000-8000-{i:012d}" for i in range(models.DEPENDS_MAX_ITEMS + 5)]
        uuid = _task(client, auth, fake_task, depends=list(many))
        r = _spa_save(client, auth, uuid, due="2026-12-01")
        assert r.status_code == 200, r.text[:300]
        r = client.put(
            f"/tasks/{uuid}", json={"depends": [*many, many[0][:-1] + "x"]}, headers=auth
        )
        assert r.status_code in (400, 422), r.text[:300]

    def test_the_error_names_the_field(self, client, auth, fake_task):
        uuid = _task(client, auth, fake_task)
        r = client.put(
            f"/tasks/{uuid}", json={"description": "d" * (models.DESCRIPTION_MAX + 1)}, headers=auth
        )
        assert r.status_code == 422
        assert r.json()["detail"][0]["loc"][-1] == "description"


def _store_plan(username: str, name: str, **columns) -> None:
    """Write a plan row directly, as the previous deploy could have written it through the API."""
    con = sqlite3.connect(settings.db_path)
    try:
        con.execute(
            "INSERT INTO projects (username, name, purpose, principles, vision, brainstorm, organized)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                username,
                name,
                columns.get("purpose", ""),
                columns.get("principles", ""),
                columns.get("vision", ""),
                json.dumps(columns.get("brainstorm", [])),
                json.dumps(columns.get("organized", [])),
            ),
        )
        con.commit()
    finally:
        con.close()


def _plan_save(client, auth, name: str, **changes):
    """What the plan page sends on save: every text and both lists, whole (`planBody`)."""
    plan = client.get(f"/projects/plans/{name}", headers=auth).json()
    body = {k: plan[k] for k in ("purpose", "principles", "vision", "brainstorm", "organized")}
    return client.put(f"/projects/plans/{name}", json={**body, **changes}, headers=auth)


class TestAStoredPlanStaysEditable:
    LONG_TEXT = "p" * (models.PLAN_TEXT_MAX + 1_000)
    LONG_ITEM = {
        "id": "i" * (models.PLAN_ITEM_ID_MAX + 10),
        "text": "t" * (models.PLAN_ITEM_TEXT_MAX + 10),
    }
    MANY = [{"id": str(i), "text": "b"} for i in range(models.PLAN_LIST_MAX_ITEMS + 5)]

    def test_over_limit_texts_and_lists_survive_an_unrelated_edit(self, client, auth, registered):
        _store_plan(
            registered["username"],
            "home",
            purpose=self.LONG_TEXT,
            brainstorm=[*self.MANY, self.LONG_ITEM],
            organized=[self.LONG_ITEM],
        )
        r = _plan_save(client, auth, "home", vision="done")
        assert r.status_code == 200, r.text[:300]
        assert r.json()["purpose"] == self.LONG_TEXT
        assert r.json()["vision"] == "done"
        assert len(r.json()["brainstorm"]) == len(self.MANY) + 1

    def test_a_stored_item_can_move_between_the_lists(self, client, auth, registered):
        _store_plan(registered["username"], "home", brainstorm=[self.LONG_ITEM])
        r = _plan_save(client, auth, "home", brainstorm=[], organized=[self.LONG_ITEM])
        assert r.status_code == 200, r.text[:300]
        assert r.json()["organized"] == [self.LONG_ITEM]

    def test_a_changed_text_or_a_new_item_over_the_limit_is_still_422(
        self, client, auth, registered
    ):
        _store_plan(registered["username"], "home", purpose=self.LONG_TEXT, brainstorm=self.MANY)
        for change in (
            {"purpose": self.LONG_TEXT + "!"},
            {"principles": "q" * (models.PLAN_TEXT_MAX + 1)},
            {"organized": [{"id": "new", "text": "t" * (models.PLAN_ITEM_TEXT_MAX + 1)}]},
            {"organized": [{"id": "n" * (models.PLAN_ITEM_ID_MAX + 1), "text": "x"}]},
            {"brainstorm": [*self.MANY, {"id": "one-more", "text": "b"}]},
        ):
            r = _plan_save(client, auth, "home", **change)
            assert r.status_code == 422, (list(change), r.status_code, r.text[:300])
        plan = client.get("/projects/plans/home", headers=auth).json()
        assert plan["purpose"] == self.LONG_TEXT
        assert plan["principles"] == "" and plan["organized"] == []


class TestTheCeilingsAreWhatThePreviousDeployCouldStore:
    def test_the_update_ceilings_are_the_old_effective_limits(self):
        """A task's text reached Taskwarrior as one argument (Linux `MAX_ARG_STRLEN`, 131 072 bytes,
        so at most as many characters); a plan arrived in one body of at most the default limit."""
        from app import middleware

        assert models.STORED_ARG_MAX == 131_072
        assert models.STORED_PLAN_VALUE_MAX == middleware.DEFAULT_BODY_LIMIT

    def test_the_openapi_schema_states_the_ceilings_and_the_bound_on_change(self, client):
        schema = client.get("/openapi.json").json()["components"]["schemas"]
        description = schema["TaskModify"]["properties"]["description"]
        bounded = description.get("anyOf", [description])
        assert any(b.get("maxLength") == models.STORED_ARG_MAX for b in bounded)
        assert str(models.DESCRIPTION_MAX) in description["description"]
        purpose = schema["ProjectPlanUpdate"]["properties"]["purpose"]
        assert str(models.PLAN_TEXT_MAX) in purpose["description"]
