"""Generate a Change Impact Brief for the working diff, pre-filled from the index.

The brief is the artefact `docs/change-workflow.md` requires for any change to production
code: what you *intend*, recorded before the diff says what you *did*. Writing one by hand
means running `./run impact` once per changed file and merging the answers, which is
mechanical, slow, and exactly the kind of work that gets skipped under time pressure.

This command does the mechanical half. It answers, from the index and from git:

    owning units · applicable contracts · governing decision records · entry points ·
    affected public surfaces and the MCP tools derived from them · known dependents ·
    protecting tests and unprotected files · relevant blind spots · base revision

It does NOT answer the half that requires a human or an agent with intent: the requested
outcome, the delivery pattern, the intended scope. Those are emitted as explicit TODO
markers rather than plausible guesses, because a brief filled with confident-looking
inference is worse than an obviously unfinished one — the first is believed.

Every fact printed comes from `tools/index/query.py`, the same canonical layer the CLI and
MCP adapters read. The generator adds aggregation and presentation, nothing else.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "index"))

import query  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]

EX_OK, EX_NEEDS_INPUT, EX_TOOLING, EX_STALE = 0, 2, 3, 4

# A brief describes a change to production code. Changes confined to these paths are
# reported so the author can see them, but they never make a path count as production.
NON_PRODUCTION_PREFIXES = ("docs/", "rules/", "tools/fixtures/", ".github/")

TODO = "_TODO — this is yours to write; the index cannot infer it._"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="./run brief",
        description="Generate a Change Impact Brief for the working diff.",
    )
    parser.add_argument(
        "--base",
        metavar="REV",
        default=None,
        help="revision to diff against (default: the merge base with origin/main)",
    )
    parser.add_argument(
        "--paths",
        nargs="*",
        metavar="PATH",
        default=None,
        help="describe these paths instead of deriving them from the diff",
    )
    parser.add_argument("--json", action="store_true", help="emit the facts as JSON")
    args = parser.parse_args(argv)

    try:
        base = args.base or _merge_base()
    except _GitError as exc:
        print(f"  {exc}", file=sys.stderr)
        return EX_TOOLING

    paths = args.paths if args.paths is not None else _changed_paths(base)
    if not paths:
        print(f"needs input: nothing has changed against {base[:12]}", file=sys.stderr)
        print("  supply --paths, or --base with a revision the change is visible from", file=sys.stderr)
        return EX_NEEDS_INPUT

    try:
        graph = query.load()
    except query.IndexUnavailable as exc:
        print(f"  {exc}", file=sys.stderr)
        return EX_STALE

    facts = _gather(graph, paths, base)

    if args.json:
        import json

        print(json.dumps(facts, indent=2, sort_keys=True))
    else:
        print(_render(facts))

    return EX_STALE if facts["freshness"]["status"] == "STALE" else EX_OK


# --- git ----------------------------------------------------------------------


class _GitError(RuntimeError):
    pass


def _git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        raise _GitError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def _merge_base() -> str:
    """The revision this change departs from.

    `origin/main` when it is available, so the base matches what CI will compare against.
    A clone with no remote falls back to local `main`, and a repository on `main` itself
    falls back to HEAD — which makes the brief describe uncommitted work only, and says so.
    """
    for ref in ("origin/main", "main"):
        try:
            return _git("merge-base", "HEAD", ref)
        except _GitError:
            continue
    return _git("rev-parse", "HEAD")


def _changed_paths(base: str) -> list[str]:
    """Every path touched since `base`, committed or not, including new untracked files.

    Untracked files are included deliberately: the index reads `git ls-files`, so a new
    file is invisible until staged, and a brief that silently omitted it would describe a
    change that is not the one being made.
    """
    tracked = _git("diff", "--name-only", base, "--").splitlines()
    untracked = _git("ls-files", "--others", "--exclude-standard").splitlines()
    return sorted({p for p in [*tracked, *untracked] if p})


# --- aggregation --------------------------------------------------------------


def _gather(graph: dict, paths: list[str], base: str) -> dict:
    """Merge one `impact` answer per changed path into a single set of facts."""
    units: set[str] = set()
    records: dict[str, dict] = {}
    surfaces: dict[str, dict] = {}
    dependents: set[str] = set()
    tests: set[tuple[str, str]] = set()
    unprotected: set[str] = set()
    blind_spots: dict[str, dict] = {}
    not_indexed: list[str] = []
    entry_points: list[str] = []

    for rel in paths:
        entry_points.append(rel)
        answer = query.impact(graph, rel)
        result = answer["result"]
        if "error" in result:
            not_indexed.append(rel)
            continue

        if result["unit"]:
            units.add(result["unit"])
        for adr in result["governed_by"]:
            records[adr["id"]] = adr
        for surface in result["connected_public_surfaces"]:
            surfaces[surface["route"]] = surface
        dependents |= set(result["direct_dependents"]) | set(result["transitive_dependents"])
        for test in result["protecting_tests"]:
            tests.add((test["protects"], test["test"]))
        unprotected |= set(result["files_without_import_derived_test_protection"])
        for spot in answer["blind_spots"]:
            blind_spots[spot["id"]] = spot

    # A changed file is not its own dependent, and an unprotected changed file is a gap
    # worth naming; an unprotected file that merely *depends* on the change is not.
    changed = set(paths)
    dependents -= changed
    # Only production paths can lack test protection in any meaningful sense. A decision
    # record or a workflow file has no test and never will; listing it as a gap would
    # train the reader to skim the section that matters.
    unprotected &= {p for p in changed if _is_production(p)}

    return {
        "changed_paths": paths,
        "production_paths": [p for p in paths if _is_production(p)],
        "not_indexed": not_indexed,
        "entry_points": entry_points,
        "units": sorted(units),
        "governed_by": sorted(records.values(), key=lambda r: r["id"]),
        "public_surfaces": sorted(surfaces.values(), key=lambda s: s["route"]),
        "dependents": sorted(dependents),
        "protecting_tests": sorted(tests),
        "unprotected": sorted(unprotected),
        "blind_spots": sorted(blind_spots.values(), key=lambda b: b["id"]),
        "base_revision": base,
        "index_revision": graph["state"]["repository_revision"],
        "freshness": query.freshness(graph),
    }


def _is_production(rel: str) -> bool:
    return not rel.startswith(NON_PRODUCTION_PREFIXES)


# --- rendering ----------------------------------------------------------------


def _render(f: dict) -> str:
    """Emit the brief in the field order `docs/change-workflow.md` prescribes."""
    out: list[str] = []
    w = out.append

    w("# Change Impact Brief NNNN — TODO title")
    w("")
    w("| Field | Value |")
    w("|---|---|")
    w(f"| **Requested outcome** | {TODO} |")
    w(f"| **Owning unit** | {_or_none(_codes(f['units']))} |")
    w(f"| **Applicable contracts** | {_contracts(f['units'])} |")
    w(f"| **Governed by** | {_or_none(_adrs(f['governed_by']))} |")
    w(f"| **Rule IDs introduced** | {TODO} |")
    w(f"| **Entry points** | {_or_none(_codes(f['entry_points']))} |")
    w(f"| **Affected public surfaces** | {_surfaces(f['public_surfaces'])} |")
    w(f"| **Known dependents** | {_or_none(_codes(f['dependents']))} |")
    w(f"| **Uncertain / dynamic areas** | {_or_none(_spots(f['blind_spots']))} |")
    w(f"| **Analogous implementations** | {TODO} — see `./run similar <term>` |")
    w(f"| **Delivery Pattern** | {TODO} — one of the five in `docs/change-workflow.md` |")
    w(f"| **Required tests** | {TODO} |")
    w(f"| **Intended scope** | {TODO} |")
    w(f"| **Base revision** | `{f['base_revision'][:7]}` |")
    w(f"| **Index revision** | `{f['index_revision'][:7]}` |")
    w("")

    w("## What the index knows")
    w("")
    prod = f["production_paths"]
    if prod:
        w(f"**{len(prod)} production path(s) changed**, out of {len(f['changed_paths'])} total:")
        w("")
        for rel in prod:
            w(f"- `{rel}`")
    else:
        w(
            f"**No production path changed** — all {len(f['changed_paths'])} touched paths are "
            "documentation, rules, fixtures or workflow. `docs/change-workflow.md` requires a "
            "brief for changes to production code; record here why this one is or is not owed."
        )
    w("")

    if f["not_indexed"]:
        w("**Not in the index** — no impact answer exists for these, so nothing below covers them:")
        w("")
        for rel in f["not_indexed"]:
            w(f"- `{rel}`")
        w("")

    if f["public_surfaces"]:
        w("### Public surfaces")
        w("")
        w(
            "Decision **F2** treats these as externally consumed. A change to one of them "
            "follows expand → migrate → switch → contract, and an MCP tool name is a route "
            "handler function name — renaming the function breaks the tool."
        )
        w("")
        for surface in f["public_surfaces"]:
            tools = ", ".join(f"`{t}`" for t in surface["mcp_tools"]) or "none"
            w(f"- `{surface['route']}` → MCP tool(s): {tools}  ·  evidence `{surface['evidence']}`")
        w("")

    if f["protecting_tests"]:
        w("### Tests that already protect this")
        w("")
        for protects, test in f["protecting_tests"]:
            w(f"- `{test}` protects `{protects}`")
        w("")

    if f["unprotected"]:
        w("### Changed with no import-derived test protection")
        w("")
        w("The index found no test reaching these. That is a claim about imports, not proof")
        w("of absence — but it is where a required test most likely belongs.")
        w("")
        for rel in f["unprotected"]:
            w(f"- `{rel}`")
        w("")

    if f["blind_spots"]:
        w("### Blind spots relevant to this answer")
        w("")
        for spot in f["blind_spots"]:
            w(f"- **`{spot['id']}`** — {spot['statement']}")
        w("")

    fresh = f["freshness"]
    if fresh["status"] != "current":
        w(
            f"> **The index is {fresh['status']}.** Everything above may be wrong. "
            "Run `./run fix` and `./run index`, then regenerate."
        )
        w("")

    w("## Behaviour change")
    w("")
    w(TODO)

    return "\n".join(out)


def _or_none(rendered: str) -> str:
    return rendered or "**None.**"


def _codes(items: list[str]) -> str:
    return ", ".join(f"`{i}`" for i in items)


def _contracts(units: list[str]) -> str:
    """The root contract always applies; a scoped one applies when its unit is touched."""
    paths = ["AGENTS.md"]
    for scope in ("backend", "frontend"):
        if any(u.startswith(scope[:2]) for u in units) and (ROOT / scope / "AGENTS.md").exists():
            paths.append(f"{scope}/AGENTS.md")
    return ", ".join(f"`{p}`" for p in paths)


def _adrs(records: list[dict]) -> str:
    return ", ".join(f"[`{r['id']}`]({_repo_relative(r['file'])})" for r in records)


def _repo_relative(path: str | None) -> str:
    return f"../../{path}" if path else "#"


def _surfaces(surfaces: list[dict]) -> str:
    if not surfaces:
        return "**None.**"
    return ", ".join(f"`{s['route']}`" for s in surfaces)


def _spots(spots: list[dict]) -> str:
    return ", ".join(f"`{s['id']}`" for s in spots)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
