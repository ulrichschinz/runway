#!/bin/sh
# RULE-GATE-002  Every executable rule MUST have a negative fixture proving that a
#                genuine violation makes the gate fail.
#
# This runs the fixtures themselves. A gate component that is never observed failing is
# not a rule — it is a shell call nobody has tested.
set -eu
. "$(dirname -- "$0")/../lib.sh"

if out=$("$REPO_ROOT/tools/fixtures/negative.sh" 2>&1); then
	printf '%s\n' "$out" | grep -E '^\s+(PASS|[0-9]+ rule)' | sed 's/^/      /'
	exit "$EX_OK"
fi
printf '%s\n' "$out" | sed 's/^/        /' >&2
fail_rule RULE-GATE-002 "one or more rules could not be shown to fail on a real violation"
exit "$EX_RULE"
