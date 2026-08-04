#!/bin/sh
# List every task-interface command, read from the Makefile itself so the two cannot drift.
set -eu
. "$(dirname -- "$0")/lib.sh"

if is_json; then
	printf '{"commands":['
	awk -F':.*## ' '/^[a-z][a-z-]*:.*## /{printf "%s{\"name\":\"%s\",\"description\":\"%s\"}", sep, $1, $2; sep=","}' \
		"$REPO_ROOT/Makefile"
	printf ']}\n'
	exit 0
fi

printf 'Runway task interface\n\n'
awk -F':.*## ' '/^[a-z][a-z-]*:.*## /{printf "  make %-15s %s\n", $1, $2}' "$REPO_ROOT/Makefile"
printf '\n  Modifiers: JSON=1 (machine-readable)  PLAN=1 (resolved execution plan)\n'
printf '  Exit codes and full reference: docs/task-interface.md\n'
