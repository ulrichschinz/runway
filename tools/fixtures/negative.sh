#!/bin/sh
# Negative fixtures: construct a genuine violation of every executable rule and confirm
# the gate goes red.
#
# Correct execution is not evidence that a gate works. A check that silently passes on a
# real violation is worse than no check, because it is believed. This is how each rule
# earns the word "executable" in rules/ledger.yaml.
#
# Every fixture runs inside a throwaway copy of the CURRENT WORKING TREE, so the tree you
# are working in is never mutated and the suite is safe to run from the verify profile
# with uncommitted changes in flight. The toolchains are symlinked rather than copied.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"

command -v tar >/dev/null 2>&1 || { printf '  tar is required\n' >&2; exit "$EX_TOOLING"; }

# These fixtures assert on human-readable gate output. If the caller is running the gate
# in JSON mode, that setting must NOT reach the sandboxed runs, or every assertion below
# would match against a JSON object that omits the human text and silently report that
# nothing can fail — the worst possible false negative for a conformance suite.
RUNWAY_JSON=
RUNWAY_PLAN=
export RUNWAY_JSON RUNWAY_PLAN

SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT INT TERM

# Copy the working tree, excluding what is large, secret, or must not be shared.
tar -cf - \
	--exclude=./.git \
	--exclude=./.env \
	--exclude=./data \
	--exclude=./backend/.venv \
	--exclude=./frontend/node_modules \
	--exclude=./frontend/dist \
	. 2>/dev/null | (cd "$SANDBOX" && tar -xf -)

# Symlink the toolchains: the checks need them, copying them would dominate the runtime.
# The repository's own .gitignore lists these paths with a trailing slash, which matches
# directories but NOT symlinks — so without these extra entries `git add -A` below would
# track them and repo-hygiene would (correctly) fail on the sandbox itself. Ignored paths
# also survive `git clean -fd`, which reset() relies on.
printf '\n# fixture sandbox: toolchains are symlinked in\nbackend/.venv\nfrontend/node_modules\n' \
	>>"$SANDBOX/.gitignore"
ln -s "$REPO_ROOT/backend/.venv" "$SANDBOX/backend/.venv"
ln -s "$REPO_ROOT/frontend/node_modules" "$SANDBOX/frontend/node_modules"

# repo-hygiene reads `git ls-files`, so the sandbox needs its own index.
(
	cd "$SANDBOX"
	git init -q
	git add -A
	git -c user.email=fixture@localhost -c user.name=fixture commit -q -m baseline
)

# The sandbox is a fresh git repository with its own tracked-file set, so it needs its
# own index — the parent's state.json hashes a different list of files.
(cd "$SANDBOX" && python3 tools/index/build.py >/dev/null 2>&1) || true

pass=0
fail=0

# reset — restore the sandbox to its pristine committed state between fixtures.
reset() {
	(cd "$SANDBOX" && git reset -q --hard && git clean -qfd)
}

# expect_red <label> <check-script> <rule-id> — run ONE check in the sandbox and require
# it to exit 1 naming the given rule.
expect_red() {
	label=$1
	script=$2
	want=$3
	set +e
	out=$(cd "$SANDBOX" && RUNWAY_FINDINGS="" "./$script" 2>&1)
	rc=$?
	set -e
	if [ "$rc" -eq "$EX_RULE" ] && printf '%s' "$out" | grep -q "$want"; then
		printf '  PASS  %-18s %s went red\n' "$label" "$want"
		pass=$((pass + 1))
	else
		printf '  FAIL  %-18s expected exit %s naming %s, got exit %s\n' \
			"$label" "$EX_RULE" "$want" "$rc" >&2
		printf '%s\n' "$out" | sed 's/^/          /' >&2
		fail=$((fail + 1))
	fi
	reset
}

# expect_code <label> <check-script> <expected-exit> <needle> — for rules whose documented
# exit code is not 1. A stale index exits 4 (EX_STALE_INDEX) by design: the answer would
# have been unreliable, which is a different failure from a rule violation.
expect_code() {
	label=$1
	script=$2
	want_code=$3
	want=$4
	set +e
	out=$(cd "$SANDBOX" && RUNWAY_FINDINGS="" "./$script" 2>&1)
	rc=$?
	set -e
	if [ "$rc" -eq "$want_code" ] && printf '%s' "$out" | grep -q "$want"; then
		printf '  PASS  %-18s exit %s, %s\n' "$label" "$want_code" "$want"
		pass=$((pass + 1))
	else
		printf '  FAIL  %-18s expected exit %s matching %s, got exit %s\n' \
			"$label" "$want_code" "$want" "$rc" >&2
		printf '%s\n' "$out" | sed 's/^/          /' >&2
		fail=$((fail + 1))
	fi
	reset
	(cd "$SANDBOX" && python3 tools/index/build.py >/dev/null 2>&1) || true
}

# Sanity: the pristine sandbox must be green, or every result below is meaningless.
if ! (cd "$SANDBOX" && ./run check >/dev/null 2>&1); then
	printf '  the sandbox is not green before any fixture ran — aborting\n' >&2
	(cd "$SANDBOX" && ./run check 2>&1 | sed 's/^/          /') >&2
	exit "$EX_RULE"
fi

# --- RULE-HYG-002 — a secret-bearing path loses its .gitignore coverage ------
grep -v '^users.db$' "$SANDBOX/.gitignore" >"$SANDBOX/.gitignore.new"
mv "$SANDBOX/.gitignore.new" "$SANDBOX/.gitignore"
expect_red "HYG-002" "tools/checks/repo-hygiene.sh" "RULE-HYG-002"

# --- RULE-HYG-001 — a credential-shaped file gets tracked --------------------
(cd "$SANDBOX" && touch deploy_key.pem && git add -f deploy_key.pem)
expect_red "HYG-001" "tools/checks/repo-hygiene.sh" "RULE-HYG-001"

# --- RULE-TI-001 (a) — a command exists but is undocumented ------------------
printf '\nsmoke: ## Undocumented on purpose\n\t@./run smoke\n' >>"$SANDBOX/Makefile"
expect_red "TI-001/undoc" "tools/checks/task-interface.sh" "RULE-TI-001"

# --- RULE-TI-001 (b) — the reference documents a command that does not exist -
printf '\n### `make teleport`\nNot a real command.\n' >>"$SANDBOX/docs/task-interface.md"
expect_red "TI-001/ghost" "tools/checks/task-interface.sh" "RULE-TI-001"

# --- RULE-TI-002 — declared runtime version disagrees with the Dockerfile ----
sed 's/PYTHON_VERSION=3.12/PYTHON_VERSION=3.13/' "$SANDBOX/tools/versions.env" \
	>"$SANDBOX/tools/versions.env.new"
mv "$SANDBOX/tools/versions.env.new" "$SANDBOX/tools/versions.env"
expect_red "TI-002" "tools/checks/toolchain-pinning.sh" "RULE-TI-002"

# --- RULE-FMT-001 — Python that the formatter would rewrite ------------------
printf '\n\ndef   badly_formatted( x ):\n      return      x\n' >>"$SANDBOX/backend/app/config.py"
expect_red "FMT-001" "tools/checks/py-format.sh" "RULE-FMT-001"

# --- RULE-LINT-001 — a lint violation the formatter would not catch ----------
printf '\nimport os\n' >>"$SANDBOX/backend/app/config.py"
expect_red "LINT-001" "tools/checks/py-lint.sh" "RULE-LINT-001"

# --- RULE-TYPE-001 — a genuine type error -----------------------------------
printf '\n\ndef takes_int(n: int) -> int:\n    return n\n\n\nWRONG = takes_int("not an int")\n' \
	>>"$SANDBOX/backend/app/config.py"
expect_red "TYPE-001" "tools/checks/py-types.sh" "RULE-TYPE-001"

# --- RULE-LINT-002 — a frontend lint violation ------------------------------
printf '\nconst neverUsed = 42\n' >>"$SANDBOX/frontend/src/composables/useScrollLock.js"
expect_red "LINT-002" "tools/checks/js-lint.sh" "RULE-LINT-002"

# --- RULE-DEP-001 — the application cannot be imported ----------------------
#
# The real incident this rule exists for: an unpinned transitive dependency shipped a
# breaking change, every fresh image contained a backend that raised on import, and the
# deploy pipeline reported success. Here the break is injected directly.
printf '\nraise ImportError("injected by the negative fixture")\n' >>"$SANDBOX/backend/app/main.py"
expect_red "DEP-001" "tools/checks/py-import.sh" "RULE-DEP-001"

# --- RULE-TEST-001 — a unit test fails --------------------------------------
cat >"$SANDBOX/backend/tests/unit/test_injected_failure.py" <<'BROKEN'
def test_injected_by_the_negative_fixture():
    assert False, "injected"
BROKEN
expect_red "TEST-001" "tools/checks/py-test-unit.sh" "RULE-TEST-001"

# --- RULE-TEST-003 — coverage falls below the floor -------------------------
#
# Adding a large block of unreachable code drops the ratio without breaking a test, which
# is exactly the shape of the regression this rule is meant to catch.
{
	printf '\n\ndef never_called_by_any_test() -> int:\n'
	i=0
	while [ "$i" -lt 400 ]; do
		printf '    if %s > 10**9:\n        return %s\n' "$i" "$i"
		i=$((i + 1))
	done
	printf '    return 0\n'
} >>"$SANDBOX/backend/app/config.py"
expect_red "TEST-003" "tools/checks/py-test-unit.sh" "RULE-TEST-003"

# --- RULE-TEST-004 — a frontend logic test fails ----------------------------
cat >"$SANDBOX/frontend/tests/injected_failure.test.js" <<'BROKEN'
import { describe, expect, it } from 'vitest'

describe('injected by the negative fixture', () => {
  it('fails on purpose', () => {
    expect(true).toBe(false)
  })
})
BROKEN
expect_red "TEST-004" "tools/checks/js-test.sh" "RULE-TEST-004"

# --- RULE-IDX-001 — the index goes stale when a source changes --------------
printf '\n# staleness probe\n' >>"$SANDBOX/backend/app/config.py"
expect_code "IDX-001" "tools/checks/index-fresh.sh" 4 "index is stale"

# --- RULE-IDX-002 — a non-deterministic build -------------------------------
#
# Injects an unsorted iteration into the export, which is the realistic way this breaks:
# nothing looks wrong, the graph is simply different every run and therefore untrustworthy.
python3 - "$SANDBOX/tools/index/model.py" <<'PATCH'
import pathlib
import sys

# Iterating a set of strings, NOT a reversed list: reversal is still deterministic and
# would pass. CPython randomises string hashing per process, so set order differs between
# two separate builds — which is exactly how this bug appears in the wild.
p = pathlib.Path(sys.argv[1])
t = p.read_text()
old = "for n in sorted(self.nodes.values(), key=lambda n: n.id)"
assert old in t, "fixture target not found in model.py"
p.write_text(t.replace(old, "for n in (self.nodes[i] for i in set(self.nodes))"))
PATCH
expect_red "IDX-002" "tools/checks/index-deterministic.sh" "RULE-IDX-002"

# --- RULE-IDX-003 — a broken extractor ---------------------------------------
#
# Inverts the direction of every import edge. Nothing errors, the graph is the same size,
# and every "who depends on this?" answer is now backwards — which is exactly why
# direction is asserted rather than assumed.
python3 - "$SANDBOX/tools/index/extract_python.py" <<'PATCH'
import pathlib
import sys

p = pathlib.Path(sys.argv[1])
t = p.read_text()
old = """                            "IMPORTS",
                            f"file:{rel}",
                            f"file:{target.relative_to(root)}","""
new = """                            "IMPORTS",
                            f"file:{target.relative_to(root)}",
                            f"file:{rel}","""
assert old in t, "fixture target not found in extract_python.py"
p.write_text(t.replace(old, new))
PATCH
expect_red "IDX-003" "tools/checks/index-qualified.sh" "RULE-IDX-003"

# --- RULE-IDX-004 — the two adapters diverge --------------------------------
#
# Drops the blind spots from the MCP answer only. The facts still look right, the CLI is
# unaffected, and an agent querying over MCP silently loses the uncertainty attached to
# every answer — which is the divergence that would matter most and be noticed least.
python3 - "$SANDBOX/tools/index/mcp_server.py" <<'PATCH'
import pathlib
import sys

p = pathlib.Path(sys.argv[1])
t = p.read_text()
old = "    return fn(graph, target)"
new = """    answer = fn(graph, target)
    answer["blind_spots"] = []
    return answer"""
assert old in t, "fixture target not found in mcp_server.py"
p.write_text(t.replace(old, new))
PATCH
expect_red "IDX-004" "tools/checks/index-parity.sh" "RULE-IDX-004"

# --- RULE-ARCH-001 — a forbidden unit dependency ----------------------------
#
# Reinstates the breach this step fixed: a router reaching past the service layer, and
# past its validation, straight into the Taskwarrior subprocess adapter.
printf '\nfrom app.services.task_runner import export_tasks  # noqa: F401\n' \
	>>"$SANDBOX/backend/app/routers/tasks.py"
(cd "$SANDBOX" && python3 tools/index/build.py >/dev/null 2>&1)
expect_red "ARCH-001" "tools/checks/boundaries.sh" "RULE-ARCH-001"

# --- RULE-ARCH-002 — a new cycle between units ------------------------------
#
# Makes a leaf import a router. Nothing breaks at runtime; the two units simply stop
# being independently understandable, which is what a cycle costs.
printf '\nfrom app.routers import tasks  # noqa: F401\n' >>"$SANDBOX/backend/app/models.py"
(cd "$SANDBOX" && python3 tools/index/build.py >/dev/null 2>&1)
expect_red "ARCH-002" "tools/checks/boundaries.sh" "RULE-ARCH-002"

# --- RULE-ARCH-003 — a hub grows past its baseline --------------------------
python3 - "$SANDBOX" <<'PATCH'
import pathlib
import sys

# Point three more files at an already-baselined hub, pushing its fan-in over the line.
root = pathlib.Path(sys.argv[1])
for name in ("admin", "auth", "projects"):
    target = root / "backend" / "app" / "routers" / f"{name}.py"
    target.write_text(target.read_text() + "\nfrom app.views_hub import thing  # noqa: F401\n")
hub = root / "backend" / "app" / "views_hub.py"
hub.write_text("thing = 1\n")
baseline = root / "ops" / "structure-baseline.toml"
baseline.write_text(baseline.read_text().replace("default_cap = 4", "default_cap = 2"))
PATCH
(cd "$SANDBOX" && git add -A >/dev/null 2>&1 && python3 tools/index/build.py >/dev/null 2>&1)
expect_red "ARCH-003" "tools/checks/boundaries.sh" "RULE-ARCH-003"

# --- RULE-HYG-003 — a deployment compose carries a literal secret -----------
# The checked-in production compose is safe only while its secrets are ${...} references.
# Replacing one with a literal is a one-token diff that publishes a live credential, so the
# gate has to be what notices. The first draft of this check found the violation and still
# exited 0 — fail_rule ran inside a pipeline subshell — which is exactly what this catches.
python3 - "$SANDBOX/ops/deploy/docker-compose.yml" <<'LEAKSECRET'
import pathlib
import sys

p = pathlib.Path(sys.argv[1])
t = p.read_text()
old = "JWT_SECRET=${JWT_SECRET}"
assert old in t, "the reference to replace was not found"
p.write_text(t.replace(old, "JWT_SECRET=a-literal-value-that-must-not-ship", 1))
LEAKSECRET
expect_red "HYG-003" "tools/checks/repo-hygiene.sh" "RULE-HYG-003"

# --- RULE-SEC-001 — a route loses its guard -------------------------------
# The failure this rule exists for: a guard is dropped and nothing notices, because the
# route still works — it just works for everybody now. Strip the admin dependency from a
# declared-admin handler and require the gate to say so.
python3 - "$SANDBOX/backend/app/routers/admin.py" <<'GUARDSTRIP'
import pathlib
import sys

p = pathlib.Path(sys.argv[1])
t = p.read_text()
old = "username: str = Depends(get_current_admin), db: Connection = Depends(get_db)\n"
assert old in t, "admin guard signature not found"
p.write_text(t.replace(old, "db: Connection = Depends(get_db)\n", 1))
GUARDSTRIP
expect_red "SEC-001" "tools/checks/route-guards.sh" "RULE-SEC-001"

# --- RULE-SEC-001 — a new route arrives with no guard decision -------------
python3 - "$SANDBOX/backend/app/routers/admin.py" <<'NEWROUTE'
import pathlib
import sys

p = pathlib.Path(sys.argv[1])
t = p.read_text()
t += '\n\n@router.get("/undeclared")\nasync def undeclared_route():\n    return {}\n'
p.write_text(t)
NEWROUTE
expect_red "SEC-001-new" "tools/checks/route-guards.sh" "RULE-SEC-001"

# --- RULE-DOC-001 — the contract claims something untrue --------------------
printf '\nThe entry point is `tools/checks/does-not-exist.sh`.\n' >>"$SANDBOX/AGENTS.md"
expect_red "DOC-001" "tools/checks/contract.sh" "RULE-DOC-001"

# --- RULE-DOC-002 — the contract outgrows its budget ------------------------
i=0
while [ "$i" -lt 260 ]; do printf 'padding line %s\n' "$i" >>"$SANDBOX/AGENTS.md"; i=$((i + 1)); done
expect_red "DOC-002" "tools/checks/contract.sh" "RULE-DOC-002"

# --- RULE-DOC-003 — a scoped contract defines a rule of its own -------------
printf '\nRULE-BE-999: the backend may do whatever it likes.\n' >>"$SANDBOX/backend/AGENTS.md"
expect_red "DOC-003" "tools/checks/contract.sh" "RULE-DOC-003"

# --- RULE-DOC-004 — a decision record cites an identifier nobody declared ---
# The drift that shipped in ADR 0015 and passed every gate: a record pointing at a risk id
# that the ledger does not declare. The reader chases a phantom, or concludes the risk is
# untracked. Reproduced here against a record the fixture creates, so the assertion does
# not depend on the content of any real ADR.
mkdir -p "$SANDBOX/docs/adr"
cat >"$SANDBOX/docs/adr/9999-fixture-dangling-reference.md" <<'ADR'
# ADR 9999 — a fixture record with a dangling reference

- **Status:** Accepted

Recorded as `RISK-FIXTURE-999`, which is declared nowhere.
ADR
expect_red "DOC-004" "tools/checks/contract.sh" "RULE-DOC-004"

# --- RULE-RULE-001 — an executable rule with no fixture ---------------------
python3 - "$SANDBOX/rules/ledger.yaml" <<'PATCH'
import pathlib
import sys

p = pathlib.Path(sys.argv[1])
t = p.read_text()
old = "    fixture: tools/fixtures/negative.sh\n"
assert old in t, "fixture target not found in ledger.yaml"
p.write_text(t.replace(old, "", 1))
PATCH
expect_red "RULE-001" "tools/checks/contract.sh" "RULE-RULE-001"

# --- RULE-RULE-002 — an expired waiver --------------------------------------
#
# The whole point of an expiry: when the date passes, the gate stops. A waiver without a
# working expiry is a permanent exception wearing a temporary label.
python3 - "$SANDBOX/rules/waivers.yaml" <<'PATCH'
import pathlib
import sys

p = pathlib.Path(sys.argv[1])
t = p.read_text()
assert "expires: 2026-11-04" in t, "expiry target not found in waivers.yaml"
p.write_text(t.replace("expires: 2026-11-04", "expires: 2020-01-01", 1))
PATCH
expect_red "RULE-002" "tools/checks/contract.sh" "RULE-RULE-002"

# --- RULE-RULE-003 — a suppression nobody approved --------------------------
printf '\nUNREVIEWED = 1  # noqa: S105\n' >>"$SANDBOX/backend/app/auth.py"
expect_red "RULE-003" "tools/checks/contract.sh" "RULE-RULE-003"

# --- RULE-TI-003 — a check pollutes stdout in JSON mode ---------------------
#
# This is the real bug this rule was written for: a check that prints a friendly summary
# without honouring JSON mode corrupts the stream for every machine consumer, while the
# human output still looks perfect.
cat >"$SANDBOX/tools/checks/chatty-fixture.sh" <<'CHATTY'
#!/bin/sh
set -eu
. "$(dirname -- "$0")/../lib.sh"
printf 'this line ignores JSON mode and breaks the stream\n'
exit 0
CHATTY
chmod +x "$SANDBOX/tools/checks/chatty-fixture.sh"
printf 'chatty-fixture       check           Prints to stdout regardless of JSON mode\n' \
	>>"$SANDBOX/tools/checks/profiles.conf"
expect_red "TI-003" "tools/checks/json-output.sh" "RULE-TI-003"

# --- RULE-GATE-001 — the profile blows its runtime budget -------------------
#
# A budget of 0 alone proves nothing: the suite finishes inside a second and 0 > 0 is
# false. The breach must be real, so run a profile containing only a check that is
# genuinely too slow.
cat >"$SANDBOX/tools/checks/slow-fixture.sh" <<'SLOW'
#!/bin/sh
set -eu
. "$(dirname -- "$0")/../lib.sh"
sleep 3
ok "deliberately slow"
SLOW
chmod +x "$SANDBOX/tools/checks/slow-fixture.sh"
printf '# fixture\nslow-fixture         check           Deliberately exceeds the budget\n' \
	>"$SANDBOX/tools/checks/profiles.conf"
printf 'check=1\nverify=600\n' >"$SANDBOX/tools/checks/budgets.conf"
set +e
out=$(cd "$SANDBOX" && ./run check 2>&1)
rc=$?
set -e
if [ "$rc" -eq "$EX_RULE" ] && printf '%s' "$out" | grep -q 'RULE-GATE-001'; then
	printf '  PASS  %-18s %s went red\n' "GATE-001" "RULE-GATE-001"
	pass=$((pass + 1))
else
	printf '  FAIL  %-18s expected exit %s naming RULE-GATE-001, got exit %s\n' \
		"GATE-001" "$EX_RULE" "$rc" >&2
	printf '%s\n' "$out" | sed 's/^/          /' >&2
	fail=$((fail + 1))
fi
reset

printf '  %s rule(s) proven able to fail, %s not\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit "$EX_RULE"
