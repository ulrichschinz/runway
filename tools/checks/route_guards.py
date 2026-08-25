"""Every HTTP route declares which guard it requires, and the code agrees.

Emits `RULE-ID|message` lines; `tools/checks/route-guards.sh` turns them into gate failures.

`RULE-SEC-001` — the authorization posture of the REST surface is checked-in state, not an
emergent property of thirty function signatures. The audit that produced
`rules/route-guards.toml` was a one-time read of every route. Without this check it would
stay accurate exactly until the next route is added, and the failure mode of a forgotten
guard is silent: the route works, it just works for everybody.

Three guards exist:

    admin   requires Depends(get_current_admin) — an authenticated user whose role is admin
    user    requires Depends(get_current_user)  — any authenticated principal
    open    reachable unauthenticated, or authenticating by some other means

`open` is never inferred. Each one is declared with a reason in the TOML, because a route
that anyone can reach is a decision, and a decision with no recorded reason is indis-
tinguishable from an oversight.
"""

from __future__ import annotations

import ast
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ROUTERS = ROOT / "backend" / "app" / "routers"
DECLARATION = ROOT / "rules" / "route-guards.toml"

METHODS = ("get", "post", "put", "patch", "delete")

problems: list[tuple[str, str]] = []


def fail(message: str) -> None:
    problems.append(("RULE-SEC-001", message))


def observed() -> dict[str, str]:
    """Every route in the code, mapped to the guard its signature actually enforces."""
    routes: dict[str, str] = {}
    for path in sorted(ROUTERS.glob("*.py")):
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source)
        prefix = _router_prefix(tree)
        for node in tree.body:
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for decorator in node.decorator_list:
                method = _route_method(decorator)
                if method is None:
                    continue
                route = f"{method} {prefix}{_route_path(decorator)}"
                routes[route] = _guard_of(node, source)
    return routes


def _router_prefix(tree: ast.Module) -> str:
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and getattr(node.func, "id", "") == "APIRouter":
            for keyword in node.keywords:
                if keyword.arg == "prefix" and isinstance(keyword.value, ast.Constant):
                    return str(keyword.value.value)
    return ""


def _route_method(decorator: ast.expr) -> str | None:
    if not (isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute)):
        return None
    if decorator.func.attr not in METHODS:
        return None
    return decorator.func.attr.upper()


def _route_path(decorator: ast.Call) -> str:
    if decorator.args and isinstance(decorator.args[0], ast.Constant):
        return str(decorator.args[0].value)
    for keyword in decorator.keywords:
        if keyword.arg == "path" and isinstance(keyword.value, ast.Constant):
            return str(keyword.value.value)
    return "?"


def _guard_of(node: ast.FunctionDef | ast.AsyncFunctionDef, source: str) -> str:
    """Read the guard out of the parameter defaults only.

    Deliberately not a substring search over the whole function: a handler that merely
    mentions `get_current_admin` in a comment or calls it internally is not guarded by it.
    FastAPI enforces a dependency only when it appears as a parameter default.
    """
    names = set()
    for default in [*node.args.defaults, *node.args.kw_defaults]:
        if default is None:
            continue
        segment = ast.get_source_segment(source, default) or ""
        if "get_current_admin" in segment:
            names.add("admin")
        elif "get_current_user" in segment:
            names.add("user")
    if "admin" in names:
        return "admin"
    if "user" in names:
        return "user"
    return "open"


def main() -> int:
    if not DECLARATION.exists():
        fail(f"{DECLARATION.relative_to(ROOT)} is missing — the route surface is undeclared")
        _report()
        return 0

    data = tomllib.loads(DECLARATION.read_text(encoding="utf-8"))
    declared = {r["route"]: r for r in data.get("routes", [])}
    actual = observed()

    for route in sorted(set(actual) - set(declared)):
        fail(
            f"{route} exists in the code but is not declared in rules/route-guards.toml "
            f"(it currently enforces `{actual[route]}`) — every route needs a guard decision"
        )

    for route in sorted(set(declared) - set(actual)):
        fail(f"{route} is declared in rules/route-guards.toml but no such route exists")

    for route in sorted(set(declared) & set(actual)):
        want = declared[route].get("guard")
        if want not in ("admin", "user", "open"):
            fail(f"{route} declares guard `{want}`, which is not one of admin/user/open")
            continue
        if want != actual[route]:
            fail(f"{route} declares `{want}` but the handler enforces `{actual[route]}`")
        if want == "open" and not str(declared[route].get("reason", "")).strip():
            fail(f"{route} is declared open with no reason — an open route must justify itself")

    _report()
    return 0


def _report() -> None:
    for rule, message in problems:
        print(f"{rule}|{message}")


if __name__ == "__main__":
    sys.exit(main())
