# Change Impact Brief 0063 — The new UI is the default

| Field | Value |
|---|---|
| **Requested outcome** | Milestone **M16** of [the plan](../plan/unified-ui-web.md) (the plan calls it 0062; the numbers moved by one because 0056 went to a vanished user's 401): a browser that never chose renders the **new UI**. `shared/uiFlag.js`'s default becomes `neu`; `?ui=alt` still reaches the old UI and is remembered per browser as before, and a browser that stored `alt` keeps it. `frontend/index.html` carries the product's name as its title (`runway`, the new UI's `brand.product`) and the page background from the design tokens as `theme-color`. `README.md` and `frontend/AGENTS.md` say the new UI is the default. Nothing is deleted: the old UI stays reachable until M17. |
| **Owning unit** | `fe/shared` — `shared/uiFlag.js` (the default). `ops` — `frontend/index.html` (title, `theme-color`). `docs` — `README.md`, `frontend/AGENTS.md`, this brief, `build/m16/`. `tests` — `frontend/tests/uiFlag.test.js` (the default's cases), new `frontend/tests/indexHtml.test.js` (the page's title and `theme-color` hold to the message table and the tokens). |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3–§5 (the SPA routes and storage keys are public surfaces: neither changes here); [`frontend/AGENTS.md`](../../frontend/AGENTS.md). |
| **Governed by** | [ADR 0042](../adr/0042-the-new-ui-coexists-behind-a-switch.md) (Decision 1: "M16 changes the default to `neu`, and `?ui=alt` then still reaches the old UI"; the contract step). [ADR 0007](../adr/0007-frontend-test-scope.md) (pure logic tested, no component mounting). |
| **Rule IDs introduced** | **None.** No change to `architecture.toml`, `ops/structure-baseline.toml`, the ledger or the waivers. |
| **Entry points** | `UI_DEFAULT`, `resolveUi()`, `currentUi()` (`shared/uiFlag.js`, signatures unchanged); `frontend/index.html`. |
| **Affected public surfaces** | **No surface changes shape:** no route, no storage key (`ui` keeps its two values), no API call, no env var; `./run surfaces` stays clean. **What a surface means changes:** an SPA route opened in a browser that never chose now renders the new UI — every bookmark, the Android app's Custom Tab URLs (`/next?task=<uuid>`, `/login?next=`), and the login page. This is the *switch* step of the Public-Surface Migration that ADR 0042 opened (M0 expand, M1–M15 migrate behind the switch). |
| **Known dependents** | From `./run impact` before the code: `shared/uiFlag.js` → `App.vue`, `router/index.js`, `router/pick.js`, and through them `main.js` (every page). `router/index.js` → `main.js`. `frontend/index.html` (`ops`) → no import edge; it is the page every route serves. The old views and components import none of these. |
| **Uncertain / dynamic areas** | **F13 / `BLIND-TEST-001`** — the index credits no frontend test; the protecting tests are named below. **`BLIND-FE-002`** — the lazy pages (`router/lazyPages.js`) are dynamic imports, unchanged here. **`RISK-TEST-004`** — which side a route renders is rendering; the decision is tested in `uiFlag.test.js`, the rendering is checked on the harness (Pre-checks). **Production is not observed from this session**: the host is not reachable from here (below), and the acceptance "kit on production with a second account" can only run after the merge deploys. |
| **Analogous implementations** | M0 (brief 0046), which set the default to `alt` and shot the old UI before and after; every milestone since has shot `ui=alt` unchanged (`build/m15/old-next-unchanged.png`). |
| **Delivery Pattern** | **Public-Surface Migration**, step *switch* (`docs/change-workflow.md`). Reversible per browser (`?ui=alt`) and per deploy (one SHA back, `docs/operations.md#rolling-back`). The *contract* step is M17 and is not part of this change. |
| **Required tests** | Changed: `frontend/tests/uiFlag.test.js` — with nothing stored and no query the new UI renders; a stored `alt` and `?ui=alt` reach the old UI (also over a stored `neu`); a refused or missing storage renders the new UI, or the query's choice for that load; noise in the query or the store renders the default. New: `frontend/tests/indexHtml.test.js` — `index.html`'s `<title>` is `brand.product` of `shared/messages.de.js`, and its `theme-color` is the light page background the tokens generate (`themeColor.light`, the colour `useTheme` writes for light). Existing that protect touched code: `pick.test.js` (unchanged), `theme.test.js`, `tokens.test.js`, `strings.test.js`. |
| **Intended scope** | The files above. **Not** in scope: deleting anything of the old UI, `pick.js`, the `ui` key or the cycles (M17); a change of the new UI's look or behaviour. |
| **Base revision** | `dd4d3b7` (`main`, M15 merged) |

## Precondition (plan M16)

- **Seven days of Uli's daily use of `?ui=neu` on desktop and phone: waived.** Uli ordered on **2026-11-10** that the
  whole remaining layout (M10–M16) be built and rolled out live, without stopping until production serves the new
  design by default. That order replaces the seven days; it is his call as the owner, recorded here because the plan
  makes the days a precondition. What the days would have found is what M15 lists as open for a real device (brief
  0062, Open points) — they stay open, and `?ui=alt` is the way back for anyone they hit.
- **The `task export` backup of Uli's data on the host: not taken by this change.** `docs/operations.md` names the
  host (`ar00`, reachable as `adm.agentic-reach.com`; the deployment in `/opt/services/runway`, root-owned, with
  `users.db` and `data/`) and has no backup runbook (plan §10 step 4 says so: a manual step). The only access this
  repository documents for the deploy account is CI's key with a forced command (`deploy.sh runway`), which runs a
  deploy and nothing else. A read-only SSH probe to the host from this session was refused by the session's
  permission system (production reads are not granted to it), so no backup was taken and none is claimed. **Uli
  takes it before the merge** (the merge deploys): `task export` of his data on the host into a dated file outside
  the container, as plan §10 step 4 asks, or a dated copy of `/opt/services/runway/data/` and `users.db` — this
  brief names no command for it, because the repository documents none and the account's data path on the host was
  not read. No migration runs in M16, so the backup guards against a write from the new UI, not against this change
  itself.

- **The membership parity check on Uli's account (plan §10 step 2, "again before M16"): not run by this change,
  and not waived.** Uli's 2026-11-10 order waives the seven days; it says nothing about the parity check, so this
  brief does not read it as waiving that too. The check needs Uli's API key against production (`/tasks`,
  `/gtd/waiting`, `/gtd/inbox|next|someday`, then `listOf` over the same tasks), and production is not reachable
  from this session (above). It matters more here than at M5: from the merge on, the client-computed lists
  (`listOf`, with F4's dual-tag rule, brief 0048) are what every account sees by default. **Uli runs it before the
  merge**: the scratchpad script of plan §10 step 2 (or brief 0049's development page, `/next?ui=neu&debug=store` in a dev build over a local copy of his data, which shows the diff)
  against his account, and lists the differences; they must be exactly the F4 dual-tag cases. Any other difference
  stops the merge. On the harness's 06 demo set it was last run in brief 0049; that is not his data.

## Design

- **The default, nothing else** (`shared/uiFlag.js`): `UI_DEFAULT = UI_NEW`. The order stays — a valid query wins over
  the stored choice, which wins over the default — so `?ui=alt` reaches the old UI and stores `alt`, and a browser
  that stored `alt` (anyone who went back once during M0–M15) stays on the old UI until it asks for `?ui=neu`. That is
  the per-browser choice of ADR 0042 Decision 1 respected, not a leftover: overriding a stored `alt` would take back a
  choice someone made. The router's `/review` guard (`newOnly`) and `App.vue`'s host follow `currentUi()`, so both
  follow the new default without a change.
- **The page itself** (`frontend/index.html`): the title `runway` is the product's name in the new UI's message table
  (`brand.product`); `NewUiHost.vue` sets "`<Ansicht> · runway`" per view and restores this title when it leaves.
  `theme-color` is the light page background from the tokens (`#fbf6ee`), the colour `useTheme` writes for light, so
  the browser chrome no longer shows the old plum before the app has started; the app then writes the scheme it
  resolves (the new UI's tokens, or the old UI's own white and gray in `useDarkMode`, as before). One `meta`, not two
  with `media`: `useTheme` writes the first `theme-color` it finds, and a second one for dark would win over a person's
  stored light choice. The old UI's tab title becomes `runway` as well — the one place the old UI changes, as the plan
  lists it.
- **The docs:** `README.md` says the new interface is the default and `?ui=alt` goes back (until M17);
  `frontend/AGENTS.md` says the default is the new UI.

## Where this departs from the plan

- **The precondition** (seven days) is waived by Uli; the backup (§10 step 4) and the membership parity check on his
  account (§10 step 2) are not done from here and are not waived — both are his before the merge (above).
- **Acceptance on production with a second account** runs after the merge, not before: production serves `main`.

## Open points

- **For Uli before the merge:** the backup and the membership parity check on his account (Precondition); a
  difference beyond the F4 dual-tag cases stops the merge.
- **For Uli after the deploy:** the kit on production with a second account (plan §10 step 3: `uli-test`), and
  `?ui=alt` on production reaching the old UI; the open device checks of brief 0062.
- **For Uli, the entry budget:** by Vite's own report the entry is **0.04 kB over** the 130 kB coexistence budget
  (130.04 kB), as it already was on `main` since M15; only at `gzip -9` (129.84 kB, the figure brief 0062 recorded)
  is it under. This change adds nothing (5 bytes less). Which measure counts is Uli's call; M17 brings the entry
  under 100 kB either way, and nothing in M16 depends on the answer.
- **M17** (delete the old UI) waits for 14 days of M16 without a fallback (plan, ADR 0042). Not started here.

## Pre-checks

- **Before the code:** `make check` GREEN on `dd4d3b7`. `./run map` → `shared/uiFlag.js` in `fe/shared`,
  `router/index.js` in `fe/app`, `frontend/index.html` in `ops`, `README.md` and `frontend/AGENTS.md` in `docs`;
  `./run impact` on `uiFlag.js`, `router/index.js` and `index.html` (dependents above); `./run brief --paths` on the
  five files.
- **After the code** (acceptance on 2026-11-11, own harness: backend on :8067 over a scratch data root, this branch's
  production build served like nginx on :5268, `main`'s build on :5269 against the same backend; user seeded with the
  06 demo set as in M15; Chrome 157 and Playwright WebKit 18.0 with real input; servers stopped afterwards; every
  number and shot in [`build/m16/README.md`](../design/2026-10-31-unified-ui/build/m16/README.md)):
  - **A browser that never chose renders the new UI**: `/`, `/next`, `/review`, `/projects/Website-Relaunch` and the
    Custom Tab URL `/next?task=<uuid>` (detail open) — 50 of 50 states on desktop, narrow and phone, light and dark,
    in both engines; `localStorage['ui']` stays unset. Logged out: the new login page at `/login?next=/next`, and the
    form typed and sent lands on `/next` in the new UI (10 of 10). On `main`'s build the same browser gets the old UI
    and `/review` → `/inbox` (the before).
  - **`?ui=alt` still reaches the old UI** and stores `alt`; the next page without a query stays old, `/review` goes
    to `/inbox`; `?ui=neu` brings the new UI back, stores `neu`, and the next page stays new (10 of 10 each).
  - **The old UI is unchanged** but for its tab title: `/next`, `/inbox`, `/projects` with `?ui=alt` on `main`'s build
    and on this one have the same DOM (SHA-256) and byte-identical screenshots (6 of 6), and the same axe findings
    (`color-contrast`, `button-name` on the phone — the old UI's own, there on `main` before this change).
  - **The page:** title "runway" (the new UI then "`<Ansicht> · runway`"); `theme-color` `#fbf6ee` before the app
    starts (was `#3D2B5C`), then the tokens' `#fbf6ee` / `#1b1428` (new UI) or `#FFFFFF` (old UI, as before).
  - **axe-core 4.10.2:** 0 serious or critical on all 90 states of the new UI (both engines) and with reduced motion;
    no horizontal scroll on any of the 120 states nor at 200 % zoom (5 views, both engines); no page or console error.
    Keyboard on the default: Tab through the rail with a visible 2 px outline, `j`, ⌘K / Esc, `g i`, `?` (Chrome; in
    WebKit the keys likewise, Tab reaches fields only — Safari's default).
  - **Shots compared** with 06 (`web-desktop`, `web-dark`, `web-phone`, `web-phone-dark`, `web-inbox`,
    `web-phone-stack`, `web-reduced`) and with `build/m15/`: the default renders M15's views; the deviations from 06
    are the ones earlier milestones recorded (rail lens ring, phone dock at the bottom) and the harness data. Nothing
    visibly wrong was found, so no code changed in the acceptance.
  - **Budgets** (`vite build`): entry JS 130.04 kB gzip as Vite reports it — 0.04 kB over the 130 kB budget, the same
    as `main` (`gzip -9`: 129,833 B here, 129,838 B on `main`, under it — M16 adds nothing); CSS 13.54 kB, lens chunk 122.22 kB, fonts 95,468 B, all unchanged.
    See Open points.
  - **Tests:** vitest 742 → 747 (46 files; `uiFlag.test.js` 13 → 16, new `indexHtml.test.js` 2). The default's cases
    and both `index.html` cases fail on `main`'s sources. `make check` GREEN.
  - **Gates:** `./run surfaces` clean; `./run violations` — only `CYCLE-001`, `CYCLE-002`; no baseline or contract
    change. `frontend/tests/indexHtml.test.js` is inside `frontend/tests/**`, the `tests` unit's path in
    `architecture.toml` (`./run map` finds no untracked file; the index lists tracked files only).
  - **Not done here:** the backup and the membership parity check on Uli's account (Precondition, his before the
    merge), the kit on production with a second account (after the merge).
  - **Review of this change** (2026-11-11), three findings, all accepted, documentation only — no code, test or shot
    changed: (1) the parity check of plan §10 step 2 was missing from the brief — added under Precondition, departures
    and Open points as Uli's step before the merge, not as waived; (2) "either measure holds" contradicted Vite's
    130.04 kB — now stated as 0.04 kB over by Vite's report, under only at `gzip -9`, here and in `build/m16/README.md`;
    (3) `build/m16/README.md` described the seed as "three done today" and "M14's week of done todos", but the shots
    show eleven todos done today — the seed is now described as M14's (eight more done today, eleven in all), and
    "· 8 zusätzlich" and the eleven-row Heute list are listed as harness data. Frontend tests, `make check` and
    `make verify` re-run after the edits (container tier skipped: no Docker locally, CI runs it, `RISK-TEST-001`).
