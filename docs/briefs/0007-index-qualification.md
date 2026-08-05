# Change Impact Brief 0007 — The Index Qualification Gate

| Field | Value |
|---|---|
| **Requested outcome** | Decide, mechanically and on every run, whether the index may be trusted. |
| **Owning unit** | `ops` |
| **Applicable contracts** | `index/schema.md`, `index/manifest.toml` (`[validation]`), ADR 0008 |
| **Rule IDs introduced** | `RULE-IDX-003` |
| **Entry points** | `tools/index/tests/test_qualification.py`, `tools/checks/index-qualified.sh` |
| **Affected public surfaces** | **None.** |
| **Delivery Pattern** | **New Capability** |
| **Required tests** | 27 qualification assertions; `RULE-IDX-003` with a negative fixture that inverts import direction. |
| **Base revision** | `925a28f` |

## What the suite decides

| Area | Assertions |
|---|---|
| Coverage | every backend and frontend source file is indexed; **≥18 `.vue` files** — the ADR 0008 gap; every declared unit exists; every file has an owning unit; all three processes; REST, SPA and MCP surfaces |
| Direction | a known import points importer→imported and not the reverse; `OWNS` is unit→file; `EXPOSES` is route→symbol |
| Evidence | every fact carries a declared class; static code edges carry file **and** line; a known edge is at `gtd.py:7`; MCP tools are `CONTRACT_DECLARED` with `verified_at_runtime: false`; declared facts are never marked `STATIC_CONFIRMED` |
| Impact & flow | the change-impact of `task_runner` includes both real dependents; an end-to-end path runs route → handler → service; the relevant blind spot is surfacable; every mechanism listed as unsupported has a declared blind spot |
| Test protection | a known test is found; protection is **never** inferred from a matching file name; missing protection is reported explicitly |
| Unsupported mechanisms | dynamic `import()` → `UNKNOWN`; a template-only component → **no edge at all**; an unparseable file → no facts |

## A finding the suite forced into the open

Only 3 of 18 backend files carry a `TESTED_BY` edge — yet all of them are tested. The edges are
import-derived, and every router is exercised through the FastAPI `TestClient` rather than by direct import.

The index was right to emit nothing: inferring protection from a name would make every "is this tested?"
answer untrustworthy. But reporting "no protection" without qualification would be misleading in the other
direction. `BLIND-TEST-001` now states the limitation, and the suite **requires** it to be declared whenever
unprotected files are reported.

## Defects found and fixed during the step

| Defect | Fix |
|---|---|
| The qualification suite rebuilt the real index — the same side-effect flaw fixed in Step 5 for the determinism check | builds into a scratch directory |
| `make fix` formatted only `backend/app`, while the gate checked `app`, `tests` and `tools/index`. The gate failed and told the contributor to run a command that could not fix it | the fix scope now matches the check scope exactly |
| `RULE-FMT-001`'s message always reported "0 file(s) are not formatted" — it counted a string ruff does not emit | counts ruff's actual summary line |

The middle one matters most: a `fix` command that does not cover what the gate checks teaches people to
distrust the gate.

## Behaviour change

**None.** No application code is touched.
