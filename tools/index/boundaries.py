"""Structural enforcement over the canonical graph.

The index is descriptive: it reports the dependencies that exist. `architecture.toml` is
normative: it states which are allowed. This module is where the two are compared, and it
is the only place in the repository permitted to turn a graph fact into a gate failure.

Three checks, each guarding a different kind of decay:

* **forbidden edges** — a dependency the contract does not permit;
* **cycles** — a new cycle between units always fails; declared ones are inventoried under
  a ratchet that may only shrink;
* **hubs** — fan-in concentration measured against a checked-in baseline, so a module
  quietly becoming the thing everything depends on is visible before it is irreversible.

A single high centrality value is never a failure by itself. A new cycle always is.
"""

from __future__ import annotations

import sys
import tomllib
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import query  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "ops" / "structure-baseline.toml"


def load_architecture() -> dict:
    with open(ROOT / "architecture.toml", "rb") as fh:
        return tomllib.load(fh)


def load_baseline() -> dict:
    if not BASELINE.exists():
        return {"hubs": {}, "allowlist": []}
    with open(BASELINE, "rb") as fh:
        return tomllib.load(fh)


# --- forbidden edges ----------------------------------------------------------


def forbidden_edges(graph: dict, arch: dict) -> list[dict]:
    allowed = {rule["from"]: set(rule["to"]) for rule in arch["allowed_edges"]}
    unit_of = {
        n["id"]: n["attrs"].get("unit") for n in graph["nodes"].values() if n["kind"] == "file"
    }

    out = []
    for edge in graph["edges"]:
        if edge["kind"] != "DEPENDS_ON":
            continue
        src = edge["src"].removeprefix("unit:")
        dst = edge["dst"].removeprefix("unit:")
        if dst in allowed.get(src, set()):
            continue
        evidence = [
            {"file": e["file"], "line": e["line"]}
            for e in graph["edges"]
            if e["kind"] == "IMPORTS"
            and unit_of.get(e["src"]) == src
            and unit_of.get(e["dst"]) == dst
        ]
        out.append({"from": src, "to": dst, "evidence": evidence})
    return sorted(out, key=lambda v: (v["from"], v["to"]))


# --- cycles -------------------------------------------------------------------


def unit_cycles(graph: dict) -> list[tuple[str, ...]]:
    """Every simple cycle in the unit dependency graph, normalised for comparison."""
    adjacency: dict[str, set[str]] = defaultdict(set)
    for edge in graph["edges"]:
        if edge["kind"] == "DEPENDS_ON":
            adjacency[edge["src"].removeprefix("unit:")].add(edge["dst"].removeprefix("unit:"))

    found: set[tuple[str, ...]] = set()

    def walk(node: str, path: list[str]) -> None:
        for nxt in sorted(adjacency.get(node, ())):
            if nxt in path:
                cycle = path[path.index(nxt) :]
                # Normalise: rotate so the alphabetically first member leads, so the same
                # cycle discovered from two entry points compares equal.
                pivot = cycle.index(min(cycle))
                found.add(tuple(cycle[pivot:] + cycle[:pivot]))
            elif len(path) < 8:
                walk(nxt, [*path, nxt])

    for unit in sorted(adjacency):
        walk(unit, [unit])
    return sorted(found)


def declared_cycles(arch: dict) -> set[tuple[str, ...]]:
    out = set()
    for entry in arch.get("known_cycles", []):
        members = entry["between"]
        pivot = members.index(min(members))
        out.add(tuple(members[pivot:] + members[:pivot]))
    return out


# --- hubs ---------------------------------------------------------------------


def fan_in(graph: dict) -> dict[str, int]:
    counts: dict[str, set[str]] = defaultdict(set)
    for edge in graph["edges"]:
        if edge["kind"] == "IMPORTS":
            counts[edge["dst"]].add(edge["src"])
    return {node_id.removeprefix("file:"): len(srcs) for node_id, srcs in counts.items()}


def hub_regressions(graph: dict, baseline: dict) -> list[dict]:
    recorded = baseline.get("hubs", {})
    allowlist = set(baseline.get("allowlist", []))
    default_cap = baseline.get("default_cap", 4)

    out = []
    for path, count in sorted(fan_in(graph).items()):
        if path in allowlist:
            continue
        cap = recorded.get(path, default_cap)
        if count > cap:
            out.append({"file": path, "fan_in": count, "baseline": cap})
    return out


# --- report -------------------------------------------------------------------


def report() -> dict:
    graph = query.load()
    arch = load_architecture()
    baseline = load_baseline()

    observed = set(unit_cycles(graph))
    declared = declared_cycles(arch)

    return {
        "forbidden_edges": forbidden_edges(graph, arch),
        "new_cycles": sorted(observed - declared),
        "declared_cycles_still_present": sorted(observed & declared),
        "declared_cycles_resolved": sorted(declared - observed),
        "hub_regressions": hub_regressions(graph, baseline),
        "fan_in": fan_in(graph),
    }


if __name__ == "__main__":
    import json

    print(json.dumps(report(), indent=2, sort_keys=True, default=list))
