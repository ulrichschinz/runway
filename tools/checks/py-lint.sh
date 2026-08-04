#!/bin/sh
# RULE-LINT-001  Backend Python MUST pass ruff check.
set -eu
. "$(dirname -- "$0")/../lib.sh"
cd "$REPO_ROOT/backend"
RUFF=.venv/bin/ruff
[ -x "$RUFF" ] || { printf '  ruff is not installed — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }
if out=$("$RUFF" check app --output-format=concise 2>&1); then
	ok "ruff check: no findings"
	exit "$EX_OK"
fi
printf '%s\n' "$out" | sed 's/^/        /' >&2
fail_rule RULE-LINT-001 "$(printf '%s' "$out" | grep -c ':.*:' ) lint finding(s)"
exit "$EX_RULE"
