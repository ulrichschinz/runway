#!/bin/sh
# Placeholder for a task-interface command whose implementing step has not landed yet.
#
# The command surface is declared in full from the start so that a cold agent can see what
# this repository will answer and where each answer is coming from. An unimplemented command
# says so plainly and exits 3 (tooling/environment) — it never pretends to succeed.
set -eu
. "$(dirname -- "$0")/lib.sh"

name=$1
step=$2
what=$3

if is_json; then
	printf '{"command":"%s","status":"not_implemented","implementing_step":%s,"description":"%s"}\n' \
		"$(json_escape "$name")" "$step" "$(json_escape "$what")"
else
	printf '%s is not implemented yet.\n' "$name" >&2
	printf '  delivers: %s\n' "$what" >&2
	printf '  step:     %s (see docs/plan/phase-0-2.md)\n' "$step" >&2
fi
exit "$EX_TOOLING"
