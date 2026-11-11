# M16 — the new UI is the default (brief 0063)

Taken 2026-11-11 on an own harness: the backend (Taskwarrior 3.5.0) on **:8067** over a data root and users database
in the session's scratchpad, and the **production build** of this branch (`vite build`) served on **:5268** by a small
static server that answers like `frontend/nginx.conf` (SPA fallback, no `Cache-Control`) and proxies `/api` to the
backend. The build of `main` at `dd4d3b7` was served the same way on **:5269**, against the same backend, for the
before/after of the old UI. User `m16b-u`, seeded with the **06 demo set** the way M15 seeded it (shifted from 31.10.
to 11.11.; a context todo gets `next`; Warten auf's date is its follow-up day; the two todos 06 plans for today and the
three done today are scheduled today; one started; M13's resting and finished projects; and, as M14 seeded it, eight
more todos done today — eleven done today in all, each at the seeding time 11:04).
Chrome 157 (installed Google Chrome) and Playwright WebKit 18.0, driven by a scratch Playwright script with real input
(the login form typed and sent with Enter; `j`, ⌘K, Esc, `g i`, `?`, Tab); desktop 1440×900, narrow 1024×768, phone =
Pixel 9 412×915 @2x (mobile, touch), light and dark by `prefers-color-scheme`. The servers were stopped afterwards.

**Each drive starts with empty site data and no `?ui=`**: a browser that never chose. That is the change.

Compared with `06-kombination/shots/web-desktop.png`, `web-dark.png`, `web-phone.png`, `web-phone-dark.png`,
`web-inbox.png`, `web-phone-stack.png` and `web-reduced.png`, and with `build/m15/` (the same views behind `?ui=neu`):
the views a never-chosen browser now gets are M15's, pixel for pixel in layout; the differences to 06 are the ones
M1–M15 recorded and the harness's data (below).

## Shots

| Shot | What it shows |
|---|---|
| `default-inbox-*` | `/` with nothing stored: redirected to `/inbox`, the **new** Inbox (desktop: list with the docked Klären panel; phone: the Stapel, 06 `web-phone-stack.png`); `localStorage['ui']` stays unset — the default is not written |
| `default-next-*` | `/next` with nothing stored: the new Nächste — rail, top line, lens, "3 von 7 heute · 8 zusätzlich" once, chips, Fällig/Jetzt/Bald/Später, margin column (06 `web-desktop.png`, `web-dark.png`); phone: chips and dock at the bottom (M15) |
| `default-review-{desktop,narrow}-{light,dark}` | `/review` with nothing stored: Rückblick is reached. On `main` the `newOnly` guard sends a never-chosen browser to `/inbox` (checked on :5269) |
| `default-customtab-*` | the Android Custom Tab URL `/next?task=<uuid>` with nothing stored: Nächste with the todo's detail open (desktop: the margin panel, cursor on the row; phone: the sheet, `role=dialog`) |
| `default-loggedout-*` | site data cleared, `/next`: `/login?next=/next`, the **new** login page. Then typed in and sent: back on `/next`, new UI, nothing stored |
| `default-next-reduced-desktop-{light,dark}` | reduced motion: the still lens (06 `web-reduced.png`), no canvas |
| `default-next-zoom200-light` | 200 % zoom at 1440 px (720 css px at dpr 2): the phone layout, no horizontal scroll |
| `alt-next-*` | `/next?ui=alt`: the **old** UI, and `ui = alt` stored |
| `alt-kept-inbox-*` | then `/inbox` without a query: still the old UI — the stored choice wins over the default |
| `old-{desktop,phone}-{next,inbox,projects}-unchanged` | `?ui=alt` on this branch, reduced motion; byte-identical to the same page on `main` (below) |

`*` = `desktop-light`, `desktop-dark`, `narrow-light`, `narrow-dark`, `phone-light`, `phone-dark` (Chrome), and
`desktop-light-webkit`, `desktop-dark-webkit`, `phone-light-webkit`, `phone-dark-webkit` (WebKit). The old UI ignores
`prefers-color-scheme` (`useDarkMode`, since cb707b4), so its dark shots equal its light ones and only light is kept.
64 files.

## What was checked — 12 steps × 10 size/scheme/engine combinations, 120 states

| Check | Result |
|---|---|
| Nothing stored: `/`, `/next`, `/review`, `/projects/Website-Relaunch`, `/next?task=<uuid>` | **the new UI** in all 50 states (its frame `.rw` in the page); title "`<Ansicht> · runway`"; `localStorage['ui']` stays `null` |
| `?ui=alt` | the old UI, `ui = alt` stored (10/10); the next page without a query stays old (10/10); `/review` goes to `/inbox` (10/10) |
| `?ui=neu` after that | the new UI again, `ui = neu` stored, and the next page without a query stays new (10/10) |
| Logged out, nothing stored | the new login page at `/login?next=/next` (10/10); the form typed and sent lands on `/next` in the new UI (10/10) |
| Before / after (Chrome, the same backend) | `main`: a never-chosen `/next` renders the **old** UI, `/review` → `/inbox`, static page "Runway — Agentic Reach", `#3D2B5C`. This branch: the **new** UI, `/review` stays, "runway", `#fbf6ee` |
| `theme-color` | the static page before the app starts: `#fbf6ee` (one `meta`); the new UI: `#fbf6ee` light, `#1b1428` dark (the tokens, written by `useTheme`); the old UI: `#FFFFFF` (its own `useDarkMode`, unchanged) |
| Tab title | the new UI "`Inbox · runway`", "`Nächste · runway`", "`Rückblick · runway`", "`Website-Relaunch · runway`", the login page "runway"; the old UI "runway" (was "Runway — Agentic Reach": the one change to the old UI, as the plan lists it) |
| axe-core 4.10.2, serious or critical | **0 on all 90 states of the new UI** (both engines, incl. the login page and the open detail), 0 with reduced motion. The old UI: `color-contrast`, and on the phone `button-name` — the same on `main` (below), not caused by this change; the old UI is deleted in M17 |
| Horizontal scroll | none on any of the 120 states; none at 200 % zoom on `/inbox`, `/next`, `/review`, `/projects`, `/settings` (Chrome and WebKit, overflow 0 px) |
| Page errors, console errors | none on any state |
| Keyboard, nothing stored (desktop) | Chrome: Tab walks the rail (brand, Inbox, Nächste, Warten auf, Projekte, Irgendwann, Rückblick, Alle), each with a 2 px solid focus outline; `j` puts the cursor on the first row; ⌘K opens the palette, Esc closes it; `g i` goes to `/inbox`; `?` opens "Tastenkürzel". WebKit: the same keys work; Tab moves only between the fields (Suchen, Neues Todo), which is Safari's default "Tab reaches fields only", as M15 recorded, not the app |
| Reduced motion | 0 canvases, the still lens (both engines, light and dark) |

## The old UI is unchanged

`/next`, `/inbox` and `/projects` with `?ui=alt`, desktop and phone, Chrome, reduced motion, on the build of `main`
(`dd4d3b7`) and on this branch, the same user and data: the `#app` DOM is identical (same length and SHA-256 per page,
Vue's scope ids stripped: `2174a850…`, `bf2574f6…`, `08b8ffb5…`), the screenshots are **byte-identical** (6 of 6), and
axe reports the same findings in the same numbers on both (desktop `color-contrast` 5/4/4; phone `button-name` 1 and
`color-contrast` 12/1/1). Only the tab title differs.

## Budgets (`vite build`, measured on both builds)

| | Budget | `main` (`dd4d3b7`) | this branch |
|---|---|---|---|
| Entry JS, gzip as Vite reports it | ≤ 130 kB | 130.04 kB (0.04 kB over) | 130.04 kB (0.04 kB over) |
| Entry JS, `gzip -9` | | 129,838 B | 129,833 B |
| Entry CSS, gzip | ≤ 20 kB | 13.54 kB (`gzip -9` 13,492 B) | 13.54 kB (13,492 B) |
| Lens chunk, gzip | ≤ 180 kB | 122.22 kB | 122.22 kB |
| Fonts | ≤ 160 kB, Space Grotesk 400 preloaded | 3 woff2, 95,468 B | the same |

M16 adds nothing to the entry (5 bytes less at `gzip -9`). By Vite's own report the entry is **0.04 kB over** the
130 kB coexistence budget (130.04 kB), as it already was on `main` since M15; brief 0062 recorded 129.84 kB, the
`gzip -9` figure, which is under it. Which measure counts is Uli's call, the open point in brief 0063; M17 brings the
entry under 100 kB either way. The frame and tick-off budgets
are M11's and M15's and untouched here (no file of the lens or the lists changes).

## Seen, not changed here (recorded earlier)

- **The rail's 14 px lens ring** beside "Nächste" (06 `miniLens`) is not built — `build/m11/README.md`, not in any
  milestone's list.
- **The phone puts chips and the dock at the bottom**, not 06's top tabs — M4/M15's dock order (m3), as reviewed.
- **06's "Nachhaken · 1 heute" and "ohne Kontext"** do not show: the harness data has no waiting todo due today and no
  `next` todo without a context; the views are M12's and M5's.
- **"3 von 7 heute · 8 zusätzlich" and the eleven-row Heute list** (06: "3 von 7 heute", three done rows): the harness
  seeds M14's eight extra todos done today, so the count and the list show them. Harness data, not a deviation of
  the views (M15 recorded the same kind of tally, `+9 zusätzlich`).
- **At 200 % zoom** the chips and the dock take the lower 40 % of the 450 px viewport (M15's `next-zoom200-light.png`
  is the same).

## Not done here

- **The kit on production with a second account** (`uli-test`, plan §10 step 3) and `?ui=alt` on production:
  production serves `main`, so it runs after the merge deploys.
- **The backup on the host** (plan §10 step 4): see brief 0063, Precondition.
- **A real device** (Gboard on the Pixel 9, iOS Safari, Safari 18 on macOS): open since brief 0062.
