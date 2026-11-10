# M5 — lists, rows, sections (brief 0051)

Taken 2026-11-01 on the dev harness (real backend, demo set), Chromium (installed Google Chrome),
`shot.mjs --url=… --login=demo:…`. Speed mode for this run: desktop 1440×900 and phone 412×915 @2x,
light and dark; narrow and WebKit deferred to M15's pass. No lens yet (M11), so no reduced-motion shot.
The two `notice-*` shots use a harness user of this milestone (`m5-agent`), because they tick a todo off.

| Shot | What it shows | Compare with |
|---|---|---|
| `next-{desktop,phone}-{light,dark}.png` | Nächste, all contexts: eyebrow with the chip's count, caption `3 von 7 heute`, chips (desktop under the heading, phone in the dock), Fällig · Jetzt · Bald · Später | `06-kombination/shots/web-desktop.png`, `web-dark.png`, `web-phone.png`, `web-phone-dark.png` |
| `next-computer-desktop-light.png` | `@computer`: its own due todo in Fällig | `web-filter.png` (other context) |
| `next-anrufe-{desktop,phone}-light.png` | `@anrufe`: nothing due there, so the other context's due todo sits under the one Fällig heading with `andere Kontexte`; eyebrow `@anrufe · 3 · +2 ohne Kontext` | `web-filter.png` |
| `next-ohne-desktop-light.png` | `ohne Kontext` (dashed chip): only todos without a context | — |
| `inbox-*`, `waiting-*`, `someday-*`, `all-*` | the other four lists, light and dark, desktop and phone | 06 views of the same name (`web-inbox.png` for the list mode) |
| `all-done-desktop-light.png` | Alle with "Erledigte zeigen": the week's done, struck through | — |
| `notice-desktop-light.png`, `notice-phone-dark.png` | after ticking a row off: `Erledigt · Rückgängig` with the yellow undo line — bottom of the page column, inside the dock on the phone | `web-phone.png` (deliberately different: 06's notice covered a row and named the todo) |

axe-core 4.10.2: 0 serious or critical issues on all five lists, desktop and phone (light), and on
Nächste desktop dark.

Remaining deviations from 06 (see the brief): no lens (M11), no search/Befehle top line and no
`⌘K`/`?` (M9), no capture line (M6), empty margin column (M12), no Inbox lead text or Liste/Stapel
toggle (M8/M10). Order inside a section follows Taskwarrior's urgency (06 used invented values).
The demo set on the harness currently has no legacy comma tag on "Schlüssel für das neue Büro
abholen" (06: `@unterwegs +1`), so it shows `ohne Kontext`; the `+n` form is pinned by
`rowMeta.test.js`.
