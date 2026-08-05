"""CLI adapter over the canonical query layer.

Adds presentation and nothing else. Every fact it prints comes from `query.py`, which is
what makes fact-level parity with the MCP adapter provable rather than hoped for.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import query  # noqa: E402

EX_OK, EX_NEEDS_INPUT, EX_TOOLING, EX_STALE = 0, 2, 3, 4


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        _usage()
        return EX_NEEDS_INPUT

    name = argv[0]
    if name not in query.QUERIES:
        print(f"unknown query: {name}", file=sys.stderr)
        _usage()
        return EX_NEEDS_INPUT

    as_json = "--json" in argv or __import__("os").environ.get("RUNWAY_JSON") == "1"
    args = [a for a in argv[1:] if not a.startswith("--")]

    fn, _ = query.QUERIES[name]
    if name != "violations" and not args:
        print(f"needs input: `{name}` requires a target", file=sys.stderr)
        print(f"  example: ./run {name} backend/app/services/task_runner.py", file=sys.stderr)
        return EX_NEEDS_INPUT

    try:
        graph = query.load()
    except query.IndexUnavailable as exc:
        print(f"  {exc}", file=sys.stderr)
        return EX_STALE

    answer = fn(graph) if name == "violations" else fn(graph, args[0])

    if as_json:
        print(json.dumps(answer, indent=2, sort_keys=True))
    else:
        _render(answer)

    return EX_STALE if answer["freshness"]["status"] == "STALE" else EX_OK


def _usage() -> None:
    print("usage: ./run <query> [target] [--json]\n", file=sys.stderr)
    for name, (_, description) in query.QUERIES.items():
        print(f"  {name:<12} {description}", file=sys.stderr)


def _render(answer: dict) -> None:
    print(f"# {answer['query']}")
    print()
    _render_result(answer["result"], indent="  ")
    print()
    fresh = answer["freshness"]
    marker = "" if fresh["status"] == "current" else "  <-- ANSWER MAY BE WRONG"
    print(f"  index      {fresh['status']}{marker}")
    print(f"  revision   {answer['index_revision'][:12]} (schema {answer['schema_version']})")
    cov = answer["coverage"]
    print(f"  coverage   {cov['files']} files, {cov['nodes']} nodes, {cov['edges']} edges")
    if answer["blind_spots"]:
        print()
        print("  BLIND SPOTS RELEVANT TO THIS ANSWER")
        for spot in answer["blind_spots"]:
            print(f"    {spot['id']}  {spot['statement']}")
    else:
        print("  blind spots  none relevant to this answer")


def _render_result(value, indent: str) -> None:
    if isinstance(value, dict):
        for key, val in value.items():
            if val in ([], {}, None, ""):
                continue
            if isinstance(val, (list, dict)) and val:
                print(f"{indent}{key}:")
                _render_result(val, indent + "  ")
            else:
                print(f"{indent}{key}: {val}")
    elif isinstance(value, list):
        for item in value:
            if isinstance(item, dict):
                summary = ", ".join(
                    f"{k}={v}" for k, v in item.items() if not isinstance(v, (list, dict))
                )
                print(f"{indent}- {summary}")
                for k, v in item.items():
                    if isinstance(v, (list, dict)) and v:
                        print(f"{indent}    {k}: {v}")
            else:
                print(f"{indent}- {item}")
    else:
        print(f"{indent}{value}")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
