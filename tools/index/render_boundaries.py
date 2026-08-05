"""Turn a boundary report into `RULE-ID|message` lines for the shell check.

Kept out of the shell script because quoting a JSON walk inside `sh` is how subtle
reporting bugs get written.
"""

import json
import sys

report = json.load(sys.stdin)

for violation in report["forbidden_edges"]:
    where = ", ".join(f"{e['file']}:{e['line']}" for e in violation["evidence"][:3])
    print(
        f"RULE-ARCH-001|{violation['from']} -> {violation['to']} is not an allowed "
        f"dependency ({where})"
    )

for cycle in report["new_cycles"]:
    print(
        f"RULE-ARCH-002|new cycle between units: {' -> '.join(cycle)} -> {cycle[0]} "
        f"(declare it in architecture.toml only with an owner and a teardown path)"
    )

for cycle in report["declared_cycles_resolved"]:
    print(
        f"RULE-ARCH-002|cycle {' <-> '.join(cycle)} no longer exists but is still declared "
        f"— remove it from architecture.toml to lock in the improvement (the ratchet)"
    )

for hub in report["hub_regressions"]:
    print(
        f"RULE-ARCH-003|{hub['file']} fan-in rose to {hub['fan_in']}, baseline "
        f"{hub['baseline']} — raise it in ops/structure-baseline.toml only deliberately"
    )
