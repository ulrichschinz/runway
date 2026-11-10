# Change Impact Brief 0058 — The Tageslinse

| Field | Value |
|---|---|
| **Requested outcome** | Milestone **M11** of [the plan](../plan/unified-ui-web.md) (the plan calls it 0057; that number went to the card stack): behind `?ui=neu`, the Nächste head shows 06's Tageslinse beside "3 von 7 heute · 1 zusätzlich" — a glass lens whose liquid level is today's planned progress, volume-true. On a desktop (> 760 px) with WebGL and without reduced motion it is the one WebGL canvas (Three.js, loaded lazily after first paint); everywhere else, and after a lost context, it is the flat SVG with the same level. Ticking off a todo that counts for today sends a coral bead along a thread from its ring through the left gutter into the lens; the level rises when it lands. `t` (keys, detail, palette) plans a todo for today or takes it off. The phone shows the 52 px flat lens and the full caption, "· 1 zusätzlich" wrapping to a second line when it does not fit. Nothing changes for anyone without `?ui=neu`. |
| **Owning unit** | `fe/layout` — new `layout/lens/LensSlot.vue`, `LensFlat.vue`, `lensController.js`, `lens3d.js` (the only importer of `three`), `BeadFlight.vue`, `useBeadFlight.js`; `layout/AppFrame.vue` mounts `BeadFlight` once. `fe/shared` — new `shared/lensMath.js` (volume-true level, flat geometry, the bead's route, when a canvas and a flight are allowed); `shared/dayProgress.js` (`lensCaptionParts`, so the phone can wrap the "zusätzlich" part). `fe/tasks` — `tasks/views/NextPage.vue` (the lens box in the head; on the phone the caption goes under the eyebrow), `tasks/useListPage.js` (a tick that counts for today starts the flight), `tasks/components/ListFrame.vue` (one new slot, `byline`, under the heading; the task detail becomes a chunk of its own, loaded when a todo is first opened — the entry budget, below). `ops` — `frontend/package.json`, `frontend/package-lock.json` (`three` 0.169.0, exact). `tests` — `lensMath.test.js`, `threeIsolation.test.js`, `beadRule.test.js` (new), `dayProgress.test.js`. `docs` — this brief, `build/m11/`. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3–§5; [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (new files only in unit folders; `layout/` imports no feature; tests cover logic). |
| **Governed by** | [ADR 0042](../adr/0042-the-new-ui-coexists-behind-a-switch.md) (old side unchanged). [ADR 0007](../adr/0007-frontend-test-scope.md) (pure logic tested, no component mounting). |
| **Rule IDs introduced** | **None.** No change to `architecture.toml`, none to `ops/structure-baseline.toml`: `shared/lensMath.js` has four importers (the cap), the bead's rule reaches `useListPage.js` through `useBeadFlight.js` instead of a fifth import. |
| **Entry points** | `levelToHeight()`, `heightToLevel()`, `flatLensShape()`, `canvasAllowed()`, `flightAllowed()`, `beadRoute()`, `easeOut`, `easePull`, `LAND_MAX_MS`, `settleWithin()`, `landingBook()`, `hairlineColour()` (`shared/lensMath.js`); `lensCaptionParts()` (`shared/dayProgress.js`); the controller's `registerSlot()`, `unregisterSlot()`, `sync()`, `setLevel()`, `entry()`, `drop()`, `visibleSlot()`, `liveSlot`, `lensState`; `readyBead()`, `flyToLens()` (returns `{landed, cancel}`), `useShownProgress()`, `landings` (`useBeadFlight.js`); `Fx`, `LIGHT_LOOKS`, `LIGHT` (`lens3d.js`). |
| **Affected public surfaces** | **None.** No route, no storage key, no API call. One new runtime dependency, `three@0.169.0` (MIT, `RULE-DEP-002`), pinned exactly, its lockfile written under Node 20 / npm 10. |
| **Known dependents** | From `./run impact` before the code: `frontend/package.json` (unit `ops`, no import dependents); `tasks/views/NextPage.vue` → `router/index.js` → `main.js`; `tasks/useListPage.js` → `ListFrame.vue` → the five list pages: only a tick that counts for today, on a page with a visible lens, behaves differently (the flight); the write itself, its notice and Rückgängig are unchanged. `./run map frontend/src/layout`: sixteen files of `fe/layout`; `lens/` is new. Added during the work: `./run impact tasks/components/ListFrame.vue` → `AllPage`, `InboxPage`, `NextPage`, `SomedayPage`, `WaitingPage` (→ router, `main.js`): the new slot is optional and only Nächste fills it; the detail behaves as before once loaded (driven: click, `Enter`, `e`, `Esc`, `?task=`). `./run impact shared/dayProgress.js` → `tasks/stores/gtd.js`, `useListPage.js`, `NextPage.vue`: an added export; `lensCaption()` unchanged. `layout/AppFrame.vue` mounts one overlay that is empty unless a bead flies. |
| **Uncertain / dynamic areas** | **`BLIND-FE-002` (F14)** — `lensController.js` reaches `lens3d.js` only through `import()`, and `ListFrame.vue` now reaches `TaskDetail.vue` the same way, so the index records both edges as UNKNOWN and `./run impact` on either target names no dependent (their one user each is that file); `threeIsolation.test.js` pins that `lens3d.js` is the only file importing `three` and is reached only dynamically. **F13** — the index credits no frontend test; protecting tests are named below. `RISK-TEST-004` — WebGL rendering, the flight's animation and the slot sync are not unit-tested by construction; their rules are (`lensMath.js`), the rest is driven on the harness. |
| **Analogous implementations** | `06-kombination/lens.js` (`createLens`, `sync`, `load`, `entry`, `drop`), `lens-flat.js` (`levelToHeight`, `flatLens`), `lens3d.js` (`Fx`), `web.js` (`renderHead('next')`'s lens box, `syncProgress`, `flyToLens`, `complete`), `combo.css` (`.lensbox`, `.lens-slot`, `.lf-*`, `.flight`, `.bead`, the phone block); in this repository `tasks/useCardSpring.js` (frames only while moving, a dev frame counter) and `tasks/views/InboxPage.vue` (a lazy chunk). |
| **Delivery Pattern** | **New Capability** (units declared in M0), plus a dependency. |
| **Required tests** | New: `frontend/tests/lensMath.test.js` — level ↔ height volume-true (half at the middle, monotonic, the cap's volume matches), clamping, the flat shape; `frontend/tests/threeIsolation.test.js` — a static scan of `frontend/src`: no file except `layout/lens/lens3d.js` imports `three`, nothing imports `lens3d.js` statically, and the controller imports it with `import()`; `frontend/tests/beadRule.test.js` — when a flight is allowed (counts, a visible slot, motion allowed, a ring to start from) and when a canvas is (width, reduced motion, WebGL), the route stays in the gutter and above the head. Extended: `dayProgress.test.js` (`lensCaptionParts`). Existing that protect touched code: `dayProgress.test.js`, `gtdRules.test.js` (`planPayload`), `commands.test.js` (`t`). |
| **Intended scope** | The files above. **Not** in scope: the margin's "Heute" with its 72 px lens and the lens box opening it (M12), the rail's 14 px ring, the old UI. |
| **Base revision** | `3fd22b9` (`main`, M10 merged) |

## Design

- **One canvas, moving slots** (06 `lens.js`). A page renders `<LensSlot :size :level>`: a sized box with the flat SVG
  inside. Slots register with one module-level controller; `sync()` (on mount, unmount, resize, scroll, theme and
  motion changes) picks the first slot on screen and moves the single canvas into it — only on a desktop (> 760 px),
  with WebGL, without reduced motion. Every other slot keeps the SVG at the same level.
- **Lazy Three.js.** `import('./lens3d.js')` in `requestIdleCallback` once a slot is on screen and a canvas is allowed;
  never on the phone, never with reduced motion, never on a page without a slot (the Inbox). `webglcontextlost` drops
  the canvas for good and the SVG takes over at the same level.
- **0 frames at rest.** The renderer draws only when a value changes and while the bead, the wobble or the level
  spring move; a hidden tab draws nothing. `window.__runway.lens` (dev builds only) counts frames and canvases.
- **The bead** (06 `flyToLens`). A tick that counts for today (`countsAsPlanned`, the hold's `plannedAtHold`) with a
  visible slot and motion allowed sends one coral bead from the ring along a thread through the left gutter, up the
  band above the head, and down into the lens; there the 3D bead falls into the liquid (or, on the SVG, the level
  simply rises). While it flies the caption and the level stay at the old numbers, so "3 von 7" turns into "4 von 7"
  when it lands. The write, its hold, its notice and Rückgängig do not wait for it.
- **Light lens "tuned A"** (judge weak point 4): see below and `build/m11/README.md`.
- **Phone:** the 52 px flat lens (no canvas, plan D5) and the full caption under the eyebrow; the eyebrow keeps its one
  line, and "· 1 zusätzlich" wraps onto its own line only where the whole caption does not fit (its two parts never
  break inside).

## Where this departs from the plan or the prototype

- **The light-lens choice.** The plan asks Uli to pick from three stills (current, tuned A, tuned B) before the merge.
  Uli was not available for the pick; under his standing order of 2026-11-10 (build and roll out the whole layout
  without stopping) the lens ships **tuned A** per the plan's light-mode guidance. This does not close the plan step:
  the stills go into the PR description and his choice stays open below, and the three stills are in
  `build/m11/` (`lens-light-current.png`, `lens-light-a.png`, `lens-light-b.png`). All three are one table in
  `lens3d.js` (`LIGHT_LOOKS`); **Uli can switch later** by changing `LIGHT` to `'current'` or `'b'`.
- **The task detail is lazy.** With the lens the entry JS was 133.3 kB gzip, over the plan's 130 kB while both UIs ship.
  The lens itself must paint with the page (the flat SVG is its first paint), so the detail (`TaskDetail.vue` and its
  fields, 4.9 kB JS + 1.5 kB CSS gzip), which shows only once a todo is opened, became a chunk of its own, as M10 did
  with the card stack. The first open of a session waits for that chunk (local: a few ms).
- **The phone caption** sits under the eyebrow, not beside the lens: the plan wants the full caption there, and beside a
  single-line eyebrow it does not fit at 412 px (the eyebrow wrapped instead).
- **The lens box is not a button yet** (06 opens the margin's "Heute" with it; that panel is M12). The rail's 14 px ring
  (06 `miniLens`) is not on M11's list and is not built.
- **The thread's band** runs between the top line (M9; 06 had none) and the eyebrow.
- **No cheaper material on WebKit:** the render's own time per frame during the bead is at most 4 ms on Playwright
  WebKit (median 1 ms, `gl.finish()` included), so the fallback the plan allows was not needed. The first measurement
  timed the interval between frames (the display's pace, median 17 ms) and missed a 37–52 ms first-bead stall; see
  the review below.

## Open points

- **Uli's choice of the light lens** (`build/m11/lens-light-*.png`, also in the PR): tuned A ships; the plan's
  "Uli picks before merge" is not met by this, it waits for his answer; switching is one constant.
- **Entry budget headroom:** 129.7 kB gzip against 130 kB. M12–M14 add pages; they will need the same care (a lazy
  chunk per page or panel that does not paint first) or a decision on the budget.
- **WebKit on real Safari:** measured in Playwright WebKit on the MacBook (GPU); M15 does the full Safari pass, the
  iPhone included (the phone never gets a canvas).
- `make verify` GREEN locally except its container tier, skipped: Docker is not running here (`RISK-TEST-001`); CI runs it.

## Pre-checks

- **Before the code:** `make check` GREEN on `ui/m11-tageslinse` at `3fd22b9` (after `make fix` rebuilt the stale
  index). `./run impact frontend/package.json`, `./run impact frontend/src/tasks/views/NextPage.vue`,
  `./run impact frontend/src/tasks/useListPage.js`, `./run map frontend/src/layout`; `./run brief --paths` for the four.

- **After it**, `./run map` puts the new files where intended: `layout/lens/LensSlot.vue`, `LensFlat.vue`,
  `lensController.js`, `lens3d.js`, `BeadFlight.vue`, `useBeadFlight.js` in `fe/layout`; `shared/lensMath.js` in
  `fe/shared`; the three new tests in `tests`.
- **Dependency:** `three` `0.169.0` (exact) in `frontend/package.json`; the lockfile regenerated under the declared Node 20
  with npm 10.9 (`npx -p node@20 -p npm@10 npm install --package-lock-only`: Docker, which `tools/npm-lock.sh` uses, is not
  running here; the same npm the script would use). The lockfile gains exactly `three` (MIT). `RULE-DEP-002` GREEN.
- **Fan-in (`RULE-ARCH-003`):** red at first for `vue` = 5 — not an import of Vue: the index reads `import('vue')` in a
  JSDoc type as a dynamic import (as in `useMedia.js`, `useTheme.js`, `useFrame.js`, `useFreshness.js`); the new
  `useBeadFlight.js` was the fifth. Its JSDoc no longer names the type that way. No baseline raise.
- **Tests:** vitest 604 → 637 (35 files; new `lensMath.test.js` 7, `beadRule.test.js` 20 (8 of them from the review),
  `threeIsolation.test.js` 5; `dayProgress.test.js` 8 → 9). `make check` GREEN (after `make fix` rebuilt the index). `make verify` GREEN (container
  tier skipped, above). `./run surfaces` clean: no route, storage key or API change.
- **Gates:** `./run violations` — only the two declared cycles (`CYCLE-001`, `CYCLE-002`). The old UI's files are untouched
  (`git diff --stat 3fd22b9` over `components/`, `views/`, `stores/`, `router/`, `App.vue` is empty).
- **Budgets** (`vite build`): entry JS 129.7 kB gzip (≤ 130; 129.4 before the review), CSS 14.1 kB gzip (≤ 20), lens chunk 122.2 kB gzip (≤ 180),
  detail chunk 4.9 + 1.5 kB gzip. On the production build the lens chunk is requested at 93 ms, after the first
  contentful paint (56 ms), on desktop Nächste only — never on the Inbox, Warten auf or the phone.
- **Acceptance on the harness** (own backend on :8031, Vite on :5197, preview on :5198, the 06 demo set with 06's day
  plan, Chrome with the GPU and WebKit; every number in
  [`build/m11/README.md`](../design/2026-10-31-unified-ui/build/m11/README.md)): 0 lens frames over 3 s idle;
  48–54 frames per planned completion (≤ 60); one canvas at most, none on the phone, the Inbox, with reduced motion or
  after a lost context; `WEBGL_lose_context` → the SVG at the same level; the dark lens as 06's; the bead only for a todo
  that counts ("Kellerregal" ticked: no bead, "· 1 zusätzlich"); `t` from the keys, the detail and the palette sends
  `{"scheduled":"2026-11-10"}` / `{"scheduled":""}` and moves the denominator; render time per frame during the bead
  ≤ 4 ms on WebKit, ≤ 2 ms in Chrome (after the review).
- **Fixed after looking at the shots:** the hairlines first showed as a grey square (a canvas gradient from transparent
  black greys the paper; it now fades from the ground itself); the first bead cost one 233 ms frame (a shader compiled
  on first use; every program is now compiled when the lens loads); the phone eyebrow wrapped beside the full caption
  (the caption moved under it).
- **Accessibility:** axe-core 4.10.2: 0 serious or critical issues in all twelve shot states; the lens and the bead are
  `aria-hidden` and take no focus; the caption is text; 200 % zoom at 1440 px: no horizontal scroll.
- **Shots:** `build/m11/` — `web-next-desktop-{light,dark}`, `web-signature-desktop-{light,dark}`,
  `web-signature-early-desktop-light`, `web-reduced-desktop-{light,dark}`, `next-narrow-{light,dark}`,
  `web-phone-next-{light,dark}`, WebKit desktop and phone,
  `lens-light-{current,a,b}`, `lens-dark`, `lens-context-lost-light`, `next-zoom200-light`. Compared with 06's
  `web-signature`, `web-reduced`, `web-dark`, `web-phone`, `web-phone-dark`; deviations above.
- **Review (2026-11-10), nine findings, six distinct, each verified against the code and driven on the harness**
  (`build/m11/README.md` § After review). Five fixed, one left open:
  - **Fixed — a bead could hold the caption for the session** (three findings). `dropBead` ran its fall as the one
    animation named `bead`; a second bead landing within the first one's 260 ms fall replaced it, so the first promise
    never settled and `flights` never went back to 0; a hidden tab clearing the animations and a lost context did the
    same. Now every fall's promise settles exactly once (`landingBook`: on landing, or when a newer bead, a hidden tab
    or a lost context takes it away), and `flyToLens` counts a flight as landed at most `LAND_MAX_MS` (1 s) after it
    reaches the lens (`settleWithin`), whatever the lens does. Driven: two planned ticks 120 ms apart → "5 von 7 heute",
    level 0.7143; `loseContext()` during the fall → the flat lens at 4 von 7, the next tick 5 von 7. Tests: 6 in
    `beadRule.test.js`.
  - **Fixed — Rückgängig during the flight let the bead land** (two findings): the lens rose to the undone level and
    the caption rolled, or the WebGL liquid stayed high while the caption showed the old count. `flyToLens` returns
    `{landed, cancel}`; the notice's Rückgängig (`leave`'s new `onUndo`) cancels a flight still in the air: bead and
    thread go, nothing lands, nothing rolls. A bead already falling drops to the store's level if it has fallen since,
    and the last bead down re-syncs the lens with the store. Driven: `z` 300 ms after the tick → no bead, level
    0.4286 and "3 von 7 heute" throughout.
  - **Fixed — the WebKit budget was measured on the wrong quantity.** `frameMs` timed the interval between frames, and
    its median 17 ms is above the plan's 16 ms. The render's own time (`renderMs`, with `gl.finish()` in the dev
    measurement) showed the real fault: the first bead's first two frames took 37 and 52 ms on WebKit (20 and 36 in
    Chrome), its geometry first reaching the GPU there. The lens's first frame now draws the bead once out of sight;
    after it the render time is max 4 ms on WebKit, 2 ms in Chrome, and the 44 ms interval is gone. The brief and the
    README no longer call the interval the frame time.
  - **Fixed — the hairlines did not show.** The 2.4× meant to strengthen the 10 % rule colour was a `globalAlpha`
    clamped at 1, so tuned A and B both drew 10 %. It is now in the stroke colour's alpha (`hairlineColour`: A 24 %,
    B 14 %); the re-shot stills show the rules refracted through the upper body. Tests: 2 in `beadRule.test.js`.
  - **Fixed — the signature shot's description** said the thread ran up the gutter; at 330 ms only the part ahead of
    the bead is left. The README now says what the shot shows, and `web-signature-early-desktop-light.png` (190 ms)
    shows the whole thread from the ring.
  - **Open — Uli's pick of the light lens.** The finding holds: shipping tuned A does not meet "Uli picks before
    merge". The stills go into the PR; his choice is an open point above, not closed by this brief. The claim that A's
    body "reads clear" is softened to "lighter than `current`".
