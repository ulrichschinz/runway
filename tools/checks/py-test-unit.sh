#!/bin/sh
# RULE-TEST-001  The backend unit test suite MUST pass.
# RULE-TEST-003  Backend line coverage MUST NOT fall below the checked-in floor.
#
# The floor is a RATCHET, not a target: raise it when coverage rises, never lower it to
# make a change fit. It sits below the current figure on purpose — a floor that tracks
# the exact number turns every unrelated refactor into a coverage failure.
#
# The unit tier fakes Taskwarrior at the task_runner._run seam, so it needs no binary, no
# Docker and no network. Everything above that seam — argv construction, validation,
# routing, error mapping — executes for real.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT/backend"
[ -x .venv/bin/pytest ] || { printf '  pytest is not installed — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }

COVERAGE_FLOOR=90

# -q is deliberately absent: pytest 9 suppresses the "N passed" summary line under it,
# and a gate that cannot say how much it ran is a gate nobody trusts.
if out=$(.venv/bin/pytest tests/unit --no-header --tb=short -p no:warnings \
	--cov=app --cov-report=term-missing --cov-fail-under="$COVERAGE_FLOOR" 2>&1); then
	summary=$(printf '%s\n' "$out" | grep -E '[0-9]+ (passed|failed|skipped)' | tail -1)
	ok "${summary:-suite passed}"
	exit "$EX_OK"
fi
printf '%s\n' "$out" | tail -30 | sed 's/^/        /' >&2
if printf '%s' "$out" | grep -q 'Coverage failure'; then
	fail_rule RULE-TEST-003 "backend coverage fell below the ${COVERAGE_FLOOR}% floor"
else
	fail_rule RULE-TEST-001 "the backend unit suite failed"
fi
exit "$EX_RULE"
