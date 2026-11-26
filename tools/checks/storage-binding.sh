#!/bin/sh
# RULE-SEC-003  Only backend/app/task_storage.py may build a path from the data root.
#
# Finding SEC-001: the username was joined onto DATA_ROOT verbatim and handed to Taskwarrior,
# so `alice/../alice` opened alice's store. The store is now named by a random storage id and
# resolved in exactly one module; this rule fails the gate when a second module starts
# building paths from the data root again (ADR 0043).
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"
PY=backend/.venv/bin/python
[ -x "$PY" ] || { printf '  backend/.venv is missing — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }

findings=$("$PY" tools/checks/storage_binding.py) || {
	printf '  the storage-binding scan could not run\n' >&2
	exit "$EX_TOOLING"
}

if [ -n "$findings" ]; then
	printf '%s\n' "$findings" | while IFS='|' read -r rule message; do
		[ -n "$rule" ] && fail_rule "$rule" "$message"
	done
	exit "$EX_RULE"
fi

ok "only the storage resolver builds a path from the data root"
exit "$EX_OK"
