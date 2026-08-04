#!/bin/sh
# Apply ops/github/ruleset.json to GitHub, creating or updating the ruleset by name.
#
# The checked-in file is canonical; this pushes it. Drift in the other direction — someone
# disabling a protection in the web UI — is detected by tools/checks/branch-protection.sh.
set -eu
. "$(dirname -- "$0")/lib.sh"

cd "$REPO_ROOT"
desired=ops/github/ruleset.json

have gh || { printf 'needs input: the gh CLI is required to apply the ruleset\n' >&2; exit "$EX_NEEDS_INPUT"; }
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
name=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["name"])' "$desired")

# Strip the _comment key: GitHub rejects unknown fields.
payload=$(python3 -c '
import json, sys
d = json.load(open(sys.argv[1]))
d.pop("_comment", None)
print(json.dumps(d))
' "$desired")

existing=$(gh api "repos/$repo/rulesets" --jq ".[] | select(.name==\"$name\") | .id" 2>/dev/null || true)

if [ -n "$existing" ]; then
	printf '%s' "$payload" | gh api -X PUT "repos/$repo/rulesets/$existing" --input - >/dev/null
	printf 'updated ruleset "%s" (id %s) on %s\n' "$name" "$existing" "$repo"
else
	printf '%s' "$payload" | gh api -X POST "repos/$repo/rulesets" --input - >/dev/null
	printf 'created ruleset "%s" on %s\n' "$name" "$repo"
fi
