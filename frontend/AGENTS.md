# frontend/AGENTS.md — scoped contract

Refines the root [`AGENTS.md`](../AGENTS.md) for this unit. It may not weaken a root rule.

## Units are declared, not foldered

`fe/app` (routing) → features (`fe/tasks`, `fe/projects`, `fe/identity`) → `fe/layout`,
with `fe/shared` available to all. The map is in `architecture.toml` over the existing
directories; MODE C forbids restructuring, and moving files would buy tidiness at the cost
of migration risk.

**Features never import features.** `fe/projects` → `fe/tasks` is the one recorded
exception: the projects view reuses the task list components.

Two cycles are declared, `CYCLE-001` and `CYCLE-002`, both because `AppShell` reads the
tasks and auth stores directly instead of receiving what it displays. One change removes
both. A *new* cycle always fails the gate.

## Tests cover logic, not components

`frontend/tests/` covers `frontend/src/shared/` — the pure rules. No `jsdom`, no mounting.

That is a deliberate scope choice (ADR 0007), taken because **every frontend defect this
repository has shipped and fixed was in that pure logic**: comma-joined context tags
treated as one context, the sidebar not updating, completed tasks in the context scan.
Rendering, routing and gestures are untested and recorded as `RISK-TEST-004`.

## Things that will surprise you

- Taskwarrior returns a comma-entered tag as **one array element**: `"@home,@errands"`,
  not two entries. Every reader must split it. That rule lived in five copies and caused
  two shipped bugs; it now lives once, in `frontend/src/shared/contextTags.js`.
- After changing `frontend/package.json`, run `tools/npm-lock.sh`. npm 11 and npm 10
  disagree on lockfile contents, and CI (Node 20) rejects a lockfile written by npm 11 —
  invisibly, until you push.
