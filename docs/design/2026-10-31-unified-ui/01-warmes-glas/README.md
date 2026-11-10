# 01 · Warmes Glas

**The idea in one sentence:** runway becomes paper cards on warm ground, calm like Things and fast like Linear, with one piece of glass in it: the **Tageslinse**, a frosted coral lens at the head of *Nächste* whose liquid level is today's progress, and every todo you tick off travels into it as a coral bead along a thin coral thread.

| File | What |
|---|---|
| `index.html` + `app.js`, `app.css` | web prototype (desktop first, responsive to 360 px) |
| `android.html` + `android/` | Android prototype: phone (412 × 915 dp) plus widget, Quick Settings tile with overlay, share target |
| `store.js` | the GTD rules both prototypes share (what would live in `frontend/src/shared/` and the Kotlin `gtd/` package) |
| `fx3d.js` | the one Three.js module (Tageslinse, Inbox pebbles), loaded lazily |
| `lens-flat.js` | the static rendering of the same information (reduced motion, no WebGL, first paint) |
| `android/tageslinse.agsl` | the Android shader. `android.html` compiles this exact file in WebGL after a type rename (`half4` → `vec4` …), so the preview runs the shader text the app would load |
| `glyphs.js` | the glyph set (section 4) |
| `tokens.json`, `tokens.css` | one token source (section 10) and the CSS it generates |
| `shots/` | verified screenshots |

View: from `2026-10-31-unified-ui/` run `python3 -m http.server 8340 --bind 127.0.0.1`, open `/01-warmes-glas/` and `/01-warmes-glas/android.html`. Press `?` on the web page for all shortcuts.

Prototype notes. The demo data is the shared set, copied, with these additions so the concepts have something to show: two next actions are marked *für heute* (`scheduled = today`), and so are the three todos done this morning (so they count as planned: *3 von 7*); two waiting items have a follow-up day (`scheduled`); *Winterreifen wechseln lassen* was captured eleven days ago (to show the attention dot on old inbox items); and the project status `someday` of *Podcast* is shown as `on_hold` (*Pausiert*), the value the API has. The shared data has no `+next` tags, so `store.js` treats "has a context" as next; the real `lists.js` uses `+next`, exactly as `/gtd/next` does. The Android prototype opens on *Nächste* so the lens is visible; `proto.show('inbox')` shows the real start screen (field focused, keyboard up, tab row). Extra shots: `android-inbox.png` (keyboard up, tab row, notice, widget `+` overlay), `android-dark.png`, `web-dark-inbox.png`, `web-phone-klaeren.png`.

---

## 1. Design principles

1. **Work first, glass second.** Every list, row and control is paper on warm ground (brand rule 8). Glass exists in exactly one place per screen, the lens slot at the head of *Nächste* or *Inbox*, and only there because it carries a number.
2. **Every effect explains something** (rule 5.1 of our Three.js notes). The liquid is today's progress against a plan that only changes when the plan changes; the bead says "this one counts for today" and flies only for such todos; one wobble says "received"; pebbles are unclarified items. Nothing moves when nothing changes.
3. **One keystroke, one tap.** `N` on the web, the field at the bottom on Android, the tile, the share sheet: capture never asks for a project, a context or a date. Clarifying is a separate, fast step.
4. **Nothing is lost, everything is undoable.** Every write is held 6 s before it is sent, on both clients (Android's outbox rule becomes the web's rule). Undo is `Z` or *Rückgängig*; a 1 px yellow line under the notice shows the time left.
5. **Same words, same places.** Five lists with the same names in the same order, the same row anatomy, the same status vocabulary, the same lens. Platform conventions decide only *how* you get there (keyboard and sidebar versus thumb and navigation bar).
6. **Say how fresh it is.** `Stand 09:42` is on every screen of both clients; a failed load says so instead of looking empty.

## 2. Information architecture and names

Five lists, identical on both platforms, in this order: **Inbox · Nächste · Warten auf · Projekte · Irgendwann**. Below them, on the web sidebar and in the Android *Mehr* menu: **Wochenrückblick · Alle Todos · Einstellungen**.

| List | Sections (top to bottom) | Rule |
|---|---|---|
| Inbox | *Zu klären*, newest first | no tag, no project (server rule). Same order on both clients (Android's order wins) |
| Nächste | **Fällig** (never filtered) · **Nächste Aktionen** | The shape Android's P08 pins, on both clients: *Nächste Aktionen* is exactly `/gtd/next` under the context filter, so a due next action appears in both sections. Inside it, the group **für heute** comes first (due, started or `scheduled ≤ today`), then **weitere**; a group label, not a section heading. Context filter = Android's rule on both: the task has the context or has none |
| Warten auf | **Nachhaken** (follow-up day ≤ today) · **Wartet** | follow-up day = `scheduled`, as Android does today |
| Projekte | **Steht still** · **Aktiv** · **Pausiert** · **Erledigt** | uses `/gtd/projects/overview`; *steht still* = active, no next action, nothing waiting or in the tickler |
| Irgendwann | **Irgendwann / Vielleicht** · **Zurückgelegt** (the tickler, `/gtd/tickler`) | the tickler finally gets a home |

Vocabulary: *Todo* (not task), *Abhaken*, *Erledigt*, *Rückgängig*, *Löschen*, *Klären*, *Für heute*, *Nachhaken*, *Wiedervorlage*, *Zurücklegen*, *steht still*, *läuft*, *überfällig*, *fällig heute*, *Stand hh:mm*, *Neues Todo*, *In Inbox ✓*, *Abmelden*, *Einstellungen*. The product is written **runway** (lowercase) everywhere, as Android's share label is pinned to `runway`. All UI text is German, *du*, no emoji, no exclamation marks.

### What the inventory becomes

| Inventory item | In this proposal |
|---|---|
| Web modal form for new tasks | Replaced by the capture bar (`POST /inbox`, always to the Inbox). `⇧N` opens a new todo directly in the detail panel for the rare "with fields" case (`POST /tasks`; not built in the prototype) |
| Web task modal | Detail panel on the right (desktop) or bottom sheet (phone), all fields kept: description, project, contexts, other tags (under *Weitere Felder*), priority, due, *Für heute* (`scheduled`), *Zurücklegen* (`wait`), *Wiederholung* (`recur`, with the due-date rule stated in the field), *Blockiert durch* (`depends`), *Läuft ab* (`until`), notes (annotations, add only), start/pause, *Abhaken*, *Löschen*. A list switch (*Inbox · Nächste · Warten auf · Irgendwann*) uses `tags_add`/`tags_remove`, so it no longer overwrites tags set elsewhere |
| Clarify (web: editing tags by hand; Android: none) | *Klären* panel or sheet: Nächste Aktion (+ context, optional project), Warten auf (+ Nachhaken date), Projekt, Irgendwann, Zurücklegen, Sofort erledigt, Löschen; then the next Inbox item opens |
| Urgency badge on every row | **Dropped from rows**: with +15 for `next`, every next action was red, so the badge carried no information. Order still follows urgency; the number stays in the panel (*Dringlichkeit 14,2*) |
| Emoji in nav, plan tabs, dark toggle | Replaced by the glyph set (section 4) |
| *All Tasks* as a main destination, *Done* toggle | *Alle Todos* under *Überblick*, with *Erledigte zeigen*; also in search (`/`, `⌘K`) |
| Project plan modal (5 steps) | Kept and restyled: *01 Warum · 02 Vision · 03 Ideen · 04 Ordnen · 05 Aktionen*, explicit *Speichern*. *Als nächste Aktion* now creates the task with `+next` and a context, so it lands in *Nächste* (today it lands in no list) |
| Project status, stalled, overview counts (API only) | Used: section *Steht still*, a yellow dot on *Projekte*, status switch *Aktiv · Pausiert · Erledigt* in the project header |
| Review records (API only) | *Wochenrückblick*: six steps with live counts, *Rückblick abschließen* writes `POST /gtd/review` |
| Settings (profile, password, API key, Claude, MCP tabs, admin) | Kept, in German, as paper cards; MCP tab names *Claude Code / Claude Desktop / curl* stay (tested). New: *Darstellung* (System · Hell · Dunkel; Effekte an · reduziert) and *Kontexte* (one list for both clients) |
| Login (web), setup (Android) | Kept with their flows and Android's pinned strings; restyled with tokens. Not in the prototypes |
| Web dark toggle, light default | System by default on both; manual override in *Einstellungen* (`data-theme`) |
| Web `?task=` and `/projects/:name` ignored | Honoured (the prototype opens `index.html?task=<uuid>`), which repairs Android's handoff |
| Android: three top tabs and *Mehr* | Bottom navigation bar with the five lists; *Mehr* stays in the top bar (*Angemeldet als*, *Widget hinzufügen*, *Kontexte*, *Protokoll exportieren*, *Abmelden*). While the keyboard is up, the top bar turns into the three text tabs *Inbox · Nächste · Warten auf* (48 dp), so list switching stays one tap with the keyboard open, as today (section 9) |
| Android: pill *↑ Neue Todos oben* | Kept with its text on Android; the web Inbox gets the same pill when a refresh adds items above the visible rows |
| Android: pull-to-refresh on every list | Kept on every Android list. The web follows one refresh policy (section 8) |
| Android: Custom Tab for details | Native detail sheet with *Abhaken*, list switch, contexts and *Im Web öffnen* for the rest (needs Uli, see 15) |
| Android: outbox signals, banners, notifications, shortcuts, setup | All kept with their texts; restyled. Row status lines (*wartet auf Netz*, *Nicht gesendet*, *wartet auf Setup*) use the same meta line as everything else |
| Web: no offline, silent failures | Same outbox and *Stand* as Android (IndexedDB). A failed load shows *Nicht geladen · Stand 09:12 · Erneut laden* above the list instead of an empty list |

Nothing in the inventory is dropped except the row urgency badge and the emoji.

## 3. Visual language

### Semantic tokens (from the brand tokens, light / dark)

| Token | Light | Dark | Used for |
|---|---|---|---|
| `ground` | `--ar-bg` #FBF6EE | `--ar-ink` #1B1428 | page, header, the lens scene background |
| `ground-sunk` | `--ar-bg-alt` | ink 90 % + plum | sidebar, Android navigation bar |
| `surface` | `--ar-paper` | ink 74 % + plum (#241A36) | cards, panel, sheets |
| `surface-tint` | `--ar-bg-cool` | ink 58 % + plum | selected row |
| `text` / `text-mute` | ink / `--ar-mute` | bg / `--ar-on-dark-mute` | |
| `line` | `--ar-hairline` | `--ar-on-dark-hairline` | dividers, card borders |
| `action` | coral | coral | primary button, check-off ring, overdue ring, the lens, bead and thread (closed list in section 14, deviation 3) |
| `on-action` | ink | ink | text on coral (7.0:1; paper on coral is 2.6:1) |
| `action-ink` | coral 62 % + ink (#A85352, 5.2:1) | coral 80 % + bg (#FE9385) | small coral text: *überfällig*, *läuft* (*Rückgängig* sits on the ink notice in pure coral) |
| `structure` | plum | plum 45 % + bg (#A69BAC, 6.7:1) | project names, focus ring, switches, step and plan numbers, the Fraunces word |
| `structure-select` | plum 11 % | bg 11 % | selected navigation item, tab indicator (never coral) |
| `attention` | yellow | yellow | dot, ring or 1 px line only: stalled project, follow-up due, review overdue, undo time |
| `inverse` | ink | bg | selected chip, segmented control, notice |

### Type

Three faces, as the kit says. Space Grotesk 400/500 for everything you read and press; JetBrains Mono **400** for eyebrows, section headings (`// Fällig 1`), counts, contexts (`@anrufe`), keys and the lens caption; Fraunces italic 300 in plum for **one word per view** in the lead sentence (*Noch vier für* ***heute***). Section headings are written mixed case on both clients: Compose cannot uppercase by style, and Android's P08 driver looks for the literal `Fällig`. Web scale: title 36/1.04 (phone 28), panel title 21, lead 15.5, row 15/1.38, meta 12.5, section 12.5 mono, label 11 mono uppercase +0.08em. Android: 24 sp title, 16 sp rows, 13 sp meta and section headings, 11 sp labels; numbers in mono with tabular figures.

### Shape

Cards 18 (`--ar-radius-lg`), panels and sheets 22, everything pressable is a pill (capture field, buttons, chips, segmented controls, the Android navigation indicator), check rings are circles. Rows sit inside one card per section with hairline dividers, not one card per row. Brand shadows only.

### Motion

| Token | Value | Where |
|---|---|---|
| `fast` | 120 ms, `--ar-ease` | press, ring fill, hover |
| `base` | 180 ms | chips, toggles, row collapse |
| `slow` | 260 ms | panel, sheet, notice |
| `flight` | 620 ms (thread draws in 260 ms, bead leaves at 120 ms) | the bead |
| `pull` | `cubic-bezier(.55, 0, .25, 1)` | the bead starts slowly and is pulled into the lens |
| `spring.level` | ζ 0.62, k 180 | the liquid rises with one small overshoot |
| `spring.wobble` | ζ 0.4, k 260, settles in about 0.6 s | the surface tilts once after impact (the only impact effect) |
| `undo` | 6000 ms | hold before a write is sent |

A completed row leaves within 700 ms (Android's contract asks for 1 s); input is never blocked by an animation, and several beads can be in flight at once.

## 4. Iconography

The kit forbids an icon library and names mono symbols as the iconography. A navigation bar and row actions need recognisable shapes at 20 px, and the mono subset we ship does not even contain `→` (U+2192). So runway gets its **own small glyph set built from the mark's vocabulary**: 1.5 px hairlines with round caps and filled nodes of radius 1.6, the same line-and-node grammar as the logo, never the logo itself. 26 glyphs (`glyphs.js`): inbox, next, waiting, projects (a hexagon outline with a centre node), someday (a dotted ring), search, plus, check, review, all, settings, undo, close, more, today (a half-filled ring: the lens as a glyph), play, pause, calendar, note, back, chevron, trash, plan, menu, enter, share. Android ships the same paths as `ImageVector`s; no Material Icons. The `//` mark, `·`, `↑` (high priority) and `@` stay typographic.

## 5. Signature moments

**What the lens counts.** `total` = open todos planned for today (*Fällig* plus the *für heute* group) + todos done today that were planned (due ≤ today, `scheduled` ≤ today or started). `done` = the second part. The denominator changes only when the plan changes (`T` marks a todo for today, a due date arrives, undo), never because you did something unplanned. Unplanned completions are counted apart: *4 von 7 · 1 zusätzlich*. A started todo counts as planned; if the API does not return `start` on completed todos, starting a todo also sets `scheduled` to today on the same write, so the rule needs only `due` and `scheduled`. Logic: `dayProgress.js` / Kotlin `DayProgress`, pure and tested.

1. **The bead** (Nächste, only for a todo that counts for today). The ring fills coral and pinches; a 12 px coral bead leaves it; a 1.5 px coral thread draws from the row into the gutter, up past the cards and over the top of the lens; the bead travels along it (the thread reels in behind it), drops through the glass into the liquid; the surface tilts once, the level rises, and the caption ticks from *3 von 7* to *4 von 7*. The row is gone before the bead lands. *Erledigt: … · Rückgängig* stays 6 s; undo drains the level again. Any other completion fills the ring, shows the notice and adds *· 1 zusätzlich* to the caption; no bead, no level change.
2. **The pebbles** (Inbox). One frosted pebble per unclarified item, up to nine, in a heap that fits the square; more than nine shows nine and *+N*, the caption keeps the real count (*12 zu klären*). A capture drops a new pebble in; clarifying an item lifts its pebble out. Age is not encoded in the glass (invisible at 30 px); an inbox row older than seven days carries the yellow attention dot instead (*seit 11 Tagen*). Empty Inbox: no pebbles (the static rendering shows a dashed outline where they would lie) and *Inbox ist leer*.
3. **The compact lens.** On scroll, the header shrinks to one line and the lens to 44 px, centred on the title line, so progress stays in view while you work down the list. On the phone web the caption stays under the 72 px lens in its short form (*3 von 7*, *3 von 7 +1* after an unplanned completion).
4. **The lens elsewhere.** A 14 px half-filled ring next to *Nächste* in the sidebar, the same ring as a vector on the Android widget, the same caption *3 von 7 heute* everywhere.

## 6. Effects

| Effect | What it explains | Web (Three.js) | Android (native) | Reduced motion / fallback |
|---|---|---|---|---|
| Tageslinse fill level | planned and done today versus everything planned for today (*Fällig* + *für heute* + planned and done); unplanned completions counted apart | `MeshPhysicalMaterial` glass sphere (transmission 1, thickness 1.1, IOR 1.45, light coral attenuation, clearcoat, slight iridescence), fresnel rim shader (value clamped before `pow()`), coral liquid = sphere clipped by a plane plus a surface disc, volume-true level, `RoomEnvironment` reflections, key, rim and fill light, neutral tone mapping | AGSL `RuntimeShader` in a `ShaderBrush` (`android/tageslinse.agsl`): faked refraction, elliptical surface, lighting, fresnel rim, contact shadow | SVG lens with the same volume-true level and the caption; no animation |
| Bead along the thread | this todo counts towards today; where it went. Only for todos in *Fällig* or *für heute* | DOM bead plus an SVG path (one per flight), handed over at the sphere's projected top to a 3D bead that falls through the glass | `Animatable` along a `PathMeasure` path drawn in an overlay above the `LazyColumn`; haptic `CONFIRM` on impact | no flight; the ring fills, the level and caption update at once |
| Surface wobble | the state change was received | one damped spring pair on the plane's normal (ζ 0.4), settled in about 0.6 s. No ripple, no flare: the bead and the rising level already say "received" | same spring feeding the `tilt` uniform | none |
| Level drains on undo | the completion was taken back | level spring back down | same | instant |
| Inbox pebbles | how much is left to clarify | frosted glass pebbles (transmission, one roughness, plum attenuation and rim), soft shadow map, drop-in and lift-out; on ink a light plum-light frost body instead of full transmission | AGSL `stones()` mode of the same shader, nine pebbles as a uniform array, alpha animated | SVG pebbles, same count and *+N* |
| Compact lens on scroll | progress stays visible while working | CSS scale of the canvas, no re-render | top bar collapses, shader drawn smaller | same, static |
| Widget lens | progress on the home screen | none | nine vector drawables `lens_level_0..8` (Glance cannot run shaders and the contract forbids bitmaps) | same, it is static |
| *läuft* pulse | a todo is in progress | the kit's coral pulse dot (CSS) | `InfiniteTransition` on a 6 dp dot | static dot |
| Undo time line | how long *Rückgängig* still works | 1 px yellow line shrinking under the notice | same | full line, no shrink |

Rendering rules held by the prototype: one WebGL canvas per screen, created lazily (`import()` after first paint), shared by both scenes and moved between header slots; frames only while something moves (measured: **0 frames in 1.5 s idle**, before and after a completion; **53 frames per completion**, about 0.9 s); paused when the tab is hidden; context loss or no WebGL falls back to the SVG; all text in the DOM. No bloom pass: the only bright highlight is the key light's specular on the clearcoat, because a post-processing chain on a 136 px canvas would run the brand background through tone mapping and shift it.

Dark theme: on ink, full transmission shows the ink through the glass (a murky hole) and turns the pebbles into black marbles. The dark scene therefore raises the environment to 0.8, gives the glass a light plum-light body (transmission 0.84, plum-light attenuation), a stronger plum-light rim, and the pebbles a plum-light frost (transmission 0.5). The level still reads at 44 px (compact web header) and 56 dp (Android top bar); see `web-dark.png`, `android-dark.png`.

## 7. Key flows

| Flow | Web | Android |
|---|---|---|
| **Capture** | `N` anywhere focuses the capture bar at the bottom; Enter saves to the Inbox and keeps the field open; *In Inbox ✓ · Rückgängig* appears beside the field; the Inbox count bumps and, on the Inbox, a pebble drops in. Nothing found in search + Enter also captures | Inbox: field at the bottom, focused, keyboard up on every open (unchanged); the top bar is then the tab row *Inbox · Nächste · Warten auf*, so another list is one tap away with the keyboard open. Scroll, tap beside or the first Back close the keyboard and keep the draft; the top bar and navigation bar come back. Other lists: the same field above the navigation bar. Tile *+ Todo*, launcher shortcut *Neues Todo*, widget *+*: the plain-View overlay with only the field, the notice with *Rückgängig*, and *Schließen*. Share: one tap on *In Inbox*. All offline-safe through the outbox |
| **Clarify** | Inbox opens with its first item selected: Enter opens *Klären*; one key picks the outcome (`N W P I Z E L`), digits pick the context, Enter applies and the next item opens, focus follows. Tab reaches every row; Enter on a row is *Klären*. Mouse: *Klären* on hover. Touch (phone web): the Android sheet, one tap applies (*Nächste Aktion* and *Projekt* unfold their context chips; a chip applies), no key hints | Tap a row: *Klären*, *Bearbeiten*, *Löschen* (one tap, no long press). *Klären* is a sheet: *Nächste Aktion* shows the context chips, one tap applies; *Warten auf*, *Irgendwann*, *Sofort erledigt* apply at once |
| **Do** | *Nächste*: `C` cycles the context (same order as the widget chip), `J`/`K` or Tab move focus row by row, `X` or Space ticks off, `T` marks *für heute*, `S` starts, Enter opens details. The bead flies for todos that count for today; `Z` undoes | *Nächste*: chips (wrap, never scroll), ring or swipe right ticks off with haptics, the bead flies into the top-bar lens for todos that count for today; tap a row for the detail sheet |
| **Review** | *Wochenrückblick*: six steps with live counts (Inbox, Nächste, Warten auf, Projekte with *steht still*, Irgendwann, Kalender), each opens its list; *Rückblick abschließen* records it. The sidebar shows the last date and a yellow dot after seven days | Glance only: *Projekte* shows *steht still*, *Warten auf* shows *Nachhaken*. The review itself stays on the web (today's non-goal kept) |

## 8. Web build plan (Vue 3, Tailwind, Pinia)

**Tokens.** `frontend/src/styles/tokens.css` is generated (section 10) and imported before Tailwind. `tailwind.config.js` gets a preset that maps utilities to variables, so components never see a hex value:

```js
theme: { extend: {
  colors: { ground: 'var(--rw-ground)', 'ground-sunk': 'var(--rw-ground-sunk)', surface: 'var(--rw-surface)', tint: 'var(--rw-surface-tint)',
    text: { DEFAULT: 'var(--rw-text)', mute: 'var(--rw-text-mute)' }, line: 'var(--rw-line)',
    action: { DEFAULT: 'var(--rw-action)', ink: 'var(--rw-action-ink)', tint: 'var(--rw-action-tint)' },
    structure: 'var(--rw-structure)', attention: 'var(--rw-attention)' },
  fontFamily: { sans: ['Space Grotesk', 'system-ui'], accent: ['Fraunces', 'serif'], mono: ['JetBrains Mono', 'monospace'] },
  borderRadius: { card: '18px', panel: '22px' },
  transitionTimingFunction: { brand: 'cubic-bezier(.2,.8,.2,1)', pull: 'cubic-bezier(.55,0,.25,1)' },
  transitionDuration: { fast: '120ms', base: '180ms', slow: '260ms' } } },
darkMode: ['variant', ['@media (prefers-color-scheme: dark) { &:not([data-theme=light] *) }', '&:is([data-theme=dark] *)']],
```

Fonts move from Google Fonts to the local woff2 files (400/500 only; no synthetic bold).

**Components.**

| Change | Component |
|---|---|
| rewritten | `AppShell.vue` (sidebar, phone tab bar, dock), `NavItem.vue` (glyph, count, dot), `TaskList.vue` (sections, cards, empty and error states, keyboard selection), `TaskRow.vue` (one row for all widths, ring, meta line, hover actions, swipe), `ProjectsView.vue` (overview endpoint, sections, detail from the route), `SettingsView.vue`, `LoginView.vue` (German, tokens) |
| replaced | `TaskModal.vue` → `TaskPanel.vue` (side panel / bottom sheet); `TaskActionSheet.vue` → folded into the panel; `UrgencyBadge.vue` → removed from rows |
| new | `CaptureBar.vue`, `UndoNotice.vue`, `ClarifyPanel.vue`, `ContextChips.vue`, `SearchPalette.vue`, `ReviewView.vue`, `Glyph.vue`, `DayLens.vue`, `InboxPebbles.vue`, `ViewHeader.vue` |
| restyled | `ProjectPlanModal.vue` (numbered tabs, no emoji, `+next` on *Als nächste Aktion*), `BrandMark.vue` |
| new pure logic in `src/shared/` (tested) | `dayProgress.js` (planned and done versus plan, unplanned apart), `lists.js` (sections, the lenient context rule, follow-up), `levelToHeight.js`, `outbox.js` (hold, undo, retry), `keymap.js` |
| routes | add `/review`, read `/projects/:name`, honour `?task=` on every list route, keep all existing routes |

**Three.js, isolated.** A new unit `fe/fx` (allowed to import only `fe/shared`) holds `fx3d.js`. `DayLens.vue` always renders the SVG lens first; on mount, if WebGL works and motion is not reduced, it calls `const { Fx } = await import('@/fx/fx3d.js')` (Vite splits `three@0.169.0` into its own chunk), creates one `Fx` per app (provided at the root, moved between header slots), and cross-fades. The module takes numbers only (`setLevel`, `dropBead`, `setPebbles`, `beadEntry`) and never reads the store. `onUnmounted` detaches the canvas; `webglcontextlost` switches back to SVG. The bead's DOM part (`useBeadFlight.js`) lives in the tasks feature and asks `DayLens` for its entry point. Inside `Fx` one `requestAnimationFrame` loop serves all animations (an animation that starts another one, such as the bead landing and the level rising, must not open a second loop).

**Keyboard and focus.** The row body is a `<button>` (Tab reaches every row; Enter opens details, in the Inbox *Klären*). `J`/`K` move the selection **and** the DOM focus, so screen readers announce the row. The Inbox opens with its first item selected. When a row leaves (done, clarified), focus moves to its neighbour before the list redraws. Space on a focused row ticks it off. Row actions stay out of the tab order (they repeat what the panel offers) and show on focus-within. `keymap.js` holds the map; `?` lists it.

**Undo notice.** Desktop: in the dock row, to the right of the capture field, so it never sits on a card. Phone: stacked above the field inside the dock; while it shows, the list gets its height as extra bottom padding and the selected row is scrolled above it.

**Refresh policy** (so *Stand hh:mm* is true): load on open; again when the tab becomes visible or the window gets focus and *Stand* is older than a minute; after every send from the outbox; every 5 minutes while visible; `R` or a click on *Stand* by hand. A failed load keeps the old rows and *Stand* and says *Nicht geladen · Erneut laden*. Android keeps its own policy (open, resume, after each send, every 30 minutes, pull).

**Outbox** (`outbox.js`, same rules as Android's Room outbox): IndexedDB queue with the states held → pending → sending → sent | failed | paused_auth; 6 s hold for undo; linear 30 s backoff capped at 5 minutes; 5xx at most 8 attempts, 4xx failed at once, 401 pauses every row until the next login, 429 waits for `Retry-After`; a duplicate check (`GET /tasks?status=all&q=`) before a capture is sent again; only one tab sends (Web Locks), the others watch through a `BroadcastChannel`. Failed rows show *Nicht gesendet* with *Erneut senden*.

## 9. Android build plan (Kotlin, Compose)

**Theme from tokens.** Generated `RunwayTokens.kt` (colours as `Color(0xFF…)`, mixes precomputed), hand-written `RunwayTheme` on top: `lightColorScheme(primary = Coral, onPrimary = Ink, secondary = Plum, background = Bg, surface = Paper, surfaceContainer = BgAlt, outlineVariant = Hairline, error = ActionInk …)` and the dark counterpart; **dynamic colour off**. Fonts bundled in `res/font` (Space Grotesk 400/500, JetBrains Mono 400, Fraunces 300 italic) into `Typography`; `Shapes(small = 8.dp, medium = 12.dp, large = 18.dp, extraLarge = 22.dp)`; `RunwayMotion` with the easings and springs from section 3.

**Screens.** `Scaffold(bottomBar = Column(NoticeBar, CaptureField, NavigationBar))`; the `LazyColumn` gets the inner padding, so nothing floats over a row and no blur band is needed behind the field (Compose has no backdrop blur). `NavigationBar` with the five lists (labels exact: *Inbox*, *Nächste*, *Warten auf* stay findable by text); Back from any list returns to Inbox, as today. Rows in section cards, rings 24 dp in 48 dp targets, row accessibility strings unchanged (`<description>, <status>, ID <8>`), `Abhaken: <description>` unchanged.

**Keyboard up (chosen option for P08 §1).** The `NavigationBar` is not `imePadding`ed, so the IME covers it. While the IME is visible (`WindowInsets.isImeVisible`), the top bar becomes a 48 dp `PrimaryTabRow` with three text tabs *Inbox · Nächste · Warten auf* and *Mehr*; the Inbox count is its own `Text`. The pebble slot leaves while typing, and `Stand hh:mm` moves to the right end of the section line. Tapping *Nächste* is one tap and closes the IME (Nächste opens without keyboard, as pinned). Scroll, tap beside or the first Back close the IME and keep the draft; then the normal top bar and the navigation bar return. Measured in the prototype (412 × 915 dp, IME 278 dp): the list runs from 121 dp (first row) to the field at 571 dp, room for **7 one-line rows of 60 dp, 6 while the notice is shown** (P04 asks for 5). Shot: `android-inbox.png`. Rejected alternative: the NavigationBar above the IME costs 80 dp and leaves exactly 5 rows, 4 with the notice.

**Notice.** In the bottom stack, above the field, in flow. It never covers a row; when it appears, the row you worked on is kept in view (`LazyListState.animateScrollToItem` if it would end under the new viewport edge).

**Nächste keeps P08's shape.** Heading `Fällig` first (unfiltered), then `Nächste Aktionen` = exactly `/gtd/next` under the chip, so a due next action is in both. *für heute* is a group label inside the card (after the `Nächste Aktionen` heading), not a section. Headings are literal strings (`Fällig`, never `FÄLLIG`: Compose cannot uppercase by style). Section counts, the progress caption and `Stand hh:mm` are separate `Text` nodes.

**Refresh.** Pull-to-refresh (`PullToRefreshBox`) on every list, as pinned; refresh on open, on resume, after each sent action and every 30 minutes; the widget as today.

**Effects.**

| Effect | Implementation |
|---|---|
| Tageslinse | `Tageslinse(level, impact)` composable: `remember { RuntimeShader(LENS_AGSL) }`, `Modifier.drawBehind { shader.setFloatUniform(…); shader.setColorUniform("coral", …); drawRect(ShaderBrush(shader)) }`; the colour uniforms are `layout(color) uniform half4`, so brand sRGB values are converted on the wide-gamut panel; level from `animateFloatAsState(spring(0.62f, 180f))`, tilt from an `Animatable` kicked on impact (ζ 0.4); redraws only when these change. `semantics { contentDescription = "Heute 3 von 7 erledigt" }` |
| Bead | a screen-level overlay `Box(Modifier.drawWithContent { drawContent(); drawBeads() })`; rows report their ring centre with `onGloballyPositioned`; each flight is an `Animatable(0f)` read through `PathMeasure.getPosition`; `HapticFeedbackConstants.CONFIRM` on impact. The row leaves the list immediately (`animateItem` placement only, no exit fade), which keeps the "gone from the tree within 1 s" contract |
| Pebbles | same shader in mode 1, `setFloatUniform("pebbles", FloatArray(36))`; more than nine: nine and a `+N` `Text`. Shown in the Inbox top bar while the keyboard is down |
| Real 3D | not needed. Filament / SceneView only if Uli wants the web's physical glass 1:1 on the phone; that costs a 3D engine (about 2 MB) for a 56 dp object, so not recommended |
| Reduced motion | `Settings.Global.ANIMATOR_DURATION_SCALE == 0` or *Animationen entfernen*: no flight, `snapTo`, static `Canvas` lens (`drawArc` + clip) |

**Glance widget.** `GlanceTheme(colors = RunwayGlanceColors)` (fixed brand day and night colours instead of dynamic): light = bg ground, ink text; dark = ink 82 % + plum ground (luminance about 0.01, P09 asks < 0.35), bg text, plum-light rings. Header unchanged (`Inbox N · fällig M`, chip, `+` with *+ Todo*, which opens the capture overlay, as today); left of it `Image(ImageProvider(R.drawable.lens_level_N))`, nine vector drawables with `drawable-night` variants; one line *3 von 7 heute* (plus *· 1 zusätzlich*); rows unchanged. Glance can only use system font families, so the widget stays in the system sans and mono (platform limit, not a choice). Still text and vectors only, `views_bitmap_memory = 0`. Mocked in both themes: `android.png`, `android-dark.png`.

**Tile, overlay, share.** Tile icon becomes the plus glyph in a ring. The overlay and the share card stay **plain Views** (time budgets) with brand drawables: paper card with 22 dp top corners, pill field with the plum focus ring, the notice with *Rückgängig*, a *Schließen* text button, nothing else (P05); the share card's coral `In Inbox` pill with ink text. Their font is the open question in section 15 (Space Grotesk via `ResourcesCompat.getFont` must be measured against the 700 ms tile budget). Launcher icon: the brand mark on `--ar-bg` as an adaptive icon with a monochrome themed layer, replacing the blue plus.

## 10. One token source

`tokens.json` (W3C design-token format, in this folder) holds brand colours, semantic colours for light and dark (mixes stored as formula plus computed hex), fonts, type roles, radii, spacing, sizes, durations, easings and springs. A dependency-free script `tools/tokens/build.mjs` (about 80 lines) writes:

- `runway/frontend/src/styles/tokens.css` (CSS variables, `color-mix()` kept where the browser can do it) and `frontend/tailwind.tokens.js`
- `runway-android/app/src/main/java/com/agenticreach/runway/ui/theme/RunwayTokens.kt` (colours, `TextStyle`s, shapes, `CubicBezierEasing`s, `spring()` specs)

CI fails when a generated file differs from a fresh build. The brand values come from the kit's `tokens.css`; nothing in either app names a hex value directly.

## 11. Accessibility

- All text is DOM or Compose text; the canvas is `aria-hidden`; the lens has a text equivalent in its caption and an `aria-live` announcement (*Erledigt: … Heute 4 von 7.*).
- Contrast: body 16.6:1, mute 4.9:1, coral text uses `action-ink` (5.2:1 light, 7.6:1 dark), buttons carry ink on coral (7.0:1), rings use 50 % ink (non-text 3:1). Overdue is coral *and* the word *überfällig*; *fällig heute* is ink, so it stays measurably less red (Android contract); stalled is a yellow dot *and* *steht still*; nothing relies on colour alone.
- Keyboard: everything reachable by Tab (row bodies are buttons); `J`/`K` move the DOM focus, not only a highlight; focus survives rows leaving; focus ring 2 px plum (plum-light on dark), also on the capture field; selected row has a plum bar and tinted ground; `?` lists all keys; skip link to the list. On touch, no key hints are shown.
- Targets ≥ 44 px on the web, ≥ 48 dp on Android; no overflow at 150 % font (rows wrap to two lines, chips wrap).
- Undo for every write, including delete; no confirm dialogs needed.
- `prefers-reduced-motion` and Android's animator scale switch to the static lens and remove the flight; the app is fully usable without WebGL.

## 12. Performance budget

| | Budget | Prototype |
|---|---|---|
| Web initial JS (without Three.js) | ≤ 120 KB gzip | not measured (no build) |
| Three.js chunk | ≤ 180 KB gzip, loaded after first paint, never on the login route | `three.module.min.js` + `RoomEnvironment` from the CDN |
| Canvas | ≤ 136 × 136 CSS px at DPR ≤ 2, one per screen | one, moved between slots |
| Frames | 0 when idle; ≤ 1 s of frames per completion (bead fall, level spring, one wobble); ≤ 2 ms GPU per frame on an M1 or Iris Xe | measured in Chrome at 60 Hz: 0 draws in 1.5 s idle before and after a completion; one completion 53 draws (web) and 41 (Android preview); an unplanned completion 0; reduced motion 0 |
| Input | a check-off updates the row in the same frame; no animation blocks input | yes |
| Android | cold-start budgets unchanged (tile 700/1200 ms, icon 800/1500 ms): the shader is not on the tile or overlay path, it is compiled once after the first frame of the main screen; the widget is unchanged in cost | not measurable here |

## 13. Effort

| Web | person-days |
|---|---|
| Token pipeline (shared with Android) | 2 |
| Shell, header, phone tab bar, German copy, glyph set | 4 |
| Lists, sections, rows, chips, keyboard selection with real focus, empty and error states | 4.5 |
| Undo hold and outbox (IndexedDB queue, backoff, auth pause, duplicate check, one sending tab), *Stand*, refresh policy, visible load errors | 7 |
| Capture bar, `⇧N` | 1.5 |
| Detail panel with list switch and all fields | 4 |
| Clarify panel and keys | 3 |
| Projects (overview, stalled, status, route), plan restyle | 4 |
| Review, *Alle Todos*, search palette | 3 |
| Settings and login in German | 2 |
| **Tageslinse and pebbles** (module, fallback, bead flight, cross-browser tuning) | **6, risky** |
| Accessibility, reduced motion, system dark mode, QA | 3 |
| **Total web** | **44** |

| Android | person-days |
|---|---|
| Theme from tokens, bundled fonts, dynamic colour off | 3 |
| Navigation bar, five destinations, top bars, tab row while the IME is up | 3.5 |
| *Projekte* and *Irgendwann* glance lists (read-only, tap opens the web in a Custom Tab) | 2.5 |
| Rows, sections, chips; acceptance contract updates with the critic | 4 |
| **Tageslinse AGSL**, fallback, compact top bar | **3, risky** |
| Bead overlay, haptics, row removal ≤ 1 s | 3 |
| Pebbles | 1.5 |
| Glance widget restyle, nine lens vectors with night variants | 2 |
| Overlay, share card, tile and launcher icon | 2.5 |
| Context editor | 1 |
| Performance budgets with fonts, 150 % font, acceptance runs | 4 |
| *Only if Uli lifts the non-goals:* native detail sheet 4, clarify sheet 2.5 | 6.5 |
| **Total Android** | **30 without, 36.5 with the non-goal changes** |

The glance lists moved into the base: a five-destination navigation bar is not shippable without them, and they reverse no non-goal (no planning, no clarifying; a tap opens the web). Fallback if Uli wants Android minimal: three destinations (*Inbox · Nächste · Warten auf*) in the `NavigationBar`, *Projekte* and *Irgendwann* as *Im Web öffnen* entries under *Mehr*; this saves the 2.5 days and changes nothing else (not mocked).

Risky parts: transmission glass doubles the scene render and differs between GPUs (Safari and low-end Windows need a quality step down or the SVG); the bead's route has to survive sticky headers, scrolling and resizing; Space Grotesk in the plain-View overlay may cost the tile budget; the Android contract changes (navigation bar, native sheet instead of Custom Tab, brand colours instead of dynamic colour) need the critic's sign-off; the AGSL file is written to the AGSL subset but has not been compiled on a device yet.

## 14. Brand deviations (need Uli's approval)

Written like the approved slide deviations in `strategie/brand-identity/visuell.md`: what the kit says, what runway does, why. Everything else follows the kit (brand colours and `color-mix()` only, three typefaces, pills, paper cards with hairlines, shadows only from `--ar-shadow-{sm,md,lg,xl}`, the mark unchanged).

1. **Own glyph set** (26 glyphs from the mark's line-and-node vocabulary). The kit says no icon libraries and mono symbols only. An app's navigation and row actions need recognisable shapes at 20 px, and `→` is not even in the shipped mono subset. No third-party set is used.
2. **Glass, in one place.** The kit forbids glassmorphism beyond the nav blur. The Tageslinse and the Inbox pebbles are 3D glass objects (the approved motion-graphic look), one per screen, and they carry data. No glass panels, no blurred cards. The only blur is the kit's own nav recipe on the web capture dock. Android has no blur at all (the field sits in flow, nothing behind it to blur).
3. **Coral beyond the primary action, as a closed list.** Kit-conformant (primary action, `//`, pulse): *Abhaken*, the capture send button, *Übernehmen*, *In Inbox*, the widget `+` and the overlay send button (capture is runway's primary action), *Rückblick abschließen*, *Festlegen*, *Speichern*, the `//` mark, the *läuft* pulse dot. **Deviations:** the check-off ring (hover, fill, the swipe-to-check-off tint), the overdue ring (the Android contract requires overdue to be measurably red; coral is the brand's red), the Tageslinse liquid and its 14 px and widget miniatures, the bead and the thread, and *Rückgängig* in coral on the ink notice (the notice's one action; 6.8:1). In a todo app, ticking off *is* the primary action. Nothing else is coral: selected navigation, tab indicators, switches, step and plan numbers, the plan tab underline, focus rings, the new-row flash and the mocked IME Enter key are plum, plum-light or ink.
4. **Derived shades via `color-mix()`**: `action-ink` (coral 62 % + ink) for small coral text on light (*überfällig*, *läuft*), its dark counterpart (coral 80 % + bg), plum-light (plum 45 % + bg) for plum on ink, and `structure-select` (plum 11 % alpha, bg 11 % on dark) for the selected navigation item. Pure coral text is 2.6:1 and plum on ink 1.6:1; both fail WCAG.
5. **Ink text on coral buttons** instead of the kit's paper text (`.ar-btn-coral`): 7.0:1 instead of 2.6:1.
6. **Dark as an app-wide theme.** The kit defines dark *sections* (ink ground, bg text); the app applies that to whole screens when the system is dark. Cards on ink have no shadow (it does not read); the hairline carries them.
7. **Shading gradients inside depicted objects only**: the lens and pebble fallbacks (SVG), the widget lens vectors and the DOM bead use gradients or highlights to look lit. No gradient on any surface, button or section. Mocks of system UI in `android.html` (wallpaper, Quick Settings, Gboard, share sheet) are not app UI.
8. **System fonts in the widget** (Glance cannot load custom fonts). Not a choice, a platform limit, but visible. The overlay and share card may follow (open question 6).
9. **Product lockup.** Rule 10 says the header logo is the mark plus *Agentic Reach*. runway's sidebar and the Android preview show the mark, **runway** (Space Grotesk 500) and a mono *by Agentic Reach* line. The app is a product with its own name (Android's app and share labels are pinned to `runway`), and Uli uses it for private life too. The mark itself is unchanged; on ink it is recoloured exactly like the kit's `.ar-on-dark` (lines and plum nodes to bg, line opacity 0.55 kept, coral and yellow nodes stay). Fallback: the kit lockup in the sidebar head and *runway* as the page title.
10. **Mono section headings in mixed case** (`// Fällig 1`, `// Nächste Aktionen 13`). The kit's eyebrows are uppercase. Compose cannot uppercase by style, and Android's acceptance driver looks for the literal `Fällig`; the web follows so both look the same. Header eyebrows and field labels stay uppercase on the web.
11. **No `data-i18n`.** The kit asks for `data-i18n` keys on every string (DE with EN). runway is German only (Android's acceptance tests reject English strings), so strings live in one German message file per client (`de.json` through vue-i18n, `strings.xml`). An English locale can be added later without touching components.

## 15. Open questions

1. **Android scope.** Native detail sheet and *Klären* sheet reverse two non-goals in `runway-android/PLAN.md` (confirmed 24.10.2026). Lift them (36.5 days), or keep Android at capture-and-glance with the same look (30 days, details in the Custom Tab as today)?
2. **What counts as "heute"?** This proposal uses due ≤ today, `scheduled ≤ today` and started, and `T` sets `scheduled` to today. Alternative: a `+today` tag. `scheduled` also raises urgency by 5.
3. **Context filter**: adopt Android's lenient rule (context or no context) on the web too, and only on *Nächste*?
4. **Contexts list**: one list in *Einstellungen* for both clients (replacing Android's fixed preset and the web's derived list)?
5. **Product name casing**: *runway* everywhere?
6. **Fonts in the overlay and share card**: brand font if it stays within 700 ms, otherwise system font there only?
7. **Bottom navigation on Android** instead of the three top tabs, with the three text tabs coming back in the top bar while the keyboard is up: the acceptance drivers find tabs by text and should keep working, but the critic has to confirm.
8. **Urgency**: fine to drop it from rows and keep it only in the panel?
9. **Duplicate rows on the web.** P08's shape shows a due next action twice on *Nächste* (*Fällig* and *Nächste Aktionen*). Android must keep it; the web follows for one structure. Alternative for the web only: show it once, under *Fällig*.

## Changes after review

An independent critic reviewed the first version (scores 4 to 7, verdict "below the Things 3 / Linear bar, because of Android and the effects"). What changed:

**Must-fix items**

1. **Android list switching with the keyboard up (P08 §1).** The rule that hid the navigation bar is gone. While the IME is up, the top bar is a 48 dp text tab row *Inbox · Nächste · Warten auf* (section 9); the pebbles leave the top bar while typing. Re-measured P04: 7 one-line rows fit, 6 with the notice. Shot `android-inbox.png`.
2. **A stable lens.** `progress()` counts only planned todos (due, für heute, started) in both numerator and denominator; unplanned completions show as *· 1 zusätzlich*. The bead flies only for todos in *Fällig* or *für heute*; any other completion gets the ring fill and the notice. The signature now completes a planned todo: *3 von 7* becomes *4 von 7*; completing *Mit Nora Workshop-Ablauf abstimmen* afterwards gives *4 von 7 · 1 zusätzlich* (measured on both prototypes).
3. **Nächste in P08's shape on both clients.** *Fällig*, then *Nächste Aktionen* = `/gtd/next` with due duplicates; *für heute* became a group inside it. `Stand hh:mm`, counts and the caption are separate nodes; headings are literal mixed-case strings.
4. **Pebbles.** Tighter heap (nine fit the square canvas), *+N* above nine, the caption stays visible on the phone, age no longer encoded in roughness; inbox rows older than seven days get the yellow dot.
5. **Rows reachable by keyboard.** Row bodies are buttons, `J`/`K` move DOM focus, the Inbox opens with its first item selected (Enter clarifies at once), focus survives rows leaving and Klären moving on (tested with real key presses).
6. **The undo notice never covers rows.** Desktop: beside the capture field in the dock. Phone web: stacked above the field with extra list padding. Android: in flow in the bottom stack; the row you worked on is kept in view.
7. **Build plan gaps.** Glance lists moved into the Android base (30 days, fallback described); refresh policy for both clients; widget mocked in dark (`android-dark.png`); web outbox raised to 7 days with queue, backoff, auth pause, duplicate check and one sending tab (web total 44 days).
8. **Dark glass.** Brighter environment, plum-light glass body and rim, light frost pebbles; the level reads at 44 px and 56 dp (`web-dark.png`, `web-dark-inbox.png`, `android-dark.png`).

**Brand violations the critic found, now fixed or declared**

- Yellow 3 px bar on the stalled banner: removed (the banner keeps its yellow dot).
- Shadows outside the kit: coral focus halos replaced by the 2 px plum focus outline; the bead's coral shadow removed; dark cards have no shadow; mock keys and the bezel use borders.
- Coral beyond the list: switches, selected navigation, tab indicators, step and plan numbers, the plan tab underline, the new-row flash and the mocked Enter key moved to plum, plum-light or ink. What stays coral is now a closed list (section 14, deviation 3).
- Android blur band behind the field: removed (the stack is in flow).
- Product lockup, mixed-case mono headings and German-only strings without `data-i18n`: declared as deviations 9 to 11.
- JetBrains Mono 600: now 400 everywhere (tokens too).
- Logo in dark mode: the line opacity stays 0.55, exactly the kit's `.ar-on-dark`; the Android preview lockup is recoloured the same way.
- Non-brand hex values (widget greys, rim colours): replaced by brand colours or documented mixes.

**Nice-to-have items taken**: the one-tap Klären sheet on the phone web and no key hints on touch (`web-phone-klaeren.png`); ripple and flare removed and the wobble damped (one completion 120 → 53 frames; the second half came from a double render loop, also fixed); the compact lens centred, caption 12 px mono, *3 von 7* in the phone header; Android section counts, *Warten auf* in the sheet, widget `+` opens the capture overlay; overlay mock with only field, notice, *Rückgängig* and *Schließen*; AGSL `layout(color)` uniforms; *Ordnen* with up, down and drag; the `+next` note for the real `lists.js`; *↑ Neue Todos oben* named; a way back to the *Wochenrückblick* from a review step.

**Deliberately left**

- **The three-destination Android fallback is described, not mocked.** Moving 2.5 days into the base answers the cost question; the fallback changes only where two entries live.
- **Due next actions appear twice on the web.** That is P08's shape and keeps one structure on both clients; the alternative is open question 9.
- **Refresh, outbox and duplicate check are specified, not simulated.** The prototype's data is fixed; `R`, a click on *Stand* and returning to the tab only mark the moments.
- **The 3D lens stays, even though its SVG fallback shows the same information.** That is intended (reduced motion must lose nothing); the 3D version adds the bead's hand-off into the glass, one wobble and lit glass, and costs 0 frames when idle.
- **Header eyebrows stay uppercase on the web.** Only the pinned section headings had to change.

**Remaining weaknesses**

- The Android pebbles are rarely seen: the Inbox opens with the keyboard up, and they only show once it is closed.
- The AGSL file is still uncompiled on a device; the preview runs a mechanical GLSL port without colour-space conversion.
- Native detail and Klären sheets on Android still depend on Uli lifting two non-goals; without them, Android keeps the Custom Tab for details.
- Transmission glass still differs between GPUs; Safari and low-end Windows need a quality step down or the SVG.
