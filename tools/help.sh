#!/bin/sh
# List every task-interface command, read from the Makefile itself so the two cannot drift.
set -eu
. "$(dirname -- "$0")/lib.sh"

if is_json; then
	# Descriptions are free text from the Makefile and may contain quotes or backslashes,
	# so they must be escaped before being embedded in a JSON string.
	printf '{"commands":['
	awk -F':.*## ' '
		/^[a-z][a-z-]*:.*## / {
			name = $1; desc = $2
			gsub(/\\/, "\\\\", desc)
			gsub(/"/, "\\\"", desc)
			printf "%s{\"name\":\"%s\",\"description\":\"%s\"}", sep, name, desc
			sep = ","
		}' "$REPO_ROOT/Makefile"
	printf ']}\n'
	exit 0
fi

printf 'Runway task interface\n\n'
awk -F':.*## ' '/^[a-z][a-z-]*:.*## /{printf "  make %-15s %s\n", $1, $2}' "$REPO_ROOT/Makefile"
printf '\n  Modifiers: JSON=1 (machine-readable)  PLAN=1 (resolved execution plan)\n'
printf '  Exit codes and full reference: docs/task-interface.md\n'
printf '  Exit codes are exact only via ./run — make reports 2 for any failure.\n'
