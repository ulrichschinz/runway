# Change Impact Brief 0059 — The margin column

| Field | Value |
|---|---|
| **Requested outcome** | Milestone **M12** of [the plan](../plan/unified-ui-web.md) (the plan calls it 0058; the numbers moved by one because 0056 went to a vanished user's 401): behind `?ui=neu`, the margin column on wide screens (> 1180 px) carries 06's four panels on every page — **Heute** (`// Heute · Dienstag, 10. November`; the 72 px Tageslinse with "3 von 7" and "geplant und erledigt · 1 zusätzlich", then today's done todos struck through with their time; on Nächste only the struck-through list, so "3 von 7" appears once per screen), **Nachhaken** (`// Nachhaken · 1 heute`: up to three waiting todos whose follow-up day has come or comes this week, the due ones first with the yellow ring; a click opens the todo; left out on Warten auf, which shows the same), **Projekte** (stalled active projects with the yellow ring, linking to the project, or "Alle N aktiven Projekte haben eine nächste Aktion.") and **Rückblick** (the last weekly review and how long ago; "Rückblick beginnen `g` `r`" once it is due). On the phone the same panels sit in the Mehr sheet. The lens box in the Nächste head becomes a button ("Tagesübersicht öffnen", 06 `data-act="today"`) that opens Heute as the page's panel: the margin column on wide screens, the docked panel at 761–1180 px, the sheet on the phone. Nothing changes for anyone without `?ui=neu`. |
| **Owning unit** | `fe/tasks` — new `tasks/panels/MarginPanels.vue`, `TodayPanel.vue`, `WaitingPanel.vue`, `ProjectsPanel.vue`, `ReviewPanel.vue`, `PanelSection.vue`; `tasks/stores/gtd.js` (`followUps`, `reviewAge`); `tasks/components/ListFrame.vue` (the margin slot, the Heute panel); `tasks/views/NextPage.vue` (the lens box as a button). `fe/layout` — `layout/AppFrame.vue` (the margin slot goes into the Mehr sheet on the phone; the `?` sheet becomes a chunk of its own), `layout/PhoneDock.vue` (forwards the panels; the Mehr sheet becomes a chunk of its own), `layout/MoreSheet.vue` (a `panels` slot), `layout/ComingPage.vue` (the margin slot), `layout/MarginColumn.vue` (doc). `fe/shared` — `shared/sections.js` (`followUps`), `shared/gtdRules.js` (`reviewAge`), `shared/dates.js` (`longDay`), `shared/messages.de.js`, `composables/useFrame.js` (the frame carries the margin). `fe/app` — `router/NewUiHost.vue` (provides the panels as a lazy component). `tests` — `sections.test.js`, `gtdRules.test.js`, `dates.test.js`. `docs` — this brief, `build/m12/`. `ops` — `ops/structure-baseline.toml` (two raises, below). |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3–§5; [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (new files only in unit folders; `layout/` imports no feature; tests cover logic). |
| **Governed by** | [ADR 0042](../adr/0042-the-new-ui-coexists-behind-a-switch.md) (old side unchanged). [ADR 0007](../adr/0007-frontend-test-scope.md) (pure logic tested, no component mounting). |
| **Rule IDs introduced** | **None.** `ops/structure-baseline.toml` raises two recorded fan-in values (`RULE-ARCH-003`), each approved by the owner (RISK-GOV-001: not an independent approval) and justified in a dated comment: `shared/dates.js` 7 → 8 (Heute's long day and the time a todo was done, in the server's zone) and `layout/ui/EyebrowLine.vue` 6 → 7 (`PanelSection.vue`, the one eyebrow of all four panels). |
| **Entry points** | `followUps()` (`shared/sections.js`), `reviewAge()` (`shared/gtdRules.js`), `longDay()` (`shared/dates.js`); the store's `followUps` and `reviewAge`; `MarginPanels.vue` (props `view`), provided to every page as `frame.margin`; ListFrame's exposed `toggleToday`. |
| **Affected public surfaces** | **None.** No route, no storage key, no API call (the panels read the snapshot the store already loads: `/gtd/summary`'s `last_review`, `/gtd/waiting`, `completed_since`, `/gtd/projects/overview`). |
| **Known dependents** | From `./run impact` before the code: `layout/MarginColumn.vue` → `AppFrame.vue` → `ComingPage.vue`, `ListFrame.vue`, the five list pages, `router/index.js`; `tasks/stores/gtd.js` → `NewUiHost.vue`, `CaptureLine`, `CardStack`, `ListFrame`, `TaskDetail`, `useCardStack`, `useClarify`, `useListPage`, `useTaskSearch`, every list page, `StoreDebugPage` (→ `App.vue`, `main.js`, `router/index.js`): the store gains two computed values and nothing else changes. Added during the work: see Pre-checks. |
| **Uncertain / dynamic areas** | **`BLIND-FE-002` (F14)** — `NewUiHost.vue` reaches `MarginPanels.vue` only through `import()` (a lazy chunk, for the entry budget: 129.7 of 130 kB gzip after M11), so the index records the edge as UNKNOWN and `./run impact` on the panels names no dependent; their one user is `NewUiHost.vue`, which hands them to every page as `frame.margin`. The same holds, for the same budget, for `layout/ShortcutsSheet.vue` (reached from `AppFrame.vue`) and `layout/MoreSheet.vue` (from `PhoneDock.vue`): after this change `./run impact` names no dependent for either. **F13** — the index credits no frontend test; protecting tests are named below. `RISK-TEST-004` — the panels are presentation over tested rules; they are driven on the harness, not mounted in tests. |
| **Analogous implementations** | `06-kombination/web.js` `todayPanel` (Heute, Nachhaken, Projekte, Rückblick), `renderMargin` (which panel the margin shows), `renderHead('next')`'s lens box (`data-act="today"`, `lens.aria`); `web.css` `.margin .msec`, `.mrow`, `.mnote`, `.mhead`, `.mclose`; `combo.css` `.lensline`, `.lensread`; `base.css` `.donelist`, `.ring-mark`. In this repository `tasks/views/InboxPage.vue` (the page's own panel in ListFrame's `panel` slot) and `ListFrame.vue`'s lazy `TaskDetail`. |
| **Delivery Pattern** | **New Capability** (units declared in M0). |
| **Required tests** | Extended: `sections.test.js` — `followUps`: due first, then this week, at most three, later or undated ones never, the count of due ones, a `wait` counts as the follow-up day; `gtdRules.test.js` — `reviewAge`: never, today, days ago across a DST night, due from seven days; `dates.test.js` — `longDay`: weekday and month written out, the server's calendar day. Existing that protect touched code: `sections.test.js`, `gtdRules.test.js`, `dates.test.js`, `dayProgress.test.js` (the caption's numbers), `strings.test.js` (new keys are text, no `+N`), `commands.test.js` (`g r`, `Esc`). The plan names no test for the panels themselves ("presentation over tested rules"); the three pure rules they needed are tested. |
| **Intended scope** | The files above. **Not** in scope: 06's "Geklärt" log on the empty Inbox (the plan's M12 list does not name it, and the store keeps no such log), the rail's 14 px ring, the project plan in the margin (M13), the Rückblick page (M14), the old UI. |
| **Base revision** | `515f4b1` (`main`, M11 merged) |

## Design

- **One component, every page.** `tasks/panels/MarginPanels.vue` stacks the four panels; each is a `PanelSection`
  (eyebrow + body). The composition root (`router/NewUiHost.vue`) provides it as `frame.margin`, loaded lazily, so a
  page in any unit (Projekte and Einstellungen in `fe/projects` and `fe/identity` come in M13/M14 and may not import
  `fe/tasks`) fills `AppFrame`'s `margin` slot with `<component :is="frame.margin" :view>` without importing a feature.
- **Which page shows what** (06 `todayPanel`): Heute everywhere; its lens and "3 von 7" everywhere except Nächste (its
  head has them); Nachhaken everywhere except Warten auf; while the `/` search is on, the page's head steps aside, so
  the margin counts as on no page (the lens and Nachhaken come back).
- **The phone** (≤ 760 px): `AppFrame` hands its `margin` slot to the dock, and the Mehr sheet shows the panels under its
  entries; a link or button in them closes the sheet. The lens there is the flat SVG (no canvas on the phone, D5).
- **761–1180 px:** there is no margin column; the lens box in the Nächste head opens Heute as the docked panel (06's
  `ui.today`), `Esc` or "schließen" closes it and the focus goes back to the lens box.
- **One canvas.** The margin's 72 px `LensSlot` is the slot the controller (M11) gives the WebGL canvas on every wide page
  but Nächste; a bead from a planned tick on another page flies into it. Nothing changes in the controller.
- **The rules stay shared:** Nachhaken uses Warten auf's split (`waitingSections` → `followUps`), Rückblick the same day
  rule as the rail's ring (`reviewDue` → `reviewAge`), Heute the store's `progress` and `doneToday`.
- **The entry budget.** The panels added 0.9 kB gzip to the entry even as a chunk (the slots, the lens button, the store's
  two values, the rules): 130.6 kB against 130. The `?` sheet and the Mehr sheet, both shown only on demand, became chunks
  of their own (0.95 + 0.8 kB and 1.7 + 0.8 kB gzip), as M10 and M11 did with the card stack and the detail: 129.5 kB.
  All three chunks (the `?` sheet, the Mehr sheet, the panels) are fetched in idle time once the frame is up, so `?`
  and "···" still open after the connection drops or a redeploy replaced the hashed chunks. The palette (⌘K, typed into
  at once) stays in the entry.

## Where this departs from the plan or the prototype

- **Mehr sheet order:** the panels come after the sheet's entries and before the colour scheme, so the menu that opens
  from "···" still starts with what it had.
- **06's "nicht gesendet" section** at the top of Heute is not repeated: the rail (M4) and the Mehr sheet already carry
  the outbox line with "Erneut senden".
- **Day labels** in Nachhaken are the rows' (`Di 03.11.`, `seit Fr 30.10.`) rather than 06's bare `30.10.`.
- **Lens size in the Mehr sheet:** 72 px as in the margin, not 06's 64 px; the sheet is wide enough, and one size means
  no per-device prop.

## Open points

- **761–1180 px** shows the panels only through Nächste's lens box; the other pages there have no way to Heute,
  Nachhaken, Projekte or Rückblick (as in 06). M15's phone and narrow pass can add one if Uli wants it.
- **Entry budget headroom:** 129.85 kB gzip against 130 kB. M13 and M14 add whole pages; they will need a lazy chunk per page
  or a decision on the budget.
- **Inbox in Liste mode** shows no "3 von 7" while it has items (the clarify panel takes the margin's place, as in 06); the
  acceptance's "exactly once per screen" is read as "once wherever the margin shows".
- `make verify` container tier: skipped locally, Docker is not running (`RISK-TEST-001`); CI runs it.

## Pre-checks

- **Before the code:** `make check` GREEN on `ui/m12-margin-column` at `515f4b1`. `./run map` and `./run impact` on
  `frontend/src/layout/MarginColumn.vue` (unit `fe/layout`; dependents above) and `frontend/src/tasks/stores/gtd.js`
  (unit `fe/tasks`); `./run map frontend/src/tasks/panels/TodayPanel.vue` before it existed (no match; the unit's glob
  `frontend/src/tasks/**` covers it); `./run brief --paths` for both.

- **After it**, `./run map` puts `tasks/panels/*.vue` in `fe/tasks` as intended. `./run impact` on the touched rules:
  `shared/sections.js` → `dayProgress.js`, `rowMeta.js`, `gtd.js`, `WaitingPage.vue` (an added export; nothing else
  changed); `shared/dates.js` → seven shared modules, `gtd.js` and now `tasks/panels/TodayPanel.vue` (an added export);
  `layout/PhoneDock.vue` → `AppFrame.vue`; `tasks/views/NextPage.vue` → `router/index.js`. `MoreSheet.vue`,
  `ShortcutsSheet.vue` and `MarginPanels.vue` show no dependents (`BLIND-FE-002`, above).
- **Fan-in (`RULE-ARCH-003`):** red for exactly the two values this brief names (`dates.js` 8, `EyebrowLine.vue` 7); both
  raised in `ops/structure-baseline.toml` with dated comments. `useFrame.js` 3 → 4, `useBeadFlight.js` 3 → 4 (at the cap).
- **Tests:** vitest 637 → 646 (35 files; `sections.test.js` +4, `gtdRules.test.js` +4, `dates.test.js` +1). `make check`
  GREEN (after `make fix` rebuilt the index). `./run surfaces` clean: no route, storage key or API change.
- **The old UI** is untouched: `git diff --stat 515f4b1` over `components/`, `views/`, `stores/`, `router/index.js`,
  `App.vue` is empty.
- **Budgets** (`vite build`, after the review fixes): entry JS 129.85 kB gzip (≤ 130), CSS 13.7 kB gzip (≤ 20), margin
  panels 1.7 + 0.8 kB, Mehr sheet 1.7 + 0.8 kB, `?` sheet 0.95 + 0.8 kB gzip.
- **Acceptance on the harness** (M11's backend on :8031 and Vite on :5197, the 06 demo set with 06's day plan and its due
  follow-up; every number in [`build/m12/README.md`](../design/2026-10-31-unified-ui/build/m12/README.md)): "3 von 7"
  once on every view where the margin shows (desktop, narrow with Heute open, phone with Mehr or Heute open), 0 on the
  Inbox in Liste mode; at most one canvas everywhere; a planned tick on Alle flies its bead into the margin's lens
  (55 frames, "3 von 7" → "4 von 7" on landing); the follow-up, project and Rückblick links; the lens box at 1024 px and on
  the phone, `Esc` and the scrim closing it with the focus back on the box.
- **Accessibility:** axe-core 4.10.2: 0 serious or critical issues in all eighteen shot states; the lens stays
  `aria-hidden`, the lens box is a button named by the caption and "Tagesübersicht öffnen" with `aria-expanded`; Tab
  reaches every link in the margin, nothing traps; 200 % zoom at 1440 px: no horizontal scroll.
- **Shots:** `build/m12/` — `web-desktop-{light,dark}`, `margin-someday-desktop-{light,dark}`, `margin-waiting-desktop-light`,
  `margin-review-desktop-light`, `margin-reduced-desktop-{light,dark}`, `today-narrow-{light,dark}`,
  `web-phone-more-{light,dark}`, `web-phone-today-{light,dark}`, WebKit desktop and phone, `margin-zoom200-light`,
  `margin-bead-desktop-light`. Compared with 06's `web-desktop` and `web-dark`; deviations above and in the README.
- **Review (2026-11-11), eleven findings, all verified against the code:**
  - *Fixed:* a plain `Esc` on Nächste with nothing open moved the focus to the lens box (and a following `Enter` opened
    Heute instead of the cursor row; three findings, one defect). `ListFrame` now emits `closePanel` with `{ today }`
    and NextPage refocuses the lens box only when Heute was open.
  - *Fixed:* Heute in the phone sheet did not close on `Esc` (the sheet is a `role="dialog"`, where the page's keys
    rest; two findings). The Heute panel handles `@keydown.esc.stop` itself, as TaskDetail does.
  - *Fixed:* the lens box clicked while a detail was open set `aria-expanded` without showing Heute, and Heute popped up
    once the detail closed. `toggleToday()` now closes the detail and opens Heute at once; a detail that opens takes
    Heute's place for good; "schließen" takes the focus once it is rendered.
  - *Fixed:* a Nachhaken row opened the detail without the focus, and closing it dropped the focus to `<body>`.
    `ListFrame` provides the margin a `frame.openTask` that arrives with the focus (as a row's `Enter`) and, on closing,
    returns it to the margin row (`data-follow`), on the phone to "···" (`data-more`).
  - *Fixed:* the lazy Mehr sheet, `?` sheet and margin panels failed offline or after a redeploy if not yet opened (two
    findings). Each chunk is now prefetched in idle time once the frame is up (`requestIdleCallback`, else 200 ms);
    the budget does not allow moving the Mehr sheet back into the entry.
  - *Fixed:* "vor 1 Tagen." `reviewAgoKey()` (`shared/gtdRules.js`) picks ", heute." / ", gestern." / ", vor n Tagen.";
    `gtdRules.test.js` +1 (vitest 645 → 646).
  - *Fixed:* the Nächste head broke at 1024 px with Heute docked (eyebrow, heading and chips wrapped). The head is a size
    container; below 560 px the caption goes under the lens. `today-narrow-{light,dark}` re-shot on the harness: the
    eyebrow and "Was jetzt zählt" on one line each.
  - *Rejected:* none.
  - After the fixes: vitest 646 green, `make fix` (index), `make check` GREEN, `make verify` GREEN (container tier
    skipped, Docker not running, `RISK-TEST-001`).
