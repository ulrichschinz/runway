#!/bin/sh
# Install or update the runway skill for Claude Code WITHOUT the plugin system.
#
# It installs from a git ref, never from the working tree: the repository is where the
# skill is developed, ~/.claude is where it is used, and an uncommitted edit or a checked
# out feature branch must not silently become what the agent runs on.
#
#   integrations/claude/install.sh                install the committed state of HEAD
#   integrations/claude/install.sh --ref v1.4.0   install a tag, branch or commit
#   integrations/claude/install.sh --check        compare installed vs. available, change nothing
#
# Target: ${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/runway
set -eu

REF=HEAD
CHECK=0
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --check) CHECK=1; shift ;;
    -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done

ROOT=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
SRC=integrations/claude/skills/runway
MANIFEST=integrations/claude/.claude-plugin/plugin.json
TARGET="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/runway"
STAMP="$TARGET/.installed"
# Kept outside skills/, or Claude would load the old copy as a second skill named runway.
PREVIOUS="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/backups/runway-skill.previous"

COMMIT=$(git -C "$ROOT" rev-parse --verify --quiet "$REF^{commit}") || {
  echo "unknown ref: $REF" >&2; exit 66; }
git -C "$ROOT" cat-file -e "$COMMIT:$SRC/SKILL.md" 2>/dev/null || {
  echo "$SRC is not part of $REF — commit the skill first, or pass --ref" >&2; exit 66; }

# `version` from the manifest at that ref; plain sed keeps this free of jq and python.
VERSION=$(git -C "$ROOT" show "$COMMIT:$MANIFEST" \
  | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)

INSTALLED="(none)"
[ -f "$STAMP" ] && INSTALLED=$(sed -n '1p' "$STAMP")
AVAILABLE="$VERSION $(git -C "$ROOT" rev-parse --short "$COMMIT")"

if [ "$CHECK" -eq 1 ]; then
  echo "installed: $INSTALLED"
  echo "available: $AVAILABLE  ($REF)"
  [ "$INSTALLED" = "$AVAILABLE" ] && exit 0
  exit 1
fi

if [ -L "$TARGET" ]; then
  echo "$TARGET is a symlink; refusing to install through it. Remove it first." >&2
  exit 73
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git -C "$ROOT" archive "$COMMIT" "$SRC" | tar -x -C "$TMP"

mkdir -p "$(dirname "$TARGET")"
if [ -d "$TARGET" ]; then
  mkdir -p "$(dirname "$PREVIOUS")"
  rm -rf "$PREVIOUS"
  mv "$TARGET" "$PREVIOUS"
fi
mv "$TMP/$SRC" "$TARGET"
printf '%s\nref: %s\ninstalled: %s\n' "$AVAILABLE" "$REF" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STAMP"

echo "runway skill $AVAILABLE installed to $TARGET (was: $INSTALLED)"
[ -d "$PREVIOUS" ] && echo "previous version kept at $PREVIOUS"
echo "start a new Claude session to load it"
