#!/bin/sh
# RULE-DEP-001  The backend application MUST import cleanly from its pinned dependency
#               set — i.e. the service can actually start.
#
# This exists because it did not. fastapi-mcp 0.3.3 requires mcp>=1.6.0 with no upper
# bound; mcp 2.0.0 changed Server.__init__, and every image built after that release
# contained a backend that raised TypeError before uvicorn bound a port. The image built,
# the registry push succeeded, the deploy job went green, and the service was down.
#
# It is the cheapest possible "does the app start" signal: no server, no database, no
# Docker. If this fails, nothing else about the backend is worth checking.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT/backend"
PY=.venv/bin/python
[ -x "$PY" ] || { printf '  backend/.venv is missing — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }

if out=$("$PY" -c 'import app.main' 2>&1); then
	ok "app.main imports cleanly"
	exit "$EX_OK"
fi
printf '%s\n' "$out" | tail -6 | sed 's/^/        /' >&2
fail_rule RULE-DEP-001 "app.main cannot be imported — the service would not start"
exit "$EX_RULE"
