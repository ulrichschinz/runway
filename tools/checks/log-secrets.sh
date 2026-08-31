#!/bin/sh
# RULE-OPS-002  No credential may reach a log line.
#
# A password in the database is a credential under a control. The same password in a log line
# is a credential in a file, in a backup, and in whoever's terminal scrollback — kept for as
# long as the retention policy says, which is longer than anyone remembers. Nothing raises and
# nothing errors; the disclosure is invisible until someone reads the file.
#
# The serving application has no logging at all today, so this property holds for free. It
# stops holding in the first commit that adds a logger, which is why the rule lands first.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"
PY=backend/.venv/bin/python
[ -x "$PY" ] || { printf '  backend/.venv is missing — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }

findings=$("$PY" tools/checks/log_secrets.py) || {
	printf '  the log-secrets scan could not run\n' >&2
	exit "$EX_TOOLING"
}

if [ -n "$findings" ]; then
	printf '%s\n' "$findings" | while IFS='|' read -r rule message; do
		[ -n "$rule" ] && fail_rule "$rule" "$message"
	done
	exit "$EX_RULE"
fi

ok "no credential-bearing expression reaches a logging call"
exit "$EX_OK"
