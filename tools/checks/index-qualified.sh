#!/bin/sh
# RULE-IDX-003  The index MUST pass its qualification suite.
#
# Installation is not proof of compliance. This is what decides whether the index may be
# trusted: coverage of the required languages and mechanisms, preserved direction, correct
# evidence classes and source locations, impact and flow queries returning known facts AND
# their blind spots, explicit reporting of missing test protection, and negative fixtures
# proving that unsupported mechanisms surface as UNKNOWN rather than as invented edges.
#
# A qualification failure means the index is lying, which is worse than having no index.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"
[ -x backend/.venv/bin/pytest ] || { printf '  pytest is not installed — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }

if out=$(backend/.venv/bin/pytest tools/index/tests --no-header --tb=short -p no:warnings 2>&1); then
	summary=$(printf '%s\n' "$out" | grep -oE '[0-9]+ passed[^=]*' | tail -1 | sed 's/ *$//')
	ok "${summary:-qualification passed}"
	exit "$EX_OK"
fi
printf '%s\n' "$out" | tail -30 | sed 's/^/        /' >&2
fail_rule RULE-IDX-003 "the index failed its qualification suite"
exit "$EX_RULE"
