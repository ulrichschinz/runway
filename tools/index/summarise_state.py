"""One-line human summary of index/state.json, for the freshness check."""

import json
import sys

state = json.load(open(sys.argv[1]))
print("{node_count} nodes, {edge_count} edges, {blind_spot_count} blind spots".format(**state))
