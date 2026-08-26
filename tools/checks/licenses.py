"""Classify every dependency's licence against policy/licenses.yaml.

Emits `RULE-ID|message` lines; `tools/checks/licenses.sh` turns them into gate failures.

This repository ships container images from a public repository, so a dependency's licence is
an obligation this project passes on to anyone who redeploys it. Strong copyleft would carry
source obligations onto them; that is a decision, not a default.

**Unknown fails closed.** A dependency whose licence nobody could determine is not one whose
licence is fine — it is one nobody has looked at. The escape hatch is `resolved_unknowns`,
which requires writing down what the licence actually is, so the cost of the escape is a
minute of reading rather than a suppression.

Both ecosystems are read from *installed* metadata rather than from a manifest, because the
manifest says what was asked for and the metadata says what is there.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
POLICY = ROOT / "policy" / "licenses.yaml"

problems: list[str] = []


def fail(message: str) -> None:
    problems.append(f"RULE-DEP-002|{message}")


def _normalise(value: str) -> str:
    return " ".join(str(value).strip().split())


def python_licences() -> dict[str, str]:
    """Licence per installed distribution, from the backend virtualenv."""
    venv = ROOT / "backend" / ".venv"
    site = next(iter(venv.glob("lib/python*/site-packages")), None)
    if site is None:
        return {}

    found: dict[str, str] = {}
    for meta in sorted(site.glob("*.dist-info/METADATA")):
        name = licence = ""
        classifiers: list[str] = []
        for line in meta.read_text(encoding="utf-8", errors="replace").splitlines():
            if not line.strip():
                break  # headers end at the first blank line; the body is the long description
            if line.startswith("Name: "):
                name = line[6:].strip()
            elif line.startswith("License-Expression: "):
                licence = line[20:].strip()
            elif line.startswith("License: ") and not licence:
                licence = line[9:].strip()
            elif line.startswith("Classifier: License :: "):
                classifiers.append(line[len("Classifier: License :: ") :].strip())
        if not name:
            continue
        # A classifier beats a free-text License: field, which is frequently a whole licence
        # text rather than a name.
        if classifiers:
            best = classifiers[-1]
            licence = best.split(" :: ")[-1] if " :: " in best else best
        found[name] = _normalise(licence)
    return found


def node_licences() -> dict[str, str]:
    """Licence per installed npm package, from node_modules metadata."""
    modules = ROOT / "frontend" / "node_modules"
    if not modules.exists():
        return {}

    found: dict[str, str] = {}
    for manifest in modules.glob("*/package.json"):
        found.update(_read_node_manifest(manifest))
    for scope in modules.glob("@*"):
        for manifest in scope.glob("*/package.json"):
            found.update(_read_node_manifest(manifest))
    return found


def _read_node_manifest(manifest: Path) -> dict[str, str]:
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    name = data.get("name")
    if not name:
        return {}
    licence = data.get("license") or data.get("licence") or ""
    if isinstance(licence, dict):
        licence = licence.get("type", "")
    if isinstance(licence, list):
        licence = " OR ".join(str(item.get("type", item)) for item in licence)
    return {str(name): _normalise(licence)}


def check_policy_consistency(policy: dict) -> None:
    """A licence listed in two verdicts is a policy that contradicts itself.

    `allowed` is checked first when classifying, because for an `A OR B` expression any
    allowed branch genuinely permits the dependency. That precedence quietly makes a
    duplicate entry invisible — a licence added to `forbidden` while still in `allowed`
    forbids nothing — so the contradiction is reported rather than resolved.
    """
    lists = {
        "allowed": set(policy.get("allowed") or []),
        "review": set(policy.get("review") or []),
        "forbidden": set(policy.get("forbidden") or []),
    }
    for first in ("allowed", "review", "forbidden"):
        for second in ("review", "forbidden"):
            if first >= second:
                continue
            for licence in sorted(lists[first] & lists[second]):
                fail(
                    f"policy/licenses.yaml lists {licence!r} as both {first} and {second} — "
                    "a policy that contradicts itself decides nothing"
                )


def classify(policy: dict, packages: dict[str, str], ecosystem: str) -> None:
    allowed = set(policy.get("allowed") or [])
    review = set(policy.get("review") or [])
    forbidden = set(policy.get("forbidden") or [])
    resolved = {entry["package"]: entry for entry in policy.get("resolved_unknowns") or []}
    approved = {entry["package"] for entry in policy.get("approved_exceptions") or []}

    for name, licence in sorted(packages.items()):
        if name in resolved:
            licence = _normalise(resolved[name]["license"])

        # An OR expression is satisfied by any allowed branch — that is what the choice means.
        #
        # Outer parentheses are stripped from the whole expression, never from each branch:
        # plenty of licence names legitimately contain parentheses ("ISC License (ISCL)"),
        # and stripping per-branch turned that into "ISC License (ISCL" and reported a
        # correctly-allowed package as unclassified.
        expression = licence.strip()
        if expression.startswith("(") and expression.endswith(")"):
            expression = expression[1:-1].strip()
        branches = [b.strip() for b in expression.replace(" or ", " OR ").split(" OR ")]
        if any(b in allowed for b in branches):
            continue

        if not licence:
            fail(
                f"{ecosystem} package {name!r} declares no licence — no licence means no "
                "grant of rights. Determine it and record it in policy/licenses.yaml under "
                "resolved_unknowns"
            )
        elif any(b in forbidden for b in branches):
            fail(f"{ecosystem} package {name!r} is {licence!r}, which policy forbids")
        elif any(b in review for b in branches):
            if name not in approved:
                fail(
                    f"{ecosystem} package {name!r} is {licence!r}, which needs a recorded "
                    "approval in policy/licenses.yaml under approved_exceptions"
                )
        else:
            fail(
                f"{ecosystem} package {name!r} declares {licence!r}, which policy does not "
                "classify — add it to allowed, review or forbidden, deliberately"
            )


def main() -> int:
    if not POLICY.exists():
        fail("policy/licenses.yaml is missing — dependency licences are unclassified")
        print("\n".join(problems))
        return 0

    policy = yaml.safe_load(POLICY.read_text(encoding="utf-8")) or {}
    python_found = python_licences()
    node_found = node_licences()

    if not python_found and not node_found:
        print(
            "RULE-DEP-002|no dependency metadata found — run `make bootstrap` before this "
            "check can classify anything"
        )
        return 0

    check_policy_consistency(policy)
    classify(policy, python_found, "python")
    classify(policy, node_found, "npm")

    for line in problems:
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
