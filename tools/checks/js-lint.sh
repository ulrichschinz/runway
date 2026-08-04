#!/bin/sh
# RULE-LINT-002  Frontend JavaScript and Vue MUST pass eslint.
set -eu
. "$(dirname -- "$0")/../lib.sh"
cd "$REPO_ROOT/frontend"
[ -x node_modules/.bin/eslint ] || { printf '  eslint is not installed — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }
if out=$(node_modules/.bin/eslint . 2>&1); then
	ok "eslint: no findings"
	exit "$EX_OK"
fi
printf '%s\n' "$out" | sed 's/^/        /' >&2
fail_rule RULE-LINT-002 "eslint reported findings"
exit "$EX_RULE"
