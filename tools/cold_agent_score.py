#!/usr/bin/env python3
"""Score one Cold-Agent benchmark run against ops/cold-agent/criteria.md.

    backend/.venv/bin/python tools/cold_agent_score.py ops/cold-agent/runs/<file>.json

This is not a gate. It runs when a human runs a benchmark, and its job is narrow and
deliberate: make a run *scoreable* rather than remembered. It applies the parts of the
criteria a machine can apply — the precondition verdict, the budgets, the arithmetic of
"close does not pass", that every criterion is marked, that every authoritative claim
cites a query, that every miss carries a class and a correction — and it refuses to score
a record that is incomplete.

What it deliberately does NOT do is read the transcript or judge an answer. Marking a
criterion pass or fail is the operator's judgment and cannot be automated; if it could,
the benchmark would be a check and would live in `verify`. What can be automated is the
part that gets fudged under time pressure: leaving a criterion unmarked, rounding eleven
of twelve up to a pass, scoring against criteria that were adjusted after the result was
seen, and reporting a contaminated run as a fail rather than as void.

Exit codes follow the repository's convention (docs/task-interface.md):

    0  the run passes
    1  the run fails
    2  the record is incomplete, or the precondition voids the run
    3  the file could not be read or names criteria this scorer does not know
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]

# The versions of ops/cold-agent/criteria.md this scorer implements. A record naming any
# other version is refused rather than scored approximately: a run scored against criteria
# the scorer has guessed at is exactly the "close enough" the criteria forbid.
SUPPORTED_CRITERIA = {"1.0.0"}

INDEX_TEST_IDS = [f"IT-{n:02d}" for n in range(1, 13)]
METHOD_POINT_IDS = ["MP-1", "MP-2", "MP-3", "MP-4"]
REQUESTS = ["R1", "R2", "R3"]
MISS_CLASSES = {"M1", "M2", "M3", "M4", "M5", "M6"}

INDEX_QUERY_BUDGET = 12
INDEX_SECONDS_BUDGET = 15 * 60
REQUEST_QUERY_BUDGET = 20
REQUEST_SECONDS_BUDGET = 30 * 60
CHANGE_QUERY_BUDGET = 50
CHANGE_SECONDS_BUDGET = 75 * 60

EXPECTED_FACT_FLOOR = 0.8
BLIND_SPOT_COUNT = 7

EX_OK, EX_FAIL, EX_INCOMPLETE, EX_TOOLING = 0, 1, 2, 3


class Incomplete(Exception):
    """The record cannot be scored, as opposed to failing."""


def require(record: dict[str, Any], *path: str) -> Any:
    """Fetch a required field, or refuse to score the record."""
    node: Any = record
    for key in path:
        if not isinstance(node, dict) or key not in node:
            raise Incomplete(f"missing field: {'.'.join(path)}")
        node = node[key]
    if node is None or node == "":
        raise Incomplete(f"empty field: {'.'.join(path)}")
    return node


def mark(results: list[tuple[bool, str]], ok: bool, text: str) -> None:
    results.append((ok, text))


def scored_result(entry: dict[str, Any], where: str) -> bool:
    """Read one pass/fail mark, refusing an unmarked or template-valued one."""
    value = str(entry.get("result", "")).strip().lower()
    if value in {"pass", "fail"}:
        return value == "pass"
    raise Incomplete(f"{where} is not marked pass or fail (found {entry.get('result')!r})")


# --- the sections -------------------------------------------------------------


def score_precondition(record: dict[str, Any], out: list[tuple[bool, str]]) -> None:
    """criteria.md section 2. A contaminated session voids the run — it is not a fail."""
    pre = require(record, "precondition")
    control = require(record, "precondition", "p4_negative_control")

    require(record, "precondition", "p1_purge_command")
    require(record, "precondition", "p2_launch_command")
    require(record, "precondition", "p5_check_output")

    if pre.get("p2_resume_flags_used"):
        raise Incomplete("precondition: the session was resumed, so it was not cold — void")
    if not pre.get("p3_cache_paths_checked"):
        raise Incomplete("precondition: no cache path was checked (P3)")
    if str(control.get("verdict", "")).lower() != "cold":
        raise Incomplete("precondition: the negative control did not return cold (P4) — void")
    if control.get("banned_tokens_found"):
        raise Incomplete(
            "precondition: the negative control found banned tokens "
            f"({', '.join(control['banned_tokens_found'])}) — void"
        )
    if str(pre.get("verdict", "")).lower() != "cold":
        raise Incomplete("precondition: the operator's verdict is not cold — void")
    if not record.get("gate_green_before"):
        raise Incomplete("precondition: the gate was not green before the session (P5)")

    mark(out, True, "precondition evidenced: purge, fresh launch, caches, negative control, green gate")


def score_inventions(record: dict[str, Any], out: list[tuple[bool, str]]) -> bool:
    """criteria.md section 4. One invention fails the whole run."""
    claims = record.get("authoritative_claims")
    if claims is None:
        raise Incomplete("missing field: authoritative_claims")

    invented = []
    for index, claim in enumerate(claims):
        text = claim.get("claim", f"claim {index}")
        if claim.get("invented_by_rule"):
            invented.append(f"{text} (rule {claim['invented_by_rule']})")
        elif not claim.get("cited_query"):
            invented.append(f"{text} (rule 3: attributed but no query cited)")
        elif claim.get("verified") is not True:
            invented.append(f"{text} (not verified against the recorded index revision)")

    for item in invented:
        mark(out, False, f"invented authoritative fact — {item}")
    if not invented:
        mark(out, True, f"zero invented authoritative edges over {len(claims)} claim(s)")
    return not invented


def score_index_test(record: dict[str, Any], out: list[tuple[bool, str]]) -> bool:
    """criteria.md section 5. Twelve of twelve, or it is a fail."""
    section = require(record, "index_test")
    marks = {entry.get("id"): entry for entry in section.get("criteria", [])}

    missing = [cid for cid in INDEX_TEST_IDS if cid not in marks]
    if missing:
        raise Incomplete(f"index test: unmarked criteria {', '.join(missing)}")

    passed = 0
    for cid in INDEX_TEST_IDS:
        if scored_result(marks[cid], f"index test {cid}"):
            passed += 1
        else:
            mark(out, False, f"index test {cid} failed — {marks[cid].get('evidence', '')}")

    ok = passed == len(INDEX_TEST_IDS)
    mark(out, ok, f"index test: {passed} of {len(INDEX_TEST_IDS)} — twelve of twelve is the pass mark")

    flagged = section.get("blind_spots_flagged")
    if flagged is None:
        raise Incomplete("index test: blind_spots_flagged is missing")
    spots_ok = len(set(flagged)) == BLIND_SPOT_COUNT
    mark(out, spots_ok, f"blind spots flagged: {len(set(flagged))} of {BLIND_SPOT_COUNT}")

    budget_ok = score_budget(
        out, "index test", section, INDEX_QUERY_BUDGET, INDEX_SECONDS_BUDGET
    )
    return ok and spots_ok and budget_ok


def score_budget(
    out: list[tuple[bool, str]],
    label: str,
    section: dict[str, Any],
    queries: int,
    seconds: int,
) -> bool:
    used_q = require(section, "queries") if section.get("queries") else section.get("queries", 0)
    used_s = section.get("wall_seconds")
    if used_s is None:
        raise Incomplete(f"{label}: wall_seconds is missing")
    q_ok, s_ok = used_q <= queries, used_s <= seconds
    mark(out, q_ok, f"{label}: {used_q} of {queries} queries")
    mark(out, s_ok, f"{label}: {used_s}s of {seconds}s")
    return q_ok and s_ok


def score_change_test(record: dict[str, Any], out: list[tuple[bool, str]]) -> bool:
    """criteria.md section 6 and 7. All mandatory facts, 80% of expected, all four method points."""
    sections = record.get("change_test")
    if not sections:
        raise Incomplete("missing field: change_test")

    seen = [entry.get("request") for entry in sections]
    missing = [rid for rid in REQUESTS if rid not in seen]
    if missing:
        raise Incomplete(f"change test: no record for {', '.join(missing)}")

    all_ok = True
    total_queries = 0
    total_seconds = 0
    for entry in sections:
        rid = entry.get("request")
        total_queries += entry.get("queries", 0)
        total_seconds += entry.get("wall_seconds", 0)

        mandatory_total = require(entry, "mandatory_total")
        mandatory_hit = entry.get("mandatory_hit")
        expected_total = require(entry, "expected_total")
        expected_hit = entry.get("expected_hit")
        if mandatory_hit is None or expected_hit is None:
            raise Incomplete(f"{rid}: mandatory_hit or expected_hit is missing")

        mand_ok = mandatory_hit == mandatory_total
        mark(out, mand_ok, f"{rid}: {mandatory_hit} of {mandatory_total} mandatory facts — all or fail")

        ratio = expected_hit / expected_total if expected_total else 1.0
        exp_ok = ratio >= EXPECTED_FACT_FLOOR
        mark(
            out,
            exp_ok,
            f"{rid}: {expected_hit} of {expected_total} expected facts "
            f"({ratio:.0%}, floor {EXPECTED_FACT_FLOOR:.0%})",
        )

        points = {point.get("id"): point for point in entry.get("method_points", [])}
        absent = [mp for mp in METHOD_POINT_IDS if mp not in points]
        if absent:
            raise Incomplete(f"{rid}: unmarked method points {', '.join(absent)}")
        method_ok = True
        for mp in METHOD_POINT_IDS:
            if not scored_result(points[mp], f"{rid} {mp}"):
                method_ok = False
                mark(out, False, f"{rid} {mp} failed — {points[mp].get('evidence', '')}")
        mark(out, method_ok, f"{rid}: four of four method points")

        before = entry.get("manual_reads_before_first_query")
        if before is None:
            raise Incomplete(f"{rid}: manual_reads_before_first_query is missing")
        first_ok = before == 0
        mark(out, first_ok, f"{rid}: {before} manual read(s) before the first index query — must be 0")

        budget_ok = score_budget(
            out, rid, entry, REQUEST_QUERY_BUDGET, REQUEST_SECONDS_BUDGET
        )

        declared = scored_result(entry, f"{rid} overall")
        computed = mand_ok and exp_ok and method_ok and first_ok and budget_ok
        if declared != computed:
            mark(
                out,
                False,
                f"{rid}: recorded as {'pass' if declared else 'fail'} but the criteria compute "
                f"{'pass' if computed else 'fail'}",
            )
        all_ok = all_ok and computed and declared == computed

    q_ok = total_queries <= CHANGE_QUERY_BUDGET
    s_ok = total_seconds <= CHANGE_SECONDS_BUDGET
    mark(out, q_ok, f"change test total: {total_queries} of {CHANGE_QUERY_BUDGET} queries")
    mark(out, s_ok, f"change test total: {total_seconds}s of {CHANGE_SECONDS_BUDGET}s")
    return all_ok and q_ok and s_ok


def score_baseline(record: dict[str, Any], out: list[tuple[bool, str]]) -> bool:
    """criteria.md section 8. Recorded, and reported — never a threshold."""
    baseline = require(record, "baseline")
    for field in (
        "produced_by",
        "operator",
        "wall_seconds",
        "commands",
        "mandatory_facts_hit",
        "facts_stated_wrongly",
        "blind_spots_flagged",
    ):
        if baseline.get(field) is None:
            raise Incomplete(f"baseline: {field} is missing")
    if baseline.get("saw_criteria"):
        raise Incomplete("baseline: the operator saw the criteria, so the comparison is void")
    if not baseline.get("produced_before_run"):
        mark(out, True, "baseline produced after the run — permitted only with a different operator")

    mark(
        out,
        True,
        f"baseline recorded: {baseline['mandatory_facts_hit']} mandatory facts, "
        f"{baseline['facts_stated_wrongly']} stated wrongly, "
        f"{baseline['blind_spots_flagged']} of {BLIND_SPOT_COUNT} blind spots, "
        f"{baseline['wall_seconds']}s over {baseline['commands']} commands",
    )
    return True


def score_misses(record: dict[str, Any], out: list[tuple[bool, str]]) -> bool:
    """criteria.md section 7. Every miss is classified and becomes a correction."""
    misses = record.get("misses")
    if misses is None:
        raise Incomplete("missing field: misses (use an empty list when there were none)")
    for miss in misses:
        mid = miss.get("id", "<no id>")
        if miss.get("class") not in MISS_CLASSES:
            raise Incomplete(f"{mid}: class {miss.get('class')!r} is not one of M1..M6")
        for field in ("criterion", "correction", "owner", "target_artefact"):
            if not miss.get(field):
                raise Incomplete(f"{mid}: {field} is missing — every miss becomes a correction")
    carried = [m["id"] for m in misses if m.get("carried_from")]
    mark(out, True, f"{len(misses)} miss(es), all classified and owned; {len(carried)} carried forward")
    return True


# --- report -------------------------------------------------------------------


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        return EX_TOOLING

    path = Path(argv[1])
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"cannot read {path}: {exc}", file=sys.stderr)
        return EX_TOOLING

    version = str(record.get("criteria_version", ""))
    if version not in SUPPORTED_CRITERIA:
        print(
            f"{path} names criteria_version {version!r}; this scorer implements "
            f"{', '.join(sorted(SUPPORTED_CRITERIA))}. Score it with the scorer of its own "
            "version rather than approximately.",
            file=sys.stderr,
        )
        return EX_TOOLING

    out: list[tuple[bool, str]] = []
    try:
        score_precondition(record, out)
        clean = score_inventions(record, out)
        index_ok = score_index_test(record, out)
        change_ok = score_change_test(record, out)
        score_baseline(record, out)
        score_misses(record, out)
    except Incomplete as exc:
        print(f"cold-agent run {record.get('run_id', path.name)}")
        for ok, text in out:
            print(f"  {'ok  ' if ok else 'FAIL'}  {text}")
        print(f"\n  NOT SCORED: {exc}")
        print("  A run that cannot be scored is not a fail. Complete the record, or re-run.")
        return EX_INCOMPLETE

    passed = clean and index_ok and change_ok
    print(f"cold-agent run {record['run_id']}  (criteria {version})")
    print(f"  revision {record.get('repository_revision', '?')[:12]}  "
          f"index {record.get('index_revision', '?')[:12]}\n")
    for ok, text in out:
        print(f"  {'ok  ' if ok else 'FAIL'}  {text}")

    declared = str(record.get("result", "")).lower()
    verdict = "pass" if passed else "fail"
    print(f"\n  result: {verdict.upper()}")
    if declared not in {"pass", "fail", "void"}:
        print("  the record declares no result; it must say pass, fail or void")
        return EX_INCOMPLETE
    if declared != verdict:
        print(f"  the record declares {declared.upper()}, which the criteria do not support")
        return EX_FAIL
    return EX_OK if passed else EX_FAIL


if __name__ == "__main__":
    sys.exit(main(sys.argv))
