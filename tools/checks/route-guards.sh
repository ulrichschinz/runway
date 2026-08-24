#!/bin/sh
# RULE-SEC-001  Every HTTP route MUST declare its required guard, and the code MUST agree.
#
# The authorization posture of the REST surface is checked-in state rather than something a
# reader reconstructs from thirty function signatures. A forgotten guard fails silently —
# the route works, it just works for everybody — so the gate has to be the thing that
# notices, not a review.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"
PY=backend/.venv/bin/python
[ -x "$PY" ] || { printf '  backend/.venv is missing — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }

findings=$("$PY" tools/checks/route_guards.py) || {
	printf '  the route-guard check could not run\n' >&2
	exit "$EX_TOOLING"
}

if [ -n "$findings" ]; then
	printf '%s\n' "$findings" | while IFS='|' read -r rule message; do
		[ -n "$rule" ] && fail_rule "$rule" "$message"
	done
	exit "$EX_RULE"
fi

count=$(grep -c '^\[\[routes\]\]' rules/route-guards.toml)
ok "$count route(s) declared; every guard matches the code"
exit "$EX_OK"
