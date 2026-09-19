# Change Impact Brief 0027 — The lock must match the intent

| Field | Value |
|---|---|
| **Requested outcome** | A bump to `backend/requirements*.txt` that is not reflected in the lock the image installs fails the gate, instead of passing it and changing nothing that ships. The first item queued in `docs/plan/STATUS.md` §8, and the precondition for taking any of the open Dependabot pip pull requests. |
| **Owning unit** | `tools`, `rules`, `docs` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 (a gate rule is four artefacts), §9 (the meta-rule) |
| **Governed by** | [ADR 0034](../adr/0034-the-lock-must-match-the-intent.md) |
| **Rule IDs introduced** | **`RULE-DEP-005`** — every direct dependency in the intent files MUST be an exact pin, installed at exactly that version by the lock compiled from it, and a lock MUST NOT keep a direct dependency no intent file declares. Executable, `check` and `verify` profiles through the existing `supply-chain` entry, one negative fixture (`DEP-005`). The suite now proves **43 of 46** executable rules able to fail over **49** fixture arms. |
| **Entry points** | [`tools/checks/pinning.py`](../../tools/checks/pinning.py) (`check_lock_matches_intent`), [`tools/checks/supply-chain.sh`](../../tools/checks/supply-chain.sh) |
| **Affected public surfaces** | None. No application code, no snapshot, no image content changes. |
| **Known dependents** | Every future dependency bump, Dependabot's included. |
| **Uncertain / dynamic areas** | Transitive lines of a lock are not compared against anything — see ADR 0034, *What it does not hold*. |
| **Analogous implementations** | [Brief 0016](0016-supply-chain.md) — `RULE-DEP-004`, the form check this rule completes. |
| **Delivery Pattern** | **Security or Operability Change** — a new gate rule, all four artefacts in one commit. |
| **Required tests** | The negative fixture: bump `aiosqlite` in `requirements.txt` alone, exactly as Dependabot #25 does, and observe `supply-chain.sh` go red naming `RULE-DEP-005`. The current tree passes. |
| **Intended scope** | The check, its ledger entry, its fixture, its contract text in `docs/task-interface.md`, the ADR. **Not** in scope: merging or rebasing the Dependabot pull requests themselves. |
| **Base revision** | `8716ac0` |

## Behaviour change

For the gate only. The application, the images and every public surface are unchanged.

| | Before | After |
|---|---|---|
| `requirements.txt` bumped, lock untouched | `verify` green, image unchanged | `verify` red: file, line, declared and locked version |
| Direct dependency removed from the `.txt`, lock untouched | green, image still installs it | red |
| Non-exact line in an intent file | green | red |
