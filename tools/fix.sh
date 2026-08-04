#!/bin/sh
# Apply every deterministic, semantics-preserving repository-owned fix.
#
# Gate messages for deterministic rules name this command. Tool-owned and generated files
# are repaired by running it, never by hand-editing — hand-editing produces a diff the
# tool will simply undo on the next run.
#
# Everything here must be idempotent and must not change behaviour. Anything that could
# change behaviour belongs in a reviewed change, not in a fix command.
set -eu
. "$(dirname -- "$0")/lib.sh"

cd "$REPO_ROOT"
applied=""
note() { applied="${applied}${applied:+|}$1"; }

if [ -x backend/.venv/bin/ruff ]; then
	(cd backend && .venv/bin/ruff check app --fix --quiet >/dev/null 2>&1 || true)
	(cd backend && .venv/bin/ruff format app >/dev/null 2>&1)
	note "ruff: import order, safe lint fixes, formatting"
else
	note "ruff: SKIPPED (not installed — run make bootstrap)"
fi

if [ -x frontend/node_modules/.bin/eslint ]; then
	(cd frontend && node_modules/.bin/eslint . --fix >/dev/null 2>&1 || true)
	note "eslint: safe fixes"
else
	note "eslint: SKIPPED (not installed — run make bootstrap)"
fi

if is_json; then
	printf '{"status":"ok","applied":"%s"}\n' "$(json_escape "$applied")"
else
	printf '%s\n' "$applied" | tr '|' '\n' | sed 's/^/  /'
	printf '\nfix: done — review the diff, then run make check\n'
fi
