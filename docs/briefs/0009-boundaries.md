# Change Impact Brief 0009 — Boundary enforcement, cycle ratchet and hub baselines

| Field | Value |
|---|---|
| **Requested outcome** | Turn the structural facts the index reports into rules that fail the build. |
| **Owning unit** | `ops`, with two fixes in `backend` |
| **Rule IDs introduced** | `RULE-ARCH-001` (forbidden edges), `RULE-ARCH-002` (cycles + ratchet), `RULE-ARCH-003` (hub baseline) |
| **Entry points** | `tools/index/boundaries.py`, `tools/checks/boundaries.sh`, `ops/structure-baseline.toml` |
| **Affected public surfaces** | **None.** |
| **Delivery Pattern** | **Behaviour-Preserving Refactor** for the two code fixes; **New Capability** for the checks. |
| **Required tests** | 121 backend unit tests unchanged and green; three negative fixtures. |
| **Base revision** | `5d4e4af` |

## The two violations are fixed

| Was | Now |
|---|---|
| `routers/gtd.py` imported `task_runner.export_tasks`, reaching past the service layer and its validation | `task_service.project_names()` owns the call; the router asks the service |
| `routers/auth.py` imported `database._generate_api_key` — a name whose underscore claimed it was module-private while two routers imported it | renamed `generate_api_key`, with a docstring saying who calls it |

Behaviour-preserving: `project_names` performs the identical export and the identical
first-seen-order extraction, and the rename touches no logic. All 121 backend unit tests pass unchanged —
which is exactly why Step 3 came first.

## The cycle detector found four cycles where I had declared one

My Phase 1 inventory was incomplete. But three of the four were **artefacts of my own unit declaration**,
not of the code:

- `be/entry` lumped `main.py` (which imports routers) with `dependencies.py` (which routers import).
  Assembly and provision point in opposite directions; putting them in one unit manufactured a cycle the
  code does not contain. Split into `be/app` and `be/di`.
- `fe/shell` lumped the router (which imports every view) with `AppShell.vue` (which every view imports),
  manufacturing a cycle *per feature*. Split into `fe/app` and `fe/layout`.

After the split, **two real cycles remain**, and they share one cause: `AppShell` reaches into the tasks and
auth stores instead of receiving what it displays. `CYCLE-001` and `CYCLE-002` are declared with an owner
and a shared teardown path. One change removes both.

## The ratchet works in both directions

`RULE-ARCH-002` fails on a new cycle **and** on a declared cycle that no longer exists. The second half
matters: without it, an inventory only ever accumulates, and the improvement that removed a cycle is never
locked in.

## Behaviour change

**None.** Two behaviour-preserving code changes, enumerated above.
