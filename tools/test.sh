#!/bin/sh
# Run the test suites for the changed scope.
#
#   ./run test              both tiers where they can run here
#   ./run test unit         the fast tier only (Taskwarrior faked)
#   ./run test container    the real-binary tier only
set -eu
. "$(dirname -- "$0")/lib.sh"

tier=${1:-all}
rc=0

case "$tier" in
	unit)      "$REPO_ROOT/tools/checks/py-test-unit.sh" || rc=$? ;;
	container) "$REPO_ROOT/tools/checks/py-test-container.sh" || rc=$? ;;
	all)
		"$REPO_ROOT/tools/checks/py-test-unit.sh" || rc=$?
		"$REPO_ROOT/tools/checks/py-test-container.sh" || rc=$?
		;;
	*)
		printf 'needs input: unknown tier %s (expected unit, container, or nothing)\n' "$tier" >&2
		exit "$EX_NEEDS_INPUT"
		;;
esac
exit "$rc"
