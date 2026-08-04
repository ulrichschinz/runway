#!/bin/sh
# Run a verification profile (check | verify) and aggregate its findings.
#
# Full-scope execution is the default and, at this repository's size, the only mode:
# no affected-target selection is applied, so a green run is never weakened by a
# selection heuristic. See docs/plan/phase-0-2.md §2.1 for the re-open trigger.
#
# Adding a check is one file in tools/checks/ plus one line in tools/checks/profiles.conf.
set -eu
. "$(dirname -- "$0")/lib.sh"

profile=${1:?needs input: profile name (check|verify)}
manifest="$REPO_ROOT/tools/checks/profiles.conf"
budgets="$REPO_ROOT/tools/checks/budgets.conf"

[ -f "$manifest" ] || { printf 'missing %s\n' "$manifest" >&2; exit "$EX_TOOLING"; }

selected=$(awk -v p="$profile" '
	!/^#/ && NF >= 2 {
		n = split($2, ps, ",");
		for (i = 1; i <= n; i++) if (ps[i] == p) print $1
	}' "$manifest")

# --- PLAN=1: the resolved execution plan, without running anything -----------

if [ "${RUNWAY_PLAN:-}" = "1" ]; then
	skipped=$(awk -v p="$profile" '
		!/^#/ && NF >= 2 { n = split($2, ps, ","); hit = 0;
			for (i = 1; i <= n; i++) if (ps[i] == p) hit = 1;
			if (!hit) print $1 }' "$manifest")
	if is_json; then
		printf '{"profile":"%s","scope":"full","selection_rule":"no affected-target selection is applied",' "$profile"
		printf '"selected":['
		printf '%s' "$selected" | awk 'NF{printf "%s\"%s\"", sep, $0; sep=","}'
		printf '],"skipped":['
		printf '%s' "$skipped" | awk 'NF{printf "%s\"%s\"", sep, $0; sep=","}'
		printf '],"unknowns":[],"fallback":"none — full scope already selected"}\n'
	else
		printf 'profile %s — resolved execution plan\n\n' "$profile"
		printf '  scope:     full (no affected-target selection is applied)\n'
		printf '  selected:  %s\n' "$(printf '%s' "$selected" | tr '\n' ' ')"
		printf '  skipped:   %s\n' "$(printf '%s' "$skipped" | tr '\n' ' ')"
		printf '  rule:      a check runs in a profile iff tools/checks/profiles.conf lists it there\n'
		printf '  fallback:  none needed — full scope is already selected\n'
	fi
	exit "$EX_OK"
fi

# --- run --------------------------------------------------------------------

RUNWAY_FINDINGS=$(mktemp)
export RUNWAY_FINDINGS
trap 'rm -f "$RUNWAY_FINDINGS"' EXIT

started=$(date +%s)
failed=0
tooling=0
ran=""

say "profile $profile — full scope"
say ""

for name in $selected; do
	script="$REPO_ROOT/tools/checks/$name.sh"
	if [ ! -x "$script" ]; then
		printf '  FAIL  %s: tools/checks/%s.sh is missing or not executable\n' "$name" "$name" >&2
		tooling=$((tooling + 1))
		continue
	fi
	say "  $name"
	set +e
	"$script"
	rc=$?
	set -e
	ran="${ran}${ran:+ }$name"
	case "$rc" in
		0) ;;
		"$EX_RULE") failed=$((failed + 1)) ;;
		"$EX_STALE_INDEX") failed=$((failed + 1)) ;;
		*) tooling=$((tooling + 1)) ;;
	esac
done

elapsed=$(( $(date +%s) - started ))

# --- runtime budget ---------------------------------------------------------
#
# A slow gate gets bypassed, so the budget is enforced rather than advertised.

budget=$(awk -F= -v p="$profile" '!/^#/ && $1 == p { print $2 }' "$budgets" 2>/dev/null || true)
over=0
if [ -n "${budget:-}" ] && [ "$elapsed" -gt "$budget" ]; then
	RUNWAY_FAILED=0
	fail_rule RULE-GATE-001 "profile $profile took ${elapsed}s, over its ${budget}s budget"
	over=1
	failed=$((failed + 1))
fi

# --- report -----------------------------------------------------------------

if is_json; then
	printf '{"profile":"%s","scope":"full","elapsed_seconds":%s,"budget_seconds":%s,' \
		"$profile" "$elapsed" "${budget:-null}"
	printf '"checks_run":%s,"violations":%s,"tooling_errors":%s,"over_budget":%s,"findings":[' \
		"$(printf '%s' "$ran" | wc -w | tr -d ' ')" "$failed" "$tooling" "$over"
	awk -F'\t' '{printf "%s{\"rule\":\"%s\",\"message\":\"%s\",\"contract\":\"%s\",\"fix\":\"%s\"}", sep, $1, $2, $3, $4; sep=","}' \
		"$RUNWAY_FINDINGS"
	printf ']}\n'
else
	printf '\n%s: %ss' "$profile" "$elapsed"
	[ -n "${budget:-}" ] && printf ' of %ss budget' "$budget"
	printf '\n'
	if [ "$tooling" -gt 0 ]; then
		printf '%s: %s tooling error(s) — the gate could not run to completion\n' "$profile" "$tooling" >&2
	fi
	if [ "$failed" -gt 0 ]; then
		printf '%s: RED — %s rule violation(s)\n' "$profile" "$failed" >&2
	elif [ "$tooling" -eq 0 ]; then
		printf '%s: GREEN\n' "$profile"
	fi
fi

[ "$tooling" -gt 0 ] && exit "$EX_TOOLING"
[ "$failed" -gt 0 ] && exit "$EX_RULE"
exit "$EX_OK"
