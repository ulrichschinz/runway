#!/bin/sh
# RULE-FMT-001  Backend Python MUST be formatted by ruff format.
set -eu
. "$(dirname -- "$0")/../lib.sh"
cd "$REPO_ROOT/backend"
RUFF=.venv/bin/ruff
[ -x "$RUFF" ] || { printf '  ruff is not installed — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }
if out=$("$RUFF" format --check app tests 2>&1); then
	ok "$(printf '%s' "$out" | tail -1)"
	exit "$EX_OK"
fi
fail_rule RULE-FMT-001 "$(printf '%s' "$out" | grep -c '^Would reformat') file(s) are not formatted"
exit "$EX_RULE"
