# M10 — the card stack (brief 0057)

Taken 2026-11-10 on the dev harness (real backend, Taskwarrior 3.5.0, **06 demo set**). The backends on :8000 and
:8010 belonged to other sessions and were left alone; this milestone ran its own: the same backend code on :8021 over a
data root and users database in the session's scratchpad, and the Vite dev server on :5191 proxying to it. One user
per run (`m10-shots`, `m10-agent`, `m10-wk`, `m10-phone`, `m10-phone-wk`, `m10-misc`), each seeded with the 06 demo
set shifted from 31.10. to 10.11. as in M9 (five Inbox items, one with a note: "Artikel über Agenten-Evaluation lesen"
¶ "Link aus dem Newsletter"; the API takes no capture time, so all five read "erfasst heute 18:33"; Podcast stays
active, the API refuses the status "someday"). Chrome (installed Google Chrome) and Playwright WebKit, driven by
scratch Playwright scripts with real keys, a real mouse and, on the phone, taps and a CDP touch drag. Desktop
1440×900, narrow 1024×768, phone 412×915 @2x; light and dark. No lens yet (M11), so no reduced-motion shot — reduced
motion was driven instead (below).

Compared with `06-kombination/shots/web-stack.png`, `web-stack-step.png` and `web-phone-stack.png`.

| Shot | What it shows |
|---|---|
| `web-stack-desktop-{light,dark}.png` | Inbox as the stack: "Liste · Stapel" with `s` in the head, the lead, the top card ("// erfasst heute 18:33 · 1 von 5", the text, Projekt `p` · Text ändern `e` · Überspringen `→`), three cards below, "// Was ist es?", the five trays with keys and counts (Nächste 13, Warten auf 4, Irgendwann 3, Erledigt 3), the key hints |
| `web-stack-step-desktop-{light,dark}.png` | `1`: the card held (tools dimmed), the trays turned into the contexts with 06's hints ("@computer · am Rechner" 4, "@anrufe · Telefon" 3, …), Zurück `0`, "1 – 5 wählen · 0 oder Esc zurück"; the focus ring on the first tray |
| `stack-note-desktop-{light,dark}.png` | `→` until the card with a note: "¶ Link aus dem Newsletter" under the text, the card grows by that line only |
| `stack-project-desktop-{light,dark}.png` | `p`: the seven active projects with their next actions (long names on two lines), "Neues Projekt" on `8`, Zurück |
| `stack-newproject-desktop-light.png` | "Neues Projekt": the name field beside Zurück; "Garten" ⏎ is refused ("Dieses Projekt gibt es schon.") |
| `stack-narrow-{light,dark}.png` | 1024 px: the stack in the page column (no docked panel in stack mode) |
| `web-phone-stack-{light,dark}.png` | the phone (stack by default, nothing stored): the toggle under the heading, the card, the trays without keys or counts, "Karte in ein Fach ziehen oder ein Fach antippen", the dock below; the capture field **not** focused (see the fix below) |
| `web-phone-stack-step-{light,dark}.png` | the phone, Nächste tapped: the contexts in three columns, Zurück |
| `web-phone-stack-note-{light,dark}.png` | the phone, Überspringen tapped to the card with the note |
| `stack-drag-desktop-light.png` | a mouse drag in Chrome: the card lifted and tilted over the trays, the next card rising with "// als Nächstes" and its text, the notice of the filing before |
| `stack-drag-webkit-light.png` | the same drag in WebKit (`preserve-3d` holds: the card stays above the trays and the cards below) |
| `web-stack-webkit-light.png`, `web-phone-stack-webkit-light.png` | the stack in WebKit, desktop and phone |
| `stack-zoom200-light.png` | 200 % zoom at 1440×900 (a 720×450 viewport), `1`: the trays scrolled into view above the dock, the focus on the first |
| `list-desktop-light.png` | the list mode on desktop (the default without a stored choice): M8's page and panel, plus the toggle and "s Stapel" in the panel's hints |

**Driven on the harness** (every write read off the request log):

- **Desktop, Chrome and WebKit:** `1` opens the contexts; `0`, `Esc` and `⌫` go back; `1 2` sends
  `PUT /tasks/{uuid} {"tags_add":["next","@anrufe"]}`, the notice "→ Nächste · @anrufe · Rückgängig", the next card
  rises ("2 von 5"); `z` sends the exact inverse `{"tags_remove":["next","@anrufe"]}` and the same card is back on top
  ("1 von 5"). `→` puts the card at the bottom; `e`, typing, Enter sends `PUT … {"description":"… (bis Fr)"}` and the
  card stays on top. `p`, `8` (Neues Projekt), "Garten" ⏎ (refused), "Umzug" ⏎, `1` sends
  `PUT … {"project":"Umzug","tags_add":["next","@computer"]}`. A mouse drag onto Irgendwann sends
  `PUT … {"tags_add":["someday"]}`; a flick released half way towards Warten auf opens the follow-up days (11.11.,
  13.11., 16.11., ohne Datum); `4` sends `PUT … {"tags_add":["waiting"]}`; `4` (Erledigt) holds the done and sends
  `POST /tasks/{uuid}/done` after the hold. Every drop and flick landed in both browsers.
- **Phone, taps only (Chrome and WebKit): a whole Inbox of five cleared** — Nächste → @computer, Warten auf →
  Freitag (`{"tags_add":["waiting"],"scheduled":"2026-11-13"}`), Projekt → Garten → @zuhause
  (`{"project":"Garten","tags_add":["next","@zuhause"]}`), Irgendwann (in Chrome as a CDP touch drag onto the tray, in
  WebKit a tap), Erledigt (sent after the hold) — then "Inbox ist leer."
- **Mode:** a desktop without a stored choice opens the list; `s` switches to the stack and stores
  `localStorage.inboxMode = "stack"`; the palette's "Inbox als Liste" and a click on "Stapel" switch and store; a
  phone without a stored choice opens the stack (nothing stored).
- **Palette** on the stack: "Klären: Nächste Aktion, dann Kontext 1" … "Klären: Löschen 5", "Klären: Zu einem Projekt,
  dann Kontext p", "Text ändern: …", "Überspringen: …"; "Klären: Nächste" from the palette turns the trays into the
  contexts with the focus on the first. The `?` sheet lists "Inbox als Stapel", "Karte überspringen", "Liste oder
  Stapel".
- **Search:** `/` "fahrrad" puts the hit in place of the stack; Esc brings the stack back. `x` then `z` inside the hold
  sends nothing and the card is back on top.

**Measured:**

| Criterion | Bound | Measured |
|---|---|---|
| Card height, no note | ≤ content + 96 px | desktop 170 px for 82 px of content (+ 88); phone 164 for 88 (+ 76); WebKit 169 / 163 |
| Card height, with note | — | desktop 190 px (+ 20 for the note line); phone 210 |
| Frames at rest (`window.__runway.stack.frames`) | 0 over 3 s | 0 on load, 0 after a filing, 0 after an undo flight (Chrome and WebKit) |
| Frames with reduced motion | none | 0 for a filing and its undo, no flying copy |
| Frames for one filing (copy's flight + next card's rise) | — (the ≤ 60 bound is the lens's) | 100 |
| Touch targets on the phone | ≥ 44 px | tools 44, toggle 44, trays 71×92, step trays 123×60 |
| 200 % zoom at 1440 px | no horizontal scroll | 720 = 720 at rest, in the context step and in the project step |
| Entry JS (gzip) | ≤ 130 kB | 129.3 kB; the stack's chunk 6.6 kB JS + 2.45 kB CSS, loaded when the stack is first shown |
| CSS (gzip) | ≤ 20 kB | 14.5 kB |

**Keyboard only:** Tab goes rail → top line → capture field → Liste, Stapel → Projekt, Text ändern, Überspringen →
"Nächste, dann Kontext, 13 darin (Taste 1)" … "Löschen, braucht keiner (Taste 5)"; every stop shows its ring (the search and capture fields show their
underline instead, M6/M9). A step moves the focus to its first tray; Esc goes back a step. The card announces
"Karte 1 von 5: …" in a polite live region, a step "…: Warten auf · wann fragst du nach?"; the trays' group carries the
question as its name, and each tray its hint and count ("Freitag, Fr 13.11. (Taste 2)"). Filing the last card puts the
focus on "Alles geklärt …".

axe-core 4.10.2: **0 serious or critical issues in all 20 shot states** (stack, step, note, project, new project,
narrow, phone, phone step, phone note, list, WebKit desktop and phone; light and dark). One moderate finding
throughout (`region`: the capture field and its hint, M6), none on anything M10 adds. No console error or warning from
the app (WebKit warns once that the preloaded Space Grotesk was not used within a few seconds — M1's preload).

**Fixed after looking at the shots** (all shots above are after the fixes):

- **The context step's trays** had an empty name line and the context written low, where the hint goes (06:
  "@computer" on the name line, "am Rechner" under it). The contexts now carry 06's hints from the catalogue
  (`ctxhint.*`, already in `messages.de.js`, through a new `hasText()` in `shared/i18n.js`); a context of the user's
  own gets none, and an empty hint keeps its line so every name sits on the same line (`StackTrays.vue`,
  `stackSteps.js`, test in `stackSteps.test.js`).
- **Project names** were cut ("Angebot-Pilot…", "Website-Relau…", "Name, dann Konte…"); on wide screens they now take a
  second line before they are cut.
- **The phone opened the stack with the capture field focused** (M6 focuses it on the phone Inbox), which on a real
  phone raises the keyboard over the card and the trays; 06's `web-phone-stack.png` has it unfocused. In stack mode
  the Inbox no longer focuses it (`ListFrame.vue` gains `captureFocus`, default unchanged; the list mode and the other
  pages are as before — probed: Inbox list → the field, Nächste → nothing, Inbox stack → nothing).
- **At 200 % zoom** a step's focused first tray lay under the phone dock (381–441 px, dock from 330 px). The focus
  still does not scroll the page when the tray is in sight; when it is not, the tray scrolls in clear of the dock
  (`scroll-margin`) — now at 114–174 px.

Deviations from the prototype (brief 0057): the card's height follows its content (06: a fixed 270 px, judge weak
point 6) and shows the first note up to four lines; every context and every active project gets a tray, the first
ones keyed (06 cut the projects at eight); the store is written when a tray is chosen and a copy of the card flies
(06 wrote on landing); a click outside the edited text saves it (06: only Enter); the head's toggle is the detail's
small pill (`OptToggle`, 44 px on touch) and sits centred on eyebrow and heading together (M5's head with an aside, as
on Nächste), where 06 centres a larger pill on the heading alone; the lead is M5's page lead (wider, 17 px). On the
phone the tabs are in the bottom dock (M4), not at the top as in 06. While a dragged card uncovers the next one,
Chrome draws the rising card's text soft (it is a scaled layer inside the `preserve-3d` slot; it is sharp again at
rest, and WebKit draws it sharp throughout) — left as it is, since flattening the slot would undo the layering the
plan requires.

**After review** (brief 0057, Pre-checks), driven with `fixcheck.mjs` on fresh users seeded with the same set:

- A mouse drop 15 px inside Löschen, Erledigt and Warten auf (left edge, hand at rest), Chrome and WebKit: the lit tray
  and the tray filed into agree ("Gelöscht", "Erledigt", the follow-up days). Before, the left neighbour took it.
- `1` on a card, a capture through the API, the window focused after the 30 s refresh gap: the same card stays on top
  in the context step ("1 von 6"); `4` sends `PUT … {"tags_add":["next","@unterwegs"]}` for it, and the new capture
  is the next card.
- A capture from the capture line with its reply held back 2.5 s, skipped while still `local:…`: once named it stays
  at the bottom (skipping through the stack meets it last).
- Five cards filed with `3`, the focus on "Alles geklärt …"; `z`: "5 von 5", the card flies back out of Irgendwann
  (Chrome and WebKit), `PUT … {"tags_remove":["someday"]}`.
- All 20 shot states again: axe-core 0 serious or critical; the shots differ from these only in the clock text, so
  they were kept.
