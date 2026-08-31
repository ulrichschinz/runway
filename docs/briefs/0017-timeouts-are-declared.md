# Change Impact Brief 0017 — Every blocking outward call declares a timeout

| Field | Value |
|---|---|
| **Requested outcome** | Step 15d. Land the plan's "executable rule that every subprocess and egress call declares a timeout", and with it the first rule of the `OPS` family and the documentation anchor the rest of Step 15 points at. |
| **Owning unit** | `docs`, `ops` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) |
| **Governed by** | [`adr:0022`](../adr/0022-timeouts-are-declared.md) |
| **Rule IDs introduced** | `RULE-OPS-001` |
| **Entry points** | `docs/adr/0022-timeouts-are-declared.md`, `docs/operations.md`, `docs/plan/STATUS.md`, `rules/ledger.yaml`, `rules/waivers.yaml`, `tools/checks/profiles.conf`, `tools/checks/timeouts.py`, `tools/checks/timeouts.sh`, `tools/fixtures/negative.sh` |
| **Affected public surfaces** | **None.** No route, MCP tool, schema, template or SPA surface moves. |
| **Known dependents** | **None.** |
| **Uncertain / dynamic areas** | `BLIND-OPS-001`, `BLIND-TEST-001` |
| **Analogous implementations** | [`tools/checks/secret_scan.py`](../../tools/checks/secret_scan.py) — the Python-scanner-plus-thin-shell-wrapper idiom, emitting `RULE-ID\|message` lines; [`tools/checks/surfaces.sh`](../../tools/checks/surfaces.sh) — the wrapper half. |
| **Delivery Pattern** | New Capability. Nothing observable changes; a property that is already true becomes enforced. |
| **Required tests** | The negative fixtures. Both arms of the rule — subprocess and egress — must be constructed and observed going red, per `RULE-GATE-002`. |
| **Intended scope** | The gate only. No application code is modified. |
| **Base revision** | `31326de` |
| **Index revision** | `31326de` |

## What the index knows

**3 production path(s) changed**, out of 9 total:

- `tools/checks/profiles.conf`
- `tools/checks/timeouts.py`
- `tools/checks/timeouts.sh`

### Changed with no import-derived test protection

The index found no test reaching these. That is a claim about imports, not proof
of absence — but it is where a required test most likely belongs.

- `tools/checks/profiles.conf`
- `tools/checks/timeouts.py`
- `tools/checks/timeouts.sh`

**Read this one correctly.** `BLIND-TEST-001` is doing exactly what it was written to do. A
gate check is never reached by an import from a test; it is proven by construction, in
[`tools/fixtures/negative.sh`](../../tools/fixtures/negative.sh), which builds a real violation
in a sandboxed copy of the tree and requires the check to exit `1` naming the rule. Both
fixtures pass. `RULE-GATE-002` is what makes that a requirement rather than a habit.

### Blind spots relevant to this answer

- **`BLIND-OPS-001`** — The deploy host's compose file is not in this repository. Its contents were read on 2026-08-24 and are recorded in docs/operations.md, so the mapping from built images to running containers is no longer unknown — but it is a transcription the index cannot verify, and nothing detects drift once the host changes. See `RISK-OPS-002`.
- **`BLIND-TEST-001`** — Test protection is import-derived. Code exercised only through the FastAPI TestClient — which is how every router in this repository is tested — produces no TESTED_BY edge, because no test imports it. Absence of an edge therefore means 'no import-derived protection', NOT 'untested'. Reported rather than papered over with a naming convention.

## Behaviour change

**None in the application.** No file under `backend/app/` or `frontend/src/` is touched. The
one call this rule governs — [`task_runner._run`](../../backend/app/services/task_runner.py) —
already declares `timeout=10` and is unchanged.

What changes is the gate. `check` and `verify` gain a `timeouts` step, and the conformance
suite grows from 40 proven-failable rules to 42 (both arms of `RULE-OPS-001` are proven
separately, because the application makes no network calls today and an unexercised egress arm
would be a claim rather than a control).

The rule costs nothing to satisfy right now, and that is the intended shape of it: it is not
repairing a defect, it is holding a property that is currently true and is one careless edit
from not being. Deleting `timeout=10` changes no test, no type, no lint finding and no
behaviour a developer would ever see — `task` returns in milliseconds locally. In production it
is a worker that never comes back, with nothing in any log to explain it.

### What this deliberately does not do

`RULE-OPS-001` checks that a timeout is **declared**, not that it is **sensible**. A
`timeout=86400` satisfies it and helps nobody, and so does a timeout longer than the reverse
proxy's own read timeout. The check also knows only the call shapes it lists. Both limits are
recorded as `RISK-OPS-003` with a re-open trigger on the first real egress client, rather than
left for a reader to discover.

### Follow-on

This establishes the `OPS` rule family and [`docs/operations.md#timeouts`](../operations.md#timeouts)
as its documentation anchor. Step 15a's structured-logging rule — the next in this family, not
yet declared — points at the same section. Remaining Step 15 scope is in [`docs/plan/STATUS.md`](../plan/STATUS.md) §3.
