#!/bin/sh
# RULE-TYPE-001  Backend Python MUST pass mypy.
set -eu
. "$(dirname -- "$0")/../lib.sh"
cd "$REPO_ROOT/backend"
MYPY=.venv/bin/mypy
[ -x "$MYPY" ] || { printf '  mypy is not installed — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }
if out=$("$MYPY" 2>&1); then
	ok "$(printf '%s' "$out" | tail -1)"
	exit "$EX_OK"
fi
printf '%s\n' "$out" | sed 's/^/        /' >&2
fail_rule RULE-TYPE-001 "$(printf '%s' "$out" | grep -c ': error:') type error(s)"
exit "$EX_RULE"
