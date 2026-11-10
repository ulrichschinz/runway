# Change Impact Brief 0051 — Lists, rows and sections

| Field | Value |
|---|---|
| **Requested outcome** | Milestone **M5** of [the plan](../plan/unified-ui-web.md): behind `?ui=neu` the five list views are real — Inbox (newest first), Nächste (eyebrow count, Fällig · Jetzt · Bald · Später, context chips), Warten auf (Nachhaken · Diese Woche · Später oder ohne Datum), Irgendwann, Alle (with the done of the last 7 days on demand). Rows tick off with the ring, `x` or a touch swipe: an ink strike, then the row collapses; the done waits in the outbox hold and the notice offers "Erledigt · Rückgängig"; `Entf` deletes with "Gelöscht · Rückgängig"; `t` plans a todo for today. One command table drives the keys. Nothing changes for anyone without `?ui=neu`. |
| **Owning unit** | `fe/tasks` — new `tasks/views/InboxPage.vue`, `NextPage.vue`, `WaitingPage.vue`, `SomedayPage.vue`, `AllPage.vue`, `tasks/components/TaskLine.vue`, `InkStrike.vue`, `ListSection.vue`, `ContextBar.vue`, `SectionList.vue`, `ListFrame.vue`, `tasks/useSwipe.js`, `tasks/useListPage.js`, `tasks/notice.js`, `tasks/listState.js`; `tasks/stores/gtd.js` imports `followUpOf` from `sections.js` instead of its own copy. `fe/layout` — new `layout/NoticeBar.vue`, `layout/ui/ErrorRow.vue` (both inherited from M4). `fe/shared` — new `shared/commands.js`, `shared/gestures.js`, `shared/rowMeta.js`, `composables/useKeymap.js`; `shared/sections.js` gains `waitingSections`; keys in `messages.de.js`. `fe/app` — `router/index.js` points the five list routes' new side at the pages. `ops` — [`ops/structure-baseline.toml`](../../ops/structure-baseline.toml): two dated lines (see *Rule IDs*). `tests` — `commands.test.js`, `gestures.test.js`, `rowMeta.test.js`, `sections.test.js` (+waiting). `docs` — this brief, `build/m5/`. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3–§5; [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (new files only in unit folders; `layout/` imports no feature; features never import features; tests cover logic). |
| **Governed by** | [ADR 0042](../adr/0042-the-new-ui-coexists-behind-a-switch.md) (the old side of every route stays). [ADR 0007](../adr/0007-frontend-test-scope.md) (pure logic tested, components not mounted). |
| **Rule IDs introduced** | **None.** No change to `architecture.toml`. Two dated ratchet lines in `ops/structure-baseline.toml` (`RULE-ARCH-003`, plan F10): `frontend/src/shared/dates.js = 5` (`rowMeta.js` reads server days too) and `frontend/src/tasks/components/ListFrame.vue = 5` (the five list pages). Approved by Uli as owner per the run's standing instruction — **not an independent approval (`RISK-GOV-001`)**. |
| **Entry points** | Routes `/inbox`, `/next`, `/waiting`, `/someday`, `/all` (new side); `useKeymap()` (one `keydown` listener per page); `COMMANDS` / `resolveKey()` / `shortcutSheet()`; `swipeOutcome()`; `dueInfo()`, `followInfo()`, `entryInfo()`, `metaOf()`, `rowLabel()`; `waitingSections()`. |
| **Affected public surfaces** | None new. Routes keep their paths; no storage key (the context filter and the cursor live in memory, as in 06). `./run surfaces` must stay clean. |
| **Known dependents** | From `./run impact` before the code: `TaskRow.vue` → `TaskList.vue` → the six old views; `_useTaskView.js` → the five old views; `taskFilters.js` in `fe/shared` (search, unchanged). None of them is touched: the new pages replace them on the new side only. `router/index.js` → `main.js`. `tasks/stores/gtd.js` gains the five pages as importers (fan-in is allowlisted in M0). |
| **Uncertain / dynamic areas** | **F13** — the index credits no frontend test; protecting tests named below. `RISK-TEST-004` — rows, the strike/collapse, swipe and focus are not tested by construction; driven on the harness (budgets measured with a scratch Playwright script) and in screenshots. Swipe on a real phone (Pixel 9, iPhone) is Uli's device step. |
| **Analogous implementations** | `06-kombination/web.js` (`rowMeta`, `rowHTML`, `sectionsFor`, `waitingSplit`, `renderHead`, `complete`, `notify`, the keydown handler), `common.js` (`dueInfo`, `followInfo`, `entryInfo`, `strikePath`), `base.css` / `web.css` / `combo.css` (row grid, ring, strike, `.sec`, `.ctx`, phone rows, notice). |
| **Delivery Pattern** | **New Capability** (`fe/tasks`, `fe/layout`, `fe/shared` units declared in M0). |
| **Required tests** | New: `frontend/tests/commands.test.js` (no duplicate key per scope, every command has an existing message key, chords resolve and time out, typing in a field and foreign modifiers never fire, the `?` sheet is generated from the table), `frontend/tests/gestures.test.js` (35 % / 96 px threshold, mouse and pen never complete, vertical scroll never completes, leftward never completes), `frontend/tests/rowMeta.test.js` (overdue/today/tomorrow/day, Nachhaken heute/seit/Wiedervorlage/wartet seit, erfasst heute/gestern/day, the `+1` context form, für heute only for Nächste, Android's row label). Extended: `sections.test.js` (`waitingSections`). Existing that protect touched code: `strings.test.js` (every `t('…')` literal exists), `contexts.test.js` (`chipCount`, `eyebrowCount`), `outboxQueue.test.js` (hold, undo), `pick.test.js`. |
| **Intended scope** | The files above. **Not** in scope: capture (M6), detail and `e`/Enter/`s` (M7), clarify and the Inbox list/stack toggle (M8, M10), palette, `/`, `?` sheet (M9), the lens (M11), margin panels (M12). |
| **Base revision** | `0e785ea` (branch `ui/m4-shell`, M4, not on `main`) |

## Design

- **Lists are computed, the view only lays them out.** Each page builds a flat array of sections
  (`{key, label, note, empty, rows}`) from the gtd store's lists and M2's rules; `SectionList.vue` renders
  it as one keyed `TransitionGroup` of section heads and rows (key = uuid; a todo appears once), so a row
  moving between sections moves rather than remounts, and a leaving row keeps its element for the strike.
- **Tick off.** The ring (`Abhaken: <d>`), `x` or a swipe call `gtd.complete()` at once — the done is in the
  stored outbox hold before anything animates, so a closed tab never loses it. The row leaves the list in
  the same render; its leave transition marks it `aria-hidden`, draws the ink strike (160 ms), then collapses
  it (120 ms) and removes it. Under reduced motion the strike is shown without drawing and the collapse is
  instant. `Entf` does the same with a grey strike and "Gelöscht".
- **Notice.** One notice at a time (`tasks/notice.js`), shown in the frame's `notice` slot through
  `layout/NoticeBar.vue` (desktop: bottom of the page column; phone: inside the dock — never over a row).
  Text `Erledigt` / `Gelöscht` / `Für heute geplant` / `Nicht mehr für heute`, button `Rückgängig` (key
  `z`), the 1 px yellow line drains over the 6 s hold. Rückgängig calls `gtd.undo(op)`; when the server
  already has it the notice says nothing more (the store returns false; the row stays done).
- **Keys** (`shared/commands.js`, one table; `composables/useKeymap.js` listens once per page): `j`/`k`
  (and arrows) move a cursor (`aria-current` row, real focus so screen readers follow), `x` ticks off,
  `Entf`/`Backspace` deletes, `t` plans for today, `z` undoes, `g` + `i n w p s a r ,` navigates, on Nächste
  `0` Alle, `1`–`5` the first five chips, `6` ohne Kontext. Keys never fire while typing in a field, and a
  key never fires with Ctrl, Alt or Meta (none of these commands owns a modifier). The table carries every
  command's message key and group, so M9's `?` sheet is generated from it (`shortcutSheet()`).
- **Swipe** (`tasks/useSwipe.js`, rule in `shared/gestures.js`): pointer type `touch` only; the row follows
  the finger to the right once the gesture is clearly horizontal; on release past `max(35 % of the row,
  96 px)` it completes, otherwise it springs back. A gesture that starts vertical is left to the scroller.
- **Rows** (`TaskLine.vue`): leading 44 px ring, one-line title, then mono meta in fixed columns on wide
  screens (project · context · date for Nächste and Alle; project · follow-up for Warten auf; `¶ n Notiz` ·
  erfasst for Inbox; project · seit for Irgendwann) and one non-wrapping meta line on the phone (empty
  parts dropped). Overdue: coral edge rule + `überfällig dd.mm.` (word and edge, never colour alone).
  Running: `läuft` with the coral pulse (static under reduced motion). `H` for priority high. `für heute`
  with the coral dot. A row whose write failed shows `Nicht gesendet · Erneut senden` (`ErrorRow.vue`).
  Android's row label `<Beschreibung>, <Status>, ID <8>` is the row's accessible name.
- **Chips** (`ContextBar.vue`): `Alle`, the D1-ordered contexts, `ohne Kontext` dashed (only when it has
  todos), counts from `contextCounts`; they wrap, never scroll. Desktop: under the heading; phone: in the
  dock (D2). The eyebrow uses `eyebrowCount`, so chip and eyebrow cannot disagree. The selected context
  survives navigation (module state, as 06's `ui.ctx`), not a reload.

## Where this departs from the plan or the prototype

1. **Strike 160 ms, collapse 120 ms (plan)** instead of 06's 640 ms hold + 190 ms collapse and the tokens'
   `--rw-dur-strike` 260 ms / `--rw-dur-collapse` 180 ms. The tokens stay as they are (Android shares them);
   the two plan values are `STRIKE_MS` / `COLLAPSE_MS` in `SectionList.vue` (the leave timing) and the matching CSS durations in `TaskLine.vue`.
2. **The done is sent to the hold first, the animation follows** (06 animated first, then wrote). Reason:
   the outbox must hold the done even if the tab closes during the animation (plan §6.4).
3. **Notice text without the row** (`Erledigt`, `Gelöscht`; judge weak point 2) and **in the dock on the
   phone** (D2; judge weak point 1) — the two deliberate differences to `web-phone.png`.
4. **Keys not in the table yet:** `e`, Enter/`o`, `s` (detail, M7), `n` (capture, M6), `/`, `?`, `⌘K` (M9),
   `d` on Alle is kept (it toggles the done list). Each comes with what it opens; a key that does nothing
   would fail the keyboard walkthrough. `g s` is Irgendwann (plan) — 06 used `g v`.
5. **Alle's "Erledigte zeigen"** shows the done of the last 7 days from the snapshot (06, and the section's
   own label `Erledigt, letzte 7 Tage`) rather than a new `status=all` request the plan mentions: the
   snapshot already holds them and an unbounded history read is not needed for a 7-day section.
6. **Inbox without lead text and Liste/Stapel toggle:** the lead promises clarify keys (M8) and the toggle
   opens the stack (M10); both come with their milestones. Empty Inbox shows heading, lead and `Zu Nächste`.
7. **Lens slot:** Nächste shows the caption `3 von 7 heute · 1 zusätzlich` as text; the lens itself is M11.
8. **Row click** only moves the cursor until M7's detail exists.
9. **Eyebrow and heading are drawn by `ListFrame`**, not by each page: five pages importing
   `EyebrowLine`/`PageHeading` would have pushed both primitives past the fan-in cap of 4; one frame
   for the list pages is also less repetition. JSDoc types avoid `import('vue')`: the index counts it as
   a dynamic import edge to `vue` (`BLIND-FE-002`) and three new files would have raised that "hub".
10. **No SVG pen-edge filter** on the strike (06 `#ink-edge`): the plain coral stroke reads the same at
   row size and needs no document-level `<defs>`.

## Open points

- `RULE-GOV-002` red on `main` and here (decay review overdue since 2026-10-14) — outside this change.
- **Inherited from M4 and done here:** `NoticeBar`, `ErrorRow`. **Still carried:** docked panel 761–1180 px
  → M7; `Keycap`, rail "Befehle ⌘K" / "Tastenkürzel ?", `g` hints, top line → M9.
- **Pending for Uli** (none blocks the milestone): approval of this commit and the stacked branch; swipe
  and phone row heights on a Pixel 9 and an iPhone; the plan's §10 steps before the first production use
  of the write path — `task export` backup on the host and the membership parity check on his account.

## Pre-checks

- **Start:** branch `ui/m5-lists` from `ui/m4-shell` at `0e785ea`; tree clean; `make check` GREEN before
  the first file; this brief written before the code.
- **Before you start** (plan): `./run impact` on `TaskRow.vue` (→ `TaskList.vue` → six old views),
  `TaskList.vue` (six old views), `_useTaskView.js` (five old views); `./run map shared/taskFilters.js` →
  `fe/shared`. None of them touched.
- **After** (`./run index`, new files visible with `git add -N`): `./run map` puts `tasks/components/*`,
  `tasks/views/*Page.vue`, `tasks/useListPage.js`, `notice.js`, `listState.js`, `useSwipe.js` in
  `fe/tasks`; `layout/NoticeBar.vue`, `layout/ui/ErrorRow.vue` in `fe/layout`; `shared/commands.js`,
  `gestures.js`, `rowMeta.js`, `composables/useKeymap.js` in `fe/shared`. `layout/` imports no feature:
  `./run impact frontend/src/layout/NoticeBar.vue` has `ListFrame.vue` as its only direct dependent.
  `./run impact frontend/src/tasks/stores/gtd.js`: `NewUiHost`, `StoreDebugPage`, `ListFrame`,
  `useListPage` and the five pages (allowlisted hub). `./run violations`: the two declared cycles,
  nothing new. Every new module is "without import-derived test protection" (F13): protected by
  `commands.test.js`, `gestures.test.js`, `rowMeta.test.js`, `sections.test.js` (pure parts); the
  components by the harness runs below.
- **Tests:** frontend **442 → 471 passed** (+29: `commands.test.js` 10, `gestures.test.js` 5,
  `rowMeta.test.js` 12, `sections.test.js` +2); backend 642 unchanged (no backend file touched).
- **Driven on the harness** (scratch Playwright script, Chrome, own user `m5-agent`): ring click → row
  struck, `aria-hidden` and `inert` at once, out of the DOM ~290 ms, notice `Erledigt · Rückgängig`;
  Rückgängig brings the row back and sends nothing; a done not undone reached the server after the 6 s
  hold (`GET /tasks/{uuid}` → `completed`, end 6 s after the click). Keys: `j`/`k`/`↓` move the cursor
  with real focus; `Ctrl+x` does nothing; `x` ticks off and the cursor moves to the next row; `z` undoes;
  `t` → `Nicht mehr für heute`, `z` restores; `2` → `@anrufe` (eyebrow `@anrufe · 3 · +2 ohne Kontext`
  equals the chip), `6` → `ohne Kontext`, `0` → Alle; `g w`, `g a`, `g i` navigate; `g`, 1 s pause, `w`
  does nothing (chord expired); `d` on Alle shows the week's done; `Entf` → `Gelöscht · Rückgängig`; `t`
  in the Inbox does nothing. Offline, `t` leaves the row with `Nicht gesendet · Erneut senden` and the
  rail line `1 nicht gesendet · senden`; back online the outbox resends it. **Swipe** (synthetic pointer
  events on a 412 px phone viewport, row 380 px): mouse 300 px → nothing; touch 100 px → springs back;
  touch mostly vertical → nothing; touch 200 px (> 35 % = 133 px) → completes. Real-finger swipe on a
  Pixel 9 / iPhone is pending for Uli.
- **Review fixes** (own user `fx-m5`): (1) the cursor acts only on a visible row — `visibleCursor` in
  `commands.js` drops it when its row leaves the screen (chip, write) and `x`/`Entf`/`t` check it again;
  repro: `j`×5, chip `1` hides the cursor row, `x` → no notice, rows 6 → 6, the todo stays `pending`
  on the server. (2) a held key's auto-repeat runs only cursor moves (`repeatsOnHold`): held `x` (three
  keydowns, two `repeat`) → rows 13 → 12, one `z` → 13. Both pinned in `commands.test.js`.
- **Budgets** (production build into the scratchpad, `vite preview` proxying the harness API, three tick
  offs): row struck **3–7 ms** (≤ 100 ms), out of the accessibility tree at the same moment, out of the
  DOM **288–291 ms** (≤ 1 s). Bundle: JS **326.51 kB, 108.14 kB gzip** (M4: 100.61; budget ≤ 130),
  CSS 60.90 kB / **11.59 kB gzip** (budget ≤ 20). **Phone rows 58 px** (≤ 60), chips in the dock 44 px
  touch targets around 32 px pills, dock tabs unchanged (48 px).
- **Screenshots and a11y:** [`build/m5/`](../design/2026-10-31-unified-ui/build/m5/README.md) — 27 shots
  (five lists desktop/phone light/dark, Nächste filtered by `@computer`, `@anrufe` (merged Fällig with
  `andere Kontexte`, desktop and phone) and `ohne Kontext`, Alle with the done, the notice on desktop
  and in the phone dock), each looked at and compared with 06; axe-core 4.10.2: 0 serious or critical on
  all five lists, desktop and phone, and Nächste dark. Speed mode (Uli asked to finish quickly): narrow
  and WebKit deferred to M15 QA, although the plan lists WebKit from M5 on; a reviewer's WebKit shot of
  Nächste rendered correctly. The review fixes change no pixels, so no shot was retaken.
- **Old UI unchanged:** only the new side of the five routes changed (`pick(OldView, NewPage)`); no old
  view, component or store touched.
- **`./run surfaces`:** clean (no new key, no new route).
- **`make check`:** GREEN. **`make verify`: RED on `RULE-GOV-002` only** (decay review overdue,
  pre-existing): `js-lint`, `js-test` 471, `py-test` 642, `index-fresh`, `contract`, `route-guards`,
  `surfaces`, `boundaries` (with the two dated lines), gate conformance 56 fixture arms passed; container
  tier skipped (no Docker, `RISK-TEST-001`; no backend change).
