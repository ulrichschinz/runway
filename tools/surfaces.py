"""Capture the public surfaces, and fail when one moves without being declared.

`AGENTS.md` treats these as externally consumed: this is a public repository and the README
documents the API for third parties. A promise nothing measures is a promise nobody keeps, so
each surface is snapshotted into `ops/surfaces/` and compared on every gate run.

The point is not to prevent change. It is to make change **visible and deliberate**: a diff in
a checked-in snapshot has to be reviewed and committed, where a silently renamed route handler
breaks clients with nothing in the diff to notice.

What is captured, and why that source:

* **S1 REST** — `app.openapi()`. The schema FastAPI actually serves, not the routes we believe
  we registered.
* **S2 MCP tools** — read from a booted `FastApiMCP` instance. Runtime-observed, which is the
  whole point: the tool names are *not* the handler function names, they are FastAPI's
  generated operation ids, and believing otherwise is what `BLIND-MCP-001` warned about.
* **S4 DB schema** — dumped from a database that `init_db()` has actually migrated, so the
  snapshot reflects the migrations rather than the CREATE statements.
* **S5 taskrc template** — verbatim. The urgency coefficients are a behavioural contract:
  changing one re-orders every user's list, and existing `.taskrc` files are never updated.
* **S8 SPA** — routes and localStorage keys, parsed from source. Bookmarks depend on the
  first; the second is where a logged-in session lives.

Env vars are checked separately by `check_env_vars`, because that is a consistency question
between code and documentation rather than a snapshot.
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOTS = ROOT / "ops" / "surfaces"
README = ROOT / "README.md"

EX_OK, EX_RULE, EX_TOOLING = 0, 1, 3


# --- capture ------------------------------------------------------------------


def _booted_app():
    """Import the application with a configuration that is allowed to start.

    `startup_checks` refuses a default JWT secret, and capturing a surface must not depend on
    an operator's environment.
    """
    sys.path.insert(0, str(ROOT / "backend"))
    from app.config import settings

    settings.jwt_secret = "surface-capture-secret-long-enough-to-boot"  # noqa: S105  # secret-scan: allow — throwaway, lets startup_checks pass
    from app.main import app, mcp

    return app, mcp


def capture_openapi() -> dict:
    app, _ = _booted_app()
    return app.openapi()


def capture_mcp_tools() -> dict:
    """The tool list a client actually receives.

    Recorded with the handler name alongside, because the relationship between the two is the
    thing people get wrong: the tool name is the FastAPI operation id — function name, path
    and method — and renaming the Python function silently renames the tool.
    """
    _, mcp = _booted_app()
    return {
        "count": len(mcp.tools),
        "tools": sorted(
            (
                {
                    "name": tool.name,
                    "summary": (tool.description or "").strip().split("\n")[0][:120],
                }
                for tool in mcp.tools
            ),
            key=lambda entry: entry["name"],
        ),
    }


def capture_db_schema() -> str:
    """The schema after `init_db()` has run, migrations included."""
    import asyncio

    sys.path.insert(0, str(ROOT / "backend"))
    from app.config import settings
    from app.database import init_db

    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "surface.db"
        original_db, original_root = settings.db_path, settings.data_root
        settings.db_path = str(db_path)
        settings.data_root = Path(tmp) / "data"
        settings.data_root.mkdir()
        try:
            asyncio.run(init_db())
            con = sqlite3.connect(db_path)
            rows = con.execute(
                "SELECT type, name, sql FROM sqlite_master "
                "WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name"
            ).fetchall()
            con.close()
        finally:
            settings.db_path, settings.data_root = original_db, original_root

    return "\n".join(f"-- {kind} {name}\n{sql};\n" for kind, name, sql in rows)


def capture_taskrc() -> str:
    return (ROOT / "backend" / "taskrc_template.txt").read_text(encoding="utf-8")


def capture_spa() -> dict:
    router = (ROOT / "frontend" / "src" / "router" / "index.js").read_text(encoding="utf-8")
    routes = sorted(set(re.findall(r"path:\s*'([^']+)'", router)))

    keys: set[str] = set()
    for path in sorted((ROOT / "frontend" / "src").rglob("*.js")):
        if "node_modules" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        keys |= set(re.findall(r"localStorage\.(?:get|set|remove)Item\(\s*'([^']+)'", text))

    return {"routes": routes, "local_storage_keys": sorted(keys)}


SURFACES = {
    "openapi.json": (lambda: json.dumps(capture_openapi(), indent=2, sort_keys=True) + "\n", "S1 REST API"),
    "mcp-tools.json": (lambda: json.dumps(capture_mcp_tools(), indent=2, sort_keys=True) + "\n", "S2 MCP tools"),
    "db-schema.sql": (capture_db_schema, "S4 database schema"),
    "taskrc.txt": (capture_taskrc, "S5 Taskwarrior template"),
    "spa.json": (lambda: json.dumps(capture_spa(), indent=2, sort_keys=True) + "\n", "S8 SPA routes and storage keys"),
}


# --- env vars -----------------------------------------------------------------


def read_env_vars() -> set[str]:
    """Every environment variable the application actually reads.

    Parsed from the `Settings` model rather than grepped: pydantic-settings maps each field to
    the upper-cased field name, so the model *is* the list, and a grep would miss exactly the
    ones nobody remembered to mention anywhere.
    """
    source = (ROOT / "backend" / "app" / "config.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "Settings":
            for stmt in node.body:
                if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                    names.add(stmt.target.id.upper())
    return names


def documented_env_vars() -> set[str]:
    """Variables the README presents to an operator as configuration."""
    text = README.read_text(encoding="utf-8")
    blocks = re.findall(r"```(?:sh|bash|env|ini)?\n(.*?)```", text, re.S)
    names: set[str] = set()
    for block in blocks:
        for line in block.splitlines():
            match = re.match(r"^([A-Z][A-Z0-9_]{2,})=", line.strip())
            if match:
                names.add(match.group(1))
    return names


def check_env_vars() -> list[str]:
    read = read_env_vars()
    documented = documented_env_vars()
    problems = []
    for name in sorted(documented - read):
        problems.append(
            f"RULE-SURF-002|README documents {name}, which the application never reads — "
            "an operator setting it gets silence, not an effect"
        )
    for name in sorted(read - documented):
        problems.append(
            f"RULE-SURF-002|{name} is read by the application but documented nowhere in "
            "README — an operator cannot configure what they cannot see"
        )
    return problems


# --- commands -----------------------------------------------------------------


def update() -> int:
    SNAPSHOTS.mkdir(parents=True, exist_ok=True)
    for filename, (produce, label) in SURFACES.items():
        (SNAPSHOTS / filename).write_text(produce(), encoding="utf-8")
        print(f"  wrote {filename:<18} {label}")
    return EX_OK


def check() -> int:
    problems: list[str] = []

    for filename, (produce, label) in SURFACES.items():
        path = SNAPSHOTS / filename
        if not path.exists():
            problems.append(f"RULE-SURF-001|{label} has no snapshot at ops/surfaces/{filename}")
            continue
        current = produce()
        if current != path.read_text(encoding="utf-8"):
            problems.append(
                f"RULE-SURF-001|{label} changed: ops/surfaces/{filename} no longer matches what "
                "the application produces. If the change is intended, run `./run surfaces "
                "--update` and commit it as a public-surface migration"
            )

    problems += check_env_vars()

    for line in problems:
        print(line)
    return EX_OK


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="./run surfaces")
    parser.add_argument("--update", action="store_true", help="rewrite the snapshots")
    args = parser.parse_args(argv)
    return update() if args.update else check()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
