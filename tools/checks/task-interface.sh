#!/bin/sh
# RULE-TI-001  Every task-interface command MUST be documented, and every documented
#              command MUST exist. The interface and its reference cannot drift.
#
# The task interface is what a cold agent reads first. A command that exists but is
# undocumented is invisible; a command that is documented but absent is a trap.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"

reference="docs/task-interface.md"
if [ ! -f "$reference" ]; then
	fail_rule RULE-TI-001 "$reference does not exist"
	exit "$EX_RULE"
fi

# Commands the Makefile offers: targets carrying a `## ` doc comment.
in_makefile=$(awk -F: '/^[a-z][a-z-]*:.*## /{print $1}' Makefile | sort -u)

# Commands the reference documents: headings of the form `### \`make <name>\``.
in_reference=$(awk '/^### `make [a-z-]+`/{gsub(/`/, "", $3); print $3}' "$reference" | sort -u)

for cmd in $in_makefile; do
	printf '%s\n' "$in_reference" | grep -qxF "$cmd" ||
		fail_rule RULE-TI-001 "'make $cmd' exists but is not documented in $reference"
done

for cmd in $in_reference; do
	printf '%s\n' "$in_makefile" | grep -qxF "$cmd" ||
		fail_rule RULE-TI-001 "$reference documents 'make $cmd', which the Makefile does not define"
done

# The dispatcher must handle every command, and every command it handles must be
# offered by the Makefile. Three surfaces — Makefile, reference, dispatcher — one truth.
[ -x ./run ] || fail_rule RULE-TI-001 "./run is missing or not executable"
in_dispatcher=$(awk -F')' '/^\t[a-z-]+\)[ \t]+exec /{gsub(/[ \t]/, "", $1); print $1}' run | sort -u)

for cmd in $in_makefile; do
	printf '%s\n' "$in_dispatcher" | grep -qxF "$cmd" ||
		fail_rule RULE-TI-001 "'make $cmd' exists but ./run does not dispatch '$cmd'"
done

for cmd in $in_dispatcher; do
	printf '%s\n' "$in_makefile" | grep -qxF "$cmd" ||
		fail_rule RULE-TI-001 "./run dispatches '$cmd', which the Makefile does not offer"
done

# Every implementation the dispatcher names must exist and be executable.
for script in $(awk '/exec tools\//{for (i = 1; i <= NF; i++) if ($i ~ /^tools\//) print $i}' run | sort -u); do
	[ -x "$script" ] || fail_rule RULE-TI-001 "./run calls '$script', which is missing or not executable"
done

if ! check_result; then
	exit "$EX_RULE"
fi
ok "$(printf '%s\n' "$in_makefile" | wc -l | tr -d ' ') commands, all documented and all delegating to an executable script"
exit "$EX_OK"
