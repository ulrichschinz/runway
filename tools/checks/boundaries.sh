#!/bin/sh
# RULE-ARCH-001  A unit dependency that architecture.toml does not allow FAILS the gate.
# RULE-ARCH-002  A new cycle between units FAILS. Declared cycles are inventoried under a
#                ratchet that may only shrink.
# RULE-ARCH-003  Fan-in MUST NOT exceed the checked-in structural baseline.
# RULE-ARCH-004  A restricted stdlib module MUST NOT be imported outside its choke point.
#
# The index is descriptive; architecture.toml is normative. This is where they are
# compared, and the only place a graph fact becomes a gate failure.
#
# A single high fan-in is never a failure by itself — a shared kernel and a single egress
# point are meant to be depended on. A new cycle always is.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"
report=$(python3 tools/index/boundaries.py 2>&1) || {
	printf '%s\n' "$report" | tail -10 | sed 's/^/        /' >&2
	printf '  the boundary report could not be produced\n' >&2
	exit "$EX_TOOLING"
}

findings=$(printf '%s' "$report" | python3 "$REPO_ROOT/tools/index/render_boundaries.py")
if [ -n "$findings" ]; then
	printf '%s\n' "$findings" | while IFS='|' read -r rule message; do
		[ -n "$rule" ] && fail_rule "$rule" "$message"
	done
	# fail_rule ran in a subshell, so decide from the findings themselves.
	exit "$EX_RULE"
fi

summary=$(printf '%s' "$report" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("{} declared cycle(s) inventoried, 0 new, 0 forbidden edges, 0 hub regressions, 0 restricted imports".format(len(d["declared_cycles_still_present"])))')
ok "$summary"
exit "$EX_OK"
