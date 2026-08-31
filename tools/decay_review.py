"""The recurring decay review — and the evidence that it happened.

Every other check in this repository answers "is this change allowed?". This one answers
"is the gate itself still worth trusting?", which no individual green run can.

Rules rot in ways a passing build cannot see. A ratchet that only ever rises has stopped
being a ratchet. A waiver whose expiry is three weeks out is a decision nobody has made
yet. An index whose extractors drifted answers confidently and wrongly. Each of those
leaves every check green, so the only way to catch them is to look on purpose, on a
schedule, and to leave behind something a machine can check was actually done.

So this command produces two things:

* a **report** for a human — six diagnostics, each saying what it measured and what it
  cannot see;
* **evidence** for the gate — `ops/decay-review.json`, carrying the repository revision,
  the index revision, the CI run id (or its recorded absence), the executed checks, the
  result, and a hash over all of it. `RULE-GOV-002` fails `verify` when that file is
  missing, older than the review period, or does not verify.

The evidence is designed to be *recomputed*, not trusted. The hash covers every field
except itself, and the recorded revision must be an ancestor of HEAD — so a report that
describes a revision this repository has never seen is refused rather than believed.

The review reports; it does not judge. Exit 0 means the review ran, whatever it found.
A diagnostic that failed the build would within two months have its threshold tuned until
it stopped failing, and this repository would have a seventh rule with no fixture. What
blocks the gate is `RULE-GOV-002` — that a review happened and its evidence verifies —
and that is deliberately all it blocks. See docs/adr/0030-the-decay-review.md.
"""

from __future__ import annotations

import argparse
import datetime as dt
import fnmatch
import hashlib
import itertools
import json
import os
import subprocess
import sys
import time
import tomllib
from collections import Counter
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]

# The index query layer is a script directory, not a package: `cli.py` and `mcp_server.py`
# reach their siblings by bare name, and this is the third adapter over the same layer.
sys.path.insert(0, str(ROOT / "tools" / "index"))

import query

EVIDENCE = ROOT / "ops" / "decay-review.json"
HISTORY = ROOT / "ops" / "decay-history.jsonl"
BASELINE = ROOT / "ops" / "structure-baseline.toml"

EVIDENCE_SCHEMA = 1

# The review period, in days. Monthly is the plan's cadence and the schedule the workflow
# runs; the gate tolerates one missed run before it goes red, because a governance rule
# that blocks the deploy on a single failed cron job gets switched off. See ADR 0030.
DUE_DAYS = 31
OVERDUE_DAYS = 45

# An expiry inside this horizon is reported as approaching. Three review periods, so the
# warning is seen at least twice before RULE-RULE-002 or RULE-SEC-002 stops the gate.
EXPIRY_HORIZON_DAYS = 93

# Co-change: how far back to look, and how large a commit may be before it stops being
# evidence of coupling. A commit touching thirty files says "this was a step", not "these
# two files belong together".
COCHANGE_WINDOW_DAYS = 365
COCHANGE_COMMIT_CAP = 15
COCHANGE_MIN_COMMITS = 3

COLD_AGENT_SUITE_VERSION = "1.0.0"
COLD_AGENT_QUERY_BUDGET = 6
COLD_AGENT_SECONDS_BUDGET = 5.0

EX_OK = 0
EX_TOOLING = 3
EX_STALE_INDEX = 4


class Tooling(RuntimeError):
    """The review could not be run. Nothing was measured, so nothing is claimed."""


# --- repository facts ---------------------------------------------------------


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        raise Tooling(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout


def architecture() -> dict:
    with open(ROOT / "architecture.toml", "rb") as fh:
        return tomllib.load(fh)


def unit_of(path: str, units: list[dict]) -> str | None:
    for unit in units:
        for pattern in unit["paths"]:
            if fnmatch.fnmatch(path, pattern) or (
                pattern.endswith("/**") and path.startswith(pattern[:-2])
            ):
                return unit["id"]
    return None


def boundary_report() -> dict:
    result = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "index" / "boundaries.py")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise Tooling(f"the boundary report could not run:\n{result.stderr}")
    return json.loads(result.stdout)


# --- 1. cycle inventory and trend ---------------------------------------------


def diagnose_cycles(boundaries: dict, history: list[dict]) -> dict:
    declared = [list(c) for c in boundaries["declared_cycles_still_present"]]
    new = [list(c) for c in boundaries["new_cycles"]]
    resolved = [list(c) for c in boundaries["declared_cycles_resolved"]]

    findings = []
    if new:
        findings.append(f"{len(new)} undeclared cycle(s) — RULE-ARCH-002 is failing")
    if resolved:
        findings.append(
            f"{len(resolved)} declared cycle(s) no longer exist and are still inventoried"
        )

    trend = _trend(history, "cycles_declared", len(declared))
    if trend["prior_reviews"] == 0:
        findings.append(
            "no trend: this is the first recorded review, so the inventory has a value "
            "and no direction. The second review is the first one that can say anything."
        )
    elif trend["delta"] is not None and trend["delta"] > 0:
        findings.append(
            f"the cycle inventory grew by {trend['delta']} since the previous review — "
            "a ratchet that may only shrink has moved the wrong way"
        )

    return {
        "name": "cycles",
        "summary": f"{len(declared)} declared, {len(new)} new, {len(resolved)} resolved-but-declared",
        "declared": declared,
        "new": new,
        "resolved_still_declared": resolved,
        "trend": trend,
        "findings": findings,
        "does_not_cover": (
            "cycles between units only. A cycle inside a unit is invisible to "
            "architecture.toml and therefore to this count."
        ),
    }


def _trend(history: list[dict], key: str, current: int) -> dict:
    prior = [row for row in history if key in row]
    if not prior:
        return {"prior_reviews": 0, "previous": None, "current": current, "delta": None}
    previous = prior[-1][key]
    return {
        "prior_reviews": len(prior),
        "previous": previous,
        "current": current,
        "delta": current - previous,
        "since": prior[-1].get("date"),
    }


# --- 2. hub baselines ---------------------------------------------------------


def diagnose_hubs(boundaries: dict, history: list[dict]) -> dict:
    """Fan-in baselines, and who raised each one.

    `RULE-ARCH-003` forbids a hub growing *silently*, not a hub growing. Since 16b one of
    the raises is performed by `./run scaffold` itself (`RISK-ARCH-001`), so the number
    alone no longer distinguishes "somebody should look at this" from "the generator ran".
    The attribution below is what restores the distinction: a raise is machine-attributed
    when the comment block above the entry names a repository command, human-attributed
    when it carries prose, and unattributed when it carries nothing at all — and the last
    of those is the one worth reading, because it is a ratchet nobody explained.
    """
    entries = _baseline_entries()
    machine = [e for e in entries if e["raised_by"] == "machine"]
    unattributed = [e for e in entries if e["raised_by"] == "unattributed"]
    regressions = boundaries["hub_regressions"]

    findings = []
    if regressions:
        findings.append(f"{len(regressions)} hub(s) over baseline — RULE-ARCH-003 is failing")
    if machine:
        findings.append(
            f"{len(machine)} baseline(s) raised by a repository command, not by a person: "
            + ", ".join(e["file"] for e in machine)
            + " (RISK-ARCH-001). Its re-open trigger is a third generated backend feature."
        )
    if unattributed:
        findings.append(
            f"{len(unattributed)} baseline(s) carry no comment saying who raised them or "
            "why: " + ", ".join(e["file"] for e in unattributed)
        )

    trend = _trend(history, "hub_baseline_total", sum(e["value"] for e in entries))
    if trend["delta"] is not None and trend["delta"] > 0:
        findings.append(
            f"the summed fan-in baseline rose by {trend['delta']} since the previous review"
        )

    return {
        "name": "hubs",
        "summary": (
            f"{len(entries)} baseline(s), {len(machine)} machine-raised, "
            f"{len(unattributed)} unattributed, {len(regressions)} over baseline"
        ),
        "entries": entries,
        "regressions": regressions,
        "allowlisted": _baseline_allowlist(),
        "trend": trend,
        "findings": findings,
        "does_not_cover": (
            "allowlisted files have no baseline at all, so growth there is invisible by "
            "design; and attribution is read from a comment, which nothing enforces."
        ),
    }


def _baseline_entries() -> list[dict]:
    """Every `\"path\" = N` in the baseline, with the comment block directly above it."""
    entries: list[dict] = []
    comment: list[str] = []
    in_hubs = False
    for line in BASELINE.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped == "[hubs]":
            in_hubs = True
            comment = []
            continue
        if not in_hubs:
            continue
        if stripped.startswith("#"):
            comment.append(stripped.lstrip("# ").rstrip())
            continue
        if not stripped:
            comment = []
            continue
        if "=" in stripped:
            path, _, value = stripped.partition("=")
            note = " ".join(comment)
            if not note:
                raised = "unattributed"
            elif "`./run " in note or "`make " in note:
                raised = "machine"
            else:
                raised = "human"
            entries.append(
                {
                    "file": path.strip().strip('"'),
                    "value": int(value.strip()),
                    "raised_by": raised,
                    "note": note or None,
                }
            )
            comment = []
    return entries


def _baseline_allowlist() -> list[str]:
    with open(BASELINE, "rb") as fh:
        return list(tomllib.load(fh).get("allowlist", []))


# --- 3. co-change against the declared units ----------------------------------

# Files whose coupling is *declared*, not accidental: AGENTS.md section 9 requires a rule
# change to touch the check, the ledger, the contract and the fixture in one commit, and
# RULE-TI-001 requires the Makefile, the dispatcher and the reference to agree. Those
# co-change constantly and correctly. Counting them as decay would report this
# repository's own governance discipline as a structural problem, and the real signal
# would be buried under it.
GOVERNANCE_COHORT = (
    "rules/",
    "tools/checks/",
    "tools/fixtures/",
    "docs/",
    ".github/",
    "architecture.toml",
    "AGENTS.md",
    "backend/AGENTS.md",
    "frontend/AGENTS.md",
    "CLAUDE.md",
    "README.md",
    "run",
    "Makefile",
)


def _governance(path: str) -> bool:
    return path.startswith(GOVERNANCE_COHORT) or path in ("run", "Makefile")


def diagnose_cochange(units: list[dict]) -> dict:
    since = (dt.date.today() - dt.timedelta(days=COCHANGE_WINDOW_DAYS)).isoformat()
    raw = git(
        "log",
        "--no-merges",
        f"--since={since}",
        "--format=%x00%H",
        "--name-only",
    )
    commits: list[list[str]] = []
    for chunk in raw.split("\x00"):
        lines = [line for line in chunk.splitlines() if line.strip()]
        if lines:
            commits.append(lines[1:])

    considered = [c for c in commits if 1 < len(c) <= COCHANGE_COMMIT_CAP]
    pairs: Counter[tuple[str, str]] = Counter()
    for files in considered:
        for left, right in itertools.combinations(sorted(set(files)), 2):
            pairs[(left, right)] += 1

    crossing = []
    for (left, right), count in pairs.items():
        if count < COCHANGE_MIN_COMMITS:
            continue
        left_unit, right_unit = unit_of(left, units), unit_of(right, units)
        if not left_unit or not right_unit or left_unit == right_unit:
            continue
        crossing.append(
            {
                "files": [left, right],
                "units": [left_unit, right_unit],
                "commits": count,
                "explained_by": (
                    "the meta-rule and the task-interface agreement rules"
                    if _governance(left) and _governance(right)
                    else None
                ),
            }
        )
    crossing.sort(key=lambda row: (-row["commits"], row["files"]))
    unexplained = [row for row in crossing if row["explained_by"] is None]

    findings = []
    if len(considered) < 20:
        findings.append(
            f"only {len(considered)} commit(s) in the window are small enough to be "
            "evidence of coupling; every pair below is weak evidence and none of it is "
            "a ratchet"
        )
    for row in unexplained[:5]:
        findings.append(
            f"{row['files'][0]} and {row['files'][1]} changed together in "
            f"{row['commits']} commits but live in {row['units'][0]} and {row['units'][1]}"
        )

    return {
        "name": "co-change",
        "summary": (
            f"{len(crossing)} cross-unit pair(s) at >= {COCHANGE_MIN_COMMITS} commits, "
            f"{len(unexplained)} of them not explained by a declared coupling"
        ),
        "window_days": COCHANGE_WINDOW_DAYS,
        "commits_in_window": len(commits),
        "commits_considered": len(considered),
        "commit_cap": COCHANGE_COMMIT_CAP,
        "min_commits": COCHANGE_MIN_COMMITS,
        "pairs": crossing[:20],
        "findings": findings,
        "does_not_cover": (
            "co-change is correlation over commits, and this repository's commits are "
            "plan steps. It cannot distinguish two files that belong together from two "
            "files that were edited on the same afternoon, and it says nothing at all "
            "about files that change rarely."
        ),
    }


# --- 4. waivers, shims, and the quarantine inventory that does not exist -------


def diagnose_expiries() -> dict:
    today = dt.date.today()
    horizon = today + dt.timedelta(days=EXPIRY_HORIZON_DAYS)

    def dated(entries: list[dict], kind: str) -> list[dict]:
        out = []
        for entry in entries:
            expires = entry.get("expires")
            if not isinstance(expires, dt.date):
                out.append({"id": entry.get("id"), "kind": kind, "expires": None, "days": None})
                continue
            out.append(
                {
                    "id": entry.get("id"),
                    "kind": kind,
                    "expires": expires.isoformat(),
                    "days": (expires - today).days,
                    "owner": entry.get("owner"),
                }
            )
        return out

    waivers = yaml.safe_load((ROOT / "rules" / "waivers.yaml").read_text(encoding="utf-8"))
    shims = yaml.safe_load((ROOT / "rules" / "shims.yaml").read_text(encoding="utf-8"))
    inventory = dated(waivers.get("waivers", []), "waiver") + dated(shims.get("shims", []), "shim")
    inventory.sort(key=lambda row: (row["days"] is None, row["days"]))

    expired = [row for row in inventory if row["days"] is not None and row["days"] < 0]
    approaching = [
        row
        for row in inventory
        if row["days"] is not None and 0 <= row["days"] <= EXPIRY_HORIZON_DAYS
    ]

    findings = []
    for row in expired:
        findings.append(f"{row['id']} expired on {row['expires']} — the gate is already red")
    for row in approaching:
        findings.append(
            f"{row['id']} expires on {row['expires']}, in {row['days']} day(s): decide "
            "now, because on that date it stops the gate"
        )
    if not expired and not approaching:
        findings.append(
            f"nothing expires inside {EXPIRY_HORIZON_DAYS} days; the nearest is "
            f"{inventory[0]['id']} in {inventory[0]['days']} day(s)"
        )

    return {
        "name": "expiries",
        "summary": (
            f"{len(inventory)} dated exception(s): {len(expired)} expired, "
            f"{len(approaching)} inside the {EXPIRY_HORIZON_DAYS}-day horizon"
        ),
        "horizon_days": EXPIRY_HORIZON_DAYS,
        "inventory": inventory,
        "resolved_waivers": [w.get("id") for w in waivers.get("resolved", [])],
        "quarantine": {
            "inventory": "none",
            "note": (
                "The plan names a quarantine inventory alongside the waiver and shim "
                "registers. This repository never built one: the ratchet that occupies "
                "that role is the cycle inventory in architecture.toml `known_cycles`, "
                "reported above, and it carries no expiry date — only a teardown path."
            ),
        },
        "findings": findings,
        "does_not_cover": (
            "an exception that was never written down. Nothing detects a decision that "
            "was made and not registered; that is what the registers are for."
        ),
    }


# --- 5. index quality ---------------------------------------------------------


def diagnose_index(units: list[dict]) -> dict:
    graph = query.load()
    state = graph["state"]
    fresh = query.freshness(graph)

    node_classes = Counter(n.get("evidence", "?") for n in graph["nodes"].values())
    edge_classes = Counter(e.get("evidence", "?") for e in graph["edges"])
    edge_kinds = Counter(e["kind"] for e in graph["edges"])

    tracked = [line for line in git("ls-files").splitlines() if line]
    unowned = sorted(path for path in tracked if unit_of(path, units) is None)

    findings = []
    if fresh["status"] != "current":
        findings.append("the index is STALE — every measurement above it is unreliable")
    if unowned:
        findings.append(
            f"{len(unowned)} tracked file(s) belong to no declared unit: "
            + ", ".join(unowned[:5])
        )
    soft = edge_classes.get("SEMANTIC_MATCH", 0) + edge_classes.get("UNKNOWN", 0)
    if soft:
        findings.append(
            f"{soft} edge(s) carry SEMANTIC_MATCH or UNKNOWN; neither is an authoritative "
            "edge and no answer may present one as a fact"
        )

    return {
        "name": "index-quality",
        "summary": (
            f"{state['node_count']} nodes, {state['edge_count']} edges, "
            f"{state['file_count']} files, {state['blind_spot_count']} blind spots, "
            f"index {fresh['status']}"
        ),
        "schema_version": state["schema_version"],
        "freshness": fresh["status"],
        "counts": {
            "files": state["file_count"],
            "nodes": state["node_count"],
            "edges": state["edge_count"],
            "blind_spots": state["blind_spot_count"],
        },
        "node_evidence_classes": dict(sorted(node_classes.items())),
        "edge_evidence_classes": dict(sorted(edge_classes.items())),
        "edge_kinds": dict(sorted(edge_kinds.items())),
        "blind_spots": sorted(spot["id"] for spot in graph["blind_spots"]),
        "unowned_tracked_files": unowned,
        "findings": findings,
        "does_not_cover": (
            "whether the extractors are right. Every number here is produced by the "
            "thing being measured; RULE-IDX-003's qualification suite is what tests the "
            "extractors against known answers, and a drift both would share is invisible "
            "to both."
        ),
    }


# --- 6. the reduced Cold-Agent Change Test ------------------------------------


def diagnose_cold_agent() -> dict:
    """The decision procedure of AGENTS.md section 2, executed against a cold index load.

    The full Cold-Agent Change Test belongs to 16d: three real change requests, a session
    with no prior knowledge, a `grep` baseline to compare against, and a human judging
    whether the answers were *used*. None of that is mechanisable, which is why it is a
    benchmark run and not a check.

    What is reduced here is the agent, not the index. This runs one change request through
    the four steps the contract requires — locate the owner, read the scoped contract,
    assess the blast radius, find the protecting tests — from a fresh process with no
    cache, and asserts the facts a change of that shape would need, inside a query and
    time budget. It is a test of whether the index can still *answer*; 16d tests whether
    an agent asked.
    """
    scenario = (
        "Add a field to the response of the task-update endpoint — a public-surface "
        "change to backend/app/routers/tasks.py."
    )
    started = time.monotonic()
    queries = 0
    assertions: list[dict] = []

    def assert_that(name: str, ok: bool, detail: str) -> None:
        assertions.append({"assertion": name, "passed": bool(ok), "detail": detail})

    graph = query.load()

    located = query.locate(graph, "task_service")
    queries += 1
    owners = {match.get("unit") for match in located["result"].get("matches", [])}
    assert_that(
        "step 1 — the owner of the changed behaviour resolves to a unit",
        "be/services" in owners,
        f"units returned: {sorted(o for o in owners if o)}",
    )
    assert_that(
        "every answer carries an index revision and a freshness verdict",
        bool(located.get("index_revision")) and located["freshness"]["status"] == "current",
        f"index_revision={located.get('index_revision', '')[:8]} "
        f"freshness={located['freshness']['status']}",
    )

    assert_that(
        "step 2 — the scoped contract the owner points at exists",
        (ROOT / "backend" / "AGENTS.md").exists(),
        "backend/AGENTS.md",
    )

    blast = query.impact(graph, "backend/app/routers/tasks.py")
    queries += 1
    result = blast["result"]
    surfaces = result["connected_public_surfaces"]
    assert_that(
        "step 3 — the blast radius names the connected public surfaces",
        len(surfaces) > 0,
        f"{len(surfaces)} route(s)",
    )
    assert_that(
        "step 3 — every connected surface names its MCP tool",
        bool(surfaces) and all(s["mcp_tools"] for s in surfaces),
        f"{sum(len(s['mcp_tools']) for s in surfaces)} tool name(s)",
    )
    assert_that(
        "step 3 — the answer reports its own blind spots",
        "blind_spots" in blast,
        f"{len(blast['blind_spots'])} relevant blind spot(s)",
    )
    assert_that(
        "step 3 — the protecting tests are named, and unprotected files are listed",
        len(result["protecting_tests"]) > 0
        and "files_without_import_derived_test_protection" in result,
        f"{len(result['protecting_tests'])} test edge(s)",
    )

    path = query.flow(graph, "backend/app/services/task_runner.py")
    queries += 1
    assert_that(
        "step 3 — an end-to-end path exists from a REST route to the adapter",
        len(path["result"].get("paths", [])) > 0,
        f"{len(path['result'].get('paths', []))} path(s)",
    )

    shared = query.impact(graph, "backend/app/models.py")
    queries += 1
    assert_that(
        "step 3 — a shared-kernel change reports its dependents",
        len(shared["result"]["direct_dependents"]) > 0,
        f"{len(shared['result']['direct_dependents'])} direct dependent(s)",
    )

    declared_classes = {
        "STATIC_CONFIRMED",
        "CONFIG_CONFIRMED",
        "CONTRACT_DECLARED",
        "RUNTIME_OBSERVED",
        "SEMANTIC_MATCH",
        "UNKNOWN",
    }
    authoritative = {"IMPORTS", "DEPENDS_ON", "EXPOSES", "DEFINES", "CALLS", "INJECTS"}
    invented = [
        edge
        for edge in graph["edges"]
        if edge["kind"] in authoritative and edge.get("evidence") in {"SEMANTIC_MATCH", "UNKNOWN"}
    ]
    undeclared = [e for e in graph["edges"] if e.get("evidence") not in declared_classes]
    assert_that(
        "zero invented authoritative edges",
        not invented and not undeclared,
        f"{len(invented)} guessed, {len(undeclared)} outside the declared evidence classes",
    )

    elapsed = round(time.monotonic() - started, 3)
    assert_that(
        "inside the query budget",
        queries <= COLD_AGENT_QUERY_BUDGET,
        f"{queries} of {COLD_AGENT_QUERY_BUDGET}",
    )
    assert_that(
        "inside the time budget",
        elapsed <= COLD_AGENT_SECONDS_BUDGET,
        f"{elapsed}s of {COLD_AGENT_SECONDS_BUDGET}s",
    )

    failed = [a for a in assertions if not a["passed"]]
    findings = [f"cold-agent assertion failed: {a['assertion']} ({a['detail']})" for a in failed]

    return {
        "name": "cold-agent-change-reduced",
        "summary": f"{len(assertions) - len(failed)}/{len(assertions)} assertions, "
        f"{queries} queries, {elapsed}s",
        "suite_version": COLD_AGENT_SUITE_VERSION,
        "scenario": scenario,
        "queries": queries,
        "elapsed_seconds": elapsed,
        "assertions": assertions,
        "findings": findings,
        "does_not_cover": (
            "the agent. It does not run a session, so it cannot show that an agent "
            "queried the index instead of grepping (RISK-DOC-001), cannot compare the "
            "result against a grep/manual baseline, cannot judge whether the contract "
            "was read or the Delivery Pattern chosen, and covers one change request "
            "rather than the three the plan requires. It also carries this session's "
            "toolchain rather than a cold one. All of that is 16d."
        ),
    }


# --- evidence -----------------------------------------------------------------


def report_hash(record: dict[str, Any]) -> str:
    body = {k: v for k, v in record.items() if k != "report_sha256"}
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def ci_context() -> dict:
    """The CI run id, or an honest record of its absence.

    A locally-run review is a real review — it ran the same code over the same revision —
    but nothing outside the operator's machine attests to it. Inventing a run id would
    make the two indistinguishable, which is the one thing this field exists to prevent.
    """
    run_id = os.environ.get("GITHUB_RUN_ID")
    if not run_id:
        return {
            "run_id": None,
            "url": None,
            "absent_reason": "run outside CI; GITHUB_RUN_ID is unset (see RISK-GOV-004)",
        }
    server = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    return {
        "run_id": run_id,
        "url": f"{server}/{repo}/actions/runs/{run_id}" if repo else None,
        "attempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
        "absent_reason": None,
    }


def read_history() -> list[dict]:
    if not HISTORY.exists():
        return []
    rows = []
    for line in HISTORY.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def build_record(checks: list[dict], history: list[dict]) -> dict:
    index_state = json.loads((ROOT / "index" / "state.json").read_text(encoding="utf-8"))
    findings = [
        {"check": check["name"], "message": message}
        for check in checks
        for message in check["findings"]
    ]
    record: dict[str, Any] = {
        "schema": EVIDENCE_SCHEMA,
        "generated_at": dt.date.today().isoformat(),
        "review_period_days": DUE_DAYS,
        "overdue_after_days": OVERDUE_DAYS,
        "repo_revision": git("rev-parse", "HEAD").strip(),
        "repo_dirty": bool(git("status", "--porcelain").strip()),
        "index_revision": index_state["repository_revision"],
        "index_sources_sha256": index_state["sources_sha256"],
        "ci": ci_context(),
        "executed_checks": checks,
        "prior_reviews": len(history),
        "result": "attention" if findings else "ok",
        "findings": findings,
    }
    record["report_sha256"] = report_hash(record)
    return record


def history_row(record: dict, checks: dict[str, dict]) -> dict:
    expiries = [
        row["days"] for row in checks["expiries"]["inventory"] if row["days"] is not None
    ]
    return {
        "date": record["generated_at"],
        "repo_revision": record["repo_revision"],
        "report_sha256": record["report_sha256"],
        "ci_run_id": record["ci"]["run_id"],
        "result": record["result"],
        "cycles_declared": len(checks["cycles"]["declared"]),
        "cycles_new": len(checks["cycles"]["new"]),
        "hub_baseline_total": sum(e["value"] for e in checks["hubs"]["entries"]),
        "hub_baselines_machine_raised": sum(
            1 for e in checks["hubs"]["entries"] if e["raised_by"] == "machine"
        ),
        "cochange_unexplained": sum(
            1 for p in checks["co-change"]["pairs"] if p["explained_by"] is None
        ),
        "nearest_expiry_days": min(expiries) if expiries else None,
        "nodes": checks["index-quality"]["counts"]["nodes"],
        "edges": checks["index-quality"]["counts"]["edges"],
        "blind_spots": checks["index-quality"]["counts"]["blind_spots"],
        "cold_agent_failed": sum(
            1 for a in checks["cold-agent-change-reduced"]["assertions"] if not a["passed"]
        ),
    }


def persist(record: dict, row: dict) -> None:
    EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    with HISTORY.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n")

    # The index reads `git ls-files`, so an unstaged evidence file is invisible to it and
    # the rebuild below would produce a hash the next `verify` disagrees with. Staging is
    # the same reason `./run scaffold` stages: what to commit stays a decision, but being
    # seen at all does not.
    subprocess.run(
        ["git", "add", str(EVIDENCE.relative_to(ROOT)), str(HISTORY.relative_to(ROOT))],
        cwd=ROOT,
        check=False,
        capture_output=True,
    )
    subprocess.run(
        [sys.executable, str(ROOT / "tools" / "index" / "build.py")],
        cwd=ROOT,
        check=False,
        capture_output=True,
    )


# --- output -------------------------------------------------------------------


def render(record: dict) -> str:
    lines = ["decay review — " + record["generated_at"], ""]
    lines.append(f"  repo revision   {record['repo_revision'][:12]}"
                 + ("  (working tree dirty)" if record["repo_dirty"] else ""))
    lines.append(f"  index revision  {record['index_revision'][:12]}")
    ci = record["ci"]
    lines.append(
        f"  ci run id       {ci['run_id']}" if ci["run_id"] else f"  ci run id       none — {ci['absent_reason']}"
    )
    lines.append(f"  prior reviews   {record['prior_reviews']}")
    lines.append("")
    for check in record["executed_checks"]:
        lines.append(f"  {check['name']}")
        lines.append(f"    {check['summary']}")
        for message in check["findings"]:
            lines.append(f"    - {message}")
        lines.append(f"    not covered: {check['does_not_cover']}")
        lines.append("")
    lines.append(f"  result          {record['result'].upper()} — {len(record['findings'])} finding(s)")
    lines.append(f"  report sha256   {record['report_sha256']}")
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        prog="./run decay-review",
        description="Run the recurring decay review and write verifiable evidence of it.",
    )
    parser.add_argument(
        "--no-write",
        action="store_true",
        help="report only: write no evidence, stage nothing, rebuild nothing",
    )
    args = parser.parse_args(argv)
    as_json = os.environ.get("RUNWAY_JSON") == "1"

    # Four of the six diagnostics read the index, so a stale one would produce evidence
    # that looks authoritative and describes a tree that no longer exists. Exit 4 is the
    # documented code for exactly that: the answer would have been unreliable, so no
    # answer was given.
    try:
        stale = query.freshness(query.load())["status"] != "current"
    except query.IndexUnavailable as exc:
        stale, exc_message = True, str(exc)
    else:
        exc_message = "the index is stale — run `make fix`, then run the review again"
    if stale:
        if as_json:
            print(
                json.dumps(
                    {"command": "decay-review", "status": "stale_index", "error": exc_message}
                )
            )
        else:
            print(f"the decay review was not run: {exc_message}", file=sys.stderr)
        return EX_STALE_INDEX

    try:
        units = architecture()["units"]
        boundaries = boundary_report()
        history = read_history()
        checks = [
            diagnose_cycles(boundaries, history),
            diagnose_hubs(boundaries, history),
            diagnose_cochange(units),
            diagnose_expiries(),
            diagnose_index(units),
            diagnose_cold_agent(),
        ]
        record = build_record(checks, history)
    except (Tooling, OSError, ValueError, KeyError) as exc:
        if as_json:
            print(json.dumps({"command": "decay-review", "status": "tooling_error",
                              "error": str(exc)}))
        else:
            print(f"the decay review could not run: {exc}", file=sys.stderr)
        return EX_TOOLING

    if not args.no_write:
        persist(record, history_row(record, {c["name"]: c for c in checks}))

    if as_json:
        print(json.dumps(record, sort_keys=True))
    else:
        print(render(record))
        if not args.no_write:
            print()
            print(f"  evidence        {EVIDENCE.relative_to(ROOT)} (staged)")
            print(f"  history         {HISTORY.relative_to(ROOT)} (staged)")
    return EX_OK


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
