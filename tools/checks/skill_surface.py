"""The Claude skill names only operations the server has, and ships every change as a version.

Emits `RULE-ID|message` lines; `tools/checks/skill.sh` turns them into gate failures.

RULE-SURF-003 — the skill in integrations/claude/ drives runway through the public surface,
so every route it names in "Which operation for what" (references/conventions.md) and every
`mcp__runway__<tool>` it names anywhere must exist in the checked-in snapshots. A line that
says "if present" is a deliberate reference to an operation a newer server may have, and is
skipped. The snapshots are the reference, not the running app: RULE-SURF-001 already holds
them to the application, so this check stays static and fast.

RULE-SURF-004 — plugin users receive an update only when `version` in plugin.json changes.
`ops/skill-release.json` records the version and a content hash of `skills/`. A change to the
skill with the same version is the failure; `./run surfaces --update` refreshes the record,
and refuses to when the version was not raised.

    python tools/checks/skill_surface.py            check, print findings
    python tools/checks/skill_surface.py --update   rewrite ops/skill-release.json
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PLUGIN = ROOT / "integrations" / "claude"
SKILLS = PLUGIN / "skills"
MANIFEST = PLUGIN / ".claude-plugin" / "plugin.json"
CONVENTIONS = SKILLS / "runway" / "references" / "conventions.md"
RELEASE = ROOT / "ops" / "skill-release.json"
OPENAPI = ROOT / "ops" / "surfaces" / "openapi.json"
MCP_TOOLS = ROOT / "ops" / "surfaces" / "mcp-tools.json"

_SECTION = "## Which operation for what"
_ROUTE = re.compile(r"`(/?[a-z][a-z0-9_-]*(?:/[a-z0-9_{}-]+)+)`")
_TOOL = re.compile(r"mcp__runway__([A-Za-z0-9_]+)")
_EXEMPT = "if present"


def _rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def _operation_table() -> list[tuple[int, str]]:
    """The lines of the "Which operation for what" section, numbered as in the file."""
    lines = CONVENTIONS.read_text(encoding="utf-8").splitlines()
    out: list[tuple[int, str]] = []
    inside = False
    for number, line in enumerate(lines, 1):
        if line.startswith("## "):
            inside = line.strip() == _SECTION
            continue
        if inside:
            out.append((number, line))
    return out


def check_references() -> list[str]:
    problems: list[str] = []
    if not CONVENTIONS.exists():
        return [f"RULE-SURF-003|{_rel(CONVENTIONS)} is missing"]
    table = _operation_table()
    if not table:
        return [f"RULE-SURF-003|{_rel(CONVENTIONS)} has no '{_SECTION[3:]}' section to check"]

    paths = set(json.loads(OPENAPI.read_text(encoding="utf-8"))["paths"])
    for number, line in table:
        if _EXEMPT in line:
            continue
        for route in _ROUTE.findall(line):
            normalised = "/" + route.lstrip("/")
            if normalised not in paths:
                problems.append(
                    f"RULE-SURF-003|{_rel(CONVENTIONS)}:{number} names the route {normalised}, "
                    "which ops/surfaces/openapi.json does not have — correct the skill, or "
                    f"mark the line '{_EXEMPT}' if a newer server provides it"
                )

    tools = {tool["name"] for tool in json.loads(MCP_TOOLS.read_text(encoding="utf-8"))["tools"]}
    for path in sorted(p for p in PLUGIN.rglob("*") if p.is_file()):
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for number, line in enumerate(text.splitlines(), 1):
            if _EXEMPT in line:
                continue
            for name in _TOOL.findall(line):
                if name not in tools:
                    problems.append(
                        f"RULE-SURF-003|{_rel(path)}:{number} names the MCP tool "
                        f"mcp__runway__{name}, which ops/surfaces/mcp-tools.json does not have"
                    )
    return problems


def _content_hash() -> str:
    """sha256 over every file under skills/, path and bytes, in a stable order."""
    digest = hashlib.sha256()
    for path in sorted(p for p in SKILLS.rglob("*") if p.is_file() and "__pycache__" not in p.parts):
        digest.update(path.relative_to(SKILLS).as_posix().encode() + b"\0")
        digest.update(path.read_bytes() + b"\0")
    return digest.hexdigest()


def _version() -> str:
    return str(json.loads(MANIFEST.read_text(encoding="utf-8"))["version"])


def _semver(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in re.findall(r"\d+", version)[:3])


def check_release() -> list[str]:
    fix = "raise `version` in integrations/claude/.claude-plugin/plugin.json, then run `./run surfaces --update`"
    if not RELEASE.exists():
        return [f"RULE-SURF-004|ops/skill-release.json is missing — run `./run surfaces --update`"]
    recorded = json.loads(RELEASE.read_text(encoding="utf-8"))
    version, content = _version(), _content_hash()
    if content == recorded["sha256"] and version == recorded["version"]:
        return []
    if _semver(version) < _semver(recorded["version"]):
        return [f"RULE-SURF-004|plugin version {version} is lower than the released {recorded['version']}"]
    if content != recorded["sha256"] and version == recorded["version"]:
        return [
            f"RULE-SURF-004|integrations/claude/skills/ changed but the plugin version is still "
            f"{version} — plugin users would never receive it; {fix}"
        ]
    return [f"RULE-SURF-004|ops/skill-release.json records {recorded['version']}, the plugin is {version} — run `./run surfaces --update`"]


def update() -> int:
    version, content = _version(), _content_hash()
    if RELEASE.exists():
        recorded = json.loads(RELEASE.read_text(encoding="utf-8"))
        if content != recorded["sha256"] and _semver(version) <= _semver(recorded["version"]):
            print(
                f"  refused skill-release.json: the skill changed and version {version} is not "
                f"above the released {recorded['version']} — raise it in plugin.json first",
                file=sys.stderr,
            )
            return 1
    RELEASE.write_text(
        json.dumps({"version": version, "sha256": content}, indent=2) + "\n", encoding="utf-8"
    )
    print(f"  wrote skill-release.json  Claude skill {version}")
    return 0


def main(argv: list[str]) -> int:
    if "--update" in argv:
        return update()
    for line in check_references() + check_release():
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
