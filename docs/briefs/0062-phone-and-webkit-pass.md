# Change Impact Brief 0062 — Phone, WebKit, accessibility and performance pass of the new UI

| Field | Value |
|---|---|
| **Requested outcome** | Milestone **M15** of [the plan](../plan/unified-ui-web.md) (the plan calls it 0061; the numbers moved by one because 0056 went to a vanished user's 401): behind `?ui=neu`, the QA pass over every view before the switch (M16). **Phone** (Pixel 9, 412×915): the head folds away while the on-screen keyboard is up (m3: the heading and what sits under it fold, the eyebrow stays and names the list; the context chips step aside) and scrolls away with the list as soon as it scrolls; the first section is at most 150 px from the top; at least five Inbox rows stay visible with the keyboard open, also while "In Inbox ✓" is shown; the notice in the dock never covers a row. **WebKit** (Playwright WebKit 18.0 = Safari 18's engine): `color-mix()`, `dvh`, `visualViewport`, `preserve-3d`, the lens's `transmission` cost, `fetch keepalive` (a held done when the page goes away), `localStorage` in a private window or one that refuses site data, font loading. **Accessibility** (plan §5) on every view: axe-core 0 serious or critical, a keyboard-only walk, touch targets ≥ 44 px (≥ 48 px in the dock), 200 % zoom without horizontal scroll, landmarks. **Budgets** re-measured on a production build. What a real device alone can prove is recorded below as open for Uli. Nothing changes for anyone without `?ui=neu`. |
| **Owning unit** | `fe/layout` — `layout/AppFrame.vue` (the phone's keyboard state: the head folds, the chips step aside; what is behind the palette and the `?` sheet is inert while they are open), `layout/PhoneDock.vue` (the chips as a labelled region, "Kontextfilter": `ctx.region` in `shared/messages.de.js`), `layout/lens/lensController.js` (the lens chunk waits for the first contentful paint). `fe/shared` — new `shared/phoneKeyboard.js` (when the on-screen keyboard counts as open); `composables/useMedia.js` (`useKeyboardOpen()`); `composables/useOutbox.js` (a refused storage write leaves the queue in memory until a write goes through again, and strikes what this page settled or took back from the stale stored queue, see Design); new `composables/useModalLayers.js` (the palette and the `?` sheet, and the page behind them inert; from the review). `fe/tasks` — `tasks/components/CaptureLine.vue` (a named form, so a landmark), `tasks/components/ContextBar.vue` (48 px on the phone), `tasks/views/InboxPage.vue`, `tasks/views/NextPage.vue`, `tasks/views/AllPage.vue`, `tasks/views/ReviewPage.vue` (what folds with the keyboard; Rückblick's step buttons 44 px wide). `fe/projects` — `projects/ProjectPage.vue`, `projects/PlanDocument.vue` (targets, fold). `tests` — `phoneKeyboard.test.js`, `useOutbox.test.js`, `useModalLayers.test.js` (new). `docs` — this brief, `build/m15/`. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3–§5; [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (new files only in unit folders; `layout/` imports no feature — the frame marks the head folded by a class, the pages mark what folds with `data-fold`; tests cover logic). |
| **Governed by** | [ADR 0042](../adr/0042-the-new-ui-coexists-behind-a-switch.md) (old side unchanged). [ADR 0007](../adr/0007-frontend-test-scope.md) (pure logic tested, no component mounting; the composable test stubs the browser as `useTheme.test.js` does). |
| **Rule IDs introduced** | **None.** No change to `architecture.toml` or `ops/structure-baseline.toml`: `shared/phoneKeyboard.js` has one importer (`useMedia.js`), and no file gains one (`RULE-ARCH-003` green, 0 hub regressions). |
| **Entry points** | `keyboardOpen()`, `isTextEntry()`, `KEYBOARD_MIN_PX` (`shared/phoneKeyboard.js`); `useKeyboardOpen()` (`composables/useMedia.js`); `useModalLayers()` (`composables/useModalLayers.js`); `useOutbox()` (unchanged signature). |
| **Affected public surfaces** | **None.** No route, no storage key, no API call, no env var. `./run surfaces` stays clean. |
| **Known dependents** | From `./run impact` before the code: `layout/PhoneDock.vue` → `AppFrame.vue` and through it every page of the new UI; `layout/AppFrame.vue` → `SettingsPage.vue`, `ProjectsPage.vue`, `ListFrame.vue`, `ReviewPage.vue`, and through them every route of the new UI (`router/index.js`). `composables/useOutbox.js` → `tasks/stores/gtd.js` and through it every page that writes. `composables/useMedia.js` → `AppFrame.vue`, `ProjectPage.vue`, `CaptureLine.vue`, `InboxPage.vue`, `NextPage.vue`. `tasks/components/CaptureLine.vue` → `ListFrame.vue`; `tasks/components/ContextBar.vue` → `NextPage.vue`. The old UI imports none of these files. |
| **Uncertain / dynamic areas** | **F13** — the index credits no frontend test; protecting tests are named below. **`RISK-TEST-004`** — folding, targets and landmarks are presentation, driven on the harness, not mounted. **No IME emulation exists** in Playwright or Chrome DevTools: the keyboard is simulated by shrinking `visualViewport` by Gboard's 336 px (m3's measure) while the layout viewport keeps its height, which is what Chrome on Android (since 108, `resizes-visual`) and Safari report; the real Gboard on a Pixel 9 and the iOS keyboard are open for Uli. **Playwright WebKit is Safari's engine, not Safari**: it is not iOS Safari, its `page.close()` fires no `pagehide` (probed, below), and Safari 18 on macOS cannot be automated here (`safaridriver` needs a one-time `--enable` with an admin password). |
| **Analogous implementations** | m3 `PageHeader` / `ThumbBar` (README: the heading row hides while the IME is up, on scroll and at font scale ≥ 1.3; chips step aside while the IME is up; the notice in the flow; ≥ 5 Inbox rows with a 336 dp IME, also with the notice); 06 `web.css` `@media (max-width: 760px)`. In this repository `useVisualViewport()` (the frame already sits in the visual viewport, M4), `useTheme.test.js` (a composable tested with stubbed browser globals). |
| **Delivery Pattern** | **New Capability** (QA fixes inside the new UI only; units declared in M0). |
| **Required tests** | New: `frontend/tests/phoneKeyboard.test.js` — a text field with the visual viewport at least `KEYBOARD_MIN_PX` shorter than the layout viewport is a keyboard; no text field, a checkbox or button, a small difference (the URL bar sliding away), or no `visualViewport` is not; `isTextEntry` for input types, `textarea`, `contenteditable`, read-only and disabled fields. `frontend/tests/useOutbox.test.js` — with a storage whose `setItem` throws (a private window that refuses site data), a held done is still sent when its hold ends, a capture is sent at once, and Rückgängig inside the hold still takes it back; with a working storage the queue is written before the request leaves; with a storage that took writes and then fills up, a done taken back and a capture already posted are struck from the stored queue (a fresh start sends neither), and the whole queue is written again once storage takes it. `frontend/tests/useModalLayers.test.js` — the page behind is inert once a layer is up and freed as the last closes, stays inert when the palette hands over to the sheet in one tick ("Tastenkürzel"), and the first focus target is kept. Existing that protect touched code: `outboxQueue.test.js` (the pure queue, unchanged), `commands.test.js`, `strings.test.js` (every `t('…')` literal exists). |
| **Intended scope** | The files above and the fixes the pass finds in the new UI. **Not** in scope: the old UI; a change of the 06 design or the brand (deviations go to Uli as open points with numbers); M16's switch. |
| **Base revision** | `5ce8d7f` (`main`, M14 merged) |

## Design

- **When the keyboard counts as open** (`shared/phoneKeyboard.js`, pure): a text field has the focus *and* the
  visual viewport is at least `KEYBOARD_MIN_PX` (120 px) shorter than the layout viewport
  (`documentElement.clientHeight`). Focus alone is not enough: the phone Inbox focuses its capture field on open
  (M6), and Chrome on Android does not raise the keyboard for a focus nobody tapped — folding the head then would hide
  it for nothing. The difference alone is not enough either: pinch-zoom shrinks the visual viewport too. 120 px is
  above the URL bar's slide (≈ 56 px) and below the smallest phone keyboard (≈ 260 px).
- **The fold** (`AppFrame.vue`, phone only): while the keyboard is open the frame carries `kbd`. The page heading
  (`h1`) is then visually hidden but stays in the accessibility tree, the parts a page marks `data-fold` (the Inbox's
  Liste · Stapel, Nächste's caption and lens box, Alle's Erledigte zeigen, a project's way back and outcome,
  Rückblick's lead) are hidden, the eyebrow stays and names the list, and the dock renders no context chips. `layout/`
  imports no feature: the frame knows only the class and the attribute.
- **On scroll** the head is part of the page's scroll (since M4), so it leaves with the first rows; nothing sticks.
  m3 keeps its eyebrow fixed on Android; on the web the dock's current tab (its dot and `aria-current`) names the list
  instead, and a sticky head would cost the list its height again. Recorded as a deviation.
- **Notice in the dock** (M4/M5): in the layout flow, so it pushes the list up and cannot cover a row; checked on every
  list page with the notice up, with and without the keyboard (`covered` in the harness).
- **Targets and landmarks:** the dock's chips are 48 px buttons (the pill stays 32 px); the capture form is named
  ("Neues Todo"), so it is a landmark and axe's `region` finding goes; the dock's chips sit in a labelled region.
  Rückblick's step buttons, a project's way back and its add fields reach 44 px. "Claude verbinden" is not changed:
  its MCP tabs are 44 px tall on the phone since M14 (`ClaudeSettings.vue`), and its steps' code blocks
  (`<pre tabindex=0>`) are scroll regions, not tap targets (corrected in review).
- **Modal layers make the page behind them inert** (found by this pass): the palette and the `?` sheet are
  `aria-modal`, but the page behind stayed in the accessibility tree, and axe measured the overdue meta of the cursor
  row under the scrim at 4.07:1. While either is open, every other child of the frame is `inert` (set once the layer
  is up; cleared in the same step as it closes, so the focus it gives back can land behind it). The frame marks its
  layers `data-modal`; the palette and the sheet are unchanged. `composables/useModalLayers.js` watches both flags,
  not "a layer is open": the palette's "Tastenkürzel" closes the palette and opens the sheet in one tick, a value
  that is true before and after, so a watcher on it never ran and the sheet opened over a live page (review).
- **The lens chunk waits for the first paint** (found by this pass): an idle callback after the slot's first frame
  came before the first contentful paint on one cold Chrome start, where the GPU held the paint (chunk at 452 ms,
  FCP at 856 ms; plan §5: `three` only after the first paint). `lensController.js` now starts the idle wait once a
  `first-contentful-paint` entry exists (a `PerformanceObserver` on `paint`; where there is none, at once).
- **The outbox in a storage that refuses writes** (found by this pass, see Pre-checks): `mutate()` re-reads
  `localStorage['outbox']` before every change. Where `setItem` throws and `getItem` works (a full quota, Safari's
  old private mode), each change re-read the empty stored queue over the in-memory one, so a held done and a capture
  were never sent, while the notice said "In Inbox ✓". After a refused write the queue now lives in memory and storage is no
  longer re-read over it; every change still tries to write, and the first write that goes through hands storage the
  whole queue again. While writes are refused, the ops this page settled or took back are struck from the queue
  storage still holds (a smaller write, which a full quota takes), so neither the next start nor another tab replays a
  done the user took back or posts a capture twice (review). A reload in such a browser loses only what was not sent
  yet, which is the same as having no storage.

## Where this departs from the plan or the prototype

- **Text fields keep 06's focus**: the caret and the 1 px yellow rule (`--rw-marker` #f4c84a), no focus box. The
  focus is visible (the caret), but the rule on the paper is 1.45:1 — below the 3:1 a focus indicator should have
  (WCAG 1.4.11 / 2.4.13). A brand question, not changed here: Open points.
- **No sticky eyebrow on scroll** (above).
- **No font-scale fold:** m3 folds the heading at font scale ≥ 1.3; the web's type is in px and does not follow
  Android's font scale, so there is nothing to detect. 200 % browser zoom is checked instead (plan §5).

## Open points

- **Budgets: all met** (Pre-checks), none needs Uli's approval. The entry is 129.84 of 130 kB gzip: M16 has 0.16 kB
  of headroom, so anything it adds to the entry needs a lazy chunk or Uli's decision on the budget.
- **For Uli, a design call:** the text fields' focus rule (yellow on paper, 1.45:1; above). Keep 06's look, or a 2 px
  rule in ink or plum while focused.
- **Outside this milestone, both UIs:** with site data blocked entirely (Safari "Block all cookies": `localStorage`
  itself throws), the app shows an empty page — `stores/auth.js` reads `localStorage` unguarded at start (and
  `api/client.js`, `router/index.js`). It is shared with the old UI, which must not change before M16; a session needs
  storage for its token anyway. A Bug Fix after M16 (or with M17's contract step).
- **For Uli on a real device** (none can be proven here): Gboard on the Pixel 9 (the fold, ≥ 5 Inbox rows with the
  keyboard up, the dock above the keyboard); iOS Safari (the visual viewport while the keyboard is up, `dvh`, the
  safe-area insets, the dock); Safari 18 on macOS (closing a tab during a 6 s hold: the server should get the done —
  Playwright WebKit cannot fire `pagehide` on close); a private window in Safari; VoiceOver on the palette (the page
  behind it inert).

## Pre-checks

- **Before the code:** `make check` GREEN on `5ce8d7f` (725 tests). `./run map` → `layout/PhoneDock.vue` and
  `layout/AppFrame.vue` in `fe/layout`; `./run impact` on both (dependents above); `./run impact` on `useOutbox.js`,
  `useMedia.js`, `CaptureLine.vue`, `ContextBar.vue`.
- **Measured before the code** (harness: own backend on :8065, Vite on :5265, the 06 demo set, a user with eleven
  Inbox todos; Pixel 9 412×915 @2x, Chrome 157 and Playwright WebKit 18.0):
  - phone Inbox list, keyboard up (336 px): 5 full rows, **4 with "In Inbox ✓"** (m3 asks 5); the heading and Liste ·
    Stapel stay; Nächste with the keyboard: 4 full rows, the chips (100 px) stay in the dock.
  - first section / first row from the top at rest: Inbox 135, Nächste 70, Warten auf 79, Irgendwann 79, Alle 143 (≤ 150).
  - axe-core 4.10.2: 0 serious or critical on all eleven views × desktop/narrow/phone × light/dark (Chrome) and
    desktop/phone (WebKit); moderate `region` on the capture field and the dock's chips.
  - touch targets below the kit: the dock's chips 44 px (48 asked), Rückblick's step buttons 38 px wide, a project's
    "← Projekte" 32 px and its add fields 40 px, the "Claude verbinden" steps and MCP tabs 40–41 px (review: the tabs' 44 px phone rule is
    M14's, unchanged here, so the 40–41 px are the steps' code blocks — scroll regions, not tap targets, left as they are).
  - **storage that refuses writes: no write at all reached the server** (a tick, a capture; Chrome and WebKit) — the
    outbox defect above.
  - `fetch keepalive`: Chrome closes a tab during a hold and the server has the done 135 ms later; in WebKit
    navigating away (`pagehide`) and hiding the tab send it (34 ms, 446 ms); WebKit's `page.close()` fires no
    `pagehide` at all (probed with a bare page), so the close itself is open for Uli.
  - fonts: three files (Space Grotesk, JetBrains Mono, Fraunces 300 italic), 95.5 kB, only Space Grotesk preloaded; under
    `vite preview` (`Cache-Control: no-cache`) WebKit fetched Space Grotesk twice, under nginx's headers (ETag, no
    `Cache-Control`, as `frontend/nginx.conf`) once.
  - budgets on `vite build`: entry JS 129.18 kB gzip (≤ 130), CSS 13.50 kB gzip (≤ 20), lens chunk 122.22 kB gzip (≤ 180).
- **After the code** (same harness; every number and shot in
  [`build/m15/README.md`](../design/2026-10-31-unified-ui/build/m15/README.md)):
  - **Phone, keyboard up:** Inbox (list) 7 full rows, **6 with "In Inbox ✓"**, first row at 34 px; Nächste 5 full rows (4
    before), no chips; Alle, Irgendwann, Warten auf: first section at 34 px. A focused field without the keyboard (the Inbox on
    open) folds nothing. No row under the notice on any list page (`covered = false`). The same in WebKit.
  - **Storage that refuses writes:** the tick's `POST /tasks/{uuid}/done` and the capture's `POST /inbox` reach the
    server (Chrome and WebKit); `useOutbox.test.js` fails 3 of 4 without the fix.
  - **axe-core 4.10.2:** 0 serious or critical in 88 view states (11 views with the stack and login × desktop/narrow/
    phone × light/dark in Chrome, desktop/phone in WebKit), in the layers (detail, palette, `?` sheet, "···", clarify,
    stack, Heute on the phone; both engines) and in the 82 shot states; the moderate `region` finding is gone.
  - **Keyboard walk:** every page cycles (no trap), every stop has the focus ring but the text fields (above); palette
    and sheet give the focus back on Esc, a scrim click, ⌘K ⌘K, `?` → ⌘K → Esc. **Targets:** all ≥ 44 px, the dock's
    ≥ 48 px, except an inline link in running text and Einstellungen's scrollable code blocks (not tap targets).
    **200 % zoom:** no horizontal scroll on any view, both engines.
  - **WebKit:** `color-mix()`, `dvh`, `visualViewport`, `preserve-3d`, container queries, `:has()`, `inert`,
    `keepalive` supported and in effect; the lens 54 frames per planned tick, render max 4 ms per frame, 0 idle;
    fonts loaded once under nginx's headers.
  - **Budgets** (`vite build`): entry JS **129.84 kB** gzip (≤ 130), entry CSS 13.54 kB (≤ 20), lens chunk 122.22 kB
    (≤ 180), fonts 3 files 95.5 kB (≤ 160, Space Grotesk preloaded); lens chunk at 81–108 ms after FCP 48–56 ms, never
    on the phone or the Inbox list, and after FCP also with the CPU throttled 6× and 20×; 0 idle frames, 53–54 per
    planned completion, ≤ 1 canvas (0 on the phone and the Inbox list); tick → struck and out of the accessibility
    tree 36–59 ms, out of the list 318–323 ms; 5 snapshot requests at boot, none more on focus/visibility within 30 s.
  - **Tests:** vitest 725 → 742 (45 files; new `phoneKeyboard.test.js` 7, `useOutbox.test.js` 7, `useModalLayers.test.js` 3). `make check` GREEN.
  - **Gates:** `./run surfaces` clean (no route, storage key or API change); `./run violations` — only `CYCLE-001`,
    `CYCLE-002`; `RULE-ARCH-003` green without a baseline change. **The old UI is untouched:** `git diff --stat
    5ce8d7f` over `components/`, `views/`, `stores/`, `router/`, `api/`, `App.vue`, `index.html` is empty;
    `old-next-unchanged.png`.
  - **Shots:** [`build/m15/`](../design/2026-10-31-unified-ui/build/m15/README.md) — every view × desktop light/dark,
    narrow, phone light/dark, WebKit desktop and phone (70), the login page (3), the keyboard states (5), the notice in
    the dock, the palette, reduced motion, 200 % zoom, and the old UI (2): 84 files.
- **Review** (2026-11-11, seven findings, each checked against the code and the shots):
  - **Fixed — the `?` sheet opened from the palette left the page live.** Confirmed: `CommandPalette.run` closes,
    then runs "Tastenkürzel", which opens the sheet in the same tick; the watcher on `palette || sheet` saw true
    before and after and never set `inert`. Now `useModalLayers.js` watches both flags; `useModalLayers.test.js`
    covers the hand-over. No look changes, so no shot is re-taken.
  - **Fixed — a stale stored queue after a refused write** (three findings, one defect). Confirmed: once `setItem`
    threw, `save()` never wrote again, so storage kept the last queue it took, and the next start or another tab could
    send a done the user took back or post a capture again. Now every change tries to write, and while writes are
    refused the ops this page settled or took back are struck from the stored queue (Design). The three new cases in
    `useOutbox.test.js` fail without the fix and pass with it.
  - **Fixed — the dock's region and the chips' group were both named "Kontext".** The region is now
    "Kontextfilter" (`ctx.region`), so a screen reader no longer says the name twice.
  - **Corrected in the text — "Claude verbinden" at 44 px.** No M15 code touches it: its MCP tabs are 44 px on the
    phone since M14, and its steps' code blocks are scroll regions (Design, Measured before).
  - **Corrected in the text — Nächste with the keyboard up shows 5 full rows, not 6** (`next-kbd-phone-light`: the 6th
    is cut by the dock); README and this brief now say 5 (4 before). The Inbox's 7 and 6 match their shots.
  - After the fixes: vitest 742 green, `make check` and `make verify` GREEN (the container tier skipped: Docker is
    not running here, RISK-TEST-001; CI runs it).
