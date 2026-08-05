# ADR 0008 — Index implementation mode: BUILD, minimal and dependency-free

- **Date:** 2026-08-05
- **Status:** Accepted
- **Scope:** repository (`ops`)

## Context

The repository needs a queryable, evidence-bearing model of itself: which unit owns a symbol, what governs
it, who depends on it, what its change-impact radius and connected public surfaces are, which tests protect
it, and — crucially — **what is unknown**.

The operating rule is *prefer ADOPT or EXTEND over BUILD*. BUILD therefore needs evidence, not preference.

## Required capabilities, derived from this repository

1. Python 3.12 **and** JavaScript **and Vue SFCs** — 18 of 29 frontend source files are `.vue`.
2. FastAPI routes, `Depends()` injection, and the **MCP tool names `fastapi-mcp` derives from route
   function names** — a hard-promise public surface under F2.
3. `vue-router` route table and Pinia store registration.
4. Unit ownership, governing contracts, rule IDs, public surfaces.
5. An **evidence class on every fact** (`STATIC_CONFIRMED` … `UNKNOWN`) and explicit blind-spot reporting.
6. A versioned, documented JSON export, so the engine can be replaced without touching the contract.
7. CLI **and** MCP access with fact-level parity, offline, clean-clone, license-clean.

## Evaluation

**ADOPT — SCIP indexers (checked 2026-08-05).**

| Package | Version | Verdict |
|---|---|---|
| `@sourcegraph/scip-typescript` | 0.4.0 | **README contains zero mentions of Vue.** No SFC support. |
| `@sourcegraph/scip-python` | 0.6.6 | Works for Python; npm-distributed, so the *backend* index would depend on Node. |
| `scip-python` on PyPI | — | Does not exist (HTTP 404). |

The Vue gap is decisive: adopting SCIP would index 11 `.js` files and miss all 18 `.vue` files, leaving the
frontend — where every shipped frontend defect has been — invisible to the index.

Beyond that, SCIP models symbols and references and **nothing** in requirements 2, 4, 5, 6 or 7. Its output
is protobuf, so the canonical JSON export the contract requires would need a converter regardless. Rejected.

**ADOPT — general repository-graph tools.** None found that model evidence classes, contract/rule nodes,
public surfaces, or freshness. Each would still need the whole policy layer, plus a network or service
dependency this repository does not otherwise have. Rejected.

**EXTEND — tree-sitter base graph + repository-owned policy layer.** Genuinely viable. Rejected on
proportionality: tree-sitter buys precise call graphs across languages, which this repository does not need
(the backend is 1,000 lines of straightforward Python), at the cost of pinned native grammars per language
and a build step on every platform. The requirement it would satisfy that stdlib cannot — accurate JS/Vue
*call* graphs — is not on the list above.

**BUILD — minimal, dependency-free.** Chosen.

- **Python:** the stdlib `ast` module. Exact, not heuristic: imports, definitions, calls, decorators and
  `Depends()` arguments come from the real parse tree.
- **JavaScript and Vue:** an ESM import scanner over `<script>` blocks. Every frontend edge in this
  repository is a static ESM import — verified in Phase 0 — so this is exact for the edges that exist, and
  dynamic `import()` is reported as a blind spot rather than guessed.
- **Configuration:** small readers for the FastAPI route table, the `vue-router` table, `defineStore` calls,
  `architecture.yaml`, the Rule Ledger and the ADR set.

**Zero third-party dependencies**, which makes clean-clone, offline, licence and determinism requirements
true by construction rather than by testing.

## Consequences

- The repository owns its schema, extractors, export format, fixtures and replacement boundary. That is
  required by the contract regardless of engine, so BUILD adds the parser but not the policy layer.
- **The canonical export is the contract, not the implementation.** `index/schema.md` is versioned and the
  export is JSON Lines. Replacing these extractors with tree-sitter or SCIP later must not change the
  contract, the Change Impact Brief format, or the agent workflow.
- **Known blind spots are declared, not discovered later:** Vue template-only component usage, dynamic
  `import()`, Taskwarrior's internal behaviour, `fastapi-mcp`'s tool-name derivation (until observed at
  runtime), and the nginx `envsubst` step. The index reports these on any answer they touch.
- **No incremental build.** Every build is a clean build, which makes "incremental and clean rebuilds are
  equivalent" true by construction and removes a whole class of staleness bug. Re-open trigger: a build
  taking longer than 10 seconds.
- If the repository gains a third language, or needs cross-language call graphs, this decision should be
  revisited — that is the point at which EXTEND starts paying for itself.

## Related

- ADR 0001 (task interface), `index/schema.md`, `index/manifest.yaml`
- `docs/plan/phase-0-2.md` §2.2 recorded the provisional recommendation this ADR confirms with evidence
