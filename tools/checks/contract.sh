#!/bin/sh
# RULE-DOC-001  Every factual claim in AGENTS.md MUST hold.
# RULE-DOC-002  AGENTS.md MUST stay inside its length budget.
# RULE-DOC-003  A scoped contract refines the root; it never defines rules of its own.
# RULE-RULE-001 The Rule Ledger MUST be complete: every rule has a check and a fixture.
# RULE-RULE-002 No waiver may be expired, and each records all five groups.
# RULE-RULE-003 Every inline suppression MUST reference a waiver or a justified suppression.
#
# This is what stops the contract becoming fiction. A document nobody verifies drifts, and
# a drifted contract is worse than none — because it is followed.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"
PY=backend/.venv/bin/python
[ -x "$PY" ] || { printf '  backend/.venv is missing — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }

findings=$("$PY" tools/checks/contract_check.py) || {
	printf '  the contract check could not run\n' >&2
	exit "$EX_TOOLING"
}

if [ -n "$findings" ]; then
	printf '%s\n' "$findings" | while IFS='|' read -r rule message; do
		[ -n "$rule" ] && fail_rule "$rule" "$message"
	done
	exit "$EX_RULE"
fi
ok "contract claims hold; ledger complete; no expired waivers; no orphan suppressions"
exit "$EX_OK"
