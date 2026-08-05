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
	# The scope MUST match what py-lint.sh and py-format.sh check. When it did not, the
	# gate failed and told the contributor to run a command that could not fix it.
	(cd backend && .venv/bin/ruff check app tests ../tools/index --fix --quiet >/dev/null 2>&1 || true)
	(cd backend && .venv/bin/ruff format app tests ../tools/index >/dev/null 2>&1)
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

# Rebuilding the index is deterministic and semantics-preserving — exactly what this
# command is for — and it takes about a tenth of a second. Without it here, every edit to
# any tracked file (including a document) leaves `make check` failing on a stale index,
# and a gate that is annoying gets bypassed just as surely as one that is slow.
if python3 tools/index/build.py >/dev/null 2>&1; then
	note "index rebuilt"
else
	note "index: SKIPPED (build failed — run make index to see why)"
fi

if is_json; then
	printf '{"status":"ok","applied":"%s"}\n' "$(json_escape "$applied")"
else
	printf '%s\n' "$applied" | tr '|' '\n' | sed 's/^/  /'
	printf '\nfix: done — review the diff, then run make check\n'
fi
