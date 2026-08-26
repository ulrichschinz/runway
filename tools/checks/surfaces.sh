#!/bin/sh
# RULE-SURF-001  Every protected public surface MUST match its checked-in snapshot.
# RULE-SURF-002  Every environment variable the application reads MUST be documented, and
#                every documented variable MUST be read.
#
# AGENTS.md treats these surfaces as externally consumed — this is a public repository whose
# README documents the API for third parties. A promise nothing measures is a promise nobody
# keeps.
#
# The point is not to prevent change. It is to make change visible: a diff in a checked-in
# snapshot has to be reviewed and committed, where a renamed route handler silently renames
# an MCP tool and breaks clients with nothing in the diff to notice.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"
PY=backend/.venv/bin/python
[ -x "$PY" ] || { printf '  backend/.venv is missing — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }

findings=$("$PY" tools/surfaces.py) || {
	printf '  the surface capture could not run\n' >&2
	exit "$EX_TOOLING"
}

if [ -n "$findings" ]; then
	printf '%s\n' "$findings" | while IFS='|' read -r rule message; do
		[ -n "$rule" ] && fail_rule "$rule" "$message"
	done
	exit "$EX_RULE"
fi

count=$(ls ops/surfaces | wc -l | tr -d ' ')
ok "$count surface snapshot(s) match; every env var is read and documented"
exit "$EX_OK"
