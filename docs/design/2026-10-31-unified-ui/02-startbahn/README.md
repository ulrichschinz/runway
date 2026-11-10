# 02 · Startbahn

**The idea in one sentence:** Nächste is a runway: your three next actions in the active context wait cleared at the threshold, lit in three readable urgency tiers, and when you tick one off it accelerates down the strip and lifts off on a light trail while the queue moves up.

Proposal 02 of five for one runway on web and Android. Prototypes: `index.html` (web) and `android.html` (phone plus widget, Quick Settings tile, capture overlay, share target). Both run on the shared demo data and implement `window.proto` from `../shared/README.md`.

| File | What |
|---|---|
| `index.html`, `app.js`, `startbahn.css` | web prototype (Vue components in the real build, see the web build plan) |
| `android.html`, `android.js`, `android.css` | Android prototype (Compose in the real build) |
| `model.js` | one rule set for both clients: lists, order, context filter, urgency tiers, undo hold and outbox, labels |
| `i18n.js` | every UI string as a key, German default, English second (`data-i18n`) |
| `world.js` | the airfield layout: where every token sits; shared by all three renderers |
| `scene.js` | web airfield in Three.js 0.169 (physical materials, light rig, bloom, render on demand) |
| `fallback.js` | static SVG airfield: reduced motion, WebGL failure, and the poster while Three.js loads |
| `field.js` | picks the renderer, loads Three.js lazily, never blocks the app |
| `header-shader.js` | Android header: ray-cast fragment shader written to port 1:1 to AGSL |
| `tokens/tokens.json` | the single token source; `gen-tokens.mjs` writes `tokens.css` and `RunwayTokens.kt` |
| `shots/` | verified screenshots |

Prototype-only data changes: `model.js` gives the four waiting items follow-up days (`scheduled`), because the shared demo data has none and the holding pattern needs them; it adds three completions from earlier days (for Erledigt · Früher) and one project plan (Website-Relaunch). The project "Podcast" (`status: someday` in the demo) is treated as `on_hold`, the API value.

---

## The airfield: one metaphor, kept visual

The list names stay the GTD names. The airfield only gives each list a place, and the names of those places appear at most as mono eyebrows (`// startbahn`, `// vorfeld`). No aircraft, no clip art: abstract glass nodes and light. The nodes echo the circles of the brand mark.

| GTD list | Place on the field | What a token there means |
|---|---|---|
| Inbox | Vorfeld (apron) | a clay puck, unlit: captured, not yet clarified |
| Nächste, first three (in the active context) | the threshold, three lanes | a glass node: cleared, do it now; core and lane light show the urgency tier (below) |
| Nächste, the rest | taxiway queue with the yellow lead-in line | a smaller neutral node waiting its turn, in order |
| Warten auf | holding pattern in the sky | a plum node circling; follow-up due drifts to the inner, nearer ring and lights coral |
| Erledigt heute | contrails in the sky | one arc per completion today |
| Projekte, Irgendwann, Mehr | not on the field | plain DOM views; the field collapses (Android: header shrinks to 40 dp) |

### Urgency tiers

The field shows urgency in three tiers that read at a glance, not as a continuous scale (the review showed that 100 / 95 / 77 % looked identical):

| Tier | Rule | Lane | Core | Extra |
|---|---|---|---|---|
| überfällig | due before today | fully lit, coral | coral | coral ring on the ground |
| bald | due today or within 3 days | half lit, coral | coral | none |
| ruhig | everything else | three paper lights | paper, no coral | none |

The same three tiers drive the static SVG, the Android shader (`uLaneTier`) and the widget lane dot (filled coral with ring, filled coral, hollow ink). The urgency number only sorts.

### Size of the field

| Surface | Nächste | Inbox, Warten auf | Projekte, Irgendwann, Mehr |
|---|---|---|---|
| web wide | 200 px | 200 px | none |
| web phone | 120 px | none (it would repeat the list) | none |
| Android | 176 dp | 176 dp (Inbox: shrinks with the keyboard) | 40 dp (status bar only) |

The camera moves with purpose: switching Inbox, Nächste and Warten auf flies to that place on the same field (ground, threshold, sky), so the move itself says where you are.

---

## Design principles

1. **Text first, field second.** Every list works without the field. The field never holds text, never takes a click that the DOM does not also offer, and never delays first paint.
2. **Every effect explains state** (rule 5.1 of the motion notes). Light = urgency, position = list, ring = in progress, contrail = done today, inner ring = follow-up due. If an effect does not map to a state, it is not in the build.
3. **One keystroke or one tap to capture.** The capture field is always one key (`N`) or one tap away and always lands in the Inbox.
4. **Calm by default.** No idle animation, no loops. The field renders a frame only when something changed.
5. **Same words, same rules, both platforms.** One model (`model.js`), one token file, one layout (`world.js`).
6. **Undo instead of confirm.** Complete, delete, capture and clarify are held for 6 s with "Rückgängig" on both platforms; nothing asks "Sind Sie sicher".

---

## Visual language

### Semantic tokens

Source: `tokens/tokens.json`. Every value is a brand colour or a `color-mix` of brand colours, so rule 1 of the brand kit holds. Dark mode switches by `prefers-color-scheme` (with a `data-theme` override for settings).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--rw-surface` | bg `#FBF6EE` | ink `#1B1428` | page |
| `--rw-surface-sunken` | bg-alt | 4 % bg in ink | sidebar, board |
| `--rw-surface-raised` | paper | 8 % bg in ink | cards, panels, fields |
| `--rw-surface-hover` | 4 % ink in bg | 11 % bg in ink | row hover |
| `--rw-surface-inverse` | ink | bg | selected chip, toast |
| `--rw-text` / `-mute` / `-soft` | ink / 66 % / 48 % | bg / 72 % / 52 % | text levels |
| `--rw-line` / `-strong` | 10 % / 20 % ink | 12 % / 24 % bg | hairlines, dashed centre lines |
| `--rw-action`, `--rw-on-action` | coral, ink | coral, ink | the one primary action per view |
| `--rw-now`, `--rw-now-text` | coral, 62 % coral in ink | coral, coral | overdue, follow-up due, the cleared lights (marks only, text uses `now-text`) |
| `--rw-progress` | yellow | yellow | "läuft" ring, undo progress line, fresh-capture dot, lead-in line |
| `--rw-wait`, `--rw-emphasis` | plum | 45 % / 40 % plum in bg | waiting tokens, Fraunces accents |
| `--rw-selected`, `--rw-focus` | 9 % / 45 % coral | 13 % / 55 % coral | keyboard selection, focus ring |
| `--rw-field-sky/-ground/-strip/-marking` | bg-cool, bg-alt, 17 % ink in bg-alt, paper | 30 % plum in ink, 6 % bg in ink, 13 % bg in ink, 48 % bg in ink | the airfield |

### Type

Three typefaces, as the kit says. Space Grotesk 400/500 for UI, JetBrains Mono for eyebrows, counts, dates and keys, Fraunces italic 300 only as one accent word (`Wochen*rückblick*`, empty states).

| Role | Spec |
|---|---|
| display (view title) | Space Grotesk 500, 34/38, −0.03 em (phone 26/30) |
| title (card, detail) | 500, 19/25 |
| body (row) | 400, 15/22 (Android 16/22) |
| meta | 400, 13/18 |
| eyebrow | JetBrains Mono 400, 11/14, uppercase, +0.08 em, `//` in coral (mono 400, as the kit allows) |
| numeral | JetBrains Mono 400, 12/16 |

### Shape

Radii 8 (chips on Android, keys), 12 (rows, inputs), 18 (cards), 22 (stage, sheets, panels), pill (every button, capture field, chips on web, toast). Cards are paper on warm ground with a hairline, as the kit says. Shadows only from `--ar-shadow-*`.

### Motion

| Token | Value | Used for |
|---|---|---|
| `--rw-ease` | `cubic-bezier(.2,.8,.2,1)` (brand) | everything that settles |
| `--rw-ease-taxi` | `cubic-bezier(.45,0,.2,1)` | tokens and rows that move between places (FLIP) |
| `--rw-ease-roll` | `cubic-bezier(.55,0,.9,.35)` | things that accelerate away (the liftoff roll, a card leaving) |
| fast / base / slow | 120 / 180 / 260 ms (brand) | hovers, chips, panels |
| taxi | 480 ms (+45 ms stagger, max 6) | queue moves up |
| camera | 720 ms | moving between Inbox, Nächste, Warten auf |
| liftoff | 1100 ms, trail fades 700 ms | the signature |
| undo window | 6000 ms | hold before sending |

---

## Iconography

The kit allows no icon library. Startbahn needs very few glyphs because the field and the words carry meaning:

- **Dots, rings and lines** (allowed by the kit): the state lamp before each list name (coral dot = this list asks for action, ring = calm), the check ring, the yellow "läuft" ring, the dashed centre line that heads every section and draws the project mini runways.
- **Mono symbols:** `//`, `·`, `→`, `↵`, `⌫`, `‹`, `+`.
- **Four in-house line glyphs** in the stroke language of the mark (1.6 px on a 20 grid, round caps): plus, search, check, close. On Android the same four as vector drawables; the Quick Settings tile keeps today's check-ring-with-plus. Listed under brand deviations.

No emoji anywhere (today's web nav and plan tabs use them).

---

## Signature moments

1. **Liftoff (complete).** Tick a cleared task: the check ring fills coral (the action itself, only while it happens; in Erledigt checks are ink), the card lifts away, its node accelerates down its lane, rotates and climbs on a coral light trail. The two remaining nodes slide one lane left and the head of the queue taxis in from the right along the yellow lead-in line, while the DOM cards do the same move (FLIP). The trail settles into a contrail: one more arc in the sky, "4 heute erledigt". Toast "Erledigt: …  Rückgängig" with a 6 s yellow line. If the task was a project's last next action, the toast says so and the Projekte lamp turns coral.
2. **Taxi (clarify).** In the Inbox, pick `1 Nächste → @kontext`, `2 Warten auf`, `3 Irgendwann`, `X Gleich erledigt` or `⌫ Löschen`. The puck leaves the apron for its place: onto the taxiway queue, up into the holding pattern, or it lifts off. The next item is selected at once.
3. **Drop (capture).** Enter in the capture field: the text flies to the Inbox in the navigation, the count ticks, and a new puck drops onto the apron with a yellow dot that stays for the 6 s undo window.

---

## Effects table

| Effect | What it explains | Web (Three.js) | Android (native) | Reduced motion / fallback |
|---|---|---|---|---|
| Runway with three cleared nodes | what to do now (top three of Nächste) and in which order (left to right) | glass spheres (`MeshPhysicalMaterial`, transmission 1, thickness 0.4, IOR 1.45, attenuation tint, clearcoat) on a clay strip (physical, sheen); RoomEnvironment reflections; key, fill, rim and hemisphere lights; contact shadows as decals | AGSL `RuntimeShader`: ray-cast ground and strip, analytic ray-sphere tokens with refraction lookup, fresnel and specular (`header-shader.js`) | flat SVG of the same field (`fallback.js`); Android: Compose `Canvas` flat drawing |
| Core and lane light | urgency tier: overdue = full coral lane, coral core, coral ring; bald = half lane, coral core; ruhig = three paper lights, paper core | emissive core and instanced in-pavement lights with HDR colour; bloom in dark mode only and only above luminance 1.0, neutral tone mapping with a high knee | shader uniforms per lane (`uLaneLvl`, `uLaneTier`), core glow term; a halo stands in for bloom in dark mode | the same three tiers as flat dots and rings |
| Yellow ring | in progress ("läuft seit 09:30") | thin torus at the node | ring term in the shader on the ground | yellow ellipse |
| Liftoff and trail | done, and that the queue moved up | node on a deterministic path (`liftoffAt`), camera-facing ribbon with alpha falloff; queue re-targets with eased taxi paths | Compose `Animatable` drives uniforms; trail with `drawPath` on the Canvas layer above the shader | instant removal, rows reflow without motion, toast says "Erledigt" |
| Contrails | progress today (one per completion) | static ribbons, faint coral | Canvas `drawPath` | coral polylines; "N heute erledigt" in text |
| Holding pattern | what you wait for; follow-up due drifts nearer and lights coral | dotted ovals (instanced dots), plum and coral nodes | dotted ovals by ray–plane intersection in the shader | dashed ellipses, same positions |
| Apron pucks | how much is unclarified; which one is selected (ink ring, lifted) | clay discs (`LatheGeometry`, sheen) | flattened spheres in the shader | outlined ellipses |
| Camera move | where you are (ground, threshold, sky) | 720 ms eased move, lens-shifted frustum so verticals stay vertical | camera uniforms animated with `Animatable` | cut |
| Capture flight | it landed in the Inbox | DOM: pill flies to the nav item, count bumps | "In Inbox ✓ · Rückgängig" notice (pinned), puck drop in the header | notice only |
| Mini runway (projects) | next actions (ink dots), waiting (plum rings), stalled (no dots, dashed card outline) | DOM/CSS | Compose `Row` of shapes | same (static anyway) |

Rules held in the code: one canvas per screen, created lazily after first paint (`field.js`); frames only while a tween runs; paused by `IntersectionObserver` and `visibilitychange`; DPR capped at 2; `clamp()` before every `pow()` in shaders; no text in WebGL; `aria-hidden` canvas plus a live text summary.

---

## Unified rules (both clients)

| Topic | Rule |
|---|---|
| Names | product `runway`; the item is a `Todo`; control `Abhaken`, state and notice `Erledigt`; lists Inbox, Nächste, Warten auf, Projekte, Irgendwann; more: Zurückgestellt (tickler), Erledigt, Wochenrückblick, Einstellungen |
| Capture | one line, Enter saves and keeps the field open, always `POST /inbox`. Every other field is set later in the detail panel or while clarifying |
| Inbox order | newest first |
| Nächste | "Fällig" (overdue, then due today; never filtered) before "Nächste Aktionen" (urgency). The first three of that order are the cleared three |
| Context filter | on Nächste and the widget only; keeps tasks with that context and tasks with none (today's Android rule); exactly one chip or "Alle". The cleared three, the 01–03 ranks and the title count come only from matching tasks; due items of other contexts stay visible but unranked (web: section "Fällig · andere Kontexte" below the cards; Android: under the pinned "Fällig" heading, without rank or lane) |
| Warten auf | follow-up due (`scheduled` ≤ today) first: "Nachhaken seit 27.10." / "Nachhaken heute"; later: "Wiedervorlage 03.11." |
| Status tags | exclusive in the UI (Nächste / Warten auf / Irgendwann), written with `tags_add` / `tags_remove` so other tags survive |
| Undo | captures are sent at once and undone with a DELETE; done, delete, clarify and "Nachgehakt" are held 6 s, then sent. Web: held queue in IndexedDB, flushed with `keepalive` on `pagehide` and `visibilitychange=hidden`; Android keeps its outbox. A request that fails shows "Nicht gesendet · Erneut senden" on the row, in the toast and in the side foot |
| Day boundary | Europe/Berlin calendar day from `/gtd/summary.today` (fixes the web's one-day-early dates) |
| Freshness | "Stand hh:mm" on both; web refreshes on focus and every 5 minutes |
| Urgency | the number drives order; the field and the widget show three tiers (see "Urgency tiers"); the number shows only in the detail footer |
| Counts | one count per list in the navigation and one in the view title; sections and the stage caption do not repeat it |
| Dark mode | follows the system on both |
| Deep links | web honours `?task=<uuid>` (opens the detail) and `/projects/:name`, which fixes the Android handoff |

---

## Information architecture and key flows

**Web, wide (≥ 760 px):** sidebar with brand, capture field (`N`), search (`/`, `⌘K`), the five lists with counts and state lamps, contexts with counts (shortcut into Nächste), Mehr (Zurückgestellt, Erledigt, Wochenrückblick, Einstellungen), "Stand". Main column: title, the airfield stage (200 px) for Inbox / Nächste / Warten auf, then the list. Between 760 and 1180 px the three cleared cards stack as on the phone, so dates never truncate. Detail panel slides in from the right (440 px) without a scrim, so the list stays usable.
**Phone web and Android:** top tabs `Inbox · Nächste · Warten auf · Mehr` (Android's pinned tabs; one tap even with the keyboard up). Mehr holds Projekte, Irgendwann and the rest. Android: the header band (176 dp) sits behind the status bar and the list sheet overlaps it with a 24 radius; under Mehr it shrinks to 40 dp. Phone web shows the field only on Nächste (120 px).

| Flow | Web | Android |
|---|---|---|
| **Capture** | `N` from anywhere, type, Enter; field stays open; toast "In Inbox ✓ · Rückgängig"; text flies to Inbox | tile "+ Todo" (also on the lock screen), widget "+", shortcut, share sheet "runway", FAB "+ Todo" on Nächste and Warten auf, the always-focused field on Inbox; notice "In Inbox ✓ · Rückgängig" |
| **Clarify** | Inbox: the top item is in the "Klären" card; `1` then context digit (or "ohne Kontext"), `2`, `3`, `4` Projekt (picker over active projects, or "Neues Projekt: <Text>" which creates it with `POST /projects` and files the item as its first next step), `X`, `⌫`; `J/K` to pick another; the puck taxis to its place; details panel for dates and priority | tap an Inbox row: Bearbeiten, Nach Nächste … (context chips), Nach Warten auf, Nach Irgendwann, Löschen (scope change, see below); the full form stays in the web |
| **Do** | Nächste: three cards at the threshold, list below; `J/K`, `X` abhaken, `S` start, `Enter` details, `0–5` context, `Z` undo | Nächste: chips, Fällig, Nächste Aktionen (first three marked 01–03 with a lane light); tap the ring or swipe right; widget ring ticks off without opening the app |
| **Review** | Wochenrückblick: five steps with live counts (Inbox leeren, Nächste, Warten auf nachhaken, Projekte ohne nächsten Schritt, Irgendwann) and "Rückblick abschließen" (`POST /gtd/review`); step 4 names each stalled project inline with a "Nächsten Schritt festlegen" field (context chips 1–5 or "ohne Kontext", default none; `@kontext` in the text also works); Warten auf rows carry "Nachgehakt" (follow-up + 7 days, with undo) | read-only Projekte with mini runways and "kein nächster Schritt"; the review itself stays on the web (PLAN non-goal) |

### Inventory coverage

Kept: every list, every field of the task model, project creation (inline "Neues Projekt" on Projekte, from the palette and from clarify, with the API's name rules), project plans (now an editable tab inside the project: Zweck, Prinzipien, Vision, Ideen with input, Ordnen und Aktionen with ↑↓ and drag, "Aus Ideen übernehmen", Speichern with `⌘S` and a saved/unsaved state; no emoji; "Nach Nächste" creates a `+next` task with the project, fixing "→ Task" landing nowhere), clarify into a project, project status (`active / on_hold / done`) and stalled, All/Done (as Erledigt), tickler (as Zurückgestellt, new on the web), settings (profile, password, API key, Connect Claude, MCP tabs Claude Code / Claude Desktop / curl, language, admin cards: registration toggle and users with promote/demote), login (brand card unchanged), start/pause, annotations, dependencies, recurrence (disabled without a due date), search (palette over description, project, raw tags), sign out ("Abmelden" in Einstellungen and in the palette; flushes held changes first).
On Android everything pinned stays: tabs, field `Neues Todo`, `Stand hh:mm`, `Abhaken: …`, `In Inbox ✓`, `Rückgängig`, `Erledigt`, `Gelöscht`, `Fällig` heading, `Nächste Aktionen`, `Nachhaken …`, widget header `Inbox N · fällig M`, `+K weitere`, `+ Todo`, share label `runway` and button `In Inbox`, setup and outbox signals, no spinners.
Changed: web capture no longer opens a form; the strict web context filter on every list is dropped (it emptied the Inbox); urgency badges go; emoji go; the manual dark toggle becomes system plus a setting.
Dropped: the web "All Tasks" list without a filter (folded into search plus Erledigt with "Heute" and "Früher · letzte 14 Tage"; if Uli uses it, it returns as "Alle" under Mehr). The first version of this README claimed "nothing dropped" while project creation, plan editing, clarify into a project, sign out and the admin cards were missing; all five are back (see "Changes after review").

---

## Web build plan (Vue 3, Tailwind, Pinia)

| Today | Becomes |
|---|---|
| `AppShell.vue`, `NavItem.vue` | `SideRail.vue` (brand, `CaptureField.vue`, `NavList.vue` with lamps and counts, `ContextList.vue`, Mehr, Stand) and `PhoneTabs.vue` |
| (none) | `CommandPalette.vue` (search, go-to, phone Mehr), `ShortcutLayer` composable (`useShortcuts`), `UndoToast.vue` + `useUndoHold` and `useOutbox` (below) |
| `TaskList.vue`, `TaskRow.vue`, `UrgencyBadge.vue` | `TaskSection.vue` (dashed centre-line heading), `TaskRow.vue` (check ring always, meta right), `ClearedCards.vue`; `UrgencyBadge` removed |
| `TaskModal.vue`, `TaskActionSheet.vue` | `TaskDetailPanel.vue` (drawer on wide, bottom sheet on phone), route-driven by `?task=` |
| (none) | `ClarifyCard.vue` (Inbox) |
| `ProjectsView.vue`, `ProjectPlanModal.vue` | `ProjectsView.vue` on `/gtd/projects/overview` with `ProjectCard.vue` and `MiniRunway.vue`; `ProjectView.vue` on `/projects/:name` with tabs Aufgaben / Plan |
| (none) | `ReviewView.vue` (`/review`), `TicklerView.vue` (`/tickler`), `DoneView.vue` (`/done`) |
| `SettingsView.vue`, `LoginView.vue` | restyled with tokens, German |

**useUndoHold and the outbox.** Captures are never held: `POST /inbox` goes out at once, and Rückgängig within 6 s sends `DELETE /tasks/{uuid}` (as Android does after sending). Done, delete, clarify and "Nachgehakt" are held for 6 s; the held queue is mirrored to IndexedDB (`runway-held`) and flushed on `pagehide` and on `visibilitychange=hidden` with `fetch(…, { keepalive: true })`; on the next start anything left in IndexedDB is applied and sent. Every request that fails (network, 4xx/5xx) lands in `outbox.failed`: the row shows "Nicht gesendet · Erneut senden", the toast offers "Erneut senden", the side foot shows "N nicht gesendet", and coming back online retries. The prototype implements exactly this in `model.js` (`proto.network(false)` shows the failure state).

**Strings.** `vue-i18n` with the keys of `i18n.js`: German default, English second, every rendered string carries a key (`data-i18n` in the prototype); language under Einstellungen. Android: `values/strings.xml` (de) plus `values-en/strings.xml`.

**The airfield in Vue.** `src/shared/airfield/world.js` (pure math, unit-tested in vitest), `fallback.js` (SVG), `scene.js` (Three.js). `AirfieldStage.vue` takes one prop, a snapshot computed by a Pinia getter (`useRunwaySnapshot`), and exposes `depart(id)` for the completion action. It renders the SVG poster at once and loads `scene.js` with `import()` after `requestIdleCallback`; Vite puts `three` (npm `three@0.169.0`, no CDN in production) into its own `airfield` chunk via `manualChunks`. The scene owns no app state and emits nothing; a WebGL error just leaves the SVG. Feature boundaries stay: the stage lives in `src/shared` and `src/components`, used by `fe/tasks` only.

**Tailwind mapped to tokens.** `tailwind.config.js` extends `colors` with the semantic tokens (`surface: 'var(--rw-surface)'`, `action: 'var(--rw-action)'`, `now`, `wait`, `line` …), `fontFamily` (sans, mono, serif), `borderRadius` (sm 8, md 12, lg 18, xl 22, pill), `transitionTimingFunction` and `transitionDuration` from the motion tokens, and sets `darkMode: ['selector', '[data-theme="dark"]']` next to the media query in `tokens.css`. The default palette (gray, indigo, red …) is removed from the config so a stray `bg-indigo-600` fails the build; an ESLint rule forbids hex values in `.vue` files.

**API use.** `POST /inbox` for capture; `PUT /tasks/{uuid}` with `tags_add` / `tags_remove` for clarify and list changes; `/gtd/summary` for counts, lamps and "today"; `/gtd/projects/overview` and `PUT /projects/{name}/status`; `/gtd/tickler`; `GET/POST /gtd/review`. Contracts in `frontend/tests/` keep passing (context splitting, filters, payload diff, MCP tab names, Connect steps); new pure tests for `world.js`, the runway order and the undo hold.

## Android build plan (Kotlin, Jetpack Compose, Glance)

- **Theme.** `ui/theme/RunwayTokens.kt` is generated from `tokens.json` (`light/darkRunwayColors`, `RunwayShape`, `RunwayMotion` with `CubicBezierEasing`). `RunwayTheme` maps them onto a Material 3 `ColorScheme` (primary = action, onPrimary = onAction, surface, surfaceContainer = raised, outline = line …) and a `Typography` with bundled fonts in `res/font` (Space Grotesk 400/500, JetBrains Mono 400/600, Fraunces 300 italic). Dynamic colour is replaced by the brand (scope change below).
- **Header.** 176 dp; 40 dp under Mehr (Projekte, Irgendwann and the rest show no field). On Warten auf the camera pulls back and centres on the holding pattern so both rings fit with 24 dp clear of the caption (phone-specific `cameraFor('waiting')`). `ui/airfield/AirfieldHeader.kt`: `Modifier.drawWithCache { RuntimeShader(AIRFIELD_AGSL) … onDrawBehind { setFloatUniform(…); drawRect(ShaderBrush(shader)); drawPath(trails) } }`. `airfield/World.kt` is a direct port of `world.js`. `AirfieldState` holds `Animatable`s for the camera, every token position and the lane levels; list changes start coroutines that animate them; nothing is drawn when nothing animates. AGSL supports everything the shader uses (loops with constant bounds, `float4` array uniforms, `refract`); no Filament or SceneView is needed. Filament would only enter if a later version wants glTF models (for example the brand character).
- **Collapse with the keyboard.** The header height follows `WindowInsets.ime`: with the keyboard up the header shrinks to the status bar, which keeps the pinned "five rows above the keyboard".
- **Fallback.** If `ValueAnimator.areAnimatorsEnabled()` is false (remove animations) or the shader fails, `Canvas` draws the flat version from the same `World.kt`, including the two dashed holding ovals; the sky/ground split is skipped when the horizon lies above the frame.
- **Lists.** Existing rows restyled: 48 dp ring; the cleared three carry the mono rank 01–03 and a 1 dp yellow threshold line under rank 03, never coral; the 4 dp coral bar stays only on overdue and follow-up-due rows (keeps the pixel-hue test: overdue measurably red, "fällig heute" clearly less red); dashed section headings; 150 dp bottom padding so the FAB and the gesture bar never cover the last row. Swipe right and pull-to-refresh unchanged. Warten auf rows get "Nachgehakt".
- **Mehr.** Adds read-only `ProjectsScreen` (`/gtd/projects/overview`, mini runway) and `SomedayScreen` (`/gtd/someday`), both cached like the other lists.
- **Widget (Glance).** Same pinned header and chip; the cleared three of the chosen context on a mini runway (a `Box` lane with a dashed centre line and a dot in the urgency tier: coral with ring, coral, hollow ink), a 1 dp yellow threshold line, then plain rows that fill the 4×3 height (five rows in total at the default size, up to eight when resized), the check ring, text, "überfällig"/"heute"; foot "+K weitere" in ink / "Stand". Empty: "Nichts fällig". Colours via `ColorProvider(day, night)` from the tokens. No bitmaps.
- **Tile, overlay, share.** `CaptureTileService` unchanged (the system draws the tile, shown in neutral system colours in the prototype). `OverlayViews.kt` keeps the pinned contract exactly: field, notice, Rückgängig, Schließen (no extra eyebrow, hint or send button). `ShareViews.kt` stays a plain View for the time budget, restyled with the tokens: paper card radius 22, pill field, coral button, mono eyebrow.
- **Launcher icon.** Adaptive icon with the brand mark on bg, plus the monochrome layer.

## One token source

`tokens/tokens.json` holds brand colours, semantic colours (light and dark as brand references or `["mix", a, %, b]` / `["alpha", a, %]`), radii, spacing, type and motion. `node tokens/gen-tokens.mjs` writes `tokens.css` (CSS variables that keep `color-mix()` visible) and `RunwayTokens.kt` (resolved ARGB, `dp`, `CubicBezierEasing`). In the real setup the file lives in the runway repo (`design-tokens/`), the web build runs the script before Vite, and the Android repo runs it as a Gradle task against a pinned copy. Changing a token is one PR per repo with the regenerated output.

---

## Accessibility

- All text is DOM or Compose semantics; the canvas is `aria-hidden`, a polite live region reads "Jetzt dran: …". Every visual signal has words: overdue label, "läuft seit", "Nachhaken seit", "N heute erledigt", "kein nächster Schritt".
- Contrast: body ink on bg 16:1; `text-mute` ≥ 5.5:1 and used for every small label that carries meaning (context labels, chip, nav and tab counts, "Stand"); `text-soft` (≈ 3.2:1) only for decoration such as hairline numerals that repeat a visible word; `now-text` 4.8:1 on bg; coral never carries small text on light surfaces (the widget's "+K weitere" is ink); buttons are ink on coral (7.2:1) instead of white (2.6:1).
- Full keyboard on the web (`?` shows the map), focus ring `outline: 2px solid ink` plus a 4 px coral halo (the ink outline carries the ≥ 3:1 contrast of WCAG 1.4.11; the halo only ties it to the brand), single-key shortcuts pause while typing, palette with arrows and Enter.
- Targets ≥ 44 px (web) and ≥ 48 dp (Android); chips wrap at 150 % font scale; the Android row accessibility strings stay exactly as pinned.
- `prefers-reduced-motion` and Android "remove animations" give the flat field and no FLIP; state changes are instant and announced.

## Performance budget

| Item | Budget |
|---|---|
| Web first paint | no WebGL on the critical path; SVG poster and list at once |
| Web app JS (without three) | ≤ 120 KB gzip |
| `airfield` chunk | three core + addons ≈ 190 KB gzip, loaded after idle, cached |
| Scene build | ≤ 150 ms on an M1; shaders compiled once (`renderer.compile`) |
| Frame while animating | ≤ 8 ms at 1100 × 200 × DPR 2 (transmission pass included); ≤ 24 transmissive nodes |
| Idle | 0 frames; paused when hidden |
| Android header | ≤ 2 ms per frame on Pixel 9 (412 × 176 dp, 24 spheres); 0 frames idle |
| Android cold paths | tile, shortcut and share unchanged (plain Views); the header appears after the first frame, never delays the Inbox field and keyboard (pinned 800 / 1500 ms) |

## Effort estimate

Raised by about 35 % after the review: the first table was optimistic for a 600-line physical scene with a FLIP sync, and it left out project creation, plan editing, the outbox and the strings.

| Web (person-days) | | Android (person-days) | |
|---|---|---|---|
| tokens, Tailwind mapping, lint | 2 | theme from tokens, fonts | 2.5 |
| shell, tabs, palette, shortcuts | 4.5 | header: AGSL port, `World.kt`, animation state, fallback | 8 |
| undo hold, IndexedDB outbox, keepalive flush, error states | 3 | lists restyle within the contracts, Nachgehakt | 4 |
| rows, sections, cleared cards, FLIP | 4 | Mehr: Projekte, Irgendwann (API, cache) | 3.5 |
| clarify card and flows, incl. into a project | 3 | Inbox menu clarify (outbox kind, if approved) | 3.5 |
| detail panel, routes, `?task=` | 3.5 | widget mini runway, context filter | 3 |
| projects overview, project creation, project view | 3 | tile, overlay, share restyle, launcher icon | 2 |
| plan tab editing (five fields, ordering, save) | 3 | strings de/en | 1 |
| waiting, tickler, done (heute, früher), review | 3.5 | acceptance contract updates with the critic | 2.5 |
| settings incl. admin cards, sign out | 1.5 | device QA, cold-start budgets | 3 |
| airfield in Vue (scene, fallback, lazy chunk, tests) | 7 | | |
| dark mode, a11y pass, strings de/en | 3.5 | | |
| QA, visual checks | 3 | | |
| **total** | **≈ 44.5** | **total** | **≈ 33** |

Risky parts: transmission cost on weak laptops and phones (mitigation: DPR 1 and no transmission below a GPU tier, the SVG is always there); lane alignment with responsive cards (covered by `relayout`); FLIP and 3D in step (shared timing constants); exclusive status tags on old data with several status tags; Android contract updates (labels mostly unchanged, but new surfaces need new acceptance tests); the pixel-hue test for overdue with coral instead of Material red.

---

## Brand deviations (need Uli's approval)

Written the way `visuell.md` lists the slide deviations: what, where, why.

1. **Glass and light in the field only.** Transmissive glass nodes, emissive light and bloom inside the WebGL stage and the AGSL header. The kit forbids glassmorphism beyond the nav blur; DOM surfaces stay flat paper. Why: the glass and light carry the state (urgency, progress); flat circles exist as the fallback.
2. **Shading inside the field.** Lighting falloff, fog to the horizon and the dark-mode halo are gradients in effect. The kit says no gradients; DOM and the static fallback have none. Why: physical materials need light, and the motion notes ask for real shading.
3. **Coral beyond the primary action, as one closed list.** Besides the primary action (capture `+`, FAB, "Nächste" in clarify, send buttons, Speichern) and the `//` mark, coral appears only here: (a) "now": overdue and due-today dots and labels (`now-text`), the overdue check ring, the 4 dp bar on overdue and follow-up-due rows, the sidebar lamp when time presses in that list (overdue or follow-up due), the coral lane lights, cores and ring of the tiers "überfällig" and "bald", follow-up-due tokens; (b) feedback of the action itself: the check fill while a check-off happens and the liftoff trail and contrails; (c) the focus halo and the focused-input border (always with an ink outline for contrast) and the swipe-to-complete tint on Android. Not coral any more: completed checks in Erledigt (ink), "Löschen" (ink, undo instead of a warning colour), list-not-empty lamps (ink-mute), mini-runway dots (ink), keyboard selection (ink tint, ink bar), tab underlines (ink), the widget "+K weitere" (ink). Why: urgency needs one signal colour, and coral is the brand's live colour (pulse dot); it matches the approved slide use of coral for results.
4. **Ink text on coral buttons.** The kit's `.ar-btn-coral` uses white text (2.6:1, fails WCAG AA). Startbahn uses ink (7.2:1).
5. **Four in-house glyphs.** Plus, search, check, close, drawn in the stroke language of the mark. Not a library, but more than the kit's mono symbols.
6. **Product lockup.** Mark plus "runway" in Space Grotesk in the app header instead of "Agentic Reach". The mark is unchanged and recoloured on dark exactly as the kit's `.ar-on-dark` does.
7. **App type sizes.** Fixed sizes (34 / 19 / 15 / 13 / 11) instead of the website's display clamps, like the approved fixed slide sizes.
8. **Second language.** The kit asks for German first and English second on every visible string. The prototype carries `data-i18n` keys with both dictionaries (`i18n.js`, switch under Einstellungen · Sprache); the product name `runway` and the list name "Inbox" stay the same in both. Not a deviation, listed so the reviewer can check it.
9. **Kit components adapted.** Cards hover-lift 3 px instead of 4 px in dense lists; the stage reuses `.ar-frame` (mono caption top-left, tag top-right) at radius 22.

## Android scope changes (need Uli's decision)

`runway-android/PLAN.md` (24.10.2026) lists these as non-goals or does them differently. Each is optional; the design works without them.

1. **Clarify from the Inbox row menu** ("Nach Nächste …", "Nach Warten auf", "Nach Irgendwann"). Adds no tap or wait to capture. Non-goal today: clarifying in the app.
2. **Read-only Projekte and Irgendwann** under Mehr.
3. **Brand theme instead of Material You** dynamic colour, and the brand mark as launcher icon.
4. **The header band** on Nächste and Warten auf (collapses with the keyboard on Inbox).
5. **FAB "+ Todo"** on Nächste and Warten auf, opening the same field.
6. Details keep opening the web in a Custom Tab, which now lands on the detail because the web reads `?task=`. A native detail stays a non-goal.

## Open questions

1. Do the airfield eyebrows (`// vorfeld`, `// startbahn`, `// warteschleife`, `// flugplan`, `// hangar`) feel right, or should eyebrows show only plain words? Body copy uses no aviation words ("Jetzt dran", "Alles oben.", "Nichts fällig", "heute abgehakt").
2. Web capture always to the Inbox: is losing the "create with all fields" form acceptable (the detail panel is one Enter away)?
3. Context filter only on Nächste, lenient rule, on the web too?
4. Default follow-up when clarifying to Warten auf: 7 days ("Wiedervorlage 07.11.")?
5. Contrails reset at Berlin midnight; should the sky show yesterday faintly for the morning review?
6. Should "Alle Todos" stay as its own list under Mehr?
7. The Quick Settings tile colour is drawn by the system; only the label and icon are ours (the prototype shows it in neutral system colours). Fine?

## Known weaknesses of the prototype

- Light mode has no bloom by design (dark only), so in light mode the tiers read through lane reach, core colour and the overdue ring; they are distinct, but the dark field is still the more striking one.
- The field still repeats information the DOM already gives (positions of the cleared cards, the number of waiting items). What it adds are the three urgency tiers at a glance, the running ring, the holding pattern's inner ring and the liftoff as feedback; on the phone web it was reduced to Nächste only for this reason.
- The capture drop lands on the apron, which is at the far right edge of the Nächste view; the drop is fully visible only on Inbox.
- The detail panel edits are shallow (no validation messages, dependencies limited to a picker over Nächste).
- Android: the Custom Tab, the keyboard and the Quick Settings shade are mocks; tile colours are system-owned in reality. On Warten auf the near follow-up token sits close to the sheet edge.
- The signature screenshot depends on machine timing; `proto.signature()` waits for the scene and resolves 430 ms into the liftoff to make it repeatable.

---

## Verification

Screenshots (from the design folder, `node shared/tools/shot.mjs …`), each checked by eye:

| Shot | Command |
|---|---|
| `web-desktop.png` | `02-startbahn/index.html` |
| `web-dark.png` | `--dark` |
| `web-phone.png` | `--size=phone` |
| `web-reduced.png` | `--reduced` (static field) |
| `web-inbox.png` | `--eval="proto.show('inbox')"` |
| `web-signature.png` | `--eval="proto.signature()" --wait=150` (the signature resolves 430 ms into the liftoff) |
| `android.png` | `02-startbahn/android.html --size=1440x1000` |

Keyboard map on the web: `N` neues Todo, `/` or `⌘K` suchen, `J/K` bewegen, `X` abhaken, `Enter` details, `S` starten, `Z` rückgängig, `G` then `I N W P S` for the lists, `0–5` Kontext, in the Inbox `1 2 3 X ⌫`, `?` alle Tasten.

---

## Changes after review

The critic scored usability 6, appeal 6.5, brand fit 6, Three.js value 4. The biggest gap was a field that took a third of the most-used screens and encoded urgency invisibly, plus a context filter that put the wrong task into slot 01. What changed:

**Must-fix items**

1. **Context filter.** `sel.next(ctx)` / `sel.runway(ctx)` build the cleared three and the queue only from tasks that match the context. Due items of other contexts move to an unranked section "Fällig · andere Kontexte" (web) or stay under the pinned "Fällig" heading without rank or lane (Android). Title, chip and sidebar context counts use one function (`sel.ctxCount`). The widget uses the same rule.
2. **Field carries information, and is smaller.** Three urgency tiers (überfällig: full coral lane, coral core, coral ring; bald, ≤ 3 days: half lane, coral core; ruhig: three paper lights, paper core) in `world.js`, `scene.js`, `fallback.js`, the Android shader and the widget. Stage 312 → 200 px on desktop; on phone web only on Nächste, at 120 px; Android header 262 → 176 dp, 40 dp under Mehr.
3. **No data loss on the web.** Captures go out at once (`POST /inbox`), undo is a `DELETE`. Done, delete, clarify and Nachgehakt are held 6 s, mirrored to IndexedDB and flushed with `keepalive` on `pagehide` and `visibilitychange=hidden`. Failures show "Nicht gesendet · Erneut senden" on the row, in the toast and in the side foot (`proto.network(false)` demonstrates it).
4. **Dropped functions restored.** Project creation (Projekte inline field, palette, clarify), editable plan tab with all five fields (Zweck, Prinzipien, Vision, Ideen, Ordnen with ↑↓, drag and Speichern), clarify into a project (`4 Projekt …` with picker and "Neues Projekt: …"), Abmelden, admin cards (registration, users). Inventory coverage and effort table corrected.
5. **Android lane bars.** Coral bar only on overdue and follow-up-due rows; the cleared three get the mono rank and a 1 dp yellow threshold line under 03.
6. **No forced @computer.** The next-step form (project view, stalled card, review step 4) has context chips with "ohne Kontext" as default; `act.addNext` takes the context from the chips or `@kontext` in the text, otherwise none.
7. **Contrast and focus.** Focus ring is an ink outline with a coral halo; context labels, chip, nav and tab counts and "Stand" use `text-mute`; the widget "+K weitere" is ink.
8. **Android Warten auf header.** Phone camera for the holding pattern (all four tokens in frame, clear of the caption); the static fallback draws both dashed ovals and no longer paints the ground wedge.

**Undeclared brand violations**

- Coral scope is now one closed list in deviation 3; completed checks, Löschen, list lamps, mini-runway dots, selection and tab underlines are ink.
- The `//` mark uses JetBrains Mono 400 (was 600).
- Every string carries a `data-i18n` key, German default, English second (`i18n.js`, language switch in Einstellungen).
- No aviation words in body copy: "Jetzt dran", "Alles oben.", "Nichts fällig", "heute abgehakt"; "Die Startbahn ist frei" is gone. Aviation stays in mono eyebrows only.
- No small coral text on light surfaces (widget foot fixed).

**Nice-to-have items taken:** clarify title wraps to three lines on the phone; "Wochenrückblick" renders as one word; coral overload reduced (above); counts once in navigation and once in the title; cleared cards stack below 1180 px; "Nachgehakt" row action; review step 4 names stalled projects with an inline field; waiting items excluded from Zurückgestellt; widget fills its height with plain rows after the cleared three; Erledigt gains "Früher · letzte 14 Tage"; Android list bottom padding for the FAB, neutral QS tile, overlay reduced to the pinned contract; detail label "Beginnt" for `scheduled` outside Warten auf; bloom only in dark mode in code and README; effort raised by about 35 %; i18n plan.

**Deliberately left**

- **The field stays on Inbox and Warten auf on wide web and Android.** At 200 px / 176 dp it no longer dominates, and these are the places of the camera move that tells you where you are; on phone web, where space is scarcest, it is gone. If Uli finds it repetitive, the rule from phone web (field only on Nächste) can be applied everywhere without touching anything else.
- **The holding pattern and apron pucks stay.** They partly repeat the list. They are kept because the inner ring (follow-up due) and the selected puck are state, and the review asked to keep the direction's identity. They are the first candidates to cut.
- **The coral focus halo stays,** next to the ink outline that carries the contrast; declared in deviation 3.
- **Android clarify from the Inbox menu, Projekte and Irgendwann under Mehr** remain scope changes that need Uli's decision; they are built in the prototype but optional.

