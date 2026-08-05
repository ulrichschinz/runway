"""The canonical query layer.

**One implementation, two adapters.** `cli.py` and `mcp_server.py` both call these
functions and neither adds logic of its own. That is what makes fact-level parity
achievable rather than aspirational: there is nothing for the two surfaces to disagree
about, and `RULE-IDX-004` proves it on every run.

Every answer is wrapped by `envelope()`, which attaches the repository revision, the index
revision, freshness, active coverage and — crucially — **the blind spots relevant to the
answer**. An answer that silently omitted its own uncertainty would be worse than no
answer, because it would be trusted.
"""

from __future__ import annotations

import json
import subprocess
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
INDEX_DIR = ROOT / "index"


class IndexUnavailable(RuntimeError):
    """The index has not been built, or is stale enough that answering would mislead."""


# --- loading ------------------------------------------------------------------


def load() -> dict[str, Any]:
    graph_path = INDEX_DIR / "graph.jsonl"
    state_path = INDEX_DIR / "state.json"
    if not graph_path.exists() or not state_path.exists():
        raise IndexUnavailable("the index has not been built — run `make index`")

    rows = [json.loads(line) for line in graph_path.read_text(encoding="utf-8").splitlines()]
    nodes = {r["id"]: r for r in rows if r["type"] == "node"}
    edges = [r for r in rows if r["type"] == "edge"]

    out_edges: dict[str, list[dict]] = defaultdict(list)
    in_edges: dict[str, list[dict]] = defaultdict(list)
    for edge in edges:
        out_edges[edge["src"]].append(edge)
        in_edges[edge["dst"]].append(edge)

    return {
        "nodes": nodes,
        "edges": edges,
        "out": out_edges,
        "in": in_edges,
        "blind_spots": [r for r in rows if r["type"] == "blind_spot"],
        "state": json.loads(state_path.read_text(encoding="utf-8")),
    }


def _current_revision() -> str:
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def _sources_hash() -> str:
    import sources_hash as sh

    return sh.sources_hash()


def freshness(graph: dict[str, Any]) -> dict[str, Any]:
    """Whether the index still describes the working tree."""
    recorded = graph["state"]["sources_sha256"]
    current = _sources_hash()
    return {
        "status": "current" if recorded == current else "STALE",
        "index_sources_sha256": recorded,
        "working_tree_sources_sha256": current,
        "note": (
            None
            if recorded == current
            else "sources have changed since the index was built; run `make fix` or `make index`"
        ),
    }


# --- the answer envelope ------------------------------------------------------


def envelope(
    graph: dict[str, Any], query: str, result: Any, blind_spot_ids: set[str]
) -> dict[str, Any]:
    """Wrap a result with everything a consumer needs to judge how far to trust it."""
    relevant = [b for b in graph["blind_spots"] if b["id"] in blind_spot_ids]
    fresh = freshness(graph)
    return {
        "query": query,
        "result": result,
        "repository_revision": _current_revision(),
        "index_revision": graph["state"]["repository_revision"],
        "schema_version": graph["state"]["schema_version"],
        "freshness": fresh,
        "coverage": {
            "files": graph["state"]["file_count"],
            "nodes": graph["state"]["node_count"],
            "edges": graph["state"]["edge_count"],
        },
        "blind_spots": relevant,
        "uncertainty": (
            "This answer is derived from a STALE index and may be wrong."
            if fresh["status"] == "STALE"
            else None
        ),
    }


def _spots_for(graph: dict[str, Any], *keywords: str) -> set[str]:
    """Blind spots whose declared scope touches any of these keywords."""
    hits = set()
    for spot in graph["blind_spots"]:
        haystack = " ".join([spot["area"], spot["statement"], *spot["affects"]]).lower()
        if any(k.lower() in haystack for k in keywords if k):
            hits.add(spot["id"])
    return hits


# --- canonical queries --------------------------------------------------------


def locate(graph: dict[str, Any], term: str) -> dict[str, Any]:
    """Where is X, and which unit owns it?"""
    term_l = term.lower()
    matches = []
    for node in graph["nodes"].values():
        if node["kind"] == "unit":
            continue
        if term_l in node["name"].lower() or term_l in node["id"].lower():
            owner = (
                node["attrs"].get("unit")
                if node["kind"] == "file"
                else _owner_of_file(graph, node.get("file"))
            )
            matches.append(
                {
                    "id": node["id"],
                    "kind": node["kind"],
                    "name": node["name"],
                    "file": node.get("file"),
                    "line": node.get("line"),
                    "unit": owner,
                    "evidence": node["evidence"],
                }
            )
    matches.sort(key=lambda m: (m["kind"], m["name"]))
    result = {"matches": matches, "match_count": len(matches)}
    return envelope(
        graph, f"locate {term}", result, _spots_for(graph, term, "vue" if ".vue" in term else "")
    )


def _owner_of_file(graph: dict[str, Any], rel: str | None) -> str | None:
    if not rel:
        return None
    node = graph["nodes"].get(f"file:{rel}")
    return node["attrs"].get("unit") if node else None


def governed_by(graph: dict[str, Any], rel: str) -> list[dict[str, Any]]:
    """Which decision records govern this file?"""
    out = []
    for edge in graph["out"].get(f"file:{rel}", []):
        if edge["kind"] == "GOVERNED_BY":
            adr = graph["nodes"].get(edge["dst"], {})
            out.append(
                {
                    "id": edge["dst"],
                    "title": adr.get("name"),
                    "file": adr.get("file"),
                    "line": edge.get("line"),
                }
            )
    return out


def impact(graph: dict[str, Any], rel: str, depth: int = 3) -> dict[str, Any]:
    """What breaks if this changes, and what surfaces does it touch?"""
    node_id = f"file:{rel}"
    if node_id not in graph["nodes"]:
        return envelope(graph, f"impact {rel}", {"error": f"{rel} is not in the index"}, set())

    # Transitive dependents, breadth-first, with the distance at which each was reached.
    dependents: dict[str, int] = {}
    frontier = [node_id]
    for level in range(1, depth + 1):
        nxt = []
        for current in frontier:
            for edge in graph["in"].get(current, []):
                if edge["kind"] != "IMPORTS":
                    continue
                if edge["src"] not in dependents and edge["src"] != node_id:
                    dependents[edge["src"]] = level
                    nxt.append(edge["src"])
        frontier = nxt
        if not frontier:
            break

    touched_files = {node_id, *dependents}

    surfaces = []
    for edge in graph["edges"]:
        if edge["kind"] != "EXPOSES":
            continue
        handler = graph["nodes"].get(edge["dst"], {})
        if f"file:{handler.get('file')}" in touched_files:
            route = graph["nodes"][edge["src"]]
            tools = [
                e["dst"] for e in graph["out"].get(route["id"], []) if e["kind"] == "DERIVES_TOOL"
            ]
            surfaces.append(
                {
                    "route": route["name"],
                    "file": route.get("file"),
                    "mcp_tools": [graph["nodes"][t]["name"] for t in tools],
                    "evidence": route["evidence"],
                }
            )

    tests = []
    for target in sorted(touched_files):
        for edge in graph["out"].get(target, []):
            if edge["kind"] == "TESTED_BY":
                tests.append(
                    {
                        "protects": target.removeprefix("file:"),
                        "test": edge["dst"].removeprefix("test:"),
                    }
                )

    unprotected = sorted(
        t.removeprefix("file:")
        for t in touched_files
        if not any(e["kind"] == "TESTED_BY" for e in graph["out"].get(t, []))
    )

    result = {
        "target": rel,
        "unit": _owner_of_file(graph, rel),
        "governed_by": governed_by(graph, rel),
        "direct_dependents": sorted(
            d.removeprefix("file:") for d, lvl in dependents.items() if lvl == 1
        ),
        "transitive_dependents": sorted(
            d.removeprefix("file:") for d, lvl in dependents.items() if lvl > 1
        ),
        "connected_public_surfaces": sorted(surfaces, key=lambda s: s["route"]),
        "protecting_tests": tests,
        "files_without_import_derived_test_protection": unprotected,
    }
    spots = _spots_for(
        graph, "tested_by" if unprotected else "", rel.rsplit("/", 1)[-1].removesuffix(".py")
    )
    if surfaces:
        spots |= _spots_for(graph, "mcp_tool")
    if rel.endswith(".vue") or rel.endswith(".js"):
        spots |= _spots_for(graph, "imports")
    return envelope(graph, f"impact {rel}", result, spots)


def flow(graph: dict[str, Any], rel: str) -> dict[str, Any]:
    """The end-to-end path from a public surface down to this file."""
    node_id = f"file:{rel}"
    paths = []
    for edge in graph["edges"]:
        if edge["kind"] != "EXPOSES":
            continue
        route = graph["nodes"][edge["src"]]
        handler = graph["nodes"][edge["dst"]]
        chain = _reaches(graph, f"file:{handler.get('file')}", node_id, set())
        if chain is not None:
            paths.append(
                {
                    "entry": route["name"],
                    "handler": handler["name"],
                    "path": [route["name"], handler["name"]]
                    + [c.removeprefix("file:") for c in chain],
                    "evidence": [route["evidence"], "STATIC_CONFIRMED"],
                }
            )
    result = {
        "target": rel,
        "paths": sorted(paths, key=lambda p: p["entry"]),
        "path_count": len(paths),
    }
    return envelope(graph, f"flow {rel}", result, _spots_for(graph, "task", "mcp_tool"))


def _reaches(graph: dict[str, Any], start: str, goal: str, seen: set[str]) -> list[str] | None:
    if start == goal:
        return [start]
    if start in seen:
        return None
    seen.add(start)
    for edge in graph["out"].get(start, []):
        if edge["kind"] != "IMPORTS":
            continue
        rest = _reaches(graph, edge["dst"], goal, seen)
        if rest is not None:
            return [start, *rest] if start != goal else rest
    return None


def similar(graph: dict[str, Any], term: str, limit: int = 10) -> dict[str, Any]:
    """Where do we already solve something like this?

    Lexical, and labelled SEMANTIC_MATCH so nobody mistakes it for an authoritative edge.
    The corpus includes the repository's own documentation, so "what was decided about X"
    and "how do I verify X here" are answerable and return the governing text with its
    location — the answer cites the normative document, it never replaces it.
    """
    words = [w for w in term.lower().replace("_", " ").replace("-", " ").split() if len(w) > 2]
    scored = []
    for node in graph["nodes"].values():
        haystack = f"{node['name']} {node.get('file') or ''}".lower()
        score = sum(1 for w in words if w in haystack)
        if score:
            scored.append((score, node))
    scored.sort(key=lambda pair: (-pair[0], pair[1]["name"]))
    result = {
        "candidates": [
            {
                "id": n["id"],
                "kind": n["kind"],
                "name": n["name"],
                "file": n.get("file"),
                "line": n.get("line"),
                "match_evidence": "SEMANTIC_MATCH",
                "caveat": "a lexical suggestion, never an authoritative relationship",
            }
            for _, n in scored[:limit]
        ],
        "corpus": "code symbols, files, ADRs, rules and routes",
    }
    return envelope(graph, f"similar {term}", result, set())


def unit_violations(graph: dict[str, Any]) -> dict[str, Any]:
    """Unit dependencies the index observed that architecture.toml does not allow.

    Descriptive reporting only — Step 8 turns this into an enforced gate. An edge that
    exists never legitimises one the contract forbids; this is precisely where the two
    disagree.
    """
    import tomllib

    with open(ROOT / "architecture.toml", "rb") as fh:
        arch = tomllib.load(fh)
    allowed = {rule["from"]: set(rule["to"]) for rule in arch["allowed_edges"]}

    violations = []
    for edge in graph["edges"]:
        if edge["kind"] != "DEPENDS_ON":
            continue
        src = edge["src"].removeprefix("unit:")
        dst = edge["dst"].removeprefix("unit:")
        if dst not in allowed.get(src, set()):
            evidence = [
                {"file": e["file"], "line": e["line"]}
                for e in graph["edges"]
                if e["kind"] == "IMPORTS"
                and graph["nodes"].get(e["src"], {}).get("attrs", {}).get("unit") == src
                and graph["nodes"].get(e["dst"], {}).get("attrs", {}).get("unit") == dst
            ]
            violations.append({"from": src, "to": dst, "evidence": evidence})

    cycles = [
        {"between": sorted([c["between"][0], c["between"][1]]), "id": c["id"]}
        for c in arch.get("known_cycles", [])
    ]
    result = {
        "forbidden_unit_dependencies": sorted(violations, key=lambda v: (v["from"], v["to"])),
        "declared_cycles": cycles,
        "note": "descriptive; architecture.toml is normative and Step 8 enforces it",
    }
    return envelope(graph, "violations", result, set())


QUERIES = {
    "locate": (locate, "where a symbol or file is, and which unit owns it"),
    "impact": (impact, "what breaks if this file changes, and which surfaces it touches"),
    "flow": (flow, "the end-to-end path from a public surface to this file"),
    "similar": (similar, "where something like this is already solved"),
    "violations": (unit_violations, "unit dependencies architecture.toml does not allow"),
}
