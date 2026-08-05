# Change Impact Brief 0005 — Frontend logic safety net

| Field | Value |
|---|---|
| **Requested outcome** | Test the frontend rules that have actually produced bugs, and stop them existing in five copies. |
| **Owning unit** | `fe/shared`, touching `fe/tasks` |
| **Applicable contracts** | `docs/task-interface.md#tests`, ADR 0007 |
| **Rule IDs introduced** | `RULE-TEST-004` |
| **Risks recorded** | `RISK-TEST-004` (rendering, routing and gestures untested) |
| **Entry points** | `frontend/src/shared/{contextTags,taskFilters}.js`, `frontend/tests/`, `tools/checks/js-test.sh` |
| **Relevant flow** | `check`/`verify` → `js-test` → `vitest run` over `frontend/tests` (node environment, no jsdom). |
| **Affected public surfaces** | **None.** No REST, MCP, DB, env-var or SPA-route surface changes. |
| **Known dependents** | `stores/tasks.js`, `views/_useTaskView.js`, `components/TaskModal.vue` — all four call sites updated in this change. |
| **Uncertain / dynamic areas** | Vue template usage is not covered by the extraction; only `<script setup>` code was touched. |
| **Analogous implementations** | ADR 0006's backend split — same principle, seam chosen where the logic actually is. |
| **Delivery Pattern** | **Behaviour-Preserving Refactor.** Characterization normally precedes the move; here no frontend test existed to characterize *with*, so the tests were written against the extracted functions and the move was made verbatim. Stated plainly rather than claimed as full characterization. |
| **Required tests** | 42 vitest tests; `RULE-TEST-004` with a negative fixture. |
| **Intended scope** | `frontend/src/shared/**`, `frontend/tests/**`, four call sites, `frontend/{package.json,vite.config.js}`, `tools/**`, `rules/**`, `docs/**` |
| **Base revision** | `7337a53` |

## Phase 0 was wrong about the scale of the duplication

The baseline reported **three** copies of the tag-splitting expression. There were
**five** — two more in `TaskModal.vue`, one flattening tags into editable chips and one
parsing typed tag input. The Phase 0 grep covered stores and composables but not
components.

`src/` now contains exactly one `split(',')`.

## Behaviour change

**None intended.** Every extracted expression was moved verbatim. Two decisions preserve
behaviour that a rewrite would have quietly changed:

- `taskHasContext` compares against **all** tag parts, not only `@`-prefixed ones, because
  the call site it replaced did. In practice a context always starts with `@`, so
  narrowing it would be invisible — and therefore exactly the kind of silent change worth
  refusing.
- `splitTagParts` **preserves empty parts**; the callers drop them. That keeps the split
  faithful and puts the filtering where it was.

## Rollback

`git revert`. The extraction is four call sites; nothing outside the repository is touched.

## Residual risk

Rendering, routing, keyboard handling, swipe gestures and dark mode remain untested
(`RISK-TEST-004`). The re-open trigger is a defect that only manifests in a mounted
component or across the SPA/API boundary — at which point ADR 0007 revisits
`@vue/test-utils`.
