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
* `RULE-SEC-002` — every compatibility shim is fully recorded and has not expired. The
  contract step of a migration is the one that gets skipped, so the countdown is enforced.
* `RULE-DOC-004` — every reference in a decision record or a change brief resolves. The
  same resolution `RULE-DOC-001` performs on the contract, applied to the documents the
  contract points at, because a dangling reference in an ADR is followed just as readily.
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
SHIMS = ROOT / "rules" / "shims.yaml"
ADRS = ROOT / "docs" / "adr"
BRIEFS = ROOT / "docs" / "briefs"

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
    """Every identifier that is actually *declared*, as opposed to merely mentioned.

    The ledger and the waiver register are parsed structurally, for `id:` fields only. A
    regex over the whole file would count an id appearing inside a rationale as declared —
    so citing `RISK-OPS-002` as an example of drift would make that very id resolve, and
    the rule meant to catch dangling references would be defeated by the prose explaining
    it. `architecture.toml` (cycle ids) and the index export (blind-spot ids) have no such
    prose, and are scanned as text.
    """
    names: set[str] = set()
    for path in (LEDGER, WAIVERS):
        if not path.exists():
            continue
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        for group in data.values():
            if not isinstance(group, list):
                continue
            for item in group:
                if isinstance(item, dict) and isinstance(item.get("id"), str):
                    names.add(item["id"])
    for path in (ROOT / "architecture.toml", ROOT / "index" / "graph.jsonl"):
        if path.exists():
            names |= {m.group(0) for m in _RULE_REF.finditer(path.read_text(encoding="utf-8"))}
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


# --- decision records and briefs resolve --------------------------------------

_MD_LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")
_ADR_PROSE = re.compile(r"\bADR[ -](\d{4})\b")
_STATUS = re.compile(r"^-?\s*\*\*Status:\*\*\s*(\w+)", re.MULTILINE)


def check_shims() -> None:
    """RULE-SEC-002 — every shim is fully recorded, and none has outlived its expiry.

    A compatibility shim is the expand half of a migration with the contract half still
    owed. Nothing fails when the contract step is skipped — the old shape keeps working —
    so "temporary" becomes permanent by default rather than by decision. This is the same
    shape as the waiver check, for the same reason: a date that nothing enforces is a wish.
    """
    if not SHIMS.exists():
        return
    data = yaml.safe_load(SHIMS.read_text(encoding="utf-8")) or {}
    today = dt.date.today()
    seen: set[str] = set()

    for shim in data.get("shims", []) or []:
        sid = shim.get("id", "<no id>")
        if sid in seen:
            fail("RULE-SEC-002", f"{sid} is declared twice")
        seen.add(sid)

        for field in ("what", "why", "removal", "evidence", "owner", "expires"):
            if not str(shim.get(field, "")).strip():
                fail("RULE-SEC-002", f"{sid} has no `{field}` — a shim records all six")

        expires = shim.get("expires")
        if isinstance(expires, dt.date) and expires < today:
            fail(
                "RULE-SEC-002",
                f"{sid} expired on {expires}: remove the shim or re-approve it with a new date",
            )
        elif expires is not None and not isinstance(expires, dt.date):
            fail("RULE-SEC-002", f"{sid} has an unparseable `expires` value {expires!r}")


def check_records() -> None:
    """RULE-DOC-004 — every reference in an ADR or a brief resolves.

    A decision record is read by the next agent as authority. When it cites `RISK-OPS-002`
    and the ledger declares `RISK-OPS-001`, the reader either chases a phantom or, worse,
    concludes the risk is untracked. That exact drift shipped in ADR 0015 and passed every
    gate, because nothing resolved a record's references against anything.

    Three classes of reference are checked, and they share one property: each has an
    unambiguous ground truth, so a failure is always a real defect. An identifier has a
    registry — you never casually mention a RISK id that does not exist. A relative link is
    navigational by definition. An ADR number names a record.

    Backticked paths are deliberately NOT checked, though the first draft of this rule did.
    A record is prose, and prose names files both as references and as mentions — a rejected
    alternative that was never built, or a quotation of the very drift the record is
    correcting. Nothing syntactic separates the two, and the check produced false positives
    on records that were entirely correct. Records point at files by *linking* to them
    instead, which the link check covers. Recorded as RISK-DOC-002.

    Records are dated documents, so only an **Accepted** record is held to this: a Superseded
    or Rejected one describes a world that has moved on, and rewriting it to keep a gate
    green would falsify the history it exists to preserve.
    """
    declared = _declared_identifiers()
    adr_numbers = {path.name[:4] for path in sorted(ADRS.glob("*.md"))}

    for path in [*sorted(ADRS.glob("*.md")), *sorted(BRIEFS.glob("*.md"))]:
        rel = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8")

        status = _STATUS.search(text)
        if status and status.group(1).lower() not in ("accepted", "proposed"):
            continue

        # 1. every identifier it cites must be declared somewhere
        for name in {m.group(0) for m in _RULE_REF.finditer(text)}:
            if name not in declared:
                fail("RULE-DOC-004", f"{rel} cites {name}, which is declared nowhere")

        # 2. every relative markdown link must resolve, from the document's own directory
        for href in {m.group(1) for m in _MD_LINK.finditer(text)}:
            if href.startswith(("http://", "https://", "mailto:", "#")):
                continue
            target = (path.parent / href.split("#", 1)[0]).resolve()
            if not target.exists():
                fail("RULE-DOC-004", f"{rel} links to `{href}`, which does not resolve")

        # 3. every ADR referred to in prose must be an ADR that exists
        for number in {m.group(1) for m in _ADR_PROSE.finditer(text)}:
            if number not in adr_numbers:
                fail("RULE-DOC-004", f"{rel} refers to ADR {number}, which does not exist")


def main() -> int:
    check_contract_claims()
    check_length_budget()
    check_scoped_contracts()
    check_ledger()
    waiver_data = check_waivers()
    check_suppressions(waiver_data)
    check_shims()
    check_records()

    for rule, message in problems:
        print(f"{rule}|{message}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
