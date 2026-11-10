# m2 · Jetzt — runway on Android

**Idea in one sentence:** the app opens on one calm screen, *Jetzt*, that answers "what do I do now" (Fällig plus the top three next actions in the remembered context) above an already focused capture field; the answer is bottom-anchored right above the tab row and the field, so the rings sit in the thumb zone.

Sibling of the chosen web design `06-kombination` (base `03-papier-und-tinte`): same row anatomy, mono eyebrows with `//`, hairlines, one Fraunces accent word, coral only for the primary action and the overdue signal. No 3D, no shaders, no canvas.

- Board: [index.html](index.html) (open via `python3 -m http.server` from the design folder, see `../../shared/README.md`)
- Shots: [shots/board.png](shots/board.png), [shots/board-dark.png](shots/board-dark.png), [shots/phone.png](shots/phone.png)
- Code: `jetzt.js` (rules + one renderer for every frame + `window.proto`), `jetzt.css`

## Why it is efficient

Seconds are estimates for a Pixel 9 in daily use, excluding typing.

| Task | Path | Taps | Seconds |
|---|---|---:|---:|
| T1 capture a thought | App icon: Jetzt opens with the field focused and the keyboard up, type, Enter | 1 (icon) + Enter | ~2 |
| | QS tile "+ Todo": field only, keyboard up | 1 + Enter | ~2 (tile budget 700/1200 ms) |
| | Widget "+" | 1 + Enter | ~2 |
| | Share sheet → runway → "In Inbox" | 3 (2 system + 1) | ~3 |
| | Already inside the app, any tab | 0-1 (field is always in the band) | ~1 |
| T2 tick off / undo | Ring or swipe right on Jetzt, Nächste, Inbox; ring in the widget; "Rückgängig" in the notice (6 s) | 1 / 1 | ~1 / ~1 |
| T3 what now, in a context | Open the app: Fällig + top 3 in the remembered context are on screen | 0 (+2 on Jetzt: context chip, then the context; +1 on Nächste) | < 1 at 100 % font; ~2 at 150 % (third action needs a short scroll with the keyboard up) |
| T4 what am I waiting for | Count and yellow "Nachhaken" dot are on the Jetzt tab row; full list = tab "Warten auf" | 0 for the count / 1 for the list | ~1 |
| T5 handle the Inbox | Tab "Inbox" (1), then per item: tick 1, edit 2 (row → Bearbeiten), delete 2 (row → Löschen). Clarify stays on the web (scope) | 1 + 1-2 per item | ~3 per item |

What makes it fast:

- **No decision on open.** Jetzt is the only start screen, and it never asks anything. The context is remembered (per device, prefs); the "Fällig" block is never filtered, so nothing urgent hides behind a context.
- **No duplicates.** A due next action is shown once, in Fällig; "Als Nächstes" starts after it. The three slots are always three different things to do.
- **Thumb zone.** Jetzt is bottom-anchored (`verticalArrangement = Arrangement.Bottom`): Fällig and the three next actions sit directly above the tab row and the field, the free space goes to the top. With the keyboard closed (phone.png, frame 05) the three rings sit at y ≈ 550-680 dp of 915, the Fällig ring at ≈ 420 dp. The top line only carries "Stand hh:mm" and "Mehr" (rarely used). Exception: with the keyboard up, the whole stack moves up with the IME (next-action rings at ≈ 290-415 dp, Fällig ring ≈ 160 dp, frame 01); that is the IME, not the layout.
- **The band stays small.** On Jetzt the band is only the tab row and the field (≈ 125 dp). The context lives in the heading "Als *Nächstes* [@computer ▾]", away from the field, so the field never reads as "capture into @computer" (PLAN.md:35: no tag selection on a capture surface). The five chips stay in the band on Nächste only, where U11/P08 pin them (1 tap per context).
- **The keyboard does not hide the answer.** With the keyboard up, Jetzt still shows Fällig and all three next actions at font scale 1.0. At 1.5 it shows Fällig and the first two; the third and the "weitere" link scroll (frame 11). The Inbox shows **6 full rows with the "In Inbox ✓" notice, 7 without** (contract: ≥ 5; frame 02 is the with-notice case, which is when the contract checks).
- **Predictable top three.** Order: running first, then the earliest due date, then priority H, then urgency. Each row's mono meta shows the reason ("läuft", "Di 03.11.", "Prio H"), so the selection never looks arbitrary.
- **Cold start.** Jetzt is computed from the cached lists that Android already loads (inbox, next, waiting, due); no new request, no spinner. First frame shows the cache with "Stand hh:mm".

## Screens and navigation

```
             ┌──────────── bottom band (always) ────────────┐
Jetzt  ◀──▶  │ [chips: Alle @home @computer @work @business] │  (Nächste only; Jetzt has the chip in its heading)
Inbox        │ Jetzt · Inbox 5 · Nächste · Warten auf 4 •    │  text tab row, stays while typing
Nächste      │ ( Neues Todo                          ↵ )     │  capture field, focused on open
Warten auf   └───────────────────────────────────────────────┘
```

| Screen | Content | Keyboard on entry |
|---|---|---|
| Jetzt (start) | top line `// jetzt · Sa 31.10. · Stand 09:41  ⋮`, empty space, then bottom-anchored: `// Fällig · N` (unfiltered, overdue first, red edge) · heading "Als *Nächstes*" + context chip `@computer ▾` (tap: the five contexts unfold inline under the heading, tap one: done) · 3 rows · link "N weitere in @ctx →" | yes (contract "focused on open" moves here) |
| Inbox | Stand line, newest first, outbox status per row, row tap = menu Bearbeiten / Löschen (failed: Erneut senden, Bearbeiten und erneut senden) | yes |
| Nächste | Stand, `Fällig`, `Nächste Aktionen · @ctx · N` (lenient context rule), all rows; row tap = Custom Tab | no |
| Warten auf | Stand, follow-ups due first with "Nachhaken seit …" and coral edge, then "Wiedervorlage …" / "seit …" | no |
| Mehr (⋮ on every top line) | Angemeldet als …, Widget hinzufügen, Protokoll exportieren, Abmelden | — |

Back: from Inbox, Nächste, Warten auf → Jetzt; on Jetzt → leave. First Back / tap outside closes the keyboard and keeps the draft.

Pinned behaviour that stays (frames 14, 15): swipe right across a row checks off (coral underlay "Abhaken", threshold 96 dp, same undo as the ring; a mostly vertical drag never checks off; the interactive phone implements it); pull-to-refresh on every list updates "Stand"; the banners "… neu einrichten" and "Altes Konto: N nicht gesendet" + "Verwerfen" sit as hairline bands with a yellow dot directly under the top line, on every tab.

Notices: "In Inbox ✓" + "Rückgängig", "Erledigt" + "Rückgängig" (exactly that, never the row text, so a driver that checks the row left the tree does not find the description again), "Gelöscht". The notice floats over the end of the list. Measured overlap on Jetzt (frame 05): it covers the "weitere" link and the lower ≈ 12 dp of the third action's meta line for the 6 s hold; the third ring stays free.

Surfaces outside the app (board frames 07-09):

- **Widget "runway Jetzt"** (4×3, Glance, text + one vector mark): header "Inbox N · fällig M", context chip (cycles Alle → @home → @computer → @work → @business), "+" (content description "+ Todo"). Rows: Fällig first, then the next actions of the chip context, 48 dp each, ring = check off with undo. Bottom: "+K weitere" (hidden at 0) and "Stand hh:mm".
- **Tile "+ Todo"**: the plain-View overlay with only the field, notice "In Inbox ✓ · Rückgängig" and "Schließen", nothing else (no hint line). Enter saves and keeps the field open.
- **Share target "runway"**: bottom card, title from the subject, link as note (3 lines mono), one full-width pill "In Inbox", no keyboard.

Optional, **not in the base** (frame 12, labelled "Option · braucht Ulis Entscheidung"): "Kurz klären" sheet from an Inbox row: Nächste in @home / @computer / @work / @business (context is never guessed), Warten auf, Irgendwann, Erledigt, Löschen; "Projekt, Datum, Notiz: im Web klären →". 2 taps per item. Needs the PLAN.md non-goal "Klären … in der App" lifted.

## How the Agentic Reach theme shows without 3D

- **Ground and ink:** `--ar-bg` paper, `--ar-ink` text, hairline rules instead of cards; dark mode = Ink ground, off-white text (never pure black/white).
- **Coral = the action:** the send pill, the "läuft" dot, the overdue edge/ring, "Rückgängig" in the notice, the `//` mark. Ink text on coral (7:1).
- **Plum:** the single Fraunces italic accent word ("Als *Nächstes*", empty states "*Frei.*", "*Gut so.*"), the widget's home-screen backdrop. The drawn keyboard stays neutral: Gboard is not themeable by the app.
- **Yellow only as dot / ring / line:** 1 px undo time line, the dot next to "Warten auf" when a follow-up is due, the ring next to a stale "Stand" when offline.
- **Type:** Space Grotesk for UI, JetBrains Mono for eyebrows, meta and chips, Fraunces italic for one word.
- **Mark:** launcher icon, widget header (vector), share target icon. Never redrawn.
- **Motion:** two state-explaining movements only: a promoted next action slides up 8 dp in 160 ms after a tick; the undo line runs for the 6 s hold. Both are off with reduced motion (the line then stands still).

## Compose build plan

| Part | Plan |
|---|---|
| Theme | `RunwayTokens.kt` generated from the shared `tokens.json` (common foundation): brand primitives + semantic roles (bg, sheet, text, mute, line, overdueText = coral 62 % + ink, plumAccent light/dark). `MaterialTheme` with dynamic colour **off**; fonts in `res/font` (Space Grotesk 400/500, JetBrains Mono 400, Fraunces 300 italic). |
| Rules | Kotlin port of the shared rules module + one new pure function `jetzt(cache, ctx): JetztModel(due, top3, rest, inboxCount, waitingCount, followUpsDue)`. Tested against the shared JSON vectors. |
| Components | `BottomBand` (ContextChips + TextTabRow + CaptureField; `imePadding`), `TaskRow` (existing, restyled: 48 dp ring, mono meta, 4 dp overdue edge, swipe right = check off), `SectionEyebrow`, `AccentHeading`, `UndoNotice` (with 1 dp yellow `LinearProgress`-free line drawn in `drawBehind`), `StandLine`, `JetztScreen`. `AnimatedVisibility`/`animateItem` with 160 ms only for the promoted row; `LocalReducedMotion` gate. |
| Navigation | One `MainActivity`, a `rememberSaveable` tab state (no Navigation library needed): Jetzt, Inbox, Nächste, Warten auf. Predictive back to Jetzt. |
| Widget | Glance: same `jetzt()` with the widget's own chip; `Text` + the mark as `ImageProvider(R.drawable.mark)` (a vector drawable, set via `setImageViewResource`, 0 bitmap bytes); if `views_bitmap_memory` is measured above 0 on device, the header drops the mark (text only, as today); colours from `RunwayTokens` (`ColorProvider(day, night)`); system font fallback accepted. Receiver label "runway Jetzt". |
| Tile + overlay | Unchanged architecture (`tile.CaptureTileService`, plain Views in `OverlayViews.kt`); only colours, radii and the pill send button restyled; system font in the overlay if bundled fonts cost > 30 ms cold. |
| Share | `ShareViews.kt` restyle: paper card, mono note preview, coral pill "In Inbox". |
| Outbox | Unchanged. Jetzt reads the same display rule (S9), so a ticked task never comes back on refresh. |

## Performance

- Tile → keyboard: unchanged plain-View path, budget 700 ms warm / 1200 ms cold (done-bar), nothing added. Target ≤ 1000 ms cold even with the brand font (font loaded lazily after first frame if needed).
- Icon → Jetzt with keyboard: ≤ 800 / 1500 ms. Jetzt draws from the Room cache in the first frame; the refresh only updates "Stand".
- No images in the app except the vector mark; no shader; no frames rendered while idle.
- Tick → row gone from the tree: immediate (< 16 ms); the 160 ms slide applies to the *next* row only.

## Accessibility

- Every control ≥ 48 dp (chips 32 dp visual in a 48 dp target; ring 22 dp in 48 dp).
- Row semantics unchanged: `<description>, <status>, ID <8>`; check-off `Abhaken: <description>` in every row and widget row. Jetzt rows use the Nächste status vocabulary (`überfällig` / `fällig heute` / `Nächste`).
- Font scale 1.5 (frames 11, 13): body text grows the full 50 %. Band controls grow at half the step (tabs and chips ×1.25, chips capped at ×1.15 with tighter padding), so four tabs (count after the label, never on a second line) and five chips each stay on one line; this is declared, and mirrors Android 14's non-linear scaling for large text. Section eyebrows wrap as inline text. On Jetzt at 1.5 the row meta keeps only the reason (überfällig, läuft, date, Prio H), not project and context; Fällig and two next actions are visible with the keyboard up, the rest scrolls under a solid band.
- Focus: chips, tabs, rings, menu items, the context chip, Rückgängig and the send pill get a 2 dp ink ring with a coral offset on keyboard focus (`:focus-visible` on the board; `Modifier.focusable` + `border` in Compose).
- Overdue vs. "fällig heute": overdue = coral ring, coral 4 dp edge, coral-ink text; "fällig heute" = dashed ring at 22 % coral, plain text, no edge. Both still need the pinned pixel hue test on device, light and dark.
- Contrast: body ink on paper 16:1; mute meta (62 %) ≈ 5.4:1; overdue text (coral 62 % + ink) ≈ 4.7:1 on paper; coral on the ink notice ≈ 7:1; dark variants checked visually on board-dark.png.
- Reduced motion: both movements off. Colour is never the only signal (overdue also says "überfällig", follow-up says "Nachhaken …").

## Contract changes (need Uli's approval)

1. **Start screen:** the app opens on **Jetzt** instead of Inbox. The rule "field focused and keyboard shown on every open" moves to Jetzt unchanged; Inbox keeps its keyboard on entry. Back from Inbox now goes to Jetzt (P04/P08 drivers that expect Inbox as start need updating).
2. **Fourth tab "Jetzt"**, and the tab row moves from the top to the bottom band (above the field). Labels `Inbox`, `Nächste`, `Warten auf` keep their exact text; counts are separate text nodes. "Mehr" moves from the tab row to the top line of every tab (same content description).
3. **Jetzt shows a "Fällig" heading** in addition to Nächste; Nächste keeps `Fällig` at the top and `Nächste Aktionen` below.
4. **Dedupe** (behaviour, not a pinned string): a due next action appears only under Fällig, not again under Nächste Aktionen.
5. **Context remembered across process death** (prefs) instead of resetting to "Alle". Jetzt and Nächste share one selection. On Jetzt the context is a chip in the heading that unfolds the five contexts (2 taps); on Nächste the five chips stay in the band (U11 "each context with 1 tap" and P08 "all five visible" still hold there).
6. **Widget** shows "Jetzt" (Fällig + next of the chip context) and hides "+K weitere" when K = 0; receiver label becomes "runway Jetzt"; one vector mark in the header.
7. **Colours:** brand tokens replace Material dynamic colour; overdue is coral-based (hue ≈ 2-6°, must pass the P-test "measurably red" in light and dark; to be measured on device).
8. **done-bar.md budget line U2 "App-Icon: 1 Tap öffnet die Inbox"** changes to "→ Jetzt" (same 800/1500 ms budget, field focused, keyboard up). done-bar.md is frozen by SHA-256; only Uli can re-freeze it.
9. **Font scaling in the band:** tabs and chips grow at half the font-scale step (see Accessibility). If the drivers or Uli require full scaling, the tab row needs two lines at 150 %.

## Effort (person-days, Android only, on top of the shared token/rules foundation)

| Item | pd |
|---|---:|
| Theme from tokens, fonts, restyle of TaskRow, notice, banners | 4 |
| Jetzt model + screen + tests | 3 |
| Bottom band (chips, tab row, field, IME handling, 150 % folding) | 3 |
| Navigation change (4 tabs, back, Mehr move) | 1 |
| Widget "Jetzt" in Glance | 2 |
| Tile overlay + share card restyle | 1.5 |
| Swipe/pull, banners, context chip in the Jetzt heading | 1 |
| Acceptance driver updates with the critic (P04, P05 icon budget, P08, P09 break on the new start screen, 4th tab and bottom tab row), Uli's re-freeze of done-bar.md, device measurements (budgets, red hue, 150 %) | 5.5 |
| Contingency 20 % | 4.5 |
| **Total** | **≈ 25** (range 24-26) |

The optional "Kurz klären" sheet would add ≈ 4 pd (sheet, tags_add/remove moves with exact inverse undo, outbox kind `move`).

## Known weaknesses

- With the keyboard up on open, Jetzt is not as "calm" as it could be: the keyboard takes 40 % of the screen. The alternative (keyboard closed, field one tap away) is calmer but adds a tap to T1, which PLAN.md calls a defect.
- "Top three" depends on a ranking (running, priority H, urgency). If Uli's urgency scores are noisy, the three may feel arbitrary; the Orbit Jetzt/Bald/Später rule from the round-1 grafts could replace it.
- A fourth tab and a bottom tab row break several pinned acceptance assumptions; driver updates are real work.
- The undo notice floats over the end of the list; on Jetzt it covers the "weitere" link and ≈ 12 dp of the third action's meta for 6 s (measured, frame 05). Jetzt gets no extra padding during the notice, because padding would shift the bottom-anchored stack under the thumb right after a tap.
- A capture on Jetzt never shows the new item: Jetzt shows only the notice "In Inbox ✓" and the Inbox count going up by one. Seeing the item needs the Inbox tab (1 tap).
- Changing the context on Jetzt takes 2 taps (chip, then context) instead of 1; on Nächste it stays 1.
- At 150 % font with the keyboard up, the third next action needs a short scroll.
- With the keyboard up, the IME pushes the bottom-anchored stack to the upper half; only with the keyboard closed are the rings in the lower half.
- The board's demo data adds one follow-up day ("Rückmeldung Vermieter zur Kaution", scheduled 30.10.) to show the Nachhaken state; contexts are mapped @anrufe → @business, @zuhause/@unterwegs → @home, @buero → @work.

## Open questions

1. Jetzt with keyboard on open (T1 = 0 extra taps) or without (calmer)? A setting is possible but adds a decision.
2. Should the remembered context follow time and place (e.g. weekdays 8-18 → @work)? Proposed: no guessing, just remember the last choice.
3. Bottom tab row plus a fourth tab "Jetzt": acceptable change to the pinned layout?
4. Widget shows Jetzt rather than the Nächste list: OK?
5. Lift the clarify non-goal for the optional "Kurz klären" sheet, or keep clarifying on the web?

## window.proto

Acts on the first (interactive) phone: `show('jetzt'|'inbox'|'next'|'waiting')` (`projects`/`someday` open the web as a Custom Tab), `filter('@computer'|null)` (demo contexts are mapped), `capture(text)`, `open(id)` (Custom Tab), `complete(id)` (6 s hold + undo), `clarify(id, to)` (applies the move as the web would; not reachable from the phone UI), `signature()` (ticks the first "Als Nächstes" item: the next one moves up and the undo line runs).

## Changes after review

Must-fix items from the critic, all addressed:

1. **Check-off notice** now says exactly "Erledigt" + "Rückgängig" (`jetzt.js` `m.tick` and frame 05); no description, nothing ellipsized.
2. **Mehr menu** now holds "Widget hinzufügen", "Protokoll exportieren", "Abmelden"; "Angemeldet als uli" stays non-interactive text.
3. **Tile overlay** hint line removed: field, notice, Rückgängig, Schließen only.
4. **Bottom-anchored Jetzt** (`.body.v-jetzt` flex column, `.jstack { margin-top: auto }`): Fällig and the three rings sit right above the band; frames 01, 05, 10 and phone.png reshot. The thumb-zone claim is restated with measured positions and the IME exception.
5. **Context moved into the heading** on Jetzt ("Als *Nächstes*" + `@computer ▾` chip that unfolds the five contexts inline); the chip row is gone from the Jetzt band, so nothing context-like sits above the capture field. Nächste keeps the band chips (U11/P08).
6. **150 % layout:** the folded chip and its overlap are gone (no chips in the Jetzt band, solid band background); `.sec` eyebrows wrap as inline text; tab counts sit after the labels on one line (band controls at half the scale step, chips capped); Jetzt rows at 150 % keep only the reason meta. New frame 13 shows Nächste at 150 %.
7. **README accuracy:** Inbox "6 with the notice, 7 without"; the notice overlap on Jetzt is measured and declared; Known weaknesses lists that a capture on Jetzt never shows the new item.
8. **Effort** restated at ≈ 25 pd (24-26) with 5.5 pd for driver updates, Uli's re-freeze and device measurements; the done-bar U2 line "App-Icon → Inbox" → "→ Jetzt" is its own contract change (8).

Nice-to-have items taken: neutral Enter key on the drawn keyboard; drawn keyboard hidden on real touch phones (`(max-width: 560px) and (pointer: coarse)`), so no double keyboard; `:focus-visible` rings; swipe right to check off (implemented in the interactive phone) and pull-to-refresh (frame 15); "fällig heute" ring made clearly less red (dashed, 22 % coral); banners frame 14; predictable top-3 tie-break with the reason in the meta (Prio H added); widget mark as vector `ImageProvider` with a no-mark fallback.

Not changed: the 6 s hold (U12 asks for ≥ 5 s Rückgängig and completion within 6-15 s; 6 s fits). The board's data has no task due exactly today, so the new "fällig heute" style is specified but not visible in a frame.

