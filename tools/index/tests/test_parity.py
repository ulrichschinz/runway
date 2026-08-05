"""CLI and MCP adapters must return the same facts.

`RULE-IDX-004`. Two access paths over one query layer is only worth having if they cannot
disagree. Presentation may differ — the CLI renders for humans, MCP returns JSON — but
every fact, evidence class, revision, freshness value and blind spot must match.

This suite also covers the query layer's own correctness, since both adapters inherit it.
"""

from __future__ import annotations

import io
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "tools" / "index"))

import mcp_server  # noqa: E402
import query  # noqa: E402

TARGET = "backend/app/services/task_runner.py"


@pytest.fixture(scope="module", autouse=True)
def fresh_index():
    subprocess.run(
        [sys.executable, "tools/index/build.py"], cwd=ROOT, check=True, capture_output=True
    )


@pytest.fixture
def graph():
    return query.load()


def via_mcp(tool: str, **arguments) -> dict:
    """Drive the MCP server over its actual JSON-RPC surface, not by calling internals."""
    requests = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": tool, "arguments": arguments},
        },
    ]
    stdin = io.StringIO("\n".join(json.dumps(r) for r in requests) + "\n")
    stdout = io.StringIO()
    mcp_server.serve(stdin=stdin, stdout=stdout)
    responses = [json.loads(line) for line in stdout.getvalue().splitlines()]
    call = next(r for r in responses if r["id"] == 2)
    return json.loads(call["result"]["content"][0]["text"])


class TestProtocol:
    def test_initialize_returns_a_protocol_version_and_server_info(self):
        response = mcp_server.handle(
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
        )
        assert response["result"]["protocolVersion"] == mcp_server.PROTOCOL_VERSION
        assert response["result"]["serverInfo"]["name"] == "runway-index"
        assert "tools" in response["result"]["capabilities"]

    def test_an_initialized_notification_gets_no_response(self):
        assert mcp_server.handle({"jsonrpc": "2.0", "method": "notifications/initialized"}) is None

    def test_an_unknown_method_returns_a_jsonrpc_error(self):
        response = mcp_server.handle({"jsonrpc": "2.0", "id": 9, "method": "nope"})
        assert response["error"]["code"] == -32601

    def test_every_canonical_query_is_exposed_as_a_tool(self):
        names = {t["name"] for t in mcp_server.tool_definitions()}
        assert names == {f"index_{q}" for q in query.QUERIES}

    def test_tools_requiring_a_target_declare_it_required(self):
        for tool in mcp_server.tool_definitions():
            if tool["name"] != "index_violations":
                assert "target" in tool["inputSchema"]["required"]

    def test_a_missing_target_is_an_error_not_a_guess(self):
        response = mcp_server.handle(
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": "index_impact", "arguments": {}},
            }
        )
        assert response["result"]["isError"] is True


class TestFactParity:
    """The same facts, whichever door you come through."""

    @pytest.mark.parametrize("q", ["impact", "flow"])
    def test_file_queries_agree(self, graph, q):
        direct = query.QUERIES[q][0](graph, TARGET)
        remote = via_mcp(f"index_{q}", target=TARGET)
        assert direct["result"] == remote["result"]

    @pytest.mark.parametrize("term", ["task_runner", "create_task"])
    def test_symbol_queries_agree(self, graph, term):
        assert query.locate(graph, term)["result"] == via_mcp("index_locate", target=term)["result"]

    def test_violations_agree(self, graph):
        assert query.unit_violations(graph)["result"] == via_mcp("index_violations")["result"]

    def test_the_envelope_agrees_on_evidence_revision_and_freshness(self, graph):
        direct = query.impact(graph, TARGET)
        remote = via_mcp("index_impact", target=TARGET)
        for field in ("index_revision", "schema_version", "coverage", "freshness"):
            assert direct[field] == remote[field], f"{field} differs between adapters"

    def test_blind_spots_agree(self, graph):
        direct = query.impact(graph, TARGET)
        remote = via_mcp("index_impact", target=TARGET)
        assert {b["id"] for b in direct["blind_spots"]} == {b["id"] for b in remote["blind_spots"]}


class TestAnswersCarryTheirUncertainty:
    def test_every_answer_reports_revision_freshness_and_coverage(self, graph):
        answer = query.impact(graph, TARGET)
        assert answer["repository_revision"]
        assert answer["index_revision"]
        assert answer["freshness"]["status"] in ("current", "STALE")
        assert answer["coverage"]["files"] > 0

    def test_an_impact_answer_surfaces_the_taskwarrior_blind_spot(self, graph):
        answer = query.impact(graph, TARGET)
        assert "BLIND-TASK-001" in {b["id"] for b in answer["blind_spots"]}

    def test_an_answer_reporting_unprotected_files_declares_why(self, graph):
        answer = query.impact(graph, TARGET)
        if answer["result"]["files_without_import_derived_test_protection"]:
            assert "BLIND-TEST-001" in {b["id"] for b in answer["blind_spots"]}

    def test_similarity_results_are_labelled_and_never_authoritative(self, graph):
        answer = query.similar(graph, "context tag")
        for candidate in answer["result"]["candidates"]:
            assert candidate["match_evidence"] == "SEMANTIC_MATCH"
            assert "never an authoritative" in candidate["caveat"]


class TestQueryCorrectness:
    def test_impact_finds_both_real_dependents(self, graph):
        direct = query.impact(graph, TARGET)["result"]["direct_dependents"]
        assert "backend/app/services/task_service.py" in direct
        assert "backend/app/routers/gtd.py" in direct

    def test_impact_reports_the_mcp_tools_that_would_break(self, graph):
        surfaces = query.impact(graph, TARGET)["result"]["connected_public_surfaces"]
        tools = {t for s in surfaces for t in s["mcp_tools"]}
        assert {"create_task", "list_tasks", "complete_task"} <= tools

    def test_locate_reports_the_owning_unit(self, graph):
        matches = query.locate(graph, "task_runner")["result"]["matches"]
        files = [m for m in matches if m["kind"] == "file"]
        assert files and files[0]["unit"] == "be/adapters/task"

    def test_flow_finds_a_path_from_a_route_to_the_adapter(self, graph):
        answer = query.flow(graph, TARGET)["result"]
        assert answer["path_count"] > 0
        assert any("tasks" in p["handler"] for p in answer["paths"])

    def test_violations_reports_the_known_layering_breach(self, graph):
        found = query.unit_violations(graph)["result"]["forbidden_unit_dependencies"]
        pairs = {(v["from"], v["to"]) for v in found}
        assert ("be/routers", "be/adapters/task") in pairs, (
            "the known gtd -> task_runner breach is not reported"
        )

    def test_a_violation_carries_the_evidence_that_proves_it(self, graph):
        found = query.unit_violations(graph)["result"]["forbidden_unit_dependencies"]
        breach = next(
            v for v in found if (v["from"], v["to"]) == ("be/routers", "be/adapters/task")
        )
        assert any(e["file"] == "backend/app/routers/gtd.py" for e in breach["evidence"])

    def test_an_unknown_target_is_an_error_not_an_empty_success(self, graph):
        answer = query.impact(graph, "backend/app/does_not_exist.py")
        assert "error" in answer["result"]
