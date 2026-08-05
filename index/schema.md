# Canonical graph schema

**Version 1.0.0.** This is the contract. `tools/index/` is one implementation of it, and ADR 0008 requires
that replacing those extractors — with tree-sitter, SCIP, or anything else — must not change this document,
the Change Impact Brief format, or the agent workflow.

## Export format

JSON Lines at `index/graph.jsonl`, one object per line, each with a `type` of `node`, `edge` or
`blind_spot`. Ordering is deterministic, so rebuilding unchanged sources produces a byte-identical file.

`index/graph.jsonl` and `index/state.json` are **generated and git-ignored**. The extractors, this schema,
`index/manifest.toml` and `architecture.toml` are checked in.

## Evidence classes

Every node and edge carries exactly one. Nothing is asserted without one, and a heuristic is never promoted
to a confirmed fact.

| Class | Meaning |
|---|---|
| `STATIC_CONFIRMED` | Read from a real parse tree — a Python `import`, an ESM `import`, a definition. |
| `CONFIG_CONFIRMED` | Read from a framework construct — a FastAPI decorator, `Depends()`, a route table, `defineStore`. |
| `CONTRACT_DECLARED` | Asserted by a checked-in declaration — `architecture.toml`, the Rule Ledger, ADRs. |
| `RUNTIME_OBSERVED` | Seen while actually running. **Proves presence, never absence.** |
| `SEMANTIC_MATCH` | Lexical or similarity match. May suggest a candidate; never an authoritative edge. |
| `UNKNOWN` | A relationship the extractors cannot resolve. Reported, never guessed. |

## Nodes

| Kind | Id form | Notes |
|---|---|---|
| `file` | `file:<repo-relative path>` | carries `language` and owning `unit` |
| `symbol` | `symbol:<module>.<name>` | functions, classes, Pinia stores |
| `unit` | `unit:<id>` | from `architecture.toml`; carries scope, owner, layer |
| `route` | `route:<METHOD> <module>:<path>` or `route:SPA <path>` | REST and SPA routes |
| `mcp_tool` | `mcp_tool:<name>` | derived from a route handler name — see the blind spot |
| `test` | `test:<path>` | |
| `adr` | `adr:<NNNN>` | |
| `rule` | `rule:<RULE-ID>` | from `rules/ledger.yaml` |
| `process` | `process:<name>` | uvicorn, nginx, task |

## Edges

| Kind | Direction | Typical evidence |
|---|---|---|
| `IMPORTS` | file → file | `STATIC_CONFIRMED` |
| `DEFINES` | file → symbol | `STATIC_CONFIRMED` |
| `CALLS` | symbol → symbol | `STATIC_CONFIRMED` (Python, intra-repository) |
| `INJECTS` | symbol → symbol | `CONFIG_CONFIRMED` (`fastapi.Depends`) |
| `EXPOSES` | route → symbol | `CONFIG_CONFIRMED` |
| `DERIVES_TOOL` | route → mcp_tool | `CONTRACT_DECLARED` |
| `TESTED_BY` | file → test | `STATIC_CONFIRMED`, import-derived only |
| `OWNS` | unit → file | `CONTRACT_DECLARED` |
| `GOVERNED_BY` | file → adr | `STATIC_CONFIRMED` |
| `DEPENDS_ON` | unit → unit | `STATIC_CONFIRMED`, aggregated from `IMPORTS` |
| `RUNS` | process → file | `CONTRACT_DECLARED` |

### Test protection is never inferred from a name

A `TESTED_BY` edge exists only where a test **imports** the thing it protects. A file called
`test_auth.py` is not evidence that it protects `auth.py`. Where no import links them, no edge is emitted
and the absence is reportable — missing protection is a fact worth surfacing, not a gap to paper over with
a naming convention.

## Descriptive, not normative

This graph reports what **is**. `architecture.toml`, the Rule Ledger and the boundary checks define what is
**allowed**. An edge the index found never legitimises a dependency the contract forbids — and in fact the
first build found exactly that: `be/routers → be/adapters`, which `architecture.toml` does not permit.

## Blind spots

Declared up front and reported on any answer they touch:

| Id | Area |
|---|---|
| `BLIND-FE-001` | a component used only in a Vue template, with no import |
| `BLIND-FE-002` | dynamic `import()` targets |
| `BLIND-MCP-001` | MCP tool names are the library's documented behaviour, not observed |
| `BLIND-TASK-001` | Taskwarrior's internal behaviour |
| `BLIND-OPS-001` | the deploy host's compose file is not in this repository |
| `BLIND-NGINX-001` | `nginx.conf` is templated by `envsubst` at container start |
