# shellcheck shell=sh
# Shared helpers for the Runway task interface. Sourced, never executed.
#
# Exit codes are part of the interface contract — see docs/task-interface.md.

EX_OK=0
EX_RULE=1
EX_NEEDS_INPUT=2
EX_TOOLING=3
EX_STALE_INDEX=4

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export REPO_ROOT
LEDGER="$REPO_ROOT/rules/ledger.yaml"

# --- output -----------------------------------------------------------------

is_json() { [ "${RUNWAY_JSON:-}" = "1" ]; }

say()  { is_json || printf '%s\n' "$*"; }
warn() { is_json || printf 'warn: %s\n' "$*" >&2; }
ok()   { is_json || printf '  ok    %s\n' "$*"; }

# json_escape <string> — escape a string for embedding in a JSON string literal.
json_escape() {
	printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/	/\\t/g' | tr -d '\n'
}

# --- rules ------------------------------------------------------------------

# rule_field <rule-id> <field> — read one field of a rule from the ledger.
rule_field() {
	[ -f "$LEDGER" ] || return 0
	awk -v id="$1" -v field="$2:" '
		$1 == "-" && $2 == "id:" { cur = ($3 == id) }
		cur && $1 == field { $1 = ""; sub(/^[ \t]+/, ""); print; exit }
	' "$LEDGER"
}

# fail_rule <rule-id> <message...> — record a rule violation.
#
# Every gate failure names the violated rule and points at the document that explains
# it, so an agent that never read the contract is taught the relevant part exactly when
# it matters. Where the rule has a deterministic repository-owned fix, the message says
# which command applies it — such files are never repaired by hand.
fail_rule() {
	_rid=$1
	shift
	_msg=$*
	_where=$(rule_field "$_rid" contract)
	_fix=$(rule_field "$_rid" fix)
	if ! is_json; then
		printf '  FAIL  %s  %s\n' "$_rid" "$_msg" >&2
		[ -n "$_where" ] && printf '        why:  %s\n' "$_where" >&2
		[ -n "$_fix" ] && [ "$_fix" != "none" ] && printf '        fix:  %s\n' "$_fix" >&2
	fi
	if [ -n "${RUNWAY_FINDINGS:-}" ]; then
		printf '%s\t%s\t%s\t%s\n' "$_rid" "$_msg" "${_where:-}" "${_fix:-none}" >>"$RUNWAY_FINDINGS"
	fi
	RUNWAY_FAILED=1
}

# check_result — exit code for a check script, based on whether fail_rule was called.
check_result() {
	[ "${RUNWAY_FAILED:-0}" = "1" ] && return "$EX_RULE"
	return "$EX_OK"
}

# --- environment ------------------------------------------------------------

have() { command -v "$1" >/dev/null 2>&1; }

# version_at_least <have> <want> — true when have >= want, comparing major.minor.
version_at_least() {
	awk -v h="$1" -v w="$2" 'BEGIN {
		split(h, a, "."); split(w, b, ".");
		ha = a[1] + 0; hb = a[2] + 0; wa = b[1] + 0; wb = b[2] + 0;
		if (ha > wa) exit 0; if (ha < wa) exit 1;
		if (hb >= wb) exit 0; exit 1;
	}'
}

# load_versions — export the declared runtime versions.
load_versions() {
	# shellcheck source=versions.env
	. "$REPO_ROOT/tools/versions.env"
}
