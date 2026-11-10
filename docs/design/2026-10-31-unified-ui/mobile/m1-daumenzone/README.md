# M1 Daumenzone: runway on Android, one-handed by construction

**Idea in one sentence:** everything you tap lives in one dock in the bottom third of the screen (context chips, tabs, the "Neues Todo" field), lists are ordered by reach so the most urgent row sits right above the dock, checks and Rückgängig sit on the thumb's side, every menu rises from the bottom, and the top of the screen holds only what you read.

Board: [index.html](index.html) (open via the design folder's HTTP server, see [../../README.md](../../README.md)). The first phone is interactive and drives `window.proto`. Shots: [shots/board.png](shots/board.png), [shots/board-dark.png](shots/board-dark.png), [shots/phone.png](shots/phone.png).

Sibling of the web design `06-kombination` (base `03-papier-und-tinte`): same tokens (copied unchanged into [tokens.css](tokens.css)), same row vocabulary (ring, title, mono meta, overdue edge rule), same `//` eyebrows with `Stand hh:mm`, same Fraunces accent word per heading, same notice with the 1 px yellow time line. No 3D, no shader, no canvas.

## Why it is efficient

Counts are taps excluding typing the text itself. Seconds are estimates (about 0.4 s per tap in the easy zone, about 0.9 s for a tap that needs a regrip, plus the frozen time budgets from `runway-android/PLAN.md` and `docs/done-bar.md`). "Reach" is measured with `proto.reach()` against the thumb model below.

| Task | Path | Taps | Est. seconds | Reach of every tap | Today (top tabs) |
|---|---|---:|---:|---|---|
| T1 capture, app | App icon → field is focused → type → Enter | 2 | 1.5 (warm) - 2.2 (cold) | Enter on the keyboard, easy | same taps |
| T1 capture, widget | "+" (bottom right of the widget) → type → Enter | 2 | 1.4 | easy | "+" is in the widget header, top right |
| T1 capture, tile | swipe down → "+ Todo" → type → Enter | 2 + swipe | 1.6 (warm) - 2.1 (cold) | the tile is at the top (system), the rest easy | same |
| T1 capture, share | share → runway (in the source app) → "In Inbox" | 3 | 1.8 (warm) - 3.0 (cold, the share sheet's own ranking included) | "In Inbox" full width at the bottom, easy | same |
| T1 capture, inside the app on another tab | tap "Neues Todo" → type → Enter | 2 | 1.0 | easy | field exists only on Inbox, so 3 taps (tab + field + Enter) |
| T2 tick off | ring at the trailing edge, or swipe right | 1 | 0.6 (easy ring) - 1.2 (stretch or hard ring, regrip) | Nächste: 4 of 10 visible rings easy, and those 4 are the overdue and due rows; Warten auf: 3 of 4 easy | ring at the leading edge: stretch for a right thumb; overdue row at the top: hard |
| T2 undo | "Rückgängig" in the notice line at the top of the dock, trailing side | 1 | 0.5 | easy (about 210 dp) | same |
| T3 what now in a context | Nächste → chip | 2 | 1.5 | easy (chips sit right above the tabs) | 2 taps, both at the top: hard |
| T3 with the widget | glance; chip cycles if needed | 0 (1-4) | 0.5-1.0 to read with the screen already on; +0.4 per chip tap, no cold start (the widget is drawn) | easy | same |
| T3 with "remember chip" (contract change 7) | Nächste | 1 | 0.8 | easy | n/a |
| T4 what I wait for | Warten auf | 1 | 0.8 | easy | 1 tap at the top |
| T5 Inbox: done in two minutes | ring | 1 | 0.6-1.2 | keyboard up (how the Inbox opens): 1 of 5 easy, 2 stretch, 2 hard, and the easy one is the newest capture; keyboard down (tap beside the field): 4 of 5 easy, the newest at 111 dp counts as stretch (thumb curl) | same taps, newest at the top: hard |
| T5 Inbox: delete | row → "Löschen" in the bottom sheet | 2 | 1.1 | easy (sheet) | dropdown at the row's right edge: wherever the row is |
| T5 Inbox: edit | row → "Bearbeiten" → type → Enter | 2 + Enter | 1.5 | easy | same taps |
| T5 Inbox: unsent capture | outbox line "1 Nicht gesendet" above the dock → "Erneut senden" | 2 | 1.1 | easy | find the red row first |

The gain is not fewer taps, which were already near the minimum. It is that almost every tap lands where the thumb already is, so no regrip and no second hand. The second gain is predictability: the dock is the same stack on every tab and moves as one piece onto the keyboard or the gesture bar.

### Thumb model and measured reach

- Frame 412 × 915 dp, the Pixel 9 class (6.1-6.3 in), 160 dp = 1 in.
- Right thumb pivot (the base of the thumb) at x 430, y 830 dp: just off the right edge, about 85 dp above the bottom. Left hand mirrored at x -18.
- Easy is a band: 120-400 dp from the pivot (about 0.75-2.5 in). Closer than 120 dp the thumb has to curl into the bottom corner, which counts as stretch. Stretch also covers 400-500 dp. Hard: beyond 500 dp. These are assumptions for an adult hand, not measurements of Uli's.
- `proto.reach()` lists every visible tap target with its distance, zone and row text (rows scrolled out of the content area are excluded). Measured on the board after review (round 2, rows in reach order):
  - **Nächste "Alle", keyboard down:** 12 of 21 targets easy. Rings: 4 of 10 easy, and they are the right four: "Belege Oktober hochladen" in Fällig (159 dp), the same task in Nächste Aktionen (overdue, 327 dp), "Angebotsentwurf fertigstellen" (läuft, due Tue, 259 dp) and "Steuerberatung zurückrufen" (priority H, 386 dp). One stretch, five hard: the low-urgency rows at the top. Dock: chips "Alle" to "@work" 388-177 dp easy, "@business" 113 dp stretch (curl); tabs easy; "Mehr" 64 dp and send 62 dp stretch (curl). Send is rarely tapped, since Enter on the keyboard sends.
  - **Nächste "@home":** rings 3 of 5 easy; the overdue row at 222 dp.
  - **Warten auf:** 7 of 10 easy. Rings 3 of 4 easy; the oldest follow-up ("Nachhaken seit 29.10.") sits lowest at 113 dp, stretch (curl).
  - **Inbox, keyboard up:** 5 of 11 easy. Field 334 dp, "Warten auf" 339, "Mehr" 309, send 255: easy. "Inbox" tab 481 dp and "Nächste" tab 406 dp: stretch, because the keyboard lifts the dock to mid-screen. Rings: 1 easy (the newest capture, 371 dp), 2 stretch, 2 hard (593 dp, the oldest).
  - **Inbox, keyboard down:** 8 of 11 easy; rings 4 of 5 easy.
- Round 1 measured the overdue ring on Nächste at 634 dp (hard) and the newest Inbox capture at 591 dp (hard). Reach ordering moves both into the easy band.
- The reach frame on the board draws the band (yellow line = easy limit, dashed outer line = stretch limit, dashed inner circle = curl limit) and marks each target: dot easy, ring stretch, cross hard.

## Screens and navigation

From top to bottom on every tab:

1. **Status bar.**
2. **Eyebrow (read-only, fixed):** `// Inbox · Stand 09:41`, capped at 115 % text size. It stays at the top on every tab, so "Stand" is always visible, even when a long list scrolls.
3. **Content area**, bottom-anchored:
   - empty band (only when the list is short): it sits **above** the heading, never between heading and rows;
   - heading with one Fraunces accent word ("Kopf *frei*", "Was jetzt *zählt*", "Was *andere* tun") and one mono summary line ("1 fällig · 13 Aktionen", "5 Todos · ältestes 29.10. · neueste unten"). Heading and summary sit directly above the first row. With the keyboard up they hide (≥ 5 inbox rows rule);
   - the list **in reach order**: the most important row is drawn last, right above the dock. Inbox: oldest at the top, newest capture right above the field (like a chat). Nächste: "Nächste Aktionen" first (lowest urgency at the top, highest at the bottom), then the "Fällig" section last, with the most overdue row at the very bottom, right above the chips. Warten auf: follow-ups lowest, the oldest "Nachhaken" last. Long lists open scrolled to their bottom end and stay anchored there when rows, fonts or the notice change.
   - Rows: title (2 lines max), mono meta (due, "läuft", project, context, outbox status), **ring at the trailing edge** in a 48 dp target. Overdue: 4 dp edge rule plus red ring and "überfällig 30.10."; Nachhaken: plum edge rule and "Nachhaken seit 29.10.".
4. **Dock**, always this stack:
   - notice line: "In Inbox ✓", "Erledigt: …", "Gelöscht" with "Rückgängig" on the thumb side and the 6 s yellow line. It takes its own line at the top of the dock and pushes the list up by one line; it never covers a row. After a tick-off the removed row and the new notice line nearly cancel out (56 vs 60 dp), so the rows under the thumb barely move;
   - banners, one 48 dp line each (see below);
   - outbox line (Inbox only, when something is pending): `// 1 wartet auf Netz · 1 wartet auf Setup · 1 Nicht gesendet`;
   - context chips (Nächste only): Alle @home @computer @work @business, right-aligned, wrapping at large text, the selection dot slot always reserved so nothing moves;
   - tabs: Inbox · Nächste · Warten auf · `···` (Mehr), counts in 12 px tabular mono, the selected tab marked by a yellow dot. At font scale ≥ 1.3 with the keyboard up the tab row steps aside so five rows stay visible; tapping beside the field closes the keyboard and brings it back;
   - the field "Neues Todo" with the 48 dp coral send button. Captures always go to the Inbox, whatever tab is open (contract change 9). The yellow focus ring shows only while the field has focus.
5. **Keyboard or gesture bar.**

**Pull to refresh (pinned, inventory 6.2):** a pull down starts anywhere in the content area, the empty band above a short list included, as long as the list is at its top end (on short lists: always). No spinner and no indicator that moves the list: a 1 px yellow line under the eyebrow fills with the pull, the mono text reads "Ziehen: aktualisieren", past 72 dp "Loslassen: aktualisieren". On release "Stand hh:mm" changes to the new time and gets a 1 px yellow underline for 1.2 s. Offline the pull ends with the notice "Kein Netz · Stand 08:12" and the rows stay. Board frame 07, `proto.refresh()`.

**Banners (pinned strings), all in the dock, so no reach exception is needed:** "Verbunden als uli" (a quiet mono line, right after setup); "Key abgelehnt – neu einrichten" or "Gespeicherter Key nicht mehr lesbar – neu einrichten" (an error-coloured 48 dp line, tap → setup); "Altes Konto: N nicht gesendet" with "Verwerfen" on the thumb side, which asks again in place ("N Todos endgültig verwerfen?" + "Abbrechen" + "Verwerfen"). Rows paused by a 401 show "wartet auf Setup" in their meta and in the outbox line. Board frames 06 and 07.

**Setup** ("runway einrichten"): the same rule, read on top, type at the bottom. Top: eyebrow, brand mark, heading "runway *einrichten*", one line of explanation. Bottom stack: "Benutzername", "Passwort", then "Erweitert" (opens "Server-URL" above the fields) and "Key einfügen", then the full-width coral "Anmelden". "Key einfügen" swaps the fields for "API-Key" (with "Key anzeigen"), "Einfügen" and "Verbinden"; "Mit Passwort anmelden" switches back. Errors ("falsch", "ungültig", "Zu viele Versuche, in N s erneut") appear as one line above the fields. After setup, the one-time hint "Zieh die Kachel + Todo in die erste Reihe" rises as a sheet with a small QS mock and "OK" on the thumb side.

Navigation: the app opens on Inbox with the field focused and the keyboard up. A tab tap switches; Nächste and Warten auf close the keyboard, Inbox opens it. Back from Nächste or Warten auf returns to Inbox. Tapping beside the field closes the keyboard and keeps the draft.

Surfaces from the bottom:

- **Row menu (Inbox):** a bottom sheet with the row's text, then "Bearbeiten", "Löschen", or for failed captures "Erneut senden", "Bearbeiten und erneut senden", "Löschen". Edit replaces the tab row with "Todo bearbeiten" + "Abbrechen" + "Speichern" and puts the text into the same bottom field (labelled "Beschreibung").
- **Details (Nächste, Warten auf):** a Partial Custom Tab at 62 % height on `/next?task=<uuid>` or `/waiting?task=<uuid>`.
- **Mehr:** a bottom sheet with "Angemeldet als …", "Widget hinzufügen", "Protokoll exportieren", **"Daumen: links · rechts"**, "Abmelden".

Android-only surfaces:

- **Widget (Glance), resizable:** header "Inbox 5 · fällig 1" (tap = reload) and the context chip (tap = next chip). Rows with the ring at the trailing edge, "überfällig"/"heute" marks, as many as fit, up to 8 (the board shows a 4×5 widget pulled up to 7 rows). The widget keeps top-down priority order (due first), since its height is chosen by the person and it sits wherever the launcher grid puts it. Bottom line "+K weitere · Stand 09:41", or for 5.5 s "Erledigt · Rückgängig", or the badge "N nicht gesendet" (→ app Inbox), or "lädt …", plus **the coral "+" at the bottom right**, where the thumb meets a widget placed in the lower half. Not set up: "runway einrichten". Error fallback: "Widget konnte nicht angezeigt werden" + "Widget neu laden" in neutral system colours. Text and one vector only. Board frame 07.
- **Tile "+ Todo":** unchanged system tile at the top (the one unavoidable reach). The overlay is field-first: notice + "Rückgängig" + "Schließen" in one row directly above the field, the field directly above the keyboard. No send button of its own: the keyboard's action key sends, as the contract allows only field, notice, "Rückgängig" and "Schließen". Over the keyguard: the same, nothing else.
- **Share:** bottom card with the eyebrow `// Teilen · in die Inbox`, title, three mono lines of the note, and the full-width coral pill "In Inbox" (reads "In Inbox ✓" until the card closes).
- **Launcher icon:** the brand mark on warm paper (the kit's mark, unchanged); shortcuts "Neues Todo" and "Inbox".

States shown on the board: tick-off mid-swipe with the undo notice, offline (older Stand, row statuses, outbox line, capture still confirmed), dark, 150 % text, 150 % text with the keyboard up, the failed-row sheet, setup, the tile hint after setup, pull to refresh, the banners, the widget states, left-hand mode, and the scope option.

### Option, needs Uli's decision: quick clarify

Shown on its own dashed frame, not part of the base. The Inbox row sheet gains a dashed block "Option · braucht Ulis Entscheidung": "Nach Nächste, mit Kontext" (four chips, so no route into Nächste without a context), "Warten auf" (would ask morgen · Freitag · nächste Woche · ohne Datum, writing `scheduled`), "Irgendwann". Two taps per item, all in the bottom sheet, writes as `tags_add`/`tags_remove` with an exact inverse for Rückgängig (03's rules). It lifts the PLAN.md non-goal "Klären … in der App" and adds about 4-5 pd. `proto.clarify()` opens this sheet and returns `{ ok: false }` because the base does not clarify.

## How the Agentic Reach theme shows without 3D

- Warm paper `--ar-bg` ground, Ink text, hairlines `--rw-rule` between rows, no cards for rows, no shadows except on sheets.
- Coral only for the primary action: the send button, the share "In Inbox", the widget "+", the filled ring when ticking off (and the strike), the `//` mark. Ink text on coral (7:1).
- Plum as the accent: the Fraunces italic word in each heading, the Nachhaken edge, the Enter key.
- Yellow only as a dot, ring or line: the selected tab dot, the selected chip dot, the 1 px focus ring around the field, the undo time line, the ring around the tapped QS tile.
- Space Grotesk for UI, JetBrains Mono for eyebrows, meta, counts and chips, Fraunces 300 italic for one word per heading.
- Pill shapes for the field, chips, notice and buttons. Sheets with the kit's 22 dp top radius.
- The theme is in the type and the restraint, so it costs nothing at cold start.

## Compose build plan

- **Theme:** take tokens.json from the common foundation (03's generator `03-papier-und-tinte/tokens/gen-tokens.mjs`) and generate `RunwayTokens.kt` (resolved sRGB, light and dark) plus a tiny `RunwayColors` object without Compose dependencies for the Views in the overlay and share card. Fonts in `res/font` (Space Grotesk 400/500, JetBrains Mono 400, Fraunces 300 italic). Dynamic colour off.
- **DockScaffold:** a custom layout with two slots, `content` and `dock`. The dock is a `Column(UndoNotice, Banners, outboxLine, ContextChips, TabRow, CaptureField)`; the notice is a normal child, so it takes space instead of overlaying a row with `Modifier.windowInsetsPadding(WindowInsets.ime.union(WindowInsets.navigationBars))`, so the whole stack rides on the keyboard. The content list uses `LazyColumn(reverseLayout = true)` fed in priority order (newest first / Fällig first / Nachhaken first), so item 0 sits at the bottom next to the dock, short lists anchor to the dock and long lists open at the bottom end without a scroll call; the heading is the last item. The eyebrow with "Stand" sits outside the list. `PullToRefreshBox` with a custom indicator (a 1 px yellow line plus the mono text, no Material spinner) wraps the whole content area, so the empty band pulls too. TalkBack reads in visual order (top to bottom); the critic's driver has to accept that the first heading read on Nächste is "Nächste Aktionen".
- **Handedness:** a `CompositionLocal<Hand>`; `TaskRow`, `CaptureField`, `UndoNotice` and `ContextChips` flip their `Arrangement`/`Alignment` with it. Not `LayoutDirection`, so text stays left-aligned. Stored in DataStore.
- **TaskRow:** title + mono meta + trailing `CheckRing` (48 dp, contentDescription `Abhaken: <desc>`, row semantics `<desc>, <status>, ID <8>`). Swipe right via `anchoredDraggable` (armed at max(35 %, 96 dp), haptic at the threshold). On complete: strike 120 ms, collapse 180 ms, then removed from the list (and the semantics tree) at once; with animator scale 0, nothing animates.
- **Sheets:** `ModalBottomSheet` for the row menu and Mehr. Edit mode swaps the tab row for the edit bar inside the same dock.
- **Details:** `CustomTabsIntent.Builder().setInitialActivityHeightPx(0.62 × height)` (Partial Custom Tab), fallback to a full Custom Tab.
- **Glance widget:** `Column` of `Text` rows with a trailing vector ring, the "+" as a vector button in the bottom row. Glance cannot load custom fonts, so the system font is used there.
- **Tile and overlay:** unchanged architecture (`tile.CaptureTileService`, `CaptureActivity`/`CaptureDialog` as plain Views). Only the layout changes: notice row above the field, colours from `RunwayColors`.
- **Share card:** plain View, same as today, restyled.
- **Data and outbox:** unchanged. Every write still goes through the Room outbox with the 6 s hold.

## Performance

- **Tile → keyboard up:** budget warm ≤ 700 ms, cold ≤ 1200 ms (task brief: 700-1500 ms). The overlay stays plain Views with no Compose, no image and no shader. Space Grotesk is loaded with `ResourcesCompat.getFont` on a background thread after the field is shown; the first frame uses the system font if the font is not ready (a 1-frame swap, measured on Pixel 9 before shipping; if it flickers, the overlay stays on the system font).
- **App icon → Inbox with field focused:** ≤ 800 / 1500 ms. The first frame renders from the Room cache with `Stand hh:mm`; the refresh runs after. Baseline profile for `MainActivity`, `DockScaffold`, `TaskRow`.
- **Capture → "In Inbox ✓":** ≤ 300 ms (local outbox write only).
- **Check-off → row gone:** 300 ms (strike + collapse), well under the 1 s contract.
- **Idle cost:** zero. No animation runs without a state change; no canvas, no AGSL.
- **Never:** spinners, blocking loaders, offline error texts.

## Accessibility

- Every control ≥ 48 dp with a content description, the send button included (46 dp in round 1, now 48 dp). Chips are 34 dp visible in a 48 dp target.
- TalkBack order follows the screen: head, list, then the dock (chips, tabs, field). Row semantics and `Abhaken: …` strings exactly as pinned.
- 150 % text: the heading and the eyebrow cap at 115 %, chips wrap into two rows, tab counts drop (the words stay whole; "Warten auf" gets the 1.3 weight). With the keyboard up the tab row also steps aside, so all 5 inbox rows of the demo stay fully visible, three of them on two lines (measured in board frame 06; with tabs left in, only about 4 were). Round 1 claimed ≥ 6 rows here; that was wrong.
- Contrast (light): mute text 62 % ink on paper ≈ 6:1, overdue `#A45150` on paper ≈ 5:1 and measurably red, ink on coral 7:1. Dark: paper on Ink; overdue is a deeper red `#F05252` on Ink ≈ 4.9:1 (hue 0°, coral is 6° and lighter), so "late" no longer reads like the coral send button and tick-off fill; Nachhaken uses a light plum tint `#AE94DC` instead of the grey-violet accent.
- Reduced motion (animator duration scale 0): nothing animates; notices and rows change in place.
- Left-hand mode for the trailing ring, send button, Rückgängig and chips.
- Colour is never the only signal: overdue also has the edge rule and the word, Nachhaken the word.

## Contract changes (need Uli's approval)

1. **Tabs at the bottom**, inside the dock, above the field. Labels unchanged ("Inbox", "Nächste", "Warten auf", "Mehr"). With the keyboard up the field stays directly above the keyboard and the tabs sit above the field. Needs P04 §1 / P08 §1 review by the critic (the common foundation pins top tabs unless Uli approves a bottom nav).
2. **Check ring at the trailing edge** (leading in left-hand mode). No string change. The web keeps the leading ring, so the two clients differ here. Swipe right (already pinned) stays available on every row.
3. **Inbox row menu as a bottom sheet** instead of a dropdown at the row edge. Same labels, still one tap, no long press.
4. **Mehr as a bottom sheet** with one new item "Daumen" (links · rechts). Pinned items unchanged.
5. **Widget "+" moves from the header to the bottom right.** Content description "+ Todo" unchanged; header text unchanged.
6. **Details as a Partial Custom Tab** (62 % height). Still a Custom Tab on a web route with the uuid; the critic's driver must accept the partial variant.
7. **Optional: remember the last context chip** across process restarts (today it resets to "Alle"). Saves one tap on T3.
8. **Reach order on Nächste (P08 §1, "heading exactly Fällig at the top"):** "Fällig" becomes the **last** section, directly above the context chips, with the most overdue row lowest; "Nächste Aktionen" sits above it. The heading text stays exactly "Fällig", it stays unfiltered and is visible without scrolling when the tab opens (the list opens at its bottom end). P08 §1 has to change from "at the top" to "next to the chips, visible on open".
9. **Reach order in the Inbox and Warten auf:** the Inbox shows the newest capture at the bottom, right above the field (inventory 3.2 pins "newest first"; the data order is unchanged, only the drawing direction flips). Warten auf shows the follow-ups at the bottom. P10 (a "Nachhaken" mark on due rows only) is unaffected.
10. **The capture field on every tab:** "Neues Todo" sits in the dock on Nächste and Warten auf too, not focused, keyboard down (inventory: "No keyboard on this tab" still holds). Captures from there go to the Inbox with "In Inbox ✓". P08/P10 checks look for chips, headings and marks, which the unfocused field does not hide; the driver has to make sure the field's contentDescription "Neues Todo" is not taken as the Inbox tab being open.
11. **Undo notice in the dock column** instead of floating over the list. Same strings and 6 s hold; only its position changes.

The tile overlay keeps to the contract (field, notice, "Rückgängig", "Schließen"): round 1 had an extra coral send button there, which is gone.

## Effort (Android, person-days)

| Item | pd |
|---|---:|
| Theme from tokens (generator reuse, Kotlin + Views colours, fonts) | 1.5 |
| DockScaffold (IME insets, stack, handedness, bottom anchoring) | 3 |
| TaskRow (trailing ring, swipe, collapse, semantics) | 2.5 |
| Inbox, Nächste, Warten auf (head, sections, states, outbox line) | 3 |
| Sheets (row menu, Mehr, edit mode) | 2 |
| UndoNotice | 1 |
| Partial Custom Tab | 0.5 |
| Glance widget restyle and "+" move | 2 |
| Tile overlay and share card restyle (Views) | 2 |
| Launcher icon with the brand mark | 0.5 |
| Acceptance drivers and contracts with the critic (11 changes to negotiate) | 4 |
| Pull to refresh with the custom indicator, banners in the dock, setup restyle | 1.5 |
| QA: 150 %, dark, reduced motion, baseline profile, budgets; left-hand mode doubles the layout matrix (rows, notice, chips, widget) | 4 |
| **Total base** | **28.5 (range 27-31)** |
| Option: quick clarify (rules in Kotlin, follow-up day, tests) | +4-5 |

## Open questions for Uli

1. Bottom tabs in the dock: yes? (Contract change 1.)
2. Trailing ring on Android while the web keeps the leading ring: acceptable, or mirror the web too?
3. Reach order (newest capture and overdue rows at the bottom, lists opening at their bottom end): natural, or do you expect to read from the top? The heading now moves down with a short list, so the empty space sits above it.
4. Remember the last context chip across restarts?
5. Is the left-hand mode worth a setting, or do you always hold the phone in the right hand? Dropping it saves about 2 pd.
6. Quick clarify on the phone (the dashed Option frame): keep it out, as decided on 24.10.2026, or lift that non-goal?
7. Partial Custom Tab height for details: 62 % or full?

## Brand deviations

Inherited from 03 and the common foundation, no new ones: ink text on coral; coral-dark as the overdue signal (contract: measurably red) and coral as the tick-off fill; mixed-case mono eyebrows (pinned German strings); German only, no `data-i18n` (Android uses string resources); system font in the Glance widget. New in round 2: two dark-mode status colours outside the kit, `#F05252` for overdue (so it is not the coral of the primary action) and `#AE94DC` as a light plum tint for Nachhaken (the kit's dark accent reads grey); and neutral system greys for the widget's error fallback, which Android draws from `widget_error.xml` and must not depend on the app theme. The plum home-screen wallpaper on the board is only a backdrop for the widget mock.

## Prototype notes

- `window.proto` acts on the first phone: `show(view)`, `filter(context)`, `capture(text)`, `open(id)`, `complete(id)`, `clarify(id)` (opens the Option sheet, returns `ok: false`), `signature()` (toggles the reach overlay), plus `reach()`, `refresh()` (pull to refresh) and `hand('left'|'right')`. `id` may be the numeric id, the uuid or the description.
- Mock data comes from `shared/data/tasks.js`, mapped in `daumen.js` to Android's preset contexts: `@computer` → @computer, `@anrufe` → @business, `@zuhause` and `@unterwegs` → @home, `@buero` → @work. Follow-up days (Android reads `scheduled`) are set in code for three waiting todos (29.10., 31.10., 07.11.).
- The keyboard is drawn only to show its space; its keys type into the field. At phone width the drawn keyboard is hidden, because a real device shows its own.

## Changes after review

Review of 31.10.2026 (scores 5.5-7.5). Each must-fix item and what changed:

1. **Urgency against reach.** Lists are now drawn in reach order (`daumen.js` `render()`): Nächste shows "Nächste Aktionen" first and "Fällig" last, right above the chips, with the most overdue row at the bottom; the Inbox shows the newest capture right above the field; Warten auf shows the follow-ups lowest. Long lists open at their bottom end and stay anchored there. Declared as contract changes 8 and 9. Measured again: the overdue ring on Nächste moved from 634 dp (hard) to 159 and 327 dp (easy); the newest Inbox capture from 591 dp (hard) to 371 dp (easy). The T2 and T5 rows of the table now give the measured numbers (Nächste 4 of 10 rings easy, the four most urgent; Inbox with the keyboard up 1 of 5 easy, with it down 4 of 5). The "easy for the lower 4-5 rows" wording is gone.
2. **Undo notice over the list.** The notice is now a normal line at the top of the dock (`.notice` is no longer absolute). It pushes the list up instead of covering the row nearest the thumb. Contract change 11.
3. **150 % with the keyboard up.** The tab row hides at font scale ≥ 1.3 while the keyboard is up, the eyebrow and summary cap at 115 %, the heading hides. Measured: 5 of 5 inbox rows fully visible, three on two lines. New board frame "Schrift 150 % · Tastatur offen" (row 06). The false "≥ 6 rows" claim is corrected in the Accessibility section.
4. **Pull to refresh.** Specified in "Screens and navigation" (anywhere in the content area including the empty band, no spinner, a 1 px yellow line, "Stand" updates) and implemented in the prototype (drag down on the main phone, or `proto.refresh()`), with a frame in row 07.
5. **Phone width.** The main phone starts with the keyboard state off at ≤ 640 px and switches it with real focus and blur. The yellow ring shows only on `:focus-within` (static board frames with a drawn keyboard get it through a `ff` class). `shots/phone.png` now shows the full heading and no false focus.
6. **Heading cut off from short lists.** The eyebrow with "Stand" stays fixed at the top; heading and summary moved into the bottom-anchored stack, directly above the first row. The empty band now sits above the heading (Warten auf, Nächste @computer, Inbox).
7. **48 dp and the reach model.** `.go` is 48 dp (the field grew to 58 dp). `reach()` now has an inner dead zone: under 120 dp from the pivot counts as stretch (thumb curl). All README numbers were measured again with it; send (62 dp), "Mehr" (64 dp) and "@business" (113 dp) now count as stretch, which the README says.
8. **Dropped inventory surfaces.** Added with their place in the dock model: the setup screen (frame), the tile hint with "OK" (frame), the banners "neu einrichten" and "Altes Konto: N nicht gesendet" + "Verwerfen" with the in-place question (all in the dock, so no reach exception is needed), the row status "wartet auf Setup", and the widget states badge "N nicht gesendet", "lädt …", "runway einrichten" and the fallback "Widget neu laden" (frame).

Nice-to-have items:

- Taken: the field on every tab is declared (contract change 10, with what P08/P10 drivers must accept); the tile overlay lost its send button (the keyboard's action key sends); dark overdue is a deeper red `#F05252`, distinct from the coral action; the Nachhaken edge and mark use a light plum tint `#AE94DC` in dark; tab counts are 12 px tabular mono at 100 % (still hidden at 150 %); the widget frame shows a vertical resize to 7 rows with "+8 weitere"; effort raised to 28.5 pd (range 27-31) with the left-hand matrix and the 11 contract changes budgeted; T1 share and T3 widget give ranges and state what the cold start includes.
- Not taken: moving the ring to the leading edge to match 06-kombination. The trailing ring is this proposal's core reach argument (the leading ring is stretch for a right thumb on every row); swipe right stays available on every row as the shared gesture with the web's leading ring. It remains open question 2.

Remaining weaknesses: with the keyboard up (how the Inbox opens) four of five inbox rings are still stretch or hard, because the keyboard lifts the list into the upper half; the fix is one tap beside the field, which costs a tap for T5. Reach ordering reads from the bottom, which may feel unfamiliar on long lists, and TalkBack reads "Nächste Aktionen" before "Fällig". The bottom-right curl zone (send, "Mehr", "@business") is now honestly stretch. Eleven contract changes are still a lot for a base proposal.
