#!/bin/sh
# RULE-OPS-003  The deploy compose file MUST NOT ask the host for privilege, its network
#               namespace, or a bind mount outside the service directory.
#
# Since 2026-08-28 the deploy key's forced command applies ops/deploy/docker-compose.yml at the
# deployed commit, so that file is production's configuration rather than a description of it.
# That removed the drift which had already produced three false claims about the running
# system, and it widened what a merge to main can reach: compose can do things to a host that
# application code inside a container cannot.
#
# This is the boundary on that widening. It does not make the deploy compose safe to write
# carelessly — it makes the specific host-scoped escalations fail the gate instead of the
# review.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"
PY=backend/.venv/bin/python
[ -x "$PY" ] || { printf '  backend/.venv is missing — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }

findings=$("$PY" tools/checks/deploy_compose.py) || {
	printf '  the deploy compose scan could not run\n' >&2
	exit "$EX_TOOLING"
}

if [ -n "$findings" ]; then
	printf '%s\n' "$findings" | while IFS='|' read -r rule message; do
		[ -n "$rule" ] && fail_rule "$rule" "$message"
	done
	exit "$EX_RULE"
fi

ok "the deploy compose asks the host for no privilege it does not need"
exit "$EX_OK"
