# Change Impact Brief 0030 — Tags (and depends) are a full set on modify

| Field | Value |
|---|---|
| **Requested outcome** | `PUT /tasks/{uuid}` with `tags` sets exactly that set, so a tag can be removed. New deltas `tags_add` / `tags_remove` edit tags without a prior read. The web UI's tag removal, which never worked, starts working. `depends` gets the same fix. |
| **Owning unit** | `be/services` (`task_service.py`), `be/leaves` (`models.py`), `integrations` (the skill), `ops` (snapshots), `docs` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 (Taskwarrior changes live in the service), §5 (public surfaces) |
| **Governed by** | [ADR 0019](../adr/0019-the-taskwarrior-argv-boundary.md) (modifiers before `--`), [ADR 0035](../adr/0035-the-skill-lives-with-the-api-it-drives.md) (the skill moves with the API) |
| **Rule IDs introduced** | None. |
| **Entry points** | [`backend/app/services/task_service.py`](../../backend/app/services/task_service.py) `modify_task`, `_tag_diff`, `_depends_diff`, `TAG_RE`, `EXISTING_TAG_RE`; [`backend/app/models.py`](../../backend/app/models.py) `TaskModify` |
| **Affected public surfaces** | **REST (S1), additive:** `TaskModify` gains `tags_add` and `tags_remove` (each at most 50 items). **Behaviour of `tags` and `depends` on `PUT /tasks/{uuid}`** changes from "add these" to "the complete set" (see below). **Tag validation is stricter** for tags that are written: a leading digit, `.`, `+` or `-`, and a comma are now 400. MCP tool names are unchanged (`modify_task_tasks__uuid__put`); the MCP snapshot is byte-identical. **Claude skill** 0.2.1 → 0.3.0. |
| **Known dependents** | The web UI (`TaskModal.vue` sends the complete tag list on every save and expected removal); MCP and REST agents, including the runway skill; the inbox webhook (create path, stricter regex only). |
| **Uncertain / dynamic areas** | `BLIND-TEST-001` (router coverage is not import-derived). The container tier runs only in CI on x86_64 (`RISK-TEST-001`); it was run locally by hand for this change (below). |
| **Analogous implementations** | [Brief 0014](0014-taskwarrior-boundary.md) — the `(mods, text)` split this change relies on. |
| **Delivery Pattern** | **Bug Fix** (web-UI regression: tag removal did nothing, recorded in [`docs/operations.md`](../operations.md)) plus an additive public-surface change (the two delta fields). |
| **Required tests** | Unit (`test_task_service.py`, argv level): status swap emits `-someday +next` before `--`; `tags=[]` removes every tag; deltas without the full set; combination is `ValueError`; absent removal emits nothing; legacy comma tag split; kept legacy tags never revalidated (UI shape and description-only edit); new malformed tags refused; `tags_remove` checked with the looser rule; a stored tag with a leading digit or `.` refused on removal (delta and full set) with no call made, and the fake refusing that token; future-wait task re-tagged; `depends` drop emits `depends:-uuid`, only new ones added, `[]` clears. HTTP (`test_tasks.py`): someday → next moves between `/gtd/someday` and `/gtd/next`; combination 400; last tag removed → back in `/gtd/inbox`; 51 deltas → 422. Container (`TestTagsAreAFullSet`): the same moves, legacy comma split and `depends:-uuid` against the real binary; `-1abc` / `-.x` read as description text by the binary, and the matching 400 leaving description and tags unchanged. |
| **Intended scope** | Service, model, fake (`depends` semantics), tests, the new container `conftest.py`, snapshots, skill text and version, three docs. **Not** in scope: empty-string clearing and rc 2 → 400 (P0-2), wait-aware lists and the inbox filter (P0-3), the MCP allowlist (P0-4), any frontend change. |
| **Base revision** | `8192e2e` |

## Behaviour change

- **`tags` on modify is the complete desired set.** The service reads the task by uuid (which matches
  whatever its status or `wait`), then emits `-tag` for each dropped tag and `+tag` for each new one, as
  modifiers before `--`. Before, it emitted only `+tag`: a removal silently did nothing, and a status swap
  left the task in both lists. After `--`, `-tag` would have become description text (observed on 3.5.0).
- **`tags_add` / `tags_remove`** are deltas against the current set. Sending either together with `tags`
  is 400 (`not both`). Removing an absent tag and adding a present one are no-ops.
- **`depends` on modify is the complete set too.** `depends:X` only ever adds on Taskwarrior 3.5;
  dropped dependencies are now removed with `depends:-uuid` (verified), and `[]` still clears.
- **Tag validation (D3).** A tag that is written — on create, an addition in the full set, or `tags_add`
  — must match `TAG_RE`: first character a letter (umlauts included), `_` or `@`, then letters, digits,
  `_`, `@`, `.`, `-`. `-next`, `+x`, `1abc`, `.x` and `a,b` are now 400; `Büro` and `@büro` are newly
  accepted. A tag the task already carries and keeps is **never** checked, so tasks with legacy tags
  (`@home,@office`, `1abc`) stay editable from the UI. A tag being removed is checked with the looser
  `EXISTING_TAG_RE`, which admits legacy tags such as `@home,@office` or `a/b` but no whitespace, sign,
  `:`, parenthesis or quote. Its first character must be a letter, `_`, `@`, `$` or `#`: Taskwarrior
  3.5.0 reads `-1abc`, `-.x`, `-/a/`, `-[a]` and similar as description text, so the description would
  be overwritten and the tag kept (verified). Removing such a tag is therefore 400 (`cannot remove
  tag`); it stays on the task and the task stays editable as long as the tag is kept. This narrows the
  first character of D3's `EXISTING_TAG_RE` to what the binary actually parses as a removal.
  Both are matched with `fullmatch`, so a trailing newline cannot slip through `$`.
- **Create** is unchanged apart from the stricter regex.

## Pre-checks

- Manual container run (D25), `TZ=UTC`, against `/opt/homebrew/bin/task` 3.5.0 on arm64:
  `.venv/bin/python -m pytest -p no:cacheprovider -m container tests/container` → **23 passed**
  (17 before, 6 new). With the service and model reverted to `8192e2e`, all 6 new container tests fail.
- The unit tests were written first and failed against the old service.

## Known, not fixed

The web UI's sidebar lags after a removal: its context-tag list only ever grows
(`_mergeContextTags`, `frontend/src/stores/tasks.js:79-86`), so a context removed from its last task
stays listed until the page reloads. Cosmetic; no frontend change in this commit.

## Skill

0.3.0. The "older runway versions cannot remove tags" caveat is gone; status swaps use
`tags_remove` + `tags_add` in one modify call (`SKILL.md`, `clarify.md`, `conventions.md`,
`daily-review.md`), and the operation table gains a row for the deltas. "Tag removal" leaves the
"if present" list in `integrations/claude/README.md`.
