#!/bin/sh
# RULE-TI-003  Every command's JSON=1 output MUST be a single valid JSON object on
#              stdout, with nothing else mixed in.
#
# Agents parse this. A check that prints a friendly summary to stdout without honouring
# JSON mode corrupts the stream for every consumer, and the failure is invisible to
# anyone reading the human output — which is exactly how this rule came to exist.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"

validate() {
	label=$1
	shift
	if out=$("$@" 2>/dev/null); then :; else :; fi
	if printf '%s' "$out" | python3 -c 'import json,sys; json.load(sys.stdin)' 2>/dev/null; then
		return 0
	fi
	fail_rule RULE-TI-003 "$label did not emit valid JSON on stdout"
	printf '%s\n' "$out" | head -3 | sed 's/^/        got: /' >&2
	return 1
}

have python3 || { printf '  python3 is required to validate JSON output\n' >&2; exit "$EX_TOOLING"; }

validate "./run check JSON=1"        env RUNWAY_JSON=1 ./run check        || true
validate "./run check PLAN=1 JSON=1" env RUNWAY_JSON=1 RUNWAY_PLAN=1 ./run check || true
validate "./run doctor JSON=1"       env RUNWAY_JSON=1 ./run doctor       || true
validate "./run help JSON=1"         env RUNWAY_JSON=1 ./run help         || true

if ! check_result; then
	exit "$EX_RULE"
fi
ok "check, plan, doctor and help all emit valid JSON"
exit "$EX_OK"
