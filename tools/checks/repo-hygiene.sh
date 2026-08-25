#!/bin/sh
# RULE-HYG-001  Secret-bearing and generated paths MUST NOT be tracked in git.
# RULE-HYG-002  .gitignore MUST cover every such path.
# RULE-HYG-003  A checked-in deployment compose file MUST reference secrets, never carry them.
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
	'frontend/dist|frontend/dist/' \
	'backend/.coverage|.coverage' \
	'backend/.pytest_cache|.pytest_cache/'

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

# Deployment compose files are checked in so the production topology is reviewable. That is
# only safe while every secret in them is a ${...} reference resolved from a .env that stays
# on the host. A literal would publish a live credential to a public repository, and it would
# look exactly like the reference it replaced.
for f in $(printf '%s\n' "$tracked" | grep -E '^ops/deploy/.*\.ya?ml$' || true); do
	# Lines of the form  - NAME=value  where NAME looks credential-bearing.
	bad=$(grep -nE '^[[:space:]]*-?[[:space:]]*[A-Z_]*(SECRET|PASSWORD|PASSWD|TOKEN|APIKEY|API_KEY|PRIVATE_KEY)[A-Z_]*[=:]' "$f" |
		grep -vE '[=:][[:space:]]*\$\{[A-Za-z_][A-Za-z0-9_]*(:?-[^}]*)?\}[[:space:]]*$' || true)
	[ -n "$bad" ] || continue
	# Deliberately NOT `printf ... | while read`: a pipeline runs its right-hand side in a
	# subshell, so every fail_rule would be recorded there and lost. The first draft of this
	# check did exactly that — it printed the finding and still exited 0, which is the worst
	# failure a secret check can have. Split on newlines in the current shell instead.
	_oldifs=$IFS
	IFS='
'
	for line in $bad; do
		IFS=$_oldifs
		fail_rule RULE-HYG-003 "$f carries a literal secret instead of a reference: ${line%%=*}="
		IFS='
'
	done
	IFS=$_oldifs
done

if ! check_result; then
	exit "$EX_RULE"
fi
ok "no secret-bearing path is tracked; .gitignore covers all of them"
exit "$EX_OK"
