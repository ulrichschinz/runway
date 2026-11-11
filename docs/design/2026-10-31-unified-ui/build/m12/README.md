# M12 — the margin column (brief 0059)

Taken 2026-11-10 on the dev harness of M11 (real backend, Taskwarrior 3.5.0, **06 demo set**): the backend on :8031
over a data root and users database in the session's scratchpad, the Vite dev server on :5197 proxying to it, the
production build (`vite build`) for the budgets. Users `m12-s1`, `m12-s2`, `m12-d1`, `m12-d2`, `m12-ph`, each seeded
with the 06 demo set shifted from 31.10. to 10.11. and 06's day plan, as in M11 ("3 von 7 heute"), plus 06's due
follow-up: "Rückmeldung Vermieter zur Kaution" with the follow-up day 09.11. (06: 30.10.). `m12-s2` has a weekly review
recorded today; the others have none. Chrome (GPU on, as `shared/tools/shot.mjs`) and Playwright WebKit, driven by
scratch Playwright scripts with real clicks and keys. Desktop 1440×900, narrow 1024×768, phone 412×915 @2x.

Compared with `06-kombination/shots/web-desktop.png` (the margin on Nächste) and `web-dark.png`.

## Shots

| Shot | What it shows |
|---|---|
| `web-desktop-{light,dark}.png` | Nächste: "3 von 7 heute" and the 104 px lens in the head; the margin with `// Heute · Dienstag, 10. November` and only the struck-through list (no lens, no second "3 von 7"), `// Nachhaken · 1 heute` (the due follow-up with the yellow ring, "seit Mo 09.11.", then this week's two), `// Projekte` (Podcast, "steckt fest"), `// Rückblick` ("Noch kein Rückblick festgehalten.", "Rückblick beginnen `g` `r`") — 06's `web-desktop.png` |
| `margin-someday-desktop-{light,dark}.png` | Irgendwann: the margin's Heute with the 72 px WebGL lens, "3 von 7" / "geplant und erledigt" |
| `margin-waiting-desktop-light.png` | Warten auf: the margin without Nachhaken (the page lists the follow-ups) |
| `margin-review-desktop-light.png` | Alle, `m12-s2`: "Zuletzt **Di 10.11.**, heute." and no "Rückblick beginnen" (not due) |
| `margin-reduced-desktop-{light,dark}.png` | reduced motion: the flat SVG lens in the margin at the same level, no canvas |
| `today-narrow-{light,dark}.png` | 1024 px, Nächste: the lens box opened Heute as the docked panel ("Esc schließen"; the panels without the lens, so "3 von 7" stays once). The head is narrow here, so the caption sits under the 104 px lens and the eyebrow and "Was jetzt zählt" keep one line each (re-shot after the review) |
| `web-phone-more-{light,dark}.png` | the phone, Nächste: "···" opens the Mehr sheet, the panels under its entries |
| `web-phone-today-{light,dark}.png` | the phone, Nächste: a tap on the lens opens Heute as a sheet |
| `margin-someday-webkit-light.png`, `web-phone-more-webkit-light.png` | WebKit, desktop margin (WebGL lens) and the phone's Mehr sheet |
| `margin-zoom200-light.png` | 200 % zoom at 1440×900 (a 720×450 viewport): the phone layout, no horizontal scroll |
| `margin-bead-desktop-light.png` | Alle, `m12-s2`: "Steuerberatung zurückrufen" (planned) ticked, 330 ms later: the bead on its way into the margin's lens |

## Driven on the harness

- **"3 von 7" once per screen** (desktop, every view): Nächste 1 (the head), Warten auf 1, Irgendwann 1, Alle 1, Projekte 1,
  Rückblick 1, Einstellungen 1 (the margin), the Inbox in Stapel mode 1 (the margin; the card's "Karte 1 von 5" is not the
  caption). The Inbox in Liste mode with items: 0 — the clarify panel takes the margin's place, as in 06. Nächste while the
  `/` search is on: 1 (the head steps aside, the margin's lens comes back). Narrow Nächste with Heute open: 1. Phone: Nächste
  with Mehr open 1, Warten auf with Mehr open 1 (the sheet), Nächste with Heute open 1.
- **One canvas:** 1 on every wide view with the margin (in the margin's slot, or in Nächste's head), 0 on the Inbox in Liste
  mode, 0 at 1024 px outside Nächste (no margin column there), 0 on the phone, 0 with reduced motion.
- **The bead into the margin:** on Alle a tick on the planned "Steuerberatung zurückrufen" flies a bead into the margin's
  lens; mid-flight "3 von 7", after landing "4 von 7", 55 lens frames; the done list gains it with "gerade"; after the hold
  `POST /tasks/{uuid}/done`.
- **Nachhaken:** a click on "Rückmeldung Vermieter" opens its detail in the margin's place (`?task=<uuid>`); `Esc` closes it and
  the panels return. Left out on Warten auf.
- **Projekte:** "Podcast" links to `/projects/Podcast`. **Rückblick:** "Rückblick beginnen" links to `/review`.
- **Narrow (1024 px):** no margin column; the lens box (accessible name "3 von 7 heute . Tagesübersicht öffnen",
  `aria-expanded`) opens Heute docked, the focus on "schließen"; `Esc` closes it and the focus is back on the lens box.
- **Phone:** the Mehr sheet is 380 px wide with the panels; a tap on a follow-up closes it and opens the detail sheet. A tap
  on the lens opens Heute as a sheet named "Heute"; a tap on the scrim closes it and the focus is back on the lens box.
- **Keyboard:** Tab goes rail → top line → rows → capture → the margin's links (the follow-ups, the stuck project, Rückblick
  beginnen) and on; nothing traps.

## Measured

| Criterion | Bound | Measured |
|---|---|---|
| Entry JS (gzip) | ≤ 130 kB | 129.5 kB (130.6 with the panels before the `?` sheet and the Mehr sheet became chunks of their own; M11: 129.7) |
| CSS (gzip) | ≤ 20 kB | 13.6 kB |
| Margin panels chunk | — | 1.7 kB JS + 0.8 kB CSS gzip, requested when a page first shows the margin |
| WebGL canvases | ≤ 1 | ≤ 1 everywhere (above) |
| Lens frames per planned completion | ≤ 60 | 55 (into the margin's 72 px lens) |
| 200 % zoom at 1440 px | no horizontal scroll | 0 px |

**Accessibility:** axe-core 4.10.2: **0 serious or critical issues** in all eighteen shot states; the one moderate
`region` finding is M6's capture field, as in M9–M11. A second, independent pass over seventeen of those states
(both schemes, reduced motion, narrow with Heute open, phone with Mehr and Heute open, WebKit, 200 % zoom) confirmed it
and re-measured "N von M" = 1, canvases ≤ 1 (0 on the phone and with reduced motion) and 0 px horizontal scroll in each.

## Deviations from 06

- 06's "nicht gesendet" section at the top of Heute is not repeated (the rail and the Mehr sheet carry the outbox line).
- Nachhaken's days read as the rows' (`seit Mo 09.11.`, `Fr 13.11.`), not 06's bare `30.10.`.
- The lens in the Mehr sheet is 72 px, not 06's 64 px.
- Rows in the margin are 44 px high (touch targets), 06's ~38 px.
- At 761–1180 px only Nächste reaches the panels (its lens box), as in 06.
