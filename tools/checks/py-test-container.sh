#!/bin/sh
# RULE-TEST-002  The backend container test suite MUST pass against the real Taskwarrior
#                binary, including cross-tenant isolation, as the unprivileged runtime user
#                on a read-only root; and the runtime images MUST run under the deploy
#                hardening.
#
# The unit tier cannot cover what the binary does: its urgency algorithm, its argument
# grammar, and the per-user isolation that rests entirely on TASKDATA. This tier runs
# inside backend/Dockerfile.test, where a real `task` exists.
#
# Since brief 0076 (ADR 0048) it runs in two parts. The suite runs as uid 10001 on a read-only
# root with every capability dropped — as root, every file-permission question the binary asks
# would have been answered yes. Then tools/checks/container_hardening.py builds the two runtime
# images as deploy.yml does and runs them with the deploy compose's flags: non-root, write
# refusal outside the mounts, the volume-ownership migration, the healthcheck, and the browser
# headers on success, error and fallback paths.
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

# The deploy compose's backend flags once the switch is made (ADR 0048): uid 10001, read-only
# root, one tmpfs, no capability, no new privileges.
if ! out=$(docker run --rm --user 10001:10001 --read-only \
	--tmpfs /tmp:rw,noexec,nosuid,nodev,size=256m --cap-drop ALL \
	--security-opt no-new-privileges:true runway-backend-test 2>&1); then
	printf '%s\n' "$out" | tail -40 | sed 's/^/        /' >&2
	fail_rule RULE-TEST-002 "the backend container suite failed against the real Taskwarrior binary"
	exit "$EX_RULE"
fi
summary=$(printf '%s\n' "$out" | grep -E '[0-9]+ (passed|failed|skipped)' | tail -1)

PY="$REPO_ROOT/backend/.venv/bin/python"
[ -x "$PY" ] || { printf '  backend/.venv is missing — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }
if ! hardening=$("$PY" "$REPO_ROOT/tools/checks/container_hardening.py" 2>&1); then
	printf '%s\n' "$hardening" | tail -40 | sed 's/^/        /' >&2
	fail_rule RULE-TEST-002 "the runtime images do not hold under the deploy hardening"
	exit "$EX_RULE"
fi

ok "${summary:-suite passed} as uid 10001, read-only; runtime images hardened"
exit "$EX_OK"
