#!/bin/sh
# Regenerate the hash-pinned Python locks from requirements.txt and requirements-dev.txt.
#
# The .txt files are the intent — nine direct dependencies, pinned exactly. The .lock files
# are the closure: every transitive dependency with its artefact hashes, which is what the
# images install with --require-hashes. Editing a .lock by hand produces a file the next run
# of this command undoes.
set -eu
. "$(dirname -- "$0")/lib.sh"

cd "$REPO_ROOT/backend"
command -v uv >/dev/null 2>&1 || {
	printf '  uv is required to regenerate the locks — see docs/task-interface.md\n' >&2
	exit "$EX_TOOLING"
}

uv pip compile requirements.txt --generate-hashes --quiet -o requirements.lock
uv pip compile requirements.txt requirements-dev.txt --generate-hashes --quiet -o requirements-dev.lock

ok "requirements.lock and requirements-dev.lock regenerated"
exit "$EX_OK"
