#!/bin/sh
# RULE-TEST-004  The frontend logic test suite MUST pass.
#
# Scoped to pure logic modules — no component mounting, no jsdom. The rules that have
# actually produced bugs here (comma-splitting of context tags, search filtering) are pure
# functions; the components around them are not where the defects were. See ADR 0007.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT/frontend"
[ -x node_modules/.bin/vitest ] || { printf '  vitest is not installed — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }

if out=$(node_modules/.bin/vitest run 2>&1); then
	summary=$(printf '%s\n' "$out" | grep -E 'Tests +[0-9]+ passed' | tail -1 | sed 's/^ *//')
	ok "${summary:-suite passed}"
	exit "$EX_OK"
fi
printf '%s\n' "$out" | tail -30 | sed 's/^/        /' >&2
fail_rule RULE-TEST-004 "the frontend logic suite failed"
exit "$EX_RULE"
