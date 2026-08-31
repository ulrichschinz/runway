"""Require a declared timeout on every blocking outward call the application makes.

Emits `RULE-ID|message` lines; `tools/checks/timeouts.sh` turns them into gate failures.

A subprocess or network call with no timeout does not fail — it waits. The request holding
it waits with it, and so does the worker serving that request. There is one Taskwarrior
binary behind every list this application renders, so a `task` invocation that never returns
is not a slow page: it is a worker that never comes back, and enough of them is an outage
with no error in any log to explain it.

Today the application makes exactly one such call, and it already declares `timeout=10`. This
rule exists so that stays true. The cost of the property is a keyword argument; the cost of
losing it is discovered in production, months later, by someone who did not write the call.

**Scoped to `backend/app/`** — the serving application. Repository tooling under `tools/` also
shells out, but it runs inside the gate's own runtime budget (`RULE-GATE-001`), which bounds
it already; extending this rule there would add standing exceptions without adding a control.

**Declaration, not proof.** A visible `timeout=` argument is what this checks. It cannot know
whether the value is sensible, and it deliberately refuses a call whose keywords arrive
through `**kwargs`, because a timeout that cannot be read at the call site cannot be reviewed
at the call site. See `RISK-OPS-003`.
"""

from __future__ import annotations

import ast
import subprocess  # noqa: S404  # tooling: reads the tracked-file list
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCOPE = "backend/app/"

# Blocking calls that accept a `timeout` keyword. Canonical dotted names; local aliases and
# `from x import y` bindings are resolved to these before lookup.
NEEDS_TIMEOUT = {
    # process execution
    "subprocess.run",
    "subprocess.call",
    "subprocess.check_call",
    "subprocess.check_output",
    # egress — none of these are imported today; the rule is what keeps the first one honest
    "requests.request",
    "requests.get",
    "requests.post",
    "requests.put",
    "requests.patch",
    "requests.delete",
    "requests.head",
    "requests.options",
    "requests.Session.request",
    "httpx.request",
    "httpx.get",
    "httpx.post",
    "httpx.put",
    "httpx.patch",
    "httpx.delete",
    "httpx.head",
    "httpx.options",
    "httpx.stream",
    "httpx.Client",
    "httpx.AsyncClient",
    "urllib.request.urlopen",
    "aiohttp.ClientSession",
    "socket.create_connection",
}

# Calls that cannot declare a timeout at the call site at all. Popen hands back a handle and
# defers the waiting to `.communicate()`, so the argument that bounds it is somewhere else —
# which is exactly the reading this rule refuses to make the reviewer do.
NO_TIMEOUT_PARAMETER = {
    "subprocess.Popen",
}

problems: list[str] = []


def tracked_python_files() -> list[str]:
    out = subprocess.run(
        ["git", "ls-files", SCOPE], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout.split()
    return [rel for rel in out if rel.endswith(".py")]


def import_bindings(tree: ast.Module) -> dict[str, str]:
    """Map every locally bound name back to its canonical dotted name.

    `import subprocess as sp` binds `sp` -> `subprocess`; `from subprocess import run as r`
    binds `r` -> `subprocess.run`. Without this the check would be defeated by a rename,
    which is the kind of hole that makes a rule advisory.
    """
    bindings: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                bindings[alias.asname or alias.name.split(".")[0]] = (
                    alias.name if alias.asname else alias.name.split(".")[0]
                )
        elif isinstance(node, ast.ImportFrom) and node.module and not node.level:
            for alias in node.names:
                bindings[alias.asname or alias.name] = f"{node.module}.{alias.name}"
    return bindings


def dotted_name(node: ast.expr) -> str | None:
    """Render `a.b.c` from an attribute/name chain; None for anything else."""
    parts: list[str] = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if not isinstance(node, ast.Name):
        return None
    parts.append(node.id)
    return ".".join(reversed(parts))


def canonical(name: str, bindings: dict[str, str]) -> str:
    head, _, rest = name.partition(".")
    if head not in bindings:
        return name
    return f"{bindings[head]}.{rest}" if rest else bindings[head]


def declares_timeout(call: ast.Call) -> bool:
    for keyword in call.keywords:
        if keyword.arg == "timeout":
            # `timeout=None` is the absence of a timeout, spelled out. Refuse it: writing it
            # deliberately is exactly the case worth surfacing in review.
            return not (
                isinstance(keyword.value, ast.Constant) and keyword.value.value is None
            )
    return False


def has_keyword_splat(call: ast.Call) -> bool:
    return any(keyword.arg is None for keyword in call.keywords)


def scan(rel: str) -> None:
    path = ROOT / rel
    try:
        source = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return

    try:
        tree = ast.parse(source, filename=rel)
    except SyntaxError:
        return  # ruff and mypy own syntax; this rule has nothing to say about it

    bindings = import_bindings(tree)

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        raw = dotted_name(node.func)
        if raw is None:
            continue
        name = canonical(raw, bindings)
        where = f"{rel}:{node.lineno}"

        if name in NO_TIMEOUT_PARAMETER:
            problems.append(
                f"RULE-OPS-001|{where} calls {name}, which takes no timeout argument. The "
                "wait happens in .communicate() instead, so the bound is not readable here "
                "— use subprocess.run(..., timeout=...)"
            )
            continue

        if name not in NEEDS_TIMEOUT:
            continue

        if has_keyword_splat(node):
            problems.append(
                f"RULE-OPS-001|{where} passes keywords to {name} through **kwargs, so no "
                "timeout can be read at the call site. Pass timeout= explicitly"
            )
        elif not declares_timeout(node):
            problems.append(
                f"RULE-OPS-001|{where} calls {name} with no timeout. Without one the call "
                "waits forever and takes the worker with it — pass timeout=<seconds>"
            )


def main() -> int:
    for rel in tracked_python_files():
        scan(rel)
    for problem in problems:
        print(problem)
    return 0


if __name__ == "__main__":
    sys.exit(main())
