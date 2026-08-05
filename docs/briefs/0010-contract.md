# Change Impact Brief 0010 — The root contract and the rule validators

| Field | Value |
|---|---|
| **Requested outcome** | A short, mandatory entry point that cannot drift, and validators that make the Rule Ledger and waiver register mean something. |
| **Owning unit** | `ops`, `docs` |
| **Rule IDs introduced** | `RULE-DOC-001/002/003`, `RULE-RULE-001/002/003` |
| **Risks recorded** | `RISK-DOC-001` (query-first is unenforceable) |
| **Entry points** | `AGENTS.md`, `backend/AGENTS.md`, `frontend/AGENTS.md`, `CLAUDE.md`, `tools/checks/contract.sh` |
| **Affected public surfaces** | **None.** |
| **Delivery Pattern** | **New Capability** |
| **Required tests** | Six negative fixtures — an untrue claim, an over-budget contract, a scoped contract defining a rule, a rule with no fixture, an expired waiver, an unapproved suppression. |
| **Base revision** | `d496579` |

## The third pillar

`AGENTS.md` is **168 lines and 9.4 KB**, against a budget of 250 and 12,000 enforced by
`RULE-DOC-002`. A contract nobody finishes reading is a contract nobody follows, so detail
lives in linked documents where it can grow without costing the entry point.

`CLAUDE.md` carries **no rules of its own** — it is a pointer, so a vendor-specific lookup
finds the agent-agnostic file. Two scoped contracts refine local structure and may never
weaken a root rule; `RULE-DOC-003` fails if one tries to define a rule instead of
referring to it.

## What "self-check" actually means here

`RULE-DOC-001` verifies, against the real repository:

- **every path** the contract names exists;
- **every command** it names is a real command;
- **every identifier** it cites (`RULE-`, `RISK-`, `BLIND-`, `WAIVER-`, `CYCLE-`) is
  declared in the ledger, the waivers, `architecture.toml` or the index;
- **the counted claims** — "31 routes", "31 MCP tools" — match what the index counts.

It found five drifts on its first run, in a document written twenty minutes earlier.
That is the point: a contract nobody verifies drifts, and a drifted contract is worse than
none because it is followed.

## Waivers now expire for real

`RULE-RULE-002` fails on an expired waiver and on one missing any of the five groups. Four
waivers expire **2026-11-04**; when that date passes the gate stops until each is resolved
or deliberately re-approved. A waiver without a working expiry is a permanent exception
wearing a temporary label.

`RULE-RULE-003` requires every `# noqa` and `# type: ignore` to reference a waiver or a
reviewed justified suppression. It found seven unapproved suppressions in the index's own
code — structural `E402`s from running modules as scripts — now recorded as a justified
suppression with the reasoning.

## What cannot be enforced

"Query the index before searching by hand" is unenforceable: nothing detects a `grep`.
Recorded as `RISK-DOC-001` with the honest mitigation — obeying it is *faster* than not.

## Behaviour change

**None.** No application code is touched.
