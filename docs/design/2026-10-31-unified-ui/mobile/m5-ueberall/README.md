# M5 Überall

Mobile proposal 5 of 5 for the runway Android app, as a sibling of the web direction 06-kombination (base: 03 Papier & Tinte). No 3D and no Three.js.

**Idea in one sentence:** the app is the surface Uli opens least, so capture and glance move to where the phone already is (one home-screen widget with a capture bar, the Quick Settings tile over the lock screen, an optional quiet "Nächste" notification with direct reply, launcher shortcuts and the share sheet), held together as one family by the same words, order and flows, while the app itself becomes a lean list with every control in thumb reach.

**What can carry the brand, and what cannot.** Only the surfaces runway draws itself are branded: the app, the Glance widget, the capture overlay of the tile and the share sheet. The Quick Settings tile, the notification shade, notifications and the launcher's shortcut popup are drawn by Android from system templates in system colours. On those runway supplies text, a monochrome small icon and, through `setColor()`, the tint of the small-icon circle. Nothing more. The board draws them that way.

- Board: [index.html](index.html) (serve the design folder, then open `/mobile/m5-ueberall/`)
- Shots: [shots/board.png](shots/board.png), [shots/board-dark.png](shots/board-dark.png), [shots/phone.png](shots/phone.png)
- Files: `tokens.css` (semantic tokens, same names and values as 03's tokens.json, plus `--sys-*` stand-ins for the system's own colours on system UI), `model.js` (data derived from `shared/data/tasks.js`, Android contexts), `app.js` (one render function per surface, all from one state, plus `window.proto`), `m5.css`

## Why it is efficient

The best way to save time in a capture tool is to skip the app. Every frequent task has a surface that does it in two or three taps from where the thumb already is, and the app keeps the pinned capture-first behaviour for everything else.

Seconds are estimated overhead on a Pixel 9, warm, one-handed, without typing time: tap 0.35 s, swipe (shade) 0.45 s, long press 0.5 s, capture overlay 0.7 s (the warm budget; 1.2 s cold), app start to focused field 0.8 s, screen on and fingerprint unlock 0.9 s (counted as one tap). A cold start adds up to 0.5 s. Two columns: **unlocked** (already on the home screen or in an app) and **from pocket, locked** (screen off, phone locked).

| Task | Fastest path | Taps | Seconds, unlocked | From pocket, locked (taps / s) | Other paths (taps / s, unlocked) |
|---|---|---:|---:|---|---|
| T1 capture a thought | Übersicht widget: tap the capture bar, type, Enter (0.35 + 0.7 + 0.35) | 2 | 1.4 | 3 / 2.3 via the widget · tile: screen on + swipe + 2 / 2.2 | app icon (field focused) 2 / 1.5 · share: "Teilen" in the source app + "runway" + "In Inbox" 3 / 1.6 · tile: swipe + 2 / 1.9 · notification: swipe + expand + "+ Todo" + send, swipe + 3 / 2.0 (only while unlocked, and only if the notification is on and not dismissed) · shortcut "Neues Todo": long press + 2 / 2.0 |
| T2 tick off / undo | ring in the widget or in the app | 1 + 1 | 0.4 + 0.4 | 2 / 1.3 | swipe right in the app · "Abhaken" in the notification: swipe + expand + Abhaken, swipe + 2 / 1.2 · undo in the notice or the widget footer, 6 s |
| T3 what to do now in a context | Übersicht widget, the chip stays set: a glance, but only while you are on the home screen | 0 | 0.5 | 1 / 1.4 | notification: swipe + expand, swipe + 1 / 1.1 · app: icon + Nächste, chip remembered 2 / 1.6 · change context: +1 tap on the chip |
| T4 what I wait for | "Warten auf" shortcut pinned as its own icon | 1 | 1.2 | 2 / 2.1 | icon + tab 2 / 1.5 · long press + "Warten auf" 2 / 1.7 |
| T5 handle the Inbox | icon opens the Inbox; per row the ring, or the row menu | 1 + 1 per row | 1.2 + 0.4 | 2 / 2.1 + 0.4 | delete 2 taps · edit 2 + typing + Enter · clarify stays on the web (optional quick clarify: 2 taps per row) |

Two honest limits. The "Nächste" notification is `IMPORTANCE_LOW`, so Android puts it collapsed into the **Silent** ("Lautlos") section, often below other notifications: every path through it needs the expand tap counted above. And since Android 14, ongoing notifications can be dismissed by the user (only foreground-service and a few system notifications cannot), so it is not reliably always there; it is a convenience, never the path the proposal depends on. The widget is the path it depends on.

## Screens and navigation

**Around the app (one family)**

| Surface | Drawn by | What it shows | Actions |
|---|---|---|---|
| Widget "runway Übersicht" 4×3 | runway (Glance, branded) | top: the capture bar, a pill "Neues Todo" with the coral `+` (content description `+ Todo`); header exactly `Inbox N · fällig M`; context chip; rows with the 18 dp ring, overdue edge rule, "überfällig" or "heute"; footer `+K weitere` / `Stand hh:mm` / `lädt …` / `Erledigt · Rückgängig` / `N nicht gesendet`; system fallback `Widget neu laden` | bar = capture overlay with the keyboard up; header = reload, the app stays closed; chip = next context; ring = tick off with undo |
| Launcher shortcuts | launcher (system) | `Neues Todo`, `Inbox`, new `Nächste`, `Warten auf`, each with only its own vector icon, a short and a long label. No subtitles, no counts | each can be pinned as its own home-screen icon |
| Quick Settings tile `+ Todo` | system | system tile: icon, label `+ Todo`, subtitle `runway`, system colours, `STATE_INACTIVE` | opens the branded capture overlay; over the keyguard the overlay shows only the field, the notice, `Rückgängig` and `Schließen` |
| Notification "Nächste" (optional, off by default) | system template | collapsed under "Lautlos": `runway · Nächste @computer`, the first row as title, `+2 weitere`. Expanded: the first row as title (overdue as text "überfällig"), two more rows as lines, standard action row. Lock screen public version: `runway`, "Inhalt ausgeblendet" (system text) | `+ Todo` (RemoteInput, system reply field, no app start), `Abhaken` (acts on the title row), `Öffnen` |
| Share target `runway` | runway (branded sheet) | bottom card: `// Teilen · in die Inbox`, title, link as note preview, pill `In Inbox` | one tap, no keyboard, works offline |

**The app (lean list).** Three tabs `Inbox · Nächste · Warten auf`, but at the bottom. From the bottom up: the field `Neues Todo` (directly above the keyboard when it is up), the tab row, then on Nächste the context chips `Alle @home @computer @work @business`. At the top there is only the eyebrow `// Inbox · Stand 09:41` and `Mehr` (···), plus one title with a Fraunces word on Nächste and Warten auf ("Was *jetzt* geht", "Liegt bei *anderen*"), hidden while the keyboard is up. With the keyboard up the Inbox shows seven 56 dp rows (five at 150 % text). Nächste: `Fällig` at the top, unfiltered, then `Nächste Aktionen` filtered by the lenient rule; a due task appears once only. Warten auf: `Nachhaken fällig` first with the yellow ring, then "Wiedervorlage" and "seit". Rows open the menu (Inbox) or the web details in a Custom Tab (Nächste, Warten auf). Back from Nächste or Warten auf goes to Inbox.

The undo notice sits in the bottom stack and pushes the list up instead of covering the last row. The title collapses when the list scrolls and at 150 % text. `↑ Neue Todos oben` appears above the tabs, at the thumb, when new rows arrive while you read lower down. Pull-to-refresh works on every list (the Material 3 indicator only while pulling; `Stand` stays the freshness signal). Banners sit between the title and the list: `Key abgelehnt – neu einrichten` (tap = setup; captures then show `wartet auf Setup`), `Verbunden als <user>`, `Altes Konto: N nicht gesendet` + `Verwerfen`. After setup the one-time hint `Zieh die Kachel + Todo in die erste Reihe …` with `OK`.

Swipe right to tick off and the system back gesture: the list has a 20 dp side margin and the ring starts at 8 dp, so a swipe that starts in the system's edge zone (about the outer 20-24 dp) goes to back, as Android intends. The row only arms a swipe after 8 dp of horizontal travel that started inside the row. No `systemGestureExclusion` rects are requested, so back always works from the edge.

The field also sits at the bottom of Nächste and Warten auf, unfocused: those tabs still open without a keyboard, but a capture from them is one tap away and lands in the Inbox with `In Inbox ✓`.

**Offline.** `Stand hh:mm` keeps the last good time; rows say `wartet auf Netz` or `Nicht gesendet · antippen` (menu `Erneut senden`, `Bearbeiten und erneut senden`, `Löschen`); the widget footer says `N nicht gesendet`. No error text, no spinner.

**Option, needs Uli's decision (not in the base):** quick clarify from the Inbox row menu: a sheet with the four context chips (choosing one means Nächste with that context, so no context is ever guessed), `Warten auf`, `Irgendwann` and `Im Web klären`. It is shown on the board in a frame with a yellow ring and a label.

## How the Agentic Reach theme shows without 3D

- Warm paper (`#FBF6EE`) as the ground, ink text, hairlines instead of cards; dark mode is the Ink ground with paper text (never pure black or white).
- Coral for the one primary action on each surface (the `+` / `→` capture button, `In Inbox`), the `//` mark and the "läuft" dot. Its other uses are listed under "Brand deviations".
- Yellow only as a dot (active tab, next to an ink pill outline), a ring (Nachhaken fällig, the pinned launcher icon, the signature moment) and the 1 px undo time line.
- Space Grotesk for UI, one Fraunces italic word per title, JetBrains Mono eyebrows with `//` and mono meta lines. Pill buttons, pill field, pill chips, pill tabs.
- The mark (unchanged `mark-color.svg`) as launcher icon; `mark-mono-dark.svg` as the notification's monochrome small icon.
- Motion: the coral strike across a ticked row (160 ms), then the row leaves the tree; the undo line counts down in six discrete steps (a clock, not a motion); "läuft" is a static dot. The signature moment (one capture, every live surface counts it) is a single 200 ms yellow ring on each surface frame. With reduced motion everything is instant. Nothing exceeds 200 ms.
- **Where the brand stops.** System UI is not ours: tile, shade, notification, launcher popup and the lock-screen card are drawn in system colours and the system font (the board uses neutral `--sys-*` stand-ins derived from ink and paper; on the device Material You supplies them). The only app colour there is the `setColor()` tint of the small-icon circle (coral). The family on those surfaces is carried by the words and the order (`+ Todo`, `Nächste`, `Abhaken`, `Inbox N · fällig M`), not by colour. Glance widgets also render in the system font; their brand is colour, ring, pill and `//`-free mono meta.

## Brand deviations

`brand/AGENTS.md` allows deviations only when declared with a reason.

| Deviation | Where | Reason |
|---|---|---|
| Ink text on coral | go button `→`, widget and shortcut `+`, `In Inbox` | Paper on coral is about 2.4:1; ink on coral is about 7:1. |
| Coral (or the darker coral-ink mix) as a status colour | "überfällig" text and the overdue edge rule, `Nicht gesendet`, `N nicht gesendet`, the `Key abgelehnt` edge rule | Rule 3 reserves coral for the primary action, but the Android contract requires overdue rows to be measurably red in light and dark. The brand has no other red; a new red would break rule 1. The text uses the darker mix `#a45150` (5:1) so it reads as status, not as a button. |
| Coral as "done" | the strike through a ticked row, the filled ring while it goes | The tick-off is the primary action of a list row; the stroke is the web base's (03) pen stroke, so phone and web tick off the same way. |
| Coral on `Rückgängig` | in the inverse (ink) notice and in the widget footer | It is the one action of the notice. In light mode it is coral on ink (about 7:1); in dark mode the notice is paper, so it uses the darker coral-ink mix. |
| Mixed-case mono eyebrows | `// Inbox · Stand 09:41` and every section eyebrow | Rule 9 asks for uppercase mono captions on images; these are status lines that carry pinned strings (`Stand hh:mm`, `Fällig`, `Nächste Aktionen`) which the drivers match exactly and which read better in mixed case at 11-12 sp. Frame captions on the board (`RUNWAY ÜBERSICHT · 4×3`) stay uppercase. |
| Plum-light Fraunces accent in dark mode | the italic title word on Ink | Plum `#3D2B5C` on Ink is about 1.4:1, unreadable. The dark accent is plum mixed 45 % into paper, the same derivation the web base uses. |
| System font on RemoteViews and system surfaces | widget, tile, notification, launcher popup | RemoteViews cannot load bundled fonts on the widget and Android draws system UI itself. Rule 5 can only hold inside runway's own Compose and View surfaces. |
| Neutral system colours in the mock | `--sys-*` tokens | They stand in for Android's colours on system UI, not for brand colours. They are derived from ink and paper via `color-mix`, as rule 1 asks for new neutrals. |
| Widget's error fallback in system neutrals | `Widget neu laden` | It is the system layout `widget_error.xml`, shown when our layout fails; it must not depend on our theme. |

## Compose build plan

- **Theme:** `RunwayTokens.kt` generated from the shared tokens.json (the 06-kombination pipeline); `MaterialTheme` with fixed brand colour schemes for light and dark, dynamic colour off. Fonts bundled in `res/font` (Space Grotesk 400/500, Fraunces italic 300, JetBrains Mono 400). Text sizes in sp.
- **Components:** `RwHeader` (eyebrow + Stand + Mehr), `TaskRow` (48 dp ring target with `Abhaken: <desc>`, text max 2 lines with `testTag("inbox-row-text")`, mono meta, merged semantics with the pinned accessibility string, swipe-to-complete with a haptic tick), `SectionRule`, `ContextChips` (FlowRow, wraps, never scrolls), `BottomTabs` (three text tabs; the count is a separate `Text` excluded from the tab's label semantics), `CaptureField`, `UndoNotice` (inverse pill, 6 s hold, stepped line), `RowMenu`, `Banner`.
- **Layout:** `Scaffold` with `bottomBar` = notice + chips + tabs + field, `imePadding()` on the bottom bar so the field sits directly on the keyboard. The title hides with `WindowInsets.isImeVisible`, once the list scrolls (`LazyListState.firstVisibleItemScrollOffset > 0`), and at `fontScale >= 1.5`. Tabs: `Row` with 8 dp spacing, the selected one as an ink-outlined pill plus the yellow dot; at 150 % the count moves under the label. `PullToRefreshBox` on every list.
- **Glance:** one `GlanceAppWidget` (`runway Übersicht` 4×3, vertical resize), text and shape backgrounds only, no bitmaps; capture bar as the first row (a rounded `Box` with `Text` and the coral `+`, `actionStartActivity` to the overlay); `ColorProvider` with brand day/night pairs; actions via `actionRunCallback` into the existing outbox. Touch targets: the chip is a 48×48 dp clickable `Box` around a 32 dp visual pill; the ring cell is 48×48 dp. The coral circle is a rounded `Box` background, not an image. The fallback stays the system `widget_error.xml`.
- **Tile and overlay:** the tile is system-drawn (icon `ic_tile_add`, label `+ Todo`, subtitle `runway`), unchanged. The overlay stays plain Views (`tile.CaptureTileService`, `CaptureActivity`), re-skinned with the same tokens as XML colour resources and the system font fallback if the brand font costs start time.
- **Notification "Nächste":** standard template (`NotificationCompat`, no custom `RemoteViews`, no `DecoratedCustomViewStyle`); title = first row, `InboxStyle` lines for two more, `setColor(coral)` for the small-icon circle only; channel "Nächste (dauerhaft)", `IMPORTANCE_LOW` (so: collapsed under "Lautlos"), ongoing (dismissable by the user since Android 14; on dismiss we do not repost until the next refresh, and never nag), `setOnlyAlertOnce`, `VISIBILITY_PRIVATE` with a public version; `RemoteInput` action "+ Todo" (`setAuthenticationRequired(true)` on the keyguard, so the tile stays the locked path); `Abhaken` action (title text exactly `Abhaken`; it acts on the title row; Android gives actions no separate content description, so the TalkBack text is the title row read before it). Refreshed with the widget (after each sent action, every 30 min). Replies write to the outbox with surface `notification` and update the notification to "In Inbox ✓".
- **Shortcuts:** static `Neues Todo`, `Inbox` (first, unchanged); dynamic `Nächste`, `Warten auf` via `ShortcutManagerCompat`, pinnable. Each has only a vector icon, `shortLabel` and `longLabel`. No live counts: that would need bitmap icons regenerated on every change, which we do not want.
- **Share:** existing `ShareActivity`, re-skinned.

## Performance

- Tile → keyboard up: 700 ms warm / 1200 ms cold, inside the 700-1500 ms budget, because the overlay stays plain Views and loads no Compose, no fonts beyond one preloaded mono face, and no lists.
- Widget capture bar → keyboard: same overlay path as the tile.
- Direct reply from the notification starts no activity at all; only the outbox `BroadcastReceiver` runs.
- App icon → Inbox with keyboard: ≤ 800 ms warm / 1500 ms cold (baseline profile; the list draws from the Room cache before the refresh).
- Widgets and the notification never load images; refresh work is batched in one WorkManager job.

## Accessibility

- Every control ≥ 48 dp with a content description; chips (app and widget) get their 48 dp through the touch target, not the visual size; the widget ring cell is 48 dp wide.
- At 150 % text: the title collapses, tabs keep an 8 dp gap and put the count under the label, chips wrap to a second line (all five visible, as P08 requires), the Inbox keeps five whole rows with the keyboard up and the sixth fades out at the edge (frames "Inbox, 150 %" and "Nächste, 150 %").
- Row accessibility string exactly `<description>, <status>, ID <8>` / `lokal <8>`; the notice `Erledigt` + `Rückgängig` does not repeat it.
- Contrast: mute text 62 % ink on paper is 5.6:1; overdue text 5.0:1; ink on coral 7:1. Dark: paper on ink.
- Bottom controls help one-handed use and also TalkBack: the reading order is list → chips → tabs → field.

## Contract changes (need Uli's approval)

1. **Tabs at the bottom** (labels and order unchanged), above the field; `Mehr` stays at the top right. P08's driver finds the tabs by text, but the layout description of the main screen changes.
2. **Context chips at the bottom of Nächste** (above the tabs). `Fällig` stays the first heading at the top of the list.
3. **The selected chip persists** across process death (today it resets to `Alle`); the widget keeps its own chip, as today.
4. **A due `+next` task shows only under `Fällig`**, not again under `Nächste Aktionen`.
5. **Widget "runway Übersicht" gets a capture bar as its first row** (`Neues Todo` + `+` with content description `+ Todo`, which moves out of the header). Header text, chip, rows, footer and fallback strings unchanged; default rows drop from as many as fit to 4 at 4×3. P09 needs the header layout description updated.
6. **New surfaces, each needing its own acceptance contract:** the optional notification "Nächste" with the labels `+ Todo`, `Abhaken` (plain, acting on the title row, not `Abhaken: <description>`, because notification actions have no separate content description), `Öffnen`, and the public text "Inhalt ausgeblendet"; shortcuts `Nächste` and `Warten auf` (P05).
7. **Widgets in fixed brand colours** instead of GlanceTheme dynamic colour (the luminance rule, > 0.6 light and < 0.35 dark, still holds).
8. **Launcher icon:** the mark on paper instead of the blue plus (and a monochrome themed variant).
9. **`↑ Neue Todos oben` at the bottom of the list** (above the tabs) instead of the top, to stay in thumb reach. Text unchanged.

No pinned string changes in the app.

## Effort (person-days)

| Work | pd |
|---|---:|
| Tokens, theme, fonts, components | 5 |
| Main screen re-layout (bottom tabs and chips, notice in the stack, title collapse, IME and 150 % behaviour, banners, states) | 7 |
| Widget Übersicht: capture bar, re-skin, 48 dp targets, chip persistence | 3 |
| Notification "Nächste" with direct reply, actions, public version, dismiss handling | 4 |
| Shortcuts, launcher icon, share and overlay re-skin | 2 |
| Acceptance contracts for P05, P08, P09 and the notification, test updates | 5 |
| Timing runs (tile, widget, icon, cold and warm) and two critic rounds | 4 |
| **Total** | **30** (with 15 % contingency: 35) |

Quick clarify (option): +4 pd.

## Open questions

1. Bottom tabs and bottom chips: accept the contract change for one-hand reach?
2. The persistent "Nächste" notification: wanted at all (it is opt-in, sits under "Lautlos" and can be swiped away since Android 14), and should task titles ever show on the lock screen? This proposal says no.
3. Should direct reply on the notification work on the keyguard without unlocking (`setAuthenticationRequired(false)`)? Faster, but anyone holding the phone could add Inbox items. This proposal says no; the tile is the locked path.
4. Answered in this round: one widget. The Übersicht widget's first row is the capture bar; the separate 4×1 "runway Erfassen" is dropped (one acceptance contract and about 2 pd fewer, less crowding next to pinned shortcuts).
5. Quick clarify on the phone (option screen): lift the non-goal from PLAN.md, or keep clarifying on the web?
6. Brand font in the tile overlay if it costs more than 50 ms cold, or the system font there?

## Changes after review

Must-fix items:

1. **System surfaces redrawn as Android draws them.** QS tile, shade, notification (collapsed under "Lautlos" and expanded with the standard action row and system reply field), launcher popup and lock-screen card now use system-template styling: neutral system colours (`--sys-*` stand-ins), system font, monochrome small icon in a `setColor()`-tinted circle. The README now says plainly that only the app, the widget, the overlay and the share sheet are branded.
2. **Seconds recounted.** Overlay at the 0.7 s warm budget (widget T1 is now 1.4 s, not 1.0 s); share counts the source app's "Teilen" tap (3 taps, 1.6 s); the notification counts the expand tap (swipe + 3, 2.0 s); T3 at 0 taps is marked "only on the home screen". New column "from pocket, locked" in the README table and on the board, with unlock counted as one tap (0.9 s). The Android 14 dismissability of ongoing notifications is stated.
3. **Widget touch targets.** Chip is a 48×48 dp target around a 32 dp pill; the ring cell is 48 dp wide.
4. **Brand deviations** section added (ink on coral, coral for overdue / not sent / done / Rückgängig, mixed-case mono eyebrows, plum-light accent in dark, system font on RemoteViews and system UI, neutral system stand-ins, system fallback).
5. **Notification action** is now plain `Abhaken`, acting on the first row, which is the notification's title; listed as a contract item with the other new labels.
6. **150 % Nächste.** Title collapses at 150 % (and on scroll everywhere), tabs keep an 8 dp gap and stack the count under the label; a "Nächste, 150 %" frame is on the board.
7. **Pinned states on the board.** Banners `Key abgelehnt – neu einrichten` and `Altes Konto: 2 nicht gesendet` + `Verwerfen`, row status `wartet auf Setup`, `↑ Neue Todos oben`, pull-to-refresh, the setup hint `Zieh die Kachel + Todo in die erste Reihe` with `OK`, and the widget fallback `Widget neu laden` (new "Widget-Zustände" frame). The widget header button now reloads (`lädt …`, then a new `Stand`).
8. **Launcher shortcuts** show only icon and label: no subtitles, no live count; `Neues Todo` and `Inbox` stay first.

Nice-to-have items taken: the signature now shows (a 200 ms yellow ring per live surface, none with reduced motion); the undo notice sits in the bottom stack and pushes the list up instead of covering the last row; the back-gesture handling of swipe-to-tick is described; open question 4 answered (one widget with the capture bar, the 4×1 dropped); the selected tab is an ink-outlined pill plus the dot; widget rows can show "heute" in grey; effort raised to 30 pd (35 with contingency); lists fade out at the bottom edge so a cut row reads as scrolling.

Not taken: none of the listed items was skipped. The board's system shade is drawn in one (dark) system theme in both light and dark board modes, since the real shade follows Material You, not our theme.
