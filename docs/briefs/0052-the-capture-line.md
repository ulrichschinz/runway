# Change Impact Brief 0052 — The capture line

| Field | Value |
|---|---|
| **Requested outcome** | Milestone **M6** of [the plan](../plan/unified-ui-web.md): behind `?ui=neu` every list page has the capture line "Neues Todo" (coral `+`, hint `⏎ in die Inbox`, `n` focuses it): at the bottom of the page column on wide screens, in the phone dock under the tabs. Enter sends the todo to the Inbox at once (`POST /inbox`) and the notice offers "In Inbox ✓ · Rückgängig"; the page, its tab and its chip stay. The text is capped by the same rule as Android's `Capping.kt` (`shared/capping.js`). A typed draft is kept in `localStorage['captureDraft']` and becomes a capture when the page goes away (`pagehide`, which a reload fires too); if `pagehide` never fired (a crash, a killed tab), the draft is back in the field at the next open. A capture made away from the Inbox puts a yellow dot on the Inbox count until the Inbox is visited. Offline the row says "Nicht gesendet · Erneut senden"; a resend after a lost answer creates exactly one task. Nothing changes for anyone without `?ui=neu`. |
| **Owning unit** | `fe/tasks` — new `tasks/components/CaptureLine.vue`, `tasks/captureDraft.js`; `tasks/components/ListFrame.vue` places the line and binds `n`; `tasks/stores/gtd.js` caps with `capping.js`, marks `inboxDot`, and `undo(op)` follows a capture to its server uuid. `fe/shared` — new `shared/capping.js`; `shared/outboxQueue.js` loses its interim `captureText` / `CAPTURE_MAX`; `composables/useOutbox.js` no longer sends another tab's queued ops (see departures), flushes queued
captures with keepalive and arms the takeover of another tab's op in flight; `shared/outboxQueue.js`
gains `KEEPALIVE_MS` / `inFlightUntil` and `begin(…, {keepalive})`; `shared/commands.js` gains `capture` (`n`); keys in `messages.de.js`. `fe/layout` — `RailNav.vue` and `PhoneDock.vue` show `flags.inboxDot`. `fe/app` — `router/NewUiHost.vue` passes `inboxDot` and clears it on the Inbox. `ops` — `ops/surfaces/spa.json` (+`captureDraft`). `tests` — `capping.test.js` (new), `outboxQueue.test.js` (interim capping test moved out). `docs` — this brief, `build/m6/`. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3–§5; [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (new files only in unit folders; `layout/` imports no feature; storage only in `.js` with literal keys, F9; tests cover logic). |
| **Governed by** | [ADR 0042](../adr/0042-the-new-ui-coexists-behind-a-switch.md) (old side of every route unchanged). [ADR 0007](../adr/0007-frontend-test-scope.md) (pure logic tested, components not mounted). |
| **Rule IDs introduced** | **None.** No change to `architecture.toml` or `ops/structure-baseline.toml`. |
| **Entry points** | `cap()` / `truncateUtf8()` (`shared/capping.js`); `readDraft()` / `saveDraft()` / `takeDraft()` (`tasks/captureDraft.js`); `useGtdStore().capture()`, `.captureOnLeave()`, `.inboxDot`, `.seeInbox()`; command `capture` (`n`). |
| **Affected public surfaces** | **SPA storage:** new key `captureDraft` (JSON `{user, tab, text}`), added with `./run surfaces --update`; diff: `+ "captureDraft"` in `local_storage_keys`. No route, no API change. |
| **Known dependents** | From `./run impact` before the code: `components/TaskModal.vue` (the old capture path) → the six old views → `router/index.js` → `main.js`; not touched. `./run map tasks/stores/gtd.js` → `fe/tasks` (allowlisted hub). `outboxQueue.js`'s `captureText` had one caller (`gtd.js`) and one test. |
| **Uncertain / dynamic areas** | **F13** — the index credits no frontend test; protecting tests named below. `RISK-TEST-004` — the component, focus, `pagehide` and the dot are not unit-tested by construction; driven on the harness (Pre-checks). `pagehide` on iOS Safari when the app is killed from the switcher is not guaranteed; the draft then stays in the field at the next open (see departures). |
| **Analogous implementations** | `06-kombination/web.js` (`#capture` form, submit/input/Escape handlers, `n`, the `n.captured` notice), `web.css` `.capture`, `store.js` `capture` / `uncapture`; Android `gtd/Capping.kt` + `CappingTest.kt`, `ui/InboxViewModel.kt` (draft into the outbox on leaving). |
| **Delivery Pattern** | **New Capability** (`fe/tasks`, `fe/shared` units declared in M0). |
| **Required tests** | New: `frontend/tests/capping.test.js` — every case of Android's `CappingTest.kt` one to one (trim, blank, exactly 500, 500 + rest, rest before an existing note, emoji never split, 32 KB note in UTF-8, line breaks collapse, only-a-note, `truncateUtf8`) plus web cases (inner spaces and tabs kept as Taskwarrior keeps them; a 4-byte code point at the 32 KB edge). Extended: `commands.test.js` covers the new `capture` row automatically (unique keys per scope, message key exists). Existing that protect touched code: `outboxQueue.test.js` (capture op, duplicate check `verifyRequest` / `alreadyApplied`, undo of a capture in every state), `strings.test.js` (every `t('…')` literal exists). |
| **Intended scope** | The files above. **Not** in scope: palette "Als Todo erfassen" (M9), the field in the card stack (M10), inline add on a project (M13), the capture line on Projekte / Rückblick / Einstellungen (still `ComingPage` in `fe/layout`, which may not import a feature; each gets it with its milestone). |
| **Base revision** | `2152215` (branch `ui/m5-lists`, M5, not on `main`) |

## Design

- **Capping (`shared/capping.js`)** is a line-by-line port of `Capping.kt`: the description is trimmed,
  every run of line breaks (with the ASCII whitespace around it, Java's `\s`) becomes one space, it is
  cut at 500 code points (`trimEnd`), the rest goes before the note joined by a blank line, and the note
  is cut at 32 KiB of UTF-8 without splitting a code point. Blank description and blank note → nothing.
  Only a note → its first line becomes the description. Inner spaces and tabs are **kept** (Android
  does, and Taskwarrior stores them verbatim — checked on the harness: `"Leer  zeichen\tTab  ende"`
  comes back unchanged), so the duplicate check's exact comparison holds.
- **Write path** is M3's: a capture op goes out at once; offline or on a 5xx it fails with `verify`,
  so "Erneut senden" first asks `GET /tasks?status=all&q=<first 200 code points>` and only posts when no
  twin from the last minutes exists. Rückgängig: an unsent capture is dropped locally, one in flight is
  deleted when its answer arrives, a sent one is deleted on the server (`DELETE /tasks/{uuid}`).
  `gtd.undo(op)` now follows a settled capture to its server uuid (the notice holds the op it was given).
- **Draft:** every keystroke writes `{user, tab, text}` to `captureDraft`; mount restores it for the
  same user (another user's draft is neither shown nor captured, and stays stored); a `storage` event
  shows the draft in every tab. On `pagehide` only the tab that typed the draft (`tab`) turns it into a
  capture (`gtd.captureOnLeave`), so closing or reloading another tab never files a half-typed thought.
  That capture is sent at once with `fetch(…, {keepalive: true})` (`useOutbox.flush` now also covers
  queued ops that need no duplicate check) and marked `keepalive` in the stored outbox. The page never
  sees its answer, so the reloaded page, or any other open tab, takes the op over after `KEEPALIVE_MS`
  (3 s) instead of `IN_FLIGHT_MS` (30 s), verified first, so it finds the twin and posts nothing more.
  A tab that sees another tab's op in flight (at boot or by a `storage` event) arms a one-shot takeover
  for when that op's window ends, so a closed tab's op is never left `sending` until a reload.
- **Focus:** `n` (command table, `global`) focuses the line from any list page through `ListFrame`'s one
  keymap; Escape blurs it. On the phone the line is focused when the Inbox opens, not on Nächste or
  Warten auf.
- **Inbox dot:** `gtd.inboxDot` is set by a capture and cleared whenever the route is the Inbox
  (`NewUiHost`), so a capture made on the Inbox never shows it. Rail and dock show a 6 px yellow dot
  after the Inbox count, with the screen-reader text "neu erfasst".

## Where this departs from the plan or the prototype

- **Whitespace:** the plan says "whitespace collapsed"; Android's `Capping.kt` collapses only line
  breaks and the orchestrator's instruction is to match it exactly. Collapsing more would make the two
  clients store the same typed text differently. (06 `store.js` folded all whitespace.)
- **Android quirk carried along, reported:** for a note-only capture `Capping.kt` takes the first line
  with `lineSequence()` (splits at `\r`, `\n`, `\r\n`) but the rest with `substringAfter('\n')`; a note
  whose lines are separated by a lone `\r` loses everything after the first line. The web port matches
  it (pinned in `capping.test.js`) so the clients agree; the web field cannot produce a note-only
  capture, so the case is Android's to fix. Pending for Uli: decide whether Android changes it.
- **Leftover draft at start:** Android captures a draft left by a crash at the next start
  (`recoverDrafts`). The web restores it into the field instead (06's behaviour): on the web this only
  happens when `pagehide` did not fire, and an edited text in the field is visible, not silently filed.
- **No fading dot on the fresh row** (06 `.row.fresh`): the Inbox count's dot (plan) carries "new";
  the row itself shows its sync state. Left out to keep one signal.
- **Fix in M3's outbox (found here):** with two tabs open, a capture was posted **twice** — the other
  tab's `storage` handler sent the op it saw `queued` before that tab's own `sending` write reached it
  (Chrome propagates `localStorage` between tabs asynchronously). Now a change from another tab only arms
  that tab's holds, `FOREIGN_GRACE_MS` (2 s) late as a backup, and never sends what it queued. Harness:
  before 2 POSTs / 2 tasks, after 1 POST / 1 task (four runs); a held done with two tabs open: one POST.
  `useOutbox.js` is effects only (ADR 0007), so the evidence is the harness run, not a unit test.
- **Notice** is `In Inbox ✓` without 06's dimmed description, as M5 did for `Erledigt` (judge weak
  point 2).

## Open points

- `RULE-GOV-002` red on `main` and here (decay review overdue since 2026-10-14) — outside this change.
- Undo of a capture that **failed** offline drops it locally; if the lost request had in fact arrived
  (answer lost, not request), the server keeps the task. A verify-then-delete undo would close this;
  not in the plan's table (it says "drop locally if never sent").
- **Pending for Uli** (none blocks the milestone): approval of this commit and the stacked branch;
  capture with the on-screen keyboard and the dock above it on a Pixel 9 and an iPhone, including
  `pagehide` when the browser is swiped away; the plan's §10 steps (task export backup on the host,
  parity check on his account) before the first production use of the write path; the `\r` quirk above.

## Pre-checks

- **Start:** branch `ui/m6-capture` from `ui/m5-lists` at `2152215`; tree clean; `make check` GREEN
  before the first file; this brief written before the code.
- **Before you start** (plan): `./run impact components/TaskModal.vue` → the six old views →
  `router/index.js` → `main.js` (none touched); `./run map tasks/stores/gtd.js` → `fe/tasks`.
- **After** (`./run index`, new files visible with `git add -N`): `./run map` puts `shared/capping.js`
  in `fe/shared`, `tasks/captureDraft.js` and `tasks/components/CaptureLine.vue` in `fe/tasks`.
  `./run impact tasks/components/CaptureLine.vue`: `ListFrame.vue` → the five list pages →
  `router/index.js`. `layout/` still imports no feature (the dot arrives as `flags.inboxDot`).
  `./run violations`: the two declared cycles, nothing new. New modules are "without import-derived test
  protection" (F13): `capping.js` is protected by `capping.test.js`; the rest by the harness runs below.
- **Tests:** frontend **471 → 486 passed** (+15 `capping.test.js`; −1 the interim capping case moved out
  of `outboxQueue.test.js`; +1 there for the keepalive takeover window, from the review); backend unchanged (no backend file touched).
- **Surfaces:** `./run surfaces --update`, diff `+ "captureDraft"` in `local_storage_keys`; then clean.
- **Driven on the harness** (scratch Playwright scripts, Chrome, own users `m6-agent`, `m6-shots`):
  - Nächste with chip `@anrufe`: `n` focuses "Neues Todo", Enter → `POST /inbox`, URL and chip stay,
    field empty, notice `In Inbox ✓ · Rückgängig`, rail `Inbox 6` → `Inbox 7` + dot ("neu erfasst");
    server `pending`. **Rückgängig after send** → `DELETE /tasks/8c5e0e01-…` → `GET /tasks/{uuid}`
    `status: deleted`. Visiting the Inbox clears the dot. `g n` still navigates; `z` after Escape
    undoes a capture the same way (`POST` then `DELETE`).
  - **Offline capture** (`context.setOffline`): the row reads `Nicht gesendet · Erneut senden`, rail
    `1 nicht gesendet · senden`. **Reconnect:** the `online` retry first asks
    `GET /tasks?status=all&q=M6 offline …`, then posts once → server has exactly **1** task.
  - **Lost answer** (the POST reaches the server, the page gets a network error): server has 1 task;
    "Erneut senden" → `GET /tasks?status=all&q=…` finds the twin → **no second POST** (1 POST in total),
    1 task, 1 row.
  - **Draft:** `pagehide` (reload, navigating away) turned the typed draft into exactly one capture and
    cleared `captureDraft`; a stored draft of the same user is back in the field at open; another user's
    draft is not shown and stays stored; two tabs show the same draft, and a send in one empties both.
  - **Review fixes (draft per tab, keepalive, takeover)** (`m6-fix/fix.mjs`): tab A types, tab B shows
    the draft and navigates away → server **0**, A's field keeps the text. A reloads → its draft is on
    the server at once (keepalive), the stored outbox is empty ~5 s later, still **1** task (the takeover
    verified and posted nothing). An op another tab left `sending` 29 s ago, then closed: the open tab
    took it over after 2.1 s without a reload → **1** task, outbox empty. The earlier two-tab and drive
    scripts were re-run: 1 POST / 1 task each.
  - **Phone:** the field is focused when the Inbox opens, not on Nächste or Warten auf. A 499-char text
    + ` <stamp> Rest` is stored as 499 code points (the space at the cut trimmed) with the note
    `<stamp> Rest`. Taskwarrior keeps `"Leer  zeichen\tTab  ende"` verbatim (curl).
- **Budgets** (production build into the scratchpad): JS 330.08 kB / **109.32 kB gzip** (M5 108.14;
  ≤ 130), CSS 62.55 kB / **11.83 kB gzip** (≤ 20). Capture field in the dock 48 px high.
- **Screenshots and a11y:** [`build/m6/`](../design/2026-10-31-unified-ui/build/m6/README.md) — 11 shots
  (Inbox and Nächste desktop/phone light/dark, the capture from Nächste desktop light and phone dark,
  the unsent row), each looked at and compared with 06; the one fix it led to: the global focus ring
  boxed the phone field when it was focused on open, now the field shows 06's caret and 1 px yellow line.
  Remaining: an unsent row's long title is cut early by the sync label (M5's row layout). axe-core
  4.10.2: 0 serious or critical on Inbox and Nächste, desktop and phone. Speed mode: narrow and WebKit
  deferred to M15 QA.
- **Gate:** `make check` GREEN; `make verify` RED only for `RULE-GOV-002` (pre-existing, out of scope;
  `WAIVER-TYPE-001` and `SHIM-SEC-006` still pass). A first verify run also showed `RULE-IDX-001`
  stale because this brief was edited while it ran; re-indexed and re-run.
