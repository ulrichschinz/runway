# ADR 0007 — Frontend tests cover pure logic, not components

- **Date:** 2026-08-05
- **Status:** Accepted
- **Scope:** `frontend`

## Context

The frontend is 18 Vue single-file components and ~1,400 lines. It had no tests. The
conventional next move is `@vue/test-utils` plus `jsdom` and a suite that mounts
components.

The repository's own history argues against starting there. Every frontend defect actually
shipped and then fixed was in **pure logic**, not in rendering:

| Commit | Defect |
|---|---|
| `c6ce0f2` | comma-joined context tags treated as a single context |
| `472b673` | the context sidebar not updating live |
| `e3adc95` | completed tasks included in the context-tag scan |

All three are the same rule — how a Taskwarrior tag string is split — implemented
separately in several places.

## Decision

**Test the pure logic; do not mount components.** `vitest` in a `node` environment, no
`jsdom`, no `@vue/test-utils`. One new dev dependency.

**Extract the duplicated rules into `src/shared/` first**, moved verbatim:

- `contextTags.js` — `splitTagParts`, `contextTagsOf`, `taskHasContext`,
  `collectContextTags`, `allTagParts`, `parseTagInput`
- `taskFilters.js` — `filterTasks`, `matchesSearch`, `byUrgencyDescending`

**Phase 0 undercounted the duplication.** It reported three copies of the splitting
expression (`stores/tasks.js` ×2, `_useTaskView.js` ×1). There were **five**: two more in
`TaskModal.vue`, one flattening a task's tags into editable chips and one parsing typed
tag input. The Phase 0 grep only covered stores and composables. There is now exactly one
`split(',')` in `src/`, and the whole rule has 42 tests.

## Alternatives considered

- **`@vue/test-utils` + `jsdom`** — the conventional choice, and the one to revisit when a
  component-level defect actually occurs. Today it would add two dependencies and a DOM
  emulation layer to test rendering that has not broken, while the logic that *has* broken
  stayed untested.
- **Playwright end-to-end** — highest fidelity and highest cost. It needs the backend, the
  Taskwarrior binary, and a browser in CI. Recorded as deliberately out of scope, with the
  re-open trigger: a defect that only manifests across the SPA/API boundary.
- **Leaving the logic where it was and testing through the store** — would require Pinia
  setup for what are plain string functions, and would leave the five copies in place.

## Consequences

- 42 tests, ~85ms. The frontend tier costs nothing in the gate's runtime budget.
- Rendering, routing, keyboard handling, swipe gestures and dark mode remain untested.
  Recorded as `RISK-TEST-004` rather than implied by a green gate.
- `src/shared/` is a new directory. It is the `fe/shared` unit from the Phase 1 map, and
  Step 8 declares it in `architecture.yaml`.
- The extraction touched four files' call sites. Behaviour is preserved by construction —
  expressions were moved, not rewritten — and `eslint` plus a production build both pass.
  There were no frontend tests before this change, so the extraction itself is guarded by
  the tests written alongside it rather than by pre-existing ones.

## Related

- ADR 0006 (backend test tiers), ADR 0003 (why `vue/essential`, not `vue/recommended`)
