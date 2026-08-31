#!/bin/sh
# RULE-GOV-002  A decay review MUST have been run inside the review period, and its
#               evidence MUST verify.
#
# Every other check here asks whether a change is allowed. This one asks whether the
# review that watches the other rules for rot is still happening — a question no
# individual green run can answer, because rot leaves every check green.
#
# It reads ops/decay-review.json and never AGENTS.md. The contract may display the date
# of the last review; a contract that is the SOURCE of that date is a document asserting
# its own freshness, which is exactly the failure this rule exists to prevent.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"

findings=$(python3 tools/checks/decay_freshness.py) || {
	printf '  the decay-review evidence could not be checked\n' >&2
	exit "$EX_TOOLING"
}

if [ -n "$findings" ]; then
	printf '%s\n' "$findings" | while IFS='|' read -r rule message; do
		[ -n "$rule" ] && fail_rule "$rule" "$message"
	done
	exit "$EX_RULE"
fi

age=$(python3 -c 'import datetime,json;d=json.load(open("ops/decay-review.json"));print((datetime.date.today()-datetime.date.fromisoformat(d["generated_at"])).days)')
ok "decay review $age day(s) old, evidence verifies against $(python3 -c 'import json;print(json.load(open("ops/decay-review.json"))["repo_revision"][:12])')"
exit "$EX_OK"
