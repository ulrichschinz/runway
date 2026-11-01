# 05 · Greifbar

**One sentence:** runway becomes a desk of tangible things. You clarify the Inbox by picking up the top card and dropping it into one of five GTD trays; when a tray needs one more answer (a context, a follow-up day), the card waits on the stack while the trays turn into the answers. You tick a task off by pressing a clay pill that squishes and settles. A small toy version of the Agentic Reach mark gets brighter as today's Inbox gets clear.

| File | What |
|---|---|
| `index.html` | Web prototype: desktop first (1440 × 900), responsive to 412 px |
| `android.html` | Android prototype: Pixel 9 frame (412 × 915 dp), plus the widget, the Quick Settings tile with its overlay, the share target, the launcher icon (also at real size) and shortcuts |
| `store.js` | Task model and GTD rules on the shared demo data (lists, tickler, stalled projects, project creation, undo) |
| `ui.js` | Date formatting (Europe/Berlin), step options (contexts, follow-up and tickler days), the glyph set, row and tray markup, the brand mark (inline, unchanged) |
| `stack.js` | The Inbox card stack controller, shared by web and Android (keys, drag, flick, trays, steps, project menu, undo) |
| `card.js` | The physical card: springs that drive one CSS 3D transform, brand shadows by lift height. No WebGL |
| `gl.js` | The single WebGL layer: the clay check pill while it squishes, and the companion. Lazy, on demand, scissored, optional |
| `app.js`, `app.css` | Web app shell, views, details panel, move menu, keyboard |
| `android.js`, `android.css` | Phone app and the Android-only surfaces |
| `tokens.json` | The one token source. `node tokens.mjs` writes `tokens.css` (used by both pages) and `Tokens.kt` (resolved sRGB for Compose) |
| `shots/` | Verified screenshots |

Test hook: `window.proto` exactly as in `shared/README.md`, on both pages. `proto.signature()` grabs the top card, flicks it at Nächste, keeps it on the stack while the trays turn into the contexts plus "Zurück", then drops it into `@computer` after 2.6 s (`proto.signature({ pick: false })` stops at the question). Extras: `proto.frames()` returns the frames drawn so far by the card springs and the WebGL layer, to check that nothing renders at rest; on Android `proto.back()` is system Back.

---

## 1. Design principles

1. **Hand first, key always.** Every gesture also has a key and a button. Clarifying is drag, flick, `1`–`5` or a tap on a tray; a step is answered with `1`–`9` or a tap, and left with `0`, `Esc`, the "Zurück" tray or Android Back. Ticking off is a tap, a swipe or `X`. Gestures are the pleasant way and never the only way.
2. **Calm at rest, tactile in motion.** Lists are flat paper sheets, as calm as Things 3. Depth shows up only while you touch something or while state changes, then it stops. There is no idle animation loop (measured: 0 frames in 2 s at rest).
3. **Every effect explains state** (rule 5.1, translated to an app). The stack's thickness shows what is left. The card's flight shows where the item went. A held card shows that one answer is still missing. The squish confirms it is done. The companion's light shows how much of today's Inbox is clear. Nothing else moves.
4. **Input never waits.** A key pressed during a flight finishes that flight at once and acts on the next card. Flights last 460 ms at most, and a checked-off row is gone within 0.9 s (the Android contract allows 1 s).
5. **One object, one journey** (the throughline). What you capture becomes the card you clarify. The card lands in a tray, turns into a row and ends as a pill. It is the same object on both platforms.
6. **Serious content, playful material.** Text is always real DOM or Compose text in brand type. The play lives in material and motion, never in the words: no cartoon faces, no emoji, no exclamation marks.
7. **Same names, same places.** Five lists in the same order everywhere: Inbox, Nächste, Warten auf, Projekte, Irgendwann. The web uses a sidebar. Phone-width web and Android use a bottom navigation bar and the same Inbox (list first, "Klären · N" opens the stack).
8. **Nothing is decided for you.** No destination is written with a guessed value. Nächste always gets a context you chose, on every route (stack, details, move menu, Android sheet); Warten auf offers a follow-up day.

## 2. Information architecture (both platforms)

| | Web desktop | Web phone width | Android |
|---|---|---|---|
| Lists | Sidebar with counts; the Projekte count carries a yellow dot when a project is stalled | Bottom navigation with 5 items, Inbox badge | `NavigationBar` with 5 items, Inbox badge (replaces the 3 top tabs) |
| Top bar | Product lockup in the sidebar: mark + "runway" + "by Agentic Reach" | Mark + "runway", search (expands in place), Mehr (menu) | Mark + list title, search, Mehr (overflow menu) |
| Contexts | Sidebar list plus chips on Nächste; `C` cycles | Chips on Nächste (they wrap) | `FlowRow` chips on Nächste, "Alle" first |
| Capture | Dock "Neues Todo" at the bottom of every view, `N` | The dock as a solid band directly on the navigation | Inbox: the field directly above the keyboard (as today). Other tabs: extended FAB "Neues Todo". Also tile, share, widget "+", launcher shortcut |
| Inbox | Stack ("Stapel") or list ("Liste"), with the queue beside the stack | List, newest first, "Stand" line with "Klären · N"; the chip opens the stack | Same as phone web; "Klären · N" opens the full-screen stack |
| Details | Right panel (432 px) | Bottom sheet over a scrim | Native bottom sheet, with "Im Web öffnen" for the rare fields |
| Review | Projekte: weekly review strip, stalled projects first, "Neues Projekt", "Rückblick abschließen" | Same | Projekte tab: stalled first, with an inline next action |
| Companion | Sidebar foot | Klären screen header | Klären screen top bar |
| Secondary | Alle Aufgaben, Einstellungen, Tastenkürzel (sidebar foot) | Mehr menu: Alle Aufgaben, Einstellungen, Abmelden | Mehr: Angemeldet als, Widget hinzufügen, Protokoll exportieren, Abmelden |

The context filter uses one rule everywhere: a task matches when it carries the context **or has no context at all** (the runway skill's rule, as on Android today). It filters Nächste only. "Fällig" is never filtered (Android contract); with a filter on it is labelled "Fällig · alle Kontexte" and rows from other contexts shrink to one quiet line. Nächste Aktionen leaves out what Fällig already shows, so no task appears twice. The Inbox has no contexts by definition, and Warten auf and Irgendwann stay unfiltered. The Inbox is sorted newest first on both platforms, as the Android contract requires.

## 3. Visual language

### 3.1 Semantic tokens

Every value refers to a brand token. New neutrals are `color-mix` of brand colours (hard rule 1). Source: `tokens.json`; the prototype pages load the generated `tokens.css`.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--rw-bg` | `--ar-bg` | `--ar-ink` | page, the phone dock band |
| `--rw-side` | bg-alt 55 % + bg | bg 3 % + ink | sidebar, bottom navigation |
| `--rw-sheet` | `--ar-paper` | bg 6 % + ink | list sheets, cards, panel, widget, capture fields |
| `--rw-tray` | `--ar-bg-alt` | plum 34 % + ink | clarify trays, widget chip |
| `--rw-sunk` | ink 4 % + bg | bg 3 % + ink | fields in the panel, review steps |
| `--rw-text` / `--rw-mute` / `--rw-soft` | ink / ink 62 % / ink 40 % | bg / bg 70 % / bg 50 % | text |
| `--rw-line` / `--rw-line-strong` | ink 10 % / 18 % | bg 12 % / 22 % | dividers, field and chip outlines |
| `--rw-pill-line` | ink 50 % (3.4 : 1 on paper) | bg 40 % (3.5 : 1 on the sheet) | the check pill's outline (WCAG 1.4.11) |
| `--rw-accent` | plum | plum 28 % + bg | selected list, project names, Fraunces accent word, focus ring, field focus |
| `--rw-accent-tint` | plum 8 % | plum 48 % | selection, hover, nav indicator, swipe background |
| `--rw-done` / `--rw-on-done` | plum / bg | plum 28 % + bg / ink | the checked pill |
| `--rw-action` / `--rw-on-action` | coral / ink | coral / ink | the primary action only: Abhaken, In die Inbox, Anlegen, the FAB, the widget "+" |
| `--rw-urgent-text` | coral 65 % + ink (4.9 : 1 on paper) | coral 85 % + bg | "überfällig", "Nachhaken", the overdue pill outline (deviation 4) |
| `--rw-attention` | yellow | yellow | drop-target ring, the 1 px line under a step's question, the undo line, dots (high priority, stalled, the companion's dot) |
| `--rw-inverse` / `--rw-on-inverse` | ink / bg | bg / ink | toast, notice bar, dark buttons |
| 3D (`tokens.json → gl`) | pill paper → plum; companion plum clay, paper when lit | pill sheet → lavender; companion plum 62 % + bg, bg when lit | the clay pill and the companion |

One meaning per colour: **coral acts** (call to action, the `//` mark, the live dot, and overdue as declared in deviation 4), **plum selects and confirms** (focus, selection, done), **yellow asks for attention** (only as a dot, a ring or a 1 px line).

### 3.2 Type

Three typefaces only. Space Grotesk 400/500 (500 is the heaviest; no synthetic bold, unlike today's web). Fraunces 300 italic for exactly one accent word per heading line ("Was du *jetzt* tun kannst.", "Wohin *gehört* das?", "Kopf *frei*."). JetBrains Mono 400 for eyebrows, dates, contexts, counts and the coral `//`.

| Role | Web | Android | |
|---|---|---|---|
| View title | 40 / 1.04, −0.03 em (30 at phone width) | 24 sp in the top bar | Space Grotesk 500 |
| Stage question | 22 + 25 accent | 24 + 27 accent | with Fraunces accent |
| Card text | 27 / 1.2 (22 at phone width) | 23 sp | 500, up to 3 lines |
| Row | 15 / 1.35 (16 at phone width) | 16 sp | 500, up to 2 lines |
| Meta | 11.5 mono | 12 sp mono | dates, contexts, "hoch"; project name in Space Grotesk, plum |
| Eyebrow | 11 mono, uppercase, +0.08 em | 11 sp | always starts with a coral `//` |

### 3.3 Shape and elevation

Brand radii only. Sheets and trays use 18 (`lg`), cards, the stack, bottom sheets and the widget use 22 (`xl`), and everything you press is a pill: buttons, chips, fields, the check pill, the toast, the nav indicator. Shadows are the brand's four (`sm` sheets, `md` dock and FAB, `lg` cards and menus, `xl` overlays). The held or dragged card cross-fades from `lg` to `xl` by lift height (a second layer with `--ar-shadow-xl` whose opacity follows the lift), so no custom shadow is needed. Only the two WebGL objects cast contact shadows from light (deviation 7).

### 3.4 Motion

| Name | Value | Use |
|---|---|---|
| ease | `cubic-bezier(.2,.8,.2,1)`, 120 / 180 / 260 ms | everything in the DOM (brand) |
| follow | spring k 900, c 60 | the card under the finger |
| tilt | spring k 320, c 24 | rotation from drag velocity (±0.4 rad) |
| settle | spring k 260, c 22 | card back to the stack; next card rises (k 300, c 17, slight overshoot) |
| hold | spring k 300, c 24 | card waits on the stack during a step: 10 px up, shadow at lift 0.3, flat and unscaled so the text stays sharp |
| squish | press 95 ms, then spring k 520, c 11 | check pill squash and stretch |
| flight | 260–460 ms by distance, quadratic arc lifting to z +150 | card into a tray |
| tray | CSS `linear()` spring, 420 ms | tray accepts the card, count rolls in |
| hold window | 6 s, drawn as a 1 px yellow line that drains | undo window (done, delete, clarify) |

The Compose equivalents are in `tokens.json` and the generated `Tokens.kt` (`dampingRatio = c / (2 √k)`, same stiffness).

## 4. Iconography

A minimal set of our own: 28 app glyphs on a 20 px grid (plus 4 used only in the system mock-ups), 1.5 stroke, round caps, drawn in the mark's line language. The arrow for Nächste starts at a node. Irgendwann is a cloud (after review: the ring of six dots read as a loading spinner). Zurückstellen is a calendar with a node. Einstellungen is the mark's hexagon with its centre node. Nothing comes from an icon library. Where text works, mono symbols are used instead (`//`, `·`, `→`, `↵`, `⌫`). The same path data becomes Android `VectorDrawable`s (one SVG source, generated), which is also what the widget uses (vectors only). All emoji are removed (today they sit in the web nav, the plan tabs and the dark toggle).

## 5. Signature moments

1. **Klären: the card stack.** The top Inbox item is a paper card on a visible stack (up to three cards below, 13 px apart). Grab it and it lifts towards you, tilts with your hand and its shadow grows from `lg` to `xl`; lifting it uncovers the next card's text. Flick or drop it on a tray, or press `1`–`5`: Nächste, Warten auf, Irgendwann, Erledigt (the two-minute rule), Löschen. The tray takes the card with a small squash, its count rolls up, the next card rises. `Z` brings the card back out of its tray.
   **Steps.** Some trays need one more answer, so nothing is guessed. Nächste asks "wo erledigst du das?" and the trays turn into every context (they wrap to a second row; keys `1`–`9`). Warten auf asks "wann nachhaken?" (morgen · Freitag · nächste Woche · ohne Datum), which writes `scheduled` so the item reaches "Nachhaken". During a step the card stays on the stack, raised 10 px with a deeper shadow but flat, so its text stays sharp; its own buttons rest at 40 %, and the next card's text is hidden. A sixth tray "Zurück" (`0`, `Esc`, Android Back) returns to the five destinations. On the card: `P` Projekt (including "Neues Projekt …", which creates the project, assigns the card and opens the context step for its first next action), `T` Zurückstellen (morgen · Freitag · nächste Woche · in vier Wochen, writes `wait`), `E` Bearbeiten, `→` Überspringen.
2. **Abhaken: the clay pill.** The check control is a pill on every row on both platforms. Pressed, it lifts off the row as clay, squashes, turns plum, rebounds with the check drawing in and settles. Under it the flat pill has already switched to its done state, so the handover shows one edge. The row then leaves, within 0.9 s.
3. **Kopf frei: the companion.** A small toy version of the mark (seven nodes, coral top node, the yellow dot) sits in the sidebar corner (web) and on the Klären screen (phones). It shows how much of today's Inbox is clear: lit nodes = the share cleared since the day's high-water mark, so a 20-item Inbox shows progress too. At zero all nodes hold warm light and the coral node glows. It gets brighter, not bigger, and it has no face. Its text says what it means: "5 Dinge zu klären · älteste vom 29.10." or "*Kopf frei.*"

Supporting moments: on capture a chip flies from the dock into the Inbox count; a stalled project gets a yellow dot, the words "Steht still" and an inline "Nächste Aktion" field.

## 6. Effects

Rule 5.1 holds throughout: every effect explains state or gives feedback. Text is never drawn in WebGL.

| Effect | What it explains | Web | Android (native) | Reduced motion / no WebGL |
|---|---|---|---|---|
| Stack thickness and the next card | how much is left and what comes next | DOM paper cards below the top card (13 px apart, 3.4 % smaller each); the next card's text fades in by how much the top card has uncovered it | 2–3 stacked `Surface`s with the same offsets; the next card's `Text` alpha follows the drag offset | the same cards, static |
| Grab, tilt, flick | you are holding one item; the direction is the destination | **CSS 3D** (after review): springs drive one `transform` (`translate3d`, `rotateX/Y/Z` from pointer velocity, `scale`) under `perspective: 1400px` on `.stack-wrap`; the `lg`→`xl` brand shadow cross-fade follows the lift; at rest the transform is removed so text sits on whole pixels | `pointerInput` + `VelocityTracker`; `graphicsLayer { rotationX/Y/Z, translationX/Y, scaleX/Y, cameraDistance }`; `Animatable` with `spring()`; `shadowElevation` by lift with ink ambient and spot colours. No AGSL on the card | drag follows the finger without tilt; drop on a tray, buttons, keys |
| Step (context, follow-up, tickler) | one answer is still missing; the item has not moved yet | card held on the stack (hold spring), face tools at 40 %, next card hidden; trays become the options plus "Zurück", wrapping | same pose via `graphicsLayer`; options in a `FlowRow` of trays, 3 per row; `BackHandler`/predictive back answers "Zurück" | the same trays, no lift |
| Tray accepts the card | it is now in that list, and the list grew | the flight ends in the tray rect; tray squash via CSS `linear()` spring; count rolls | `animateFloatAsState(spring)` on scale; `AnimatedContent` for the count; `HapticFeedbackConstants.CONFIRM` | count changes immediately |
| Undo flies back | Rückgängig puts the item back into the Inbox | reverse flight onto the stack | reverse `Animatable` | the card is simply on top again |
| Clay check pill | done is committed; there is a short undo window | Three.js `CapsuleGeometry`, `MeshPhysicalMaterial` with sheen; squash and stretch spring; paper → plum; check as a `TubeGeometry` revealed by `drawRange`; contact shadow; the DOM pill switches to done at 540 ms, the 3D pill fades by 650 ms | at rest a plain `Canvas` stroke (`drawRoundRect`, `PillLine`); on press the row draws `CheckPillSquish` for 560 ms: the AGSL clay `RuntimeShader` in a `ShaderBrush`, `graphicsLayer` scaleX/scaleY spring (dampingRatio 0.24, stiffness 520), check `Path` trimmed via `PathMeasure`; haptic | pill fills plum, check appears, row leaves |
| Companion clarity | how much of today's Inbox is clear | 7 spheres + 12 rods, `MeshPhysicalMaterial`. Clay = plum, roughness 0.5, sheen. Lit = warm white with a little emissive and clearcoat. Coral ring halo on the top node at zero; warm halos on lit nodes in dark mode only; no yellow halo. One wobble per change, then static | Klären screen only: the mark as a `VectorDrawable` first; from the first idle frame a `Canvas` with an AGSL sphere-impostor `ShaderBrush` per node, `drawLine` rods, values via `animateFloatAsState`. No Filament (see 9.4) | static brand mark plus the same sentence in text |
| Capture flight | it went into the Inbox | DOM only (Web Animations API), so capture never waits for WebGL | notice "In Inbox ✓" + badge spring; tile, overlay and share: none (cold-start budget) | toast only |
| Live dot | a task is running | brand pulse (CSS) | `rememberInfiniteTransition`, only while visible | static coral dot |
| Undo window | how long Rückgängig still works | 1 px yellow line drains over 6 s | same line in the notice bar | static line, text stays |
| Stalled project | an active project has no next action | none (DOM: yellow dot, "Steht still", inline field) | same | same |

**Where Three.js earns its place, and where it did not.** The review showed that the WebGL card looked the same as the DOM card at rest and cost CSS3D text sync, DPR alignment risk and most of the effects budget. The card is now DOM with CSS 3D; its tactility comes from motion, which CSS does well. Three.js stays for the two things CSS cannot render without gradients: material that reacts (a pill that squashes as clay and changes colour under light) and an object that holds light (the companion). The canvas is one fixed layer, but each frame clears and draws only the scissor rects of the live objects, so a 650 ms squish on a 30 px pill touches about 70 × 70 px, not the viewport.

How the motion-graphics rules carry over:

- **Physical materials.** Clay via sheen for the pill and the companion. Glass via transmission is deliberately not used: the WebGL canvas is a transparent layer over the DOM, and transmission samples only the WebGL scene, so the glass would refract an empty buffer. The lit companion reads as "holding light" through emissive light and a soft clearcoat instead.
- **Light rig.** Hemisphere light, a warm key from the upper left, a cool fill, a warm rim from behind (it gives the clay its edge), all in brand colours, and `RoomEnvironment` through PMREM at 0.42. No coral sheen or coral rim in dark mode (the review found it pushed the clay towards magenta).
- **Bloom only on the brightest highlights.** Ring halos on emissive nodes only. A full-screen `UnrealBloomPass` would cost an HDR pass at the overlay's full size and destroys canvas alpha.
- **Neutral tone mapping:** `THREE.NeutralToneMapping`. **Clamp before `pow()`** in the halo shader.
- **Throughline:** one object, one journey (principle 5).
- **Camera with purpose.** The camera never moves: in an app the screen is the frame of reference. The object comes to you instead (it lifts on grab, waits lifted during a step).
- **Still-frame verification.** Every shot in `shots/` was checked visually, plus zoomed crops of the squish at 250 and 650 ms (light and dark) and of the companion at 3 of 5 and at zero (light and dark).

## 7. Key flows

| Flow | Web | Android |
|---|---|---|
| **Capture** | `N` or click the dock, type, `Enter`. Toast "In Inbox ✓ · Rückgängig" with the 6 s line, a chip flies into the Inbox count, the field stays focused for the next item. Everything goes to the Inbox (`POST /inbox`) | The app opens on Inbox with the field focused and the keyboard up; `Enter` shows "In Inbox ✓ · Rückgängig". Tile "+ Todo" (also over the lock screen), share "runway" → "In Inbox ✓", widget "+", shortcut "Neues Todo", FAB on other tabs. No pickers on any capture surface (PLAN.md non-goal kept) |
| **Clarify** | `G I` opens the stack (at phone width: Inbox list → "Klären · N"). Per card: drag, flick, `1`–`5` or click a tray. Nächste asks for the context (`1`–`9`), Warten auf for the follow-up day (`1`–`4`); `0` or `Esc` goes back. `P` project (or `N` in that menu for a new one), `T` zurückstellen, `E` edit, `→` skip, `Z` undo. The queue beside the stack shows everything waiting; clicking an item brings it to the top | Inbox → "Klären · 5" (or "Klären" in a row's menu) opens the full-screen stack: flick towards a tray or tap it; Nächste and Warten auf turn the trays into their options; Back answers "Zurück" first, then returns to the list |
| **Do** | `G N`, a context chip or `C`, `J`/`K`, then `X` for the clay pill, `Enter` for details, `S` start or pause, `M` move (Nächste asks for a context, Warten auf for the follow-up day), `⌫` delete (with undo) | Nächste: chips, "Fällig" first, then "Nächste Aktionen". Tap the pill or swipe right, then "Erledigt · Rückgängig". A row tap opens the native sheet; moving to Nächste there asks for a context. Widget: tap a pill |
| **Review** | `G P`: the weekly review strip (Inbox leeren · Warten auf prüfen · Jedes Projekt bewegt sich · Irgendwann durchsehen), each step jumps to its list; stalled projects on top with an inline "Nächste Aktion" field; "Neues Projekt" (name, outcome) opens the new project, which asks for its first next action, with Plan one tap away; "Rückblick abschließen" records the review (`POST /gtd/review`). The project detail has Aufgaben and Plan (the five Natural Planning steps) | The Projekte tab shows stalled projects with an inline next action. The review checklist and project creation stay on the web (PLAN.md non-goals kept) |

## 8. Web build plan (Vue 3, Tailwind, Pinia)

**Tokens and Tailwind.** `tools/tokens.mjs` (as prototyped here) writes `frontend/src/tokens.css` from `tokens.json`. In `tailwind.config.js`, `theme.extend` maps only semantic names to variables, for example `colors: { bg: 'var(--rw-bg)', sheet: 'var(--rw-sheet)', action: 'var(--rw-action)', done: 'var(--rw-done)', urgent: 'var(--rw-urgent-text)', ... }`, plus `fontFamily` (sans, serif, mono), `borderRadius` (sm, md, lg, xl, pill), the four `boxShadow`s and the brand easing. Because the variables switch on `prefers-color-scheme` (and on `[data-theme]` for the manual override in Einstellungen), the `dark:` variants disappear from templates. Fonts are self-hosted woff2 instead of Google Fonts, and 500 replaces the synthetic bold.

**Components.**

| Today | Becomes |
|---|---|
| `AppShell.vue` | Sidebar (counts from `/gtd/summary`, contexts, companion slot) and, at phone width, `AppTopBar.vue` (mark + runway, expanding search, Mehr menu) plus new `BottomNav.vue`. Receives what it shows as props, which also removes `CYCLE-001` and `CYCLE-002` |
| `NavItem.vue` | emoji replaced by the new `Glyph.vue` (inline SVG set) |
| header "+", FAB | new `CaptureDock.vue` (`POST /inbox`; a solid band on the navigation at phone width), `Toast.vue` and `useUndoHold()`: done, delete and clarify are held 6 s on the client and then sent, because the API cannot reopen a task |
| `TaskRow.vue` | check pill on every row at every width (today desktop only shows ✓ while started), mono meta line with "hoch", overdue bar, hover tools, the one-line "other context" variant; no urgency badge in rows |
| `TaskList.vue` | sections ("Fällig" plus "Nächste Aktionen" without duplicates, "Nachhaken" plus "Wartet", "Zurückgestellt"), visible load errors, "Stand hh:mm" |
| `TaskModal.vue`, `TaskActionSheet.vue` | new `TaskPanel.vue` (right panel or bottom sheet over a scrim) with every field from today's modal; the list segmented control moves tasks via `tags_add`/`tags_remove` and asks for a context before Nächste; follow-up chips for Warten auf; "Neues Projekt …" in the project select; delete with undo, also on desktop. New `MoveMenu.vue` (`M`) with the same two steps |
| `InboxView.vue` | new `InboxStack.vue` (stage, trays, steps, queue, keys) with `useCardPhysics()` (the springs of `card.js`, about 200 lines, no dependency) plus list mode; at phone width the list with "Klären · N" and the route `/inbox/klaeren` |
| `ProjectsView.vue` | `/gtd/projects/overview` (counts, status, stalled), "Neues Projekt" (`POST /projects`, name rules from `api/app/models.py` checked on the client with the same messages), new `ReviewStrip.vue`, project detail with the Aufgaben and Plan tabs; `ProjectPlanModal.vue` restyled (numbered steps instead of emoji tabs) |
| `SettingsView.vue` | restyled cards, plus Kontexte (shared list) and Darstellung (System/Hell/Dunkel, Bewegung voll/reduziert/ohne 3D) |
| router | `/next?task=` and `/waiting?task=` open the panel (fixes the Android handoff); `/projects/:name` is honoured; login keeps the return path |

Pure rules go to `src/shared/` with tests: `clarify.js` (destination → tag delta, refuses Nächste without a context), `followUp.js` (morgen, Freitag, nächste Woche relative to the server's today, 08:00 Europe/Berlin), `undoHold.js`, `contextFilter.js` (lenient rule), `stalled.js`, `companion.js` (high-water share).

**Three.js, loaded and isolated.** It lives in a new declared unit `fe/fx` (`frontend/src/fx/`, the content of `gl.js`): the pill squish and the companion, nothing else. Only `AppShell` reaches it, through `useFx()`; feature components emit DOM rects and events and never import `three`. Three.js arrives through a dynamic `import()` after first paint (`requestIdleCallback`) as its own Vite chunk (three core and `RoomEnvironment`; no `CSS3DRenderer`). There is one fixed overlay `<div class="fx-host">` holding one canvas that draws only scissor rects. It is not loaded when `prefers-reduced-motion` is set or "ohne 3D" is chosen, and it unloads on `webglcontextlost`. Every view works identically without it, including the card stack, which never depended on it.

## 9. Android build plan (Jetpack Compose)

1. **Theme.** `ui/theme/Tokens.kt` is generated (colours, springs; see the sample `Tokens.kt`). `RunwayTheme` replaces `dynamicLightColorScheme`/`dynamicDarkColorScheme` with brand schemes (primary coral, onPrimary ink, secondary plum, surface paper or sheet, background bg, error the urgent text colour). The three fonts go in `res/font` (about 250 KB).
2. **Navigation and top bar.** `NavigationBar` with five destinations. It hides while the IME is visible, so at least 5 Inbox rows stay visible above the keyboard. The top bar shows the unchanged mark (a `VectorDrawable`) before the list title; "Mehr" is the overflow menu. Back from any tab goes to Inbox as today.
3. **Inbox** keeps its behaviour (field, keyboard on open, newest first, row menu, notice bar, outbox statuses, "Stand") and gains the "Klären · N" chip in the Stand line.
4. **`ClarifyScreen`**: a stack of `ClayCard`s (`Box` + `graphicsLayer` + `shadowElevation`), a tray `FlowRow`, gestures, springs from the tokens, haptics. Steps (context, follow-up, tickler) as a `step` state in the screen's `ViewModel`. `BackHandler` and `PredictiveBackHandler` call `cancel()` while a step or the project menu is open and only then leave; leaving the screen (Back, a tab, process death) resets the step, so re-entering never shows a half-open step. Writes go through the outbox as a new `clarify` kind (`tags_add`/`tags_remove`, project, `scheduled`, `wait`) with the 6 s hold. Undo before sending flies the card back; after sending it queues the inverse change. TalkBack: the card offers the five destinations as custom actions; a step's options are the trays.
5. **Rows**: a `CheckPill` composable that draws a plain `Canvas` stroke at rest (no shader). Tapping it swaps in `CheckPillSquish` for 560 ms, which uses the AGSL clay shader. The `RuntimeShader` is created once, on the first idle frame after the Inbox has drawn (`Choreographer` post-frame callback), never on the start path. Swipe-right stays; `contentDescription` remains `Abhaken: …`.
6. **Companion**: on `ClarifyScreen` only, 40 dp. It starts as the mark's `VectorDrawable` and switches to the AGSL `Canvas` on the first idle frame; fed by `summary.inbox` and the day's high-water mark (kept in `DataStore`).
7. **Details**: a native `ModalBottomSheet` (list with the context question for Nächste, contexts, follow-up chips, dates, notes, Abhaken); "Im Web öffnen" keeps the Custom Tab for recurrence, dependencies and expiry.
8. **Projekte and Irgendwann tabs**: lists from `/gtd/projects/overview`, `/gtd/someday` and `/gtd/tickler` ("Zurückgestellt"), check-off, inline next action for stalled projects.
9. **Widget (Glance)**: `GlanceTheme` with brand `ColorProviders`, text plus two vectors (pill and plus); header, chip, rows, "+K weitere" and badge unchanged. No 3D, because of the bitmap ban.
10. **Tile, overlay, share**: still plain Views for the cold-start budgets, restyled with XML drawables from the tokens (sheet-coloured pill field that follows the system theme, inverse notice, coral button). Confirmation text "In Inbox ✓" everywhere. **Launcher icon**: adaptive icon with the mark on `#FBF6EE` and the icon-layer variant of deviation 8, plus a monochrome layer from `mark-mono`.
11. **Font scale.** Above 1.3 the five trays switch to two rows (3 + 2) and a step's options to two per row, so "Irgendwann" and "@unterwegs" are never cut; at 1.5 the card text drops to 2 visible lines with the rest in the sheet.

### 9.4 Filament or sprites for the companion, and AGSL on the card: evaluated

| Option | For | Against | Verdict |
|---|---|---|---|
| Filament / SceneView (glTF) | real PBR, identical to the web | several MB of native libraries, an engine start, a `SurfaceView` or `TextureView` per instance, lifecycle code: all for a 40 dp status figure | no |
| Pre-rendered sprite sequence | pixel parity with the web; `gl.js` already renders deterministically | about 300 KB of WebP (6 states × 24 frames), fixed size, no live light | fallback if AGSL looks flat |
| Compose `Canvas` + AGSL sphere impostor | about 3 KB, sharp at any size, animatable per node, no assets | matches the clay look closely but not exactly | **recommended**, on the Klären screen only |

The card needs no shader at all: it is a paper surface with brand elevation, on both platforms. If a lit edge is ever wanted, it is drawn behind the content with `Modifier.drawWithCache { onDrawBehind { drawRoundRect(ShaderBrush(shader)) } }` and `shader.setFloatUniform(...)` fed from the `graphicsLayer` rotation, with the text drawn unshaded on top. `RenderEffect.createRuntimeShaderEffect` on the card layer is ruled out: it would shade the text inside the layer and needs a new `RenderEffect` on every drag frame. `android.html` uses the web's DOM card and `gl.js` as stand-ins for this native rendering.

## 10. One token source

`tokens.json` lives in the runway repo (proposal: `design/tokens.json`). The generator (`tokens.mjs` here, `tools/tokens.mjs` in the repo; Node, no dependencies) writes:

- `frontend/src/tokens.css`: `:root { --rw-…: color-mix(…) }` plus the dark block (in this prototype: `tokens.css`, loaded by both pages, so the prototype cannot drift from the JSON either)
- `frontend/tailwind.tokens.cjs`: the semantic name → `var(--rw-…)` map
- `runway-android/app/src/main/java/com/agenticreach/runway/ui/theme/Tokens.kt`: mixes resolved to sRGB at generation time, for example `val PillLine = Color(0x801B1428)`, plus the springs (`RwSprings.settle()`); see the sample `Tokens.kt`
- `runway-android/app/src/main/res/values/colors.xml` and `values-night/colors.xml` for Views and Glance

The Android repo receives the generated files by a sync script with a checksum check in CI, so the two can never drift silently.

## 11. Accessibility

- All text is DOM or Compose text. The WebGL canvas is `aria-hidden`. The stack has a live text ("Karte 1 von 5: … Einsortieren mit 1 bis 5"; during a step "…: Kontext wählen, 1 bis 5, 0 zurück"), the trays are labelled buttons with keys, focus moves to the first option when a step opens, and every gesture has a button and a key. On Android the card offers the five destinations as TalkBack custom actions.
- Contrast (light, computed): ink on paper 17.8 : 1; mute 5.0 : 1 (4.9 on bg); urgent text 4.9 : 1 on paper; **check pill outline 3.4 : 1 on paper, 3.5 : 1 on the dark sheet; the overdue pill outline uses the urgent text colour (4.9 : 1)**; bg on the plum done pill 11.5 : 1; ink on coral 7.0 : 1 (paper on coral would be 2.5 : 1, deviation 5); bg on plum chips 11.5 : 1. Dark: bg on ink 16.6 : 1, ink on the lavender done pill 9.8 : 1.
- A 2 px plum focus ring (lavender in dark) on every control, including trays, the task title in the panel and the date fields; fields show a plum border when focused. The full keyboard map is behind `?`; no keyboard traps; `Esc` closes in the order overlay → menu (a menu step goes back one step first) → step → field → context question → panel → Klären (phone width) → filter.
- Meaning never depends on colour alone: "überfällig", "Nachhaken", "Steht still", "hoch" are always written out.
- Reduced motion: no WebGL, no flights or tilt, state changes are immediate, the pulse is static. The card stack and every step work the same.
- Android: targets ≥ 48 dp (step trays 64 dp, card chips 40 dp inside a 48 dp touch target), all pinned contentDescriptions and row texts unchanged, font scale 1.5 (see 9.11), rows leave the tree within 1 s.

## 12. Performance budget

| | Budget | How |
|---|---|---|
| Web first paint | no Three.js on the critical path | DOM renders first; `fx` loads on idle and the companion slot shows the static mark until then |
| Web fx chunk | ≤ 160 KB gzip (estimate: tree-shaken three core + RoomEnvironment; was 180 with CSS3D) | separate chunk, never on the login route |
| GPU | 1 canvas, DPR ≤ 2, scissored, **0 frames at rest** | the loop runs only while a spring or flight is active and stops when settled; each frame clears and draws only the rects of the companion and a squishing pill (about 70 × 70 px each); paused when the tab is hidden. Measured with `proto.frames()`: card and WebGL counters unchanged over 2 s idle |
| Card | ≤ 4 ms per frame while dragging | one CSS transform on a composited layer; `will-change` only while lifted, removed at rest |
| Interaction | key → state commit < 16 ms; flight ≤ 460 ms, interruptible; row leaves ≤ 900 ms (measured: done at about 560 ms, gone by 900 ms) | `finishNow()` on new input |
| Android cold start | unchanged: tile → keyboard ≤ 700/1200 ms, icon → Inbox ≤ 800/1500 ms, **measured with an Inbox of 20 rows** (macrobenchmark `StartupTimingMetric`, plus a `FrameTimingMetric` run for the first scroll) | no `RuntimeShader` and no companion on the start path: rows draw a plain stroke, the top bar shows a vector; the shader is created on the first idle frame after the Inbox has drawn; nothing from Klären on the tile, shortcut or share paths |
| Android drag | 120 Hz on Pixel 9 (≤ 8 ms) | `graphicsLayer` only, no recomposition per frame |

## 13. Effort estimate (person-days, re-estimated after review)

| Web | d | Android | d |
|---|---|---|---|
| Tokens, generator, Tailwind mapping, fonts | 2 | Tokens.kt (generated), theme, fonts, launcher icon | 2 |
| Shell, sidebar, phone top bar (search, Mehr), bottom nav, routes | 3.5 | Bottom navigation, IME handling, Back, top bar, contract updates with the critic | 3 |
| Rows, sections, DOM pill, undo hold, toasts | 3 | Rows with `CheckPill` (stroke at rest, AGSL squish), swipe | 2 |
| Capture dock | 1 | `ClarifyScreen`: gestures, springs, trays, steps, Back, fly-back | 5 |
| Task panel (context question, follow-up, new project), move menu with steps | 4.5 | Outbox kinds `clarify`/`move` (incl. `scheduled`, `wait`), hold, undo, tests | 3 |
| Inbox stack: DOM card physics, steps, keys, queue, phone Klären | 4.5 | Companion (Canvas + AGSL, Klären only), summary wiring | 1.5 |
| `fx` layer: pill squish, companion, scissor, fallbacks (was 6) | 3 | Native task sheet (context question), Custom Tab handoff | 2.5 |
| Projects overview, stalled, review strip, Neues Projekt, plan restyle | 3.5 | Projekte and Irgendwann tabs (incl. Zurückgestellt) | 3 |
| Settings restyle, Kontexte, Darstellung, German copy pass | 2.5 | Widget (Glance theme), tile, overlay, share restyle | 2.5 |
| Accessibility, performance, visual QA, Safari | 3 | TalkBack actions, font scale, cold start with 20 rows, device QA | 3 |
| **Web total** | **30.5** | **Android total** | **27.5** |

Sum 58 person-days; **with 25 % contingency 72.5**.

**Phases.**
- **Phase 1, contract-safe (about 38 d + contingency):** all web work (30.5); on Android the token theme, fonts and launcher icon (2), the widget, tile, overlay and share restyle (2.5), and the rows with the pill once the critic agrees to a pill instead of a ring (2), plus part of the QA line (1).
- **Phase 2, waits for Uli on the three PLAN.md non-goals and the navigation contract (about 20 d + contingency):** bottom navigation (3), `ClarifyScreen` (5), outbox kinds (3), companion (1.5), native sheet (2.5), Projekte and Irgendwann tabs (3), the rest of QA (2). If Uli keeps the non-goals, Phase 2 shrinks to the bottom navigation question and Android stays a capture-and-glance companion in the new look.

**Risky parts.** (1) The Android acceptance contracts: bottom navigation instead of top tabs, a pill instead of a ring, new screens; every change needs the critic, and the frozen done-bar needs Uli. (2) Clarify undo after sending: the API cannot reopen, so undo must send the inverse tag change and handle a concurrent edit. (3) The AGSL clay look reaching parity with the web; fallback: sprites. (4) IME plus bottom navigation plus "≥ 5 rows visible". (5) Safari: `perspective` plus `preserve-3d` on the card was checked in Chromium only.

## 14. Brand deviations (need Uli's approval)

Listed the way `visuell.md` lists the slide deviations.

1. **Own icon set** (28 glyphs) instead of "no icons, mono symbols only". An app needs icons for navigation, trays and actions. They are drawn in the mark's line language from one SVG source; no library.
2. **A 3D companion derived from the mark** (spheres and rods, toy look). The kit says the logo is sacred. The companion is a character, not the logo, in line with the approved figure direction ("Assistent bleibt wie die Bildmarke, mehr Tiefe, wird magischer, nicht größer, nie Spinnennetz"). It never replaces the logo: it sits in the sidebar foot (desktop) and on the Klären screen (phones), while every top bar and the sidebar header show the unchanged SVG mark.
3. **Product lockup** instead of "mark + Agentic Reach": "mark + runway + by Agentic Reach" in the desktop sidebar, shortened to "mark + runway" in the phone-width top bar and to "mark + list title" in the Android top bar (an app bar names the screen). A product inside the brand.
4. **Coral for urgency.** Overdue rows get a coral bar, a pill outline and text in coral 65 % + ink. The kit reserves coral for the primary action and has no red, while the Android contract requires overdue to be measurably red (the mix has a hue of about 1°, coral about 6°).
5. **Ink text on coral buttons** instead of paper on coral: 7.0 : 1 instead of 2.5 : 1 (WCAG AA).
6. **Light on material.** Clay sheen, the rim light and the halos (coral on the top node at zero, warm bg on lit nodes in dark) produce shading gradients on screen, while the kit forbids gradients. They come from lit 3D material only, on the pill and the companion; no CSS gradient anywhere in the UI.
7. **Contact shadows in 3D.** Under the companion and under the pill while it squishes, a soft ink shadow at 12 % (the opacity of `--ar-shadow-lg`) in light and 45 % in dark, instead of the four box-shadow tokens. A WebGL plane cannot use a CSS shadow, and on ink the brand shadows are invisible. Everything in the DOM, including the card, uses the four tokens only.
8. **Launcher icon variant.** On the adaptive icon's foreground layer the mark's lines are 2.6/64 at 90 % opacity instead of 1.4/64 at 55 %: at 48 dp inside the safe zone the original lines disappear (shown at real size in `android.html`). Proportions, nodes and colours are unchanged, and the mark inside the app stays the original.

Within the rules, noted for clarity: coral appears only for the primary action, the `//` mark, the live dot, the "Rückgängig" action in the notice bar and overdue (deviation 4); done is plum, focus is plum, stalled is a yellow dot. Yellow appears only as a ring (drop target), a 1 px line (undo window, the step question in the panel) and a dot (high priority, stalled, the companion's dot); it never glows. JetBrains Mono is used at 400 only. Backdrop blur appears only on the phone top bar (a nav). There is no glassmorphism (the lit companion nodes are opaque and self-lit). The dark mark uses the kit's own `ar-on-dark` recolouring. Capture fields use the sheet token, so they follow dark mode (no white field on ink). The themed Android icon is the monochrome layer the system requires.

## 15. Inventory coverage: kept, changed, dropped

| Area (inventory) | In Greifbar |
|---|---|
| Web lists Inbox, Next, Waiting, Someday, All, Projects, project detail | kept, renamed to the German list names; All = "Alle Aufgaben" with "Mit Erledigten" |
| Web task modal (all fields, start/pause, annotations, depends, recur, until, wait) | kept in the details panel; moving to Nächste asks for a context |
| **Project creation** ("+" → name → `POST /projects` → plan) | **kept, in three places:** "Neues Projekt" on Projekte (name and outcome; opens the project, whose stalled banner asks for the first next action, Plan one tap away), "Neues Projekt …" in the card's project menu (creates it, assigns the card, opens the context step for its first next action), and in the panel's project select. Name rules from the API with German messages. Android: not in the app (non-goal kept) |
| Web phone action sheet ⋮ | **dropped**: the pill completes, a row tap opens the sheet, delete lives in the sheet with undo |
| Project plan modal (5 steps, ordering, "→ Task") | kept as the Plan tab of the project detail; "→ Task" now also sets `+next` and asks for a context |
| Settings: profile, password, API key, Connect Claude, MCP tabs, admin | kept, restyled; MCP tab names unchanged (pinned by tests) |
| Login / Android setup | kept; already on brand; fields become pills |
| Urgency badges in rows | **dropped** from rows (every next action is "red" because of the +15 for next); urgency sorts the lists and shows in details |
| Web dark toggle in the sidebar | **moved** to Einstellungen; the default follows the system |
| Web FAB and "+" in headers | **replaced** by the capture dock |
| Web search field | kept on desktop in each view header; at phone width it expands in the top bar |
| Android tabs Inbox · Nächste · Warten auf + Mehr | **changed** to bottom navigation with 5 lists; labels and Mehr items unchanged |
| Android capture field, Stand, notice bar, 6 s undo, outbox statuses, swipe, pull-to-refresh, banners | kept unchanged (pinned strings unchanged; the web now uses "In Inbox ✓" too) |
| Tile, lock screen, overlay, share, shortcuts, widget, notifications | kept, restyled; widget stays text plus vectors |
| Task details via Custom Tab | **changed**: native sheet first, Custom Tab for rare fields; the web now honours `?task=` |
| Warten auf follow-up (`scheduled`) | **added on the web**: the follow-up step when clarifying or moving, chips in the panel; Android's "Nachhaken" sections unchanged |
| Tickler (hidden by `wait`) | "Zurückstellen" on the card (`T`) and "Zurückstellen bis" in the panel; Irgendwann shows a "Zurückgestellt" section (web and Android); a project with only parked tasks is not stalled |
| Web offline mode | not in scope; the web gets the client-side undo hold, not an outbox |

## 16. Open questions for Uli

1. **Clarifying on Android.** `PLAN.md` lists it as a non-goal (24.10.2026). This proposal adds the stack behind "Klären · N" without touching capture. Keep it, or keep the stack web-only? (Phase 2 depends on it.)
2. **Bottom navigation on Android** with five lists instead of three tabs. This is a contract change.
3. **A native task sheet on Android** (also a non-goal today) or the Custom Tab only?
4. **One context rule:** lenient everywhere (proposal) or strict as on the web today?
5. **One shared, editable context list** across web, app and widget. It needs a small user-preferences endpoint.
6. **Inline syntax in the capture dock** (`@computer`, `+Projekt`), or keep capture as plain text into the Inbox (proposal)?
7. **A name for the companion.** The figure plan says the assistant still needs one.
8. **Follow-up presets:** "nächste Woche" means in seven days (Sa 07.11. from today). Or the next Monday?
9. **Launcher icon variant** (deviation 8), or keep the original lines and accept a nodes-only look at 48 dp?

## 17. Changes after review

An independent critic scored the first version at about 6 of 10. What changed:

**The signature step (must-fix 1 and 2).** The card no longer flies to a small tilted spot during the context step. It stays on the stack at full size, raised 10 px with a deeper shadow, flat and unscaled (a second pass removed the slight tilt: under `perspective` it softened the text you are reading); its own buttons rest at 40 % and do not react; the next card's text is hidden, so the item you are sorting is the biggest thing on screen. The trays still turn into the answers, now with a sixth tray "Zurück" (`0`, `Esc`). Every context gets a tray: they wrap to a second row (three per row on phones) and take keys `1`–`9` (checked with seven contexts). Android Back and predictive back answer "Zurück" first and only then leave Klären; leaving always resets the step, so re-entering starts clean (checked).

**No silent metadata (must-fix 3).** Every route into Nächste asks for a context the task does not already carry: the stack, the details panel (the Nächste segment waits, the Kontext block asks on a 1 px yellow line and commits on a chip), the `M` menu (a second step with keys `1`–`9`, `0` back) and the Android sheet. The store refuses Nächste without a context. The Warten-auf tray has a follow-up step (morgen · Freitag · nächste Woche · ohne Datum, keys `1`–`4`) that writes `scheduled` 08:00 Berlin; the `M` menu uses the same step, and the panel offers the same chips when a waiting task has no date.

**Phone-width web (must-fix 4).** The Inbox is the Android Inbox: list newest first, "Stand" line, "Klären · N" opens the stack with a back link. Search expands in the top bar and takes focus. The view tools (project status, Mit Erledigten, Neues Projekt) sit under the title; eyebrow and lead are hidden, so the first row starts at about 200 px. The dock is a solid band directly on the navigation (no gap), and the content clears both. Mehr is a menu. The bottom sheet has a scrim. The search field's native clear button (browser blue) is hidden.

**Contrast and focus (must-fix 5).** New `--rw-pill-line` (ink 50 %, 3.4 : 1; bg 40 % in dark, 3.5 : 1) for the check pill; the overdue pill uses the urgent text colour. Focused trays show the plum ring (the transparent outline no longer wins); the panel title and date fields have visible focus rings. Values are in `tokens.json`, and both prototype pages now load the generated `tokens.css`, which also removed the three dark values that had drifted.

**Android performance (must-fix 6).** Rows draw the pill as a plain stroke at rest; the AGSL clay runs only during the 560 ms squish, with the shader created on the first idle frame after the Inbox. The companion left the main top bar (now the static mark) and lives on the Klären screen only. The card uses no `RenderEffect`; the correct pattern for a lit edge, should one be wanted, is in 9.4. §12 adds a cold-start measurement with 20 Inbox rows.

**Project creation (must-fix 7).** "Neues Projekt" on Projekte, in the card's project menu (then the context step for its first next action) and in the panel's project select; a row in §15.

**Three.js scope (must-fix 8).** The card is DOM with CSS 3D (`card.js`): springs from the tokens, perspective on `.stack-wrap`, rotation from pointer velocity, brand shadows `lg` → `xl` by lift. `CSS3DRenderer` is gone. The one canvas holds the companion and the pill squish and draws only their scissor rects. The fx line is re-estimated at 3 days (was 6).

**Undeclared brand violations.** Coral now means act only: done is plum (DOM and 3D pill), the Erledigt tray glyph, field focus, dock focus and the overlay field use plum or neutral lines, stalled is a yellow dot plus words. The phone and Android top bars show the mark (deviation 3 updated); the companion never sits in the logo's place (deviation 2 updated). The `//` is JetBrains Mono 400. The dark clay card is gone, and the dark pill and companion have no coral sheen or rim (no magenta). No yellow halo: the yellow dot stays a dot. The overlay field uses the sheet token and follows dark mode. The 3D contact shadows are declared (deviation 7) and set to the brand-lg opacity in light.

**Nice-to-haves taken.** No duplicate rows in Nächste, "Fällig · alle Kontexte" with one-line rows from other contexts; companion lit by the share cleared since the day's high-water mark; scissored canvas; phased plan with 25 % contingency; font-scale rule for Android trays (described, 9.11); "hoch" in the meta line; tokens generated from one source (`tokens.mjs`); a cloud for Irgendwann; Mehr as a menu and a scrim behind the sheet; "Zurückstellen" (tickler) on the card and in Irgendwann; launcher icon checked at 48 dp and declared (deviation 8); "In Inbox ✓" on every surface; the pill handover without a double edge (the DOM pill is done before the 3D fade, checked at 560 ms).

**Left on purpose.**
- **The clay look on the card.** Must-fix 8 asked to drop the WebGL card, and the critic was right that it looked like the DOM card at rest. The direction's tactility now lives in the card's motion and in the two clay objects. A clay card would need gradients in CSS, which the brand forbids.
- **Font scale 1.5 on Android** is specified (9.11) but not simulated in the prototype; it needs a device test.
- **Safari** was not run; the card now relies on `perspective` and `preserve-3d`, which Safari supports, but alignment was checked in Chromium only.
- **"Bewegung: ohne 3D" in Einstellungen** is still a static control in the prototype; reduced motion is what switches the layer off.
- **Swipe to check off on phone-width web** is not built; the pill is the touch target there (Android keeps its swipe).

Verification after the changes: all seven required shots re-taken and read; extra checks with a scripted run of the critic's cases (7 contexts, Zurück, keys 1–9, Android Back and re-entry, panel and `M` menu into Nächste, follow-up writing `scheduled`, tickler, new project in all three places, phone search focus, phone Inbox list, dock band position, Mehr menu, pill handover, 0 frames at rest). No console errors on either page.

**Second pass (re-verification).** All seven shots were taken again and read. Two things were fixed from what they showed: the held card during a step was tilted 0.06 rad and pushed 24 px towards the camera, which blurred its text under `perspective` (visible in `web-signature` and on the phone Klären screen); it is now raised 10 px, flat and unscaled, with the lift shown by the shadow only, and the text renders sharp. The widget's context chip had an 8 px radius; it is now a pill like every other button. The signature shot is taken with the step held (`proto.signature({pick:false})`); with the automatic pick the shot can land mid-flight. Re-checked by script: seven contexts give seven trays plus Zurück, `0` returns to the five destinations, the panel's Nächste waits for a context, phone search takes focus, 0 card and 0 WebGL frames at rest, no console errors.
