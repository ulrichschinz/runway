"""Frontend extraction: ESM imports from `.js` files and Vue SFC `<script>` blocks.

Why a scanner and not a parser. Every frontend edge in this repository is a static ESM
import — verified in Phase 0 — so a scanner is *exact for the edges that exist*. What it
cannot see is declared as a blind spot rather than guessed at: dynamic `import()`, and
components used only in a template without a corresponding import (which does not occur
here, but would be invisible if it did).

This is the gap that ruled out adopting SCIP: no SCIP indexer parses Vue SFCs, and 18 of
this repository's 29 frontend source files are `.vue`.
"""

from __future__ import annotations

import re
from pathlib import Path

from model import CONFIG_CONFIRMED, STATIC_CONFIRMED, UNKNOWN, BlindSpot, Edge, Graph, Node

# `import x from './y.js'`, `import {a, b} from '../z.vue'`, `import './style.css'`
_IMPORT = re.compile(
    r"""^\s*import\s+(?:[^'"]*?\s+from\s+)?['"](?P<target>[^'"]+)['"]""", re.MULTILINE
)
_DYNAMIC_IMPORT = re.compile(r"""\bimport\s*\(\s*['"](?P<target>[^'"]+)['"]\s*\)""")
_SCRIPT_BLOCK = re.compile(r"<script[^>]*>(?P<body>.*?)</script>", re.DOTALL | re.IGNORECASE)
_DEFINE_STORE = re.compile(r"""defineStore\(\s*['"](?P<name>[^'"]+)['"]""")
_ROUTE = re.compile(r"""\{\s*path:\s*['"](?P<path>[^'"]+)['"]""")


def script_of(path: Path) -> str:
    """The JavaScript in a file: the whole file for `.js`, the `<script>` blocks for `.vue`."""
    text = path.read_text(encoding="utf-8")
    if path.suffix != ".vue":
        return text
    return "\n".join(m.group("body") for m in _SCRIPT_BLOCK.finditer(text))


def extract(graph: Graph, root: Path, files: list[Path], tracked: set[str] | None = None) -> None:
    # Resolve against EVERY tracked file, not just the scanned ones: main.js imports
    # ./style.css, which is a real file and a real edge even though it is not scannable.
    known = tracked if tracked is not None else {str(f.relative_to(root)) for f in files}

    for path in files:
        rel = str(path.relative_to(root))
        source = script_of(path)

        for match in _IMPORT.finditer(source):
            target = match.group("target")
            if not target.startswith("."):
                continue  # a package, not a repository file
            resolved = _resolve(path, target, root, known)
            line = source[: match.start()].count("\n") + 1
            if resolved is None:
                graph.add_edge(
                    Edge(
                        "IMPORTS",
                        f"file:{rel}",
                        f"file:{target}",
                        UNKNOWN,
                        file=rel,
                        line=line,
                        attrs={"reason": "relative import did not resolve to a tracked file"},
                    )
                )
                continue
            graph.add_edge(
                Edge(
                    "IMPORTS",
                    f"file:{rel}",
                    f"file:{resolved}",
                    STATIC_CONFIRMED,
                    file=rel,
                    line=line,
                )
            )

        for match in _DYNAMIC_IMPORT.finditer(source):
            line = source[: match.start()].count("\n") + 1
            graph.add_edge(
                Edge(
                    "IMPORTS",
                    f"file:{rel}",
                    f"file:{match.group('target')}",
                    UNKNOWN,
                    file=rel,
                    line=line,
                    attrs={"reason": "dynamic import(); target not resolved statically"},
                )
            )

        for match in _DEFINE_STORE.finditer(source):
            name = match.group("name")
            line = source[: match.start()].count("\n") + 1
            store_id = f"symbol:store/{name}"
            graph.add_node(
                Node(
                    id=store_id,
                    kind="symbol",
                    name=f"store/{name}",
                    evidence=CONFIG_CONFIRMED,
                    file=rel,
                    line=line,
                    attrs={"symbol_kind": "pinia_store"},
                )
            )
            graph.add_edge(
                Edge("DEFINES", f"file:{rel}", store_id, CONFIG_CONFIRMED, file=rel, line=line)
            )

        if rel.endswith("router/index.js"):
            for match in _ROUTE.finditer(source):
                spa_path = match.group("path")
                line = source[: match.start()].count("\n") + 1
                route_id = f"route:SPA {spa_path}"
                graph.add_node(
                    Node(
                        id=route_id,
                        kind="route",
                        name=f"SPA {spa_path}",
                        evidence=CONFIG_CONFIRMED,
                        file=rel,
                        line=line,
                        attrs={"surface": "spa", "path": spa_path},
                    )
                )

    graph.add_blind_spot(
        BlindSpot(
            id="BLIND-FE-001",
            area="frontend",
            statement=(
                "A component referenced only in a Vue template, with no corresponding import, "
                "produces no edge. This does not occur in the repository today — every component "
                "in use is imported — but the scanner would not see it if it did."
            ),
            affects=["IMPORTS", "change-impact queries over .vue files"],
        )
    )
    graph.add_blind_spot(
        BlindSpot(
            id="BLIND-FE-002",
            area="frontend",
            statement="Dynamic import() targets are recorded as UNKNOWN edges rather than resolved.",
            affects=["IMPORTS"],
        )
    )


def _resolve(source: Path, target: str, root: Path, known: set[str]) -> str | None:
    """Resolve a relative ESM specifier the way Vite would, against tracked files."""
    base = (source.parent / target).resolve()
    candidates = [base]
    if not base.suffix:
        candidates += [base.with_suffix(ext) for ext in (".js", ".vue", ".ts")]
        candidates += [base / f"index{ext}" for ext in (".js", ".vue", ".ts")]
    for candidate in candidates:
        try:
            rel = str(candidate.relative_to(root))
        except ValueError:
            continue
        if rel in known:
            return rel
    return None
