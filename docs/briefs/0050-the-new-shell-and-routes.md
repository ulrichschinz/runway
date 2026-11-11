# Change Impact Brief 0050 — The new shell and routes

| Field | Value |
|---|---|
| **Requested outcome** | Milestone **M4** of [the plan](../plan/unified-ui-web.md): the new UI's frame. Behind `?ui=neu` every route renders the new shell — rail with counts and the outbox line on wide screens, the bottom dock (tabs `Inbox · Nächste · Warten auf · ···`, the "Mehr" sheet) on phones — around a placeholder page that says "kommt" until its milestone lands. New route `/review`; `?task=<uuid>` opens the todo (a placeholder showing its description until M7); an unauthenticated visit goes to `/login?next=<path>` and the new login page returns there. Nothing changes for anyone without `?ui=neu`. |
| **Owning unit** | `fe/layout` — new [`layout/AppFrame.vue`](../../frontend/src/layout/AppFrame.vue), [`RailNav.vue`](../../frontend/src/layout/RailNav.vue), [`PhoneDock.vue`](../../frontend/src/layout/PhoneDock.vue), [`MoreSheet.vue`](../../frontend/src/layout/MoreSheet.vue), [`MarginColumn.vue`](../../frontend/src/layout/MarginColumn.vue), `ComingPage.vue` (deleted in M14, brief [0061](0061-review-and-settings.md): every route has its page), `layout/ui/` (`EyebrowLine`, `PageHeading`, `PillButton`, `SectionRule`, `EmptyState`). `fe/app` — new [`router/NewUiHost.vue`](../../frontend/src/router/NewUiHost.vue), [`assets/rw-base.css`](../../frontend/src/assets/rw-base.css); [`router/index.js`](../../frontend/src/router/index.js), [`App.vue`](../../frontend/src/App.vue), [`main.js`](../../frontend/src/main.js). `fe/identity` — new [`identity/LoginPage.vue`](../../frontend/src/identity/LoginPage.vue). `fe/shared` — new [`shared/returnPath.js`](../../frontend/src/shared/returnPath.js), [`shared/navigation.js`](../../frontend/src/shared/navigation.js), [`composables/useFrame.js`](../../frontend/src/composables/useFrame.js), [`composables/useMedia.js`](../../frontend/src/composables/useMedia.js); keys added to [`messages.de.js`](../../frontend/src/shared/messages.de.js). `fe/tasks` — `reviewDue` added to [`tasks/stores/gtd.js`](../../frontend/src/tasks/stores/gtd.js) (the rule itself in `fe/shared` [`shared/gtdRules.js`](../../frontend/src/shared/gtdRules.js)); `fe/shared` [`api/client.js`](../../frontend/src/api/client.js) keeps `?next=` on a 401. `ops` — [`ops/surfaces/spa.json`](../../ops/surfaces/spa.json) (route `/review`), [`ops/structure-baseline.toml`](../../ops/structure-baseline.toml) (one dated line). `tests` — [`returnPath.test.js`](../../frontend/tests/returnPath.test.js), [`navigation.test.js`](../../frontend/tests/navigation.test.js). `docs` — this brief, [`build/m4/`](../design/2026-10-31-unified-ui/build/m4/README.md). |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3–§5; [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (new files only in unit folders; `layout/` imports no feature; route guards on the record, not the page; tests cover logic). |
| **Governed by** | [ADR 0042](../adr/0042-the-new-ui-coexists-behind-a-switch.md) (the switch; the old side of every route is untouched). [ADR 0007](../adr/0007-frontend-test-scope.md) (pure logic tested, components not mounted). |
| **Rule IDs introduced** | **None.** One ratchet line in `ops/structure-baseline.toml`: `frontend/src/stores/auth.js = 5` (dated, see *Known dependents*). Approved by Uli as owner per the run's standing instruction — **not an independent approval (`RISK-GOV-001`)**. |
| **Entry points** | Routes (all through `pick()`, new side `ComingPage`); `/review` (new UI only); the global guard (`loginRedirect`, new-only routes); `NewUiHost` (provides the frame via `provideFrame`); `useFrame()`; `safeNext()`, `taskParam()`, `loginRedirect()`; `navKeyOf()`, `dockKeyOf()`. |
| **Affected public surfaces** | **Route `/review` added** (`./run surfaces --update`, diff in *Pre-checks*). **Query handling:** `?task=<uuid>` honoured by the new UI; `/login?next=<path>` written by the guard for every user (the old `LoginView` ignores it until M16, so what the old UI shows is unchanged — only the address bar carries `?next=`). No new storage key, no REST/MCP change. |
| **Known dependents** | From `./run impact` before the code: `AppShell.vue` → the seven old views; `router/index.js` → `main.js`; `BrandMark.vue` → `AppShell.vue`; `stores/auth.js` → `AppShell.vue`, `LoginView.vue`, `SettingsView.vue`. **Changes:** `stores/auth.js` gains `NewUiHost.vue` (username, Abmelden) and `LoginPage.vue` → 5 importers over the cap of 4 (`RULE-ARCH-003`); dated ratchet line, back to 2 when M17 deletes the three old importers. `BrandMark.vue` gains `RailNav.vue` and `LoginPage.vue` (3). `useTheme.js` gains `NewUiHost.vue` and `LoginPage.vue` (3). `AppFrame.vue` imports no store: `./run impact frontend/src/layout/AppFrame.vue` must show only `fe/shared` and `fe/layout` dependencies (*Pre-checks*). |
| **Uncertain / dynamic areas** | **F13** — the index credits no frontend test; protecting tests named below. `RISK-TEST-004` — the frame, dock, sheet, focus handling and `visualViewport` are not tested by construction; driven on the harness and in screenshots instead. `visualViewport` on a real phone keyboard (Pixel 9, iPhone) is Uli's device step. |
| **Analogous implementations** | `06-kombination/web.js` (`renderRail`, the phone bar, `tocPanel`, `render`'s layout classes), `web.css` (rail, page, margin, breakpoints 1180/760), `base.css` (eyebrow, display, pill, ctx, kbd, focus ring); `mobile/m3-papier-mobil` (`style.css` thumb zone: notice, chips, tabs 52 px with `1fr 1.1fr 1.3fr 48px`, field; the "Mehr" menu opening upward); old `views/LoginView.vue` (login and registration flow). |
| **Delivery Pattern** | **New Capability** (`fe/layout`, `fe/identity`, `fe/shared` units declared in M0) + **Public-Surface Migration, step expand** (route `/review`, `?task=`, `?next=`). |
| **Required tests** | New: `frontend/tests/returnPath.test.js` (`next` only as a same-origin relative path: protocol-relative, backslash, scheme, control characters, `/login` loops, non-strings refused; `?task` only a well-formed uuid; `loginRedirect` keeps the full path), `frontend/tests/navigation.test.js` (rail and dock mapping: `project` → Projekte, every non-tab view → `···`, every list has a route and a label key). Existing that protect touched code: `pick.test.js` (one wrapper for every route), `strings.test.js` (every `t('…')` literal exists), `uiFlag.test.js`, `useTheme.test.js`, `i18n.test.js`. |
| **Intended scope** | The files above. **Not** in scope: lists, rows, notices with content, capture, detail, palette, shortcuts, margin panels (M5–M12); the old UI's views and `LoginView`. |
| **Base revision** | `9d00193` (branch `ui/m3-snapshot-store`, M3, not on `main`) |

## Design

- **Who fills the frame.** `AppFrame` takes everything as props and slots (plan §6.1, F12). Pages live in
  three feature units, and `fe/identity` may not import the gtd store, so the props are assembled once in
  `fe/app` — `router/NewUiHost.vue`, mounted by `App.vue` around the `RouterView` only when the new UI is
  on and the route is not public — and handed down with `provide`; a page reads them with `useFrame()`
  (`fe/shared`) and binds them to `<AppFrame>`. The old UI never mounts the host, so the gtd store (and its
  refresh listeners) is never created for it.
- **Layouts** (one component, CSS by width; `useMedia` decides where the slots go, so each slot renders once):
  > 1180 px rail 224 px · page · margin 376 px (06); 761–1180 px rail 208 px · page; ≤ 760 px page above
  the dock. The dock is in the layout flow (D2): the frame is the visual viewport's height
  (`visualViewport`), so the dock sits above an on-screen keyboard and the notice inside it pushes the list
  up instead of covering a row; `env(safe-area-inset-bottom)` pads it.
- **Rail** (06 `renderRail`): lockup, `// runway`, lists with counts, yellow dot on the current one, a
  yellow ring for a stalled project and a due Rückblick (with the word `fällig`, never colour alone), the
  outbox line `N nicht gesendet · senden` (emits `retry`), footer `uli · Stand 09:41` and `kein Netz`
  while offline.
- **Dock** (m3): notice slot, chips slot (Nächste), tabs with counts and the yellow dot under the active
  one, capture slot; "···" opens the **Mehr** sheet upward (Projekte, Irgendwann, Rückblick, Alle,
  Einstellungen, Darstellung System/Hell/Dunkel, Abmelden). Esc or a tap outside closes it and focus
  returns to "···"; focus moving to the page, or Tab past the last entry (which would otherwise leave
  for the browser chrome and cycle back under the scrim), closes it (no trap).
- **Routes.** `meta.view` on every record names the view. `/review` is new-UI only: a global guard sends
  the old UI to `/inbox` (on every navigation, so `/review?ui=alt` works too). The guard sends an
  unauthenticated visit to `/login?next=<fullPath>` (`loginRedirect`); `LoginPage` returns to `safeNext`
  or `/`. `?task=<uuid>` (validated by `taskParam`) makes the host read `GET /tasks/{uuid}`; the
  placeholder page shows its description (or "nicht gefunden") with "schließen", which drops `?task`.
- **Stale session.** A stored but expired token passes the guard; the first API call's 401 then loads
  `loginHref(location)` (`returnPath.js`, same rule as the guard), so a Custom Tab link survives an
  expired 24 h JWT too, not only a browser that never logged in.

## Where this departs from the plan or the prototype

1. **`NoticeBar`, `Keycap`, `ErrorRow` are not built yet.** Nothing in M4 produces a notice, a key hint
   that works or a failed row; each lands with its first caller (M5 notices and failed rows, M9 keys).
   The frame already has the `notice` slot and the `aria-live="polite"` region it renders into.
2. **"Befehle ⌘K" and "Tastenkürzel ?" are not in the rail yet**, and neither are the rail's `g i`
   key hints or 06's top line (search, Befehle): a button that opens nothing fails the keyboard
   walkthrough. They come with M9, which builds what they open.
3. **No docked panel at 761–1180 px yet.** The margin column is hidden there until its first panel
   (M7 detail, M8 clarify) needs the docked layout; at > 1180 px it is the empty container the plan asks
   for (panels in M12).
4. **The frame's props are provided, not passed by each page** (see *Design*): plan §6.1's edge rule
   forbids `fe/identity` → `fe/tasks`, so a Settings page could not read the counts itself.
5. **`?next=` is written for every user**, also on the old UI's redirect and on the 401 reload; the old `LoginView` ignores it
   (orchestrator note; it adopts it in M16). Visible difference for an old-UI user: the address bar only.
6. **The Mehr sheet follows m3** (a menu opening upward from the tab row) rather than 06's full-height
   table of contents with search; search is M9's.
7. **`EyebrowLine.vue` and `PillButton.vue`**, not the plan's `Eyebrow.vue` / `Pill.vue`: the lint rule
   `vue/multi-word-component-names` refuses single-word component names.
8. **Login and Abmelden load the page fully** (`window.location.assign`) instead of a router push: the
   gtd store is a Pinia singleton whose snapshot and listeners belong to the account that created it;
   without a fresh load the next account in the same tab would see the previous one's lists until the
   30 s refresh. Same reason `shared/sessionEnd.js` reloads on a 401.
9. **`reviewDue(lastWeekly, today)` is a pure rule in `gtdRules.js`** (which already imports
   `dates.js`, so its fan-in does not grow); the store only calls it. Rule (06 rail): due when no weekly
   review was recorded or the last one is seven or more server-time days old; never before `today` is
   known. Tested in `gtdRules.test.js` (never, 6 / 7 days, same day, the 25 Oct DST night, null today).
10. **Placeholder pages** are one component in `fe/layout` (`ComingPage.vue`) for every route rather than
   one file per page that the next milestones would replace anyway.

## Open points

- `RULE-GOV-002` red on `main` and here (decay review overdue since 2026-10-14) — outside this change.
- `BrandMark.vue` (kept, reused) draws the mark all white on dark, including the coral and yellow
  nodes; 06 keeps those two colours. Not changed here because the old UI uses it; to settle in M17.
- **Carried to later milestones** (their briefs must list them as inherited from M4): `NoticeBar` and
  `ErrorRow` → M5; the docked panel at 761–1180 px → M7; `Keycap`, rail "Befehle ⌘K" /
  "Tastenkürzel ?", `g`-key hints, 06's top line and Mehr search → M9.
- **Pending for Uli** (none blocks the milestone): approval of this commit and the stacked branch; the
  `auth.js` ratchet line (`RISK-GOV-001`); a device check of the dock with the keyboard up on a Pixel 9
  and an iPhone (`visualViewport`), and of the Android Custom Tab flow `/next?task=<uuid>` once M16 makes
  the new login the default; the plan's §10 live-data steps (parity check on
  his account, task export backup) from earlier milestones.

## Pre-checks

- **Start:** branch `ui/m4-shell` from `ui/m3-snapshot-store` at `9d00193`; tree clean; `make check`
  GREEN before the first file; this brief written before the code.
- **Before you start** (plan): `./run impact` on `AppShell.vue` (7 old views), `router/index.js`
  (`main.js`), `BrandMark.vue` (`AppShell.vue`), `stores/auth.js` (`AppShell`, `LoginView`,
  `SettingsView`). `./run violations`: the two declared cycles, nothing else.
- **After** (`./run index`, new files visible with `git add -N`): `./run map` puts `layout/*` and
  `layout/ui/*` in `fe/layout`, `router/NewUiHost.vue` and `assets/rw-base.css` in `fe/app`,
  `identity/LoginPage.vue` in `fe/identity`, `returnPath.js`, `navigation.js`, `useFrame.js`, `useMedia.js`
  in `fe/shared`. **AppFrame imports no store:** `./run impact` of `tasks/stores/gtd.js` lists only
  `router/NewUiHost.vue` and `StoreDebugPage.vue` as direct dependents (transitive: `App.vue`,
  `main.js`); of `stores/auth.js` only `AppShell.vue`, `LoginView.vue`, `SettingsView.vue`,
  `NewUiHost.vue`, `LoginPage.vue`; of `stores/tasks.js` only old files — no file under `layout/` is a
  dependent of any store. `./run impact frontend/src/layout/AppFrame.vue`: dependent `ComingPage.vue`
  only. `boundaries`: 0 new edges, 0 forbidden, 0 hub regressions (with the `auth.js = 5` line).
  Every new module is "without import-derived test protection" (F13): protected by
  `returnPath.test.js`, `navigation.test.js` and `gtdRules.test.js` (pure parts); the components by the harness runs below.
- **Tests:** frontend **400 → 442 passed** (+42: `returnPath.test.js` 33 incl. `loginHref`, `navigation.test.js` 5,
  `gtdRules.test.js` +5 for `reviewDue`);
  backend 642 unchanged (no backend file touched).
- **Driven on the harness** (scratch Playwright script, Chrome, user `demo`, read-only except the
  theme key in a throwaway context): no session + `ui=neu` stored, `/next?task=<uuid>` → `/login?next=/next?task=<uuid>`;
  a wrong password stays on the page with "Benutzername oder Passwort stimmt nicht."; the right one
  lands on `/next?task=<uuid>` showing *Druckerei: Freigabe der Flyer abwarten*; "schließen" drops
  `?task`; `/login?next=//evil.example/x` → `/inbox` after login; an unknown uuid shows "Dieses Todo
  gibt es nicht mehr."; `/review?ui=alt` → `/inbox`, `/review?ui=neu` shows the placeholder; the tab
  title follows the view (`Inbox · runway`). **Review fixes** (own user `fixm4`): a forged stale token
  plus `ui=neu` on `/next?task=<uuid>` → `/login?next=%2Fnext%3Ftask%3D<uuid>` → after login
  `/next?task=<uuid>` with the description; old UI with a stale token → `/login?next=%2Fnext` (address
  bar only); Tab through the open sheet closes it after its last entry with focus on `···`. **Keyboard:** desktop Tab order lockup → 5 lists → Rückblick,
  Alle, Einstellungen, every stop `:focus-visible`; phone Tab order Inbox → Nächste → Warten auf → Mehr;
  Enter on Mehr opens the sheet with focus on its first entry (`aria-expanded=true`), Esc closes it and
  focus returns to Mehr; focus leaving the sheet, or Tab past its last entry, closes it (no trap); an entry navigates and closes it,
  `···` then carries `aria-current=page`; Dunkel sets `data-theme=dark` and `theme=dark`; Abmelden
  clears the token and loads `/login`. No page errors.
- **Screenshots and a11y:** [`build/m4/`](../design/2026-10-31-unified-ui/build/m4/README.md) —
  14 shots (frame desktop/phone light/dark, Mehr sheet, `?task` placeholder, login desktop/phone
  light/dark, the old `/next`), each looked at and compared with 06/m3; axe-core 4.10.2: 0 serious or
  critical on frame (4), sheet and login (2). Touch targets: dock tabs 48 px high in a 52 px row,
  sheet entries and theme pills 48 px, login fields and button 52 px.
- **Old UI unchanged:** `/next` without the switch vs. M3's shot: 163 differing pixels, all in the
  bottom three rows (the cut-off row whose urgency badge ages with the clock). Old routes, views and
  `LoginView` untouched; the only visible change is `?next=` in the address bar after a redirect.
- **Production build** (`vite build` into the scratchpad): JS **304.27 kB, 100.61 kB gzip** (M3: 81.78 —
  the store, outbox and rules of M2/M3 now ship because the new side imports them; budget ≤ 130 kB),
  CSS 50.34 kB / **9.82 kB gzip** (budget ≤ 20 kB); fonts unchanged.
- **`./run surfaces --update`:** one intended change, `ops/surfaces/spa.json` `"routes"` gains
  `"/review"`; nothing else.
- **`make check`:** GREEN. **`make verify`: RED on `RULE-GOV-002` only** (decay review overdue,
  pre-existing): `js-lint`, `js-test` 442, `py-test` 642, `index-fresh`, `contract`, `route-guards`,
  `surfaces`, `boundaries`, rebuild byte-identical, gate conformance 56 fixture arms passed, 46 of 49
  executable rules proven able to fail; container tier skipped (no Docker, `RISK-TEST-001`; no backend
  change).
