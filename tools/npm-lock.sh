#!/bin/sh
# Regenerate frontend/package-lock.json under the DECLARED Node version.
#
# Why this exists. Development happens on whatever Node the developer has; CI and the
# frontend image build on the version in tools/versions.env. npm majors do not agree on
# lockfile contents — npm 11 omits optional platform packages (the @esbuild/* family)
# that npm 10 then reports as "Missing from lock file", so `npm ci` fails in CI while
# every local command succeeds.
#
# Run this after ANY change to frontend/package.json:
#
#     tools/npm-lock.sh
#
# It uses Docker so the lockfile is written by the same npm that will later read it.
set -eu
. "$(dirname -- "$0")/lib.sh"
load_versions

cd "$REPO_ROOT"

have docker || {
	printf 'needs input: docker is required to regenerate the lockfile under node %s.\n' "$NODE_VERSION" >&2
	printf '  without it, run `npm install --package-lock-only` on a node %s host.\n' "$NODE_VERSION" >&2
	exit "$EX_NEEDS_INPUT"
}

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp frontend/package.json "$work/"
[ -f frontend/package-lock.json ] && cp frontend/package-lock.json "$work/"

docker run --rm -v "$work:/app" -w /app "node:${NODE_VERSION}-alpine" \
	npm install --package-lock-only >/dev/null 2>&1

cp "$work/package-lock.json" frontend/package-lock.json
printf 'frontend/package-lock.json regenerated under node %s\n' "$NODE_VERSION"
printf 'verify with: docker run --rm -v "$PWD/frontend:/app" -w /app node:%s-alpine npm ci\n' "$NODE_VERSION"
