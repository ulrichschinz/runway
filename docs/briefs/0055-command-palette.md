# Change Impact Brief 0055 — Command palette, shortcuts sheet, search

| Field | Value |
|---|---|
| **Requested outcome** | Milestone **M9** of [the plan](../plan/unified-ui-web.md): behind `?ui=neu`, ⌘K / Ctrl+K opens 06's command palette on every page — actions on the cursor row, Gehe zu, the context chips, Darstellung, Tastenkürzel, todo and project search, and "Als Todo erfassen: „…“" with the typed text; `?` opens the shortcuts sheet; `/` puts the cursor in the search field of the page head (desktop) or opens the search at the top of "···" (phone), and the list shows "Gefunden in allen Listen" over the snapshot with `matchesSearch`. Palette, keymap and sheet read one command table. Nothing changes for anyone without `?ui=neu`. |
| **Owning unit** | `fe/layout` — new `layout/CommandPalette.vue`, `layout/ShortcutsSheet.vue`, `layout/TopLine.vue`; `layout/AppFrame.vue` (opens both, the frame's own commands: Gehe zu, Darstellung, `?`, `/`, erneut senden), `layout/RailNav.vue` (⌘K Befehle · ? Tastenkürzel in the foot), `layout/PhoneDock.vue` + `layout/MoreSheet.vue` (search field and "Befehle" in "···"). `fe/shared` — new `shared/paletteRank.js`, `composables/useCommands.js`; `shared/commands.js` (palette metadata per row, `paletteCommands`, `palette` / `search` / `shortcuts` / theme / `retry` rows, the sheet's ⌘ key); `composables/useKeymap.js` (one listener, layered: the frame's and the page's handlers together); keys in `messages.de.js`. `fe/tasks` — new `tasks/useTaskSearch.js` (search sections, the palette's todo/project provider); `components/ListFrame.vue` (search results in place of the page), `useListPage.js` (palette offers for the cursor row; `go.*` moved to the frame), `views/InboxPage.vue` + `views/NextPage.vue` (their offers). `fe/app` — `router/NewUiHost.vue` registers the task search. `tests` — `paletteRank.test.js` (new), `commands.test.js`. `docs` — this brief, `build/m9/`. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3–§5; [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (new files only in unit folders; `layout/` imports no feature; tests cover logic). |
| **Governed by** | [ADR 0042](../adr/0042-the-new-ui-coexists-behind-a-switch.md) (old side unchanged). [ADR 0007](../adr/0007-frontend-test-scope.md) (pure logic tested, no component mounting). |
| **Rule IDs introduced** | **None.** No change to `architecture.toml`. **`ops/structure-baseline.toml` gains four `[hubs]` lines** (`RULE-ARCH-003`, approved by the owner, `RISK-GOV-001`: not an independent approval), each with a dated comment: `composables/useCommands.js` = 7 (the palette's items, the `/` search query, the modifier name and the runtime search registry: palette, sheet, top line, rail, "···", list frame, task search), `shared/commands.js` = 5 (the one command table read by keymap, palette and sheet, plus the frame and the list pages), `shared/contextTags.js` = 5 and `tasks/notice.js` = 5 (the task search is the fifth importer of each). |
| **Entry points** | `paletteCommands()`, `shortcutSheet(table, mod)`, `modKey()` (`shared/commands.js`); `needleOf()`, `matchRank()`, `rankPalette()` (`shared/paletteRank.js`); `useKeymap(handlers, scopes, offers)`, `activeKeymap()`; `registerSearch()`, `paletteItems()`, `searchQuery` (`composables/useCommands.js`); `useTaskSearch()`, `searchSections()` (`tasks/useTaskSearch.js`). |
| **Affected public surfaces** | **None new.** No route, no storage key, no API call (search is client-side over the snapshot). `./run surfaces` stays clean. |
| **Known dependents** | From `./run impact` before the code: `shared/commands.js` → `useKeymap.js`, `useListPage.js`, and through them ListFrame and the five list pages; `composables/useKeymap.js` → `useListPage.js` and the same pages. `useKeymap`'s signature is kept (a third, optional argument); its one window listener now serves every mounted keymap, so the frame and the page no longer race for a chord. The old UI imports none of these files. |
| **Uncertain / dynamic areas** | **F13** — the index credits no frontend test; protecting tests are named below. `RISK-TEST-004` — palette, sheet and search rendering are not unit-tested by construction; driven on the harness and recorded below. The search provider is registered at runtime (`registerSearch`), so `fe/layout` → `fe/tasks` has no import edge, and the index sees none — by design (plan 6.1). |
| **Analogous implementations** | `06-kombination/web.js` `commands()`, `openPalette`, `renderPalette`, `paletteKey`, `toggleKeys`, `sectionsFor('search')`, the `search` head, `searchInput` / `tocsearch` handlers, the `/` `?` ⌘K branches of the keydown handler; `index.html` `.topline`, `#palette`; `combo.css` `.palbtn`, `.pal-*`; `web.css` `.search`, `.keys`, `.sheet-scrim`. |
| **Delivery Pattern** | **New Capability** (units declared in M0). |
| **Required tests** | New: `frontend/tests/paletteRank.test.js` — the needle, match ranks (start, word start, inside, keyword only), group order, caps (6 commands, 5 todos, 3 projects with a query; every command without one), ties keep the given order, "Als Todo erfassen" always last and only with a query. Extended: `commands.test.js` — palette entries are table entries (every entry's id is a row; every row with palette metadata reaches the palette when its handler, scope and offer are there; every key of the table is reachable from the palette except the ones listed as the palette's own: cursor moves, Esc, the open question's answers, `/`, ⌘K itself), offers gate and label row actions, scopes gate (`ctx.*` only on Nächste), the sheet gains ⌘K, `/`, `?` and skips keyless rows, `modKey`. Existing that protect touched code: `commands.test.js` (resolveKey, ownsKey, the sheet), `strings.test.js` (every `t('…')` literal exists), `taskFilters.test.js` (`matchesSearch`, unchanged). |
| **Intended scope** | The files above. **Not** in scope: "Inbox als Stapel / Liste" (the card stack is M10), margin panels (M12), search on the not-yet-built pages (Projekte, Rückblick, Einstellungen: there `/` opens the palette, which searches todos and projects too). |
| **Base revision** | `8ffc941` (branch `ui/m8-clarify`, M8, not on `main`) |

## Design

- **One table, three readers.** Every row of `shared/commands.js` may carry `pal: {group, label?, offered?}`.
  The keymap resolves keys against the table as before; the `?` sheet is generated from it
  (`shortcutSheet`, keyless rows skipped, ⌘K shown through `sheetKeys`); the palette's commands are
  `paletteCommands(table, active)` — the rows whose handler is mounted right now, whose scope is
  active, and (for `offered` rows) that the page offers. A palette command runs the very handler the
  key runs, so a key and its palette entry cannot drift apart.
- **Layered keymap.** `useKeymap(handlers, scopes, offers)` pushes a layer while its component
  lives; one window listener merges the layers (the latest mounted wins a handler; its scopes come
  first). The frame (`AppFrame`) mounts a layer with what it owns: Gehe zu (`go.*`, moved out of
  `useListPage`), `?`, `/`, Darstellung, erneut senden. The page (`useListPage`) mounts its rows' and
  page keys and offers the cursor row's actions with the todo's text ("Abhaken: Belege Oktober
  hochladen"). Two listeners racing for `g` would have dropped every chord; one cannot.
- **Palette** (`CommandPalette.vue`, 06 `#palette` without 04's blur): a dialog over the token scrim,
  the `//` input as a combobox (`aria-activedescendant` on the selected option), groups Aktionen ·
  Gehe zu · Kontext · Ansicht · Todos · Projekte · Neu; `↑ ↓` select, `⏎` runs, `Esc` / a click on
  the scrim close, Tab stays in the field; focus goes back where it was before the command runs.
  Palette and sheet are modals (`useModal`): while either is mounted no keymap layer takes a key, wherever the focus is.
  ⌘K / Ctrl+K toggles it from anywhere, also while typing. Ranking is pure (`paletteRank.js`):
  starts-with before word-start before inside, keywords (project, tags) after the label, the best
  six commands, five todos, three projects, then "Als Todo erfassen: „…“".
- **Search providers.** `fe/tasks` registers its provider at runtime from the composition root
  (`useTaskSearch()` in `NewUiHost.vue`): todos match by `matchesSearch` (description, project, raw
  tags — the old UI's rule, kept) and open in their own list with `?task=` (the detail opens);
  projects open `/projects/<name>`; capture goes through the store's `capture` with the notice
  "In Inbox ✓ · Rückgängig". `fe/layout` imports no feature.
- **`/` search.** Desktop: the search field in the page's top line (06 `.topline`, with "Befehle ⌘K"
  and "Stand"). Typing replaces the list with "// Suche · »q« · n Treffer", "Gefunden in allen
  Listen" and the hits by list (Inbox, Nächste, Warten auf, Irgendwann, Ohne Liste), rows working as
  rows; `⏎` / `↓` put the cursor on the first hit; `Esc` (field or page) and "Suche beenden" end it;
  leaving the page ends it. While searching, the page's own keys, chips and panel (the clarify
  panel) rest. Phone: `/` and "···" open the Mehr sheet with the search field on top (06
  `tocsearch`) and a "Befehle" entry for the palette.

## Where this departs from the plan or the prototype

- **No "Inbox klären (n)" and no "Inbox als Stapel/Liste"** palette entries: the first duplicates
  "Gehe zu Inbox"; the second needs the card stack (M10), which adds it.
- **Context entries only on Nächste** (06 lists them everywhere and switches to Nächste): they are the
  chips' own commands (`ctx.0`–`ctx.6`) and live where the chips live; present contexts (D1), not 06's
  fixed five.
- **More palette actions than 06**: every row key (open, Text ändern, Starten/Pausieren, Löschen,
  verschieben, für heute) and Rückgängig, Erledigte zeigen and the Inbox questions, so every key
  action is reachable from the palette (plan M9 acceptance). 06 offered Abhaken and planen only.
- **Search only on list pages** for now (above).

## Open points

- `RULE-GOV-002` red on `main` and here (decay review overdue) — outside this change.
- **Pending for Uli** (none blocks the milestone): approval of this commit and the stacked branch;
  the palette from "···" on a Pixel 9 / an iPhone (on-screen keyboard over the list); the plan's §10
  live-data steps (parity check, production opt-in, `task export` backup).

## Pre-checks

- **Before the code:** `./run impact` on `shared/commands.js` and `composables/useKeymap.js` (dependents above).
  After it, `./run map` puts the new files where intended: `composables/useCommands.js` and `shared/paletteRank.js`
  in `fe/shared`, `layout/CommandPalette.vue`, `layout/ShortcutsSheet.vue` and `layout/TopLine.vue` in `fe/layout`,
  `tasks/useTaskSearch.js` in `fe/tasks`, `tests/paletteRank.test.js` in `tests`. `./run impact
  shared/paletteRank.js` → `useCommands.js` and through it the frame, rail, dock, "···", palette, sheet and top line.
- **Fan-in (`RULE-ARCH-003`):** red at first for four files, each over its cap because of this change, and raised
  with the owner's approval (`RISK-GOV-001`: not an independent approval), each line with a dated comment in
  `ops/structure-baseline.toml`: `composables/useCommands.js` 7 (palette, sheet, top line, rail, "···", list frame,
  task search), `shared/commands.js` 5 (keymap, command state, frame, sheet, list pages), `shared/contextTags.js` 5
  and `tasks/notice.js` 5 (the task search is the fifth importer of each).
- **Tests:** vitest 539 → 561 (30 files; new `paletteRank.test.js` 11 cases; `commands.test.js` 12 → 23, three of them from the review below). `make
  check` GREEN except `RULE-RULE-002` (`WAIVER-TYPE-001` expired on 2026-11-04; fixed on `main` by another change,
  not touched here).
- **Gates:** `./run surfaces` clean (no route, storage key or env var); `./run violations` — only the two declared
  cycles (`CYCLE-001`, `CYCLE-002`), nothing new; `RULE-ARCH-003` green with the four baseline lines above.
- **Every key action in the palette:** `commands.test.js` › "reaches every key action of the table, except the
  palette's own" — with every handler, scope and offer mounted, the keyed rows the palette leaves out are exactly
  ⌘K, `/`, the cursor moves, Esc and an open question's answers. On the harness, with `j` on the first row, the
  palette held 22 entries on the Inbox (with the four questions), 26 on Nächste (with the five contexts), 20 on
  Warten auf and Irgendwann, 22 on Alle (with Erledigte zeigen); "Kontextfilter aufheben" appears after `1`,
  "Rückgängig" while a notice can undo.
- **Acceptance on the harness** (own backend on :8001 and Vite on :5179 over a scratchpad data root, because :8000
  was held by another session; own user `m9-agent` with the 06 demo set shifted to 10.11.; Playwright with real
  keys, Chrome): ⌘K toggles, also while typing in the capture field, and Esc returns the focus there with the text
  kept; Tab stays in the field; a scrim click closes. Palette "Abhaken" on the cursor row sends
  `POST /tasks/{uuid}/done` after the hold, and "Rückgängig" from the palette inside the hold sends nothing. "Als Todo
  erfassen: „M9 Palette Probe“" (↑ wraps to it) sends `POST /inbox {"description":"M9 Palette Probe"}`, the notice says
  "In Inbox ✓ · Rückgängig" and `GET /gtd/inbox` lists it. A todo hit opens its list with `?task=<uuid>`, a project hit
  `/projects/Garten`, "gehe zu wart" `/waiting`, "tastenk" the sheet (`?` closes it). `/`, "nora" ⏎ puts the focus on
  the first hit; Esc ends the search. Phone: "···" → "Befehle" focuses the palette field; a tap on "Gehe zu Inbox" goes
  to `/inbox`; "···", "ung" ⏎ closes the sheet over the hits. No console error or warning.
- **Fixed on the harness:** at 1024 px the top line wrapped "Stand 16:24" onto two lines; `TopLine.vue` now lets the
  field shrink and keeps "Befehle ⌘K" and "Stand" on one line (CSS only).
- **Accessibility:** axe-core 4.10.2: 0 serious or critical issues — palette (desktop, narrow, phone, light and dark),
  palette with a query, shortcuts sheet, `/` results, "···" with the search field. The one moderate finding
  (`region`) is on the capture field and the dock's chips, not on anything this change adds. The palette field is a
  combobox with `aria-activedescendant`; the sheet's only control takes the focus; both give it back.
- **Shots:** `build/m9/` (README there): `web-palette` and `web-palette-search` desktop light/dark, the shortcuts
  sheet (light/dark, and scrolled to its end: at 900 px it scrolls), the `/` results (desktop, phone), "···" with the
  search and "Befehle" (phone light/dark), the palette on the phone (light/dark), narrow top line and palette.
  Chromium only (speed mode); WebKit and narrow dark to M15.
- **Budgets:** not measured (speed mode); the palette, sheet and top line load with the frame.
- **Review (2026-11-10), twelve findings, verified against the code and on the harness.** All twelve hold and are fixed;
  they are eight defects, two of them reported three times:
  - *Keys reached the page behind an open palette or `?` sheet* (three reports): a click on the palette's headings or
    foot, or on the sheet's text, left the focus on `<body>`, where `ownsKey` took the key, so `x`/Entf acted on the
    cursor row and Esc on the page. Now both mark themselves modal (`useModal` in `useKeymap.js`, re-exported by
    `useCommands.js` so its fan-in is unchanged) and `ownsKey(event, modal)` refuses every key while one is open; the
    palette keeps the focus in its field on mousedown and handles its keys on the whole dialog; the sheet is focusable
    (`tabindex=-1`), so a click on it keeps its Esc/`?`, and Tab returns to "schließen". Test: `commands.test.js` › "takes
    no key while a modal is open". Harness: `j`, ⌘K, click a heading or the foot, `x`, Entf → nothing sent, palette open;
    the same on the sheet, and with the focus forced to `<body>`.
  - *⌘K held toggled the palette on every auto-repeat*: `paletteKeyAction` swallows a repeat (`swallow`) and toggles
    only on a fresh press; test "toggles on a fresh press and swallows a held key's auto-repeat"; harness: held ⌘K
    leaves it open.
  - *⌘K closing the palette, or swapping the sheet for it, dropped the focus on `<body>`* (three reports): the frame
    opens both through one `open()` that captures the return target once (`returnTo`, kept across a swap), and each
    gives the focus back as it unmounts if it still holds it. Harness: ⌘K ⌘K, and `?` ⌘K Esc, end on the cursor row.
  - *Group headings as `role=presentation` text inside the listbox*: each group is now a `role=group` labelled by its
    heading (`aria-labelledby`); `aria-activedescendant` is unchanged; axe still 0 serious or critical.
  - *⏎ in the phone's "···" search left the focus on `<body>`*: MoreSheet emits `enter`, PhoneDock forwards it as
    `searchEnter` after the sheet is gone (the first hit takes cursor and focus, as on wide screens), and without a
    hit the focus goes back to "···". `search-phone-{light,dark}.png` re-shot.
  - *The palette hint read "CtrlK" off Apple devices*: `paletteHint(mod)` gives `⌘K` or `Ctrl K` (as the sheet names
    it); the top line and the rail read `paletteKeyHint` from `useCommands.js` (no new import of `shared/commands.js`).
    Test: "is shown as ⌘K, or as Ctrl K like the ? sheet shows it".
  - *Three unused message keys* (`pal.close`, `search.clear`, `search.done`): removed.
  - *The baseline comment said `useCommands.js` holds the palette's open flag*: reworded there and in Rule IDs above
    (the open flag is the frame's).
  Rejected: none. `make check` and `make verify` re-run after the fixes (verdicts in the commit).

