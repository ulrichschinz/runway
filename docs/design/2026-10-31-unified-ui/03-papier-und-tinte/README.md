# 03 · Papier & Tinte

**The idea in one sentence:** runway as a well-set page, where typography and hairlines carry all structure and the only ink that ever moves is ink that means something: a coral pen stroke when you finish a todo, and ink soaking into clean paper at the moment the Inbox reaches zero.

This is the control proposal of the five: the fewest effects, the highest speed and density. It shows that "fancy" can come from type, rhythm and restraint, with one physically shaded moment that is earned.

| File | What |
|---|---|
| `index.html` + `web.js`, `web.css` | Web app prototype (desktop first, docked panel at medium widths, responsive to phone) |
| `android.html` + `android.js`, `android.css` | Phone app (412 × 915 dp) plus widget, Quick Settings tile with capture overlay, share target, launcher shortcuts; below them three still phones with the pinned states (keyboard open, outbox states with banners and the failed-row menu, 150 % text) |
| `rules.js` + `rules.test.mjs` | Pure GTD list rules and the API payloads of every list move; `node --test 03-papier-und-tinte/rules.test.mjs` (9 tests) |
| `store.js` | One store for every surface: server list rules, lenient context rule, 6 s hold with undo; every write is logged as the request the real client sends (`proto.calls`) |
| `common.js`, `base.css` | Shared language: dates, headings, row, strike, tally, notice, lockup |
| `ink.js` | The one WebGL surface (Three.js 0.169, lazy, only for the change to zero) |
| `ink.agsl` | The same ink field as an Android RuntimeShader (sketch) |
| `tokens/tokens.json` → `gen-tokens.mjs` → `tokens.css`, `RunwayTokens.kt` | One token source for both platforms (the prototype reads the generated CSS) |
| `shots/` | Verified screenshots: the seven required ones plus `android-zustaende.png` (the still phones) |

View: from `2026-10-31-unified-ui/` run `python3 -m http.server 8340 --bind 127.0.0.1` and open `/03-papier-und-tinte/`. Test hook `window.proto` works as in `shared/README.md` on both pages, plus `proto.calls` (the requests a real client would have sent). `proto.signature()` resolves when the last item is filed; the ink starts a frame later and is richest 1.0 to 1.6 s after that (`--wait=1400`). `index.html?task=<uuid>` opens that todo's details (the Android handoff). `android.html?start=inbox` opens the phone on the Inbox with the keyboard up.

---

## Design principles

1. **The page is the interface.** No cards for rows, no boxes around sections. A mono eyebrow, a big quiet heading, hairlines, then content. Hierarchy comes from size, weight and space, not from containers.
2. **One accent word per heading.** "Was jetzt *zählt*", "Was ist *das*?", "Worauf du *wartest*", "Was du *bewegst*", "Später, *vielleicht*", "Die Woche, *sortiert*", "Inbox ist *leer*." The Fraunces word is the only ornament on a screen.
3. **Ink means done.** Coral ink is the trace of the primary action. A todo you finish is struck through by hand, today's work collects as a tally (Strichliste), and the step to an empty Inbox gets the one big ink moment. Nothing else moves for decoration.
4. **Every action is one key or one tap, and the last action can be undone for 6 s.** Capture, check off and delete are held 6 s before sending, as Android's outbox already does (the API cannot reopen or undelete). Filing and project status are sent at once, because the API can reverse them: Rückgängig sends the exact inverse (`tags_remove` what was added).
5. **Same page on every screen.** Same list names, headings, row anatomy, markers, tab bar and tokens on the wide web, the phone web, the Android app and its widget. Platform differences are about input (keyboard and margin column on the web; thumb, swipe and sheets on Android), not about look.
6. **Density without noise.** One line per todo on desktop (two on phones), meta in JetBrains Mono at 11.5 px in fixed columns, so the eye reads down a column like a timetable. The urgency number is gone: order already expresses it.

## Visual language

### Semantic tokens (from `tokens/tokens.json`)

All colours are brand colours or `color-mix` of them. The `--rw-*` layer is what components use; nobody touches hex values.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `bg` | `--ar-bg` #FBF6EE | `--ar-ink` #1B1428 | page paper |
| `surface` | `--ar-paper` #FFF | bg 7 % in ink | sheets, widget, popovers |
| `sunk` | `--ar-bg-alt` | bg 4 % in ink | code fields, Custom Tab bar, keyboard |
| `text` | ink | bg | everything readable |
| `mute` | ink 62 % (4.88:1) | bg 70 % (8.6:1) | every secondary text: meta, labels, counts, hints, the check ring |
| `soft` | ink 40 % (2.5:1) | bg 50 % | **placeholders only** (and the `·` separator) |
| `rule` / `ruleStrong` | ink 10 % / 20 % | bg 12 % / 22 % | hairlines, outlines |
| `focus` | plum 12 % | plum-light 16 % | keyboard cursor row (always with a 2 px accent rule) |
| `select` | plum 18 % | plum-light 34 % | text selection (never a yellow fill) |
| `accent` | plum | plum 45 % in bg (#A69BAC) | Fraunces word, project outcomes, tally |
| `action` / `onAction` | coral / ink | coral / ink | primary pill, capture "+", strike ink |
| `marker` | yellow | yellow | dot = you are here, ring = needs a look, 1 px undo line |
| `overdue` / `overdueMark` | coral 60 % in ink (#A45150, 5.0:1) / coral | coral / coral | "überfällig", "Nicht gesendet", overdue ring / edge rule |
| `inverse` / `onInverse` | ink / bg | bg / ink | notice bar, selected chip |
| `inverseAction` | coral | coral 60 % in ink | "Rückgängig" on the notice bar (7.0:1 / 5.0:1) |
| `inkA` / `inkB` | coral / plum | coral / plum-light | the two pigments of the ink moment |

### Type scale

Three faces only, in the kit's weights. Space Grotesk 400/500 for UI, Fraunces italic 300 for the one accent word (and project outcomes), JetBrains Mono **400** for eyebrows, meta, counts, keycaps and the `//`. No Mono 600 anywhere: emphasis in mono comes from colour (`text` instead of `mute`), never weight.

| Role | Web | Android | Notes |
|---|---|---|---|
| display | clamp(34, 3.6vw, 54) / 1.04, 500, −0.03em; 30 on phones | 32 sp | one per screen; collapses into the eyebrow while the keyboard is up (Android Inbox) |
| title | 24 / 1.2, 500 | 22 sp | detail and clarify title |
| tab | 15 | 15 sp | phone web and Android, one line each |
| row | 15 / 1.4 (16 on phones) | 16 sp | max 1 line desktop, 2 lines phone |
| body | 14 / 1.55 | 15 sp | leads, notes |
| meta | Mono 11.5 / 1.35, +0.02em | 12 sp | project, context, dates, outbox status |
| eyebrow | Mono 11, +0.06em, mixed case | 11 sp | `// Nächste · @anrufe · 3` |

### Shape

Pills for every button, chip and keycap; `radius-xl` (22) for sheets and the widget; `radius-lg` (18) for dialogs; no cards around rows. The check ring is 18 px on the web and 22 dp on Android, always inside a 28 px / 48 dp target. Every Android and widget target is 48 dp, including the widget chip (a 32 dp pill inside a 48 dp box) and the overlay's "Schließen".

### Motion

One curve everywhere: `--ar-ease` cubic-bezier(.2, .8, .2, 1). Durations from the kit: 120 (hover, chip), 180 (notice, view in, collapse), 260 (strike, sheet). Fixed sequences:

| Sequence | Timing |
|---|---|
| Check off | ring fills + strike draws 260 ms → hold 380 ms → row collapses 180 ms → gone at ≤ 820 ms (Android contract: ≤ 1 s, no lingering node) |
| File from Inbox | stamp `→ Nächste · @anrufe` slides in 180 ms → hold 340 ms → collapse 180 ms |
| Undo window | 6000 ms, shown as a 1 px yellow line draining under the notice |
| Inbox to zero | ink runs 0–1.7 s (wet, glossy), sinks in 1.7–3.3 s until the page is clean, canvas removed at 3.4 s |
| View switch | heading and list fade-rise 6 px, 180 ms |

## Iconography

No icon library, and almost no icons. The interface is text plus the kit's mono symbols: `+` (capture), `//` (section), `·` (separator), `···` (Mehr), `→` / `←` (go, back), `¶` (notes), `×` (close), `✓` (In Inbox ✓, a ticked review step), and keycaps. Markers carry state instead of icons: the **yellow dot** marks where you are (nav item, the selected tab, keyboard row), the **yellow ring** marks something that needs a look (stalled project, review due, a follow-up that is due), the **coral pulse dot** (the kit's live dot) marks a running todo. The only drawn glyphs are the ones Android requires for system surfaces: the Quick Settings tile icon (a monoline ring with a plus, the same ring as the check control), the notification small icon, and the adaptive launcher icon (the brand mark on paper, in light and dark). See deviation 9.

The brand lockup (32 px mark + "Agentic Reach" in Space Grotesk, the kit's `.ar-nav-brand`) sits at the top of the web rail, of the phone web's "···" sheet and of Android's Mehr sheet. Phone tab bars carry no bare mark.

## Signature moments

1. **Durchstreichen (the strike).** Checking off draws a slightly uneven coral line through the words, the ring fills with coral, then the line folds away. On Android the line follows your thumb while you swipe right; past 35 % it is complete, the ring fills and a haptic tick confirms. The same stroke appears at rest in the "Heute" margin, where today's done todos stay visibly crossed out.
2. **Strichliste (the tally).** Each todo done today adds one plum stroke in the margin; every fifth is a coral strike across the four. Progress without a fake denominator.
3. **Leere Seite (inbox zero).** At the moment the last Inbox item is filed, completed or deleted, a drop of ink lands on the empty page and runs into the paper: coral pigment stays in the core, plum travels to a darker tide line (paper chromatography), wet ink glistens under a high window light, then dries and sinks in completely, so the page under "Inbox ist *leer*." is clean again. On a dark page the pigment is lifted so it reads as light on ink. It explains one state change, everything has a place now, and only that change: an empty Inbox you come back to is plain typography, with no canvas.

## Effects

Rule 5.1 applied: every effect explains a state or gives feedback; the list says which.

| Effect | What it explains | Web (Three.js or DOM) | Android (native) | Reduced motion / fallback |
|---|---|---|---|---|
| Leere Seite (ink bloom) | the Inbox **went** to zero: everything is clarified | Three.js 0.169, one transparent canvas over the DOM paper. `MeshPhysicalMaterial` with the ink field injected (`onBeforeCompile`): pigment density, fibre relief in the normal, a wet meniscus driving clearcoat; hemisphere + raking key + high window light, `RoomEnvironment` reflections, `NeutralToneMapping`, dithering, values clamped before `pow()`, edge mask so no canvas edge ever shows. No bloom pass, no camera move (nothing on paper is brighter than paper; the page is the camera). Modules fetched in idle time when the Inbox is at 1 or 2 (no WebGL context). On the step to zero: context created, shader compiled with `compileAsync`, about 200 frames, then canvas removed and context released. Never on a revisit. | AGSL `RuntimeShader` (`ink.agsl`) in `drawBehind`, `uT` from an `Animatable`; the composable exists only during the moment and leaves the tree at 3.4 s; Lambert + Blinn-Phong instead of PBR, same `uDark` lift and same clean end; half-resolution layer if a frame exceeds 8 ms. | Reduced motion, WebGL/AGSL failure, context loss, hidden tab: no canvas; "Inbox ist *leer*." with the same lead and actions carries the information. |
| Durchstreichen (strike) | this todo is done; the 6 s undo window starts | SVG path with `pathLength=1`, `stroke-dashoffset` transition, seeded wobble per todo; the SVG turbulence pen-edge filter is applied only while ink is visible (struck, swiping, the done list) | Compose `Canvas` `drawPath` with `PathMeasure.getSegment` driven by swipe offset or an `Animatable`; ring fill via `animateColorAsState` | line appears complete at once, row removed after 160 ms, undo unchanged |
| Stamp (filing) | where the Inbox item went | DOM text slide-in | `AnimatedVisibility` slide + fade | static stamp |
| Strichliste (tally) | how much got done today | inline SVG strokes, newest one drawn in 260 ms | `Canvas` lines with seeded tilt | strokes static |
| Undo line | how long you can still undo | 1 px yellow line, `scaleX` 1 → 0 over 6 s | `drawLine` with animated fraction | no line; "Rückgängig" stays 6 s |
| Läuft (pulse) | this todo is in progress | the kit's coral `ar-pulse` dot (CSS, compositor only) | `rememberInfiniteTransition` alpha/scale | static dot |
| New (yellow dot) | this row just arrived | dot after the text fades after 2.4 s | `animateFloatAsState` | dot until next refresh |
| View in | the screen changed | 180 ms fade-rise of heading and list | default Compose crossfade | none |

## Key flows

**Capture.** Web: `n` from anywhere focuses the capture line at the bottom of the page column ("+ Neues Todo · ⏎ in die Inbox"); Enter saves, the field stays open for the next one, the notice says "In Inbox ✓ · Rückgängig". The draft survives a reload. Android: unchanged speed, new look. The Inbox opens with the field focused and the keyboard up; then the heading collapses into the one-line eyebrow (`WindowInsets.isImeVisible`), Inbox rows are one line (56 dp) unless the outbox has something to say, and the notice takes its own line above the field. On 412 × 915 dp with a 300 dp keyboard that leaves six rows fully visible (contract: five). Plus the tile (also over the lock screen: only the field, the notice, Rückgängig and Schließen; Enter saves), share card ("In Inbox"), launcher shortcut "Neues Todo" and the widget "+". All captures go to `POST /inbox` with no pickers, on both platforms.

**Outbox states on Android.** Inbox rows say "wartet auf Netz", "Nicht gesendet" (overdue colour) or "wartet auf Setup" on their second line, and nothing otherwise; Nächste rows whose check-off failed say "Abhaken nicht gesendet". A tap on a failed row opens the one-tap menu "Erneut senden · Bearbeiten und erneut senden · Löschen". Banners are a ruled band under the tabs: "Key abgelehnt – neu einrichten" with the coral edge rule of overdue rows (tap → setup), "Altes Konto: N nicht gesendet" with its explanation and a "Verwerfen" pill; at large text they wrap, never truncate. All of it is shown in the still phones below the Android board.

**Clarify.** Web: the Inbox page asks "Was ist *das*?". The margin shows the focused item with six answers, each one key: `a` Nächste Aktion (then `1`–`5` for the context, `0` for anywhere), `w` Warten auf, `v` Irgendwann, `p` Zu einem Projekt (then a digit, or `n` for **Neues Projekt**: type a name, Enter creates the project with `POST /projects` and files the item as its first next action), `x` Gleich erledigt, `Entf` Löschen. Two keystrokes file an item; the row shows its stamp, folds away and the next item is focused. Undo with `z`. At 761–1180 px the clarify panel docks beside the list whenever the Inbox has items, so the keys never act unseen. Android: tap an Inbox row → menu Bearbeiten · Klären · Löschen; Klären opens the same answers as a sheet, including Zu einem Projekt (existing projects), with Rückgängig on the notice (needs Uli's decision, see open questions). When the last item goes, the ink moment.

**What a list move sends.** Never the full tag set. Clarify to Nächste: `PUT /tasks/{uuid}` with `tags_add: ['next', '@ctx']`. To a project: `project` plus `tags_add: ['next']`. A context chip in the details: `tags_add` or `tags_remove` of that one `@ctx`, never touching `next` (a legacy `@a,@b` tag is replaced by its remaining parts). The Liste field: `tags_add: [list]` plus `tags_remove` for the other two status tags. Rückgängig after filing: the inverse. `rules.js` holds these and `rules.test.mjs` pins them.

**Do.** "Was jetzt *zählt*": first "Fällig" (never filtered, overdue first, coral edge rule and "überfällig"), then "Nächste Aktionen" (`+next`) filtered by context with the lenient rule (`0`–`5` on the web, chips on Android). Web: `j`/`k` move, `x` checks off, `Enter` opens details in the margin (list, context, project, due, priority, start/pause, notes, and under "Mehr" follow-up, defer, expiry, repeat, depends), `s` starts or pauses, `e` renames. Android: tap the ring or swipe right to check off; a tap on the row opens the web details in a Custom Tab (next section).

**Android → web handoff.** The Custom Tab shows the real web app at phone width: `…/next?task=<uuid>` (or `/waiting`) opens Nächste with the editable detail sheet over it, exactly what `index.html?task=` does in the prototype (the Android board embeds that page in its Custom Tab frame). Auth, because a Custom Tab has Chrome's storage, not the app's key:
1. The app calls `POST /auth/handoff` with its API key and gets a one-time code (random, stored hashed, bound to the user, valid 60 s, single use).
2. It opens `…/next?task=<uuid>#h=<code>`. The code travels in the fragment, so it never reaches server logs or a Referer.
3. The web, on boot, sees `#h=`: if it already holds a valid session it drops the code; otherwise it calls `POST /auth/handoff/exchange` and stores the returned JWT as today. Either way it strips the fragment with `history.replaceState` before rendering.
4. If the exchange fails (expired, used, offline), the login page shows "Anmelden, dann geht es zu deinem Todo weiter" and returns to `?task=<uuid>` after login.
This adds two small backend endpoints (security-relevant, needs Uli's approval; about one backend day). Without them, the honest fallback is step 4 alone: the first open asks for the login once, and Chrome keeps the session for later opens.

**Wait.** "Worauf du *wartest*" in three sections: "Heute nachhaken" (follow-up day ≤ today: the yellow ring plus "Nachhaken heute" or "Nachhaken seit 30.10."), "Diese Woche" and "Später oder ohne Datum" ("Wiedervorlage Di 03.11.", "wartet seit 28.10."). Android uses the same words on one list, follow-ups due first; "Nachhaken" appears only on due rows (P10). The margin's Nachhaken block hides on this view, where the list already is the follow-up list.

**Review.** Web "Rückblick" (`g r`): six numbered steps with live counts (Inbox leeren, Nächste durchsehen, Warten auf nachhaken, Projekte mit nächster Aktion, Irgendwann, Kalender). Steps that runway can check tick themselves (Inbox at zero, no stalled project). "Rückblick abschließen" records `POST /gtd/review`. Projects show stalled ones first with a yellow ring and "steckt fest"; complete Garten's last next action and it appears. Inside a stalled project the callout offers three ways out: "Nächste Aktion festlegen" (`n`, inline), "Ruhen lassen" (`on_hold`) and "Abschließen" (`done`), each with Rückgängig; other projects carry the same status pills under the outcome (`PUT /projects/{name}/status`). "+ Projekt" under "Aktiv" (`n` on the Projekte page) creates a project, validated against the API's name rules, and opens it, where it shows as "steckt fest" until it gets a next action. Android: the rail is read-only (Mehr → Projekte, Irgendwann); review, status and project creation stay on the web.

**Search.** Desktop: `/` and the field in the top line, across Inbox, Nächste, Warten auf, Irgendwann and "Ohne Liste". Phone web: "Suchen in allen Listen" at the top of the "···" sheet (`/` with a hardware keyboard opens it); results replace the page, "Suche beenden" or Esc returns. Android: none (open question).

## Coverage of the inventory

Kept on both: capture to Inbox, Inbox, Nächste with Fällig, Warten auf with follow-up marks, Abhaken (circle, key, swipe), 6 s undo, "Stand hh:mm" freshness, context filter, dark mode by system, German UI, the Android outbox states and banners.

Unified (decisions this proposal makes):

| Topic | Today | Proposal |
|---|---|---|
| Noun and verbs | task / Todo, Mark Done / Abhaken | **Todo**, **Abhaken**, Erledigt, Löschen, Bearbeiten, Rückgängig everywhere |
| Lists | web: server lists; Android: server lists, lenient chips | server rules exactly (`+next` for Nächste); anything in no list shows as "Ohne Liste" under Alle and in its project |
| List moves | web form sends the full tag set | `tags_add` / `tags_remove` only (rules.js, tested) |
| Inbox order | web urgency, Android newest first | newest first on both |
| Context rule | web strict on every list, Android lenient on Nächste | lenient (the skill's rule) on Nächste and the widget only; Fällig never filtered; one context list in settings, editable on the web |
| Due todos | Android shows a due next action twice | once, under Fällig |
| Complete and delete on web | immediate, desktop needs the modal | one key or tap, 6 s client-side hold, then sent |
| Web freshness and errors | none | "Stand hh:mm", refresh on focus and every 5 min, row status "Nicht gesendet" |
| Web dark mode | manual, default light | system, with an override in Einstellungen |
| Deep links | `?task=`, `/projects/:name` ignored | both honoured; the Custom Tab signs in with a one-time code; login returns to the requested route |
| Waiting follow-up on web | not shown | Android's words: "Nachhaken …" (due, with the yellow ring) and "Wiedervorlage …" from `scheduled`, editable in details |
| Project status, stalled, create | create on web only; status unused | overview with status, counts and "steckt fest" on both; create and status on the web |
| Tabs on phones | web: drawer; Android: three text tabs + "Mehr" | three one-line text tabs (weights 1 : 1 : 1.3) + "···" on the phone web and Android |
| Completed todos (web "Alle") | every completed task | "Erledigte zeigen": the last 7 days (`completed_since`), newest first |

Dropped, with reasons: the **urgency badge** (with +15 for next, almost every row was red; order carries urgency), the **modal task form** (capture is one line; fields live in the margin details), **emoji** in nav, plan tabs and dark toggle (brand voice), the **plan modal's five tabs** (now one scrolling plan document in the margin: Warum, Vision, Ideen, Ordnen, Aktionen; "→ Nächste" creates the step as a next action in the project instead of a tagless task that landed in no list), **moving a todo back to the Inbox** from the details (the API would have to drop every tag and the project; delete and re-capture is clearer), **completed todos older than 7 days** in "Alle" (the API still has them; a "mehr laden" link can follow if Uli misses them).

Not in the prototype (planned as described): login and the setup screen restyle (pinned strings unchanged), editable settings, the tickler list (planned as "Zurückgestellt" under Irgendwann), plan text editing, search on Android, pull-to-refresh on Android, swipe on the phone web, web offline outbox, the handoff endpoints themselves.

## Web build plan (Vue 3, Tailwind, Pinia)

- **Tokens.** `tokens.json` lives in a shared `design/` folder (see below). The build generates `src/styles/tokens.css`; `tailwind.config.js` maps theme keys to the variables: `colors: { bg: 'var(--rw-bg)', text: 'var(--rw-text)', mute: 'var(--rw-mute)', rule: 'var(--rw-rule)', action: 'var(--rw-action)', marker: 'var(--rw-marker)', overdue: 'var(--rw-overdue)', … }` (there is deliberately no `soft` text utility, only `placeholder-soft`), `fontFamily: { sans, serif, mono }`, `fontWeight` limited to 300/400/500, `borderRadius: { pill: '999px', lg: '18px', xl: '22px' }`, `transitionTimingFunction: { ar: 'cubic-bezier(.2,.8,.2,1)' }`, `darkMode: 'media'` plus a `[data-theme]` override. Default Tailwind grays and indigo are removed from the theme so they cannot creep back. Fonts self-hosted (the shared woff2), Space Grotesk 500 preloaded; no synthetic bold.
- **Components that change.** `AppShell.vue` → `RailNav` (wide), `PhoneTabs` (narrow), `Randspalte` (margin column / docked panel / overlay panel / sheet by breakpoint, with the "Heute" toggle at medium). `TaskList` + `TaskRow` → `ListPage`, `ListSection`, `TaskLine` (keyed, with `InkStrike`). `TaskModal` → `TaskDetail` in the margin; create via `CaptureLine`. `TaskActionSheet` → removed (the margin sheet covers it). `ProjectPlanModal` → `PlanDocument` (margin). `UrgencyBadge` removed. New: `ContextBar`, `ClarifyPanel` (with `NewProjectField`), `TodayPanel` (tally, follow-ups, stalled, review), `NoticeBar` (hold queue), `ReviewView`, `ProjectStatusPills`, `ShortcutsSheet`, `InkSurface`. Views keep their routes (`/inbox`, `/next`, `/waiting`, `/someday`, `/projects[/name]`, `/all`, `/settings`) plus `/review`.
- **List moves.** `src/shared/listMoves.js` (this proposal's `rules.js`): `isNext`, `isInbox`, `listOf`, `clarifyPayload`, `listPayload`, `contextPayload`, `inversePayload`, `projectNameError`. The store sends only what they return; there is no code path that PUTs a full `tags` array. `frontend/tests/listMoves.test.js` carries the cases of `rules.test.mjs` (clarify to Nächste with a context, context toggles keep `next`, list moves keep contexts, legacy comma tags, the inverse, project names).
- **Stores.** `tasks` gains a `holds` map (done/delete/capture held 6 s, then sent; display = server cache minus held items, like Android's S9), `stand`, refresh on `visibilitychange` and every 5 min, and per-row send status. Pure rules (context split, lenient filter, due boundary in Europe/Berlin from `summary.today`, list membership, list moves) go to `src/shared/` with tests, as `frontend/AGENTS.md` asks. `fe/tasks` and `fe/projects` keep not importing each other; project create and status live in `fe/projects`.
- **Keyboard.** One `useKeymap` composable: global keys, `g`-sequences, list keys, clarify keys (`p` then `n` for a new project), `n` as "neu, hier" (Todo; on Projekte a project; in a project its next action); ignored while typing; the shortcut sheet is generated from the same table. On touch screens (`(hover: none) and (pointer: coarse)`) keycaps and the keyboard cursor row are hidden.
- **Strings.** Every UI string comes from one table, `src/i18n/de.js`, through a small `t('inbox.empty')` helper (or vue-i18n with only `de`). The strings Android pins are shared with its `strings.xml` by a test that compares both tables. See deviation 11.
- **Handoff.** Router guard: read `#h=`, exchange or drop it, strip it, then resolve `?task=`; login keeps the return path.
- **Three.js, isolated.** `InkSurface.vue` is the only file that touches it: `const { inkBloom } = await import('@/effects/ink')`, a separate Vite chunk with `three` and `RoomEnvironment` only. The chunk is fetched in idle time when the Inbox has 1 or 2 items; the WebGL context exists only during the moment (`inkBloom` on the 1 → 0 transition, released at 3.4 s or on route leave); the typographic empty state is in the DOM first. A unit test pins that no other chunk imports `three`, and one that a revisit of an empty Inbox never mounts the canvas.

## Android build plan (Compose, Glance, Views)

- **Theme.** `RunwayTokens.kt` is generated from the same `tokens.json`. `RunwayTheme` builds `lightColorScheme`/`darkColorScheme` from it (primary = coral with ink on it, secondary = plum, surface = paper/bg, outlineVariant = rule, error = overdue) and **turns dynamic colour off**. Typography: `res/font/space_grotesk`, `fraunces_italic`, `jetbrains_mono` (400 only), mapped to custom roles (`display`, `title`, `tab`, `row`, `meta`, `eyebrow`). Shapes: `CircleShape`/50 % for buttons and chips (32 dp `FilterChip`s with 48 dp touch targets), 22 dp sheets.
- **Main screen.** A `Row` of three text tabs with `Modifier.weight(1f)`, `weight(1f)`, `weight(1.3f)` and `maxLines = 1` ("Warten auf" is the longest label and stays whole at font scale 1.5: 120 dp in a 139 dp cell, measured in the still phone), then a 48 dp `IconButton`-sized text button "···" with `contentDescription = "Mehr"`. The yellow dot for the selected tab sits under the label. Each tab: mono eyebrow with a separate "Stand hh:mm" node, the accent heading, then rows. While `WindowInsets.isImeVisible` on the Inbox, heading and lead collapse into the 24 dp eyebrow line. Mehr opens the "Inhalt" sheet with the lockup: Projekte and Irgendwann (read-only lists, `GET /gtd/projects/overview` and `/gtd/someday` through the existing cache), Rückblick and Alle (Custom Tab), then the pinned items Angemeldet als, Widget hinzufügen, Protokoll exportieren, Abmelden.
- **Rows.** Inbox rows: ring in a 48 dp target, description up to two lines, a second line only for the outbox status (`wartet auf Netz`, `Nicht gesendet`, `wartet auf Setup`), 56 dp for one line. Nächste: due, project, context; "Abhaken nicht gesendet" first when a check-off failed. Accessibility text unchanged: `<Beschreibung>, <Status>, ID <8>` or `lokal <8>`.
- **Banners.** One `BannerBand` composable under the tabs (ruled band, error variant with a 3 dp coral edge rule), texts unchanged from today's pinned strings; it wraps at large text instead of truncating.
- **Effects.** Strike and tally: `Canvas` + `PathMeasure` (no shader). Inbox zero: AGSL `RuntimeShader` from `ink.agsl`, compiled lazily on the first transition to zero (never on a cold-start path, never on a revisit), drawn behind the empty state for 3.4 s. Filament or SceneView: **not needed**; this direction has no real 3D on the phone.
- **Widget (Glance).** Same header "Inbox N · fällig M", chip cycle, "+", rows with ring and "überfällig"/"heute", footer "+K weitere" / "Stand hh:mm" / "N nicht gesendet". Every target 48 dp (header, chip box with a 32 dp pill, "+", ring per row, footer). 22 dp corners (`radius-xl`). `GlanceTheme` with `ColorProviders` from the tokens (no dynamic colour), text only, no bitmaps, luminance well inside the contract (paper 0.92, ink 0.009).
- **Tile, overlay, share.** Stay plain Views for the time budgets; their XML theme and `colors.xml` are generated from the same tokens; fonts from `res/font` (Typeface loaded once in `RunwayApp`). The overlay shows only the field, the notice, Rückgängig and a 48 dp "Schließen", also on the keyguard; the IME action saves (no "+" button).
- **Handoff.** `TaskDetails.kt` fetches the one-time code before `CustomTabsIntent.launchUrl` (≤ 300 ms, or opens without it and the web asks for the login once).
- **Launcher icon.** Adaptive icon: the brand mark on paper (replaces the blue `#1F4E79`), the same in light and dark. Themed icon: the mono mark, tinted by the system.

## One token source

```
runway/design/tokens.json            ← the only place values are edited
  └─ node design/gen-tokens.mjs
       ├─ frontend/src/styles/tokens.css        (--rw-* light, dark, [data-theme])
       ├─ design/out/RunwayTokens.kt            ┐ copied into runway-android by
       └─ design/out/values{,-night}/colors.xml ┘ design/sync-android.sh
```

The generator in `tokens/` already produces the CSS and the Kotlin file; brand values are referenced, never copied (`var(--ar-coral)` in CSS, resolved ARGB in Kotlin). How the values reach the second repo: **a checked-in copy plus a hash check, no submodule.** `sync-android.sh` copies the generated Kotlin and XML into `runway-android/app/…/ui/theme/` together with `design-tokens.sha256` (the SHA-256 of `tokens.json`). In runway, CI regenerates and fails on a diff. In runway-android, a CI step fetches `design/tokens.json` from runway's main branch (GitHub API, read-only token) and fails when its hash differs from the committed one, so a token change in runway is never silently missing on the phone. A submodule was rejected because runway-android is a sideloaded single-device app whose frozen acceptance flow should not depend on a second checkout.

## Accessibility

- Contrast on paper: text 16.5:1, mute 4.88:1 (on the focus row 4.5:1), overdue (#A45150) 5.0:1, plum accent 11.5:1, ink on coral pills 7.0:1. On ink: text 16.5:1, mute 8.6:1, overdue coral 7.0:1, plum-light accent 6.7:1. **Soft (40 %, 2.5:1) is used for placeholders only, never for information or a control.** The check ring uses mute (4.88:1, above the 3:1 for non-text); the overdue ring uses the overdue colour (5.0:1), the coral 2 px edge rule beside it is an extra cue.
- State never by colour alone: "überfällig", "steckt fest", "läuft", "Nicht gesendet", "Nachhaken" are words; selected chips are filled and `aria-pressed`; the keyboard row has a tint, a 2 px plum rule and the yellow dot.
- Rows keep Android's pinned accessible text `<Beschreibung>, <Status>, ID <8>` on both platforms (web status words match, including "Nachhaken fällig"); the ring is a button "Abhaken: <Beschreibung>"; notices are `aria-live="polite"`; the ink canvas is `aria-hidden`.
- Everything works with the keyboard; shortcuts never fire while typing; visible focus outline in plum (plum-light on dark). Touch screens get no keycaps and no keyboard cursor.
- Touch targets ≥ 48 dp on Android and in the widget; chips and banners wrap at 150 % font scale, tabs stay one line (shown in the still phones); the web will use rem for type so browser zoom and font settings scale it.
- `prefers-reduced-motion` and Android's animator scale 0: no strike animation, no collapse, no ink moment (plain text), no pulse, no draining line.

## Performance budget

| | Budget | How it is kept |
|---|---|---|
| Web first load | app JS ≤ 120 KB gz, Three.js 0 KB | ink chunk (~170 KB gz) fetched in idle time only when the Inbox is at 1 or 2 items, then cached |
| Idle | 0 `requestAnimationFrame` calls, 0 WebGL contexts | verified in the prototype: no canvas and no rAF on any screen, including an empty Inbox. One exception by design: a running todo's coral pulse is an infinite CSS animation (compositor-only transform and opacity, no JS frames); it stops with reduced motion |
| Check off | strike starts in the same frame; row gone ≤ 820 ms | CSS transitions, keyed DOM patch that never re-creates running rows |
| Ink moment | ≤ 3.4 s of frames (≈ 200 at 60 Hz), then canvas removed and context released; GPU ≤ 6 ms/frame at 1.5× | measured: about 200 frames, then 0 canvases; pixel ratio capped at 1.5; shader compiled asynchronously; stops when the tab is hidden |
| Android cold paths | unchanged budgets (tile 700/1200 ms, icon 800/1500 ms, "In Inbox ✓" ≤ 300 ms) | tile, overlay, share stay Views; no shader on these paths; fonts loaded once |
| Android ink | ≤ 8 ms/frame on Pixel 9 | half-resolution layer if over budget; only on the transition to zero |

## Effort estimate (person-days)

| Web | Days |
|---|---|
| Tokens, generator, Tailwind mapping, fonts | 1.5 |
| Shell: rail, phone tabs, margin column / docked panel / sheet, "Heute" | 2.5 |
| List page, TaskLine, sections, keyed transitions, strike | 2 |
| Keymap, focus model, shortcuts sheet, touch rules | 1.5 |
| Capture line, hold queue with undo, drafts | 1.5 |
| List moves in `src/shared/` with tests, inverse for Rückgängig | 1 |
| Task details in the margin (all fields, notes, start/pause, delete) | 2 |
| Clarify panel with project picker and "Neues Projekt" | 2 |
| Projects overview, project page, create, status pills, stalled, plan document | 3 |
| Review view | 1 |
| Search (desktop field, phone sheet) | 0.5 |
| Settings and login restyle (keep pinned snippets) | 1.5 |
| Strings table and the shared-strings test | 0.5 |
| InkSurface (lazy chunk, lifecycle, fallbacks, tests) | 1.5 |
| Routes (`?task=`, `/projects/:name`, return path), handoff exchange, freshness, error rows | 2 |
| QA, accessibility and performance pass | 1.5 |
| Contingency | 1.5 |
| **Total** | **≈ 27** |
| Backend: `POST /auth/handoff` and `/auth/handoff/exchange` with tests (if approved) | 1 |

| Android | Days |
|---|---|
| Generated theme, fonts, dynamic colour off | 1.5 |
| Main screen restyle (weighted tabs and "···", eyebrows, headings, rows, chips, notice, field) | 3 |
| Inbox with the keyboard up: heading collapse, 56 dp rows, notice line; the ≥ 5 rows test | 1 |
| Outbox row states, failed-row menu, banners | 1.5 |
| Swipe strike and ring, removal ≤ 1 s | 1.5 |
| AGSL inbox zero with fallbacks and profiling | 2 |
| Mehr sheet, read-only Projekte and Irgendwann (API, cache) | 3 |
| Klären sheet with Zu einem Projekt and Rückgängig (only if approved) | 2.5 |
| Setup screen restyle (pinned strings unchanged) | 1.5 |
| Glance widget restyle, 48 dp targets (+1 if fonts need RemoteViews XML) | 2 |
| Tile, overlay, share restyle; budget re-measurement | 1.5 |
| Custom Tab handoff with the one-time code | 0.5 |
| Launcher and themed icon | 0.5 |
| Token copy and hash check in CI | 0.5 |
| Acceptance round with the critic, string pins | 2 |
| Contingency | 1.5 |
| **Total** | **≈ 26 (23.5 without Klären)** |

Risky parts: Android acceptance pins (coral must pass the "measurably red" hue test for overdue; a third item "Klären" in the one-tap Inbox menu; "Mehr" as "···" with only a content description; unequal tab weights), Glance and brand fonts, AGSL fill cost at full Pixel resolution, cold-start time with three font files in the View overlay, moving the web to client-side holds without double sends (needs the same de-duplication check Android uses), and the handoff endpoints (security review).

## Brand deviations (need Uli's approval)

1. **Ink text on coral pills.** The kit's `.ar-btn-coral` uses white text (2.5:1, fails WCAG AA). Ink on coral is 7.0:1.
2. **Coral as the overdue and error signal.** The kit reserves coral for the primary action. Android's contract requires a measurably red overdue mark and the brand has no red; the 2 px edge rule and the error banner's rule are coral, text and the overdue ring use coral 60 % mixed with ink for contrast.
3. **Coral as "done" ink.** The strike-through and every fifth tally stroke are coral. Completing is the app's primary action; the stroke is its trace.
4. **Plum-light on dark.** Plum on ink is unreadable, so accents, the focus row and the selection on dark use plum mixed 45 % into off-white. Rule 1 allows mixing for neutrals; this is a derived accent.
5. **Soft colour transitions in the ink moment.** The watercolour bloom is a gradient in effect, which the kit forbids. It exists only for the 3.4 s of the transition to an empty Inbox, comes from a physical simulation, not a UI fill, and leaves nothing behind. No glass anywhere.
6. **Fraunces beyond the accent word.** Project outcomes and the plan's vision are set in Fraunces italic, plum, like the kit's quote style.
7. **Mixed-case eyebrows.** The kit's eyebrow is uppercase. Android pins exact strings ("Fällig", "Stand hh:mm"); an uppercase transform would change them in Compose, so both platforms use mixed case.
8. **Pill keycaps** as a recurring element (hints, not buttons; hidden on touch screens).
9. **System glyphs on Android.** No icon library in the app, but Android requires a Quick Settings tile icon, a notification icon and a themed launcher icon. The themed icon means the system recolours the brand mark.
10. **Widget typography** may have to fall back to the system sans and monospace if Glance cannot use the brand fonts (to be verified).
11. **No `data-i18n`, German only.** The brand kit asks for `data-i18n` on every visible string with `de` and `en`. runway is a German product UI for one person: Android's acceptance tests reject English words, and Uli asked for German. Instead of `data-i18n` attributes, every string lives in one message table per platform (`src/i18n/de.js`, `res/values/strings.xml`), so English can be added later without touching components; v1 ships `de` only.
12. **System keyboard and share-sheet mock-ups** on the Android board use neutral tokens, not brand colours, because they are Android's surfaces, not ours.

Resolved in review (no longer deviations): Mono weight 600 (now 400 everywhere), coral review and plan numbers (now mute/ink), the yellow `::selection` fill (now plum), the 28 px and bare 22 px mark (now the 32 px lockup), the 24 px widget radius (now `radius-xl` 22), the plum mark on ink in the dark share sheet (the launcher icon stays on paper).

## Open questions

1. **Klären on Android?** `PLAN.md` lists clarifying as a non-goal (Uli, 24.10.2026). The design includes an optional sheet; without it, the Inbox menu stays Bearbeiten · Löschen.
2. **Handoff endpoints** (`/auth/handoff`, one-time code, 60 s): build them, or accept one login in the Custom Tab?
3. Lenient context rule on both platforms, applied to Nächste and the widget only?
4. Inbox newest first on the web too?
5. "Todo" as the one noun?
6. Drop the urgency badge entirely?
7. Web offline (PWA with an IndexedDB outbox) now or later?
8. Search on Android, or keep the phone free of it?
9. Count completions by Claude or the MCP server in today's tally (server `completed_since=today`)? Proposed: yes.
10. Strike in coral (proposal) or in ink?
11. Tab weights 1 : 1 : 1.3 on Android (needed for "Warten auf" at 150 %), or shorter tab labels?

## Changes after review

What changed, following the critique point by point.

**List semantics (must fix 1).** `rules.js` now follows the server: Nächste needs `+next`, the Inbox is "no tags and no project", anything else is "Ohne Liste". Clarify, context toggles and the Liste field send only `tags_add` / `tags_remove` (context toggles never touch `next`; legacy comma tags are repaired), filing is undone with the exact inverse, and every write lands in `proto.calls`. `rules.test.mjs` pins the three moves plus the inverse and project names (9 tests, passing). The shared demo data marks next actions by a context alone, so the store adds the `+next` the server would hold before applying the strict rules, maps the demo's "someday" project to `on_hold`, and gives one waiting todo a past follow-up day so the due state is visible. The web plan now says list moves never send the full tag set.

**Android Inbox with the keyboard (2).** Inbox rows dropped "erfasst …" and show only the pinned outbox status. With the keyboard up the heading collapses into the eyebrow and the notice takes its own line; a still phone shows 412 × 915 dp with a 300 dp keyboard: eyebrow, six 56 dp rows, notice, field. The interactive phone does the same when the Inbox field has focus. Two more still phones show the failed-row menu (Erneut senden, Bearbeiten und erneut senden, Löschen), all three row states, "Abhaken nicht gesendet", and both banners.

**Android contract (3).** Tabs are three one-line text tabs plus a 48 dp "···" (content description "Mehr"), the selected dot moved under the label; the third still phone renders them at 150 % text. Note: with equal weights "Warten auf" was cut at 150 %, so the weights are 1 : 1 : 1.3 (open question 11). Widget rows, ring, chip box, "+" and footer are 48 dp; the overlay's "Schließen" is 48 dp; the overlay has no "+" any more. Follow-ups that are not due read "Wiedervorlage Di 03.11."; due ones read "Nachhaken heute / seit …" with the yellow ring, on web and Android.

**Contrast (4).** Every informational use of soft moved to mute: the check ring, field labels, choice hints, project counts, chip counts, empty lines, "erfasst"/"ID" meta, done-list times, plan numbers, close buttons, Android sheet hints and counts, widget rings. The focus row is plum 12 % (plum-light 16 % on dark) plus a 2 px plum rule. The overdue ring uses the overdue colour (coral alone was 2.4:1). The accessibility section now states the real numbers.

**Ink only on the transition (5).** The empty Inbox is plain typography on every visit. `inkBloom` runs only when the Inbox goes from ≥ 1 to 0 in the session; preloading fetches modules without creating a context; the context is created at the moment, compiled with `compileAsync`, and released when the ink has sunk in completely (`sinkIn` reaches 0 at 3.3 s, web and AGSL). Reduced motion never creates a canvas. The `web-reduced-inbox-zero.png` shot is gone because that state no longer has a canvas; `web-reduced.png` now shows it.

**Handoff (6).** The Custom Tab frame embeds the real web prototype (`index.html?task=…&input=touch`), i.e. Nächste with the editable sheet. The README specifies the one-time-code auth and the fallback; the effort tables carry it.

**Weekly review and projects (7).** Stalled callout with "Nächste Aktion festlegen", "Ruhen lassen", "Abschließen"; status pills on every project; "+ Projekt" on the Projekte page; "Neues Projekt" (`p` `n`) in clarify with the API's name rules; a "Ruht" and "Abgeschlossen" section. In both effort tables.

**Responsive (8).** 761–1180 px: the clarify panel docks beside the Inbox list, and a "Heute" button opens the margin elsewhere. Touch screens hide keycaps (the inline `display:flex` is gone) and the keyboard cursor. Phone web search sits at the top of the "···" sheet, with "Suche beenden" on the results.

**Brand violations.** Mono 600 → 400; coral numbers → mute/ink; selection → plum; 32 px lockup in the rail and in both "more" sheets, no bare mark in phone bars; widget radius 22; launcher icon and share target on paper in dark mode; the i18n rule declared as deviation 11.

**Nice to have, taken:** pen-edge filter only where ink is visible; Waiting split into "Heute nachhaken", "Diese Woche", "Später" and the margin block hidden there; phone density (display 30 px, 32 px chips, tighter sections: the first next action starts about 20 px higher on the phone web, at 333 css px, and about 20 dp higher on Android; the bigger gain would need the heading to go, see below); the drop-origin claim removed; one-undo shown in the shortcut sheet; Android clarify with "Zu einem Projekt" and Rückgängig; "Alle" shows the last 7 days of completions; token pipeline specified; effort raised to ≈ 27 web and ≈ 26 Android with contingency; the pulse named in the idle budget; Android board in dark keeps its device frame.

**Deliberately left:**
- **Raw-WebGL ink sharing one source with `ink.agsl`.** It would cut the chunk from about 170 KB to a few KB, but our Three.js rules ask for physical shading (`MeshPhysicalMaterial`, light rig, `RoomEnvironment`), and the chunk is fetched only when the Inbox is nearly empty and costs nothing on first load. The visual gap is narrowed instead: both versions share the field, the timeline, the dark lift and the clean end; only the lighting model differs (PBR clearcoat versus Lambert plus Blinn-Phong).
- **⌘K command palette and multi-select.** Real Linear parity, but a new interaction model; it belongs in a second iteration once the single-key model is in use.
- **Collapsing the display heading on scroll on Nächste.** The heading is the proposal's voice; it scrolls away naturally, and the density gain came from tightening the spacing instead. On the Android Inbox it does collapse, where the contract needs the rows.
- **Moving a todo back to the Inbox** from the details: dropped (see Coverage).
- **Project creation and status on Android:** stays on the web, in line with `PLAN.md`'s non-goals for project work on the phone.

**Remaining weaknesses.** The only Three.js effect is still a rare, short moment, so this direction scores low on "fancy 3D" by design; pair its typography with a richer effect from another proposal if Uli wants more. The handoff needs two new backend endpoints. The tab weights and the "···" with only a content description need the critic's consent. The demo data was adjusted in the store (next tags, one follow-up date, the on-hold project), so counts differ slightly from the other proposals.

**Verification pass (second builder, 31.10.2026).** Every must-fix item, the six brand findings and the cheap nice-to-haves were checked against the code, not only this text: `rules.test.mjs` passes (9 of 9); no `--rw-soft` carries information (only placeholders, the `·` separator and filed or deleted rows on their way out); no Mono 600; selection is plum; `inkBloom` runs only on the step from ≥ 1 to 0; touch screens hide keycaps; the Android tabs are 1 : 1 : 1.3 plus a 48 dp "···" (a stale code comment that said "equal" was corrected). All seven screenshots were taken again and inspected, plus `android-zustaende.png` (the still phones, listed in the file table but missing until now). Console errors: none. WebGL canvases: 0 on every shot except `web-signature.png` (1, during the moment). The obsolete `web-reduced-inbox-zero.png` was deleted.
