"""Characterization tests for the agent-facing inbox webhook.

This endpoint carries its own authentication, separate from dependencies.get_current_user
(finding SEC-6). These tests pin what that second path currently accepts.
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

    def test_requires_the_authorization_header(self, client, registered):
        assert client.post("/inbox", json={"description": "x"}).status_code == 422

    def test_does_not_accept_the_x_api_key_header_that_every_other_route_takes(
        self, client, registered
    ):
        """DEFECT, pinned as-is — finding SEC-6 and a documentation drift.

        README states that X-Api-Key is accepted by all API endpoints. This one is not:
        it reads the key out of Authorization: Bearer instead. Step 11 unifies the two
        paths behind get_current_user, keeping the old shape working via a tracked shim.
        """
        r = client.post(
            "/inbox",
            json={"description": "x"},
            headers={"X-Api-Key": registered["api_key"]},
        )
        assert r.status_code == 422

    def test_a_jwt_is_not_accepted_here(self, client, auth):
        """CURRENT behaviour: the inbox looks the token up as an API key only."""
        r = client.post("/inbox", json={"description": "x"}, headers=auth)
        assert r.status_code == 401
