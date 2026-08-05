"""The Index Qualification Gate.

Installation is not proof of compliance. This suite is what decides whether the index may
be trusted, and `index/manifest.toml` records the same claims in a checked-in form.

Two kinds of assertion:

* **graph-level** — facts about the real, freshly built index;
* **extractor-level** — synthetic inputs in a temp directory, used where asserting on the
  real graph would require polluting the repository with fixture files.

A qualification failure means the index is lying, which is worse than having no index.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tomllib
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "tools" / "index"))

import extract_frontend  # noqa: E402
import extract_python  # noqa: E402
from model import EVIDENCE_CLASSES, Graph  # noqa: E402


@pytest.fixture(scope="module")
def graph(tmp_path_factory) -> dict:
    """A freshly built index, so the suite never grades a stale artefact.

    Built into a scratch directory rather than over `index/`: a check that mutates the
    thing another check inspects can silently repair a fault instead of reporting it.
    """
    out = tmp_path_factory.mktemp("qualification-index")
    subprocess.run(
        [sys.executable, "tools/index/build.py", "--out", str(out)],
        cwd=ROOT,
        check=True,
        capture_output=True,
    )
    rows = [json.loads(line) for line in (out / "graph.jsonl").read_text().splitlines()]
    return {
        "nodes": {r["id"]: r for r in rows if r["type"] == "node"},
        "edges": [r for r in rows if r["type"] == "edge"],
        "blind_spots": [r for r in rows if r["type"] == "blind_spot"],
    }


@pytest.fixture(scope="module")
def architecture() -> dict:
    with open(ROOT / "architecture.toml", "rb") as fh:
        return tomllib.load(fh)


@pytest.fixture(scope="module")
def manifest() -> dict:
    with open(ROOT / "index" / "manifest.toml", "rb") as fh:
        return tomllib.load(fh)


def tracked(pattern: str) -> list[str]:
    out = subprocess.run(
        ["git", "ls-files", pattern], cwd=ROOT, capture_output=True, text=True, check=True
    )
    return [line for line in out.stdout.splitlines() if line]


# --- coverage ----------------------------------------------------------------


class TestCoverage:
    """Required languages, mechanisms, surfaces and processes are actually covered."""

    @pytest.mark.parametrize("pattern", ["backend/app/*.py", "backend/app/**/*.py"])
    def test_every_backend_source_file_is_indexed(self, graph, pattern):
        for rel in tracked(pattern):
            assert f"file:{rel}" in graph["nodes"], f"{rel} is missing from the index"

    @pytest.mark.parametrize("pattern", ["frontend/src/**/*.js", "frontend/src/**/*.vue"])
    def test_every_frontend_source_file_is_indexed(self, graph, pattern):
        for rel in tracked(pattern):
            assert f"file:{rel}" in graph["nodes"], f"{rel} is missing from the index"

    def test_vue_files_are_covered_which_is_why_scip_was_rejected(self, graph):
        vue = [
            n for n in graph["nodes"].values() if n["kind"] == "file" and n["name"].endswith(".vue")
        ]
        assert len(vue) >= 18, "Vue SFC coverage regressed — see ADR 0008"
        with_edges = {e["src"] for e in graph["edges"] if e["kind"] == "IMPORTS"}
        assert any(n["id"] in with_edges for n in vue), "no .vue file produced an import edge"

    def test_every_declared_unit_exists_in_the_graph(self, graph, architecture):
        for unit in architecture["units"]:
            assert f"unit:{unit['id']}" in graph["nodes"]

    def test_every_source_file_has_an_owning_unit(self, graph):
        unowned = [
            n["name"]
            for n in graph["nodes"].values()
            if n["kind"] == "file" and not n["attrs"].get("unit")
        ]
        assert unowned == [], f"files with no owning unit: {unowned}"

    def test_the_process_topology_is_present(self, graph):
        for name in ("uvicorn", "nginx", "task"):
            assert f"process:{name}" in graph["nodes"]

    def test_public_surfaces_are_covered(self, graph):
        rest = [
            n
            for n in graph["nodes"].values()
            if n["kind"] == "route" and n["attrs"].get("surface") != "spa"
        ]
        spa = [
            n
            for n in graph["nodes"].values()
            if n["kind"] == "route" and n["attrs"].get("surface") == "spa"
        ]
        tools = [n for n in graph["nodes"].values() if n["kind"] == "mcp_tool"]
        assert len(rest) >= 30, "REST surface coverage regressed"
        assert len(spa) >= 9, "SPA route coverage regressed"
        assert len(tools) == len(rest), "every REST route should derive exactly one MCP tool"


# --- direction ---------------------------------------------------------------


class TestDirectionIsPreserved:
    """A directed graph that loses direction is worse than no graph: it inverts blame."""

    def test_a_known_import_points_from_importer_to_imported(self, graph):
        # The router imports the service; the service never imports the router. This pair
        # replaced gtd -> task_runner, which was the known edge until Step 8 removed it as
        # a boundary violation — a fixture that depends on a defect expires when it is fixed.
        edges = [
            e
            for e in graph["edges"]
            if e["kind"] == "IMPORTS"
            and e["src"] == "file:backend/app/routers/tasks.py"
            and e["dst"] == "file:backend/app/services/task_service.py"
        ]
        assert len(edges) == 1, "the known tasks -> task_service import is missing or duplicated"
        reverse = [
            e
            for e in graph["edges"]
            if e["kind"] == "IMPORTS"
            and e["src"] == "file:backend/app/services/task_service.py"
            and e["dst"] == "file:backend/app/routers/tasks.py"
        ]
        assert reverse == [], "direction inverted: the service does not import the router"

    def test_owns_always_points_from_unit_to_file(self, graph):
        for edge in graph["edges"]:
            if edge["kind"] == "OWNS":
                assert edge["src"].startswith("unit:")
                assert edge["dst"].startswith("file:")

    def test_exposes_always_points_from_route_to_symbol(self, graph):
        for edge in graph["edges"]:
            if edge["kind"] == "EXPOSES":
                assert edge["src"].startswith("route:")
                assert edge["dst"].startswith("symbol:")


# --- evidence ----------------------------------------------------------------


class TestEvidence:
    def test_every_node_and_edge_carries_a_declared_evidence_class(self, graph):
        for node in graph["nodes"].values():
            assert node["evidence"] in EVIDENCE_CLASSES, node
        for edge in graph["edges"]:
            assert edge["evidence"] in EVIDENCE_CLASSES, edge

    def test_static_code_edges_carry_a_source_location(self, graph):
        for edge in graph["edges"]:
            if (
                edge["kind"] in ("IMPORTS", "DEFINES", "CALLS")
                and edge["evidence"] == "STATIC_CONFIRMED"
            ):
                assert edge.get("file"), f"no file on {edge}"
                assert edge.get("line"), f"no line on {edge}"

    def test_a_known_edge_has_the_correct_source_location(self, graph):
        edge = next(
            e
            for e in graph["edges"]
            if e["kind"] == "IMPORTS"
            and e["src"] == "file:backend/app/routers/tasks.py"
            and e["dst"] == "file:backend/app/services/task_service.py"
        )
        assert edge["file"] == "backend/app/routers/tasks.py"
        assert isinstance(edge["line"], int) and edge["line"] > 0

    def test_mcp_tools_are_declared_not_parsed(self, graph):
        """The one thing the index must not overclaim.

        MCP tool names come from fastapi-mcp's documented behaviour, not from any parse
        tree. Marking them STATIC_CONFIRMED would assert something nobody verified.
        """
        tools = [n for n in graph["nodes"].values() if n["kind"] == "mcp_tool"]
        assert tools
        for tool in tools:
            assert tool["evidence"] == "CONTRACT_DECLARED"
            assert tool["attrs"]["verified_at_runtime"] is False

    def test_declared_facts_are_not_dressed_up_as_static(self, graph):
        for edge in graph["edges"]:
            if edge["kind"] in ("OWNS", "DERIVES_TOOL", "RUNS"):
                assert edge["evidence"] == "CONTRACT_DECLARED", edge


# --- impact and flow ---------------------------------------------------------


class TestImpactAndFlow:
    def test_the_change_impact_of_the_taskwarrior_adapter_is_complete(self, graph):
        """Who breaks if task_runner changes?

        Exactly one file imports it: the service layer. That is the boundary doing its
        job — routers reach the subprocess only through validation. Until Step 8, gtd.py
        imported it directly, and this assertion listed two dependents.
        """
        target = "file:backend/app/services/task_runner.py"
        dependents = {
            e["src"] for e in graph["edges"] if e["kind"] == "IMPORTS" and e["dst"] == target
        }
        assert dependents == {"file:backend/app/services/task_service.py"}

    def test_an_end_to_end_path_exists_from_a_route_to_the_adapter(self, graph):
        """POST /tasks -> create_task -> task_service -> task_runner."""
        route = next(
            n
            for n in graph["nodes"].values()
            if n["kind"] == "route"
            and n["attrs"].get("path") == ""
            and n["attrs"].get("method") == "POST"
            and "tasks" in n["id"]
        )
        exposed = [
            e["dst"] for e in graph["edges"] if e["kind"] == "EXPOSES" and e["src"] == route["id"]
        ]
        assert exposed, "the route exposes no handler"
        handler_file = graph["nodes"][exposed[0]]["file"]
        assert handler_file == "backend/app/routers/tasks.py"
        imports = {
            e["dst"]
            for e in graph["edges"]
            if e["kind"] == "IMPORTS" and e["src"] == f"file:{handler_file}"
        }
        assert "file:backend/app/services/task_service.py" in imports

    def test_the_answer_can_report_the_blind_spots_relevant_to_it(self, graph):
        relevant = [b for b in graph["blind_spots"] if "task_runner" in " ".join(b["affects"])]
        assert relevant, "an impact query on task_runner must be able to surface BLIND-TASK-001"

    def test_every_declared_unsupported_mechanism_has_a_blind_spot(self, graph, manifest):
        declared = {b["id"] for b in graph["blind_spots"]}
        for item in manifest["unsupported"]["items"]:
            ident = item[item.rindex("(") + 1 : item.rindex(")")]
            assert ident in declared, (
                f"{ident} is listed as unsupported but not declared in the graph"
            )


# --- test protection ---------------------------------------------------------


class TestProtectionReporting:
    def test_a_known_test_is_found_for_a_changed_file(self, graph):
        protected = {e["src"] for e in graph["edges"] if e["kind"] == "TESTED_BY"}
        assert "file:backend/app/models.py" in protected

    def test_protection_is_never_inferred_from_a_file_name(self, graph):
        """`test_auth.py` exists and imports nothing from `auth.py`, so there is no edge.

        This is the assertion that keeps the index honest: a naming convention is not
        evidence, and inventing an edge here would make every "is this tested?" answer
        untrustworthy.
        """
        edges = [
            e
            for e in graph["edges"]
            if e["kind"] == "TESTED_BY"
            and e["src"] == "file:backend/app/auth.py"
            and "test_auth" in e["dst"]
        ]
        assert edges == [], "protection was inferred from a matching file name"

    def test_missing_protection_is_reported_explicitly(self, graph):
        """Absence of an edge must be a reportable fact, with its limitation declared."""
        protected = {e["src"] for e in graph["edges"] if e["kind"] == "TESTED_BY"}
        app_files = [
            n
            for n in graph["nodes"].values()
            if n["kind"] == "file"
            and n["name"].startswith("backend/app/")
            and n["name"].endswith(".py")
        ]
        unprotected = [n["name"] for n in app_files if n["id"] not in protected]
        assert unprotected, "expected import-derived protection to be incomplete"

        declared = {b["id"] for b in graph["blind_spots"]}
        assert "BLIND-TEST-001" in declared, (
            "the index reports files as having no test protection, so it MUST also declare "
            "that protection is import-derived and that HTTP-tested code produces no edge"
        )


# --- extractor-level: unsupported mechanisms surface as UNKNOWN ---------------


class TestUnsupportedMechanismsAreNotInvented:
    """The negative fixtures ADR 0008 promised.

    These run the extractors over synthetic inputs so the repository is not polluted with
    fixture files that would then appear in the real graph.
    """

    def test_a_dynamic_import_is_unknown_not_resolved(self, tmp_path):
        src = tmp_path / "frontend" / "src"
        src.mkdir(parents=True)
        (src / "a.js").write_text("const m = await import('./b.js')\n")
        (src / "b.js").write_text("export const x = 1\n")

        graph = Graph()
        extract_frontend.extract(graph, tmp_path, [src / "a.js"], tracked={"frontend/src/b.js"})

        dynamic = [e for e in graph.edges if e.kind == "IMPORTS" and e.evidence == "UNKNOWN"]
        assert dynamic, "a dynamic import() must produce an UNKNOWN edge"
        assert "dynamic" in dynamic[0].attrs["reason"]

        resolved = [e for e in graph.edges if e.evidence == "STATIC_CONFIRMED"]
        assert resolved == [], "a dynamic import must NOT be resolved into a confirmed edge"

    def test_a_template_only_component_produces_no_invented_edge(self, tmp_path):
        src = tmp_path / "frontend" / "src"
        src.mkdir(parents=True)
        # Used in the template, never imported. The scanner cannot see it — and must not
        # pretend it can.
        (src / "Parent.vue").write_text("<template><Child /></template>\n<script setup></script>\n")
        (src / "Child.vue").write_text("<template><p>hi</p></template>\n")

        graph = Graph()
        extract_frontend.extract(
            graph, tmp_path, [src / "Parent.vue"], tracked={"frontend/src/Child.vue"}
        )

        assert graph.edges == [], "an edge was invented for a component that is never imported"
        assert any(b.id == "BLIND-FE-001" for b in graph.blind_spots)

    def test_an_unparseable_python_file_yields_no_facts(self, tmp_path):
        backend = tmp_path / "backend" / "app"
        backend.mkdir(parents=True)
        broken = backend / "broken.py"
        broken.write_text("def oops(:\n")

        graph = Graph()
        extract_python.extract(graph, tmp_path, [broken])

        assert graph.nodes == {}, "facts were emitted from a file that could not be parsed"
