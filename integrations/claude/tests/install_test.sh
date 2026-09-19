#!/bin/sh
# RULE-TEST-005  install.sh MUST install only committed state, and refuse what it documents.
#
# Runs install.sh against a throwaway repository with CLAUDE_CONFIG_DIR pointing at a temp
# directory, so it never touches the real ~/.claude. Each assertion is one promise from
# integrations/claude/README.md ("Deploying and keeping it up to date").
#
# Prints one line per failed assertion and exits 1 if any failed; silent and 0 otherwise.
set -eu

HERE=$(cd "$(dirname -- "$0")/.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

failures=0
fail() { printf 'install.sh: %s\n' "$1"; failures=$((failures + 1)); }

# The script must parse as POSIX sh (ADR 0001), not merely under a forgiving bash.
if command -v dash >/dev/null 2>&1; then
	dash -n "$HERE/install.sh" || fail "does not parse as POSIX sh (dash -n)"
fi

# A throwaway repository holding a copy of the plugin at the path install.sh expects.
REPO="$WORK/repo"
mkdir -p "$REPO/integrations"
cp -R "$HERE" "$REPO/integrations/claude"
rm -rf "$REPO/integrations/claude/tests"
git -C "$REPO" init -q
git -C "$REPO" -c user.name=t -c user.email=t@t add -A
git -C "$REPO" -c user.name=t -c user.email=t@t commit -q -m committed
INSTALL="$REPO/integrations/claude/install.sh"

export CLAUDE_CONFIG_DIR="$WORK/config"
TARGET="$CLAUDE_CONFIG_DIR/skills/runway"

# An uncommitted edit must never reach the installed copy.
printf '\nUNCOMMITTED EDIT\n' >>"$REPO/integrations/claude/skills/runway/SKILL.md"

sh "$INSTALL" >/dev/null 2>&1 || fail "first install exited $?"
[ -f "$TARGET/SKILL.md" ] || fail "installed no SKILL.md"
if grep -q 'UNCOMMITTED EDIT' "$TARGET/SKILL.md" 2>/dev/null; then
	fail "installed an uncommitted edit — it must install the committed state"
fi
[ -f "$TARGET/.installed" ] || fail "wrote no .installed stamp"

# --check: 0 when the installed copy is what the ref holds, 1 when it is not.
sh "$INSTALL" --check >/dev/null 2>&1 || fail "--check after install exited $?, expected 0"
git -C "$REPO" checkout -q -- .
printf '\nsecond commit\n' >>"$REPO/integrations/claude/skills/runway/SKILL.md"
git -C "$REPO" -c user.name=t -c user.email=t@t commit -q -am second
set +e
sh "$INSTALL" --check >/dev/null 2>&1
rc=$?
set -e
[ "$rc" -eq 1 ] || fail "--check against a newer commit exited $rc, expected 1"

# The previous copy is kept outside skills/, where Claude would load it as a second skill.
sh "$INSTALL" >/dev/null 2>&1 || fail "update install exited $?"
[ -d "$CLAUDE_CONFIG_DIR/backups/runway-skill.previous" ] || fail "kept no previous copy"
[ "$(ls "$CLAUDE_CONFIG_DIR/skills")" = "runway" ] || fail "left something beside skills/runway"

# An unknown ref fails cleanly with 66.
set +e
sh "$INSTALL" --ref no-such-ref >/dev/null 2>&1
rc=$?
set -e
[ "$rc" -eq 66 ] || fail "unknown ref exited $rc, expected 66"

# A symlinked target is refused with 73, and nothing is written through it.
rm -rf "$TARGET"
mkdir -p "$WORK/elsewhere"
ln -s "$WORK/elsewhere" "$TARGET"
set +e
sh "$INSTALL" >/dev/null 2>&1
rc=$?
set -e
[ "$rc" -eq 73 ] || fail "symlinked target exited $rc, expected 73"
[ -z "$(ls "$WORK/elsewhere")" ] || fail "wrote through a symlinked target"

[ "$failures" -eq 0 ]
