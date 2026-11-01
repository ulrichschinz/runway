# M8 — the clarify panel and list moves (brief 0054)

Taken 2026-11-01 on the dev harness (real backend, 06 demo set), Chromium (installed Google Chrome).
Opening a question writes nothing, so those shots use the shared `demo` user; the two notice shots
file an item and use this milestone's own `m8-agent`. Speed mode: desktop 1440×900 and phone 412×915
@2x, light and dark; one narrow 1024×768 shot because the docked clarify panel is a layout this
milestone adds; WebKit and the rest of narrow deferred to M15's pass. No lens yet (M11), so no
reduced-motion shot.

Compared with `06-kombination/shots/web-inbox.png`.

| Shot | What it shows |
|---|---|
| `inbox-desktop-{light,dark}.png` | the Inbox with the lead line and the clarify panel in the margin: `// Klären · noch 5`, ID, the item, its capture time and note, "Was ist es?", the six choices with their keys, the key hints; the cursor row (yellow dot, plum rule) is the panel's item |
| `step-context-desktop-light.png` | `a`: "Wo erledigst du das? Nächste braucht einen Kontext." with the present contexts, 1–5 |
| `step-follow-desktop-dark.png` | `j` then `w` on the second item: "Wann fragst du nach?" — morgen Mo 02.11. · Freitag Fr 06.11. · nächste Woche Mo 09.11. · ohne Datum |
| `step-project-desktop-light.png` | `p`: the active projects 1–9 and the dashed "Neues Projekt" `n` |
| `step-project-context-desktop-light.png` | `p 2`: "Erste Aktion für Angebot-Pilotkunde: wo erledigst du das?" |
| `step-new-project-desktop-dark.png` | `p n`, "Garten" ⏎: refused with "Dieses Projekt gibt es schon." (`projectNameError`) |
| `filed-notice-desktop-light.png` | after `a 2`: the row gone, the cursor and the panel on the next item, the notice "→ Nächste · @anrufe · Rückgängig" |
| `inbox-phone-{light,dark}.png` | the phone list (no keys, no lead: the stack is the touch mode, M10) |
| `clarify-sheet-phone-{light,dark}.png` | a tap on a row: the panel as a sheet; dark with Warten auf's answers open (44 px pills) |
| `filed-notice-phone-light.png` | after "Irgendwann" in the sheet: the sheet closed, the notice with Rückgängig in the dock |
| `inbox-narrow-light.png` | 1024 px: the panel docked beside the list (06 `.app.dock`), the rows keep the day column at 06's 156 px |

Deviations from the prototype (brief 0054): no "Liste · Stapel" switch and no `s Stapel` key hint (M10);
the filed stamp in the leaving row is not drawn (the notice says it); the contexts offered are the present
ones (D1), not 06's fixed five; "Text ändern" is also a link under the ID, so touch reaches the detail.

axe-core 4.10.2: 0 serious or critical issues, desktop with a question open and phone with the sheet.
