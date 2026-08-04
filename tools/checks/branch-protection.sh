#!/bin/sh
# RULE-GOV-001  The live branch protection MUST match the checked-in desired state.
#
# A protection that can be switched off in a web UI without leaving a trace is not a
# control. The checked-in file is canonical; this detects drift away from it.
#
# This check needs network and an authenticated gh. Where it cannot reach GitHub — an
# offline machine, a CI job without the scope — it reports that plainly and does not
# fail: a governance check that goes red on a train is a governance check people delete.
# The gap is recorded as RISK-GOV-002 and belongs to the scheduled decay review, which is
# the layer that can actually prove bypasses and admin merges.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"
desired=ops/github/ruleset.json
[ -f "$desired" ] || { fail_rule RULE-GOV-001 "$desired is missing"; exit "$EX_RULE"; }

if ! have gh || ! gh auth status >/dev/null 2>&1; then
	say "  skipped: gh is unavailable or unauthenticated (RISK-GOV-002)"
	exit "$EX_OK"
fi

repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null) || {
	say "  skipped: cannot resolve the repository (RISK-GOV-002)"
	exit "$EX_OK"
}
name=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["name"])' "$desired")

live=$(gh api "repos/$repo/rulesets" 2>/dev/null) || {
	say "  skipped: the rulesets API is unreachable with this token (RISK-GOV-002)"
	exit "$EX_OK"
}

id=$(printf '%s' "$live" | python3 -c 'import json,sys; print(next((str(r["id"]) for r in json.load(sys.stdin) if r.get("name") == sys.argv[1]), ""))' "$name")

if [ -z "$id" ]; then
	fail_rule RULE-GOV-001 "ruleset \"$name\" does not exist on $repo — run tools/apply-ruleset.sh"
	exit "$EX_RULE"
fi

detail=$(gh api "repos/$repo/rulesets/$id" 2>/dev/null)
diff=$(printf '%s' "$detail" | python3 "$REPO_ROOT/tools/checks/ruleset_diff.py" "$desired")

if [ -n "$diff" ]; then
	printf '%s\n' "$diff" | while IFS= read -r line; do
		[ -n "$line" ] && fail_rule RULE-GOV-001 "$line"
	done
	exit "$EX_RULE"
fi
ok "live branch protection matches ops/github/ruleset.json"
exit "$EX_OK"
