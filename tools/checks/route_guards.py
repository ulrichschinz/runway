"""Every route the application serves declares which guard it requires, and the code agrees.

Emits `RULE-ID|message` lines; `tools/checks/route-guards.sh` turns them into gate failures.

`RULE-SEC-001` — the authorization posture of the HTTP surface is checked-in state, not an
emergent property of thirty function signatures. The audit that produced
`rules/route-guards.toml` was a one-time read of every route. Without this check it would
stay accurate exactly until the next route is added, and the failure mode of a forgotten
guard is silent: the route works, it just works for everybody.

**The inventory is the running application, not a directory** (brief 0073, ADR 0047,
`RISK-SEC-005`). Until 2026-11-25 this file parsed `backend/app/routers/*.py` and nothing
else, so a route declared on the app object (`GET /health`), a transport route (`/mcp`), the
framework's own documentation routes and any router-level dependency were invisible to it: six
served routes were declared nowhere while the gate said every guard matched. It now imports
`app.main`, walks `fastapi.routing.iter_route_contexts(app.routes)` — every route FastAPI will
dispatch to, included routers flattened with their prefixes and dependencies applied — and
reads each route's guard from its **resolved dependency tree**, the thing FastAPI actually runs.
The served OpenAPI schema is cross-checked: an operation it lists must be in the inventory.

Three guards exist:

    admin   get_current_admin is in the route's dependency tree — an authenticated admin
    user    get_current_user is (and get_current_admin is not) — any authenticated principal
    open    neither: reachable unauthenticated, or authenticating by some other means

`open` is never inferred as acceptable. Each one is declared with a reason in the TOML, because
a route that anyone can reach is a decision, and a decision with no recorded reason is
indistinguishable from an oversight. A `Mount` (a sub-application) is a route too and must be
declared as `MOUNT <path>`: what it serves is not visible from here.
"""

from __future__ import annotations

import secrets
import sys
import tomllib
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DECLARATION = ROOT / "rules" / "route-guards.toml"

GUARDS = ("admin", "user", "open")
# HEAD and OPTIONS are answered for a GET route by the framework, not chosen by a handler.
IMPLIED_METHODS = {"HEAD", "OPTIONS"}

problems: list[tuple[str, str]] = []


def fail(message: str) -> None:
    problems.append(("RULE-SEC-001", message))


def _booted_app() -> Any:
    """Import the application the way `tools/surfaces.py` does: a key generated per run (the boot
    refuses every published one, brief 0072). Importing does not run the lifespan."""
    sys.path.insert(0, str(ROOT / "backend"))
    from app.config import settings

    settings.jwt_secret = secrets.token_urlsafe(48)
    from app.main import app

    return app


def _calls(dependant: Any) -> set[Any]:
    """Every callable in a resolved dependency tree, sub-dependencies included."""
    seen: set[Any] = set()
    stack = [dependant]
    while stack:
        node = stack.pop()
        for child in getattr(node, "dependencies", None) or []:
            if child.call is not None:
                seen.add(child.call)
            stack.append(child)
    return seen


def observed(app: Any) -> dict[str, str]:
    """Every route the application serves, mapped to the guard its dependency tree enforces."""
    from fastapi.routing import iter_route_contexts
    from starlette.routing import Mount

    from app.dependencies import get_current_admin, get_current_user

    routes: dict[str, str] = {}
    for context in iter_route_contexts(app.routes):
        route = getattr(context, "original_route", context)
        path = getattr(context, "path", None) or getattr(route, "path", "?")
        if isinstance(route, Mount):
            routes[f"MOUNT {path}"] = "open"
            continue
        calls = _calls(getattr(context, "dependant", None))
        if get_current_admin in calls:
            guard = "admin"
        elif get_current_user in calls:
            guard = "user"
        else:
            guard = "open"
        methods = set(getattr(context, "methods", None) or [])
        explicit = methods - IMPLIED_METHODS or methods
        for method in sorted(explicit):
            routes[f"{method} {path}"] = guard
    return routes


def openapi_operations(app: Any) -> set[str]:
    operations: set[str] = set()
    for path, item in (app.openapi().get("paths") or {}).items():
        for method in item:
            if method.upper() in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
                operations.add(f"{method.upper()} {path}")
    return operations


def main() -> int:
    if not DECLARATION.exists():
        fail(f"{DECLARATION.relative_to(ROOT)} is missing — the route surface is undeclared")
        _report()
        return 0

    data = tomllib.loads(DECLARATION.read_text(encoding="utf-8"))
    declared = {r["route"]: r for r in data.get("routes", [])}
    app = _booted_app()
    actual = observed(app)

    for operation in sorted(openapi_operations(app) - set(actual)):
        fail(
            f"{operation} is in the served OpenAPI schema but not among the routes the "
            "application dispatches — the inventory is incomplete"
        )

    for route in sorted(set(actual) - set(declared)):
        fail(
            f"{route} is served by the application but not declared in rules/route-guards.toml "
            f"(it currently enforces `{actual[route]}`) — every route needs a guard decision"
        )

    for route in sorted(set(declared) - set(actual)):
        fail(f"{route} is declared in rules/route-guards.toml but the application serves no such route")

    for route in sorted(set(declared) & set(actual)):
        want = declared[route].get("guard")
        if want not in GUARDS:
            fail(f"{route} declares guard `{want}`, which is not one of admin/user/open")
            continue
        if want != actual[route]:
            fail(f"{route} declares `{want}` but the route enforces `{actual[route]}`")
        if want == "open" and not str(declared[route].get("reason", "")).strip():
            fail(f"{route} is declared open with no reason — an open route must justify itself")

    _report()
    return 0


def _report() -> None:
    for rule, message in problems:
        print(f"{rule}|{message}")


if __name__ == "__main__":
    sys.exit(main())
