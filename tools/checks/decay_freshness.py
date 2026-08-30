"""RULE-GOV-002 — the decay review happened, recently, and its evidence verifies.

Emits `RULE-ID|message` lines; `tools/checks/decay-freshness.sh` turns them into gate
failures.

Every other rule in this repository asks whether a change is allowed. This one asks
whether the review that watches the *other* rules for rot is still happening. It cannot
ask that of the contract, because a document asserting its own freshness is precisely the
failure being guarded against — so the only input is `ops/decay-review.json`, which
`./run decay-review` writes and nothing else does.

"Verifiable" is four things, and each is recomputed here rather than trusted:

1. the file exists, parses, and carries every field the schema requires;
2. `report_sha256` matches a fresh hash over the report with that field removed, so a
   hand-edited date or a softened result is refused rather than believed;
3. the recorded `repo_revision` is a commit in this repository's history and an ancestor
   of HEAD — a report describing a revision this repository has never seen describes
   nothing;
4. `generated_at` is inside the review period.

What it deliberately does not do is read the findings. Judging the content would make
this a second gate over the same six diagnostics, with thresholds and no fixtures, and
the first time it blocked a merge somebody would tune it. It proves the review happened;
it does not prove anyone acted on it. That gap is RISK-GOV-005.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "ops" / "decay-review.json"

RULE = "RULE-GOV-002"

REQUIRED = (
    "schema",
    "generated_at",
    "repo_revision",
    "index_revision",
    "ci",
    "executed_checks",
    "result",
    "report_sha256",
    "overdue_after_days",
)

problems: list[str] = []


def fail(message: str) -> None:
    problems.append(message)


def report_hash(record: dict) -> str:
    body = {k: v for k, v in record.items() if k != "report_sha256"}
    return hashlib.sha256(
        json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def git_ok(*args: str) -> bool:
    return (
        subprocess.run(
            ["git", *args], cwd=ROOT, capture_output=True, text=True, check=False
        ).returncode
        == 0
    )


def main() -> int:
    if not EVIDENCE.exists():
        fail(
            "no decay review has ever been recorded: ops/decay-review.json does not exist. "
            "Run `./run decay-review` and commit what it writes."
        )
        return report()

    try:
        record = json.loads(EVIDENCE.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        fail(f"ops/decay-review.json is unverifiable: it does not parse ({exc})")
        return report()

    missing = [field for field in REQUIRED if field not in record]
    if missing:
        fail(
            "ops/decay-review.json is unverifiable: it is missing "
            + ", ".join(f"`{field}`" for field in missing)
        )
        return report()

    if record["report_sha256"] != report_hash(record):
        fail(
            "ops/decay-review.json is unverifiable: report_sha256 does not match the "
            "report it covers, so the file has been edited since the review produced it"
        )

    revision = str(record["repo_revision"])
    if not git_ok("cat-file", "-e", f"{revision}^{{commit}}"):
        fail(
            f"ops/decay-review.json is unverifiable: it claims revision {revision[:12]}, "
            "which is not a commit in this repository"
        )
    elif not git_ok("merge-base", "--is-ancestor", revision, "HEAD"):
        fail(
            f"ops/decay-review.json is unverifiable: revision {revision[:12]} is not an "
            "ancestor of HEAD, so the review describes work this branch does not contain"
        )

    try:
        generated = dt.date.fromisoformat(str(record["generated_at"]))
    except ValueError:
        fail(
            "ops/decay-review.json is unverifiable: "
            f"generated_at `{record['generated_at']}` is not a date"
        )
        return report()

    age = (dt.date.today() - generated).days
    limit = int(record["overdue_after_days"])
    if age < 0:
        fail(
            f"ops/decay-review.json is unverifiable: it is dated {generated}, "
            "which is in the future"
        )
    elif age > limit:
        fail(
            f"the last decay review was {age} days ago ({generated}), over the {limit}-day "
            "limit. Run `./run decay-review` and commit what it writes; the monthly "
            "workflow has not been producing evidence."
        )

    return report()


def report() -> int:
    for message in problems:
        print(f"{RULE}|{message}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
