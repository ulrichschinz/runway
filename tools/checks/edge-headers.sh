#!/bin/sh
# RULE-OPS-005  The nginx edge MUST declare the browser security headers at server level with
#               `always`, MUST NOT let a location drop them, MUST keep every policy same-origin
#               with no reporting endpoint, and MUST NOT set HSTS.
#
# frontend/nginx.conf is the last server of ours a browser talks to (finding SEC-004, ADR
# 0048). Each property here is lost by a one-line edit that looks harmless in review: an
# `add_header` without `always` vanishes from every error page, and one `add_header` in a
# location strips all of them from that location.
#
# This reads the declaration. The container tier proves what the built image sends; the
# post-deploy check in deploy.yml reads what the public origin sends. Neither is this.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"
PY=backend/.venv/bin/python
[ -x "$PY" ] || { printf '  backend/.venv is missing — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }

findings=$("$PY" tools/checks/edge_headers.py) || {
	printf '  the edge header scan could not run\n' >&2
	exit "$EX_TOOLING"
}

if [ -n "$findings" ]; then
	printf '%s\n' "$findings" | while IFS='|' read -r rule message; do
		[ -n "$rule" ] && fail_rule "$rule" "$message"
	done
	exit "$EX_RULE"
fi

ok "the edge declares its browser headers on every response, same-origin, no HSTS"
exit "$EX_OK"
