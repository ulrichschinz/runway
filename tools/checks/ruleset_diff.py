"""Compare the live GitHub ruleset against the checked-in desired state.

Reads the live ruleset JSON on stdin and the desired file as argv[1]. Prints one problem
per line and exits 0 either way — the calling check turns lines into rule failures.

Only the fields that constitute a control are compared. Server-managed metadata (id,
timestamps, _links, node ids) is ignored deliberately: a diff that fails on those would
be noise, and noise is how a governance check gets deleted.
"""

import json
import sys


def main() -> int:
    with open(sys.argv[1]) as fh:
        want = json.load(fh)
    want.pop("_comment", None)
    got = json.load(sys.stdin)

    problems = []

    want_enforcement = want.get("enforcement")
    got_enforcement = got.get("enforcement")
    if got_enforcement != want_enforcement:
        problems.append(
            "enforcement is {!r}, want {!r}".format(got_enforcement, want_enforcement)
        )

    want_types = {rule["type"] for rule in want.get("rules", [])}
    got_types = {rule["type"] for rule in got.get("rules", [])}
    for missing in sorted(want_types - got_types):
        problems.append("rule {!r} is missing from the live ruleset".format(missing))
    for extra in sorted(got_types - want_types):
        problems.append(
            "rule {!r} is live but not in the checked-in desired state".format(extra)
        )

    want_bypass = want.get("bypass_actors") or []
    got_bypass = got.get("bypass_actors") or []
    if len(got_bypass) != len(want_bypass):
        problems.append(
            "{} bypass actor(s) configured, want {}".format(len(got_bypass), len(want_bypass))
        )

    want_refs = (want.get("conditions", {}).get("ref_name", {}) or {}).get("include", [])
    got_refs = (got.get("conditions", {}).get("ref_name", {}) or {}).get("include", [])
    if sorted(got_refs) != sorted(want_refs):
        problems.append("targets {!r}, want {!r}".format(got_refs, want_refs))

    for problem in problems:
        print(problem)
    return 0


if __name__ == "__main__":
    sys.exit(main())
