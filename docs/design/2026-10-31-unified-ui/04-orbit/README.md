# 04 · Orbit

**You sit at the centre; your next actions orbit you on three rings, closer means more urgent, each context is a sector, so one glance tells you what to do now and where.**

The list stays the work surface. Beside it (web) or above it (phones), the Fokus-Orbit draws the same tasks as a small physical object: a clay disc with one sector per context that has open next actions (sized by how much waits there), glazed beads on urgency rings, raw clay beads in the inbox tray, hollow rings for follow-ups that are due, and the brand mark's central node as "you". Every effect in it explains state. Nothing in it is text; all text is DOM (web) or Compose `Text` (Android).

| File | What |
|---|---|
| `index.html`, `app.js`, `app.css` | web prototype (desktop first, responsive to 412 px) |
| `orbit3d.js` | Three.js renderer of the orbit (lazy, one canvas, on demand) |
| `orbit2d.js` | static SVG renderer ("Karte"): reduced motion, WebGL failure or context loss, and a user option; same information |
| `model.js` | the one orbit model (rings, sectors, slots) shared by all three renderers |
| `android.html`, `android.js`, `android.css`, `orbit-canvas.js` | Android prototype: phone plus widget, tile, share; the orbit drawn the way Compose Canvas would draw it |
| `icons.js` | 22 line icons drawn from the brand mark's vocabulary, plus the inline mark |
| `tokens/tokens.json` | single token source → `tokens/orbit-tokens.css` (web) and `tokens/android/OrbitTheme.kt` (Compose) via `node tokens/gen-tokens.mjs` |
| `shots/` | verified screenshots |

View: from `2026-10-31-unified-ui/` run `python3 -m http.server 8340 --bind 127.0.0.1`, open `/04-orbit/` and `/04-orbit/android.html`. Add `?flat` to force the static orbit. `window.proto` is implemented on both pages as specified in `shared/README.md`; on `android.html` it drives the phone.

---

## Design principles

1. **The list is for doing, the orbit is for choosing.** Rows carry every word; the orbit answers "what is closest to me, and where" in one look. Everything the orbit shows is also in the list, so the orbit can fail, be reduced or be collapsed without losing anything.
2. **Every effect explains state** (rule 5.1 of our Three.js notes). Distance = urgency, sector = context, material = GTD state (glaze clarified, clay raw, hollow follow-up due), yellow ring = needs you today, coral glow = running, flight into the hub = done. No ambient motion, no particles, no idle animation.
3. **Keyboard first, never keyboard only.** One keystroke to capture (`N`), one to complete (`X`), one to switch lists (`1`–`5`), `⌘K` for everything else. On phones the same actions are one tap or one swipe.
4. **Calm by default.** Warm paper, one accent per meaning, mono for facts, a single Fraunces word for the human summary ("*Drei* Aufgaben liegen dir am nächsten").
5. **No loss, no surprise.** Every destructive or completing action holds 6 s with "Rückgängig" on both platforms (Android's outbox rule, now also on the web). The API cannot reopen tasks, so undo is a client hold.
6. **One language, two platforms.** Same names, same tokens, same signature; layout follows the platform (sidebar and split view on the web, bottom navigation and a collapsible orbit header on Android).

## Information architecture (both platforms)

Primary lists, in this order and with these names: **Inbox · Nächste · Warten auf · Projekte · Irgendwann**. Secondary: Wochenrückblick, Alle Aufgaben (with "Erledigte zeigen" and the tickler as "Zurückgestellt"), Einstellungen.

- **Nächste** has fixed sections: **Fällig** (overdue and due today, never filtered by context), then **Jetzt · Bald · Später**, which are exactly the three orbit rings.
- **Context filter**, unified rule: a task matches when it carries the context or no context at all (Android's lenient rule, now on the web too). It applies to Nächste and Alle; Fällig always stays visible.
- **Inbox** is newest first on both platforms (today the web sorts by urgency).
- **Rings** come from fields Uli sets, not from Taskwarrior's score: Jetzt = overdue, due today, running or priority H; Bald = due within seven days or priority M; Später = the rest. The urgency score (without the constant +15 of `+next`) only orders beads inside a ring, so a passed `scheduled` date no longer decides the ring (inventory 1.3).
- **Sectors** exist only for contexts with open next actions, in the order of the context setting (Einstellungen → Kontexte), width = a minimum angle plus a share weighted by count. Tasks without a context sit on the hub ("ohne Kontext", its own filter). A ring-sector cell shows at most five beads, then one "+N" bead that filters the list to that sector and ring; the inbox tray shows at most seven beads plus "+N" within ±0.22 rad. `?volume=real` loads a synthetic set with Uli's live counts (39 next: 29 @computer, 8 @home, 2 without context; 23 in the Inbox).

## Visual language

### Semantic tokens (from `tokens/tokens.json`)

All colours are brand colours or `color-mix()` derivations of them. CSS keeps the `color-mix()` expression; Kotlin gets the resolved value.

| Token | Light | Plum-Nacht (dark) | Use |
|---|---|---|---|
| `canvas` | `bg` | `mix(ink 90%, plum)` | page |
| `surface` | `paper` | `mix(ink 80%, plum)` | list, cards |
| `raised` | `paper` | `mix(ink 68%, plum)` | palette, sheets |
| `space` | `bgCool` | `mix(ink 86%, plum)` | orbit panel |
| `text` / `textMute` | `ink` / `alpha(ink 62%)` | `bg` / `alpha(bg 70%)` | text |
| `line` | `alpha(ink 10%)` | `alpha(bg 12%)` | hairlines |
| `selected` | `alpha(plum 8%)` | `alpha(plum 60%)` | cursor row, active nav |
| `action` / `onAction` | `coral` / `ink` | same | the one primary action per view |
| `focus` | `plum` | `mix(plum 45%, bg)` | focus ring, cursor, focus thread |
| `live` | `coral` | `coral` | running task (kit's live-pulse dot) |
| `attention` | `yellow` | `yellow` | ring, dot or 1 px line only: needs you today |
| `overdueBar` / `overdueText` | `coral` / `mix(coral 62%, ink)` | `coral` / `coral` | overdue bar and "überfällig" text |
| `disc`, `discSelected`, `discDim`, `hub` | paper, paper, `mix(plum 7%, bgCool)`, `bgAlt` | plum-ink mixes | orbit clay |
| `beadNext`, `beadWaiting`, `beadInbox`, `beadDim` | plum, plum-cool, ink-sand, pale | lilac mixes | orbit materials |

Contrast (computed): text on surface 17:1; `textMute` on surface 5.1:1; `overdueText` on paper 5.2:1; ink on coral 7.0:1; coral on Plum-Nacht canvas 7.0:1.

### Type

Space Grotesk 400/500, Fraunces italic 300 for one accent word, JetBrains Mono for facts (dates, counts, contexts, eyebrows, keys).

| Role | Web | Android |
|---|---|---|
| display (view title) | 30/34, 500, −0.03em | 31sp |
| title | 18/24, 500 | 19sp |
| body (row) | 15/21, 400 | 16sp |
| small | 13/18 | 14sp |
| meta (mono) | 11.5/16 | 12.5sp |
| eyebrow (mono, caps) | 11/14, +0.08em | 12sp |
| accent (Fraunces italic 300) | 18/24, plum | 19sp |

### Shape

Pills for every button, chip, field and the capture bar; 12 px inputs in forms; 18 px cards; 22 px panels and sheets; rows are not cards (hairlines, 14 px hover radius). Touch targets ≥ 44 px web, ≥ 48 dp Android.

### Motion

| Token | Value | Used for |
|---|---|---|
| `ease` | `cubic-bezier(.2,.8,.2,1)` (brand) | UI transitions, bead settle |
| `easeCamera` | `cubic-bezier(.65,0,.35,1)` | camera and flights |
| `fast` / `base` / `slow` | 120 / 180 / 260 ms | hover / state / panels |
| `camera` | 700 ms | sector focus, detail focus |
| `complete` | 900 ms | the signature flight |
| `flight` | 1100 ms | review steps |
| `undoHold` | 6000 ms | undo window, drawn as a draining 1 px yellow line |

## Iconography

22 glyphs on a 24 grid, 1.6 stroke, round caps, filled dots for nodes (`icons.js`). They are built from the mark's own vocabulary: the hexagon (Projekte), the node and ring (Nächste is a node with an orbiting dot), dashed rings (Warten auf, Irgendwann). Mono symbols (`//`, `→`, `·`, `↺`) stay where the kit uses them. Two small derived glyphs carry orbit meaning into the DOM: the **sector glyph** (a pie slice showing where a context sits on the disc, used in the sidebar, chips and palette) and the **ring glyph** (three circles, one bold, for Jetzt/Bald/Später headings). Android uses the same paths as VectorDrawables. No icon library. This is a brand deviation (below).

## Signature moments

1. **Erledigt** (both platforms). The bead lifts and turns coral, travels along your focus thread into the hub, leaving a ripple where it sat; the hub glows once and "Heute erledigt" under the disc counts up (a number, no dial). The row leaves within 260 ms (Android's ≤ 1 s rule), "Erledigt · Rückgängig" holds 6 s. Undo sends the bead back out of the hub.
2. **Steht still.** If that was a project's last next action, an empty yellow ring stays in its slot, labelled "Garten · kein nächster Schritt". Projekte flags it, the review flies to it, and adding a next step fills the slot.
3. **Klären.** A raw clay bead leaves the inbox tray on an arc and lands in its sector and ring; halfway it turns from clay to glaze, and it stays highlighted for 1.5 s after landing.
4. **Wochenrückblick.** A guided camera flight: Inbox tray, waiting ring, then project by project (stalled first), then Irgendwann; finishing records the review.

`proto.signature()` completes the bead nearest the viewer whose completion stalls a project and freezes the flight mid-arc for the screenshot (`shots/web-signature.png`).

## Effects

| Effect | What it explains | Web (Three.js) | Android (native) | Reduced motion / fallback |
|---|---|---|---|---|
| Urgency rings | how close a task is (Jetzt, Bald, Später) | 3 torus lines on the disc, opacity falls outward; ring names as DOM labels (11 px) | `drawOval` rings, `Text` ring names | SVG map, same rings |
| Context sectors | where a task is done, and how much waits there; filter | extruded clay wedges (`MeshPhysicalMaterial`, sheen) per context with open tasks, width weighted by count; 0.09 grooves with a 1 px `ringLine` groove line; selected wedge lifts, others dim | `drawPath` wedges in a fixed 2.5D projection; the chosen sector lifts, nothing rotates; labels are not touch targets, the 48 dp chips filter | SVG wedges, click to filter |
| Materials | GTD state | glazed bead (clearcoat over a matte body, no transmission pass) = clarified; matte clay = raw inbox; hollow torus = follow-up due | `Brush.radialGradient` spheres; grey clay; stroked ring | filled, grey, outlined circles |
| "+N" bead | more in this cell than fit | a numbered DOM marker on the bead's slot; click filters the list to sector and ring | same, tap | same |
| Yellow ring | needs you today (overdue, follow-up due) | flat emissive yellow torus under the bead | stroked oval | SVG stroke |
| Coral core + halo | running ("läuft") | small emissive core plus one additive halo sprite (gradient clamped before `pow()`) | AGSL `RuntimeShader` glow | coral fill, static pale halo |
| Focus thread | your keyboard cursor / selected task | `TubeGeometry` arc from hub to bead, draws on in 320 ms | `Path` stroke on selection | SVG path |
| Hover link | which bead is which row | raycast hover: bead scales, DOM tooltip, row highlights; row hover does the same back | tap bead opens the sheet | same in SVG |
| Completion flight | done | bead travels the thread into the hub, ripple at origin, hub glows once; the count is DOM | `Animatable` along a `Path`, glow, haptic tick | instant: row gone, count updated, toast |
| Stalled ghost | a project lost its next action | empty yellow torus keeps the slot, DOM label | stroked oval + `Text` | SVG ring + label |
| Clarify flight | inbox item now lives in a context and ring | arc from tray to slot, clay → glaze halfway, stays emphasised 1.5 s | same, `Animatable` | instant |
| Capture drop | the capture arrived | clay bead drops into the tray (620 ms) | none (the Inbox has no orbit) | instant |
| Camera | what you are looking at | eased moves: sector focus centres the sector (700 ms), review steps frame the project's beads (1100 ms) | none: the disc is fixed, the sector lifts | none |
| Waiting beads | a follow-up is due | only due follow-ups become beads, on the outer ring in their own or their project's context sector (else on the hub); the rest is the count "Warten auf N" | same | same |
| Collapsing header | the orbit gives way while you work the list | phone width: 184 px header collapses to a one-line stats strip on scroll | Nächste only: collapses to the far half of the disc on scroll; no orbit on Inbox | instant |

The orbit appears only on Nächste and in the weekly review. Elsewhere the side column holds the task details or nothing, and the list gets the width; `O` hides it on Nächste. The detail column no longer flies the camera to a 3D close-up: it shows a static place glyph (sector + ring).

Rendering rules: one canvas per screen, created after first paint by `import('./orbit3d.js')`; `webglcontextlost` and a change of `prefers-reduced-motion` switch to the SVG map at runtime; renders only on change (tween list empty = no frames); paused when hidden (`IntersectionObserver`, `visibilitychange`); `NeutralToneMapping`; light rig of hemisphere, warm key with PCF soft shadows, cool fill, rim, plus `RoomEnvironment` reflections; halo gradient clamped before `pow()`; scene background equals the CSS `space` token, so the canvas has no seam. We deliberately skip a full-screen `UnrealBloomPass`: it would tone-map the DOM-matching background (a visible seam in Plum-Nacht) and cost several extra passes for two highlights.

## Key flows

| Flow | Web | Android |
|---|---|---|
| **Capture** | `N` anywhere, type, Enter. "In Inbox ✓ · Rückgängig", a clay bead drops into the tray, the field stays open. `⌘K` → "Als Todo erfassen" works too. Phone width: the field docks above the bottom bar. | Unchanged contract: Inbox opens with "Neues Todo" focused, keyboard up. Tile "+ Todo", widget "+", shortcut and lock screen open the plain-View overlay; share card "In Inbox". FAB "+ Todo" on the other tabs opens the same overlay. |
| **Clarify** | Inbox row `C` (or "Klären"): strip with the text field (rephrase as the next visible step), "Nächste in" (1–9 = context, 0 = ohne Kontext), `W` Warten auf (asks "Nachhaken am", default +7 days, and an optional "bei wem"), `I` Irgendwann, `X` Gleich erledigt, `⌫` Löschen, optional project. Only tags are added (`tags_add`). Cursor moves on. | Tap an inbox row: menu Klären · Bearbeiten · Löschen. Klären opens a sheet with exactly the web's choices (text, contexts plus ohne Kontext, project, Warten auf with date and person, Irgendwann, Gleich erledigt, Löschen). Bearbeiten opens the pinned in-place edit area ("Todo bearbeiten", field "Beschreibung", "Abbrechen"/"Speichern") and never creates a new task. (Scope change, see open questions.) |
| **Do** | Nächste: Fällig first, then Jetzt/Bald/Später; the "Als Nächstes" card under the disc names the innermost bead with Starten/Erledigt. Click a sector, a "+N" bead, the hub (ohne Kontext) or `[` `]` to filter; the camera centres the sector. `J`/`K` move the cursor and the focus thread; `X` completes; `E` opens details in the side column (the orbit gives way). `O` hides the orbit. Phone width: the same chip row as Android under the title. | Nächste with the orbit header and the chip row (Alle + contexts, one selected, 48 dp). Tap a sector on the disc or a chip; nothing rotates. Rows show the context also on Nächste. Check ring or swipe right completes with the same flight; tap a row for the detail sheet. |
| **Review** | `R` or sidebar: Inbox leeren → Warten auf prüfen → each active project (stalled first, with "Nächster Schritt" + context, or "Pausieren" / "Abschließen") → Irgendwann → saved (`POST /gtd/review`). Camera frames each project's beads. "Aktivieren" (Irgendwann) and the plan's "→ Nächste" use the same context choice as Klären. | Mehr → Wochenrückblick (or Projekte): a pager with the same steps (Inbox, Warten auf, each project stalled first, Irgendwann, Fertig); the project's sector lifts; the same stalled card with "Anlegen", "Pausieren", "Abschließen"; "Fertig" sends `POST /gtd/review`. Step changes by buttons and dots, so no gesture competes with the list. |

## Web build plan (Vue 3, Pinia, Tailwind)

- **Tokens**: `tokens.json` generates `src/styles/tokens.css`; `tailwind.config.js` maps `colors`, `borderRadius`, `fontFamily`, `transitionTimingFunction` and `transitionDuration` to the CSS variables (`colors: { canvas: 'var(--o-canvas)', … }`), `darkMode: ['variant', ':root[data-theme=dark] &', '@media (prefers-color-scheme: dark)']`. Remove indigo and Tailwind greys. Load Space Grotesk 400/500 locally (no synthetic bold).
- **Shell**: `AppShell.vue` becomes a three-column grid (rail · list · orbit) with a bottom `TabBar.vue` under 760 px; `NavItem.vue` gets icons from `icons.js` (as `<OrbitIcon name>`), counts and key hints. Router gains `?task=<uuid>` on every list route (opens details, fixes the broken Android handoff) and honours `/projects/:name`.
- **List**: `TaskList.vue` renders sections (Fällig, Jetzt, Bald, Später) from a pure `src/shared/orbitModel.js` (this `model.js`, unit-tested with vitest like `contextTags.js`). `TaskRow.vue` is rebuilt (check ring, meta line, Fällig marks, no urgency badge). New `CaptureBar.vue` replaces the "+" modal for capture (`POST /inbox`), `ClarifyStrip.vue` uses `tags_add`/`tags_remove`.
- **Details**: `TaskModal.vue` becomes `TaskDetail.vue` inside the orbit column (desktop) or a sheet (phone); autosave per field; adds delete, annotations, depends, recur check (needs due).
- **Undo layer**: `stores/pending.js` holds complete/delete/clarify writes 6 s before sending; the toast reads it. Same semantics as Android's outbox.
- **Projects**: use `GET /gtd/projects/overview` (counts, status, stalled), `PUT /projects/{name}/status`; `ProjectPlanModal.vue` becomes the "Plan" tab with the same five steps; "Aktionen" creates `+next @ctx` tasks so they land in Nächste.
- **Review**: `ReviewView.vue` with steps; `POST /gtd/review` at the end; `GET /gtd/review` shows "zuletzt".
- **Palette**: `CommandPalette.vue` (`⌘K`), commands plus client search, "Als Todo erfassen".
- **Orbit isolation**: `features/orbit/OrbitPanel.vue` owns one `<div>` stage. On mount it checks `prefers-reduced-motion` and WebGL, then `await import('./orbit3d.js')` (Vite splits Three.js into its own chunk; `three` as an npm dependency pinned to 0.169.x, no CDN in production) or `orbit2d.js`. The panel talks to it only through the adapter API (`update`, `hover`, `focus`, `complete`, `restore`, `frame`, `setInsets`, `setColors`, `dispose`). The orbit never touches Pinia; Pinia never imports Three.js. `fe/orbit` becomes a feature next to `fe/tasks`, reading the task store through a selector (recorded exception, like projects reusing the list).

## Android build plan (Kotlin, Compose, Glance)

- **Theme**: `gen-tokens.mjs` writes `ui/theme/OrbitTheme.kt` (`OrbitColors` light/dark, `OrbitType`, `OrbitMotion`, `OrbitGeometry`); fonts as `res/font` (Space Grotesk, Fraunces italic, JetBrains Mono). `MainActivity` drops `dynamicLightColorScheme` for `OrbitLight`/`OrbitDark` mapped onto a Material 3 `ColorScheme` so stock components follow. Launcher icon becomes the brand mark on plum (adaptive + monochrome).
- **Navigation**: default stays the pinned top tabs Inbox · Nächste · Warten auf plus "Mehr" (Projekte, Irgendwann, Wochenrückblick, Suchen). A five-item `NavigationBar` is built as an option until Uli and the critic approve it. Inbox stays the start destination with the focused field and keyboard and has no orbit.
- **Orbit header**: `OrbitCanvas` composable = `Canvas` with the projection from `orbit-canvas.js` (wedges `drawPath`, rings `drawOval`, beads `Brush.radialGradient`, shadows `drawOval`), labels as `Text` placed with the same projection, `Modifier.pointerInput` for taps only (no drag, no rotation), `nestedScroll` connection collapsing it to the half-disc. Sector labels are plain `Text`, not touch targets; filtering is the chip row (48 dp). The canvas carries one `contentDescription` summary; the chips are the accessible filter.
- **AGSL**: one `RuntimeShader` (glow: soft radial falloff with clamped exponent) used for the running bead and the completion flight, applied via `Modifier.graphicsLayer { renderEffect = … }` only while `Animatable`s run. Nothing else needs real 3D, so no Filament/SceneView (Filament would add ~4 MB and start-up cost on the cold path for no new information).
- **Rows and gestures**: existing `ListGestures.kt` swipe and pull stay; rows restyled; check ring keeps contentDescription "Abhaken: …"; overdue bar coral (passes the hue test), "überfällig" text in `overdueText`.
- **Sheets**: `ModalBottomSheet` for details (subset of fields: list, context, project, due, start, notes, "Im Web öffnen"), Klären, Mehr; review as `HorizontalPager`.
- **Widget (Glance)**: same content and contract, `GlanceTheme` from `OrbitColors` instead of dynamic colour, check rings as the one vector, no bitmaps (the orbit is deliberately not in the widget).
- **Tile, overlay, share**: plain Views as today (cold-start budget). The tile only supplies label, subtitle and the mark as icon; the system paints it. Overlay and share card use the token values: pill field with plum border, coral "In Inbox", notice "In Inbox ✓ · Rückgängig" (plum text, not coral).
- **Search**: "Suchen" in Mehr, over all open tasks (the web has `/` and ⌘K).

## One token source

`tokens/tokens.json` holds brand colours, semantic colours per theme, type, shape, motion and orbit geometry. `node tokens/gen-tokens.mjs` writes `orbit-tokens.css` (CSS variables with `color-mix()`, light, `prefers-color-scheme` dark, and `[data-theme]` overrides) and `android/OrbitTheme.kt` (resolved ARGB, sp, ms). The orbit geometry (`hub`, `rings`, `wait`, `tray`, `bead`) is in the same file, so Three.js, SVG and Compose place beads identically. In the real repos the script runs in CI and fails on drift.

## Accessibility

- All text in the DOM / Compose; the canvas is `aria-hidden`; the orbit has a screen-reader description and its sector labels are real buttons with `aria-pressed`.
- Every action has a keyboard path; focus is a 2 px plum ring; `?` lists shortcuts; the palette is a listbox.
- Colour never carries meaning alone: yellow ring + "überfällig"/"Nachhaken" text; rings + section headings; running = coral + "läuft".
- `prefers-reduced-motion`: the SVG map replaces the 3D scene, all transitions drop to 1 ms, the countdown line is static. Same information, same interactions.
- Android: rows keep the contract strings (`<Beschreibung>, <Status>, ID <8>`), 48 dp targets, no overflow at 150 % (chips wrap), sectors as semantics nodes; the list remains the accessible surface, beads are not separately focusable.

## Performance budget

| | Budget |
|---|---|
| Web first paint | list interactive before Three.js loads; orbit chunk loads after first paint (`requestAnimationFrame` → dynamic import) |
| Web orbit | one canvas, DPR ≤ 2, about 60 draw calls, 1024² shadow map, one PMREM at start; 0 frames when idle; ≤ 8 ms per animated frame on an M1 laptop (target, not yet measured); GPU memory < 40 MB |
| Web bundle | Three.js chunk about 170 KB gzip, loaded once and cached; no post-processing passes |
| Android | `OrbitCanvas` draw ≤ 2 ms per frame on Pixel 9; no frames when idle; shader only while animating; header composes after the first frame so "icon → Inbox with keyboard ≤ 800 ms" holds; tile/shortcut/share paths untouched |

## Effort estimate (person-days)

Re-estimated after the review; the first figure (33 + 31) left out the context editor, the German strings, error and offline states, the crowding logic and the contract work.

| Web | pd | Android | pd |
|---|---|---|---|
| tokens, Tailwind mapping, fonts | 2 | OrbitTheme, fonts, brand instead of dynamic colour, icon | 2 |
| shell, tab bar, header, capture bar, context chip row | 3.5 | top tabs + Mehr (default), bottom bar as option, IA | 3 |
| all web strings to German (and i18n keys, see deviations) | 1.5 | contract renegotiation (tabs, Custom Tab rule, row heights) with the critic | 2 |
| list sections, rows, cursor, shortcuts | 3 | OrbitCanvas (projection, wedges, beads, labels, half-disc) | 6 |
| command palette | 2 | crowding: "+N" beads, weighted sectors, hub slot | 2 |
| detail panel, `?task=` route, autosave, tags/depends/recur editors | 5 | AGSL glow, completion and clarify animations, haptics | 3 |
| clarify strip, 6 s undo layer | 3 | rows restyle (swipe and pull kept), search | 3 |
| context editor (stable sector order) | 2 | context editor (shared setting) | 2 |
| projects (overview, status, stalled, plan tab) | 3 | detail sheet, Klären sheet, in-place edit | 5 |
| weekly review | 3 | review pager with all steps | 4 |
| orbit 3D (scene, materials, labels, camera, signature) | 6 | Glance widget, tile overlay, share card restyle | 3 |
| crowding: "+N", weighted sectors, hub slot, tray cap | 2 | error, offline and outbox states restyled | 2 |
| SVG map (fallback and option) | 2 | acceptance runs (P03–P10) | 3 |
| error, offline and empty states | 2 | | |
| dark theme, a11y pass, model tests | 3 | | |
| **total** | **45** | **total** | **40** |

## Inventory coverage

Covered: every web list, project detail, plan (five steps), all task fields, search, context filter, start/pause, delete, annotations, settings cards (profile, password, API key, Claude connect, MCP tabs "Claude Code / Claude Desktop / curl", admin), dark mode, all keyboard actions; on Android capture field, tile and lock screen overlay, share, shortcuts, widget, Stand, undo, swipe, pull, Mehr menu, search, in-place edit, Klären, review pager.

Not prototyped, kept as is and restyled with the tokens: web login card (already the brand), Android setup screen, failure notifications, offline row statuses ("wartet auf Netz", "Nicht gesendet", badge, banners), usage-log export. The tickler appears in the build plan as the "Zurückgestellt" filter of Alle Aufgaben, not in the prototype. Someday tasks are deliberately **not** in the orbit (they are outside your current orbit; Irgendwann says so).

Android contracts this proposal touches (need Uli and the critic): tabs move into a five-item bottom bar (labels kept); the section after "Fällig" becomes "Jetzt/Bald/Später" (allowed: not the bare word "Nächste"); tapping a Nächste/Warten auf row opens a native sheet with "Im Web öffnen" instead of a Custom Tab directly; the widget uses brand colours (luminance limits still met by `surface`).

## Brand deviations (need Uli's approval)

1. **Custom icon set** (22 glyphs, `icons.js`). The kit allows only mono symbols and the logo. An app with navigation and row actions needs recognisable glyphs at 18–24 px. They are our own, drawn from the mark (hexagon, node, ring), no library.
2. **Gradients inside 3D shading** (bead highlights on Android, the halo sprite of a running bead on the web). The kit forbids gradients; these are lighting on objects, never backgrounds. (Glass is gone: beads are clearcoat glaze, so there is no glassmorphism left beyond the palette backdrop in 8.)
3. **Coral beyond the main action**, exactly three further uses: "läuft" (the kit's own live-pulse dot), the overdue bar, and a derived `mix(coral 62%, ink)` for the "überfällig" text. Reason: the Android acceptance test requires overdue rows to be measurably red, and coral is the only red-ish brand colour; the darker mix reaches 5.2:1. Not coral any more: "Rückgängig" (plum on ink), the check ring of running rows, secondary buttons. The capture "+" is a 22 px coral dot inside the field, the one primary action; the second strong button in a view is an ink pill.
4. **Ink text on coral buttons** (kit: white). White on coral is 2.6:1 and fails WCAG AA; ink on coral is 7.0:1.
5. **Yellow with a fixed meaning**: the yellow ring always means "braucht dich heute" (overdue, follow-up due, stalled project), and the undo countdown is a 1 px yellow line. Both stay within "dot, ring or 1 px line".
6. **Product lockup**: mark + "runway" in Space Grotesk + mono "by Agentic Reach" instead of the "Agentic Reach" header lockup, on web and in the Android top bar; the launcher icon becomes the mark. The mark itself is never recoloured: `mark-color.svg` on light, the kit's `mark-mono-light.svg` on Plum-Nacht.
7. **Plum-Nacht surfaces** are `ink`/`plum` mixes (kit: dark sections on plain `ink`). Derived, not invented, listed for completeness.
8. **Blur behind the command palette** (6 px, the kit's own modal backdrop value); no other blur.
9. **German only, no i18n layer in the prototype.** The brand voice asks for EN as the second language via `data-i18n`. The prototype hard-codes German to keep it readable; the build plan moves every string into keys (web: `vue-i18n` messages, Android: `strings.xml`, which it already has) with EN as the second set. Until then the app is German only.

Kept inside the rules after the review: Fraunces italic only for a single word (the summary accent, "Fertig."); project outcomes and review leads are Space Grotesk. Focus is a plain 2 px plum outline or a 1 px border, no home-made shadow rings; elevation uses the kit's `--ar-shadow-*` tokens.

## Open questions

1. **Android scope.** `PLAN.md` (24.10.2026) lists clarifying, review and a native detail as non-goals. Orbit adds Klären, a detail sheet, Projekte and the review pager on Android, without touching capture. Keep Android a companion (then: three tabs, orbit header on Nächste only), or go full client?
2. **Navigation on Android**: the prototype now ships the three pinned top tabs plus "Mehr" as default; the five-item bottom bar is an option (switch on `android.html`). Promote it?
3. **Ring rule**: rings now come from due, start and priority (not the score). With Uli's data most next actions have none of these, so Später is large. Is that honest (it is), or should Uli set priorities more often?
4. **Contexts**: the demo set (`@computer @anrufe @zuhause @unterwegs @buero`) differs from Android's preset; both apps need a small context editor that fixes the sector order.
5. **Several contexts on one task**: the bead sits in the first context that has a sector and is counted in both. Good enough?
6. **Manual dark override** on the web (System / Hell / Plum-Nacht in Einstellungen) — keep, or follow the system only like Android?
7. **Numbers**: the urgency score is shown only in the details footer. Drop it entirely?

## Known weaknesses

- At Uli's volume one context (@computer, 29) dominates: its sector takes about half the disc and its three cells all end in "+N". The orbit then mainly answers "how much is where, and what is innermost", while the list carries the detail.
- The orbit's value over the flat map is still modest; the 3D version earns its place through materials (state) and the completion flight, not through extra information. The "Karte" option is one click away.
- The web phone header (184 px) shows the disc without the tray and the legend; the ring names are the only key there.
- Plum-Nacht beads read as pearl-lilac glaze; fine, but less crisp than in the light theme.
- Performance numbers (≤ 8 ms per animated frame, < 40 MB) are targets, not measured on low-end hardware.

## Changes after review

**Fixed (must-fix)**

1. *Real data.* `model.js` builds sectors only for contexts with open next actions, weighted by count with a minimum angle; tasks without a context get the hub slot and their own filter ("ohne Kontext"), never `CONTEXTS[0]`; at most five beads per ring-sector cell plus one "+N" bead that filters the list to that sector and ring; the tray shows at most seven beads plus "+N" within ±0.22 rad. Checked with `?volume=real` (39 next: 29 @computer, 8 @home, 2 without; 23 inbox) on web desktop, web phone and Android.
2. *Data-loss paths.* Context chips toggle membership; the list switch changes only the status tag; "Blockiert durch" is a searchable multi-select checklist over all open tasks; recurrence offers jährlich and free text (needs a due date); free tags can be added and removed with validation. Android "Bearbeiten" opens the pinned in-place edit area and saves the same task.
3. *Rule 5.1.* A clarified bead stays emphasised 1.5 s and lands as glaze; waiting beads appear only when the follow-up is due and sit in their context's or project's sector (otherwise the hub), the rest is a count; Android no longer rotates (no drag, the chosen sector lifts); no orbit on the Android Inbox; the web detail column shows a static place glyph instead of a 3D close-up.
4. *3D legibility.* Grooves 0.09 with a 1 px `ringLine` line on a darker groove floor; `discDim` raised to `mix(plum 16%, bgCool)`; transmission replaced by a clearcoat glaze (no transmission pass, no lilac pearls); ring and hub labels 11 px. The 3D view now reads about as well as the map; 3D stays the default, "Karte" is a setting and a palette command, and the map is used automatically for reduced motion and WebGL failure or context loss.
5. *Android contracts.* Sector labels are non-interactive (chips filter, 48 dp); Nächste rows show the context; Inbox rows are one line with no "erfasst" line and no half-disc; the QS tile is drawn in system colours; the prototype opens on the Inbox with the keyboard; the pinned top tabs plus "Mehr" are the default, the bottom bar an option.
6. *Phone web.* Chip row (Alle + contexts + ohne Kontext) under the title; "läuft" is a word in the meta line; ring names shown on the phone disc; the collapsed stats strip is a no-wrap grid; the orbit header is 184 px so the first row starts above the middle of the screen.
7. *Same flows on both platforms.* Android review pager has Inbox, Warten auf, projects, Irgendwann and "Fertig" (`POST /gtd/review`); the Android Klären sheet has the project picker and "Gleich erledigt"; Warten auf asks for "Nachhaken am" (default +7 days) and an optional "bei wem" on both; "Aktivieren" and the plan's "→ Nächste" use the clarify context choice; stalled cards offer "Pausieren" and "Abschließen" next to "Anlegen".
8. *Layout and one primary.* The orbit column exists only on Nächste and in the review; elsewhere the list or the detail panel takes the width; `O` toggles it. "Erledigt" in "Als Nächstes" and "Anlegen" are ink pills, so each view has one coral action.

**Brand violations**: logo now uses `mark-mono-light.svg` in Plum-Nacht; "Rückgängig" and running check rings are no longer coral; one coral action per view; Fraunces only for single words; plum shadow rings replaced by outlines; German-only declared as deviation 9.

**Nice-to-have taken**: hub day dial replaced by the "Heute erledigt" number; `followUpDay` reads `scheduled` only; effort re-estimated (45 + 40 pd); the sector filter centres the sector; `webglcontextlost` and live `prefers-reduced-motion` switch to the map; clarify strip has a text field to rephrase; dimmed sector labels use `textMute` (5.1:1) instead of 50 % opacity; sector labels get a 44 px hit area; `kbd` hints hidden on touch; shortcuts are case-insensitive; Android list has bottom padding under the FAB; review pager has no competing drag; "Als Nächstes" lists every running task; nested project names show as `Eltern › Kind`; Android has search in "Mehr".

**Left on purpose**: the 3D view stays the default rather than the map, because after the fixes it carries the same information and the material and completion feedback are the proposal's identity; the map is one click away and automatic where it should be. The capture "+" stays a coral dot on review screens, where "Weiter" is the coral button: it is a glyph inside the field, not a second button. The web phone header keeps the 3D canvas (184 px) instead of switching to the map on phones; on low-end devices the map may be the better default, to be measured. Several contexts per task still place the bead in one sector only (open question 5).

