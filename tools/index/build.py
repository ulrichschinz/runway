"""Build the repository knowledge graph.

Every build is a clean build. There is no incremental path, which makes the "incremental
and clean rebuilds are equivalent" requirement true by construction and removes a whole
class of staleness bug (ADR 0008). Re-open trigger: a build taking longer than 10 seconds.

Outputs, both git-ignored because they are derived:
    index/graph.jsonl   the canonical export (see index/schema.md)
    index/state.json    content hashes and revision, used by the freshness check

Checked in: the extractors, index/schema.md, index/manifest.toml, architecture.toml.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tomllib
from fnmatch import fnmatch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import extract_frontend  # noqa: E402
import extract_python  # noqa: E402
from model import (  # noqa: E402
    CONTRACT_DECLARED,
    SCHEMA_VERSION,
    STATIC_CONFIRMED,
    BlindSpot,
    Edge,
    Graph,
    Node,
)
from sources_hash import sources_hash  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "index"

# A structured ADR reference in code, e.g. "See ADR 0004" or "docs/adr/0004-...".
_ADR_REF = re.compile(r"\bADR[ -]?(\d{4})\b")


def tracked_files() -> list[str]:
    out = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout
    return [line for line in out.splitlines() if line]


def load_architecture() -> dict:
    with open(ROOT / "architecture.toml", "rb") as fh:
        return tomllib.load(fh)


def unit_of(path: str, units: list[dict]) -> str | None:
    for unit in units:
        for pattern in unit["paths"]:
            if fnmatch(path, pattern) or (
                pattern.endswith("/**") and path.startswith(pattern[:-3] + "/")
            ):
                return unit["id"]
    return None


def build() -> Graph:
    graph = Graph()
    arch = load_architecture()
    units = arch["units"]
    files = tracked_files()

    # --- files and unit ownership -------------------------------------------
    for rel in files:
        owner = unit_of(rel, units)
        graph.add_node(
            Node(
                id=f"file:{rel}",
                kind="file",
                name=rel,
                evidence=STATIC_CONFIRMED,
                file=rel,
                attrs={"language": _language(rel), "unit": owner},
            )
        )

    for unit in units:
        graph.add_node(
            Node(
                id=f"unit:{unit['id']}",
                kind="unit",
                name=unit["id"],
                evidence=CONTRACT_DECLARED,
                file="architecture.toml",
                attrs={
                    "scope": unit["scope"],
                    "owner": unit["owner"],
                    "layer": unit.get("layer"),
                    "note": unit.get("note"),
                },
            )
        )
    for rel in files:
        owner = unit_of(rel, units)
        if owner:
            graph.add_edge(
                Edge(
                    "OWNS",
                    f"unit:{owner}",
                    f"file:{rel}",
                    CONTRACT_DECLARED,
                    file="architecture.toml",
                )
            )

    # --- code ----------------------------------------------------------------
    py = [ROOT / f for f in files if f.startswith("backend/app/") and f.endswith(".py")]
    extract_python.extract(graph, ROOT, py)

    fe = [ROOT / f for f in files if f.startswith("frontend/src/") and f.endswith((".js", ".vue"))]
    extract_frontend.extract(graph, ROOT, fe, tracked=set(files))

    # --- tests and what they protect ----------------------------------------
    _extract_tests(graph, files)

    # --- decision records and the governance links to them ------------------
    _extract_adrs(graph, files)

    # --- rules ---------------------------------------------------------------
    _extract_rules(graph)

    # --- unit-level dependency edges, aggregated from file imports ----------
    _aggregate_unit_edges(graph, units)

    # --- process topology ----------------------------------------------------
    _extract_processes(graph)

    _declare_global_blind_spots(graph)
    return graph


def _language(rel: str) -> str:
    return {
        ".py": "python",
        ".js": "javascript",
        ".vue": "vue",
        ".yml": "yaml",
        ".yaml": "yaml",
        ".toml": "toml",
        ".md": "markdown",
        ".sh": "shell",
    }.get(Path(rel).suffix, "other")


def _extract_tests(graph: Graph, files: list[str]) -> None:
    """Link tests to what they import.

    Import-derived, therefore STATIC_CONFIRMED. Protection is NEVER inferred from a file
    name: a test called `test_auth.py` is not evidence that it protects `auth.py`. Where
    no import links a test to a symbol, no edge is emitted and the absence is reportable.
    """
    for rel in files:
        if "/tests/" not in rel and not Path(rel).name.startswith("test_"):
            continue
        if not rel.endswith((".py", ".js")):
            continue
        graph.add_node(
            Node(id=f"test:{rel}", kind="test", name=rel, evidence=STATIC_CONFIRMED, file=rel)
        )
        source = (ROOT / rel).read_text(encoding="utf-8", errors="replace")
        for match in re.finditer(r"^\s*from\s+(app[\w.]*)\s+import\s+(.+)$", source, re.MULTILINE):
            module = match.group(1)
            target = f"file:backend/{module.replace('.', '/')}.py"
            if target in graph.nodes:
                graph.add_edge(
                    Edge(
                        "TESTED_BY",
                        target,
                        f"test:{rel}",
                        STATIC_CONFIRMED,
                        file=rel,
                        line=source[: match.start()].count("\n") + 1,
                    )
                )
        for match in re.finditer(r"""from\s+['"](\.\.?/[^'"]+)['"]""", source):
            resolved = (Path(rel).parent / match.group(1)).as_posix()
            resolved = (
                str(Path(resolved).resolve().relative_to(ROOT))
                if Path(resolved).is_absolute()
                else resolved
            )
            candidate = (
                f"file:{Path(rel).parent.joinpath(match.group(1)).as_posix().replace('/./', '/')}"
            )
            if candidate in graph.nodes:
                graph.add_edge(
                    Edge("TESTED_BY", candidate, f"test:{rel}", STATIC_CONFIRMED, file=rel)
                )


def _extract_adrs(graph: Graph, files: list[str]) -> None:
    adrs = {}
    for rel in files:
        if not rel.startswith("docs/adr/") or not rel.endswith(".md"):
            continue
        number = Path(rel).name[:4]
        title = (ROOT / rel).read_text(encoding="utf-8").splitlines()[0].lstrip("# ").strip()
        node_id = f"adr:{number}"
        adrs[number] = node_id
        graph.add_node(
            Node(
                id=node_id,
                kind="adr",
                name=title,
                evidence=CONTRACT_DECLARED,
                file=rel,
                attrs={"number": number},
            )
        )

    # A structured ADR reference in code becomes a GOVERNED_BY edge. A dangling reference
    # is a gate failure in Step 10; here it is recorded as an UNKNOWN-target edge.
    for rel in files:
        if not rel.endswith((".py", ".js", ".vue", ".sh", ".toml")):
            continue
        try:
            source = (ROOT / rel).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for match in _ADR_REF.finditer(source):
            number = match.group(1)
            line = source[: match.start()].count("\n") + 1
            if number in adrs:
                graph.add_edge(
                    Edge(
                        "GOVERNED_BY",
                        f"file:{rel}",
                        adrs[number],
                        STATIC_CONFIRMED,
                        file=rel,
                        line=line,
                    )
                )


def _extract_rules(graph: Graph) -> None:
    ledger = ROOT / "rules" / "ledger.yaml"
    if not ledger.exists():
        return
    text = ledger.read_text(encoding="utf-8")
    for match in re.finditer(r"^\s*-\s+id:\s*(RULE-[A-Z]+-\d+)", text, re.MULTILINE):
        rule_id = match.group(1)
        graph.add_node(
            Node(
                id=f"rule:{rule_id}",
                kind="rule",
                name=rule_id,
                evidence=CONTRACT_DECLARED,
                file="rules/ledger.yaml",
                line=text[: match.start()].count("\n") + 1,
            )
        )


def _aggregate_unit_edges(graph: Graph, units: list[dict]) -> None:
    """Roll file-level imports up to unit-level dependencies.

    Descriptive only: this reports what exists. architecture.toml states what is allowed,
    and Step 8's boundary checker compares the two.
    """
    file_unit = {n.id: n.attrs.get("unit") for n in graph.nodes.values() if n.kind == "file"}
    seen: set[tuple[str, str]] = set()
    for edge in list(graph.edges):
        if edge.kind != "IMPORTS":
            continue
        src_unit, dst_unit = file_unit.get(edge.src), file_unit.get(edge.dst)
        if not src_unit or not dst_unit or src_unit == dst_unit:
            continue
        if (src_unit, dst_unit) in seen:
            continue
        seen.add((src_unit, dst_unit))
        graph.add_edge(
            Edge(
                "DEPENDS_ON",
                f"unit:{src_unit}",
                f"unit:{dst_unit}",
                STATIC_CONFIRMED,
                attrs={"derived_from": "IMPORTS"},
            )
        )


def _extract_processes(graph: Graph) -> None:
    for name, entry, transport in [
        ("uvicorn", "backend/app/main.py", "http:8000 + mcp/sse at /mcp"),
        ("nginx", "frontend/nginx.conf", "http:4000, proxies /api/ to the backend"),
        ("task", None, "subprocess, forked per request by task_runner"),
    ]:
        node_id = f"process:{name}"
        graph.add_node(
            Node(
                id=node_id,
                kind="process",
                name=name,
                evidence=CONTRACT_DECLARED,
                file="docker-compose.yml",
                attrs={"transport": transport},
            )
        )
        if entry and f"file:{entry}" in graph.nodes:
            graph.add_edge(
                Edge("RUNS", node_id, f"file:{entry}", CONTRACT_DECLARED, file="docker-compose.yml")
            )


def _declare_global_blind_spots(graph: Graph) -> None:
    for spot in [
        BlindSpot(
            "BLIND-TASK-001",
            "external binary",
            "Taskwarrior's internal behaviour is opaque to this index. Anything the `task` "
            "binary does — its urgency algorithm, its argument grammar, its storage format — "
            "is known only through the container test tier, never through static analysis.",
            ["change-impact of task_runner", "urgency", "cross-tenant isolation"],
        ),
        BlindSpot(
            "BLIND-MCP-001",
            "framework",
            "MCP tool names are derived by fastapi-mcp from route handler names. That is the "
            "library's documented behaviour, recorded as CONTRACT_DECLARED — not observed. "
            "Step 13 replaces it with RUNTIME_OBSERVED by booting the app and reading the "
            "actual tool list.",
            ["mcp_tool nodes", "public surface S2"],
        ),
        BlindSpot(
            "BLIND-OPS-001",
            "deployment",
            "The deploy host's compose file is not in this repository, so the mapping from "
            "built images to running containers is unknown. See docs/operations.md.",
            ["process topology", "rollback"],
        ),
        BlindSpot(
            "BLIND-NGINX-001",
            "configuration",
            "nginx.conf is templated by envsubst at container start; the effective "
            "configuration is not the checked-in text.",
            ["process topology"],
        ),
    ]:
        graph.add_blind_spot(spot)


def write(graph: Graph, out_dir: Path = DEFAULT_OUT) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "graph.jsonl").write_text(graph.to_jsonl(), encoding="utf-8")

    files = tracked_files()

    revision = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout.strip()

    state = {
        "schema_version": SCHEMA_VERSION,
        "sources_sha256": sources_hash(),
        "repository_revision": revision,
        "file_count": len(files),
        "node_count": len(graph.nodes),
        "edge_count": len(graph.edges),
        "blind_spot_count": len(graph.blind_spots),
    }
    (out_dir / "state.json").write_text(
        json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    return state


if __name__ == "__main__":
    # --out lets the determinism check build into a scratch directory instead of
    # overwriting the real index. A check that mutates state to make another check pass is
    # exactly the kind of thing that hides problems, and this one did before it was fixed.
    out = DEFAULT_OUT
    if len(sys.argv) >= 3 and sys.argv[1] == "--out":
        out = Path(sys.argv[2])
    g = build()
    s = write(g, out)
    print(
        f"index: {s['node_count']} nodes, {s['edge_count']} edges, "
        f"{s['blind_spot_count']} blind spots over {s['file_count']} files "
        f"(schema {s['schema_version']})"
    )
