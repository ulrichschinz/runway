"""Keep the contract honest, and the rules complete.

Emits `RULE-ID|message` lines; `tools/checks/contract.sh` turns them into gate failures.

Five things are checked:

* `RULE-DOC-001` — every factual claim in AGENTS.md holds against the actual repository.
  This is what stops the contract becoming fiction: a document nobody verifies drifts, and
  a drifted contract is worse than none because it is followed.
* `RULE-DOC-002` — the contract stays inside its length budget. A contract nobody finishes
  reading is a contract nobody follows.
* `RULE-DOC-003` — a scoped contract refines the root; it never defines rules of its own.
* `RULE-RULE-001` — the Rule Ledger is complete: every rule has a check that exists and a
  fixture that exists.
* `RULE-RULE-002` — no waiver has expired, and every waiver records all five groups.
* `RULE-RULE-003` — every inline suppression corresponds to a waiver or a reviewed
  justified suppression. Silent suppression is what turns a gate into theatre.
"""

from __future__ import annotations

import datetime as dt
import re
import subprocess
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = ROOT / "AGENTS.md"
SCOPED = [ROOT / "backend" / "AGENTS.md", ROOT / "frontend" / "AGENTS.md"]
LEDGER = ROOT / "rules" / "ledger.yaml"
WAIVERS = ROOT / "rules" / "waivers.yaml"

MAX_LINES = 250
MAX_BYTES = 12_000

problems: list[tuple[str, str]] = []


def fail(rule: str, message: str) -> None:
    problems.append((rule, message))


# --- the contract's factual claims --------------------------------------------

_BACKTICKED = re.compile(r"`([^`\n]+)`")
_RULE_REF = re.compile(r"\b(RULE|RISK|BLIND|WAIVER|CYCLE)-[A-Z]+-\d+\b")
_COMMAND = re.compile(r"`(?:make|\./run) ([a-z-]+)")


# Repository-relative paths start with one of these, or carry a file extension. Unit ids
# (`be/adapters/task`), route paths (`/inbox`) and brace notation (`be/adapters/{db,task}`)
# also contain slashes and are deliberately excluded — they are checked as identifiers and
# surfaces instead.
_TOP_LEVEL = (
    "backend/", "frontend/", "tools/", "docs/", "ops/", "rules/", "index/", ".github/"
)
_EXTENSIONS = (".md", ".toml", ".yaml", ".yml", ".py", ".js", ".sh", ".json", ".txt")


def looks_like_path(token: str) -> bool:
    if " " in token or token.startswith(("-", "$", "<", "/")) or "{" in token:
        return False
    return token.startswith(_TOP_LEVEL) or token.endswith(_EXTENSIONS)


def check_contract_claims() -> None:
    text = CONTRACT.read_text(encoding="utf-8")

    # 1. every path the contract names must exist
    for token in _BACKTICKED.findall(text):
        token = token.strip()
        if not looks_like_path(token):
            continue
        target = token.rstrip("/")
        if target.endswith("/**"):
            target = target[:-3]
        if not (ROOT / target).exists():
            fail("RULE-DOC-001", f"AGENTS.md names `{token}`, which does not exist")

    # 2. every command it names must be a real command
    available = set(_available_commands())
    for command in set(_COMMAND.findall(text)):
        if command not in available:
            fail("RULE-DOC-001", f"AGENTS.md names `make {command}`, which is not a command")

    # 3. every identifier it cites must be declared somewhere
    declared = _declared_identifiers()
    for name in {m.group(0) for m in _RULE_REF.finditer(text)}:
        if name not in declared:
            fail("RULE-DOC-001", f"AGENTS.md cites {name}, which is declared nowhere")

    # 4. the counted claims about public surfaces
    _check_surface_counts(text)


def _available_commands() -> list[str]:
    makefile = (ROOT / "Makefile").read_text(encoding="utf-8")
    return re.findall(r"^([a-z][a-z-]*):.*## ", makefile, re.MULTILINE)


def _declared_identifiers() -> set[str]:
    names: set[str] = set()
    for path in (LEDGER, WAIVERS, ROOT / "architecture.toml"):
        if path.exists():
            names |= set(m.group(0) for m in _RULE_REF.finditer(path.read_text(encoding="utf-8")))
    graph = ROOT / "index" / "graph.jsonl"
    if graph.exists():
        names |= set(m.group(0) for m in _RULE_REF.finditer(graph.read_text(encoding="utf-8")))
    return names


def _check_surface_counts(text: str) -> None:
    """The contract states how many routes and MCP tools exist. Verify against the index."""
    graph = ROOT / "index" / "graph.jsonl"
    if not graph.exists():
        return
    import json

    rows = [json.loads(line) for line in graph.read_text(encoding="utf-8").splitlines()]
    nodes = [r for r in rows if r["type"] == "node"]
    rest = len([n for n in nodes if n["kind"] == "route" and n["attrs"].get("surface") != "spa"])
    tools = len([n for n in nodes if n["kind"] == "mcp_tool"])

    claimed_routes = re.search(r"REST API \((\d+) routes\)", text)
    if claimed_routes and int(claimed_routes.group(1)) != rest:
        fail(
            "RULE-DOC-001",
            f"AGENTS.md claims {claimed_routes.group(1)} REST routes; the index counts {rest}",
        )
    claimed_tools = re.search(r"MCP tools \((\d+)\)", text)
    if claimed_tools and int(claimed_tools.group(1)) != tools:
        fail(
            "RULE-DOC-001",
            f"AGENTS.md claims {claimed_tools.group(1)} MCP tools; the index counts {tools}",
        )


def check_length_budget() -> None:
    lines = CONTRACT.read_text(encoding="utf-8").splitlines()
    size = CONTRACT.stat().st_size
    if len(lines) > MAX_LINES:
        fail("RULE-DOC-002", f"AGENTS.md is {len(lines)} lines, budget {MAX_LINES}")
    if size > MAX_BYTES:
        fail("RULE-DOC-002", f"AGENTS.md is {size} bytes, budget {MAX_BYTES}")


def check_scoped_contracts() -> None:
    for path in SCOPED:
        rel = path.relative_to(ROOT)
        if not path.exists():
            fail("RULE-DOC-003", f"{rel} is missing")
            continue
        text = path.read_text(encoding="utf-8")
        if "AGENTS.md" not in text:
            fail("RULE-DOC-003", f"{rel} does not point back at the root contract")
        # A scoped contract REFERS to rules; it never defines one. Definition lives in the
        # ledger, and a rule defined in two places is a rule with two meanings.
        for match in re.finditer(r"^\s*[-*]?\s*(RULE-[A-Z]+-\d+)\s*[:—-]\s*\S", text, re.MULTILINE):
            fail(
                "RULE-DOC-003",
                f"{rel} appears to define {match.group(1)}; scoped contracts refine, they do not define",
            )


# --- the rule ledger -----------------------------------------------------------

REQUIRED_RULE_FIELDS = ("id", "statement", "class", "check", "contract", "owner", "rationale")


def check_ledger() -> None:
    data = yaml.safe_load(LEDGER.read_text(encoding="utf-8"))
    rules = data.get("rules", [])
    if not rules:
        fail("RULE-RULE-001", "the ledger declares no rules")
        return

    seen: set[str] = set()
    for rule in rules:
        rid = rule.get("id", "<no id>")
        if rid in seen:
            fail("RULE-RULE-001", f"{rid} is declared twice")
        seen.add(rid)

        for field in REQUIRED_RULE_FIELDS:
            if not rule.get(field):
                fail("RULE-RULE-001", f"{rid} has no `{field}`")

        check_path = str(rule.get("check", "")).split()[0] if rule.get("check") else ""
        if check_path and not (ROOT / check_path).exists():
            fail("RULE-RULE-001", f"{rid} names check `{check_path}`, which does not exist")

        if rule.get("class") == "executable":
            fixture = str(rule.get("fixture") or "")
            if not fixture:
                fail("RULE-RULE-001", f"{rid} is executable but declares no fixture")
            else:
                path = fixture.split()[0]
                if path.startswith("tools/") and not (ROOT / path).exists():
                    fail("RULE-RULE-001", f"{rid} names fixture `{path}`, which does not exist")


# --- waivers -------------------------------------------------------------------

REQUIRED_WAIVER_FIELDS = (
    "id",
    "rule",
    "scope",
    "reason",
    "alternatives_evaluated",
    "risk",
    "mitigation",
    "owner",
    "approver",
    "expires",
    "re_open_trigger",
    "resolution",
)


def check_waivers() -> dict:
    data = yaml.safe_load(WAIVERS.read_text(encoding="utf-8"))
    today = dt.date.today()
    for waiver in data.get("waivers", []):
        wid = waiver.get("id", "<no id>")
        for field in REQUIRED_WAIVER_FIELDS:
            if not waiver.get(field):
                fail("RULE-RULE-002", f"{wid} has no `{field}` — a waiver records all five groups")
        expires = waiver.get("expires")
        if isinstance(expires, dt.date) and expires < today:
            fail(
                "RULE-RULE-002",
                f"{wid} expired on {expires} — resolve it, or re-approve it with a new date",
            )
    return data


# --- suppressions --------------------------------------------------------------

_SUPPRESSION = re.compile(r"#\s*(noqa:|type:\s*ignore)")
_WAIVER_REF = re.compile(r"\bWAIVER-[A-Z]+-\d+\b")


def check_suppressions(waiver_data: dict) -> None:
    waiver_ids = {w["id"] for w in waiver_data.get("waivers", [])}
    covered_scopes: list[str] = []
    for entry in waiver_data.get("justified_suppressions", []):
        covered_scopes.append(entry["scope"])
    for waiver in waiver_data.get("waivers", []):
        covered_scopes.append(str(waiver.get("scope", "")))

    tracked = subprocess.run(
        ["git", "ls-files", "*.py"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout.split()

    for rel in tracked:
        if rel.startswith(("backend/tests/", "tools/index/tests/")):
            continue
        text = (ROOT / rel).read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()
        for number, line in enumerate(lines, start=1):
            if not _SUPPRESSION.search(line):
                continue
            # Accept a waiver id on the line, in the three lines above it, or a scope that
            # covers this file.
            window = "\n".join(lines[max(0, number - 5) : number])
            if _WAIVER_REF.search(window):
                if not set(_WAIVER_REF.findall(window)) & waiver_ids:
                    fail(
                        "RULE-RULE-003",
                        f"{rel}:{number} cites a waiver that does not exist",
                    )
                continue
            if any(rel in scope for scope in covered_scopes):
                continue
            fail(
                "RULE-RULE-003",
                f"{rel}:{number} suppresses a finding with no waiver and no justified suppression",
            )


def main() -> int:
    check_contract_claims()
    check_length_budget()
    check_scoped_contracts()
    check_ledger()
    waiver_data = check_waivers()
    check_suppressions(waiver_data)

    for rule, message in problems:
        print(f"{rule}|{message}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
