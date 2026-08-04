#!/bin/sh
# Negative fixtures: construct a genuine violation of every executable rule and confirm
# the gate goes red. Restores everything it touches.
#
# Correct execution is not evidence that a gate works. A check that silently passes on a
# real violation is worse than no check, because it is believed. This script is how each
# rule earns the word "executable" in rules/ledger.yaml.
#
# Step 2 wires this into the verify profile as a conformance test. Until then, run it by
# hand:  tools/fixtures/negative.sh
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"

# This script mutates tracked files and the git index. Refuse to run unless the files it
# touches are clean, so a failed restore can never eat uncommitted work.
DIRTY=$(git status --porcelain -- .gitignore Makefile docs/task-interface.md \
	tools/versions.env tools/checks/budgets.conf tools/checks/profiles.conf)
if [ -n "$DIRTY" ]; then
	printf 'refusing to run: these files have uncommitted changes.\n' >&2
	printf '%s\n' "$DIRTY" >&2
	printf 'commit or stash them first — this script rewrites them and restores from a backup.\n' >&2
	exit "$EX_NEEDS_INPUT"
fi

TOUCHED=".gitignore Makefile docs/task-interface.md tools/versions.env tools/checks/budgets.conf tools/checks/profiles.conf"
BAK=$(mktemp -d)
for f in $TOUCHED; do
	mkdir -p "$BAK/$(dirname "$f")"
	cp "$f" "$BAK/$f"
done

restore() {
	for f in $TOUCHED; do cp "$BAK/$f" "$f"; done
	rm -f deploy_key.pem tools/checks/slow-fixture.sh
	git rm -q --cached deploy_key.pem 2>/dev/null || true
}
trap 'restore; rm -rf "$BAK"' EXIT INT TERM

pass=0
fail=0

expect_red() {
	label=$1
	want=$2
	set +e
	out=$(./run check 2>&1)
	rc=$?
	set -e
	if [ "$rc" -eq "$EX_RULE" ] && printf '%s' "$out" | grep -q "$want"; then
		printf 'PASS  %-16s gate went red on %s\n' "$label" "$want"
		pass=$((pass + 1))
	else
		printf 'FAIL  %-16s expected exit %s naming %s, got exit %s\n' "$label" "$EX_RULE" "$want" "$rc"
		printf '%s\n' "$out" | sed 's/^/        /'
		fail=$((fail + 1))
	fi
	restore
}

printf 'baseline: '
if ./run check >/dev/null 2>&1; then
	printf 'GREEN\n\n'
else
	printf 'NOT GREEN — fix the gate before trusting these fixtures\n' >&2
	exit "$EX_RULE"
fi

# RULE-HYG-002 — a secret-bearing path loses its .gitignore coverage
grep -v '^users.db$' "$BAK/.gitignore" >.gitignore
expect_red "RULE-HYG-002" "RULE-HYG-002"

# RULE-HYG-001 — a credential-shaped file gets tracked
touch deploy_key.pem
git add -f deploy_key.pem
expect_red "RULE-HYG-001" "RULE-HYG-001"

# RULE-TI-001 (a) — a command exists but is undocumented
printf '\nsmoke: ## Undocumented on purpose\n\t@./run smoke\n' >>Makefile
expect_red "RULE-TI-001/undoc" "RULE-TI-001"

# RULE-TI-001 (b) — the reference documents a command that does not exist
printf '\n### `make teleport`\nNot a real command.\n' >>docs/task-interface.md
expect_red "RULE-TI-001/ghost" "RULE-TI-001"

# RULE-TI-002 — the declared runtime version disagrees with the Dockerfile
sed 's/PYTHON_VERSION=3.12/PYTHON_VERSION=3.13/' "$BAK/tools/versions.env" >tools/versions.env
expect_red "RULE-TI-002" "RULE-TI-002"

# RULE-GATE-001 — the profile blows its runtime budget.
# A budget of 0 alone proves nothing: the suite finishes inside one second and 0 > 0 is
# false. The breach has to be real, so add a check that genuinely takes too long.
sed 's/^check=180/check=1/' "$BAK/tools/checks/budgets.conf" >tools/checks/budgets.conf
cat >tools/checks/slow-fixture.sh <<'SLOW'
#!/bin/sh
set -eu
. "$(dirname -- "$0")/../lib.sh"
sleep 3
ok "deliberately slow"
SLOW
chmod +x tools/checks/slow-fixture.sh
printf 'slow-fixture         check           Deliberately exceeds the runtime budget\n' >>tools/checks/profiles.conf
expect_red "RULE-GATE-001" "RULE-GATE-001"

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit "$EX_RULE"
