# Change Impact Brief 0057 — The card stack

| Field | Value |
|---|---|
| **Requested outcome** | Milestone **M10** of [the plan](../plan/unified-ui-web.md) (the plan calls it 0056; that number went to another change): behind `?ui=neu`, the Inbox can be cleared as 06's card stack — the touch Klären mode, and an optional mode on desktop. The top card shows the item with when it was captured, its first note (up to four lines) and its project; five trays below it, Nächste · Warten auf · Irgendwann · Erledigt · Löschen (keys `1`–`5`), take it. A tray that needs one more answer turns into that answer (the contexts for Nächste, the follow-up days for Warten auf, the projects and then the first action's context for `p`, with "Neues Projekt" as the last one); Zurück, `0`, `Esc` or `⌫` go back a step. The card is dragged or flicked into a tray with a finger or a mouse, or a tray is tapped; `e` edits the text on the card, `→` skips it. Rückgängig brings the card back out of its tray. "Liste · Stapel" in the Inbox head (and `s`, and the palette) switches the mode, remembered per browser in `localStorage['inboxMode']`; a browser that never chose starts with the stack on a touch screen or at ≤ 760 px and with the list elsewhere. The same store action as the clarify panel files the item. Nothing changes for anyone without `?ui=neu`. |
| **Owning unit** | `fe/tasks` — new `tasks/components/CardStack.vue`, `tasks/components/StackTrays.vue`, `tasks/useCardSpring.js` (port of `06-kombination/card.js`), `tasks/useCardStack.js` (the stack's order, step and trays over `useClarify`); `tasks/views/InboxPage.vue` (the two modes, the mode toggle, the stack's keys and palette offers; loads `CardStack.vue` lazily); `tasks/components/ClarifyPanel.vue` (its key hints name `s Stapel`, as 06's do); `tasks/useClarify.js` (exposes the `sources` its steps already used; a capture the server has just named keeps its open question); `tasks/stores/gtd.js` (Inbox ties broken by uuid; `uuidNow`, a capture's server uuid for its `local:…` one, recorded when the capture settles); `shared/outboxQueue.js` (`localUuid` exported, unchanged); `tasks/components/ListFrame.vue` (one optional prop, `captureFocus`, default unchanged: the phone Inbox in stack mode does not focus the capture field, which would raise the keyboard over the card). `fe/shared` — new `shared/stackSteps.js` (the pure step machine, the stack's order), `shared/inboxMode.js` (the remembered mode and the device default); `shared/gestures.js` (`trayAt`: which tray a drop or a flick lands in — the tray under the point, else the nearest); `shared/commands.js` (the stack's commands and scopes, `s` for the mode, `→` named in the sheet); keys in `messages.de.js`; `shared/i18n.js` (one new export, `hasText`, so a context tray shows 06's `ctxhint.*` only where the catalogue has one). `tests` — `stackSteps.test.js`, `inboxMode.test.js` (new), `gestures.test.js`, `commands.test.js`. `ops` — `ops/surfaces/spa.json` gains the storage key `inboxMode`. `docs` — this brief, `build/m10/`. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3–§5; [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (new files only in unit folders; tests cover logic; storage keys as literals in `.js` files). |
| **Governed by** | [ADR 0042](../adr/0042-the-new-ui-coexists-behind-a-switch.md) (old side unchanged). [ADR 0007](../adr/0007-frontend-test-scope.md) (pure logic tested, no component mounting). |
| **Rule IDs introduced** | **None.** No change to `architecture.toml`. **`ops/structure-baseline.toml` gains one `[hubs]` line** (`RULE-ARCH-003`, approved by the owner, `RISK-GOV-001`: not an independent approval), with a dated comment: `shared/detailFields.js` = 5 (the card stack's `e` sends exactly the detail's text edit through `fieldEdit`, not a second copy of the rule). `shared/rowMeta.js` would have been the second; the stack receives the capture time as a prop instead. |
| **Entry points** | `stackTrays()`, `stackPick()`, `stackKey()`, `stackOrder()`, `returnedCards()`, `stackQuestion()`, `trayName()`, `needsStep()`, `trayOfFiling()` (`shared/stackSteps.js`); `defaultInboxMode()`, `resolveInboxMode()`, `readInboxMode()`, `writeInboxMode()` (`shared/inboxMode.js`); `trayAt()` (`shared/gestures.js`); `createCardSpring()`, `cardFrames()` (`tasks/useCardSpring.js`); `useCardStack()`; the `inbox.mode`, `tray.*` and `stack.*` rows of `COMMANDS`. |
| **Affected public surfaces** | **One storage key**, `inboxMode` (`'list'` \| `'stack'`), added to `ops/surfaces/spa.json` with `./run surfaces --update` (plan M10 names it). No route, no API call, no env var. |
| **Known dependents** | From `./run impact` before the code: `tasks/components/ClarifyPanel.vue` → `tasks/views/InboxPage.vue` → the router; `tasks/stores/gtd.js` → thirteen files of `fe/tasks` and `router/NewUiHost.vue`. **The store's actions are not changed**: the stack files through `useClarify` and the list page's `leave`, exactly as the panel does. Its Inbox order gains a tie-break (same-second captures by uuid), so the reply to a text edit no longer reshuffles them — found on the harness, where the edited top card dropped under another one captured in the same second; the list mode had the same jump. `shared/commands.js` → `useKeymap.js`, `useCommands.js`, `useListPage.js` and through them the frame, palette, sheet and list pages: new rows and scopes only, every existing key resolves as before. Added during acceptance: `./run impact tasks/components/ListFrame.vue` → `AllPage`, `InboxPage`, `NextPage`, `SomedayPage`, `WaitingPage` (→ router, `main.js`): only `InboxPage` passes the new prop, the others keep the default, so their capture field behaves as before (probed: Nächste on the phone focuses nothing, the Inbox list focuses the field). `./run impact shared/i18n.js` → every new-UI file that shows text: an added export only, `t()` unchanged. |
| **Uncertain / dynamic areas** | **F13** — the index credits no frontend test; protecting tests are named below. `RISK-TEST-004` — the card's springs, the drag and flick, and the trays' rendering are not unit-tested by construction; the pure parts (steps, order, tray hit test, mode) are, and the rest is driven on the harness and recorded below. **`BLIND-FE-002`** — `InboxPage.vue` loads `CardStack.vue` with a dynamic `import()` (entry budget, below), so the index records that edge as UNKNOWN and `./run impact tasks/components/CardStack.vue` names no dependent; its one user is `InboxPage.vue`. |
| **Analogous implementations** | `06-kombination/card.js` (springs, flight, `into`, `rise`, `hold`, `returnFrom`), `stack.js` (`TRAYS`, `stepOptions`, `act`, `answer`, `cancel`, `skip`, `edit`, `trayAt`, the pointer handlers, `returnCard`), `web.js` (`toggleMode`, the Inbox head's `.modes`, `fileFromStack`), `combo.css` (`.stack-*`, `.under`, `.face-*`, `.tray*`, the phone block); in this repository `tasks/useClarify.js` and `ClarifyPanel.vue` (M8) and `tasks/useSwipe.js` (pointer capture). |
| **Delivery Pattern** | **New Capability** (units declared in M0). |
| **Required tests** | New: `frontend/tests/stackSteps.test.js` — the pure step machine: each tray → its answer → the payload the store sends (`clarifyPayload`), the trays of every step (keys, Zurück, "Neues Projekt" last, at most eight keyed projects), back from each step, keys (`1`–`5`, `p`, digits in a step, `0` / `Esc` / `⌫`, `n` for a new project), skip and pin order, `NeedsAnswer` → the step that asks it. `frontend/tests/inboxMode.test.js` — default by device, stored choice wins, noise ignored, refusing storage. Extended: `gestures.test.js` (`trayAt`: inside, margin, a drop over a tray while the hand still moves, nothing, a flick towards a tray), `commands.test.js` (the stack's keys resolve in their scopes, `s` toggles the mode on the Inbox and still starts elsewhere, the palette reaches every new key action, the sheet lists the stack). Existing that protect touched code: `clarify.test.js` (the steps the stack shares), `strings.test.js`, `uiFlag.test.js`. |
| **Intended scope** | The files above. **Not** in scope: the Tageslinse and margin panels (M11, M12), the phone polish and WebKit pass (M15), the old UI. |
| **Base revision** | `8c2359e` (`main`, M9 merged) |

## Design

- **One filing path, two faces.** The stack and the clarify panel share `useClarify`: the same step state
  (`shared/clarify.js`), the same `gtd.clarify(uuid, to, opts)`, the same `leave` of the list page (notice,
  Rückgängig). In list mode the item is the cursor row; in stack mode it is the top card. `shared/stackSteps.js`
  only says which trays a step shows and what a tray or a key means; it delegates every answer to `pickChoice`.
- **Write first, then fly.** The store is written when the tray is chosen (key, tap, drop); the card that leaves is a
  copy that flies into its tray while the next card rises — so no input ever waits for an animation and a page left
  mid-flight loses nothing (06 committed on landing and had to `finishNow` on every input).
- **Springs on DOM** (`useCardSpring.js`, 06 `card.js` unchanged in its physics): one CSS transform on the card,
  frames only while something moves, none at rest (the transform is removed, so text renders on whole pixels),
  stopped while the page is hidden. Reduced motion: nothing animates, the card simply changes.
- **Rückgängig** from the notice, `z` or the palette: the item is back in the Inbox; the stack puts it on top and it
  flies back out of the tray it went into — also after the last card emptied the Inbox (the stack's history is kept
  until the mode changes or a search replaces the stack).
- **The card being worked on stays on top.** A capture from the phone, MCP or a webhook, brought in by a refresh, goes
  under it; so an open step, a drag or an edit never lands on a card that took its place. A capture of this tab that the
  server names while it is on top (or skipped, or filed) is followed to its server uuid (`uuidNow`).
- **Keys** live in the one command table: `1`–`5` (also `x` and `Entf` for Erledigt and Löschen), `p`, `e`, `→`/`l`
  while the stack is shown and no step is open; the open step's digits (`step.*`), `0`/`⌫` (`stack.back`) and `Esc`
  while one is; `s` on the Inbox for the mode. The palette offers the trays, Projekt, Text ändern, Überspringen and
  "Inbox als Stapel/Liste".

## Where this departs from the plan or the prototype

- **"Capture source"**: the API records none (no field, no tag), so the card shows when it was captured, its first
  note and its project — nothing invented; it shows no tags (06's card shows none either).
- **More than five contexts or eight projects**: every one gets a tray; the first ones carry the keys (06 cut the list).
- **The drop**: a card let go over a tray lands in it however fast the hand still moved (06 looked only 0.12 s ahead and
  could carry a moving drop past its tray — seen once in WebKit on the harness).
- **The edit**: a click outside the text saves it, like the detail's title (06: only Enter).
- **Lazy**: the card, its springs and the trays are a chunk of their own, loaded when the stack is first shown.

## Open points

- **Entry budget headroom**: the entry JS is 129.2 kB gzip against the plan's 130 kB while both UIs ship (M9: 124.6). M11's
  lens is planned as a lazy chunk; M12–M14 will need the same care or a decision on the budget.
- `make verify` GREEN locally except its container tier, skipped: Docker is not running here (`RISK-TEST-001`); CI runs it.
- **Pending for Uli** (none blocks the milestone): the stack on a real phone (Pixel 9, an iPhone) — a real finger, the
  on-screen keyboard over the name field; the plan's §10 live-data steps.

## Pre-checks

- **Before the code:** `make check` GREEN on `ui/m10-card-stack` at `8c2359e`. `./run impact` on
  `tasks/components/ClarifyPanel.vue` (→ `InboxPage.vue`, router, `main.js`) and `tasks/stores/gtd.js` (thirteen
  direct dependents in `fe/tasks`, `router/NewUiHost.vue`); `./run brief --paths` for the four touched paths.

- **After it**, `./run map` puts the new files where intended: `shared/stackSteps.js` and `shared/inboxMode.js` in
  `fe/shared`; `tasks/useCardSpring.js`, `tasks/useCardStack.js`, `tasks/components/CardStack.vue` and
  `tasks/components/StackTrays.vue` in `fe/tasks`; `tests/stackSteps.test.js` and `tests/inboxMode.test.js` in `tests`.
- **Fan-in (`RULE-ARCH-003`):** red at first for two files: `shared/detailFields.js` (5, `useCardStack.js`) — raised with the
  owner's approval (`RISK-GOV-001`: not an independent approval) and a dated comment in `ops/structure-baseline.toml` —
  and `shared/rowMeta.js` (5, `CardStack.vue`) — avoided: the page passes the capture time as a prop.
- **Surfaces (`RULE-SURF-001`):** red at first for `inboxMode`, the one storage key this change adds on purpose (plan
  M10); `./run surfaces --update` writes it into `ops/surfaces/spa.json`. No route, env var or API change.
- **Tests:** vitest 561 → 604 (32 files; new `stackSteps.test.js` 28 cases, `inboxMode.test.js` 5; `gestures.test.js`
  5 → 12; `commands.test.js` 23 → 26; the context hints are asserted in the existing "Nächste: every context" case).
  `make check` GREEN (after `make fix` rebuilt the stale index).
- **Gates:** `./run violations` — only the two declared cycles (`CYCLE-001`, `CYCLE-002`); the old UI's files are
  untouched (`git diff --stat 8c2359e` over `components/`, `views/`, `stores/`, `router/`, `App.vue` is empty).
- **Budgets** (`vite build`): entry JS 129.3 kB gzip (M9: 124.6; ≤ 130), CSS 14.5 kB gzip (≤ 20); the stack's own chunk
  6.6 kB JS + 2.45 kB CSS gzip, fetched when the stack is first shown. Before the stack was made lazy the entry was
  133.4 kB — over the budget.
- **Acceptance on the harness** (own backend on :8021, Vite on :5191, scratch data root, **the 06 demo set**, Chrome and
  WebKit; details and every request in [`build/m10/README.md`](../design/2026-10-31-unified-ui/build/m10/README.md)):
  keys `1`–`5`, `0` / `Esc` / `⌫`, `p`, "Neues Projekt" (a taken name refused), `e`, `→`, `x`, `z` with the exact
  inverse and the card back on top; drag and flick with a mouse in Chrome and WebKit (every drop landed); **a whole
  Inbox of five cleared on the phone with taps only**, in Chrome (plus a touch drag) and in WebKit; mode default by
  device, `s`, the toggle and the palette switch and store it; the palette offers the trays and tools; `/` search
  replaces the stack and Esc brings it back. Frames: 0 at rest (3 s, also after a filing and an undo), 0 with reduced
  motion, 100 for one filing's flight and rise. Card height: content + 88 px on desktop, + 76 px on the phone (bound:
  + 96 px).
- **Fixed after looking at the shots:** the context step's trays had an empty name line (now 06's `ctxhint.*` under
  the name, and an empty hint keeps its line); project names were cut (now two lines on wide screens); the phone
  stack opened with the capture field focused, which raises the keyboard over the card (stack mode no longer focuses
  it); at 200 % zoom a step's focused tray lay under the dock (it now scrolls in clear of it).
- **Accessibility:** axe-core 4.10.2: 0 serious or critical issues in all 20 shot states (stack, step, note, project,
  new project, narrow, phone, phone step, phone note, list, WebKit desktop and phone; light and dark); the one moderate
  `region` finding is M6's capture field. Every tray is a button named with what it shows and its key ("Nächste, dann Kontext, 13 darin (Taste 1)", "Freitag, Fr 13.11. (Taste 2)"); the trays' group is named after the question ("Warten auf · wann fragst du nach?"); Tab reaches
  the toggle, the card's tools and every tray, each with a visible ring; a step moves the focus to its first tray; the
  card announces "Karte 1 von 5: …" in a polite live region; touch targets on the phone: tools and toggle 44 px, trays
  71×92, step trays 123×60; 200 % zoom at 1440 px: no horizontal scroll in any step.
- **Shots:** `build/m10/` — `web-stack-desktop-{light,dark}`, `web-stack-step-desktop-{light,dark}`,
  `stack-note-desktop-{light,dark}`, `stack-project-desktop-{light,dark}`, `stack-newproject-desktop-light`,
  `stack-narrow-{light,dark}`, `web-phone-stack-{light,dark}`, `web-phone-stack-step-{light,dark}`,
  `web-phone-stack-note-{light,dark}`, WebKit desktop and phone, a mid-drag in Chrome and in WebKit, 200 % zoom, and the
  list mode. Compared with 06's `web-stack`, `web-stack-step`, `web-phone-stack`; deviations in the README.
- **Review** (nine findings; eight fixed, one rejected in part), each verified against the code and driven on the harness:
  - **Fixed — a drop near a tray's edge filed into its left neighbour.** `trayAt` took the first tray whose padded box
    held the point; the margin (22 px dragging, 30 px on release) is wider than the gap (10 px, 6 px on the phone), so
    the first 20–24 px of a tray belonged to the tray before it, and the lit tray and the receiving tray could differ.
    Now the tray under the point wins, and outside every tray the nearest one by distance within the margin. Driven
    15 px inside Löschen, Erledigt and Warten auf with a mouse in Chrome and WebKit: lit and filed alike ("Gelöscht",
    "Erledigt", the follow-up days). Tests: a point just inside the right-hand of two trays 10 px apart, the phone's
    6 px gaps, a gap, two rows.
  - **Fixed — the top card could change under an open step.** A refresh (focus, `visibilitychange`, `online`) bringing
    a capture from elsewhere made it the newest card and so the top; `useClarify` reset the step, and the next digit
    meant for a context filed the new card as Erledigt (`4`) or Löschen (`5`). Now the card on top stays there while it
    is in the Inbox (`stackOrder`'s `keep`) and new arrivals go under it. Driven: `1`, a capture through the API, the
    window focused after the 30 s gap: same card, still the context step, `4` sends
    `PUT … {"tags_add":["next","@unterwegs"]}` for it; the new capture is the next card. Tests in `stackSteps.test.js`.
  - **Fixed in part — a capture renamed from `local:…` to its server uuid.** Filing a capture before the server names
    it cannot happen (the store refuses writes to a `local:` uuid, `gtd.js` `find`), so Rückgängig's history never holds
    one — that part is rejected. Skipping, keeping or editing one can: the store now records each capture's server
    uuid (`uuidNow`), and the stack's skips, pin, kept card and history, the open question (`useClarify`) and the edit
    on the card follow it. Driven with the capture's reply held back 2.5 s: skipped while local, it stays at the bottom
    once named. Tests: `stackOrder` and `returnedCards` with `uuidNow`.
  - **Fixed — screen readers did not hear the question.** The trays' group is named after it ("Was ist es?", "Warten
    auf · wann fragst du nach?", "Zu welchem Projekt?"), and the live region says it in a step (`stackQuestion`).
  - **Fixed — a tray's name dropped its hint and count.** `trayName` names it with what it shows and its key:
    "morgen, Mi 11.11. (Taste 1)", "Garten, 1 nächste (Taste 6)", "Nächste, dann Kontext, 13 darin (Taste 1)".
  - **Fixed — the focus fell to `<body>` when the last card was filed.** The empty Inbox's "Alles geklärt …" takes it
    (`tabindex="-1"`), so a screen reader reads it; driven in Chrome and WebKit.
  - **Fixed — the brief promised tags on the card.** The card shows none, as 06's card shows none; the
    outcome and "Where this departs" now say what it shows.
  - **Fixed — Rückgängig after the last card did not fly back and restarted the count.** The stack's history is no
    longer cleared when the Inbox empties, only on a mode change or a search; a return while the stack is not mounted
    flies once it is. Driven: five cards filed with `3`, then `z`: "5 von 5", the card flies out of Irgendwann
    (Chrome and WebKit), `PUT … {"tags_remove":["someday"]}`.
  - **Fixed — ten shots were not added.** All 23 PNGs of `build/m10/` are in the commit.
  - Re-run after the fixes: vitest 604 green, `make check` GREEN (after `make fix` rebuilt the stale index), `make verify`
    GREEN (the container tier skipped, no Docker); all 20 shot states, axe-core 0 serious or critical (the same moderate `region` of M6); no
    shot changed beyond the clock text, so none was replaced.
