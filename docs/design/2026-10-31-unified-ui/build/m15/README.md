# M15 — the phone, WebKit, accessibility and performance pass (brief 0062)

Taken 2026-11-11 on an own dev harness (real backend, Taskwarrior 3.5.0, **06 demo set**): the backend on **:8065**
over a fresh data root and users database in the session's scratchpad (`BOOTSTRAP_ADMIN=m15-ph`,
`LOGIN_RATE_LIMIT` raised for the runs), the Vite dev server on **:5265** proxying to it, and the production build
(`vite build`) served for the budgets by a small static server that sends what `frontend/nginx.conf` sends (ETag and
Last-Modified, no `Cache-Control`; `vite preview` sends `no-cache`, which changes WebKit's font reuse, see below).
Users `m15-ph` (admin), `m15-u` and `m15-k`, each seeded with the 06 demo set shifted from 31.10. to 11.11. (M14's seed:
Garten resting, Messestand-2026 finished, Podcast stalled, eight todos done this week); `m15-k` has six more Inbox
todos for the keyboard checks. Earlier drives on the same users left their traces (the duplicate "Rückruf
Steuerbüro" and "M15 Notiz Probe" captures; ticked Kellerregal, Rosen and others).

**Engines.** Chrome 157 (installed Google Chrome, GPU on, as `shared/tools/shot.mjs`) and Playwright WebKit 18.0
(Safari 18's engine), driven by scratch Playwright scripts with real clicks, taps and keys. Desktop 1440×900, narrow
1024×768, phone = Pixel 9 412×915 @2x (mobile, touch). **No real device:** Gboard, iOS Safari and Safari 18 itself
are open for Uli (brief 0062, Open points).

**The keyboard is simulated.** Neither Playwright nor Chrome DevTools can raise an on-screen keyboard. The harness
replaces `window.visualViewport` with one 336 px shorter (m3's Gboard measure) while the layout viewport keeps its
915 px — what Chrome on Android (since 108) and Safari report while the keyboard is up. The `kbd` shots show the
white keyboard area under the frame.

## Shots

Every view of the new UI in the kit (plan §5): `<view>-desktop-{light,dark}`, `<view>-narrow-light`,
`<view>-phone-{light,dark}`, `<view>-desktop-webkit`, `<view>-phone-webkit` for `inbox` (list), `stack` (the Inbox as
the card stack), `next`, `waiting`, `someday`, `all`, `projects`, `project` (Website-Relaunch), `review`, `settings`;
`login-desktop-light`, `login-phone-dark`, `login-phone-webkit`. axe-core 4.10.2 ran on every state as it was shot:
**0 serious or critical in all 82**, no horizontal scroll, no console error or warning (WebKit's dev-server note about
the preloaded font aside).

| Shot | What it shows |
|---|---|
| `inbox-kbd-notice-phone-light`, `-webkit` | The phone Inbox (list) with the keyboard up and "In Inbox ✓ · Rückgängig" in the dock: the heading and Liste · Stapel folded, the eyebrow names the list, **6 full rows** (m3 asks 5) |
| `inbox-kbd-phone-dark` | the same without the notice, dark: 7 full rows |
| `next-kbd-phone-light` | Nächste with the keyboard up: caption and lens box folded, the chips stepped aside, 5 full rows (the 6th cut by the dock) |
| `project-kbd-phone-light` | a project's "Neue Idee" field focused with the keyboard up: the field above the keyboard |
| `next-notice-phone-light` | Nächste after a tick: "Erledigt · Rückgängig" in the dock above the 48 px chips, in the flow — no row under it |
| `next-phone-light` etc. | the dock's chips as 48 px targets (the pill stays 32 px) |
| `review-phone-light` | Rückblick's step buttons 44 px wide |
| `project-phone-light` | "← Projekte" as a 44 px target |
| `palette-desktop-light` | ⌘K over Nächste: everything behind it inert (axe now 0; it found the overdue meta under the scrim at 4.07:1 before) |
| `next-reduced-desktop-light` | reduced motion: the flat lens, no canvas |
| `next-zoom200-light` | 200 % zoom at 1440×900 (720×450): the phone layout, no horizontal scroll |
| `old-next-unchanged`, `old-next-phone-unchanged` | `ui=alt`: the old UI, unchanged |

**Compared with the prototype** (`06-kombination/shots/`), shot by shot:

- `next-desktop-{light,dark}` against `web-desktop.png` / `web-dark.png`: the same rail, top line, heading "Was jetzt
  *zählt*", lens beside the tally, chips, `// Fällig · Jetzt · Bald · Später` sections and the margin column (Heute,
  Nachhaken, Projekte, Rückblick). Differences come from the data (eleven todos done today on this seed, so Heute is
  long; Podcast stalled, so Projekte names it) and from earlier milestones' measured choices (rows 45 px instead of
  06's 40, M5; the `+9 zusätzlich` tally, M11).
- `next-phone-{light,dark}` against `web-phone.png` / `web-phone-dark.png`: 06 has its tabs on top and the notice
  floating over a row; here the dock (D2, m3) holds chips, tabs and the field below the list, and the notice sits in
  the flow (`next-notice-phone-light`). The lens is the flat CSS lens (0 canvases at ≤ 760 px).
- `stack-phone-*` against `web-phone-stack.png`: the same toggle, card, tools, "// Was ist es?", five trays and hint;
  the card is as tall as its content (M10's measured criterion, content + ≤ 96 px), 06's is a fixed tall card.
- `palette-desktop-light` against `web-palette.png`: the same field, groups, key hints and foot; the page behind now
  inert. `inbox-desktop-*` against `web-inbox.png`: the same list and docked clarify panel.
- `next-reduced-desktop-light` against `web-reduced.png`: the flat lens, as in 06.
- The `kbd` shots have no 06 counterpart (06 has no keyboard state); they follow m3's `phone.png` and README: no
  heading, tabs above the field, chips aside, the notice pushing the list up.

Looked at every shot: nothing visibly wrong that this milestone owns. Noted, not changed (earlier milestones' accepted
look, no M15 regression — identical in `build/m13/project-phone-*`): on a project's phone page the quiet pills
("Ruhen lassen", "Nächste Aktion festlegen") start at their own padding, so the wrapped "Nächste Aktion festlegen" sits
26 px right of the text edge.

## Phone (Pixel 9, Chrome and WebKit)

| Check | Before | After |
|---|---|---|
| Inbox (list), keyboard up | 5 full rows, **4 with "In Inbox ✓"**; heading and Liste · Stapel stay (first row at 135 px) | **7 rows, 6 with the notice** (first row at 34 px); the same in WebKit |
| Nächste, keyboard up | 4 full rows; the chips (100 px) stay in the dock | 5 full rows; no chips while the keyboard is up |
| Alle / Irgendwann / Warten auf, keyboard up | head stays (first section at 143 / 79 / 79 px) | first section at 34 px |
| First section from the top at rest | Inbox first row 135, Nächste 70, Warten auf 79, Irgendwann 79, Alle 143 (all ≤ 150) | the same |
| On scroll | the head is in the page's scroll and leaves with the first rows | unchanged (Design in the brief) |
| Notice over a row | never (in the flow since M4): `covered = false` on every list page, with and without the keyboard | the same |
| Focus without a keyboard (the Inbox's capture field on open) | — | no fold: only a focused text field *and* a visual viewport ≥ 120 px shorter count |

## WebKit (Playwright WebKit 18.0)

- **Supported and in effect:** `color-mix()` (the eyebrow's colour computes to `color(srgb … / 0.62)`), `100dvh`
  (the phone frame = 915 px = `innerHeight`), `visualViewport` (the frame follows it), `transform-style:
  preserve-3d` (the card stack computes it), container queries, `:has()`, `text-wrap`, `inert`, `fetch` `keepalive`,
  `requestIdleCallback`, WebGL 2.
- **`transmission` cost:** the lens's render time per frame during a planned tick: median 1 ms, max 4 ms (55 frames);
  54 frames for the tick, 0 over 3 s idle. Chrome: 53 frames, intervals 16.7 / max 16.8 ms. No cheaper material needed.
- **`fetch keepalive`:** with a done held (6 s), navigating away fires `pagehide` and the server has the done 34 ms
  later; hiding the tab sends it too (446 ms). Chrome: closing the tab — 135 ms. **WebKit's `page.close()` fires no
  `pagehide`, `visibilitychange` or `beforeunload` at all** (probed with a bare page and a `fetch`/`sendBeacon` on each
  event: Chrome delivered all, WebKit none), so closing a Safari tab during a hold is open for Uli.
- **Storage that refuses writes** (old Safari private mode, a full quota: `setItem` throws): **before, no write
  reached the server** — a tick's done and a capture were lost while the notice said "In Inbox ✓" (Chrome and WebKit).
  After the fix in `useOutbox.js` both are sent (`POST /tasks/{uuid}/done`, `POST /inbox`). Storage blocked entirely
  (`localStorage` itself throws): both UIs show an empty page — a read in the shared `stores/auth.js`, outside this
  milestone (brief, Open points). A private window in today's Safari keeps storage for the window; open for Uli on
  the device.
- **Fonts:** three files, 95.5 kB (Space Grotesk 22.3, JetBrains Mono 31.3, Fraunces 300 italic 41.8; budget 4 files,
  ≤ 160 kB), only Space Grotesk preloaded, every face `loaded` and `document.fonts.check` true for 400/500 Space
  Grotesk, 300 italic Fraunces and JetBrains Mono. Under nginx's headers each file is fetched once in both engines;
  under `vite preview`'s `Cache-Control: no-cache` WebKit fetched the preloaded file a second time.
- **Keyboard:** WebKit's Tab reaches only form fields by default (macOS "Keyboard navigation" off); with ⌥Tab the
  walk matches Chrome's.

## Accessibility

- **axe-core 4.10.2**, 0 serious or critical: all 11 views (with the stack and the login page) × desktop/narrow/phone × light/dark in
  Chrome and desktop/phone in WebKit (88 states); the layers — the detail (desktop, phone sheet), the palette, the `?`
  sheet, "···", the clarify panel, the stack, Heute on the phone — in both engines; the 82 shot states. **Fixed:** the
  palette over an overdue row (`color-contrast`, 4.07:1 under the scrim): what is behind the palette and the `?` sheet
  is now inert while they are open. The moderate `region` finding of M5–M14 is gone (the capture form is named, the
  dock's chips are a labelled region).
- **Keyboard-only walk** (Tab through each list page, Projekte, a project, Rückblick, Einstellungen; Chrome and WebKit
  with ⌥Tab): 21–43 distinct stops per page, the walk cycles back to its start (no trap), every stop has the focus
  ring except the text fields, whose focus is the caret and 06's yellow rule (see Open points in the brief). Palette
  and sheet: Esc, a scrim click, ⌘K ⌘K, `?` then ⌘K then Esc all give the focus back to the cursor row; "Neues Todo"
  from the palette lands in the capture field.
- **Touch targets** on the phone (every visible interactive element measured): all ≥ 44 px, the dock's ≥ 48 px, but
  the inline "den Skill herunterladen (.zip)" link in running text (WCAG 2.5.8's inline exception) and Einstellungen's
  code blocks (`<pre tabindex=0>`, focusable for keyboard scrolling, not tap targets). **Fixed:** the dock's chips
  (44 → 48), Rückblick's step buttons (38 → 44 wide), "← Projekte" (32 → 44), a project's add fields (40 → 44).
- **200 % zoom** (720×450) on every view, Chrome and WebKit: no horizontal scroll.

## Budgets (production build)

| Budget | Value | Measured |
|---|---|---|
| Lens frames while idle | 0 over 3 s | 0 (Chrome, WebKit) |
| Lens frames per planned completion | ≤ 60 | 53 Chrome, 54 WebKit; 1 for an unplanned tick |
| WebGL canvases | ≤ 1; 0 at ≤ 760 px; 0 on Inbox list | 1 on desktop/narrow Nächste and wide Warten auf (the margin's lens); 0 on the phone and the Inbox list |
| `three` | lazy chunk, after first paint, only with a desktop slot | requested at 81–108 ms after FCP 48–56 ms; never on the phone or the Inbox list. **Fixed:** one cold Chrome start requested it at 452 ms with FCP at 856 ms (the GPU held the paint); it now waits for the first contentful paint |
| Entry JS (gzip) | ≤ 130 kB while both UIs ship | **129.84 kB** (M14: 129.18) |
| Lens chunk (gzip) | ≤ 180 kB | 122.22 kB |
| CSS (gzip) | ≤ 20 kB | 13.54 kB (entry) |
| Fonts | 4 woff2, ≤ 160 kB, only Space Grotesk preloaded | 3 files, 95.5 kB, Space Grotesk preloaded |
| Tick off → struck | ≤ 100 ms; out of the list ≤ 1 s | struck and out of the accessibility tree 38–59 ms (Chrome), 36–39 ms (WebKit); out of the list 318–323 ms |
| Snapshot refresh | 5 requests, at most once per 30 s | 5 (`/gtd/summary`, `/tasks`, `/gtd/waiting`, `/tasks?completed_since`, `/gtd/projects/overview`; plus the session's `/auth/me`); focus and visibility twice within 30 s: 0 more |
