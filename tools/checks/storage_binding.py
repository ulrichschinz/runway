"""Only the storage resolver may turn the data root into a path (RULE-SEC-003).

Emits `RULE-ID|message` lines; `tools/checks/storage-binding.sh` turns them into failures.

Finding SEC-001 was one expression, `settings.data_root / username`, written twice — in the
module that provisioned a store and in the one that ran the binary — and nothing but review
stood between a username and a directory. Brief 0065 put the decision in one place,
`backend/app/task_storage.py`, where a path is built from a random storage id and checked to be
a real directory directly under the resolved root. This rule keeps it in one place: anywhere
else in the serving application, reading `data_root` — `settings.data_root`,
`task_storage.data_root`, or importing it by name — is a finding.

One standing exemption, by function: `database.audit_db_path`, which joins the root with the
fixed name of the audit database and nothing caller-controlled.

**What it does not see.** It is a static, name-based scan of `backend/app/`. A path assembled
from `os.environ["DATA_ROOT"]`, from a value that was copied out of `settings` under another
name, or by a library, is outside it; so is anything a test does.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCOPE = ROOT / "backend" / "app"
RESOLVER = SCOPE / "task_storage.py"
CONFIG = SCOPE / "config.py"
EXEMPT = {(SCOPE / "database.py", "audit_db_path")}
RULE = "RULE-SEC-003"


def _findings(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    rel = path.relative_to(ROOT).as_posix()
    found: list[str] = []

    def visit(node: ast.AST, function: str | None) -> None:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            function = node.name
        if (path, function) not in EXEMPT:
            if isinstance(node, ast.Attribute) and node.attr == "data_root":
                found.append(
                    f"{RULE}|{rel}:{node.lineno} reads data_root outside the storage resolver;"
                    " resolve the account's store through app.task_storage instead"
                )
            if isinstance(node, ast.ImportFrom) and any(a.name == "data_root" for a in node.names):
                found.append(f"{RULE}|{rel}:{node.lineno} imports data_root by name")
        for child in ast.iter_child_nodes(node):
            visit(child, function)

    visit(tree, None)
    return found


def main() -> int:
    if not RESOLVER.exists():
        print(f"{RULE}|backend/app/task_storage.py is missing — there is no storage resolver")
        return 0
    for path in sorted(SCOPE.rglob("*.py")):
        if path in (RESOLVER, CONFIG) or "__pycache__" in path.parts:
            continue
        for line in _findings(path):
            print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
