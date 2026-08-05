#!/bin/sh
# RULE-IDX-004  The CLI and MCP adapters MUST return the same facts.
#
# Two access paths over one query layer is only worth having if they cannot disagree.
# Presentation may differ — the CLI renders for humans, MCP returns JSON — but every fact,
# evidence class, revision, freshness value and blind spot must match. If an agent using
# MCP and a human using the CLI can reach different conclusions about the same code, the
# index has two truths and neither is trustworthy.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"
[ -x backend/.venv/bin/pytest ] || { printf '  pytest is not installed — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }

if out=$(backend/.venv/bin/pytest tools/index/tests/test_parity.py --no-header --tb=short -p no:warnings 2>&1); then
	summary=$(printf '%s\n' "$out" | grep -oE '[0-9]+ passed[^=]*' | tail -1 | sed 's/ *$//')
	ok "${summary:-parity holds}"
	exit "$EX_OK"
fi
printf '%s\n' "$out" | tail -30 | sed 's/^/        /' >&2
fail_rule RULE-IDX-004 "the CLI and MCP adapters disagree, or a canonical query is wrong"
exit "$EX_RULE"
