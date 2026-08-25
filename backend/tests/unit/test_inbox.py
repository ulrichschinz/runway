"""Tests for the agent-facing inbox webhook.

This endpoint used to carry its own authentication, separate from
dependencies.get_current_user (finding SEC-6). Step 11 unified it. What remains is a shim —
an API key in the Bearer slot, accepted by get_current_user for every route, tracked as
SHIM-SEC-006 with a removal step — because every agent and MCP client sends the key that way
today. These tests pin both the unified behaviour and the shim, so the shim's removal shows
up as a deliberate test change rather than a silent break.
"""


class TestWebhook:
    def test_accepts_an_api_key_in_the_authorization_header(self, client, registered):
        r = client.post(
            "/inbox",
            json={"description": "from an agent"},
            headers={"Authorization": f"Bearer {registered['api_key']}"},
        )
        assert r.status_code == 201
        assert r.json()["description"] == "from an agent"
        assert r.json()["uuid"]

    def test_the_task_lands_in_the_gtd_inbox(self, client, registered, auth):
        client.post(
            "/inbox",
            json={"description": "captured"},
            headers={"Authorization": f"Bearer {registered['api_key']}"},
        )
        assert [t["description"] for t in client.get("/gtd/inbox", headers=auth).json()] == [
            "captured"
        ]

    def test_a_note_becomes_an_annotation(self, client, registered, auth):
        r = client.post(
            "/inbox",
            json={"description": "with note", "note": "the context"},
            headers={"Authorization": f"Bearer {registered['api_key']}"},
        )
        task = client.get(f"/tasks/{r.json()['uuid']}", headers=auth).json()
        assert [a["description"] for a in task["annotations"]] == ["the context"]

    def test_priority_is_applied(self, client, registered, auth):
        r = client.post(
            "/inbox",
            json={"description": "urgent", "priority": "H"},
            headers={"Authorization": f"Bearer {registered['api_key']}"},
        )
        task = client.get(f"/tasks/{r.json()['uuid']}", headers=auth).json()
        assert task["priority"] == "H"

    def test_rejects_an_unknown_key(self, client, registered):
        r = client.post(
            "/inbox",
            json={"description": "x"},
            headers={"Authorization": "Bearer not-a-real-key"},
        )
        assert r.status_code == 401

    def test_an_unauthenticated_request_is_401_not_422(self, client, registered):
        """Changed by the unification: a missing credential used to be a 422, because the
        header was a route parameter rather than a guard. Unauthenticated is 401."""
        assert client.post("/inbox", json={"description": "x"}).status_code == 401

    def test_it_now_accepts_the_x_api_key_header_that_every_other_route_takes(
        self, client, registered
    ):
        """The defect this pinned is fixed. README always claimed X-Api-Key worked on every
        endpoint; this was the one that did not."""
        r = client.post(
            "/inbox",
            json={"description": "x"},
            headers={"X-Api-Key": registered["api_key"]},
        )
        assert r.status_code == 201

    def test_it_now_accepts_a_jwt_like_every_other_route(self, client, auth):
        r = client.post("/inbox", json={"description": "x"}, headers=auth)
        assert r.status_code == 201

    def test_the_bearer_api_key_shim_still_works_everywhere(self, client, registered):
        """SHIM-SEC-006. The shim lives in get_current_user, so it applies to every route,
        not only /inbox — that is what unification means here. When the shim is removed this
        test is deleted with it, which is the signal that the contract step happened."""
        r = client.get("/auth/me", headers={"Authorization": f"Bearer {registered['api_key']}"})
        assert r.status_code == 200
        assert r.json()["username"] == registered["username"]
