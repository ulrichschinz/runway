# M7 — the task detail (brief 0053)

Taken 2026-11-01 on the dev harness (real backend, 06 demo set), Chromium (installed Google Chrome).
Opening a detail writes nothing, so the open shots use the shared `demo` user; the refused-edit shot
writes and uses this milestone's own `m7-agent`. Speed mode: desktop 1440×900 and phone 412×915 @2x,
light and dark; one narrow 1024×768 shot because the docked panel is a layout this milestone adds;
WebKit and the rest of narrow deferred to M15's pass. No lens yet (M11), so no reduced-motion shot.

06 has no detail shot of its own; the comparison was made against the prototype rendered with a row
opened (`06-kombination/index.html`, Nächste, "Angebotsentwurf fertigstellen", desktop and phone).

| Shot | What it shows |
|---|---|
| `detail-desktop-{light,dark}.png` | `/next?task=…` (Android's handoff URL): the detail in the margin column — eyebrow `Todo · Nächste`, `Esc schließen`, the text, ID and capture time, the live bar `läuft seit …` with Pausieren, Liste, Kontext, Projekt, Heute, Fällig, Priorität, Mehr, ¶ Notizen, Abhaken and Löschen |
| `detail-phone-{light,dark}.png` | the same link on the phone: a sheet from the bottom over a scrim (86 % of the visual viewport), grab handle, 44 px touch targets |
| `detail-narrow-light.png` | 1024 px: the detail docked as a 360 px column beside the page; the rows keep their title and the day column |
| `detail-waiting-more-desktop-light.png` | a Warten-auf todo with Mehr open: Nachhaken (its follow-up day), Zurückstellen, Läuft ab, Wiederholen, Tags (and below the fold Hängt ab von) |
| `detail-deferred-desktop-light.png`, `detail-deferred-phone-dark.png` | review fix: a todo deferred to 20.11. opened by `/next?task=…` after a reload — the full detail with "zurückgestellt bis Fr 20.11." (yellow ring), the todo in no list (own user `m7fix2`) |
| `detail-refused-desktop-light.png` | "wöchentlich" on a todo without a due day: the server's 400 shown in the detail (`Nicht gesendet: You cannot specify a recurring task without a due date.` · Erneut senden · Verwerfen), the row's `Nicht gesendet` and the rail's outbox line |

Deviations from the prototype, all deliberate (brief 0053): the docked column at 761–1180 px instead of
06's overlay; Tags, Geplant, a free-text rhythm and a list of dependencies in Mehr so every old field
stays reachable; the "Text ändern `e`" link under the ID; 84 px label column and 28 px toggles as in 06,
44 px on the phone.

axe-core 4.10.2: 0 serious or critical issues on the detail, desktop and phone (light).
