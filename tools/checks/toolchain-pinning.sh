#!/bin/sh
# RULE-TI-002  The runtime versions declared in tools/versions.env MUST match the
#              versions the Dockerfiles actually build on.
#
# tools/versions.env is what `make doctor` and `make bootstrap` provision against. If it
# disagrees with the Dockerfiles, every local environment is silently wrong about what
# production runs. Step 14 extends this rule from tags to digests.
set -eu
. "$(dirname -- "$0")/../lib.sh"
load_versions

cd "$REPO_ROOT"

grep -qE "^FROM python:${PYTHON_VERSION}(\.|-)" backend/Dockerfile ||
	fail_rule RULE-TI-002 "backend/Dockerfile does not build on python:${PYTHON_VERSION} (tools/versions.env)"

grep -qE "^FROM node:${NODE_VERSION}(\.|-)" frontend/Dockerfile ||
	fail_rule RULE-TI-002 "frontend/Dockerfile does not build on node:${NODE_VERSION} (tools/versions.env)"

if ! check_result; then
	exit "$EX_RULE"
fi
ok "Dockerfiles build on python ${PYTHON_VERSION} and node ${NODE_VERSION}, as declared"
exit "$EX_OK"
