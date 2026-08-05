#!/bin/sh
# RULE-IDX-001  The index MUST be current with the working tree.
#
# A stale index is worse than no index: it answers confidently and wrongly. Exit 4 is
# reserved for exactly this — the answer would have been unreliable, so no answer was
# given.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"
state=index/state.json

if [ ! -f "$state" ]; then
	printf '  the index has not been built — run make index\n' >&2
	exit "$EX_STALE_INDEX"
fi

recorded=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["sources_sha256"])' "$state")
current=$(python3 "$REPO_ROOT/tools/index/sources_hash.py")

if [ "$recorded" != "$current" ]; then
	printf '  the index is stale: tracked sources have changed since it was built\n' >&2
	printf '    recorded %s\n    current  %s\n' "$recorded" "$current" >&2
	printf '    rebuild with: make index\n' >&2
	exit "$EX_STALE_INDEX"
fi

schema=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["schema_version"])' "$state")
declared=$(grep -m1 '^schema_version' index/manifest.toml | cut -d'"' -f2)
if [ "$schema" != "$declared" ]; then
	fail_rule RULE-IDX-001 "index built with schema $schema, manifest declares $declared"
	exit "$EX_RULE"
fi

nodes=$(python3 "$REPO_ROOT/tools/index/summarise_state.py" "$state")
ok "index current — $nodes (schema $schema)"
exit "$EX_OK"
