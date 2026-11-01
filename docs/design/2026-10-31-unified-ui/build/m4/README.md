# M4 — the new shell (brief 0050)

Taken 2026-11-01 on the dev harness (real backend, demo set), Chromium (installed Google Chrome),
`shot.mjs --url=… --login=demo:…`. Speed mode for this run: desktop 1440×900 and phone 412×915 @2x,
light and dark; narrow and WebKit deferred to M15's pass. No lens in M4, so no reduced-motion shot.

| Shot | What it shows | Compare with |
|---|---|---|
| `frame-next-desktop-{light,dark}.png` | rail (counts, yellow dot, ring + "fällig" on Rückblick, `demo · Stand`), page column with the placeholder, empty margin column | `06-kombination/shots/web-desktop.png`, `web-dark.png` (rail and columns) |
| `frame-next-phone-{light,dark}.png` | page above the bottom dock: tabs with counts, yellow dot under Nächste, `···` | `mobile/m3-papier-mobil/shots/phone.png` (tab row), `06…/web-phone.png` |
| `more-phone-{light,dark}.png` | the Mehr sheet opened upward from the tabs (first entry focused) | m3 "···" menu |
| `task-{phone,desktop}-light.png` | `/waiting?task=<uuid>`: the todo's description until M7's detail | — |
| `login-{desktop,phone}-{light,dark}.png` | the new login page | m3 setup screen (form in the brand's language) |
| `old-next-desktop-light.png` | the old UI at `/next` without `?ui=neu` | `build/m3/old-next-desktop-light.png`: 163 differing pixels, all in rows 897–899 (the cut-off row at the bottom edge, whose urgency badge ages with the clock); the rest is identical |

axe-core 4.10.2: 0 serious or critical issues on `frame-next` (desktop and phone, light and dark), the
Mehr sheet (phone light) and the login page (desktop and phone, light).

Remaining deviations from 06 (all by plan or milestone order, see the brief): no top line (search,
Befehle, Stand) and no `⌘K` / `?` in the rail until M9; no lens in the head (M11); the margin column
is empty until M12; the dock has no capture field until M6.
