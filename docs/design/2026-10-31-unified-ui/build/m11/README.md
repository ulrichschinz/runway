# M11 — the Tageslinse, the bead, `t` (brief 0058)

Taken 2026-11-10 on the dev harness (real backend, Taskwarrior 3.5.0, **06 demo set**). The backends on :8000 and
:8010 belonged to other sessions and were left alone; this milestone ran its own: the same backend code on :8031 over a
data root and users database in the session's scratchpad, the Vite dev server on :5197 proxying to it, and the
production build (`vite build`, `vite preview`) on :5198 for the budgets. One user per run (`m11-agent`, `m11-shots`,
`m11-wk`, `m11-wk2`, `m11-phone`, `m11-s1`–`m11-s3`), each seeded with the 06 demo set shifted from 31.10. to 10.11. as
in M9/M10, **plus 06's day plan**: "Steuerberatung zurückrufen" and "Startseiten-Text kürzen" planned for today, and the
three todos done this morning planned before they were ticked — so Nächste opens with 06's "3 von 7 heute" (two
planned, one running, one overdue open; three done). Chrome (installed Google Chrome, GPU on: `--enable-gpu
--ignore-gpu-blocklist --use-angle=metal`, as `shared/tools/shot.mjs`) and Playwright WebKit, driven by scratch
Playwright scripts with real clicks and keys. Desktop 1440×900, narrow 1024×768, phone 412×915 @2x; light and dark.

Compared with `06-kombination/shots/web-signature.png`, `web-reduced.png`, `web-dark.png`, `web-phone.png` and
`web-phone-dark.png`.

## The light lens: three stills, tuned A ships

The plan asks Uli to choose the light lens from three stills before the merge (judge weak point 4, "peach ball").
**Uli was not available for this pick; M11 ships tuned A**, per the plan's light-mode guidance, under his standing
order of 2026-11-10 to build and roll out the whole layout without stopping. The three stills go into the PR for his
choice, and it stays an open point in the brief. All three looks are one table in
`frontend/src/layout/lens/lens3d.js` (`LIGHT_LOOKS`); switching is changing `LIGHT = 'a'` to `'current'` or `'b'`.
In a dev build `window.__runway.lens.look('current' | 'a' | 'b')` shows each on the running page.

| Still | Look |
|---|---|
| `lens-light-current.png` | 06 as approved: coral attenuation `#FFC9BF` at 3.2, roughness 0.1, thickness 1.1 — the body reads peach all through |
| `lens-light-a.png` | **tuned A (shipped):** attenuation almost white (`#FFF3EF` at 9), so only the liquid is coral; roughness 0.03, thickness 1.7, IOR 1.5 (more transmission contrast); clearcoat roughness 0.015 and one small hard light for a crisp highlight; fresnel rim 1.0 at power 4.2 (finer, sharper edge); environment 0.7 (it fogged the upper body); faint paper hairlines behind the sphere (the rule colour, ink at 10 %, strengthened 2.4× to 24 % so the glass shows them, on the page's ground), fading into the ground before the canvas edge; the upper body reads lighter than `current`'s peach, not colourless |
| `lens-light-b.png` | tuned B: as A but warmer and thinner (`#FFE0D8` at 5, thickness 0.9, IOR 1.42), iridescence 0.18, a stronger coral rim, fainter hairlines (14 %) |
| `lens-dark.png` | the dark lens (06's dark branch, unchanged: frosted plum-light body, coral attenuation, weak clearcoat and environment) |

## Shots

| Shot | What it shows |
|---|---|
| `web-next-desktop-{light,dark}.png` | Nächste: eyebrow, "Was jetzt zählt", "3 von 7 heute" beside the 104 px WebGL lens (tuned A / dark), chips, Fällig · Jetzt (two "für heute") · Bald · Später |
| `web-signature-early-desktop-light.png` | the same tick 190 ms in: the whole thread drawn, out of the ring, up the left gutter, along the band and down into the lens, the bead leaving the ring |
| `web-signature-desktop-{light,dark}.png` | `x` on "Steuerberatung zurückrufen" (planned), 330 ms later: the row gone, the bead on the band (which runs just under the search field's rule), the thread only ahead of it into the lens — the part behind the bead is already taken in — "Erledigt · Rückgängig"; the caption still "3 von 7 heute" (it turns to "4 von 7" when the bead lands) |
| `web-reduced-desktop-{light,dark}.png` | reduced motion: the flat SVG lens at the same level, no canvas (Three.js never requested) |
| `next-narrow-{light,dark}.png` | 1024 px: the head with the WebGL lens |
| `web-phone-next-{light,dark}.png` | the phone: eyebrow, then the full caption "3 von 7 heute" under it, the 52 px flat lens to the right; no canvas |
| `web-next-webkit-light.png`, `web-phone-next-webkit-light.png` | WebKit, desktop (WebGL lens) and phone |
| `lens-context-lost-light.png` | after `WEBGL_lose_context`: the flat lens at the same level, the canvas gone |
| `next-zoom200-light.png` | 200 % zoom at 1440×900 (a 720×450 viewport): the phone layout, no horizontal scroll |

## Driven on the harness

- **The bead** (Chrome and WebKit): a click on the ring of "Steuerberatung zurückrufen" holds the done (sent after the
  hold: `POST /tasks/{uuid}/done`), strikes the row, and one bead flies; it lands 0.77 s later, the level rises
  (0.4286 → 0.5714) and the caption rolls to "4 von 7 heute". Mid-flight the caption and level still show 3 von 7.
- **Not planned:** the ring of "Kellerregal ausmisten": no bead, the caption becomes "4 von 7 heute · 1 zusätzlich", the
  level stays.
- **`t`:** on the cursor row "Release-Notes …": `PUT … {"scheduled":"2026-11-10"}`, "Für heute geplant · Rückgängig",
  "4 von 8 heute · 1 zusätzlich", the level falls with the spring; `t` again: `PUT … {"scheduled":""}`, back to 4 von 7.
  In the open detail `t` plans as well ("3 von 8 heute"); the palette offers "Für heute planen: <todo>" for the cursor row.
- **Reduced motion:** a planned tick strikes the row with no bead and no frame; the caption changes at once; `z` inside
  the hold sends nothing.
- **Context loss:** `__runway.lens.loseContext()` → state `off`, 0 canvases, the flat lens with the liquid at the same
  level; it stays flat for the page's life.
- **Where the lens loads:** Inbox (list) 0 canvases, no lens request; `g n` to Nächste → the lens chunk is requested, 1
  canvas; `g w` to Warten auf → 0 canvases (the canvas leaves with its slot; the renderer is kept for the next visit).
- **The detail, now a chunk of its own** (entry budget, see the brief): not requested on load; a click on a row
  requests it and opens it with the focus on the title, `Esc` closes it and the focus is back on the row, `e` opens it
  with the focus in the text field, `?task=<uuid>` opens it on load.

## Measured

| Criterion | Bound | Measured |
|---|---|---|
| Lens frames while idle (`window.__runway.lens.frames`) | 0 over 3 s | 0 (on load, after a bead, after `t`; Chrome and WebKit) |
| Lens frames per planned completion | ≤ 60 | 48–53 (Chrome 48 and 52, WebKit 52 and 53); 1 when the canvas mounts; 1 for an unplanned tick; 30 for a `t` level change |
| WebGL canvases | ≤ 1; 0 at ≤ 760 px; 0 on the Inbox | 1 on desktop and narrow Nächste; 0 on the phone, the Inbox, Warten auf, with reduced motion and after a lost context |
| `three` | only in the lazy lens chunk, after first paint, only on a desktop lens | production build: requested at 93 ms after the first contentful paint at 56 ms on desktop Nächste; never on the desktop Inbox, Warten auf or phone Nächste. `threeIsolation.test.js` holds the import side |
| Lens chunk (gzip) | ≤ 180 kB | 122.2 kB (`three` core + `RoomEnvironment` + `lens3d.js`) |
| Entry JS (gzip) | ≤ 130 kB | 129.7 kB after the review (129.4 before it; M10: 129.8; 133.3 with the lens before the task detail became a chunk of its own, 4.9 kB JS + 1.5 kB CSS gzip) |
| CSS (gzip) | ≤ 20 kB | 14.1 kB |
| Frame time during the bead | ≤ 16 ms on WebKit, else a cheaper material | The render's own time per frame (`renderMs`, `renderer.render()` with `gl.finish()` so the GPU's work counts; two planned ticks, 108 frames): Playwright WebKit on the MacBook median 1 ms, max 4 ms; Chrome median 0.9 ms, max 2 ms. No cheaper material needed. Before review the first bead's first two frames cost 37 and 52 ms (WebKit; Chrome 20 and 36): its geometry reached the GPU only when it first fell. The lens's first frame now draws the bead once out of sight. The intervals between frames (`frameMs`, the display's pace, not the render cost) are now median 17 ms, max 24–26 ms on headless WebKit and 16.7 / 16.8 ms in Chrome; the 44 ms handover frame is gone |
| Phone caption | `3 von 7 heute · 1 zusätzlich`, wrap the second part only where it does not fit | full caption on one line under the eyebrow at 412 px and at 320 px; the two parts never break inside |
| 200 % zoom at 1440 px | no horizontal scroll | 720 = 720 |

**Keyboard and screen readers:** the lens and the bead are `aria-hidden` and take no focus (Tab goes rail → top line →
capture → chips as before); the caption is plain text in the head. axe-core 4.10.2: **0 serious or critical issues** in
all twelve shot states (desktop, dark, reduced, narrow, phone, WebKit, mid-flight); the one moderate `region` finding is
M6's capture field, as in M9 and M10.

## After review

Nine findings, six distinct (three named the same hang, two the same undo): five fixed; the light-lens pick is left
to Uli's standing order and stays open (above). Driven again on the harness (new users `m11-r1`–`m11-r14`, same seed):

- **Two beads in the air** (two planned ticks 120 ms apart, Chrome): both fly, both land; "3 von 7" → "5 von 7 heute",
  level 0.4286 → 0.7143. Before, the second fall replaced the first one's animation, its promise never settled, and the
  caption stayed held for the session. Every fall's promise now settles once (`landingBook`): when it lands, when a newer
  bead replaces it, when a hidden tab drops the animations, or when the context is lost; and a flight counts as landed
  at most `LAND_MAX_MS` (1 s) after it reaches the lens (`settleWithin`).
- **Lost context during the fall** (`loseContext()` 60 ms after the DOM bead hands over): state `off`, the flat lens at
  0.5714, "4 von 7 heute"; the next tick goes to "5 von 7".
- **Rückgängig during the flight** (`z` 300 ms after the tick): the bead and its thread are gone at once, nothing lands,
  the caption does not roll, the level stays 0.4286 over the next 1.5 s and the caption "3 von 7 heute". A bead that
  lands is dropped to the store's level at that moment if it has fallen since, and the last bead down re-syncs the lens
  with the store, so a tick taken back during the 260 ms fall sinks the liquid again.
- **The hairlines** now show: in the re-shot `lens-light-a.png` two curved rules refract through the upper body, in `-b`
  fainter. Before, the 2.4× meant to strengthen them was a `globalAlpha` capped at 1 over a 10 % stroke, so A and B
  drew the same barely visible 10 %.
- Budgets after the fixes (dev build, the drive script): 48 frames per planned completion in Chrome, 54 in WebKit;
  0 frames over 3 s idle; one frame for an unplanned tick.

Re-shot: `lens-light-{current,a,b}`, `lens-dark`, `web-next-desktop-light`, `next-narrow-light`,
`web-next-webkit-light`, `web-signature-desktop-light`; new `web-signature-early-desktop-light`. The stills show
"3 von 7 heute" now (the earlier run's user had ticked one off). Nothing else changed in them.

## Deviations from 06

- **The band of the thread** runs between the top line (M9; 06 had none) and the eyebrow, close under the search
  field's rule.
- **The phone head:** the caption sits under the eyebrow, left of the lens, not beside it: the plan wants the full
  caption on the phone, and beside a single-line eyebrow there is no room for it.
- **The lens box is not a button yet:** in 06 it opens the margin's "Heute"; that panel is M12.
- **The rail's 14 px ring** beside "Nächste" (06 `miniLens`) is not in M11's list and not built.
