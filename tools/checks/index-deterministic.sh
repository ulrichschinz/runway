#!/bin/sh
# RULE-IDX-002  Rebuilding the index from unchanged sources MUST produce a byte-identical
#               export.
#
# ADR 0008 removed the incremental build path precisely so that "incremental and clean
# rebuilds are equivalent" is true by construction. This check is what keeps that claim
# honest: unordered iteration, a timestamp, or a set that hashes differently between runs
# would all break it silently, and a graph that changes without its sources changing
# cannot be trusted to say anything.
set -eu
. "$(dirname -- "$0")/../lib.sh"

cd "$REPO_ROOT"
# Build twice into scratch directories rather than over the real index: this check must
# observe the build, not repair it.
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT

python3 tools/index/build.py --out "$scratch/a" >/dev/null
python3 tools/index/build.py --out "$scratch/b" >/dev/null

sha() { python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$1"; }
before=$(sha "$scratch/a/graph.jsonl")
after=$(sha "$scratch/b/graph.jsonl")

if [ "$before" != "$after" ]; then
	fail_rule RULE-IDX-002 "a rebuild of unchanged sources produced a different graph"
	printf '        before %s\n        after  %s\n' "$before" "$after" >&2
	exit "$EX_RULE"
fi
ok "rebuild is byte-identical (${before%"${before#????????}"}…)"
exit "$EX_OK"
