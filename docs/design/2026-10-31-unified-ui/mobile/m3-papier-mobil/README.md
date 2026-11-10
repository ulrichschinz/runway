# m3 Papier mobil

Mobile proposal m3 for runway on Android, as the faithful sibling of the chosen web design 06-kombination (base: [03 Papier & Tinte](../../03-papier-und-tinte/README.md)). No 3D, no shader, no Three.js.

**Idea in one sentence:** the same editorial page as on the web, split along the thumb: what you read sits at the top (eyebrow, heading, list), the controls sit in the bottom third (undo, context chips, the three tabs, the "Neues Todo" field on every tab), and the check-off ring sits at the trailing edge of each row, where the right thumb lands.

Board: [index.html](index.html) (serve the design folder, see [../../README.md](../../README.md)). Shots: [shots/board.png](shots/board.png), [shots/board-dark.png](shots/board-dark.png), [shots/phone.png](shots/phone.png).

## Why it is efficient

Three decisions do the work:

1. **Thumb zone.** The tab row moves from the top edge to just above the field. Context chips on Nächste sit directly above the tabs. "Rückgängig" appears directly above them. On a Pixel 9 held in one hand, none of these needs a regrip.
2. **Check-off at the trailing edge.** The 48 dp ring sits at the right end of each row (a declared deviation from the web, where it leads). For rows in the lower two thirds of the list the right thumb reaches it without a regrip. For the top rows (y below about 300 dp) the thumb has to stretch; there the swipe right (past 35 % of the row, min 96 dp, started anywhere on the row) is the faster path. The list is not bottom-anchored: Inbox is newest first and Nächste is long, so anchoring would only help short lists and would move rows when the IME opens.
3. **Capture field on every tab.** "Neues Todo" sits at the bottom of Inbox, Nächste and Warten auf. On Inbox it is focused on every open (pinned; the board's live phone opens that way). On the other two it is closed and opens the keyboard with one tap. Capturing from Nächste no longer needs a tab switch first.
4. **Same page as the web, denser.** Rows are the web's row (two lines of text, one mono meta line, hairline) at 56 dp. Section heads are one mono line (`// Fällig · 1`), not cards. The heading costs about 44 dp and folds away while the keyboard is up (every tab), as soon as the list scrolls, and always at font scale >= 1.3. The eyebrow already names the list. While the keyboard is up, the context chips step aside too.

Tap counts are counted from the stated start point. Seconds are estimates for a warm Pixel 9 and leave out the time spent typing the text.

| Task | Path | Taps | Seconds |
|---|---|---|---|
| T1 capture a thought | Tile: swipe the shade down, tap "+ Todo", type, Enter | 1 swipe + 2 | 1.5–2 |
| | Launcher shortcut: long press icon, "Neues Todo", type, Enter | long press + 2 | 1.5–2 |
| | Widget "+", type, Enter | 2 | 1–1.5 |
| | App icon (field already focused), type, Enter | 2 | 1.5 (cold ≤ 1.5 s budget) |
| | Inside the app on Nächste or Warten auf: field, type, Enter | 2 (today 3: Inbox tab first) | 1 |
| | Share sheet: runway, "In Inbox" | 2 after "Teilen" | 1.5 |
| T2 tick off / undo | Ring at the trailing edge, rows in the lower two thirds / "Rückgängig" above the chips | 1 / 1 | < 1 |
| | Top rows (one hand): swipe right from anywhere on the row, or stretch the thumb | 1 swipe or 1 stretched tap | 1–1.5 |
| T3 what to do now in a context | Widget with its chip on @work: read | 0 | 0.5 |
| | App: tab Nächste, chip @work | 2 (+ app icon) | 1.5–2 |
| T4 what am I waiting for | Tab Warten auf; due follow-ups first, under `// Nachhaken` | 1 (+ app icon) | 1 |
| T5 handle the Inbox | App opens on Inbox; tick off 1, delete 2 (row, Löschen), edit 3 (row, Bearbeiten, Enter); clarify happens on the web | 1–3 per item | 1–3 |
| | Option (not in the base): row, target | 2 per item | 1.5 |

Further speed and robustness:

- Inbox with the keyboard up: no heading, tabs above the field. Measured on the board with a realistic Gboard height of 336 dp (suggestion strip plus gesture inset) and 10 inbox items: 6 full rows at 100 % font, 5 full rows while "In Inbox ✓" is shown, 5 full rows at 150 % font (the pinned case; minimum 5). The confirmation sits in the thumb zone and pushes the list up; it never covers a row.
- The capture field never asks for metadata. Enter saves, empties the field and keeps it open for the next thought.
- Cold start renders from the Room cache. "Stand hh:mm" says how old the data is; nothing waits on the network.
- Motion: the coral strike takes 160 ms, the row collapse 120 ms, the notice fades in over 120 ms. Nothing else moves. With reduced motion, the row simply goes and the notice simply appears. No infinite pulses: the "läuft" dot is static.

## Screens and navigation

| Screen | Top (read) | Bottom (touch) |
|---|---|---|
| Inbox (start) | `// Inbox · 5`, `Stand 09:41`; heading "Was ist *das*?" with the tally of today, only while the keyboard is down | notice, tabs, focused field + IME |
| Nächste | `// Nächste · @work · 4`, heading "Was jetzt *zählt*", `// Fällig · 1` (unfiltered, overdue first, red edge), `// Nächste Aktionen · @work · 4` (without the tasks already under Fällig) | notice, chips Alle @home @computer @work @business (hidden while the IME is up), tabs, field |
| Warten auf | `// Warten auf · 4 · 1 Nachhaken`, heading "Worauf du *wartest*", `// Nachhaken` (yellow ring), `// Wartet` | notice, tabs, field |
| Offline (any tab) | `Stand 08:12` stays its own node; next to it the word **"kein Netz"** in ink, in a hairline pill (no colour-only signal). Rows say "wartet auf Netz" / "Nicht gesendet" | unchanged |
| Banners (below the heading, above the list) | "Verbunden als uli" (after setup); "Key abgelehnt – neu einrichten" (tap → setup, error ink + coral line); "Altes Konto: N nicht gesendet" + explanation + "Verwerfen" (asks again in place). At font >= 1.3 they collapse to one 48 dp line | "Verwerfen" |
| Pull to refresh | a 2 px coral line grows under the heading while pulling, with "loslassen lädt neu"; after release, `Stand` gets the new time. No spinner, no Material indicator | |
| Setup | mark, `// runway · by Agentic Reach`, "runway *einrichten*", one sentence | in the lower half: "Benutzername", "Passwort", "Anmelden" (coral, 56 dp), "Key einfügen", "Erweitert" (reveals "Server-URL", prefilled). The key way ("API-Key", "Einfügen", "Verbinden", "Mit Passwort anmelden") reuses the same layout |
| After setup | "Verbunden als uli" banner | once: dialog "Zieh die Kachel + Todo in die erste Reihe" + "OK" |
| Launcher shortcuts | long press on the icon | "Neues Todo" (same overlay as the tile), "Inbox" (app) |
| Row tap | Inbox: menu at the row's right edge (Bearbeiten, Löschen; failed rows: Erneut senden, Bearbeiten und erneut senden, Löschen). Nächste / Warten auf: Custom Tab on `/next?task=<uuid>` or `/waiting?task=<uuid>` | |
| "···" (Mehr) | opens upward from the tab row (closes the IME first) | Angemeldet als …, Projekte im Web ↗, Irgendwann im Web ↗, Widget hinzufügen, Protokoll exportieren, Abmelden |
| Widget 4×3 | `// Inbox 5 · fällig 1`, chip, coral "+"; up to 5 rows at 4×3 (8 when taller), ring at the trailing edge; bottom line `+K weitere` (left) and `Stand 09:41` or the badge `Nicht gesendet` / `N nicht gesendet` (right, error ink). Chip, "+" and every ring are 48 x 48 dp cells | |
| Widget fallback | system neutral card "Widget konnte nicht angezeigt werden" + "Widget neu laden" (48 dp) | |
| Tile "+ Todo" overlay | | notice, field, "Schließen" over the IME; nothing else, also on the keyguard |
| Share card | `// Teilen · in die Inbox`, title, three-line note preview | full-width "In Inbox" |

Back: Nächste or Warten auf → Inbox; Inbox → leave. Pull to refresh on every list. Swipe right checks off past 35 % of the row width (min 96 dp), with a coral-tinted track and the ring filling with ink at the threshold; vertical drags never check off.

## The Agentic Reach theme without 3D

The brand is carried by type and four colours, the same way as on the web:

- **Paper and ink.** `--ar-bg` ground in light, `--ar-ink` ground in dark; never pure white or black.
- **One Fraunces word.** Each heading has exactly one italic Fraunces 300 word in plum (plum mixed with paper on dark).
- **Mono with the `//` mark.** Every eyebrow, section rule and meta line is JetBrains Mono; the `//` is coral.
- **Coral = act, plus the pen strike.** The "+" in the field and the widget, "In Inbox", "Rückgängig", the pen strike across a finished row, every fifth tally stroke, and the overdue edge. The done ring fills with ink (paper on dark), not coral, so a just-done row and an overdue row no longer look alike.
- **Yellow only as dot, ring or line.** Dot under the active tab; ring for "Nachhaken" and (decorative, next to the words) a stale "Stand"; 1 px line on top of the notice, the banners and around the focused field. Yellow never carries information alone.
- **Pills and hairlines.** Field, chips and buttons are pills; rows and sections are separated by 1 px hairlines, never cards.
- **Tally (Strichliste).** Today's finished todos as plum strokes at the end of the heading line, the fifth in coral. It grows by one stroke when you tick something off: the only "reward", 160 ms. It folds away with the heading, so "Stand" stands alone at a glance.
- **The brand mark** stays the launcher icon and the share target icon, unchanged.

## Compose build plan

**Theme from the shared token source.** One `tokens.json` (06's pipeline, started in 03's `tokens/gen-tokens.mjs`) generates `tokens.css` for the web, `RunwayTokens.kt` for Compose, `values/colors.xml` + `values-night/colors.xml` for the plain-View overlay and share card, and the Glance `ColorProviders`. `tokens.css` in this folder lists the mobile values; they equal the web's `--rw-*` names. `RunwayTheme` maps them to a static `ColorScheme` (dynamic colour off), and Typography uses `res/font` Space Grotesk 400/500, Fraunces italic 300 and JetBrains Mono 400 (downloadable fonts are not used; they cost cold-start time).

**Components** (same names as the web components):

| Component | Compose |
|---|---|
| `PageHeader` | `Column`: `Eyebrow` row (`FlowRow`, so it wraps at 150 %) + `Text("Stand hh:mm")` as its own node + `Text("kein Netz")` while offline; heading row = `AnnotatedString` with one `SpanStyle(fontFamily = Fraunces)` + `TallyMark`. The heading row is hidden while `WindowInsets.isImeVisible`, when `LazyListState.firstVisibleItemScrollOffset > 24 dp` and when `fontScale >= 1.3` |
| `Banner` | hairline card with a 1 px top line; three variants (connected, rekey, old account); one 48 dp line at `fontScale >= 1.3` |
| `SectionRule` | `Row`: mono label + `HorizontalDivider` filling the rest |
| `TaskRow` | today's row with new styling: text `maxLines = 2`, mono meta, then the 48 dp `IconToggleButton` ring at the trailing edge (`contentDescription = "Abhaken: …"`); overdue edge via `drawBehind`; `semantics { contentDescription = "<desc>, <status>, ID <8>" }` unchanged |
| `InkStrike` | `Canvas` `drawPath` with `PathMeasure` segment animated by `animateFloatAsState(tween(160))`, seeded wobble per task; skipped when `Settings.Global.ANIMATOR_DURATION_SCALE == 0` |
| `TallyMark` | `Canvas` strokes, fifth in coral |
| `ThumbBar` | `Column` at the bottom of the `Scaffold` content with `imePadding()`: `Notice` (in the layout flow, so it pushes the list up and never overlays a row), `ContextChips` (Nächste only and only while the IME is hidden, `FlowRow` of `FilterChip`s with the check slot removed and a 48 dp minimum interactive size), `TabRow` of three text tabs + `Mehr`, `CaptureField` |
| `CaptureField` | `OutlinedTextField` with pill shape and coral `IconButton` "+", `ImeAction.Done`; draft-is-never-lost logic unchanged |
| `Notice` | inverse surface, radius 12, 1 px yellow top line, text + `TextButton("Rückgängig")` |

**Glance widget.** Same `RunwayWidget` structure; colours from generated `ColorProviders(day, night)`; `FontFamily.Monospace` for the `//`, chip and "Stand" line, default sans for the rest (Glance only offers generic families). Text and one vector "+" only; no bitmaps. The chip, the "+" and each row's ring are `Box(GlanceModifier.size(48.dp).clickable(...))` cells with the smaller visual inside. Bottom line: `Text("+$k weitere")` with the literal "+" (P09), right side `Stand` or the badge.

**Tile and overlay.** `CaptureTileService` and `CaptureActivity` unchanged in structure; only colours, the pill field and the coral "+" change. Still plain Views. The overlay uses the **system font by default**. Space Grotesk in the overlay is adopted only if a measured cold run of the existing `timing/` series shows <= 30 ms extra; nothing is preloaded in `Application.onCreate`, because that runs on every process start, including the tile path.

**Setup, banners, shortcuts.** `SetupScreen` restyled (same strings, form moved to the lower half); `Banner` component above; `res/xml/shortcuts.xml` unchanged except the icon colours.

**Share card.** Same `ShareViews`, restyled: paper card, mono eyebrow, coral full-width pill "In Inbox".

## Performance

| Path | Budget (done-bar) | What this design adds | Plan |
|---|---|---|---|
| Tile → keyboard up | warm ≤ 700 ms, cold ≤ 1200 ms (proposal budget 700–1500 ms) | nothing by default (system font) | optional Space Grotesk only after a measured cold cost <= 30 ms; no preload in `Application.onCreate` |
| Icon → Inbox with keyboard | ≤ 800 / 1500 ms | three fonts, `Canvas` tally | Baseline Profile for `MainActivity`, fonts in `res/font`, first frame from Room, no network wait |
| Enter → "In Inbox ✓" | ≤ 300 ms | none | unchanged outbox path |
| Check-off → row gone | ≤ 1 s | strike 160 ms + collapse 120 ms | row leaves the semantics tree when the collapse starts (no exit fade keeps the node) |
| Share card | ≤ 600 ms | none | unchanged |

No shader, no `RuntimeShader`, no Lottie. Idle frames: 0.

## Accessibility

- Every control ≥ 48 dp. Chips are 36 dp tall visually with a 48 dp touch target (`minimumInteractiveComponentSize`). In the widget, chip, "+" and rings are 48 x 48 dp cells.
- At 150 % font: the heading folds away (the eyebrow names the list), tab counts drop out except the Inbox count, so "Warten auf" stays on one line; chips wrap to two lines (never scroll) and step aside while the IME is up; banners collapse to one line; rows grow. Shown in "150 % · Nächste" (about 5 actionable rows) and "150 % · Inbox mit Tastatur" (5 full rows, the pinned case).
- Offline is said in words ("kein Netz") in ink, not only by the yellow ring (yellow on paper is about 1.5:1 and is decoration only).
- Contrast: ink on paper 15:1; mute text 66 % ink ≈ 5.9:1; overdue `#A45150` on paper ≈ 5.3:1; ink on coral 7:1; coral "Rückgängig" on ink ≈ 6.8:1. Placeholders use 42 % ink and never carry information.
- TalkBack: row, check-off and notice strings exactly as pinned; the tally has a hidden "heute erledigt: N".
- Reduced motion (animator scale 0): no strike, no collapse, no notice rise.

## Contract changes (need Uli's approval)

1. **Tab row position.** The tabs move from the top edge to above the capture field (still visible while the IME is up, still one tap). Labels, order and `Mehr` are unchanged. No driver found pins a top position (U11 and U19 only need one tap with the keyboard open), but `docs/done-bar.md` and the critic should confirm.
2. **Chips below the list.** P08 §1 says "Fällig" is "the topmost content below the chips". With the chips in the thumb zone, "Fällig" is the topmost content of the list, still above every row. The wording of P08 needs a small edit.
3. **Capture field on Nächste and Warten auf.** Both tabs still open without a keyboard (pinned). A second node with contentDescription `Neues Todo` exists on those tabs; drivers that look up the field by description must expect it on every tab.
4. **Remembered context chip** (needed for "T3 = 2 taps" to stay 2 after the process dies): the chip survives process death until midnight instead of resetting to "Alle". Exactly one chip stays selected.
5. **Mehr menu additions.** "Projekte im Web" and "Irgendwann im Web" open a Custom Tab on `/projects` and `/someday`. Additive; both routes are already accepted by the Custom Tab contract.
6. **Brand colours replace dynamic colour** in app, overlay, share card and widget (the widget keeps the luminance rules: < 0.35 dark, > 0.6 light).
7. **No duplicate in Nächste.** A due `+next` task shows once, under "Fällig", and no longer again under "Nächste Aktionen" (inventory 3.2 describes it in both). Not a pinned string, but a behaviour the P08 driver may count.
8. **Check-off ring at the trailing edge** in app rows and widget rows. The contentDescription `Abhaken: <description>` is unchanged; a driver that taps by position (left edge) would need to look the node up by description instead.
9. **Notice in the layout flow.** "In Inbox ✓" / "Erledigt" + "Rückgängig" sit between list and chips and push the list up instead of floating over it. Strings unchanged; the ">= 5 rows with the keyboard open" check must run with the notice shown (it passes: 5 rows at 336 dp IME).

Not changed: every pinned string (including the setup strings of P03, the banners, `+K weitere`, `Widget neu laden`, the shortcuts), the row accessibility format, `Abhaken: …`, `In Inbox ✓` + `Rückgängig`, `Stand hh:mm`, chip names and the widget header `Inbox N · fällig M`, `In Inbox` on the share card, ≥ 5 inbox rows with the keyboard up, text-only widget, swipe right, pull to refresh, the Custom Tab handoff.

## Brand deviations (same as 03, carried over)

- Ink text on coral (7:1) instead of white (2.6:1, fails WCAG).
- Coral as "done" ink (strike, fifth tally stroke) and a coral-ink mix `#A45150` as the overdue colour: the acceptance test needs overdue to be measurably red, and coral is the only red-ish brand colour.
- Deviation from the web (not the brand): the check-off ring sits at the trailing edge on the phone, at the leading edge on the web. Reason: one-handed reach with the right thumb. The pen strike still runs left to right.
- Plum mixed with paper as the accent on dark.
- Mixed-case mono eyebrows, because Android pins literal strings such as "Fällig".
- System fonts in the Glance widget (platform limit); monospace stays.
- German only; strings in Android resources instead of `data-i18n`.

## Effort

| Work | Person-days |
|---|---|
| Token pipeline output for Android (Kotlin, colors.xml, Glance providers), `RunwayTheme`, fonts | 1.5 |
| Components: header, section rule, row restyle, strike, tally, notice | 2.5 |
| ThumbBar: tabs + chips + field at the bottom, IME handling, field on all tabs, Mehr additions | 2 |
| Glance widget restyle, light/dark | 1 |
| Tile overlay and share card restyle (Views) | 1 |
| Remembered chip | 0.5 |
| Setup screen restyle, banners (three variants, one-line form at large font), tile hint dialog, pull-to-refresh line, shortcut icons, widget fallback | 2 |
| Heading fold (scroll, IME, font scale), chips hidden with IME, notice in flow, trailing ring | 0.5 |
| Acceptance updates with the critic (nine contract changes), timing re-runs, Baseline Profile | 2 |
| 150 %, TalkBack, dark, reduced-motion pass | 1 |
| **Total** | **14** |

## Open questions for Uli

1. Tabs at the bottom above the field (this proposal), or keep them at the top as today and on the web's phone layout?
2. Keep the remembered chip until midnight, or until you change it?
3. Is the quick-clarify option (row → target, 2 taps) worth lifting the "no clarify on the phone" non-goal? It is drawn on the board, outside the base.
4. Widget default chip: the app's chip, or its own (today: its own)?
5. Show the tally of today at all on the phone, or only on the web? (It now sits at the end of the heading line and folds away with it.)
6. Left-handed use: mirror the row (ring leading) as a setting, or keep one layout?

## Changes after review

Fixed (must fix):

1. **Mehr menu.** The menu's web items used the class `.web`, which collided with the share target's full-page rule. Renamed to `.menu .weblink`; the share page is now `.webpage`. All items are visible again (Angemeldet als, Projekte im Web, Irgendwann im Web, Widget hinzufügen, Protokoll exportieren, Abmelden). The menu now opens from the measured top of the tab row and closes the IME first.
2. **Live phone start state.** Opens on Inbox with the field focused and the keyboard up; `phone.png` shows that state.
3. **Offline visible in words.** "kein Netz" in ink in a hairline pill next to the unchanged `Stand hh:mm` node, on every tab. New frame "Nächste · kein Netz" shows it without any pending capture.
4. **Widget P09 and 48 dp.** `+K weitere` with the literal "+"; chip, "+" and rings are 48 x 48 dp cells; second widget frame with chip "Alle", "+8 weitere", the badge "2 nicht gesendet" and the fallback "Widget neu laden".
5. **Thumb reach for T2.** Ring moved to the trailing edge (declared deviation from the web); the README and the board now say that the top rows need a stretch or a swipe (1–1.5 s) instead of claiming "< 1 s, no regrip". Bottom-anchoring was considered and rejected (reason in "Why it is efficient").
6. **150 % font.** The heading folds away at font scale >= 1.3, on scroll and while the IME is up on every tab; chips hide while the IME is up; the Inbox tab keeps its count. New frame "150 % · Inbox mit Tastatur" (5 full rows).
7. **Notice no longer covers rows.** It sits in the layout flow above the chips and pushes the list up. The mock IME is now 336 dp; the Inbox frame has 10 items and shows 6 full rows (5 with the notice, 5 at 150 %).
8. **Missing inventory parts.** Frames for setup (P03 strings), "Verbunden als" + the tile hint, the banners ("Key abgelehnt – neu einrichten" on the dark frame, "Altes Konto: 2 nicht gesendet" + "Verwerfen"), launcher shortcuts, the widget fallback and pull to refresh (no spinner); README lines for each; effort raised to 14 person-days; the board table now matches the README.

Taken (nice to have): done ring fills with ink instead of coral; the duplicate of a due task is dropped from "Nächste Aktionen" (contract change 7); the tally moved from the "Stand" line to the heading line; the Inbox tab count stays at 150 %; the quick-clarify option has "Nächste" without context, shows "Inbox 5 → 4" and makes "Im Web klären" the primary button; a frame shows capture on Nächste with the keyboard up and says that "In Inbox ✓" is the only feedback there; effort 14 days; the overlay uses the system font by default and nothing is preloaded in `Application.onCreate`.

Not taken: a plum or muted strike. The direction for this proposal names the coral pen strike as part of the web vocabulary. Coral now has fewer other meanings instead (the done ring is ink).
