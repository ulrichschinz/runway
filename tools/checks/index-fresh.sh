#!/bin/sh
# RULE-IDX-001  The index MUST be current with the working tree.
#
# A stale index is worse than no index: it answers confidently and wrongly. Exit 4 is
# reserved for exactly this — the answer would have been unreliable, so no answer was
# given.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"
state=index/state.json

# Exit 4 is not a rule violation, so fail_rule is wrong here — it would add a finding to
# the profile's violation list and claim the gate went red over a rule. The rule id and the
# contract pointer are printed by hand instead, because the failure message audit in Step
# 16d found this to be the one gate failure a reader meets most often and the only one that
# named neither.
_why=$(rule_field RULE-IDX-001 contract)
_how=$(rule_field RULE-IDX-001 fix)

stale() {
	printf '  STALE RULE-IDX-001  %s\n' "$1" >&2
	shift
	for _detail in "$@"; do printf '        %s\n' "$_detail" >&2; done
	[ -n "$_why" ] && printf '        why:  %s\n' "$_why" >&2
	[ -n "$_how" ] && printf '        fix:  %s\n' "$_how" >&2
	exit "$EX_STALE_INDEX"
}

if [ ! -f "$state" ]; then
	stale "the index has not been built"
fi

recorded=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["sources_sha256"])' "$state")
current=$(python3 "$REPO_ROOT/tools/index/sources_hash.py")

if [ "$recorded" != "$current" ]; then
	stale "the index is stale: tracked sources have changed since it was built" \
		"recorded $recorded" "current  $current"
fi

schema=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["schema_version"])' "$state")
declared=$(grep -m1 '^schema_version' index/manifest.toml | cut -d'"' -f2)
if [ "$schema" != "$declared" ]; then
	fail_rule RULE-IDX-001 "index built with schema $schema, manifest declares $declared"
	exit "$EX_RULE"
fi

nodes=$(python3 "$REPO_ROOT/tools/index/summarise_state.py" "$state")
ok "index current — $nodes (schema $schema)"
exit "$EX_OK"
