#!/bin/sh
# RULE-DEP-002  Every dependency's licence MUST be classified by policy/licenses.yaml, and
#               MUST NOT be forbidden or an unapproved review case.
# RULE-DEP-003  No credential may be committed.
# RULE-DEP-004  Every base image MUST be pinned by digest, and Python dependencies MUST be
#               installed from a hash-pinned lock.
#
# This repository publishes container images from a public repository. A dependency's licence
# is an obligation passed to whoever redeploys them; a committed credential is disclosed the
# moment it is pushed; and a floating base tag means the thing shipped is a function of the
# calendar rather than of the commit.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"
PY=backend/.venv/bin/python
[ -x "$PY" ] || { printf '  backend/.venv is missing — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }

findings=$("$PY" tools/checks/licenses.py; "$PY" tools/checks/secret_scan.py; "$PY" tools/checks/pinning.py) || {
	printf '  the supply-chain checks could not run\n' >&2
	exit "$EX_TOOLING"
}

if [ -n "$findings" ]; then
	printf '%s\n' "$findings" | while IFS='|' read -r rule message; do
		[ -n "$rule" ] && fail_rule "$rule" "$message"
	done
	exit "$EX_RULE"
fi

ok "licences classified, no committed credentials, base images and Python deps pinned"
exit "$EX_OK"
