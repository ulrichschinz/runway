#!/bin/sh
# RULE-HYG-001  Secret-bearing and generated paths MUST NOT be tracked in git.
# RULE-HYG-002  .gitignore MUST cover every such path.
#
# This repository's secrets live in .env, its user database in users.db, and its
# per-user task data in data/. All three are bind-mounted on the deploy host, so a
# single accidental `git add` publishes production credentials to a public repository.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"

tracked=$(git ls-files)

# <path>|<required .gitignore line>
set -- \
	'.env|.env' \
	'users.db|users.db' \
	'data|data/' \
	'backend/.venv|backend/.venv/' \
	'frontend/node_modules|frontend/node_modules/' \
	'frontend/dist|frontend/dist/'

for entry in "$@"; do
	path=${entry%%|*}
	ignore_line=${entry#*|}

	if printf '%s\n' "$tracked" | grep -qE "^${path}(/|\$)"; then
		fail_rule RULE-HYG-001 "'$path' is tracked in git"
	fi
	if ! grep -qxF "$ignore_line" .gitignore; then
		fail_rule RULE-HYG-002 ".gitignore is missing the line '$ignore_line'"
	fi
done

# Credential-shaped files anywhere in the tree.
for f in $(printf '%s\n' "$tracked" | grep -E '\.(pem|key|p12|pfx)$|(^|/)id_(rsa|ed25519)$' || true); do
	fail_rule RULE-HYG-001 "credential-shaped file '$f' is tracked in git"
done

if ! check_result; then
	exit "$EX_RULE"
fi
ok "no secret-bearing path is tracked; .gitignore covers all of them"
exit "$EX_OK"
