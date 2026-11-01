# M6 — the capture line (brief 0052)

Taken 2026-11-01 on the dev harness (real backend, demo set seeded for a harness user of this
milestone, `m6-shots`, because the action shots write), Chromium (installed Google Chrome). Speed mode:
desktop 1440×900 and phone 412×915 @2x, light and dark; narrow and WebKit deferred to M15's pass. No
lens yet (M11), so no reduced-motion shot.

| Shot | What it shows | Compare with |
|---|---|---|
| `next-{desktop,phone}-{light,dark}.png` | Nächste with the capture line: bottom of the page column (coral `+`, "Neues Todo", `⏎ in die Inbox`, `n`); on the phone under the dock's tabs, not focused | `06-kombination/shots/web-desktop.png`, `web-phone.png` |
| `inbox-{desktop,phone}-{light,dark}.png` | Inbox; on the phone the field is focused when the Inbox opens (caret and the 1 px yellow line) | `web-inbox.png` |
| `captured-next-desktop-light.png`, `captured-next-phone-dark.png` | after capturing from Nächste: the page stays, the field is empty, notice `In Inbox ✓ · Rückgängig`, the Inbox count carries the yellow dot (rail; dock tab) | `web-phone.png` notice (deliberately different: in the dock, without the todo's text) |
| `unsent-inbox-desktop-light.png` | captured offline: the row `Nicht gesendet · Erneut senden` with the coral edge, the rail line `1 nicht gesendet · senden` | `web-outbox.png` |

axe-core 4.10.2: 0 serious or critical issues on Inbox and Nächste, desktop and phone (light).
