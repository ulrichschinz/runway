#!/bin/sh
# Prepare a clean clone for development. Idempotent: safe to re-run at any time.
#
# Everything this script writes is git-ignored. It never touches tracked files, and it
# never contacts the deploy host or any registry.
set -eu
. "$(dirname -- "$0")/lib.sh"
load_versions

cd "$REPO_ROOT"
created=""
note() { created="${created}${created:+|}$1"; }

# --- local state the app expects to exist -----------------------------------
#
# docker-compose.yml bind-mounts ./users.db as a FILE. If it does not exist, Docker
# creates a DIRECTORY at that path and the backend fails to start with an error that
# points nowhere near the cause. Creating it here is the whole fix.

if [ ! -e users.db ]; then
	: >users.db
	note "created users.db (empty file — a bind mount would otherwise become a directory)"
fi
if [ -d users.db ]; then
	printf 'users.db exists as a DIRECTORY. Docker created it from an earlier bind mount.\n' >&2
	printf 'Remove it and re-run: rm -rf users.db && make bootstrap\n' >&2
	exit "$EX_TOOLING"
fi

[ -d data ] || { mkdir -p data; note "created data/ (per-user Taskwarrior storage)"; }

# --- .env -------------------------------------------------------------------
#
# A generated random secret, never the placeholder from .env.example. Shipping a working
# default signing key is finding SEC-1; this bootstrap must not recreate it locally.

if [ ! -f .env ]; then
	if have openssl; then
		secret=$(openssl rand -base64 48 | tr -d '\n')
	elif have python3; then
		secret=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')
	else
		printf 'needs input: cannot generate JWT_SECRET (no openssl, no python3).\n' >&2
		printf '  supply it by hand:  cp .env.example .env && edit JWT_SECRET\n' >&2
		exit "$EX_NEEDS_INPUT"
	fi
	{
		printf 'JWT_SECRET=%s\n' "$secret"
		printf 'ALLOW_REGISTRATION=true\n'
	} >.env
	note ".env created with a freshly generated JWT_SECRET (local only)"
fi

# --- backend ----------------------------------------------------------------

# run <description> <command...> — run a step, and on failure SAY WHY.
#
# These steps used to run with --quiet/--silent and no error handling. When one failed in
# CI the log showed the step starting and then `make: *** Error 1`, with no message at
# all: a bootstrap that cannot explain its own failure sends whoever hits it straight to
# guessing. Output is captured and replayed only when something goes wrong.
run() {
	_what=$1
	shift
	if _out=$("$@" 2>&1); then
		return 0
	fi
	printf 'bootstrap failed: %s\n' "$_what" >&2
	printf '  command: %s\n' "$*" >&2
	printf '%s\n' "$_out" | sed 's/^/  | /' >&2
	exit "$EX_TOOLING"
}

if have uv; then
	[ -d backend/.venv ] || run "creating backend/.venv" \
		uv venv --python "$PYTHON_VERSION" backend/.venv
	VIRTUAL_ENV="$REPO_ROOT/backend/.venv"
	export VIRTUAL_ENV
	run "installing backend dependencies with uv" \
		uv pip install -r backend/requirements.txt -r backend/requirements-dev.txt
	note "backend/.venv provisioned by uv (Python $PYTHON_VERSION)"
else
	[ -d backend/.venv ] || run "creating backend/.venv" python3 -m venv backend/.venv
	run "upgrading pip" backend/.venv/bin/pip install --quiet --upgrade pip
	run "installing backend dependencies with pip" \
		backend/.venv/bin/pip install --quiet \
		-r backend/requirements.txt -r backend/requirements-dev.txt
	note "backend/.venv provisioned by python3 -m venv (uv absent — ADR 0002 fallback)"
fi

# --- frontend ---------------------------------------------------------------

if [ -d frontend/node_modules ] && [ frontend/node_modules -nt frontend/package-lock.json ]; then
	note "frontend/node_modules already current"
else
	run "installing frontend dependencies from package-lock.json" \
		sh -c 'cd frontend && npm ci --silent'
	note "frontend/node_modules installed from package-lock.json"
fi

# --- report -----------------------------------------------------------------

if is_json; then
	printf '{"status":"ok","actions":"%s"}\n' "$(json_escape "$created")"
else
	printf '%s\n' "$created" | tr '|' '\n' | sed 's/^/  /'
	printf '\nbootstrap: ok — next: make doctor && make check\n'
fi
