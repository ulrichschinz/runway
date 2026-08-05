# Change Impact Brief 0006 — The repository knowledge graph

| Field | Value |
|---|---|
| **Requested outcome** | A queryable, evidence-bearing model of the repository: schema, extractors, canonical export, manifest, freshness and determinism. |
| **Owning unit** | `ops` |
| **Applicable contracts** | `index/schema.md`, `index/manifest.toml`, `architecture.toml`, ADR 0008 |
| **Rule IDs introduced** | `RULE-IDX-001` (freshness), `RULE-IDX-002` (determinism) |
| **Entry points** | `make index` → `tools/index/build.py` → `extract_python.py`, `extract_frontend.py` |
| **Relevant flow** | `git ls-files` → per-language extraction → unit ownership from `architecture.toml` → aggregation → `index/graph.jsonl` + `index/state.json`. |
| **Affected public surfaces** | **None.** No application code is touched. |
| **Known dependents** | `make bootstrap` now builds the index; Steps 7 (CLI/MCP) and 8 (boundary checker) consume the export. |
| **Uncertain / dynamic areas** | Six declared blind spots — Vue template-only usage, dynamic `import()`, `fastapi-mcp` tool derivation, Taskwarrior internals, the deploy host's compose file, nginx templating. |
| **Analogous implementations** | None — first index in this repository. |
| **Delivery Pattern** | **New Capability** — owner, contract, vertical slice (schema → extractors → export → gate), failure behaviour (exit 4 on stale), tests (two negative fixtures). |
| **Required tests** | `RULE-IDX-001` and `RULE-IDX-002`, both with negative fixtures. 17 rules now proven able to fail. |
| **Intended scope** | `index/**`, `tools/index/**`, `architecture.toml`, `tools/checks/index-*.sh`, `rules/ledger.yaml`, `docs/**` |
| **Base revision** | `852558d` |

## Scope adjustment from the approved plan

`architecture.toml` was scheduled for **Step 8**, alongside the boundary checker. It has landed here
instead, because the index cannot answer *"which unit owns this"* without a unit declaration, and inventing
a temporary source of truth to be replaced two steps later is pure churn. Step 8 keeps the boundary
*checker*, the cycle ratchet and the hub baselines.

It is TOML rather than YAML: the index parses it, and Python parses TOML in the standard library while YAML
needs a dependency ADR 0008 forbids. `rules/ledger.yaml` stays YAML pending its Step 9 validator.

## What the index found on its first run

- **The V1 layering violation**, unprompted: `backend/app/routers/gtd.py` imports
  `backend/app/services/task_runner.py`, producing a `be/routers → be/adapters` unit dependency that
  `architecture.toml` does not allow. `STATIC_CONFIRMED`, at `gtd.py:7`.
- **31 MCP tool names** derived from route handler function names — public surface S2, hard-promised under
  F2, and previously invisible.
- The `fe/shell ↔ fe/tasks` cycle, matching `CYCLE-001` as declared.

## Behaviour change

**None.** No file under `backend/app/` or `frontend/src/` is modified.

## Defects found and fixed during the step

| Defect | Fix |
|---|---|
| The frontend resolver only knew `.js`/`.vue` files, so `main.js → style.css` was `UNKNOWN` despite being a tracked file | resolve against every tracked file; zero `UNKNOWN` edges remain |
| `index-deterministic` rebuilt the real index as a side effect, silently repairing staleness that `index-fresh` should have reported | builds into scratch directories; a check must observe, not repair |
| The determinism fixture reversed iteration order — still deterministic, so it passed | iterate a set instead; CPython randomises string hashing per process, which is how this bug actually appears |

## Rollback

`git revert`. The index is derived and git-ignored; nothing outside the repository is touched.
