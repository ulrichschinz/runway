#!/bin/sh
# RULE-OPS-001  Every blocking outward call the application makes MUST declare a timeout.
#
# A call with no timeout does not fail, it waits — and the worker serving the request waits
# with it. There is one Taskwarrior binary behind every list this application renders, so a
# `task` invocation that never returns is a worker that never comes back, and enough of them
# is an outage with nothing in any log to explain it.
#
# The application makes exactly one such call today and it already declares `timeout=10`.
# This rule is what keeps that true when the second one is added.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"
PY=backend/.venv/bin/python
[ -x "$PY" ] || { printf '  backend/.venv is missing — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }

findings=$("$PY" tools/checks/timeouts.py) || {
	printf '  the timeout scan could not run\n' >&2
	exit "$EX_TOOLING"
}

if [ -n "$findings" ]; then
	printf '%s\n' "$findings" | while IFS='|' read -r rule message; do
		[ -n "$rule" ] && fail_rule "$rule" "$message"
	done
	exit "$EX_RULE"
fi

ok "every blocking outward call declares a timeout"
exit "$EX_OK"
