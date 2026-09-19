#!/bin/sh
# RULE-SURF-003  Every route and MCP tool the Claude skill names MUST exist on the surface.
# RULE-SURF-004  A change to the skill MUST ship with a raised plugin version.
# RULE-TEST-005  integrations/claude/install.sh MUST pass its test.
#
# The skill in integrations/claude/ is a consumer of this repository's public surface that
# lives inside the repository, so the gate can hold it to that surface directly: a renamed
# route breaks the skill in the same pull request instead of on somebody's machine a week
# later. See ADR 0035.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"
PY=backend/.venv/bin/python
[ -x "$PY" ] || { printf '  backend/.venv is missing — run make bootstrap\n' >&2; exit "$EX_TOOLING"; }

findings=$("$PY" tools/checks/skill_surface.py) || {
	printf '  the skill surface check could not run\n' >&2
	exit "$EX_TOOLING"
}
installer=$(sh integrations/claude/tests/install_test.sh 2>&1) || {
	findings=$(printf '%s\n%s' "$findings" "$(printf '%s\n' "$installer" | sed 's/^/RULE-TEST-005|/')")
}

if [ -n "$findings" ]; then
	printf '%s\n' "$findings" | while IFS='|' read -r rule message; do
		[ -n "$rule" ] && fail_rule "$rule" "$message"
	done
	exit "$EX_RULE"
fi

ok "the skill names only existing routes and tools, its release record is current, install.sh holds"
exit "$EX_OK"
