# m4 · Gesten

**Idea in one sentence:** the frequent actions sit on the whole row instead of on a small target (swipe right ticks off, swipe left opens the row actions, a long press selects several; pull down refreshes as today), every gesture has a visible button and an accessibility action, and everything you tap sits in the bottom third under the thumb.

Mobile proposal m4 of five for the Android app, sibling of the chosen web design `06-kombination` (base `03-papier-und-tinte`). No 3D, no Three.js, no shaders.

| File | What |
|---|---|
| `index.html` + `app.js`, `style.css` | The board at 1440 px: one interactive phone and the still frames (same renderer), the widget, the Quick Settings tile with its overlay, the share target, the pinned rare states (setup, tile hint, banners, widget badge and fallback), and the optional quick clarify screen in a separate, dashed section |
| `phone.js` | The phone screen: rows, gestures (swipe, long press, pull to refresh), thumb stack, banners, notices, menu sheet, Custom Tab stub |
| `store.js` | Demo data derived from `shared/data/tasks.js`, the list rules (Android's lenient context rule, Fällig unfiltered), the 6 s hold with undo, and the requests a real client would send (`proto.calls`) |
| `tokens/tokens.json` → `tokens/gen-tokens.mjs` → `tokens/tokens.css`, `tokens/GestenTokens.kt` | One token source for the prototype and Compose (`node mobile/m4-gesten/tokens/gen-tokens.mjs`) |
| `shots/` | `board.png` (1440, full page), `board-dark.png` (dark, full page), `phone.png` (the page at 412 px phone width) |

**View:** from `2026-10-31-unified-ui/` run `python3 -m http.server 8340 --bind 127.0.0.1` and open `http://127.0.0.1:8340/mobile/m4-gesten/`. At phone width the interactive phone comes first and fills the screen, without the bezel.

**Try on the interactive phone (frame 01):** type into "Neues Todo" and press Enter; drag a row to the right past about a third of its width; drag a row to the left; hold a row for half a second, then tap more rows; drag the list down from the top (refresh); tap a chip, then capture something on Nächste (you stay there, the Inbox tab count rises and gets a yellow dot); tap a ring (the notice teaches the swipe, at most three times); tap ⋮ for Auswählen, Gesten zeigen and Daumen links. With a keyboard, Alt+→ ticks off and Alt+← opens the actions on a focused row.

**Test hook:** `window.proto` as in `shared/README.md`, acting on the interactive phone. `show('projects'|'someday')` opens the web in the Custom Tab stub, because those lists stay on the web (scope decision). `filter('@anrufe')` maps to Android's preset (see "Mock data"). `clarify()` works but is labelled Option, because the base app does not clarify. `signature()` freezes the swipe right at the moment it arms (coral track, "Abhaken"). `proto.calls` lists the requests sent so far.

---

## Why it is efficient

The most frequent action, ticking off, no longer needs aiming: the whole 56 dp row is the target, and a swipe from anywhere on it works one-handed. Everything else that needs a tap (tabs, chips, field, notice, selection bar, menu sheet) is stacked in the bottom 40 % of the screen, so a right thumb reaches it without changing grip, and the visible equivalents stay one tap away for anyone who never swipes.

Estimates use keystroke-level operators, applied the same way on every row: **M** 1.2 s mental preparation once per task; **tap** 0.5 s on a 48 dp target in the thumb zone; **swipe** 0.6 s; **hold** 0.9 s (long press incl. the 450 ms threshold); **find** 0.8 s to locate runway in the share sheet; **scan** 0.5 s to read the top of a list; plus the system latencies pinned in the done-bar (tile or widget to keyboard 0.7 s warm / 1.2 s cold, icon to first frame 0.8 / 1.5 s, share sheet 0.6 s). Typing the text and Enter are excluded. "Today" is the current Android app (inventory section 3), measured the same way.

| Task | Fastest path in m4 | Taps / gestures | Seconds (est.) | Today |
|---|---|---:|---:|---|
| **T1** capture a thought, from anywhere | Home screen: widget **+**, type | 1 | M + tap + 0.7/1.2 = **2.4 warm, 2.9 cold** | same |
| | Lock or home screen: pull the shade, tap **+ Todo**, type | 1 swipe + 1 | M + swipe + tap + 0.7/1.2 = **3.0 / 3.5** | same |
| | Share sheet (from another app): **Teilen**, find **runway**, **In Inbox** | 3 | M + tap + 0.6 + find + tap = **2.8 to 3.5** (depends on where runway sits in the sheet) | same |
| | App icon: the Inbox opens with the field focused and the keyboard up, type | 1 | M + tap + 0.8/1.5 = **2.5 / 3.2** | same |
| | Inside the app on Nächste or Warten auf: tap the field at the bottom, type, Enter; **you stay on the tab, the chip stays**, notice "In Inbox ✓ · Rückgängig", Inbox count +1 with a yellow dot | 1 | M + tap = **1.7** | switch to the Inbox tab first (field lives there), tap at the top: 2.0, and you lose your place |
| **T2** tick off | Swipe the row right, anywhere on it | 1 | M + swipe = **1.8** | M + tap on the left-edge ring + aiming: 2.0 |
| | or tap the ring (right edge, in the thumb arc) | 1 | M + tap = **1.7** | |
| | undo: **Rückgängig** in the notice (bottom stack, 6 s) | 1 | M + tap = **1.7** | same |
| | five at once: long press, 4 taps, **Abhaken** | 6 | M + hold + 4 tap + tap = **4.6** | five separate check-offs: 8.5 |
| **T3** what to do now in a context | **Nächste** shortcut placed as its own home-screen icon (new); opens on Nächste without keyboard, chip remembered | 1 | M + tap + 0.8/1.5 + scan = **3.0 / 3.7** | icon, Inbox with keyboard, tab at the top, chip again: 4.3 / 5.0 |
| | App icon (opens on the Inbox with the keyboard, as pinned), **Nächste** tab | 2 | M + tap + 0.8/1.5 + tap + scan = **3.5 / 4.2** | |
| | Widget: glance, chip cycles in place | 0 to 4 | M + scan = **1.7** (+0.5 per chip step) | same |
| **T4** see what I wait for | Inside the app: **Warten auf** tab, Nachhaken on top | 1 | M + tap + scan = **2.2** | tab at the top: 2.5 |
| | From home: **Warten auf** shortcut as its own icon (new) | 1 | M + tap + 0.8/1.5 + scan = **3.0 / 3.7** | icon + top tab: 3.8 / 4.5 |
| **T5** handle the Inbox (capture-and-glance scope) | per todo: swipe right = done (2-minute rule) | 1 | M + swipe = **1.8** | menu via tap: 2.2+ |
| | per todo: swipe left + **Löschen** | 2 | M + swipe + tap = **2.3** | tap + Löschen: 2.2 |
| | junk batch of five: long press, 4 taps, **Löschen**, one undo for all | 6 | **4.6** | 10 taps, 5 notices: 11 |
| | Option (needs Uli's decision): long swipe left, **Nächste**, context chip | 3 | M + swipe + 2 tap = **2.8** | not possible on the phone |

The honest gain is not in T1 (the outside-the-app paths are the same as today) but in T2, T5 batches and in T1 inside the app, where you no longer lose your place.

Supporting rules that save seconds without a gesture:

- **Fällig once.** A due next action shows only in "Fällig", not again under "Nächste Aktionen" (today it appears twice). One row less to read per due item.
- **Header collapses with the keyboard.** While typing, the header is one 28 dp mono line (`// Inbox · 5 · Stand 09:41`), so seven 56 dp rows fit above tabs, field and keyboard (contract: at least five).
- **The chip is remembered** across process restarts (today only while the process lives).
- **One notice for a batch.** "Erledigt · 3 Todos · Rückgängig" undoes all three.
- **Taught in context, never required.** The app opens on the Inbox with the keyboard up, so a card on Nächste could show days late. Instead, after a tap on the ring the notice gets one more line, "// Tipp: nach rechts wischen geht auch", at most three times and never after the first real swipe. The card (frame 10) is available via Mehr · Gesten zeigen. Nothing in the app can only be reached by a gesture.
- **The display line yields to rows.** The Fraunces line ("Was jetzt *zählt*") shows only when the list has four rows or fewer; on a full list it would cost about one row.

## Screens and navigation

The screen has three zones, top to bottom:

1. **Header** (read only): mono eyebrow `// Nächste · 4 · @computer` left, `Stand hh:mm` right (and `offline` with a yellow ring when the last refresh failed), then, only on short lists (≤ 4 rows) and never while typing, one display line with one Fraunces word ("Was ist *neu*", "Was jetzt *zählt*", "Worauf du *wartest*").
2. **List** (read, swipe, long press, pull to refresh): rows of at least 56 dp, description up to two lines, mono meta line, check ring at the right edge.
3. **Thumb stack** (tap): banners (rare), notice bar, context chips (Nächste only, hidden while typing, contract order `@home @computer @work @business Alle`), the three text tabs **Inbox · Nächste · Warten auf** plus **⋮ Mehr** (the Inbox count is a separate badge node; a yellow dot marks captures made from another tab), and the pill field **Neues Todo** with the coral **+**, directly above the keyboard. At font scale ≥ 1.3 the tabs hide while the keyboard is up (Back or closing the keyboard brings them back), so five rows stay visible.

| Frame | Shows |
|---|---|
| 01 | Inbox with the keyboard up, interactive |
| 02 | Nächste filtered to @computer: Fällig stays unfiltered at the top |
| 03 | Warten auf: "Nachhaken seit 30.10." first with a yellow ring and a plum edge rule, then "Wiedervorlage 07.11.", then the rest |
| 04 | Tick off: the row mid-swipe past the threshold (coral track, "Abhaken"), the previous todo in the notice "Erledigt · … · Rückgängig" with the 1 px yellow line |
| 05 | Swipe left: the tray (Bearbeiten, Löschen) opens between the text and the ring; the description ellipsizes to one line, the status line and the ring stay visible |
| 06 | Long press: three selected. Selection has its own marker (row tint, plum edge, leading plum square); the ring rests, dimmed and inert; a tap on the row toggles; the bar replaces tabs and field |
| 07 | Inbox at 150 % font with the keyboard up and the notice "In Inbox ✓ · Rückgängig": tabs hidden while typing, five two-line rows fully visible |
| 08 | Offline: `offline · Stand 09:12`, rows "wartet auf Netz", a failed row "Nicht gesendet" with the pinned menu as a bottom sheet (Erneut senden, Bearbeiten und erneut senden, Löschen) |
| 09 | The other colour scheme (dark on the light board, light on the dark board) |
| 10 | The gesture card (Mehr · Gesten zeigen); the in-context tip is the default teacher |
| 11 | 150 % font on Nächste: chips wrap to two lines instead of scrolling, tabs stay on one line |
| 12 | Widget "runway Übersicht" plus the launcher shortcuts with the new "Nächste" and "Warten auf" |
| 13 | Quick Settings tile "+ Todo" with the overlay: notice, field, Schließen (pill outline), keyboard |
| 14 | Share card with the full-width "In Inbox" pill at the bottom |
| 15 | Setup: Benutzername, Passwort, error containing "falsch", Anmelden, Erweitert (open) with Server-URL, Key einfügen, API-Key, Einfügen, Verbinden |
| 16 | After setup: "Verbunden als uli" and the tile hint "Zieh die Kachel + Todo in die erste Reihe …" with OK |
| 17 | Banners in the thumb stack: "… neu einrichten" with Einrichten, "Altes Konto: 2 nicht gesendet" with Verwerfen; rows with status "wartet auf Setup" |
| 18 | Widget states: badge "2 nicht gesendet" (one: "Nicht gesendet"), and the fallback "Widget neu laden" |
| 19 | Option, needs Uli's decision: quick clarify under an Inbox row |

**Gestures and their equivalents**

| Gesture | Effect | Visible equivalent | Accessibility action | Feedback |
|---|---|---|---|---|
| Swipe right on a row, past max(35 % of width, 96 dp) | Abhaken, held 6 s | tap the ring | "Abhaken" (custom action), ring content description `Abhaken: <desc>` | track tints coral at the threshold, one haptic tick, ring fills for 120 ms, row leaves (< 1 s) |
| Swipe left on a row, past 56 dp | opens the row's action tray between text and ring (at most ~45 % of the row); on a failed row ("Nicht gesendet") it opens the pinned menu sheet instead (Erneut senden, Bearbeiten und erneut senden, Löschen) | tap the row (pinned menu, now a bottom sheet, on Inbox; Custom Tab on Nächste and Warten auf) | "Aktionen" | tray is revealed, 180 ms |
| Long press (450 ms) | selection mode, row selected | Mehr · Auswählen | "Auswählen"; selected rows carry the state description "ausgewählt" (never "Abhaken"), the ring is removed from the tree while selecting | one haptic tick, selection bar replaces tabs and field |
| Pull down at the list top, past 64 dp | refresh, as today (no second stage) | refresh on open; `Stand hh:mm` | "Aktualisieren" | band label, no spinner |
| Back | closes tray, selection, Custom Tab, keyboard (draft kept), in that order; then Nächste or Warten auf → Inbox | | | predictive back preview |

Row taps keep today's meaning: Inbox row → menu Bearbeiten, Löschen with one tap (failed: Erneut senden, Bearbeiten und erneut senden, Löschen), shown as a bottom sheet in the thumb zone instead of a popup at the row; Nächste and Warten auf rows → Custom Tab with `/next?task=<uuid>` or `/waiting?task=<uuid>`.

**Mehr** holds: Angemeldet als …, Auswählen, Gesten zeigen, Daumen links (mirrors the row: ring left, swipe direction unchanged), Widget hinzufügen, Protokoll exportieren, Abmelden.

**Rare pinned states, kept verbatim and restyled** (frames 15 to 18): the setup screen (fields as pill inputs with mono labels, Anmelden as the coral pill, Erweitert as a quiet pill that opens Server-URL and the key path, Verbinden as an outline pill; errors in overdue text with a coral dot); the tile hint after setup (a bottom sheet with "Verbunden als <user>", the pinned sentence, a small drawn tile row and OK); the banners "neu einrichten" and "Altes Konto: N nicht gesendet" + "Verwerfen" (surface cards with a hairline in the thumb stack, above the notice); the row status "wartet auf Setup" (yellow ring, like "wartet auf Netz"); the widget badge "Nicht gesendet" / "N nicht gesendet" (mono line under the header, coral dot) and the fallback "Widget neu laden" (outline pill).

## How the Agentic Reach theme shows without 3D

- **Warm paper and ink.** Ground `--ar-bg` (#FBF6EE), text ink (#1B1428); dark mode is an ink ground with paper text, never pure black or white. Rows are hairline-separated, never cards.
- **Coral means "do it".** The capture **+**, the primary pills (Abhaken, In Inbox), the swipe-right track at its threshold, and the `//` mark. Overdue uses coral as the edge rule and a coral-in-ink text (#A45150, 5.0:1), because the contract requires overdue to be measurably red.
- **Plum carries emphasis**: the one Fraunces italic word per header, the selection square and edge, the Nachhaken edge rule, the keyboard's Enter key.
- **Yellow only as dot, ring or line**: the dot under the selected tab, the dot on the Inbox count after a capture from another tab, the ring before "Nachhaken", "wartet auf Netz", "wartet auf Setup" and "offline", the 1 px line under the notice.
- **Type**: Space Grotesk 400/500 for everything you read, JetBrains Mono for eyebrows, meta, chips and counts, Fraunces italic 300 for one word per header.
- **Pills**: every button, chip, field and tray action is a pill; sheets and the widget use radius 22.
- **Mono symbols as the only icons**: `//`, `→ ← •` in the gesture card, `⋮`, `+`, `✓`. No icon library.
- **Motion as explanation only**: swipe follows the finger; settle, tray and ring fill take 120 to 180 ms with `--ar-ease`; with reduced motion every state change is instant. Nothing loops.

## Compose build plan

**Theme from one token source.** In the real build the common foundation's `tokens.json` gains the m4 additions (`swipeDone`, `swipeAct`, `select`, `kbd`, the gesture sizes and thresholds). Its generator writes `RunwayTokens.kt`; `tokens/GestenTokens.kt` here is the shape (light, dark, sizes, motion). A `RunwayTheme` maps them to a Material 3 `ColorScheme` (dynamic colour off) and a `Typography` from `res/font` (Space Grotesk 400/500, Fraunces italic 300, JetBrains Mono 400). Components read `RunwayTheme.colors.*`, never hex.

**Components**

| Component | Compose | Notes |
|---|---|---|
| `ThumbStack` | `Column` with `Modifier.windowInsetsPadding(WindowInsets.ime.union(WindowInsets.navigationBars))` | NoticeBar, ContextChips (`FlowRow`), TabRow (three `Tab`s + Mehr), CaptureField; the field stays directly above the IME |
| `PageHeader` | eyebrow `Row` + display `Text` with an `AnnotatedString` span for the Fraunces word | display hidden when `WindowInsets.isImeVisible` |
| `TaskRow` | `Modifier.anchoredDraggable` with anchors `Closed`, `Actions(-trayWidth)`; right drag commits on release past `max(0.35 * width, 96.dp)` | the face moves in `graphicsLayer { translationX }`; the tray is revealed with a clip between text and ring, and the text column's end padding follows the reveal (one-line ellipsis while open); haptic `GestureThresholdActivate` at the threshold; `combinedClickable(onClick = menu or Custom Tab, onLongClick = select)`; failed rows map the left anchor to opening the menu sheet |
| row semantics | `semantics(mergeDescendants = true) { contentDescription = "<desc>, <status>, ID <8>"; customActions = Abhaken, Aktionen, Auswählen }` | ring `IconButton` keeps `Abhaken: <desc>`; text node keeps `testTag("inbox-row-text")`; in selection mode the row gets `stateDescription = "ausgewählt"` / `"nicht ausgewählt"` and `toggleableState`, the ring is `invisibleToUser()` and disabled |
| `TabRow` | three `Tab`s with `Text(label)` only; the Inbox count is a `BadgedBox` badge placed **outside** the Tab's merged semantics node | uiautomator finds the exact text `Inbox`; the badge is its own node ("5") with the yellow dot as a second, decorative badge |
| Pull | `PullToRefreshBox` as today, restyled (sunk band, mono label, no spinner over 1 s) | unchanged behaviour |
| `MenuSheet` | `ModalBottomSheet` anchored above the thumb stack, items 48 dp | replaces the popup at the row; same items, one tap |
| `SelectionBar` | `AnimatedContent` swap with TabRow + CaptureField (180 ms, none with reduced motion) | `BackHandler` exits; batch writes go to the outbox as one hold with one undo |
| `GestureTip` | one extra line in the notice after a ring tap, counter in `DataStore` (max 3, reset to done after the first real swipe) | the card stays reachable via Mehr · Gesten zeigen |
| `Banners` | `Column` of surface cards in the thumb stack | pinned texts unchanged |
| Setup | Compose screen, pill `OutlinedTextField`s with labels above, same strings and order | P03 drivers unchanged |
| Glance widget | `GlanceTheme(colors = ColorProviders(light, dark))` from tokens; `Text`, `Row`, vector ring drawable | text only, no bitmaps; system font (Glance cannot load custom fonts); no swipe (RemoteViews); chip is a 48 dp target (`height(48.dp)`, not margin), order `@home @computer @work @business Alle` |
| Tile overlay | plain Views as today: `EditText` in a pill `GradientDrawable`, coral round `ImageButton`, notice `TextView`, Schließen | colours from the generated `colors.xml` (night variant); see Performance for the font |
| Share card | plain Views, full-width pill "In Inbox" at the bottom | unchanged flow, restyled |
| Launcher shortcuts | `shortcuts.xml` gains "Nächste" and "Warten auf" (4 static shortcuts in all) | open MainActivity on that tab without keyboard; can be dragged to the home screen as own icons (the T3/T4 fast path) |

## Performance

- **Tile overlay cold start (budget 700 ms warm, 1200 ms cold; 1500 ms ceiling for the icon path).** The overlay stays plain Views with no Compose, no Room query and no network before the first frame. The keyboard is requested in `onWindowFocusChanged`. The restyle adds one drawable and one typeface. Space Grotesk via `ResourcesCompat.getFont` costs about 5 to 15 ms on first load (measure on the Pixel 9); if the cold path exceeds 1100 ms, the overlay falls back to the system sans (declared deviation).
- **App to keyboard (≤ 800 / 1500 ms).** Baseline profile for MainActivity, list rendered from the Room cache, network refresh after the first frame. Nothing gesture-related runs at start except one `DataStore` read for the hint flag, done off the main thread.
- **Gestures.** Drag offsets live in `graphicsLayer` (draw phase only), no recomposition per frame. The tray width is measured once per row. Haptics only at thresholds.
- **Check-off leaves the tree within 1 s.** 120 ms ring fill, then the row is removed with a 160 ms height collapse that removes the node at once (no fade that keeps it).
- **No spinner.** Freshness stays `Stand hh:mm`; refresh via pull shows the band label, never a progress indicator over 1 s.

## Accessibility

- Every gesture has a custom accessibility action and a visible equivalent; no feature needs a gesture. Switch Access and TalkBack users get the same three actions on each row.
- Row text, ring description, notices and labels follow the pinned strings exactly (section "Contract changes" lists only additions and moves).
- 48 dp for every target, including chips (40 dp pill inside a 48 dp box), the widget chip (48 dp itself), widget rings, the quick clarify pills and the overlay's Schließen (now an outlined pill, so it reads as the one escape over the keyguard). Rows ≥ 56 dp.
- 150 % font: chips wrap to two lines, rows grow, tabs stay on one line (frame 11). With the keyboard up (frame 07) the header is one mono line and the tabs hide while typing; the list keeps about 420 dp, so five two-line rows fit fully with the notice showing (measured in the prototype: 412 × 915, keyboard 264 dp).
- Selection never sounds like ticking off: selected rows say "ausgewählt", the ring leaves the tree while selecting.
- Contrast (light / dark): text 16.6:1 / 16.6:1; mute 4.9:1 / 8.6:1; overdue text 5.0:1 / 7.0:1; ink on coral 7.0:1; "Rückgängig" on the notice 7.0:1 / 5.0:1. Yellow is never the only signal (always next to a word).
- Reduced motion (`ANIMATOR_DURATION_SCALE` 0 or the system setting): every transition snaps, the swipe still follows the finger. Haptics follow the system setting.
- Left-handed use: Mehr · Daumen links moves the ring to the left edge. Swipe directions stay the same so the muscle memory holds; this means a left thumb ticks off with an outward swipe, which is less comfortable. If Uli is left-handed in practice, the option should also mirror the directions (open question 8).
- Back gesture: Android owns the outer ~24 dp of both edges. Rows arm from any start point; in the build the row keeps a 24 dp inner gutter free of text (not drawn in the prototype), so a swipe that starts there is visibly "outside". Measure on the Pixel 9 how often a right swipe from the left edge triggers Back; fallback: lower the threshold to `max(0.30 * width, 88.dp)` so a swipe started at 32 dp still arms.

## Contract changes (need Uli's approval)

All pinned strings stay, including the rare states (setup, banners, "wartet auf Setup", widget badge and fallback; frames 15 to 18). These are moves and additions the critic's drivers may notice:

1. **Tab row moves to the bottom stack**, between the list and the field (labels `Inbox`, `Nächste`, `Warten auf`, `Mehr` unchanged; each Tab's text node is exactly its label, the count is a separate badge node). The field stays directly above the keyboard. At font scale ≥ 1.3 the tabs hide while the keyboard is up. Drivers that look for the tabs at the top, or always visible, need updating.
2. **Context chips move to the bottom stack** (Nächste only), still all five visible without scrolling at 1.0 and 1.5, exactly one selected, order unchanged (`@home`, `@computer`, `@work`, `@business`, `Alle`). Chip choice persists across process restarts.
3. **Check ring moves to the right edge** (content description unchanged). Mehr · Daumen links mirrors it.
4. **Swipe left opens a row action tray** (today: does nothing); on failed rows it opens the pinned menu. Swipe right is unchanged.
5. **Long press selects** (today: nothing). Tap still opens the menu with one tap, as P04 requires. Batch Abhaken and Löschen produce one notice "Erledigt" (or "Gelöscht") with the count and one "Rückgängig" for the whole batch.
6. **The Inbox row menu becomes a bottom sheet** (same items, same single tap).
7. **Löschen on Nächste and Warten auf rows** (via the tray; the outbox kind `delete` already exists).
8. **Due next actions show only under "Fällig"**, not again under "Nächste Aktionen".
9. **The capture field is visible on all three tabs** (today Inbox only), and capturing there **keeps the tab and the chip**; Nächste and Warten auf still open without the keyboard. The notice "In Inbox ✓" + "Rückgängig" appears on that tab. Drivers that expect the Inbox after a capture need updating.
10. **New launcher shortcuts "Nächste" and "Warten auf"** next to the pinned "Neues Todo" and "Inbox".
11. **Mehr gains** Auswählen, Gesten zeigen, Daumen links.
12. **Brand colours instead of dynamic colour** in app, overlay and widget (widget luminance rules still met: dark ground ink, light ground paper).
13. **Banners move into the bottom stack** (texts unchanged).

Dropped after review: the second pull stage (pull to capture). Pull-to-refresh stays exactly as pinned.

Not in the base, shown separately: **quick clarify** (frame 19) changes `PLAN.md:33-42` ("Klären … in der App" is a non-goal) and needs Uli's decision first.

## Brand deviations (declared)

| Deviation | Why |
|---|---|
| Ink text on coral buttons and the **+** (7.0:1) instead of white (2.6:1) | WCAG; same choice as all round-1 proposals |
| Coral beyond the CTA: the swipe-right track, the overdue edge rule and text, the "Nicht gesendet" dot | Ticking off is the primary action on this screen; overdue must be measurably red (contract) |
| Mixed-case mono eyebrows and section heads | Android pins literal strings (`Fällig`, `Stand hh:mm`); uppercasing would change the nodes |
| No logo inside the app screen | Every dp goes to rows; the mark is the launcher icon and sits in the share sheet |
| System font in the Glance widget, possibly in the tile overlay | Glance cannot load fonts; the overlay's cold-start budget wins |
| System glyphs in the Quick Settings tiles | system UI, not ours |
| Strings in German only, no `data-i18n` keys | Android acceptance tests reject non-German strings; message tables keep keys for later |

## Mock data

Derived in `store.js` from `shared/data/tasks.js` (not edited). Context mapping to Android's preset: `@computer → @computer`, `@anrufe → @business` (calls with customers, suppliers, tax office), `@buero → @work`, `@zuhause → @home`, `@unterwegs → @home` (private errands); the comma-joined `@unterwegs,@buero` becomes `@home @work`. Two follow-up days are added for Warten auf: "Feedback von Nora" (30.10., so "Nachhaken seit 30.10." shows) and "Unterschrift Pilotkunde" (07.11., "Wiedervorlage"). The offline frame adds three local captures.

## Effort (Android, person-days)

On top of the common foundation's token pipeline and shared Kotlin rules. Re-budgeted after review: thirteen contract changes against a frozen done-bar mean re-negotiating P03, P04, P05, P08 and P09 with the critic, and a two-direction anchored drag with custom actions, haptics, clip reveal and mirroring is more than four days.

| Work | pd |
|---|---:|
| Theme from tokens, fonts, dark mode | 2 |
| Thumb stack, IME insets, header collapse, tabs hiding at large font, chips in the stack, chip persistence, badge node | 4 |
| TaskRow: anchored drag right and left, clip-reveal tray, failed-row menu, haptics, semantics and custom actions, ring right + mirror, edge cue | 6 |
| Selection mode (own marker, state descriptions), batch hold and undo in the outbox | 3 |
| Menu sheet, banners in the stack, restyled setup screen and tile hint | 2.5 |
| Gesture tip in the notice, Mehr items, Fällig dedupe, "Nächste" and "Warten auf" shortcuts | 1.5 |
| Restyle tile overlay, share card, Glance widget (badge, fallback, 48 dp chip) | 3 |
| Contract renegotiation with the critic, acceptance drivers, gesture UI tests, TalkBack pass | 6 |
| Cold-start measurement, baseline profile, back-gesture measurement on the Pixel 9 | 2 |
| **Total** | **30** (34 with contingency) |
| Option: quick clarify (needs the PLAN.md change) | +3 |

## Known weaknesses

- **Gestures are invisible.** Discoverability rests on the one-time card and on the visible equivalents; someone who skips the card loses only speed, not function.
- **Android's back gesture owns both screen edges.** A swipe that starts in the outer ~24 dp triggers Back instead of the row. Exclusion rects are capped at 200 dp per edge, so they cannot cover the list. Rows must be swiped from inside; the threshold counts from the touch point. Needs a check on the Pixel 9.
- **The bottom tab row costs 48 dp** that the top would otherwise hold; with the keyboard up the list still has seven rows at 1.0, but on Nächste the chips add another 48 dp. At 150 % the tabs hide while typing, which is one more contract change.
- **Outside-the-app capture is not faster than today.** The gesture gains are in ticking off, batches and staying in place; T1 from the tile, widget or share sheet is the same path as now, only restyled.
- **The swipe-left tray still takes ~45 % of the row** for Bearbeiten and Löschen; on narrow phones (360 dp) the description gets about 120 dp, one ellipsized line.
- **The prototype's gestures use pointer events.** On a real touch browser, vertical panning goes to the browser, so try the pull with a mouse or trackpad.

## Open questions for Uli

1. Bottom tab row in the thumb stack instead of the pinned top position (contract change 1)?
2. Ring on the right edge, with Daumen links as the mirror?
3. Löschen on Nächste and Warten auf rows, or tick off only?
4. Remember the context chip across restarts?
5. Launcher shortcuts "Nächste" and "Warten auf" (four in all)?
6. One Rückgängig for a whole batch, or no batch actions at all?
7. Quick clarify on the phone (frame 19): lift the non-goal for this one move, or keep the phone capture-and-glance only?
8. Should Daumen links also mirror the swipe directions (left thumb ticks off by swiping inward)?

## Changes after review

Critic scores before: efficiency 7, ease of use 6, brand fit 8, consistency 7, contract compliance 5, feasibility 7.

Must-fix, all done:

1. **Capture keeps your place.** `submit()` no longer switches to the Inbox. On Nächste or Warten auf the tab and the chip stay, the notice shows "In Inbox ✓ · <text> · Rückgängig", the Inbox count rises and gets a yellow dot until you visit the Inbox. Checked: `proto.filter('@anrufe'); proto.capture('…')` ends on Nächste with @business selected. The in-app T1 row is updated (1.7 s).
2. **Selection has its own marker.** Row tint, a 3 dp plum edge and a leading plum square; the ring is dimmed, disabled and hidden from accessibility while selecting; a tap on the row toggles; the row's state reads "ausgewählt" / "nicht ausgewählt". No ✓, no "Abhaken" on a selected row (frame 06).
3. **Second pull stage removed** from the prototype, the gesture card, the legend, the README (contract change, component, effort). Pull refreshes only, as pinned. Frame 07 now shows the 150 % Inbox with keyboard (see 8).
4. **Swipe-left tray** is revealed between the text and the ring (about 45 % of the row on Inbox, less with "Details"); the description ellipsizes to one line in front of it, the status line and the ring stay visible (frame 05). Failed rows do not get a tray: swipe left opens the pinned menu (Erneut senden, Bearbeiten und erneut senden, Löschen) as a bottom sheet (frame 08).
5. **Timing table redone** with one operator set applied to every row (M 1.2 s each task, find 0.8 s in the share sheet, hold 0.9 s, scan 0.5 s). New values: widget 2.4/2.9 s, tile 3.0/3.5 s, share 2.8 to 3.5 s, T3 from the icon 3.5/4.2 s, T5 batch 4.6 s. Added a **"Nächste" launcher shortcut** (as its own home-screen icon) for T3: 3.0/3.7 s. Board table updated too.
6. **Pinned rare states shown**, frames 15 to 18: setup (all P03 labels), tile hint with "Verbunden als uli" and OK, banners "neu einrichten" and "Altes Konto: 2 nicht gesendet" + "Verwerfen", rows with "wartet auf Setup", widget badge "2 nicht gesendet" and fallback "Widget neu laden". README lists how each is restyled.
7. **Undeclared contract risks:** (a) the widget chip is a 48 dp target itself; (b) chip order is the contract order with Alle last, in the app, the widget cycle and the option screen; (c) the tab's text node is only the label, the count is a separate `aria-hidden` badge in the prototype and a `BadgedBox` outside the Tab's merged semantics in Compose.
8. **150 % proof:** frame 07 shows the Inbox at 1.5 with the keyboard up and the notice: tabs hide while typing (declared in contract change 1), five two-line rows are fully visible with room to spare.

Nice-to-have taken: in-context teaching (tip line in the notice after a ring tap, max three times; the card moved to Mehr only); the Fraunces display line shows only on lists of four rows or fewer; the Inbox row menu is a bottom sheet in the thumb zone; effort re-budgeted to 30 (34 with contingency); back-gesture edge measurement and fallback plus the left-thumb swipe direction noted (open question 8); quick clarify pills and chips at 48 dp; the overlay's Schließen is an outlined pill. Frame 07's coral band is gone with the pull stage.

Not changed: the swipe directions under Daumen links (left as an open question rather than decided for Uli).

