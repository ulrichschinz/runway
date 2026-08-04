#!/bin/sh
# Report whether this machine can build, test and verify the repository.
#
# doctor never mutates anything. It answers one question: what would fail, and why.
set -eu
. "$(dirname -- "$0")/lib.sh"
load_versions

problems=0
notes=""

record() { notes="${notes}${notes:+|}$1" ; }

# --- required ---------------------------------------------------------------

if have git; then ok "git         $(git --version | awk '{print $3}')"
else say "  MISSING git"; problems=$((problems + 1)); record "git is required"; fi

if have make; then ok "make        $(make --version 2>/dev/null | head -1 | awk '{print $3}')"
else say "  MISSING make"; problems=$((problems + 1)); record "make is required"; fi

# --- python -----------------------------------------------------------------

py_path="$REPO_ROOT/backend/.venv/bin/python"
if [ -x "$py_path" ]; then
	pyv=$("$py_path" -c 'import sys; print("%d.%d" % sys.version_info[:2])')
	if [ "$pyv" = "$PYTHON_VERSION" ]; then
		ok "python      $pyv (backend/.venv)"
	else
		say "  WARN  python  $pyv in backend/.venv, but tools/versions.env declares $PYTHON_VERSION"
		record "backend/.venv runs Python $pyv, declared $PYTHON_VERSION — see ADR 0002"
	fi
elif have uv; then
	ok "python      not provisioned yet; uv $(uv --version | awk '{print $2}') can fetch $PYTHON_VERSION"
	record "run 'make bootstrap' to create backend/.venv"
elif have python3; then
	pyv=$(python3 -c 'import sys; print("%d.%d" % sys.version_info[:2])')
	if version_at_least "$pyv" "$PYTHON_VERSION"; then
		say "  WARN  python  system $pyv will be used; uv is absent so the declared $PYTHON_VERSION cannot be fetched"
		record "uv is absent — bootstrap falls back to system Python $pyv (ADR 0002 fallback path)"
	else
		say "  MISSING python $PYTHON_VERSION (system has $pyv, uv absent)"
		problems=$((problems + 1))
		record "install uv, or a Python >= $PYTHON_VERSION"
	fi
else
	say "  MISSING python3"; problems=$((problems + 1)); record "python3 is required"
fi

# --- node -------------------------------------------------------------------

if have node; then
	nodev=$(node --version | sed 's/^v//')
	nodemajor=${nodev%%.*}
	if [ "$nodemajor" -eq "$NODE_VERSION" ]; then
		ok "node        $nodev"
	elif version_at_least "$nodev" "$NODE_VERSION.0"; then
		say "  WARN  node    $nodev; the frontend image builds on node $NODE_VERSION"
		record "node $nodev differs from the declared major $NODE_VERSION"
	else
		say "  MISSING node >= $NODE_VERSION (found $nodev)"
		problems=$((problems + 1)); record "node >= $NODE_VERSION is required"
	fi
else
	say "  MISSING node"; problems=$((problems + 1)); record "node >= $NODE_VERSION is required"
fi

have npm && ok "npm         $(npm --version)" || { say "  MISSING npm"; problems=$((problems + 1)); }

# --- optional ---------------------------------------------------------------

if have docker; then ok "docker      $(docker --version | awk '{print $3}' | tr -d ,)"
else say "  absent  docker  (only the container test tier and image builds need it)"; fi

if have task; then ok "task        $(task --version 2>/dev/null)"
else say "  absent  task    (Taskwarrior; the container test tier supplies it — Step 3)"; fi

# --- report -----------------------------------------------------------------

if is_json; then
	printf '{"status":"%s","problems":%s,"notes":"%s"}\n' \
		"$([ "$problems" -eq 0 ] && echo ok || echo blocked)" "$problems" "$(json_escape "$notes")"
else
	printf '\n'
	if [ "$problems" -eq 0 ]; then
		say "doctor: ok"
	else
		printf 'doctor: %s blocking problem(s)\n' "$problems" >&2
	fi
	[ -n "$notes" ] && printf '%s\n' "$notes" | tr '|' '\n' | sed 's/^/  note: /'
fi

[ "$problems" -eq 0 ] || exit "$EX_TOOLING"
exit "$EX_OK"
