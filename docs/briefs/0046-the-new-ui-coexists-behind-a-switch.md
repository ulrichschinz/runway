# Change Impact Brief 0046 — The new UI coexists behind a switch

| Field | Value |
|---|---|
| **Requested outcome** | The unified UI ([the plan](../plan/unified-ui-web.md), design [06-kombination](../design/2026-10-31-unified-ui/06-kombination/README.md), approved 2026-10-31) is built in eighteen milestones, each merged and deployed on its own. That is only safe if a merged milestone changes nothing for anyone who has not opted in. This change is milestone **M0**: every SPA route renders through a per-browser switch — `?ui=neu` / `?ui=alt` on any URL, remembered in `localStorage['ui']`, default `alt` — with **both sides still pointing at the old views**; the folders the new UI will live in are declared once as globs of the existing units; the four modules that will be hubs by design are allowlisted with their reasons; and the design source every later milestone ports and compares against is committed, together with this plan. |
| **Owning unit** | `fe/shared` — the new [`frontend/src/shared/uiFlag.js`](../../frontend/src/shared/uiFlag.js). `fe/app` — [`frontend/src/router/index.js`](../../frontend/src/router/index.js) and the new [`frontend/src/router/pick.js`](../../frontend/src/router/pick.js). `ops` — [`architecture.toml`](../../architecture.toml), [`ops/structure-baseline.toml`](../../ops/structure-baseline.toml), [`ops/surfaces/spa.json`](../../ops/surfaces/spa.json), [`.gitignore`](../../.gitignore) (one negation, see *The design folder*). `docs` — [`docs/design/2026-10-31-unified-ui/`](../design/2026-10-31-unified-ui/README.md), [`docs/plan/unified-ui-web.md`](../plan/unified-ui-web.md), [ADR 0042](../adr/0042-the-new-ui-coexists-behind-a-switch.md), [`README.md`](../../README.md), [`frontend/AGENTS.md`](../../frontend/AGENTS.md), [`docs/threat-model.md`](../threat-model.md) (the key list). `tests` — the new [`frontend/tests/uiFlag.test.js`](../../frontend/tests/uiFlag.test.js) and [`frontend/tests/pick.test.js`](../../frontend/tests/pick.test.js). |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §4 (frontend units are declared in `architecture.toml`; fan-in is a ratchet), §5 (SPA routes and localStorage keys are a public surface, snapshotted in `ops/surfaces/spa.json`), §6 (`architecture.toml` and the gate configuration need owner approval — `RISK-GOV-001`); [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (features never import features; tests cover logic, not components). |
| **Governed by** | [ADR 0042](../adr/0042-the-new-ui-coexists-behind-a-switch.md) — new with this change: why a per-browser switch instead of a big-bang rewrite, and the contract step that removes it. [ADR 0007](../adr/0007-frontend-test-scope.md) — the decision is tested as pure logic; the wrapper that renders it is not mounted. |
| **Rule IDs introduced** | **None**, and no rule changes. `RULE-ARCH-003`'s baseline gains four allowlist entries (its ledger rationale allows raising the baseline as a visible act); `RULE-SURF-001`'s SPA snapshot gains the key `ui`; `.gitignore` keeps the exact line `data/` that `RULE-HYG-002` requires and gains one negation below it. All three are data the rules read, not the rules. |
| **Entry points** | The router guard in `frontend/src/router/index.js` (stores a valid `?ui=` before the auth check, on every navigation); `pick()` in `frontend/src/router/pick.js` (one wrapper component renders the old or the new side of a route); `resolveUi`, `currentUi`, `rememberUi` in `frontend/src/shared/uiFlag.js`. |
| **Affected public surfaces** | **SPA localStorage keys: `ui` is added** (expand step of the Public-Surface Migration; removed again in M17). **SPA routes: unchanged** — same ten paths, same redirect, same `meta.public`; only the component behind each path is now the wrapper. REST stays 40 routes, MCP tools 27, route guards 39; the database schema and the Taskwarrior template are untouched. |
| **Known dependents** | From the index: `frontend/src/router/index.js` has one direct dependent, `frontend/src/main.js`; nothing depends on `main.js`. Through the router, every old view is now rendered by the wrapper: `LoginView.vue`, `InboxView.vue`, `NextView.vue`, `WaitingView.vue`, `SomedayView.vue`, `ProjectsView.vue` (twice: `/projects` and `/projects/:name`), `AllTasksView.vue`, `SettingsView.vue`. None of them defines an in-component route guard — vue-router reads options-API guards (`beforeRouteEnter/Update/Leave`) off the route's component, which is now the wrapper, and would no longer find them. The index has no fact for this; a text search of `frontend/src/` for `beforeRoute` and `onBeforeRoute` has no hit. Because every later page is a dependent of this too, the `pick.js` docblock and `frontend/AGENTS.md` say it where M4-M15 read first: pages use `onBeforeRouteLeave` / `onBeforeRouteUpdate` in setup (registered on the matched record, removed on unmount, so they behave as on `main`) or a route record's `beforeEnter`. `AppShell.vue` (whose impact was queried as the plan asks: seven views, the router and `main.js` depend on it) is not touched. |
| **Uncertain / dynamic areas** | `RISK-TEST-004` — the wrapper and the guard are rendering and routing, untested by construction; the decision they call is tested. `BLIND-FE-002` does not apply: both sides are imported statically, on purpose, so the index keeps every router → view edge. `BLIND-FE-001` does not apply (the wrapper renders components it received as props, not template tags). **F13**: the index credits no frontend test with protection (it reads imports only under `frontend/src/`), so the protecting tests are named here instead: `frontend/tests/uiFlag.test.js` (the decision) and `frontend/tests/pick.test.js` (one wrapper for every route, which the old UI's unchanged reuse rests on). Storage that throws (a browser refusing site data) degrades to the default, or to the query's choice for one page load — tested with a throwing stub, not in a real browser. |
| **Analogous implementations** | `frontend/src/composables/useDarkMode.js` — the other per-browser preference, the `theme` key, read once and written on change. [Brief 0045](0045-a-refused-login-stays-on-the-page.md) — a decision extracted into `frontend/src/shared/` as a pure function with its own test, while its call site stays untested. `SHIM-SEC-006` in `rules/shims.yaml` — the repository's one running expand → contract with a dated removal. |
| **Delivery Pattern** | **Public-Surface Migration, step *expand*** (a new localStorage key; the old UI stays the default and the only thing rendered), with an ADR. The switch step is M16 (default `neu`), the contract step M17 (switch, old UI and the key deleted); both are in the plan's section 7. |
| **Required tests** | `frontend/tests/uiFlag.test.js`: the default is `alt`; a stored choice is used; a valid query overrides the stored choice; invalid query and stored values are ignored (wrong case, unknown words, empty, `null`, a repeated parameter); `rememberUi` writes only `alt`/`neu`, under the literal key `ui`; storage that throws or is absent gives the default and never throws. `frontend/tests/pick.test.js`: `pick()` gives every route the same wrapper component, and passes the old side as `alt` and the new one as `neu` (plain objects, nothing rendered). The existing 87 frontend tests and 642 backend unit tests must pass unchanged. |
| **Intended scope** | The files named under *Owning unit*, the screenshots under [`docs/design/2026-10-31-unified-ui/build/m0/`](../design/2026-10-31-unified-ui/build/m0/README.md), one licence file the committed fonts lack ([`shared/brand/fonts/OFL.txt`](../design/2026-10-31-unified-ui/shared/brand/fonts/OFL.txt), named in `shared/brand/ORIGIN.md`), and the screenshot tool's axe-core lookup (*The screenshot tool*). **Not** in scope: any new page or component (M4 onwards), tokens and fonts in the app (M1), `rules/shims.yaml` (see *Open points*), and every live-data step of the plan's section 10. |
| **Base revision** | `11e1287` |

## Behaviour change

None that a user can see. Every route that renders a component now renders `UiPick`, a wrapper
that renders either the old view or the new page of that route. In this milestone both are the
old view, so `?ui=neu` stores the choice and renders exactly what `?ui=alt` and no choice at all
render. The screenshot comparison below holds that claim to pixels, on every route that renders a
component.

What does change: a visit to any URL carrying `?ui=neu` or `?ui=alt` writes `localStorage['ui']`,
before the auth check, so the choice survives the login redirect. Any other value — `?ui=NEU`,
`?ui=new`, `?ui=`, `?ui=neu&ui=alt` — is ignored and leaves the stored choice alone. The query
parameter stays in the address bar; nothing strips it.

### Why one wrapper for every route, and not one per route

The plan names the helper `pick(OldView, NewPage)`, "a tiny wrapper component that renders one of
the two". Written literally — a new wrapper component per call — it changes the old UI: Vue reuses
a route's component when the next route renders the same type, which is what happens today
between `/projects` and `/projects/:name` (both `ProjectsView`). Two different wrappers would
unmount and remount `ProjectsView` on that navigation. So `pick()` returns the route's fields
instead: `{ component: UiPick, props: { alt, neu } }`, with one `UiPick` for all routes. Vue then
patches the wrapper on every navigation and the *inner* component decides between reuse and
remount, exactly as `RouterView` did before. That stays true when M13 gives `/projects` and
`/projects/:name` two different new pages.

The wrapper reads `route.query.ui` while rendering, so a navigation inside the SPA that only
changes the query (`/next` → `/next?ui=neu`) re-renders it; the guard has already stored the
choice by then.

### Where the new UI's files go

`architecture.toml` gains one glob per unit, so M1-M15 add files without editing the contract:

| Folder | Unit |
|---|---|
| `frontend/src/assets/**` | `fe/app` |
| `frontend/src/layout/**` | `fe/layout` |
| `frontend/src/tasks/**` | `fe/tasks` |
| `frontend/src/projects/**` | `fe/projects` |
| `frontend/src/identity/**` | `fe/identity` |
| `frontend/tokens/**` | `fe/shared` |

`frontend/src/shared/`, `frontend/src/composables/` and `frontend/src/api/` were already globbed
into `fe/shared`. No file moves (MODE C); the old files keep their explicit lists until M17 deletes
them. The allowed edges are unchanged: `fe/layout → fe/tasks, fe/identity` must stay while
`AppShell.vue` exists (`CYCLE-001`, `CYCLE-002`), so the gate cannot yet hold *new* layout code to
"imports no feature" — the plan's rule is recorded in the unit's note and in `frontend/AGENTS.md`,
and M4's acceptance checks `AppFrame.vue` with `./run impact`.

### Hubs by design

`ops/structure-baseline.toml` allowlists, each with its reason in a comment:
`frontend/src/shared/i18n.js` (every new component's strings), `frontend/src/shared/gtdRules.js`
(list membership and payloads, shared with Android through vectors),
`frontend/src/layout/AppFrame.vue` (the frame every new page wraps itself in, successor of the
allowlisted `AppShell.vue`), `frontend/src/tasks/stores/gtd.js` (the one snapshot store). None of
them exists yet; an allowlist entry for a missing file is inert (`tools/index/boundaries.py` only
skips listed paths it finds).

## The design folder

Committed whole, as Uli approved: **222 files as they were approved, plus the one licence file
below — 223 tracked, 28.0 MiB (29.35 MB)**, 70 of them PNG (25.1 MiB) — and this milestone's
screenshots. The plan file goes in with it. Counted on disk and in `git ls-files`, which agree;
`git status --ignored docs/` is empty.
Committed now because every later brief links into it, and `RULE-DOC-004` resolves relative links
against the working tree — in CI, where the folder was untracked, every such link would fail (F15).

Each gate that could have tripped on it, checked with the folder staged (staged files are tracked
for `git ls-files`, which every scanner below reads), before any code changed:

| Concern | Result |
|---|---|
| Ignore rules | **Tripped, found in review.** The root `.gitignore` line `data/` — meant for the Taskwarrior data root — is unanchored, so it also matched the folder's `shared/data/`, and `git add` skipped `shared/data/tasks.js` without a word. That file is the invented demo set every prototype imports (06 `rules.js`, `store.js`, `rules.test.mjs`, the mobile and 01-05 proposals, the dev harness's seed): a clean checkout could neither load 06 nor run its rule tests, which M2 ports. The first commit of this milestone missed it, and its count came from `git ls-files`, so it missed it too. **Resolved** by one negation directly below `data/`, with a comment: `!docs/design/2026-10-31-unified-ui/shared/data/`. Not by anchoring the rule to `/data/`: `RULE-HYG-002` requires the exact line `data/`, and a backend started from `backend/` with a relative `DATA_ROOT` would leave live data unignored. `data/`, `backend/data/`, `frontend/data/` and `docs/data/` stay ignored (`git check-ignore`); `RULE-HYG-001` matches only the root `data/`. Checked in a clean `git archive` of the commit: `06-kombination/rules.test.mjs` passes and `shot.mjs 06-kombination/index.html` renders the board. |
| Font licences | No gate covers fonts: `RULE-DEP-002` classifies installed npm and Python packages only. The obligation is the licence's own: the SIL OFL 1.1 lets the fonts be redistributed only with their copyright notice and the licence. The seven woff2 files carry the notice (name ID 0) and the licence URL (ID 14), but not the licence text (ID 13 is absent), read from each file's `name` table. **Resolved** by adding `shared/brand/fonts/OFL.txt`: the three copyright lines exactly as the files state them, and the OFL 1.1 text; `shared/brand/ORIGIN.md` names it. |
| Credentials (`RULE-DEP-003`, `RULE-HYG-001`) | No finding. `shot.mjs` names the dev harness's demo login in comments, which is neither a known key shape nor a high-entropy assignment; no `.pem`/`.key`-shaped file. |
| Links and paths (`RULE-DOC-001`, `RULE-DOC-004`) | Neither reads the design folder: they hold `AGENTS.md`, ADRs and briefs. This brief's and ADR 0042's links into the folder resolve. |
| Index ownership | `docs/**` → `docs`. The index adds a file node per tracked file (729 → 951 nodes) and extracts no code outside `frontend/src/` and `backend/app/`, so the prototype's JavaScript creates no import edge, no fan-in and no boundary finding; `index-deterministic` stays byte-identical. |
| ESLint scope (`RULE-LINT-002`) | `eslint .` runs inside `frontend/`; the prototype is outside it. |
| Supply chain (`RULE-DEP-002`, `-004`, `-005`) | Unaffected: installed metadata, Dockerfiles and locks only. |

**One configuration change for the design folder:** the `.gitignore` negation above, so the
folder is committed whole as the plan's F15 asks; no gate's own configuration changed. The changes
this milestone makes to owner-approval files are the two the plan prescribes — the globs in
`architecture.toml` and the allowlist in `ops/structure-baseline.toml` — and, from the review, one
the plan does not: `fe/app` in the `tests` unit's allowed edges, so `frontend/tests/pick.test.js`
may import the module it protects (the edge's own note: "Tests may reach anything they protect").
Uli approved the plan's changes as the owner; the `tests → fe/app` edge and the `.gitignore` line
are listed under *Open points* for his confirmation. With one maintainer none of these approvals is
independent (`RISK-GOV-001`).

### The screenshot tool

`shared/tools/shot.mjs` is committed as the dev-harness stage extended it, which is this
milestone's tool change (the plan asks for `--url=`): `--url=<absolute URL>` (no design server),
`--login=user:pass` (logs in through `/api/auth/login` and injects the token before any page
script, once per tab, on that origin only), `--storage=key=value` (repeatable), `--size=narrow`
(1024 × 768), `--browser=chrome|chromium|webkit`, `--axe[=path]` (axe-core, serious and critical
violations listed), `--requests`, and option validation (an unknown option or a malformed value
exits 2). The tool stays outside the gate, as the plan says. It carries one absolute path that
only exists on Uli's machine, the Playwright install (there before this change). The harness stage
had also hard-coded its own axe-core, inside this session's temporary scratchpad; the review
removed that: axe-core is now looked up at `--axe=<path>`, then `$AXE_CORE_PATH`, then beside the
Playwright install, and `--axe` with none of them exits 2 before a browser starts, because the
plan's §5 accessibility step would otherwise pass on a report that never ran.

## Where this departs from the plan or the prototype

The prototype has no switch, so there was nothing of 06 to port here; where the plan was silent or
literal, these choices were made:

1. **`pick()` returns route fields around one shared wrapper**, not a new component per route
   (*Why one wrapper*, above). The plan's call shape `pick(OldView, NewPage)` is kept.
2. **The `?ui=` parameter stays in the address bar.** The plan does not say; stripping it would be
   a `router.replace` on every opted-in visit for no gain, and leaving it lets a link carry the
   choice.
3. **`frontend/AGENTS.md` gains a section** ("Two UIs until the contract step"), which the plan's
   M0 file list does not name. Every later milestone's agent reads that file first and needs to
   know where new files go and that `src/layout/` must not import a feature while the gate still
   allows it. The root `AGENTS.md` is not touched.
4. **`architecture.toml` gains notes**, beyond the globs: on `fe/app` (the wrapper), `fe/layout`
   (no feature imports in new code), `fe/shared` (`tokens/`), and the `fe/projects → fe/tasks`
   edge (the new projects pages read the tasks store, as plan §6.1 records).
5. **The design folder gains `shared/brand/fonts/OFL.txt`** and a row in `ORIGIN.md` naming it
   (*The design folder*, above). The screenshot tool was extended by the dev-harness stage before
   this milestone, as recorded above, and its axe-core lookup changed in review; no other file in
   the folder was changed.
6. **Size:** the folder is 28.0 MiB (29.35 MB) on disk, not the 34 MB the approval named; this
   milestone's screenshots add 3.8 MB on disk and 2.0 MB to the repository: 19 of the 38 PNGs are
   byte-identical to another one, so there are 19 distinct contents, and git stores each once.
7. **`.gitignore` gains one negation** for the design folder's demo data (*The design folder*). The
   plan's M0 file list does not name `.gitignore`; without it the folder is not committed whole.
8. **`frontend/tests/pick.test.js` and the `tests → fe/app` edge**, which the plan's M0 test list
   does not name. The reuse invariant of deviation 1 is otherwise unprotected: a later milestone
   that "simplifies" `pick()` into a wrapper per route would remount `ProjectsView` between
   `/projects` and `/projects/:name`, and no screenshot shows a remount. It imports `pick.js` and
   renders nothing (ADR 0007); `frontend/AGENTS.md`'s test-scope line says so.
9. **`docs/threat-model.md`** names `ui` in its two lists of the SPA's `localStorage` keys, which
   were complete lists and would otherwise be false.

## Open points

- **The switch is not registered in `rules/shims.yaml`.** In M0 the old UI is the default, not a
  deprecated shape, so there is nothing to count down yet. It becomes one at M16, when `?ui=alt`
  is the compatibility path; registering it there, with M17 as its removal step and a date, would
  put the contract step under `RULE-SEC-002`'s countdown. A suggestion for M16's brief, not part of
  the plan.
- **`RULE-GOV-002` is red on `main` and here**, for the same reason: the decay review is overdue
  since 2026-10-14. It is outside this change; no decay evidence is committed with it.
- **For M3's brief:** the threat model's browser section will need a real entry for `outbox`,
  which holds task payloads that survive a 401 and a logout; `ui` needed only its name.
- **Pending for Uli** (none of them blocks this milestone): approval of this commit and the push of
  the stacked branch; confirming, as the owner, the two configuration lines the review added beyond
  the plan — `fe/app` in the `tests` unit's allowed edges and the `.gitignore` negation
  (`RISK-GOV-001`: not independent); after the merge, opening production once with `?ui=neu` and
  once with `?ui=alt` and seeing the old UI both times. The plan's section-10 live-data steps
  (local data copy, membership parity check, production opt-in for the new pages, `task export`
  backup) begin with the milestones that read or write live data (M3, M5, M16) and are not owed
  here.

## Pre-checks

- **Before touching anything** (`main` at `11e1287`, branch `ui/m0-coexistence-switch` just
  created): `make check` **GREEN**, 16 s of 180 s.
- **The design folder alone, staged** before any code changed: `make check` **GREEN**; `make
  verify` **RED on `RULE-GOV-002` only**, 114 s of 600 s, every other component green (the table
  in *The design folder* is read off this run).
- **Tests:** frontend **87 → 102 passed** (15 new: 13 in `frontend/tests/uiFlag.test.js`, 2 in
  `frontend/tests/pick.test.js`); backend
  unit **642 passed**, unchanged; container tier by hand against `/opt/homebrew/bin/task` 3.5.0
  (`cd backend && TZ=UTC PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider
  -m container tests/container`) **81 passed**, unchanged — a control, this change has no Python.
- **The new test can fail.** Five faults put into `uiFlag.js` one at a time, each reverted: default
  `neu` → 5 failed; stored choice before the query → 2 failed; key renamed to `ui-choice` → 2
  failed; noise stored instead of ignored → 1 failed; case-insensitive, trimmed parsing → 3
  failed. Two faults put into `pick.js`, each reverted: a new wrapper per call
  (`defineComponent({ ...UiPick })`) → 1 failed; the two sides swapped → 1 failed.
- **`./run surfaces`** before the update: `RULE-SURF-001` on S8 only. `./run surfaces --update`
  changed one file, `ops/surfaces/spa.json`, by one line: `"ui"` added to `local_storage_keys`.
  The ten routes are unchanged; the other four snapshots and the skill release record were
  rewritten byte-identical. After the update: 5 snapshots match.
- **Index:** `./run map frontend/src/shared/uiFlag.js` → `fe/shared`, `./run map
  frontend/src/router/pick.js` → `fe/app`. `./run impact frontend/src/shared/uiFlag.js`: governed
  by ADR 0042; direct dependents `frontend/src/router/index.js`, `frontend/src/router/pick.js`;
  transitive `frontend/src/main.js`; all four listed without import-derived test protection (F13),
  hence the test named above. `./run violations`: the two declared cycles, nothing new. After the
  review fixes: `./run map frontend/tests/pick.test.js` → `tests`, `./run map
  docs/design/2026-10-31-unified-ui/shared/data/tasks.js` → `docs`, `./run map .gitignore` →
  `ops`; the index has 587 files, 1003 nodes, 1436 edges, current.
- **Unit probe** (empty files made visible to `git ls-files` with `git add -N`, the index rebuilt,
  `./run map` asked, then every file and folder removed and the index rebuilt):
  `src/layout/Probe.vue`, `src/layout/ui/Probe.vue`, `src/layout/lens/probe.js` → `fe/layout`;
  `src/tasks/Probe.vue`, `src/tasks/stores/probe.js`, `src/tasks/views/Probe.vue` → `fe/tasks`;
  `src/projects/Probe.vue` → `fe/projects`; `src/identity/Probe.vue` → `fe/identity`;
  `src/assets/probe.css`, `src/assets/fonts/probe.woff2` → `fe/app`; `frontend/tokens/probe.json`,
  `src/shared/probe.js`, `src/composables/probe.js`, `src/api/probe.js` → `fe/shared`.
- **Budgets** (production builds into the scratchpad, never into the repository): entry JavaScript
  **249.45 kB, 81.73 kB gzip** against `main`'s 248.89 kB, 81.51 kB gzip built the same way
  (+0.22 kB gzip; budget ≤ 130 kB while both UIs ship); CSS **34.07 kB, 6.60 kB gzip**, the same
  file as `main`'s (same content hash; budget ≤ 20 kB). One chunk, as before; rebuilt after the
  review fixes with the same sizes (the `pick.js` change is a comment). Lens, font and frame
  budgets do not apply yet.
- **Screenshots**, in [`build/m0/`](../design/2026-10-31-unified-ui/build/m0/README.md), each one
  looked at, covering every route that renders a component: the old UI on `/next` and `/inbox`,
  desktop and phone, light and dark, WebKit desktop, axe desktop; and desktop light of `/login`
  (logged out), `/waiting`, `/someday`, `/projects`, `/projects/Website-Relaunch`, `/all`,
  `/settings` and a project opened by a click — `before/` (`main`), `after/` (this branch, no
  choice) and `neu/` (this branch, `ui=neu` stored). The seven routes added in review were shot on
  `main`'s frontend from `git archive main frontend` (Vite on :5174) and on this branch, against
  the same backend and user. Against `before/`: all eighteen `neu` shots are identical files (two
  kept); fifteen `after` shots are identical files, and the other three differ only in the pulsing
  "läuft" dot (two shots of one page on one branch differ there too) and in two anti-aliased
  pixels, at most 3 of 255 levels apart. No browser console error or warning in any shot.
- **The switch in the running SPA** (dev harness, user `demo`; the table is in the folder's
  README): `?ui=neu` and `?ui=alt` store their choice and override a stored one; `?ui=NEU` and a
  repeated parameter are ignored; a logged-out `/next?ui=neu` keeps the choice through the redirect
  to `/login`; `/?ui=neu` keeps it through the redirect to `/inbox`; every route renders
  `UiPick > <old view>`. `/projects` → `/projects/Website-Relaunch` inside the SPA keeps the same
  `ProjectsView` instance, which is what one shared wrapper is for.
- **Accessibility:** no new UI and no new interaction, so the keyboard walkthrough and accessible
  names have nothing new to cover. axe-core 4.10.2 on the old `/next` reports the same before and
  after: 1 serious violation (`color-contrast`, 5 nodes) and 2 moderate or minor, all the old UI's.
- **The design folder in a clean checkout** (`git archive` of the final tree into the scratchpad,
  so nothing ignored or untracked can help): 223 files outside `build/m0/`;
  `node --test 06-kombination/rules.test.mjs` **14 of 14 passed**; `shot.mjs
  06-kombination/index.html` renders the full 06 board with no errors. Before the `.gitignore` fix
  the same test failed with `ERR_MODULE_NOT_FOUND` for `shared/data/tasks.js`.
- **The screenshot tool's axe lookup:** `--axe` with no axe-core found exits 2 before a browser
  starts; `--axe=<path>` and `AXE_CORE_PATH=<path> … --axe` both run axe 4.10.2 and report the old
  `/next`'s one serious violation, as before. No tracked file names the session scratchpad.
- **`make check`**: GREEN, 15 s of 180 s (102 frontend tests). **`make verify`: RED on
  `RULE-GOV-002` only**, 111 s of 600 s on the committed tree; 25 components green, the container
  tier skipped (no Docker, `RISK-TEST-001`; run by hand above); gate conformance **56 fixture arms
  passed, 0 failed; 46 of 49 executable rules proven able to fail**, unchanged. `./run surfaces`:
  no drift (exit 0), 5 snapshots match; the review fixes add no key and no route.
