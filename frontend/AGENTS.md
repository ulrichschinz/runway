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

## Two UIs until the contract step

The new UI was built behind a per-browser switch (ADR 0042, plan
`docs/plan/unified-ui-web.md`): `?ui=neu` / `?ui=alt`, stored in `localStorage['ui']`, default
the new UI since M16 (brief 0063); the old UI stays reachable with `?ui=alt` until M17 deletes it.
Every route renders through `src/router/pick.js`, which takes both sides.

- New files go into the unit's folder, never beside the old ones: `src/layout/` (`fe/layout`),
  `src/tasks/` (`fe/tasks`), `src/projects/` (`fe/projects`), `src/identity/` (`fe/identity`),
  `src/assets/` (`fe/app`), `src/shared/`, `src/composables/`, `src/api/`, `tokens/`
  (`fe/shared`). Check each with `./run map`.
- New code in `src/layout/` imports no feature: it receives what it shows through props and
  slots. The gate still allows the old edges for `AppShell.vue`, so it will not catch this.
- Every route's component is the one wrapper `UiPick`, so options-API route guards
  (`beforeRouteEnter/Update/Leave`) on a page never run, silently. Use `onBeforeRouteLeave` /
  `onBeforeRouteUpdate` in setup, or `beforeEnter` on the route record. `pick()` must keep
  returning that one wrapper for every route (`frontend/tests/pick.test.js`): a wrapper per route
  would remount `ProjectsView` between `/projects` and `/projects/:name`.
- The old UI's views, components and stores stay as they are until the contract step deletes
  them; `stores/auth.js` and `components/BrandMark.vue` are kept and reused.

## Tests cover logic, not components

`frontend/tests/` covers `frontend/src/shared/` — the pure rules — and the route fields
`src/router/pick.js` returns (imported, never rendered). No `jsdom`, no mounting.

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
