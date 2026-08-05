"""The canonical graph model: node and edge shapes, and the evidence classes.

This module is the schema in executable form. `index/schema.md` documents it for humans;
the two must agree, and `SCHEMA_VERSION` is what a consumer pins against.

Every fact carries an evidence class. Nothing is asserted without one, and a heuristic is
never promoted to a confirmed fact — the whole point of the classification is that a
consumer can tell the difference between "the parser saw this import" and "these two
things look similar".
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

SCHEMA_VERSION = "1.0.0"

# --- evidence classes --------------------------------------------------------

STATIC_CONFIRMED = "STATIC_CONFIRMED"
"""Read from a real parse tree — a Python `import`, an ESM `import`, a definition."""

CONFIG_CONFIRMED = "CONFIG_CONFIRMED"
"""Read from a framework construct: a FastAPI decorator, `Depends()`, a route table."""

CONTRACT_DECLARED = "CONTRACT_DECLARED"
"""Asserted by a checked-in declaration: architecture.toml, the Rule Ledger."""

RUNTIME_OBSERVED = "RUNTIME_OBSERVED"
"""Seen while actually running. Proves presence, never absence."""

SEMANTIC_MATCH = "SEMANTIC_MATCH"
"""Lexical or similarity match. May suggest a candidate; never an authoritative edge."""

UNKNOWN = "UNKNOWN"
"""A relationship the extractors cannot resolve. Reported, never guessed."""

EVIDENCE_CLASSES = (
    STATIC_CONFIRMED,
    CONFIG_CONFIRMED,
    CONTRACT_DECLARED,
    RUNTIME_OBSERVED,
    SEMANTIC_MATCH,
    UNKNOWN,
)

# --- node and edge kinds -----------------------------------------------------

NODE_KINDS = (
    "file",
    "symbol",
    "unit",
    "route",
    "mcp_tool",
    "test",
    "adr",
    "rule",
    "doc",
    "public_surface",
    "process",
)

EDGE_KINDS = (
    "IMPORTS",  # file -> file
    "DEFINES",  # file -> symbol
    "CALLS",  # symbol -> symbol
    "INJECTS",  # symbol -> symbol   (FastAPI Depends)
    "EXPOSES",  # route -> symbol
    "DERIVES_TOOL",  # route -> mcp_tool
    "TESTED_BY",  # symbol|file -> test
    "OWNS",  # unit -> file
    "GOVERNED_BY",  # file -> adr
    "DEPENDS_ON",  # unit -> unit  (aggregated from IMPORTS)
    "RUNS",  # process -> file
)


@dataclass
class Node:
    id: str
    kind: str
    name: str
    evidence: str
    file: str | None = None
    line: int | None = None
    attrs: dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> dict[str, Any]:
        assert self.kind in NODE_KINDS, f"unknown node kind {self.kind!r}"
        assert self.evidence in EVIDENCE_CLASSES, f"unknown evidence {self.evidence!r}"
        out: dict[str, Any] = {
            "type": "node",
            "id": self.id,
            "kind": self.kind,
            "name": self.name,
            "evidence": self.evidence,
        }
        if self.file:
            out["file"] = self.file
        if self.line is not None:
            out["line"] = self.line
        if self.attrs:
            out["attrs"] = self.attrs
        return out


@dataclass
class Edge:
    kind: str
    src: str
    dst: str
    evidence: str
    file: str | None = None
    line: int | None = None
    attrs: dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> dict[str, Any]:
        assert self.kind in EDGE_KINDS, f"unknown edge kind {self.kind!r}"
        assert self.evidence in EVIDENCE_CLASSES, f"unknown evidence {self.evidence!r}"
        out: dict[str, Any] = {
            "type": "edge",
            "kind": self.kind,
            "src": self.src,
            "dst": self.dst,
            "evidence": self.evidence,
        }
        if self.file:
            out["file"] = self.file
        if self.line is not None:
            out["line"] = self.line
        if self.attrs:
            out["attrs"] = self.attrs
        return out


@dataclass
class BlindSpot:
    """Something the extractors knowingly cannot see.

    Declared up front rather than discovered by a consumer. Any answer touching an area
    covered by a blind spot must report it.
    """

    id: str
    area: str
    statement: str
    affects: list[str]

    def to_json(self) -> dict[str, Any]:
        return {
            "type": "blind_spot",
            "id": self.id,
            "area": self.area,
            "statement": self.statement,
            "affects": self.affects,
        }


class Graph:
    """An accumulating set of nodes, edges and blind spots.

    Ordering is deterministic on write, so a rebuild of unchanged sources produces a
    byte-identical export.
    """

    def __init__(self) -> None:
        self.nodes: dict[str, Node] = {}
        self.edges: list[Edge] = []
        self.blind_spots: list[BlindSpot] = []

    def add_node(self, node: Node) -> str:
        existing = self.nodes.get(node.id)
        if existing is None:
            self.nodes[node.id] = node
        elif existing.attrs != node.attrs and node.attrs:
            existing.attrs.update(node.attrs)
        return node.id

    def add_edge(self, edge: Edge) -> None:
        self.edges.append(edge)

    def add_blind_spot(self, spot: BlindSpot) -> None:
        self.blind_spots.append(spot)

    def to_jsonl(self) -> str:
        lines = [
            json.dumps(n.to_json(), sort_keys=True)
            for n in sorted(self.nodes.values(), key=lambda n: n.id)
        ]
        lines += [
            json.dumps(e.to_json(), sort_keys=True)
            for e in sorted(
                self.edges, key=lambda e: (e.kind, e.src, e.dst, e.file or "", e.line or 0)
            )
        ]
        lines += [
            json.dumps(b.to_json(), sort_keys=True)
            for b in sorted(self.blind_spots, key=lambda b: b.id)
        ]
        return "\n".join(lines) + "\n"
