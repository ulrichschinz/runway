# runway web: implementation plan for the unified UI (06-kombination)

Status: **plan, not started.** Written 2026-11-01 against `main` at `11e1287`. Nothing in the
repository was changed to write it (the index was rebuilt with `./run index`; it is gitignored).

Design source (approved by Uli on 31.10.2026):
[`docs/design/2026-10-31-unified-ui/06-kombination/`](../design/2026-10-31-unified-ui/06-kombination/README.md)
(build plan, effort table, cut list, `rules.js`, `rules.test.mjs`, `store.js`, `lens*.js`, `stack.js`,
`card.js`, `i18n.js`, `tokens/`, `shots/`), the round-2 judge in
[`../design/2026-10-31-unified-ui/README.md`](../design/2026-10-31-unified-ui/README.md), the inventory in
[`../design/2026-10-31-unified-ui/shared/inventory.md`](../design/2026-10-31-unified-ui/shared/inventory.md),
and the Android base [`mobile/m3-papier-mobil`](../design/2026-10-31-unified-ui/mobile/m3-papier-mobil/README.md)
for the phone dock. Brand rules: `~/projects/agentic-reach/brand/AGENTS.md`.

Android's plan is written in parallel at
`/Users/uli/projects/agentic-reach/runway-android/docs/unified-ui-plan.md`. Section 11 lists what it may
rely on from this one.

---

## 1. How to execute this plan

1. **Read once:** this file, root `AGENTS.md`, `frontend/AGENTS.md`, `docs/change-workflow.md`,
   the 06 README. Check the decision gate (section 2): if Uli has answered differently, apply the
   "if Uli picks otherwise" column before starting the affected milestone.
2. **Execute milestones strictly in order M0 → M17.** Optional milestones (MB1, MB2, MG) can run in
   parallel once their prerequisite is merged. One milestone = one branch = one PR.
3. **Every milestone starts the same way:**
   ```sh
   git switch main && git pull && git switch -c ui/<mN>-<slug>
   make check                                  # tree green before touching anything
   ./run map <each path listed under "Before you start">
   ./run impact <each path listed under "Before you start">
   ./run brief                                 # pre-filled Change Impact Brief, then edit it
   ```
   If `./run map` or `./run impact` reports `STALE`, run `./run index` (or `make fix`) and ask again.
   Ownership, dependents and test protection come from the index only; never from grep, notes or this
   file. Write the brief **before** the code (`docs/briefs/<next number>-<slug>.md`, copy the newest).
4. **While working:** `make check` after each step. New files under `frontend/src/` must be inside a
   unit's `paths` (M0 sets this up); verify with `./run map <new file>` that the unit is the intended one.
5. **Before the PR:** `make verify` green; `./run surfaces` clean (or `--update` with the diff in the PR);
   the milestone's acceptance checks done and their evidence (screenshots, numbers) in the PR body and
   the brief's "Pre-checks" section. Commit only with Uli's go; push only with his release.
6. Every merge to `main` deploys. The new UI stays behind the switch from M0 until M16, so a merged
   milestone changes nothing for anyone who has not opted in.

---

## 2. Decision gate

Uli has not answered these. The plan assumes the defaults; each row says what changes otherwise.

| # | Question | Default assumed | If Uli picks otherwise |
|---|---|---|---|
| D1 | One context list for both clients | **No hardcoded web set.** The web shows the contexts present in the user's open tasks, ordered by one preset shared with Android: `@home @computer @work @business` first (only those present), then every other present context, German collation. The rule lives in `shared/contexts.js` and in the rule vectors, so Android runs the same order. No backend change in the core plan. | **A shared, editable list:** do optional milestone **MB1** (`GET/PUT /auth/preferences`, REST-only, +1.5 pd). The web then shows the stored list first, then other present contexts. Android may read it later; until MB1 ships, Android keeps its preset. **A fixed set on both:** drop "other present contexts" from the rule (−0.25 pd), and tasks with other contexts are reachable only through Alle and search. |
| D2 | Phone web adopts the bottom dock | **Yes**, at ≤ 760 px: notice, context chips (Nächste only), tabs `Inbox · Nächste · Warten auf · ···`, and the "Neues Todo" field, all in the layout flow (not floating), as in Android m3. | Keep 06's top tabs and floating notice: −1.5 pd in M4/M15, but the judge's weak point 1 (the notice covers a row for 6 s) must then be fixed by moving the notice into the flow anyway. |
| D3 | Start screen and Nächste order | Start screen stays **Inbox** (`/` → `/inbox`). Nächste opens with **Fällig**, then **Jetzt · Bald · Später**. | A separate Jetzt start screen (m2) changes the `/` redirect and adds a route: +1 pd, Android done-bar re-freeze is Android's matter. |
| D4 | Ring side | **Leading (left) on the web.** Swipe right to complete is shared with Android (trailing ring there). | Trailing on both: TaskLine column order flips, keyboard focus order unchanged; +0.25 pd. |
| D5 | Progress on narrow widths | Phone (≤ 760 px) shows the **flat 2D lens** (SVG) only. Desktop (> 760 px) gets the WebGL lens with the SVG fallback for reduced motion, no WebGL and context loss. | WebGL on the phone too: +1 pd (52 px slot, battery/thermal check on the Pixel 9). |
| D6 | Quick clarify on the phone web | **Card stack only**; it is the web's touch Klären mode. No extra phone clarify UI. | Nothing to add for the web. |

Other open items carried from 06 (README "Open questions for Uli"), assumed **as prototyped** unless
Uli says otherwise: `t` plans a todo for today via `scheduled`; Jetzt includes "für heute"; Inbox mode by
device (desktop list, touch stack) remembered per device; ink bloom cut; moves and captures sent at
once with an inverse or DELETE as undo, only done and delete held 6 s; a project's next action needs a
context; brand deviations 1-9 of the 06 README approved with the design; German only in v1 (strings are
keys, English later). The Android handoff endpoints (MB2) are **not** assumed.

---

## 3. Goal, scope, non-goals

**Goal.** Replace the web SPA's UI with 06-kombination: 03's editorial page, rows and keymap; one
Tageslinse (WebGL on desktop, flat elsewhere); 05's card stack for touch Klären; 04's sections, "ohne
Kontext" chip and ⌘K palette; 02's visible write path and i18n keys; m3's bottom dock on the phone.
German UI, Agentic Reach brand, same vocabulary and rules as Android.

**In scope.** Everything in `frontend/` (views, components, stores, shared rules, tokens, fonts,
router), the rule vectors Android copies, characterization tests in `backend/tests/container` that pin
API behaviour the UI relies on, and two optional backend milestones (MB1 preferences, MB2 handoff).

**Non-goals.** No change to list semantics on the server, urgency coefficients
(`backend/taskrc_template.txt`), the REST or MCP surface (except the optional MBs), or Taskwarrior
data. No PWA/offline-first beyond the outbox. No English table in v1. No ink bloom. No second WebGL
canvas. No component-mounting tests (ADR 0007 stays; `RISK-TEST-004` stays open). No icon library.
No glassmorphism outside the lens object.

**Done means** (all milestones merged, M16 switched, M17 contracted):

- Every view of the old UI has a replacement; the old components, `AppShell.vue` and the switch are
  deleted, and `CYCLE-001` / `CYCLE-002` are removed from `architecture.toml` because the new shell
  receives what it shows through props and slots.
- The acceptance kit (section 5) passes for every view: screenshots desktop / phone / dark / reduced
  motion, keyboard-only walkthrough, a11y checks, perf and bundle budgets, WebKit pass.
- `frontend/tests/vectors/gtd-rules.v1.json` exists, the web runs it, and Android can copy it.
- `make verify` green; `./run surfaces` clean with the intended snapshot diffs committed.
- Uli has used the new UI daily for 14 days with no fallback to the old one.

---

## 4. Facts that shape the plan (checked against code, 2026-11-01)

These were read from the repository, not assumed. Several contradict or sharpen the design.

| # | Fact | Where | Consequence |
|---|---|---|---|
| F1 | `PUT /tasks/{uuid}` with `scheduled: ""` clears `scheduled` (and `project`, `priority`, `due`, `wait`, `until`, `recur`). `tags_add` / `tags_remove` are deltas computed against the current task; an absent tag is ignored. | `backend/app/routers/tasks.py` (modify description), `task_service._build_args`, `modify_task` | 06's "leave Warten auf clears the follow-up day" works. Pinned again by a container test in M2. |
| F2 | **New tags may not contain a comma** (`TAG_RE`); legacy comma tags can only be removed (`EXISTING_TAG_RE`). | `task_service._validate_tag`, `_validate_existing_tag` | **Contradicts 06's `inversePayload`:** after `contextPayload` repaired `"@a,@b"`, its inverse would `tags_add` the raw comma tag → 400. The inverse must restore the *parts*, not the raw string. Also **06's `listPayload` removes a raw comma tag that contains a status tag without adding back its sibling parts** (a legacy `"next,@home"` would lose `@home`). Both fixed in M2 with vectors. |
| F3 | Taskwarrior stores a bare `YYYY-MM-DD` as local midnight (Europe/Berlin). | `_local_day` docstring | 06's `morningTw` (fixed `T070000Z`) is a prototype shortcut. The port never fabricates timestamps: after a write it replaces the local task with the `Task` the PUT returns; optimistic patches compare **days** only. |
| F4 | `GET /gtd/next` is `status:pending +next` with no exclusion. 06's `isNext` excludes tasks that also carry `waiting` or `someday`. Android shows `/gtd/next`. | `task_service._VIEW_FILTERS` | The client computes list membership itself (rule in vectors) and shows a dual-tagged task once, in Warten auf / Irgendwann. Android must adopt the same rule from the vectors (section 11). |
| F5 | `GET /tasks` (default) returns visible pending only; `/gtd/waiting` includes tasks hidden by a future `wait`. `completed_since=YYYY-MM-DD` exists. `POST /inbox` returns `{uuid, description}`, no idempotency key. | `routers/tasks.py`, `routers/inbox.py` | The snapshot load needs `/gtd/waiting` besides `/tasks`; done-today comes from `completed_since`; a capture retry after a network error needs Android's duplicate check (`GET /tasks?status=all&q=`). |
| F6 | **Unverified:** whether `task done` on a started task drops `start`. If it does, a todo counted as planned only because it was running moves from "planned" to "zusätzlich" on completion and the denominator shrinks (3 von 7 → 3 von 6 · 1 zusätzlich). | `rules.js plannedToday` | Contradicts "the denominator moves only with the plan". M2 adds a container test that answers it; if `start` is dropped, `dayProgress` treats `end`-today tasks whose snapshot from the outbox hold had `start` as planned (the hold records `plannedAtHold`), and the vector says so. |
| F7 | The server's time zone is not exposed by the API; `/gtd/summary.today` is. | `routers/gtd.py`, `task_service._zone` | The client takes `today` from the summary and uses `Europe/Berlin` for day boundaries (constant in `shared/dates.js`). Third-party deployments in another zone would mis-day rows: recorded as a risk; adding `timezone` to the summary would be a public-surface change and is not planned. |
| F8 | No preference storage exists; `users` has `api_key, role, full_name, email`. Contexts exist only as tags. The web derives contexts from `GET /tasks` (`collectContextTags`, alphabetical); `TaskModal.vue` adds base suggestions `@home @work @computer @phone @errands`. Android uses a preset `@home @computer @work @business` with no editor. | `backend/app/database.py`, `frontend/src/stores/tasks.js`, `TaskModal.vue`, Android `ui/ContextSettings.kt` | D1 default needs no backend. A shared editable list needs MB1. |
| F9 | `tools/surfaces.py` snapshots localStorage keys **only from `*.js` files under `frontend/src`, only as single-quoted literals** (`localStorage.getItem('key')`), and routes only as `path: '…'` in `router/index.js`. IndexedDB is not covered at all. | `tools/surfaces.py capture_spa` | Rule for this plan: storage access only in `.js` files, only with literal keys, only through `localStorage`. The outbox uses `localStorage` (synchronous, which also suits `pagehide`), not 06's IndexedDB. |
| F10 | `ops/structure-baseline.toml` caps fan-in at **4 importers per file** (`RULE-ARCH-003`), with an allowlist for designed hubs. | `ops/structure-baseline.toml` | The new i18n module, shell frame, store and rules module will exceed 4. M0 adds them to the allowlist with reasons; any other raise is a dated line in the milestone that causes it. |
| F11 | Frontend units are declared by explicit file lists (`fe/tasks`, `fe/layout`, …). A file outside them falls to no feature unit (tooling files map to `ops`). Changing `architecture.toml` needs owner approval (`RISK-GOV-001`). | `architecture.toml` | M0 adds new folders as globs to the existing units once, so later milestones add files without touching the contract. |
| F12 | `CYCLE-001` / `CYCLE-002` exist because `AppShell.vue` imports the tasks and auth stores. Declared cycles may only shrink, and a resolved cycle left declared fails (`RULE-ARCH-002`). | `architecture.toml` | The new `AppFrame.vue` takes everything as props/slots. The cycles disappear only when the old `AppShell.vue` is deleted (M17), so they are removed from `known_cycles` in M17, not earlier. |
| F13 | `./run impact frontend/src/shared/taskFilters.js` lists the file as "without import-derived test protection" although `frontend/tests/taskFilters.test.js` imports it. | index output 2026-11-01 | The index does not credit frontend tests today. Briefs must name protecting tests explicitly; fixing the index's resolution of `../src/…` imports is a separate change (not in this plan). |
| F14 | Dynamic `import()` targets are recorded as UNKNOWN edges (`BLIND-FE-002`). | index blind spots | The lazy lens chunk is invisible to the index. M11's brief records it; a vitest test pins that only `lens3d.js` imports `three`. |
| F15 | `docs/design/` is **untracked** (`git status`: `?? docs/design/`, 34 MB). `RULE-DOC-004` checks that repository paths named in briefs exist; in CI they would not. | `git status` | M0 commits the design folder (with Uli's go on its size) before any brief links into it. |
| F16 | "`RULE-DEP-001`" is the backend import rule, not a pinning rule. No gate requires exact npm pins (package.json uses `^` ranges); `RULE-DEP-002` classifies npm licences (three.js is MIT, allowed). After changing `package.json`, run `tools/npm-lock.sh` (npm 10/11 lockfile split). | `rules/ledger.yaml`, `frontend/AGENTS.md` | New dependency `three` is pinned exactly by convention (`"three": "0.169.0"`, the version the prototype used); no other new runtime dependency (no vue-i18n, no idb-keyval). |
| F17 | Bundle baseline (`vite build`, 2026-11-01): JS 248.9 kB (81.5 kB gzip), CSS 34.1 kB (6.6 kB gzip), one chunk. | local build into the scratchpad | Budgets in section 5 are relative to this. |
| F18 | The web loads fonts from Google Fonts in `frontend/index.html` (unit `ops`) and synthesises bold. JWT lives in `localStorage.token`, expires after `JWT_EXPIRE_HOURS` (24). The axios interceptor reloads `/login` on a 401 for a token-carrying request (`shared/sessionEnd.js`). | `frontend/index.html`, `api/client.js`, `README.md` | Fonts move to local woff2. Held writes survive a 401 in `localStorage` and are resent after login. The keepalive flush uses `fetch`, not axios, and reads the token itself. |
| F19 | The router guard sends unauthenticated users to `/login` with no return path; `?task=` is ignored. Android opens `/next?task=<uuid>` and `/waiting?task=<uuid>` in a Custom Tab. | `router/index.js`, inventory 3.10 | M4 adds `?task=` (opens the detail) and `/login?next=` (return path). Android depends on both. |

---

## 5. The acceptance kit (applies to every UI milestone)

**Screenshots** (in the PR and linked from the brief; stored under
`docs/design/2026-10-31-unified-ui/build/<mN>/`, committed with the milestone):
desktop 1440×900, narrow desktop 1024×768 (docked panel), phone 412×915 @2x, each in light and dark,
plus reduced motion for any view with the lens. Taken with the design's tool adapted to a URL:
`node docs/design/2026-10-31-unified-ui/shared/tools/shot.mjs --url=http://127.0.0.1:5173/next?ui=neu …`
(M0 adds the `--url` option; the tool uses a Playwright install outside this repo and is not part of
the gate). Compare against the matching 06 shot; deviations are listed in the PR.

**Rule tests:** `cd frontend && npx vitest run` green; new rules come with tests in the same PR.

**Accessibility:** keyboard-only walkthrough of the milestone's flows (focus always visible, no trap,
Esc closes the top layer); every interactive element has an accessible name (rings exactly
`Abhaken: <description>`, as on Android); notices in an `aria-live="polite"` region; touch targets
≥ 44 px (≥ 48 px in the phone dock); 200 % zoom without horizontal scroll at 1440 px; no information
by colour alone (overdue has the edge rule and the word "überfällig"); axe-core injected through the
shot tool reports 0 serious or critical issues.

**Performance budgets** (measured on a production build, `npm run build && npx vite preview`):

| Budget | Value |
|---|---|
| Lens frames while idle | **0** over 3 s (dev hook `window.__runway.lens.frames`, dev builds only) |
| Lens frames per planned completion | ≤ 60 |
| WebGL canvases on screen | ≤ 1 at any time; 0 at ≤ 760 px; 0 on Inbox list mode |
| `three` | only in the lazy lens chunk; requested after first paint and only when a desktop lens slot is visible |
| Entry JS (gzip) | ≤ 130 kB while both UIs ship (M0-M16), ≤ 100 kB after M17 (baseline 81.5) |
| Lens chunk (gzip) | ≤ 180 kB (three core + RoomEnvironment) |
| CSS (gzip) | ≤ 20 kB while both UIs ship, ≤ 14 kB after M17 |
| Fonts | 4 woff2 files, ≤ 160 kB total, only Space Grotesk 400 preloaded |
| Tick off → row struck | ≤ 100 ms; row out of the list (and accessibility tree) ≤ 1 s |
| Snapshot refresh | 5 requests, at most once per 30 s |

**WebKit:** from M5 on, every milestone's screenshots also in Playwright WebKit; M15 does the full
Safari pass (section M15).

---

## 6. Where the new UI lives

### 6.1 Folders and units (set up once in M0)

New files go into new folders; old files stay untouched until M17. No file moves (MODE C).

| New folder | Unit (added as a glob to its `paths`) | Holds |
|---|---|---|
| `frontend/src/shared/` (exists, `fe/shared`) | `fe/shared` | pure rules, dates, contexts, outbox queue, i18n `t()` + `messages.de.js`, command table, UI switch |
| `frontend/src/composables/` (exists) | `fe/shared` | `useTheme`, `useMedia`, `useFreshness`, `useOutbox`, `useCommands`, `useKeymap` |
| `frontend/src/api/` (exists) | `fe/shared` | `client.js` (kept), `keepalive.js` |
| `frontend/tokens/` | `fe/shared` | `tokens.json`, generated `RunwayTokens.kt`, `tailwind-tokens.js` |
| `frontend/src/assets/` | `fe/app` | `fonts/*.woff2`, `fonts.css`, generated `tokens.css` |
| `frontend/src/layout/` | `fe/layout` | `AppFrame.vue`, `RailNav.vue`, `PhoneDock.vue`, `MarginColumn.vue`, `MoreSheet.vue`, `NoticeBar.vue`, `CommandPalette.vue`, `ShortcutsSheet.vue`, `ui/*` primitives, `lens/*` |
| `frontend/src/tasks/` | `fe/tasks` | `stores/gtd.js`, `views/*Page.vue`, `components/*`, `panels/*` |
| `frontend/src/projects/` | `fe/projects` | `ProjectsPage.vue`, `ProjectPage.vue`, `PlanDocument.vue`, `ProjectRow.vue` |
| `frontend/src/identity/` | `fe/identity` | `LoginPage.vue`, `SettingsPage.vue` |

Edges stay within `allowed_edges`: features → `fe/layout`, `fe/shared`; `fe/projects` → `fe/tasks`
(recorded exception, used for the gtd store); `fe/layout` imports **no** feature in new code (the
palette and keymap get their entries through the `useCommands` registry in `fe/shared`, which
features fill at runtime).

### 6.2 The coexistence switch

`frontend/src/shared/uiFlag.js` reads `localStorage.getItem('ui')` (`'neu'` | `'alt'`); `?ui=neu` or
`?ui=alt` on any URL writes it. Until M16 the default is `'alt'`. `router/index.js` imports both
the old view and the new page **statically** (keeps the index edges; no dynamic import) and uses
`pick(OldView, NewPage)`, a tiny wrapper component that renders one of the two. Routes and their
paths stay the same, so bookmarks and Android's Custom Tab URLs keep working.

### 6.3 Data flow

One Pinia store, `tasks/stores/gtd.js` (`useGtdStore`), holds a **snapshot**:

```
GET /gtd/summary                  → today, counts, last_review
GET /tasks                        → every visible pending task
GET /gtd/waiting                  → adds +waiting tasks hidden by a future wait
GET /tasks?completed_since=<today-6>   → done this week (Heute, Rückblick, dayProgress)
GET /gtd/projects/overview        → projects, status, stalled, has_plan
```

All five in parallel (completed uses the client's Berlin day, refetched if `summary.today` differs).
Lists, sections, chips, counts and the day progress are **computed** from the snapshot by the shared
rules, then the outbox overlay is applied (`applyOutbox`: held done/delete hidden, sent moves patched,
unsent captures added). A refresh never resurrects a task with a held or failed done/delete.

### 6.4 Write path (pure part in `shared/outboxQueue.js`, effects in `composables/useOutbox.js`)

| Operation | When sent | Rückgängig | On failure |
|---|---|---|---|
| Capture `POST /inbox` | at once | `DELETE /tasks/{uuid}` (or drop locally if never sent) | row "Nicht gesendet · Erneut senden"; resend after a duplicate check |
| Clarify / list move / context / plan (`PUT` with `tags_add`/`tags_remove`/`scheduled`/`project`) | at once | the exact inverse (`inversePayload`) | row state failed, retry; 4xx shows the server's message |
| Done `POST …/done`, delete `DELETE` | after a 6 s hold | cancel the hold | as above |
| Start/stop, annotate, field edits in the detail | at once | none (not destructive) | as above |

Held, failed and auth-paused ops persist in `localStorage['outbox']` (JSON, written synchronously).
On `pagehide` and `visibilitychange → hidden`, held ops are sent with
`fetch(url, { method, keepalive: true, headers: { Authorization } })`. On boot, held ops whose window
has passed are sent (the user did not undo); ops left in `sending` are checked with
`GET /tasks/{uuid}` first, because done and delete are not idempotent. A 401 pauses all ops
("wartet auf Anmeldung") until the next login. `online`, window focus and the visibility refresh retry
failed network ops once each; "Erneut senden" retries on demand.

### 6.5 Old → new map

| Today (unit) | Fate | Replaced by |
|---|---|---|
| `components/AppShell.vue` (fe/layout) | delete in M17 | `layout/AppFrame.vue` + `RailNav.vue` + `PhoneDock.vue` + `MarginColumn.vue` |
| `components/NavItem.vue` (fe/layout) | delete in M17 | `layout/RailNav.vue` |
| `components/BrandMark.vue` (fe/layout) | **keep**, reused by RailNav and LoginPage (mark + "Agentic Reach", `// runway`) | — |
| `components/TaskList.vue`, `TaskRow.vue` (fe/tasks) | delete in M17 | `tasks/components/ListSection.vue`, `TaskLine.vue` |
| `components/UrgencyBadge.vue` | delete in M17 | nothing; urgency is never shown, only ordering |
| `components/TaskModal.vue` | delete in M17 | `tasks/components/TaskDetail.vue` (margin / docked panel / sheet) |
| `components/TaskActionSheet.vue` | delete in M17 | swipe + TaskDetail sheet |
| `views/InboxView … AllTasksView.vue`, `views/_useTaskView.js` | delete in M17 | `tasks/views/InboxPage, NextPage, WaitingPage, SomedayPage, AllPage, ReviewPage.vue` |
| `stores/tasks.js` | delete in M17 | `tasks/stores/gtd.js` |
| `views/ProjectsView.vue`, `components/ProjectPlanModal.vue` (fe/projects) | delete in M17 | `projects/ProjectsPage.vue`, `ProjectPage.vue` (reads `/projects/:name`), `PlanDocument.vue` |
| `views/LoginView.vue`, `SettingsView.vue` (fe/identity) | delete in M17 | `identity/LoginPage.vue`, `SettingsPage.vue` |
| `stores/auth.js` | **keep** | — |
| `composables/useDarkMode.js` | delete in M17 | `composables/useTheme.js` (system by default, override kept in the same `theme` key) |
| `composables/useScrollLock.js` | keep if the sheets use it, else delete in M17 | — |
| `shared/contextTags.js`, `taskFilters.js`, `taskPayload.js`, `sessionEnd.js`, `claudeConnect.js`, `mcpSnippets.js` | **keep** (reused: tag splitting, search, detail edit payload, session end, settings snippets) | — |
| `style.css` | slimmed in M17 (old Tailwind base stays) | `assets/tokens.css`, `assets/fonts.css` |

---

## 7. Milestones

Effort in person-days (pd). "Process" (brief, `make verify`, surfaces, screenshots) is counted once in
section 8, not per milestone. Brief numbers assume nothing else lands in between; take the next free
number.

### M0 — Coexistence switch, unit map, design folder committed

- **Pattern:** Public-Surface Migration, step *expand* (new localStorage key `ui`), plus an ADR.
- **Brief:** `0046-the-new-ui-coexists-behind-a-switch.md`. **ADR:** `docs/adr/00NN-the-new-ui-coexists-behind-a-switch.md` (why a per-user switch instead of a big-bang rewrite; the contract step M17).
- **Before you start:** `./run map frontend/src/router/index.js`, `./run impact frontend/src/router/index.js`, `./run impact frontend/src/components/AppShell.vue`, `./run violations`.
- **Files:** `architecture.toml` (add the globs of 6.1 to `fe/shared`, `fe/app`, `fe/layout`, `fe/tasks`, `fe/projects`, `fe/identity`; owner approval, `RISK-GOV-001`); `ops/structure-baseline.toml` (allowlist `frontend/src/shared/i18n.js`, `frontend/src/shared/gtdRules.js`, `frontend/src/layout/AppFrame.vue`, `frontend/src/tasks/stores/gtd.js`, each with its reason); new `frontend/src/shared/uiFlag.js`; `frontend/src/router/index.js` (`pick()` wrapper, still pointing both sides at the old views); `ops/surfaces/spa.json` (`./run surfaces --update`: key `ui`); `README.md` (one paragraph: `?ui=neu` / `?ui=alt`); `docs/design/2026-10-31-unified-ui/**` committed (F15); `docs/design/2026-10-31-unified-ui/shared/tools/shot.mjs` gains `--url=`.
- **Tests:** `frontend/tests/uiFlag.test.js` (default `alt`, query overrides, invalid values ignored; storage stubbed).
- **Acceptance:** `make verify` green; `./run map frontend/src/tasks/x.vue`-style probe shows each new folder's unit (create and delete a probe file locally, do not commit it); `./run surfaces` reports only the `ui` key; old UI unchanged in a screenshot diff.
- **Effort:** 1.0

### M1 — Design tokens, fonts, theme

- **Pattern:** New Capability (the old UI keeps its look; only its fonts move from Google to local files, same faces and weights).
- **Brief:** `0047-design-tokens-and-local-fonts.md`.
- **Before you start:** `./run impact frontend/src/style.css`, `./run impact frontend/index.html`, `./run impact frontend/src/composables/useDarkMode.js`, `./run map frontend/tailwind.config.js`.
- **Files:** `frontend/tokens/tokens.json` (copy of `06-kombination/tokens/tokens.json`; brand values unchanged; add `--rw-` names m3 uses so web and Android share names); `tools/gen-tokens.mjs` (from `06-kombination/tokens/gen-tokens.mjs`, writes `frontend/src/assets/tokens.css`, `frontend/tokens/tailwind-tokens.js`, `frontend/tokens/RunwayTokens.kt`); `frontend/tailwind.config.js` (extend colors, fonts, radii, motion from `tailwind-tokens.js`; `darkMode: 'class'` kept); `frontend/src/assets/fonts/` Space Grotesk 400/500, Fraunces 300 italic, JetBrains Mono 400 woff2 from `docs/design/2026-10-31-unified-ui/shared/brand/fonts/` plus `OFL.txt`; `frontend/src/assets/fonts.css` (`font-display: swap`); `frontend/index.html` (remove the Google Fonts links, preload Space Grotesk 400, `<title>runway</title>` stays as is until M16); `frontend/src/main.js` (import `assets/fonts.css`, `assets/tokens.css`); `frontend/src/composables/useTheme.js` (no stored value = follow `prefers-color-scheme`; stored `light`/`dark` overrides; same `theme` key; sets `theme-color` from tokens).
- **Rules from the brand kit:** only `--ar-*` brand colours and mixes of them; yellow only as dot, ring or 1 px line; coral only for primary action, `//`, overdue/error, done ink, lens liquid (the approved deviations); pills for buttons; no shadows other than the kit's; no gradients except inside the lens; mono symbols only.
- **Tests:** `frontend/tests/tokens.test.js` (runs the generator in memory and compares with the committed outputs, so a hand edit fails; every semantic colour resolves to brand colours; contrast pairs: text on bg ≥ 7:1, mute on bg ≥ 4.5:1, ink on coral ≥ 7:1, light and dark).
- **Acceptance:** the old UI renders with local fonts (no request to `fonts.googleapis.com`), bold no longer synthesised; a token sample page is not built (tests suffice); `RunwayTokens.kt` exists for Android; fonts ≤ 160 kB.
- **Effort:** 1.5

### M2 — Shared rules, dates, i18n core, rule vectors for both clients

- **Pattern:** New Capability (pure modules, no UI).
- **Brief:** `0048-gtd-rules-shared-with-android.md`.
- **Before you start:** `./run impact frontend/src/shared/contextTags.js`, `./run impact frontend/src/shared/taskFilters.js`, `./run map backend/tests/container`.
- **Files (all new, `frontend/src/shared/`):**
  - `gtdRules.js` — port of 06 `rules.js` on top of `contextTags.js` (`allTagParts`, `contextTagsOf`): `STATUS_TAGS`, `listOf`, `isInbox/isNext/isWaiting/isSomeday` (F4: Nächste excludes waiting/someday), `NeedsAnswer`, `clarifyPayload`, `listPayload` (**fix F2:** removing a raw comma tag adds back its other parts), `contextPayload`, `inversePayload` (**fix F2:** restores parts, never a comma tag; restores `project` and `scheduled`), `applyPayload` (optimistic; days only, F3), `planPayload(t, today)` (`t`: `scheduled: today` or `''`; refuses waiting todos, whose `scheduled` is the follow-up day), `projectNameError`.
  - `sections.js` — `ringOf` (Jetzt: overdue, due today, running, prio H, planned today; Bald: due ≤ 7 days or prio M; Später: rest), `plannedToday`, `nextSections(snapshot, ctx)` returning `fällig`, `fälligAndere` (only with a context filter; merged under the one Fällig heading with the note "andere Kontexte" when the filtered context has nothing due), `jetzt`, `bald`, `spaeter`; order inside a section: running, then prio H, then urgency (never shown); a task appears once (Fällig wins); lenient context rule (context or no context; "ohne Kontext" = only those).
  - `dayProgress.js` — 06's stable rule (`done`, `planned`, `extra`, `total`, `level`) plus F6 handling, and `lensCaption(p)` → `3 von 7 heute` / `· 1 zusätzlich` (no `+1` form anywhere).
  - `contexts.js` — D1: `CONTEXT_PRESET = ['@home','@computer','@work','@business']`, `orderContexts(present, preset)`, `contextCounts(nextTasks)` (chip count = `+next` todos carrying that context, strict; Alle = all `+next`; ohne Kontext = `+next` without any context), `eyebrowCount(selected, counts)` → `@anrufe · 3 · +1 ohne Kontext`; the chip and the eyebrow call the same function.
  - `dates.js` — `SERVER_TZ = 'Europe/Berlin'`, `dayOf(twStamp)` (DST-safe), `plusDays`, `formatDay` (`Di 03.11.`), `followUpDay(answer, today)` (morgen = next working day, Montag, Freitag (a week later when it equals morgen), nächste Woche = Monday after morgen, ohne Datum). Fixes the old "one day early" display (inventory 1.8) for the new UI.
  - `i18n.js` (`t(key, vars)`, ~20 lines, German table only, missing key = the key in dev and a console error) and `messages.de.js` (06's `i18n.js` keys; **change:** `notice.done = 'Erledigt'` without the row text, `notice.deleted = 'Gelöscht'`, `notice.captured = 'In Inbox ✓'`, `undo = 'Rückgängig'`; delete `lens.extraShort`).
- **Vectors:** `frontend/tests/vectors/gtd-rules.v1.json` — `{ "version": 1, "tz": "Europe/Berlin", "today": "2026-10-31", "contextPreset": [...], "cases": [{ "id", "fn", "args", "expect" | "throws": "context" }], "strings": { key: exact German text } }`. Functions covered: `listOf`, `clarifyPayload`, `listPayload`, `contextPayload`, `inversePayload`, `applyPayload` (result as tags/project/scheduledDay), `planPayload`, `ringOf`, `plannedToday`, `nextSections` (ids per section), `dayProgress`, `lensCaption`, `orderContexts`, `contextCounts`, `eyebrowCount`, `dayOf` (incl. the two DST nights), `followUpDay`, `projectNameError`. Start from all 14 cases of `06-kombination/rules.test.mjs` (store cases rewritten as pure snapshot cases), plus the F2 legacy-tag cases, F4 dual-tag case, the "+1 → · 1 zusätzlich" case and the merged Fällig heading. `strings` holds every string Android pins: `Inbox`, `Nächste`, `Warten auf`, `Fällig`, `Stand {t}`, `Nachhaken`, `Neues Todo`, `In Inbox ✓`, `Erledigt`, `Gelöscht`, `Rückgängig`, `Abhaken: {d}`, `Nicht gesendet`, `Alle`, `Nichts fällig`, `Du wartest auf nichts`, `Inbox ist leer`.
- **Tests:** `frontend/tests/gtdRules.test.js`, `sections.test.js`, `dayProgress.test.js`, `contexts.test.js`, `dates.test.js`, `vectors.test.js` (runs every case of the JSON against the JS functions), `strings.test.js` (`strings` equal `messages.de.js`; every `t('…')` literal under `frontend/src` exists in the table — a static scan, no mounting). **Backend characterization** in `backend/tests/container/test_ui_contract.py`: `scheduled: ""` clears; `tags_add` + `tags_remove` + `scheduled` in one PUT; `tags_remove` of a legacy comma tag; `done` on a started task (does `start` survive? answers F6); `completed_since=today` returns tasks done today with `end`. Container tier runs in CI only (`RISK-TEST-001`).
- **Acceptance:** all cases green; the vectors file is self-describing and valid JSON; `npx vitest run` count rises by ≥ 60; brief records F2/F4/F6 as design corrections and lists the protecting tests by name (F13).
- **Effort:** 2.5

### M3 — Data layer, write path core, freshness

- **Pattern:** New Capability (failure behaviour designed and tested: offline, 5xx, 4xx, 401, tab closed during a hold).
- **Brief:** `0049-snapshot-store-and-outbox.md`.
- **Before you start:** `./run impact frontend/src/api/client.js`, `./run impact frontend/src/shared/sessionEnd.js`, `./run impact frontend/src/stores/tasks.js`.
- **Files:** `frontend/src/shared/outboxQueue.js` (pure state machine of 6.4: `enqueue`, `hold`, `undo`, `commit`, `fail`, `pauseAuth`, `retry`, `serialize`/`restore`, `applyOutbox(snapshot, ops)`); `frontend/src/composables/useOutbox.js` (timers, `localStorage.setItem('outbox', …)` literal, pagehide/visibility flush, online/focus retry); `frontend/src/api/keepalive.js` (`fetch` with `keepalive` and the bearer token from `localStorage.getItem('token')`); `frontend/src/composables/useFreshness.js` (refresh on `visibilitychange` visible, `focus`, `online`, at most once per 30 s; "Stand hh:mm" from the last successful snapshot; a failed refresh keeps rows and Stand and sets `offline`); `frontend/src/tasks/stores/gtd.js` (snapshot of 6.3, computed lists via M2 rules, actions `capture`, `complete`, `remove`, `undo`, `clarify`, `setList`, `setContext`, `togglePlanned`, `update`, `start/stop`, `annotate`, `createProject`, `setProjectStatus`, `recordReview`; every PUT replaces the local task with the server's reply); `ops/surfaces/spa.json` (key `outbox`).
- **Tests:** `frontend/tests/outboxQueue.test.js` (send-now vs hold; undo inside the window sends nothing; undo of a sent move enqueues the exact inverse; undo of a sent capture enqueues DELETE, of an unsent one drops it; 401 pauses all and resumes after login; 4xx fails without retry; restore after reload sends expired holds and verifies `sending` ops; `applyOutbox` never resurrects a held done after a refresh; capture retry runs the duplicate check first); `frontend/tests/freshness.test.js` (throttle and Stand formatting, pure).
- **Acceptance:** with the flag still pointing at the old views, a dev-only page `?ui=neu&debug=store` dumps lists and progress for Uli's local data copy (section 10) and matches `/gtd/inbox|next|waiting|someday` membership except the F4 cases, which are listed; keepalive verified in Chrome by closing the tab 2 s after a done and seeing the request in the backend log.
- **Effort:** 3.0

### M4 — Shell, navigation, phone dock, routes

- **Pattern:** New Capability + Public-Surface Migration *expand* (route `/review`; `?task=` honoured; `/login?next=`).
- **Brief:** `0050-the-new-shell-and-routes.md`.
- **Before you start:** `./run impact frontend/src/components/AppShell.vue`, `./run impact frontend/src/router/index.js`, `./run impact frontend/src/components/BrandMark.vue`, `./run impact frontend/src/stores/auth.js`.
- **Files:** `frontend/src/layout/AppFrame.vue` (props: `view`, `counts`, `stand`, `offline`, `failedCount`, `user`; slots: `head`, default, `margin`, `notice`, `chips`, `capture`; three layouts: > 1180 px rail + page column + margin column; 761-1180 px rail + page + docked panel; ≤ 760 px page + **bottom dock**); `layout/RailNav.vue` (03's rail with counts, `fällig` dot, footer `uli · Stand 09:41`, "Befehle ⌘K", "Tastenkürzel ?", rail outbox line `1 nicht gesendet · senden`); `layout/PhoneDock.vue` (in flow, top to bottom: notice, chips, tabs `Inbox · Nächste · Warten auf · ···` with counts and a yellow dot under the active tab, capture field; uses `visualViewport` so the dock sits above the keyboard; `env(safe-area-inset-bottom)`); `layout/MoreSheet.vue` (Projekte, Irgendwann, Rückblick, Alle, Einstellungen, theme, Abmelden); `layout/NoticeBar.vue` (1 px yellow time line; desktop bottom of the page column, phone inside the dock so it never covers a row); `layout/ui/Eyebrow.vue`, `PageHeading.vue` (one Fraunces word), `Pill.vue`, `Keycap.vue` (hidden on touch), `SectionRule.vue`, `EmptyState.vue`, `ErrorRow.vue`; `layout/MarginColumn.vue` (container only; panels come in M12); `frontend/src/router/index.js` (`/review`, `?task=<uuid>` → open detail after load, `/login?next=` return path, `pick()` now pointing at new pages as they land; placeholder pages render AppFrame with "kommt" text only behind the flag); `identity/LoginPage.vue` (brand restyle, German, pinned field names `Benutzername`, `Passwort`, `Anmelden`); `ops/surfaces/spa.json`.
- **Tests:** `frontend/tests/returnPath.test.js` (pure: only same-origin relative paths accepted for `next`, `?task` uuid validated) in `shared/returnPath.js`.
- **Acceptance:** acceptance kit for the empty frame at all sizes; phone: dock order and heights match m3 (`shots/phone.png`) with the leading-ring web row; Android Custom Tab URL `/next?task=<uuid>` lands on Nächste with the detail open after login (placeholder detail until M7 shows the description from `GET /tasks/{uuid}`); AppFrame imports no store (`./run impact frontend/src/layout/AppFrame.vue` shows no `fe/tasks` or `fe/identity` dependency).
- **Effort:** 3.5

### M5 — Lists, rows, sections, context chips, complete and undo

- **Pattern:** New Capability.
- **Brief:** `0051-lists-rows-and-sections.md`.
- **Before you start:** `./run impact frontend/src/components/TaskRow.vue`, `./run impact frontend/src/components/TaskList.vue`, `./run impact frontend/src/views/_useTaskView.js`, `./run map frontend/src/shared/taskFilters.js`.
- **Files:** `tasks/components/TaskLine.vue` (leading 44 px ring `Abhaken: <d>`, one-line title, mono meta in fixed columns on desktop (project, context, date), one non-wrapping meta line on phone; coral edge rule + "überfällig dd.mm."; "läuft" dot (static under reduced motion); coral dot "für heute"; sync line "Nicht gesendet · Erneut senden"; keyed; `InkStrike` 160 ms then collapse 120 ms, row out of the DOM ≤ 1 s); `tasks/components/InkStrike.vue`; `tasks/components/ListSection.vue` (`// Fällig · 1` with one hairline); `tasks/components/ContextBar.vue` (chips wrap, never scroll; `Alle`, ordered contexts, `ohne Kontext` dashed; key 1-6; counts from `contextCounts`); `tasks/useSwipe.js` (touch only: swipe right past 35 % of the width, min 96 px, completes; vertical scroll never completes); `tasks/views/InboxPage.vue` (list mode, newest first), `NextPage.vue` (head: eyebrow with `eyebrowCount`, "Was jetzt *zählt*" (screen-reader only on the phone), caption "3 von 7 heute · 1 zusätzlich" as text with an empty lens slot until M11; sections Fällig · (andere Kontexte) · Jetzt · Bald · Später), `WaitingPage.vue` (`// Nachhaken` with yellow ring, then Diese Woche, Später oder ohne Datum; never filtered by context), `SomedayPage.vue`, `AllPage.vue` (Erledigt toggle → `status=all`); `composables/useKeymap.js` + `shared/commands.js` (one table: `j k x e t / ? g i g n g w g p g s g a g r`, 1-6 chips); completion through the store's hold with notice "Erledigt · Rückgängig"; delete via `Entf` with "Gelöscht · Rückgängig".
- **Tests:** `frontend/tests/commands.test.js` (no duplicate keys per scope, every command has a message key, `?` sheet generated from the table); swipe threshold as a pure function in `shared/gestures.js` + test.
- **Acceptance:** acceptance kit for Inbox, Nächste (all contexts, `@computer`, `ohne Kontext`, a filter with nothing due → one Fällig heading with "andere Kontexte"), Warten auf, Irgendwann, Alle; compare with `web-desktop.png`, `web-filter.png`, `web-phone.png` — **except** the phone notice now sits in the dock and reads `Erledigt` (judge weak points 1 and 2); eyebrow count equals the selected chip's count; phone rows ≤ 60 px; tick-off budgets met; WebKit screenshots.
- **Effort:** 4.0

### M6 — Capture line

- **Pattern:** New Capability.
- **Brief:** `0052-the-capture-line.md`.
- **Before you start:** `./run impact frontend/src/components/TaskModal.vue`, `./run map frontend/src/tasks/stores/gtd.js`.
- **Files:** `tasks/components/CaptureLine.vue` ("Neues Todo", coral `+`, hint `⏎ in die Inbox`, `n` focuses on desktop; in the phone dock on every tab; on the phone Inbox it is focused on open, on Nächste and Warten auf it is not); description trimmed, whitespace collapsed, capped at 500 code points with the rest as the note (same rule as Android, `shared/capping.js`); draft kept in `localStorage['captureDraft']` (literal key, `spa.json` update) and turned into a capture on `pagehide` like Android; capturing from Nächste keeps the tab and chip, notice `In Inbox ✓ · Rückgängig`, Inbox tab count gets the yellow dot until visited; never asks for metadata.
- **Tests:** `frontend/tests/capping.test.js` (vectors shared with Android's `Capping.kt` behaviour: 500 code points, overflow to the note, 32 KB note cap).
- **Acceptance:** kit; capture works offline (row "Nicht gesendet"), reconnect + retry creates exactly one task (duplicate check); Rückgängig after send deletes on the server.
- **Effort:** 1.0

### M7 — Task detail (margin, docked panel, sheet)

- **Pattern:** New Capability.
- **Brief:** `0053-task-detail.md`.
- **Before you start:** `./run impact frontend/src/components/TaskModal.vue`, `./run impact frontend/src/shared/taskPayload.js`, `./run impact frontend/src/components/TaskActionSheet.vue`.
- **Files:** `tasks/components/TaskDetail.vue` (title edit `e`, project with existing names, contexts as toggles via `contextPayload`, priority, due, scheduled ("für heute" toggle via `planPayload`, follow-up day on waiting todos), wait, until, recur (refuses without due, shows the server's 400), depends, annotations list + add, start/pause, Erledigt, Löschen (held); "Nächste braucht einen Kontext" when a context-less todo is moved to Nächste); field edits through `buildTaskPayload` (kept, `''` clears) but tags only as deltas, never the full set; desktop: margin column; 761-1180 px: docked panel; phone: sheet from the bottom (`?task=` opens it); Esc closes.
- **Tests:** extend `taskPayload.test.js` only if the payload rule changes (it should not); `detailFields.test.js` for the pure "which fields are editable for which todo" rule (recurring keeps due and recur).
- **Acceptance:** kit; every field of the old TaskModal reachable (checklist in the PR); Android handoff URL opens this detail.
- **Effort:** 2.0

### M8 — Clarify panel, list moves with exact undo, never guess

- **Pattern:** New Capability.
- **Brief:** `0054-clarify-and-list-moves.md`.
- **Before you start:** `./run impact frontend/src/shared/gtdRules.js`, `./run impact frontend/src/tasks/stores/gtd.js`.
- **Files:** `tasks/components/ClarifyPanel.vue` (desktop Inbox list mode; two-key: `a` 1-5 context → Nächste; `w` then 1-4 follow-up answer (morgen / Montag / Freitag / nächste Woche / ohne Datum); `p` 1-9 project then its first action's context, last entry "Neues Projekt" with name validation (`projectNameError`); `v` Irgendwann; `x` Erledigt; `Entf` Löschen; `NeedsAnswer` → the panel asks, never defaults); list moves from rows and detail (`m` then n/w/v) with notice "Nächste · @computer · Rückgängig" that sends the exact inverse; leaving Warten auf clears `scheduled` (F1); Inbox empty → "Inbox ist *leer*." (typographic, no bloom).
- **Tests:** covered by M2 vectors; add store-level pure cases to `vectors` if a new combination appears.
- **Acceptance:** kit (`web-inbox.png`); Warten auf → Nächste leaves the lens caption unchanged; every move's undo returns the todo to its list with the same tags (checked on the local data copy by diffing `GET /tasks/{uuid}` before and after).
- **Effort:** 2.5

### M9 — Command palette, shortcuts sheet, search

- **Pattern:** New Capability.
- **Brief:** `0055-command-palette.md`.
- **Before you start:** `./run impact frontend/src/shared/commands.js`, `./run impact frontend/src/composables/useKeymap.js`.
- **Files:** `layout/CommandPalette.vue` (⌘K / Ctrl+K; actions, navigation, contexts, view, theme; todo and project search through a search provider that `fe/tasks` registers in `composables/useCommands.js`; "Als Todo erfassen" with the query; no backdrop blur, scrim from tokens); `layout/ShortcutsSheet.vue` (`?`, generated from `shared/commands.js`); `/` search in the page head (desktop) and a search sheet from the dock on the phone, client-side over the snapshot using `matchesSearch` (kept).
- **Tests:** `commands.test.js` extended (palette entries = table entries); `paletteRank.test.js` for the pure ranking function.
- **Acceptance:** kit (`web-palette.png`, `web-palette-search.png`); every keymap action reachable from the palette; palette works on the phone from "···".
- **Effort:** 2.5

### M10 — Card stack (Klären on touch, optional on desktop)

- **Pattern:** New Capability.
- **Brief:** `0056-the-card-stack.md`.
- **Before you start:** `./run impact frontend/src/tasks/components/ClarifyPanel.vue`, `./run impact frontend/src/tasks/stores/gtd.js`.
- **Files:** `tasks/components/CardStack.vue`, `StackTrays.vue`, `tasks/useCardSpring.js` (port of `06-kombination/card.js`: CSS 3D springs on DOM, no WebGL; drag and flick on touch and mouse; reduced motion = no animation); five trays Nächste · Warten auf · Irgendwann · Erledigt · Löschen (keys 1-5) that turn into the follow-up answers (contexts for Nächste, days for Warten auf); Zurück / Esc / 0; Projekt step with "Neues Projekt"; `e` edit; `→` skip; same store action as ClarifyPanel. Inbox mode remembered in `localStorage['inboxMode']` (literal, `spa.json`), default `stack` for `(pointer: coarse)` or ≤ 760 px, else `list`. **Card content fix (judge weak point 6):** the card shows the capture time and source, the first annotation (note) up to 4 lines, and the project if any; with no note the card shrinks to its content (no fixed height) and the trays move up; the capture field stays in the dock below the trays.
- **Tests:** `frontend/tests/stackSteps.test.js` (pure step machine: tray → answer → payload, back, skip, NeedsAnswer → next step).
- **Acceptance:** kit (`web-stack.png`, `web-stack-step.png`, `web-phone-stack.png`); card height ≤ content + 96 px; a whole Inbox of 5 cleared on the phone with taps only; drag on mouse works in Chrome and WebKit (`preserve-3d` checked).
- **Effort:** 6.5 (06's 6 + 0.5 card content)

### M11 — Tageslinse, bead flight, plan for today

- **Pattern:** New Capability (+ dependency `three@0.169.0`, exact pin, `tools/npm-lock.sh`, licence MIT).
- **Brief:** `0057-the-tageslinse.md` (records `BLIND-FE-002` for the lazy import, F14).
- **Before you start:** `./run impact frontend/package.json`, `./run impact frontend/src/tasks/views/NextPage.vue`, `./run map frontend/src/layout`.
- **Files:** `layout/lens/LensSlot.vue` (sized slot with the flat SVG inside); `layout/lens/LensFlat.vue` (port of `lens-flat.js`, volume-true level from `shared/lensMath.js`); `layout/lens/lensController.js` (port of `lens.js`: one module-level controller, `sync()` after each route/layout change moves the single canvas to the visible slot; `import('./lens3d.js')` in `requestIdleCallback` after first paint and only when a slot is visible and the viewport is > 760 px; reduced motion, no WebGL or `webglcontextlost` keep the SVG; rendering stops when nothing moves and when hidden); `layout/lens/lens3d.js` (port of `06-kombination/lens3d.js`; the only importer of `three`); `layout/lens/BeadFlight.vue` + `useBeadFlight.js` (overlay SVG path from the ring through the left gutter to the lens entry; only when `dayProgress` says the todo counts, a slot is visible and motion is allowed); `t` (keymap, detail, palette) toggles "für heute" via `planPayload`; slots in the Nächste head (104 px desktop, 52 px flat on the phone) and in the margin "Heute" (72 px; M12).
  - **Light-mode lens (judge weak point 4, "peach ball"):** reduce coral attenuation so the body reads clear and only the liquid is coral; raise transmission/thickness contrast; crisp specular highlight and fresnel rim; give the glass something to refract by drawing faint paper hairlines from the tokens behind the sphere inside the canvas. Uli picks from three stills (current, tuned A, tuned B) before merge.
  - **Phone caption (judge weak point 3):** `3 von 7 heute · 1 zusätzlich` everywhere; if it does not fit at 412 px beside the 52 px lens, "· 1 zusätzlich" wraps to a second line. No `+1`.
- **Tests:** `frontend/tests/lensMath.test.js` (level ↔ height volume-true, clamp); `frontend/tests/threeIsolation.test.js` (static scan: no file except `layout/lens/lens3d.js` imports `three`; `lens3d.js` is only reached through `import()`); `frontend/tests/beadRule.test.js` (pure: when a flight is allowed).
- **Acceptance:** kit plus `web-signature.png` and `web-reduced.png` equivalents; dev hook shows 0 frames over 3 s idle, ≤ 60 per planned completion; lens chunk ≤ 180 kB gzip and requested after first paint only on desktop Nächste/margin; one canvas maximum (dev hook counts canvases); context loss simulated via `WEBGL_lose_context` → SVG with the same level; dark lens per `web-dark.png`; WebKit: transmission frame time ≤ 16 ms during the bead on the MacBook, else fall back to a cheaper material on WebKit (recorded).
- **Effort:** 7.0 (lens 5, bead + `t` 1.5, light tuning 0.5)

### M12 — Margin column: Heute, Nachhaken, Projekte, Rückblick

- **Pattern:** New Capability.
- **Brief:** `0058-the-margin-column.md`.
- **Before you start:** `./run impact frontend/src/layout/MarginColumn.vue`, `./run impact frontend/src/tasks/stores/gtd.js`.
- **Files:** `tasks/panels/TodayPanel.vue` (`// Heute · Samstag, 31. Oktober`; lens 72 px + caption on every view except Nächste; on Nächste only the struck-through list, so "3 von 7" appears once); `WaitingPanel.vue` (`// Nachhaken · 1 heute`, follow-ups first); `ProjectsPanel.vue` (stalled projects, or "Alle N aktiven Projekte haben eine nächste Aktion."); `ReviewPanel.vue` (last weekly review, "Rückblick beginnen" with `g r`); pages pass panels into `AppFrame`'s `margin` slot; phone: panels appear in the More sheet.
- **Tests:** none beyond M2 (panels are presentation over tested rules).
- **Acceptance:** kit (`web-desktop.png` margin); "3 von 7" exactly once per screen (checked on every view).
- **Effort:** 1.5

### M13 — Projects

- **Pattern:** New Capability.
- **Brief:** `0059-projects-in-the-new-ui.md`.
- **Before you start:** `./run impact frontend/src/views/ProjectsView.vue`, `./run impact frontend/src/components/ProjectPlanModal.vue`.
- **Files:** `projects/ProjectsPage.vue` (overview from `/gtd/projects/overview`: stalled first, status pills active / on_hold / done via `PUT /projects/{name}/status`, create with `projectNameError`); `projects/ProjectPage.vue` (reads `/projects/:name` from the route, fixing the ignored deep link; tasks via the snapshot; inline add of a next action that asks for the context; the project is prefilled); `projects/PlanDocument.vue` (the five plan steps as one document in German, explicit save, Esc asks before discarding); `projects/ProjectRow.vue`.
- **Tests:** `frontend/tests/projectOverview.test.js` if any ordering or stalled display rule lives in the client (pure).
- **Acceptance:** kit; every plan step of the old modal reachable; deep link `/projects/Website-Relaunch` opens the project.
- **Effort:** 3.0

### M14 — Rückblick, Einstellungen, Alle

- **Pattern:** New Capability.
- **Brief:** `0060-review-and-settings.md`.
- **Before you start:** `./run impact frontend/src/views/SettingsView.vue`, `./run impact frontend/src/shared/claudeConnect.js`, `./run impact frontend/src/shared/mcpSnippets.js`.
- **Files:** `tasks/views/ReviewPage.vue` (03's steps: Inbox leeren, Nachhaken, Projekte ohne nächste Aktion, Irgendwann, erledigt letzte 7 Tage; "Rückblick eintragen" → `POST /gtd/review`); `identity/SettingsPage.vue` (German, brand; Profil, Passwort, API-Key, "Claude verbinden" with the pinned steps from `claudeConnect.js` unchanged, MCP tabs **Claude Code / Claude Desktop / curl** unchanged, admin section; theme choice System / Hell / Dunkel); `AllPage.vue` polish.
- **Tests:** existing `claudeConnect.test.js` and `mcpSnippets.test.js` must pass unchanged.
- **Acceptance:** kit; Android's "Key einfügen" flow still finds the key where the help text says.
- **Effort:** 2.5

### M15 — Phone polish, Safari/WebKit, accessibility and performance pass

- **Pattern:** New Capability (QA fixes inside the new UI only).
- **Brief:** `0061-phone-and-webkit-pass.md`.
- **Before you start:** `./run impact frontend/src/layout/PhoneDock.vue`, `./run impact frontend/src/layout/AppFrame.vue`.
- **Work:** phone head folds away on scroll and while the keyboard is up (m3 behaviour; first section ≤ 150 px from the top); ≥ 5 Inbox rows visible with the keyboard open on the Pixel 9 (Chrome); notice in the dock never covers a row (judge weak point 1); Safari 18 on macOS + Playwright WebKit: `color-mix()`, `dvh`, `visualViewport`, `preserve-3d`, `transmission` cost, `fetch keepalive` (close the tab during a hold, verify the server got it), `localStorage` in a private window, font loading; full a11y pass (section 5) on every view; bundle and frame budgets re-measured. iOS Safari on a device is **unverified** unless one is available; recorded in the brief.
- **Acceptance:** the whole kit on every view, all budgets met or the deviation approved by Uli in the PR.
- **Effort:** 4.5 (phone 1.5, WebKit 1.5, a11y/perf 1.5)

### M16 — Switch the default

- **Pattern:** Public-Surface Migration, step *switch*.
- **Brief:** `0062-the-new-ui-is-the-default.md`.
- **Before you start:** `./run impact frontend/src/shared/uiFlag.js`, `./run impact frontend/src/router/index.js`.
- **Precondition:** Uli has used `?ui=neu` daily for ≥ 7 days on desktop and phone; a `task export` backup of his data taken on the host (section 10).
- **Files:** `shared/uiFlag.js` default `'neu'`; `README.md`; `frontend/index.html` title `runway`, `theme-color` from tokens.
- **Acceptance:** kit on production with a second account; `?ui=alt` still reaches the old UI.
- **Effort:** 0.5

### M17 — Contract: delete the old UI, resolve the cycles

- **Pattern:** Public-Surface Migration, step *contract*, after ≥ 14 days of M16 without a fallback.
- **Brief:** `0063-the-old-ui-is-removed.md`.
- **Before you start:** `./run impact` on every file to delete (6.5), `./run violations`.
- **Files:** delete the old files of 6.5; `router/index.js` without `pick()`; delete `shared/uiFlag.js` and its test, key `ui` leaves `spa.json` (contract of the M0 expand); `architecture.toml`: remove the old file paths from the unit lists and **remove `CYCLE-001` and `CYCLE-002`** (both resolved; `RULE-ARCH-002` fails if they stay); `ops/structure-baseline.toml`: remove the hubs of deleted files (`TaskList.vue`, `TaskModal.vue`, `stores/tasks.js`, `_useTaskView.js`) and the `AppShell.vue` allowlist entry; `style.css` slimmed; `frontend/AGENTS.md` updated (cycles gone).
- **Acceptance:** `make verify` green; `./run violations` shows no cycle; entry JS ≤ 100 kB gzip, CSS ≤ 14 kB gzip.
- **Effort:** 1.0

### Optional MB1 — Shared context preference (only if Uli picks a shared, editable list in D1)

- **Pattern:** New Capability + Public-Surface Migration *expand* (two REST routes, one table). ADR for "REST-only, not an MCP tool".
- **Brief:** `0064-the-context-preference.md`.
- **Before you start:** `./run impact backend/app/routers/auth.py`, `./run impact backend/app/database.py`, `./run impact backend/app/main.py`, `./run mcp`.
- **Files:** `backend/app/database.py` (additive migration: table `user_preferences(username, key, value, updated_at)`); `backend/app/routers/auth.py` (`GET /auth/preferences`, `PUT /auth/preferences` with `{ "contexts": ["@home", …] }`, validated with the tag rule, ≤ 20 entries); tag `auth` is **not** on the MCP allowlist in `backend/app/main.py`, so no MCP tool (an agent does not need it; adding it later is its own change); `rules/route-guards.toml` lines; `ops/surfaces/openapi.json`, `ops/surfaces/db-schema.sql` (`./run surfaces --update`); `AGENTS.md` REST count 40 → 42 (`RULE-DOC-001`); `README.md` API section; web: `shared/contexts.js` takes the stored list as the preset, settings page gets an editor.
- **Tests:** `backend/tests/unit/test_preferences.py` (auth required, per-user isolation, validation, round trip); a container test for the migration; web `contexts.test.js` cases with a stored preset (also in the vectors).
- **Effort:** 1.5

### Optional MB2 — Android handoff endpoints (not assumed; Android open question 13)

`POST /auth/handoff` + `POST /auth/handoff/exchange` (one-time code in the URL fragment, 60 s), Security
or Operability Change pattern with an adversarial test (replay, expiry, cross-user). REST-only. 1 pd.

### Optional MG — Bundle budget as a gate rule

`RULE-PERF-001` with all four artefacts of the meta-rule (`tools/checks/bundle-budget.sh`, ledger
entry, negative fixture, contract text). Until then the budgets are checked by hand in each brief. 1 pd.

---

## 8. Effort

| Milestone | pd |
|---|---:|
| M0 Coexistence switch, unit map | 1.0 |
| M1 Tokens, fonts, theme | 1.5 |
| M2 Shared rules, vectors, i18n core | 2.5 |
| M3 Data layer, write path, freshness | 3.0 |
| M4 Shell, phone dock, routes | 3.5 |
| M5 Lists, rows, sections, chips, complete/undo | 4.0 |
| M6 Capture line | 1.0 |
| M7 Task detail | 2.0 |
| M8 Clarify panel, list moves | 2.5 |
| M9 Palette, shortcuts, search | 2.5 |
| M10 Card stack | 6.5 |
| M11 Tageslinse, bead, `t` | 7.0 |
| M12 Margin column | 1.5 |
| M13 Projects | 3.0 |
| M14 Rückblick, Einstellungen, Alle | 2.5 |
| M15 Phone, WebKit, a11y, perf | 4.5 |
| M16 Switch | 0.5 |
| M17 Contract | 1.0 |
| **Subtotal** | **50.0** |
| Repository process: 18 briefs, `make verify`, surfaces, screenshot sets (≈ 0.2 pd per PR) | 3.5 |
| Contingency 10 % | 5.4 |
| **Total (core)** | **≈ 59** |
| Optional MB1 / MB2 / MG | 1.5 / 1 / 1 |

This is ≈ 7 pd above 06's own ≈ 52 and ≈ 13 above the judge's 38-46. The difference is real work 06
did not count: the phone bottom dock (+1.5), swipe-to-complete on touch (+0.5), the coexistence switch
and the contract step (+1.5), card content and lens tuning (+1), the rule fixes found here (+0.5), and the
repository's own process (+3.5). Replacing the IndexedDB mirror with `localStorage` saves 0.5.

**Cut list, level A** (keeps what the combination is for; added later without rework), in this order:

1. Stack as a desktop mode (touch only; desktop keeps the two-key panel): −1.
2. Drag and flick in the stack (tap a tray, keys 1-5 stay): −1.5.
3. Palette search over todos and projects (actions, navigation, contexts stay; `/` search exists): −1.
4. PlanDocument restyle: keep the five steps but reuse the old modal's layout inside the new frame: −1.5.
5. Swipe to complete on the web (the ring stays): −0.5.
6. Phone head fold on scroll (static reduction only): −0.5.
7. ReviewPage reduced to the margin panel plus a checklist: −0.5.
8. Contingency on the smaller scope: −0.7.

Level A reaches **≈ 51 pd.** Reaching **46** needs one level-B cut, which removes part of the design's
identity and is Uli's call:

- **B1:** drop the bead flight and ship the lens as SVG only on all widths (no `three`): −5 → ≈ 46.
- **B2:** drop the card stack; touch Klären uses ClarifyPanel as a bottom sheet (+1): −4.5 (after level A
  items 1-2 are already cut) → ≈ 46.5.

Recommendation: level A only, and accept ≈ 51. The lens and the stack are the two things Uli chose.

---

## 9. Carry-over checklist (judge "still weak", critic must-fix and nice-to-have)

| Item | Where it is handled |
|---|---|
| Judge 1: phone web lags, top tabs, notice covers a row for 6 s, 205 px head, 59 px rows | D2 bottom dock (M4), notice in the dock (M4/M5), head fold (M15), rows ≤ 60 px (M5) |
| Judge 2: `Erledigt: <text>` vs Android's pinned `Erledigt` | `notice.done = 'Erledigt'` (M2), vector `strings` (M2), M5 acceptance |
| Judge 3: `3 von 7 +1` | `lensCaption` only has `· N zusätzlich` (M2), phone wrap rule (M11) |
| Judge 4: light lens reads as a peach ball | M11 light tuning with three stills for Uli |
| Judge 5: context sets differ | D1 + `contexts.js` + vectors (M2), optional MB1 |
| Judge 6: empty stack card | M10 card content fix |
| Judge 7: effort over budget, WebKit unverified | Section 8 cut list; M15 WebKit pass, WebKit shots from M5 |
| Critic must-fix 1: phone notice off-screen | moot with the dock (M4); M15 checks |
| Critic 2: capture field in the phone stack | M10 (field stays in the dock) |
| Critic 3: Warten auf → Nächste kept the follow-up | `listPayload` clears `scheduled` (M2), container test (M2), M8 acceptance |
| Critic 4: "Fällig · 0" above "andere Kontexte" | `nextSections` merge rule (M2), M5 acceptance |
| Critic 5: eyebrow and chip counts disagree | one `eyebrowCount` (M2) |
| Critic 6: dark lens looked like metal | port of the dark branch (M11), dark shots |
| Critic 7: "3 von 7" twice on Nächste | M12 rule, acceptance "exactly once per screen" |
| Critic 8: effort tuned to the range | Section 8 (honest total) |
| Nice to have: follow-up answers (morgen = next working day …) | `followUpDay` (M2) |
| Nice to have: rail outbox line | M4 |
| Nice to have: stack project step with "Neues Projekt" | M10 |
| Nice to have: refresh on focus/visibility | `useFreshness` (M3) |

---

## 10. Testing on Uli's live data, safely

1. **Local copy first.** Copy Uli's Taskwarrior directory and `users.db` from the host read-only
   (`rsync` from the `DATA_ROOT` and `DB_PATH` of the deploy host) into the repo's gitignored `data/`
   and `users.db`. Run the backend locally with `DATA_ROOT=./data DB_PATH=./users.db` and the SPA with
   `npm run dev` (Vite proxies `/api` to `:8000`). Every write in M3-M15 is tried here first. Refresh
   the copy before each write-path milestone.
2. **Membership parity check (read-only, live).** Before M5 and again before M16, compare the client
   lists with the server lists on Uli's real account: a small script outside the gate (kept in the
   scratchpad, not committed) reads `/tasks`, `/gtd/waiting`, `/gtd/inbox|next|someday` with Uli's API
   key and runs `listOf`. Differences must be exactly the F4 dual-tag cases; list them for Uli.
3. **Production behind the switch.** Uli opts in with `?ui=neu`, desktop first, phone from M15. Other
   accounts stay on the old UI until M16. A second account (for example `uli-test`, created by Uli) is
   used for destructive checks on production (delete, keepalive flush, offline retry).
4. **Backup before switching.** Before M16 and before the first production use of the write path
   (M5), take `task export` of Uli's data on the host into a dated file outside the container (there is
   no backup runbook in `docs/operations.md`; this is a manual step, recorded in the brief).
5. **Concurrent writers.** Claude (MCP) and Android write to the same account. The snapshot refresh
   on focus and the server-returned task after every PUT keep the web correct; a held done on a task an
   agent already completed gets a 4xx and shows "Nicht gesendet" with the server's message, which is the
   intended visible failure.

---

## 11. Coordination with Android

Android's plan: `/Users/uli/projects/agentic-reach/runway-android/docs/unified-ui-plan.md`. Android
must not require a runway change unless a milestone here provides it.

| Android needs | Provided by | Path / contract |
|---|---|---|
| The same rules, tested the same way | M2 | `frontend/tests/vectors/gtd-rules.v1.json` (copy it; record its SHA-256; a new rule bumps `version`) |
| The pinned German strings | M2 | `strings` section of the same file, equal to `frontend/src/shared/messages.de.js` |
| Context order | M2 | `contextPreset` + `orderContexts` cases in the vectors (D1) |
| List membership for dual-tagged todos (F4) | M2 | vectors: a `+next +waiting` todo is in Warten auf only; Android stops showing `/gtd/next` raw or filters by the same rule |
| Day progress (`3 von 7 heute · 1 zusätzlich`) and "für heute" | M2 (rules), existing API | `GET /tasks?completed_since=<today>` for done-today; `planPayload` for `t` |
| Design tokens | M1 | `frontend/tokens/tokens.json`, generated `frontend/tokens/RunwayTokens.kt` |
| Task details in a Custom Tab | M4, M7 | `/next?task=<uuid>`, `/waiting?task=<uuid>` open the detail; `/login?next=` returns there after login |
| Shared editable context list | MB1 (optional) | `GET /auth/preferences` → `{ "contexts": [...] }`, `X-Api-Key` works; until it ships Android keeps its preset |
| Logged-in Custom Tab without a second login | MB2 (optional, not assumed) | handoff endpoints |

Nothing in this plan changes `/inbox`, the outbox-relevant routes, or the summary that Android reads.

---

## 12. Risks

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| Effort overrun (two clients built in parallel by one maintainer) | high / medium | Cut list A in order; Uli chooses B1/B2 only if needed; milestones are independently mergeable behind the switch. |
| Client list rules drift from the server's | medium / high | Vectors, parity check (section 10), container tests in M2; one place (`gtdRules.js`). |
| F6: completion drops `start`, denominator shrinks | medium / low | Answered by the M2 container test; `plannedAtHold` keeps the count stable in the session. |
| Keepalive or held writes lost (Safari, tab killed, expired JWT) | medium / high | Synchronous `localStorage` outbox, boot replay with verification, 401 pause, WebKit test in M15. |
| WebGL transmission too slow on WebKit or old GPUs | medium / low | Frame budget per bead; cheaper material on WebKit; SVG fallback is complete. |
| Rendering untested (`RISK-TEST-004`) | high / medium | Logic in `shared/` with tests; screenshot kit per milestone; the switch keeps the old UI as a fallback until M17. |
| Fan-in ratchet and architecture edits need owner approval (`RISK-GOV-001`) | certain / low | Done once in M0 and M17; dated lines elsewhere. |
| Old and new UI both in the bundle for weeks | certain / low | Budget 130 kB gzip during coexistence; M17 removes the old code. |
| Hardcoded Europe/Berlin day boundary (F7) | low for Uli / medium for third-party deploys | Recorded in the M2 brief; a `timezone` field in the summary would be a public-surface change for a later decision. |
| Index blind spots (F13, F14) hide test protection and the lazy chunk edge | certain / low | Briefs name the tests and the dynamic import explicitly. |

---

## 13. Rollback

- **Per user, instant (M0-M16):** `?ui=alt` (stored in `localStorage['ui']`) returns to the old UI.
  Writes from the new UI go through the same API with deltas, so the old UI reads the same data.
- **Per deploy:** pin the previous immutable `:<sha>` images on the host as in
  [`docs/operations.md`](../operations.md#rolling-back). Every milestone is one PR, so one SHA back undoes
  one milestone.
- **Data:** no migration in the core plan; nothing to reverse. MB1 is additive (a new table nobody
  else reads). Undo of every move is an exact inverse, and done/delete are held 6 s before they reach
  the server.
- **After M17** only the image rollback remains; M17 therefore waits for 14 days of M16 without a
  fallback.

---

## 14. Files this plan creates, at a glance

`frontend/src/shared/`: `uiFlag.js`, `gtdRules.js`, `sections.js`, `dayProgress.js`, `contexts.js`,
`dates.js`, `capping.js`, `gestures.js`, `returnPath.js`, `lensMath.js`, `outboxQueue.js`, `commands.js`,
`i18n.js`, `messages.de.js` ·
`frontend/src/composables/`: `useTheme.js`, `useMedia.js`, `useFreshness.js`, `useOutbox.js`,
`useCommands.js`, `useKeymap.js` · `frontend/src/api/keepalive.js` ·
`frontend/tokens/`: `tokens.json`, `tailwind-tokens.js`, `RunwayTokens.kt` · `tools/gen-tokens.mjs` ·
`frontend/src/assets/`: `fonts/*`, `fonts.css`, `tokens.css` ·
`frontend/src/layout/`: `AppFrame.vue`, `RailNav.vue`, `PhoneDock.vue`, `MarginColumn.vue`,
`MoreSheet.vue`, `NoticeBar.vue`, `CommandPalette.vue`, `ShortcutsSheet.vue`, `ui/*`, `lens/*` ·
`frontend/src/tasks/`: `stores/gtd.js`, `views/*Page.vue`, `components/*`, `panels/*`, `useSwipe.js`,
`useCardSpring.js` · `frontend/src/projects/*` · `frontend/src/identity/*` ·
`frontend/tests/`: one test per shared module above, `vectors.test.js`, `strings.test.js`,
`threeIsolation.test.js`, `vectors/gtd-rules.v1.json` ·
`backend/tests/container/test_ui_contract.py` · briefs 0046-0063 · one ADR (M0).

New localStorage keys (all snapshotted in `ops/surfaces/spa.json`): `ui` (removed in M17), `outbox`,
`captureDraft`, `inboxMode`. New route: `/review`; new query handling: `?task=`, `/login?next=`, `?ui=`.
New dependency: `three@0.169.0`.
