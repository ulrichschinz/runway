#!/bin/sh
# RULE-TEST-002  The backend container test suite MUST pass against the real Taskwarrior
#                binary, including cross-tenant isolation.
#
# The unit tier cannot cover what the binary does: its urgency algorithm, its argument
# grammar, and the per-user isolation that rests entirely on TASKDATA. This tier runs
# inside backend/Dockerfile.test, where a real `task` exists.
#
# PLATFORM LIMIT: the image installs Taskwarrior from archlinux, which publishes no arm64
# manifest, and pacman fails under amd64 emulation. On an arm64 developer machine this
# check reports that and passes; CI is x86_64 and runs it for real. Recorded as
# RISK-TEST-001 — an arm64 developer never sees this tier locally.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT/backend"

have docker || { say "  skipped: docker is unavailable (RISK-TEST-001)"; exit "$EX_OK"; }
if ! docker info >/dev/null 2>&1; then
	say "  skipped: the docker daemon is not running (RISK-TEST-001)"
	exit "$EX_OK"
fi

arch=$(uname -m)
if [ "$arch" != "x86_64" ] && [ "$arch" != "amd64" ]; then
	say "  skipped on $arch: archlinux publishes no arm64 image and pacman fails under"
	say "           emulation, so this tier runs in CI only (RISK-TEST-001)"
	exit "$EX_OK"
fi

if ! build=$(docker build -q -t runway-backend-test -f Dockerfile.test . 2>&1); then
	printf '%s\n' "$build" | tail -20 | sed 's/^/        /' >&2
	fail_rule RULE-TEST-002 "the test image could not be built"
	exit "$EX_RULE"
fi

if out=$(docker run --rm runway-backend-test 2>&1); then
	summary=$(printf '%s\n' "$out" | grep -E '[0-9]+ (passed|failed|skipped)' | tail -1)
	ok "${summary:-suite passed}"
	exit "$EX_OK"
fi
printf '%s\n' "$out" | tail -40 | sed 's/^/        /' >&2
fail_rule RULE-TEST-002 "the backend container suite failed against the real Taskwarrior binary"
exit "$EX_RULE"
