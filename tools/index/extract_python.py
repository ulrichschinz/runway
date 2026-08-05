"""Python extraction via the standard library `ast` module.

Exact, not heuristic: every fact here comes from a real parse tree, which is why they are
all STATIC_CONFIRMED or CONFIG_CONFIRMED rather than guesses.

What this covers: module imports, top-level and class-level definitions, intra-repository
calls, FastAPI route decorators (method, path, the handler they expose, and the MCP tool
name derived from the handler's name), and `Depends()` injection.
"""

from __future__ import annotations

import ast
from pathlib import Path

from model import (
    CONFIG_CONFIRMED,
    CONTRACT_DECLARED,
    STATIC_CONFIRMED,
    Edge,
    Graph,
    Node,
)

HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}


def module_name(path: Path, root: Path) -> str:
    """`backend/app/routers/tasks.py` -> `app.routers.tasks`."""
    rel = path.relative_to(root / "backend")
    return str(rel.with_suffix("")).replace("/", ".")


def extract(graph: Graph, root: Path, files: list[Path]) -> None:
    by_module = {module_name(f, root): f for f in files}
    defined: dict[str, str] = {}  # qualified symbol name -> node id

    # First pass: definitions, so calls in the second pass can resolve against them.
    for path in files:
        rel = str(path.relative_to(root))
        mod = module_name(path, root)
        tree = _parse(path)
        if tree is None:
            continue
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                qualified = f"{mod}.{node.name}"
                node_id = f"symbol:{qualified}"
                kind = "class" if isinstance(node, ast.ClassDef) else "function"
                graph.add_node(
                    Node(
                        id=node_id,
                        kind="symbol",
                        name=qualified,
                        evidence=STATIC_CONFIRMED,
                        file=rel,
                        line=node.lineno,
                        attrs={"symbol_kind": kind, "module": mod},
                    )
                )
                graph.add_edge(
                    Edge(
                        "DEFINES",
                        f"file:{rel}",
                        node_id,
                        STATIC_CONFIRMED,
                        file=rel,
                        line=node.lineno,
                    )
                )
                defined[qualified] = node_id
                defined.setdefault(node.name, node_id)

    # Second pass: imports, calls, routes, injection.
    for path in files:
        rel = str(path.relative_to(root))
        mod = module_name(path, root)
        tree = _parse(path)
        if tree is None:
            continue

        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                target = by_module.get(node.module)
                if target is None and node.module.startswith("app"):
                    # `from app.routers import auth, tasks` — a package import naming modules
                    for alias in node.names:
                        sub = by_module.get(f"{node.module}.{alias.name}")
                        if sub is not None:
                            graph.add_edge(
                                Edge(
                                    "IMPORTS",
                                    f"file:{rel}",
                                    f"file:{sub.relative_to(root)}",
                                    STATIC_CONFIRMED,
                                    file=rel,
                                    line=node.lineno,
                                )
                            )
                    continue
                if target is not None:
                    graph.add_edge(
                        Edge(
                            "IMPORTS",
                            f"file:{rel}",
                            f"file:{target.relative_to(root)}",
                            STATIC_CONFIRMED,
                            file=rel,
                            line=node.lineno,
                            attrs={"names": sorted(a.name for a in node.names)},
                        )
                    )

            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                _extract_routes(graph, node, rel, mod)
                _extract_depends(graph, node, rel, mod, defined)
                _extract_calls(graph, node, rel, mod, defined)


def _parse(path: Path) -> ast.Module | None:
    try:
        return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except SyntaxError:
        return None


def _extract_routes(
    graph: Graph, fn: ast.FunctionDef | ast.AsyncFunctionDef, rel: str, mod: str
) -> None:
    """A FastAPI route decorator: `@router.get("/path", ...)`."""
    for dec in fn.decorator_list:
        if not (isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute)):
            continue
        method = dec.func.attr.lower()
        if method not in HTTP_METHODS:
            continue
        if not (dec.args and isinstance(dec.args[0], ast.Constant)):
            continue
        path_arg = dec.args[0].value
        route_id = f"route:{method.upper()} {mod}:{path_arg}"
        symbol_id = f"symbol:{mod}.{fn.name}"

        graph.add_node(
            Node(
                id=route_id,
                kind="route",
                name=f"{method.upper()} {path_arg}",
                evidence=CONFIG_CONFIRMED,
                file=rel,
                line=fn.lineno,
                attrs={"method": method.upper(), "path": path_arg, "handler": fn.name},
            )
        )
        graph.add_edge(
            Edge("EXPOSES", route_id, symbol_id, CONFIG_CONFIRMED, file=rel, line=fn.lineno)
        )

        # fastapi-mcp derives an MCP tool from each route's operation id, which defaults to
        # the handler function's name. That makes a Python function name part of a
        # hard-promise public surface (F2). CONTRACT_DECLARED, not CONFIG_CONFIRMED: this
        # is the documented behaviour of a third-party library, not something read from a
        # parse tree. Step 13 replaces it with RUNTIME_OBSERVED by booting the app.
        tool_id = f"mcp_tool:{fn.name}"
        graph.add_node(
            Node(
                id=tool_id,
                kind="mcp_tool",
                name=fn.name,
                evidence=CONTRACT_DECLARED,
                file=rel,
                line=fn.lineno,
                attrs={"derived_from": "route handler name", "verified_at_runtime": False},
            )
        )
        graph.add_edge(
            Edge("DERIVES_TOOL", route_id, tool_id, CONTRACT_DECLARED, file=rel, line=fn.lineno)
        )


def _extract_depends(
    graph: Graph,
    fn: ast.FunctionDef | ast.AsyncFunctionDef,
    rel: str,
    mod: str,
    defined: dict[str, str],
) -> None:
    """FastAPI dependency injection: `x: T = Depends(provider)`."""
    for default in list(fn.args.defaults) + list(fn.args.kw_defaults):
        if not (isinstance(default, ast.Call) and _callee_name(default.func) == "Depends"):
            continue
        if not default.args:
            continue
        provider = _callee_name(default.args[0])
        if provider is None:
            continue
        target = defined.get(provider)
        if target is None:
            continue
        graph.add_edge(
            Edge(
                "INJECTS",
                f"symbol:{mod}.{fn.name}",
                target,
                CONFIG_CONFIRMED,
                file=rel,
                line=fn.lineno,
                attrs={"mechanism": "fastapi.Depends"},
            )
        )


def _extract_calls(
    graph: Graph,
    fn: ast.FunctionDef | ast.AsyncFunctionDef,
    rel: str,
    mod: str,
    defined: dict[str, str],
) -> None:
    """Calls to symbols defined somewhere in this repository."""
    seen: set[str] = set()
    for node in ast.walk(fn):
        if not isinstance(node, ast.Call):
            continue
        name = _callee_name(node.func)
        if name is None:
            continue
        target = defined.get(name)
        if target is None or target == f"symbol:{mod}.{fn.name}":
            continue
        key = f"{fn.name}->{target}"
        if key in seen:
            continue
        seen.add(key)
        graph.add_edge(
            Edge(
                "CALLS",
                f"symbol:{mod}.{fn.name}",
                target,
                STATIC_CONFIRMED,
                file=rel,
                line=node.lineno,
            )
        )


def _callee_name(node: ast.expr) -> str | None:
    """`foo` -> "foo"; `mod.foo` -> "foo" (the attribute, which is what `defined` keys on)."""
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None
