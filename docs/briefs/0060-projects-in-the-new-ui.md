# Change Impact Brief 0060 — Projects in the new UI

| Field | Value |
|---|---|
| **Requested outcome** | Milestone **M13** of [the plan](../plan/unified-ui-web.md) (the plan calls it 0059; the numbers moved by one because 0056 went to a vanished user's 401): behind `?ui=neu`, **Projekte** and a **project's page** replace the placeholder. Projekte (`/projects`, 06 `renderProjects`) shows the overview from `/gtd/projects/overview` in three sections — Aktiv (stalled projects first, with the yellow ring and "steckt fest"), Ruht, Abgeschlossen — each row with its state, its counts ("2 nächste · 1 wartet") and whether it has a plan; "+ Projekt" (`n`) creates a project with the API's own name rules (`projectNameError`) and opens it. A project's page (`/projects/:name`, 06 `renderHead('project')`) reads the name from the route, so the deep link `/projects/Website-Relaunch` opens that project (the old UI ignores it); it lists the project's todos from the snapshot (Nächste Aktionen, Warten auf, Irgendwann, Ohne Liste) with every row action of the lists; it shows the plan's vision as the outcome line, the status pills (Ruhen lassen · Abschließen · Wieder aufnehmen, `PUT /projects/{name}/status`, each with Rückgängig), and, for a stalled project, 06's callout with "Nächste Aktion festlegen" (`n`): an inline field that asks for the context and files the new todo into the project as a next action (`POST /tasks` with `project` and `tags: ['next', '@ctx']`). The plan (06 `planPanel`) becomes **one document in German** with the old modal's five steps — Warum (Zweck, Werte), Vision, Ideen, Ordnen, Aktionen — editable in place, saved explicitly (`PUT /projects/plans/{name}`), and `Esc` asks before it discards; it sits in the margin column on wide screens and under the todos elsewhere. Nothing changes for anyone without `?ui=neu`. |
| **Owning unit** | `fe/projects` — new `projects/ProjectsPage.vue`, `ProjectPage.vue`, `PlanDocument.vue`, `ProjectRow.vue`, `ProjectStatus.vue`, `NextActionAdd.vue`, `usePlan.js`, `texts.js`. `fe/shared` — new `shared/projectOverview.js` (order, sections, the status pills, a project's sections), new `shared/projectStalled.js` (the snapshot's stalled reading and counts, which the store needs on every page), new `shared/projectPlan.js` (the plan's shape, dirty check, the list edits), new `shared/messages.projects.de.js` (the projects pages' own texts); `shared/i18n.js` (`addMessages`: a lazy page's table); `shared/outboxQueue.js` (a capture may carry a project and tags: then it is `POST /tasks`); `shared/commands.js` (the `?` sheet names `n` "Neu: Todo · in Projekte ein Projekt · im Projekt die nächste Aktion", an existing key). `fe/tasks` — `tasks/stores/gtd.js` (`projects` carries the snapshot's reading; `addNextAction`), `tasks/components/ListFrame.vue` (slots `top` and `after`; the capture line's `n` hint only where `n` is the capture line's), `tasks/components/CaptureLine.vue` (prop `keyHint`). `fe/app` — `router/index.js` (the two pages, the placeholder and the new login page lazily), new `router/lazyPages.js`, `router/NewUiHost.vue` (prefetch, the tab's title). `tests` — new `projectOverview.test.js`, `projectPlan.test.js`, `usePlan.test.js`, `lazyPages.test.js`; `outboxQueue.test.js`, `strings.test.js`. `docs` — this brief, `build/m13/`. `ops` — `ops/structure-baseline.toml` (six raises, Pre-checks). |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3–§5; [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (new files only in unit folders; `fe/projects` → `fe/tasks` is the recorded exception, for the gtd store and the list frame; `layout/` imports no feature; route guards only through `onBeforeRouteLeave` / `onBeforeRouteUpdate`; tests cover logic). |
| **Governed by** | [ADR 0042](../adr/0042-the-new-ui-coexists-behind-a-switch.md) (old side unchanged). [ADR 0007](../adr/0007-frontend-test-scope.md) (pure logic tested, no component mounting). [ADR 0039](../adr/0039-project-status-and-stalled.md) (project statuses, stalled) — read, not changed. |
| **Rule IDs introduced** | **None.** `ops/structure-baseline.toml` raises six recorded fan-in values (`RULE-ARCH-003`), each approved by the owner (RISK-GOV-001: not an independent approval) and justified in a dated comment: `tasks/components/ListFrame.vue` 5 → 6, `layout/ui/EyebrowLine.vue` 7 → 9, `tasks/notice.js` 5 → 6, and new entries `layout/ui/PillButton.vue` 7, `composables/useFrame.js` 5, `composables/useMedia.js` 5 (each was at the default cap of 4). |
| **Entry points** | `ProjectsPage.vue`, `ProjectPage.vue` (route components behind `pick()`), `PlanDocument.vue` (props `plan`, the `usePlan` state), `shared/projectOverview.js` (`overviewSections`, `overviewCounts`, `projectState`, `statusChoices`, `projectSections`), `shared/projectStalled.js` (`projectStalled`, `withSnapshot`), `shared/projectPlan.js` (`planFrom`, `planBody`, `planDirty`, `planEmpty`, `moveItem`, `withItem`, `withoutItem`, `ideasToOrganized`, `outcomeOf`), `shared/i18n.js` `addMessages`, the store's `addNextAction(project, text, ctx)`. |
| **Affected public surfaces** | **None.** The routes `/projects` and `/projects/:name` exist (`ops/surfaces/spa.json`); no storage key; no new API call — `POST /tasks`, `PUT /projects/{name}/status`, `GET`/`PUT /projects/plans/{name}` and `POST /projects` are the API's own, used as documented. |
| **Known dependents** | From `./run impact` before the code: `views/ProjectsView.vue` → `router/index.js` → `main.js`; `components/ProjectPlanModal.vue` → `ProjectsView.vue` → the same. Neither is changed (the old side stays as it is). `router/index.js` → `main.js`. `tasks/stores/gtd.js` → `NewUiHost.vue`, `CaptureLine`, `CardStack`, `ListFrame`, `TaskDetail`, the four margin panels, `useCardStack`, `useClarify`, `useListPage`, `useTaskSearch`, every list page, `StoreDebugPage` (→ `App.vue`, `main.js`, `router/index.js`): the store gains one action and its `projects` carry two more fields (`stalled` now the snapshot's, `counts`), which the rail's ring and the margin's Projekte read unchanged. `shared/outboxQueue.js` → `useOutbox.js`, `gtd.js`: a capture without a project is sent exactly as before. Added during the work: see Pre-checks. |
| **Uncertain / dynamic areas** | **`BLIND-FE-002` (F14)** — a departure from plan §6.2 (below): both pages, the placeholder (`layout/ComingPage.vue`, Einstellungen and Rückblick until M14) and the new login page (`identity/LoginPage.vue`) are reached from `router/index.js` only through `import()` (`router/lazyPages.js`), for the entry budget (129.85 of 130 kB gzip after M12, brief 0059's open point), so the index records the router's edges to them as UNKNOWN and `./run impact` on them names no dependent. Their one user is the router; `NewUiHost.vue` prefetches the first three in idle time, so they open offline and after a redeploy. The login page is not prefetched: it is reached by a full load after a session ends, and signing in needs the network anyway. `lazyPages.test.js` holds the blind edge, as `threeIsolation.test.js` holds the lens chunk: `router/lazyPages.js` is the only file that loads the four, with `import()`, and none is imported statically anywhere. **F13** — the index credits no frontend test; protecting tests are named below. **`RISK-TEST-004`** — the pages are presentation over tested rules; they are driven on the harness, not mounted in tests. **Plan writes are not in the outbox** (§6.4 lists none): "Speichern" is one `PUT`, and a failure keeps the draft and says so. |
| **Analogous implementations** | `06-kombination/web.js` `renderProjects`, `renderHead('project')`, `sectionsFor('project')`, `planPanel`, `setProjectStatus`, `submitProjectName`, `submitInlineAdd`, the `data-plan-up` / `data-plan-todo` handlers; `web.css` `.proj`, `.proj-add`, `.callout`, `.pstatus`, `.inline-add`, `.plan`; `combo.css` `.addctx`; `store.js` `projectOverview` (the order). The old `components/ProjectPlanModal.vue` (the five steps, their fields and texts, import from Ideen, reorder, "→ Task"). In this repository `tasks/views/AllPage.vue` (a page over `ListFrame`), `layout/ComingPage.vue` (a page over `AppFrame` with the margin), `tasks/useClarify.js` (the new-project name check), M12's lazy `MarginPanels`. |
| **Delivery Pattern** | **New Capability** (units declared in M0). |
| **Required tests** | New: `projectOverview.test.js` — the order (stalled first, then by name in German collation; Ruht and Abgeschlossen apart), the counts in the head, the stalled reading against the snapshot (a next action or a waiting todo in the snapshot ends it; a tickler todo keeps the server's "moving"; never for `on_hold`/`done` or a name only the status table knows; a project created a moment ago is stalled), the status choices per status, a project's sections (by list, the dual-tagged once, exact names only); `projectPlan.test.js` — the API's plan to the draft and back (missing fields, items without ids), the dirty check, moving, adding (blank refused), removing, taking the ideas over; `usePlan.test.js` — the plan's lifetime across a change of project (a fake API client whose answers the test releases): a save says "Gespeichert" and reads the overview again; another project's plan does not say "Gespeichert"; a save that fails after the page moved on shows no error on the next plan, one that succeeds still reads the overview again and leaves the next plan alone; a failed save of the plan on screen keeps the draft and says why; `lazyPages.test.js` — the four lazy pages (above). Extended: `outboxQueue.test.js` — a capture with a project and tags is `POST /tasks`, its row carries them, its undo is a `DELETE`, its verify the same duplicate check; `strings.test.js` — the projects table is text, shares no key with the main table and holds no heading, and every `t()` key is found in one of the two. Existing that protect touched code: `outboxQueue.test.js`, `strings.test.js` (every new key is text and exists), `commands.test.js`, `gtdRules.test.js` (`projectNameError`), `vectors.test.js`, `pick.test.js` (one wrapper for every route). |
| **Intended scope** | The files above. **Not** in scope: the old UI; Rückblick, Einstellungen (M14); a stack step "Neues Projekt" beyond M10's; subprojects shown under their parent (the overview and the page read names exactly, as `project_rollup` counts them); renaming or deleting a project (the API has neither). |
| **Base revision** | `0b1a6a2` (`main`, M12 merged) |

## Design

- **Two pages, one unit.** `ProjectsPage` stands on `AppFrame` (like `ComingPage`: head, body, the margin's panels,
  the notice); `ProjectPage` on `ListFrame` (the list pages' rows, keys, detail, capture, search, notice), with the
  project's head in its slots. Both live in `fe/projects` and use `fe/tasks`' store and list frame through the
  recorded edge; no other feature is imported.
- **Stalled, once.** The server's `stalled` is a reading at the snapshot's time; a next action added here, or the
  last one ticked off, would leave it wrong for up to 30 s, and the page, the rail's ring and the margin would
  disagree. `projectStalled(p, open)` reads it from the snapshot as the server does (`_is_stalled`): active, a project
  that exists, nothing in the tickler (`hidden`, the server's count), and no open todo of the project tagged `next`
  or `waiting`. The overview, the page, the margin's Projekte and the rail's ring all use it.
- **A next action needs a context** (06 open question 6, assumed as prototyped): the inline field offers the
  clarify panel's contexts (`contextChoices`), `Alt 1`–`5` while typing, and refuses `⏎` without one. It is a capture
  with a project: one `POST /tasks` with `project` and `tags: ['next', '@ctx']`, through the outbox like any capture —
  sent at once, the row there before the answer, Rückgängig a `DELETE`, a failed one "Nicht gesendet · Erneut senden"
  after the same duplicate check. Plan step 05's "→ Nächste" fills the same field with the step's text.
- **`n` is "neu, hier"** (03 build plan): on Projekte a project, on a project's page its next action. The palette
  names it so ("Neues Projekt", "Nächste Aktion festlegen"); the `?` sheet's line becomes the table's existing
  `keys.new` ("Neu: Todo · in Projekte ein Projekt · im Projekt die nächste Aktion").
- **The plan is a draft the page holds** (`usePlan`): the document can unmount — a todo's detail takes the margin's
  place — without losing a word. "Speichern" (or `⌘S` / `Ctrl+S` inside it) sends the whole plan; `Esc` inside it
  with changes asks "Änderungen verwerfen?" (Verwerfen · Weiter bearbeiten); leaving the project with changes asks
  the browser's question, and so does closing the tab.
- **The entry budget.** Both pages are chunks of their own, fetched in idle time once the new UI is up. That alone
  left the entry at 131.56 kB gzip: the pages' texts (0.8 kB) and the store's stalled reading, the outbox branch and
  the lazy wrappers (0.9 kB). The texts only the projects pages show moved into a table of their own
  (`messages.projects.de.js`) that the pages add to `t()` as they load (`addMessages`); the store's reading is in a
  module of its own (`projectStalled.js`) so the pages' rules stay in their chunk; and the placeholder and the new
  login page became chunks too (neither is on a signed-in user's way through the lists). Entry: **129.76 kB**.

## Where this departs from the plan or the prototype

- **Status pills on the project's page**, as in 06 (`renderHead('project')`); the overview shows each project's
  state and sorts by it. The plan's M13 line lists the pills under `ProjectsPage`; one place to change a status, next
  to what it is about, is 06's and the old UI's reading of it.
- **The outcome line is the plan's vision.** 06's store has an `outcome` per project; the API has none, and the
  overview has no plan text. The overview says "Plan" or "noch kein Plan" (`has_plan`) instead of 06's outcome line;
  the project's page shows the vision.
- **The plan is editable** (06 only showed it): the old modal's fields, lists, import, reorder and "→ Task" are all
  there, in one document; "→ Task" is "→ Nächste" and creates a next action in the project, not a tagless task.
- **On ≤ 1180 px the plan sits under the todos**, not in a sheet: there is no margin column there, and a sheet that
  is always open would cover the list.
- **Projekte has no search field and no capture line** (06 shows both on every view): it stands on `AppFrame` like
  the placeholder pages; `n` there is a new project and `/` opens the palette, which finds todos too. An active
  project's status line also offers "Nächste Aktion festlegen `n`", where 06 only has the key; a resting or
  finished project offers no next action at all (no pill, `n` does nothing, the palette has no entry), and on a
  project's page the capture line shows no `n`, because `n` there is the next action.
- **"← Projekte" sits above the eyebrow**, not in the top line left of the search field as in 06 (`renderTop`'s
  `.mclose`): the top line belongs to `AppFrame` and has no slot for a page, and giving it one is layout work for
  one link. The head moves down about 38 px against `06-project-desktop-light.png`.
- **Plan §6.2 says `router/index.js` imports every new page statically** (no dynamic import, to keep the index
  edges). M13 does not: `ProjectsPage`, `ProjectPage` and — beyond the plan's M13 files — `layout/ComingPage.vue` and
  `identity/LoginPage.vue` are loaded with `import()` from `router/lazyPages.js`, because the entry would otherwise
  be 131.56 kB gzip against the 130 kB budget (Design, "The entry budget"); keeping the placeholder and the login
  page static and only the two project pages lazy measured 130.82 kB gzip (review, 2026-11-11), over it too. What the index loses —
  `./run impact` on the four names no dependent — `lazyPages.test.js` pins instead, as F14 / M11 did for the lens
  chunk. `/login`, `/settings` and `/review` change only in that their new side is now a lazy chunk.

## Open points

- The projects overview and stalled rule are web-only display rules; they are not in the vectors Android copies
  (Android's Mehr → Projekte is read-only and shows the server's `stalled`). If Android wants the same reading, it
  goes into `gtd-rules.v1.json`.
- `make verify` container tier: skipped locally, Docker is not running (`RISK-TEST-001`); CI runs it.

## Pre-checks

- **Before the code:** `make check` GREEN on `ui/m13-projects` at `0b1a6a2`. `./run map` on
  `frontend/src/views/ProjectsView.vue` and `frontend/src/components/ProjectPlanModal.vue` (unit `fe/projects`);
  `./run map frontend/src/projects/ProjectsPage.vue` before it existed (no match; the unit's glob
  `frontend/src/projects/**` covers it); `./run impact` on both old files, `router/index.js` and `tasks/stores/gtd.js`
  (dependents above); `./run brief --paths` for the four.

- **After it**, `./run map` puts `projects/*.vue`, `projects/usePlan.js` and `projects/texts.js` in `fe/projects`,
  `shared/projectOverview.js`, `projectStalled.js`, `projectPlan.js` and `messages.projects.de.js` in `fe/shared`,
  `router/lazyPages.js` in `fe/app`, as intended. `./run impact`: `shared/projectStalled.js` → `tasks/stores/gtd.js`
  (→ every page through the store); `shared/outboxQueue.js` → `useOutbox.js`, `tasks/notice.js`, `gtd.js`;
  `shared/i18n.js` → every new component (an added export); `tasks/components/ListFrame.vue` → the five list pages
  and now `projects/ProjectPage.vue`; `projects/texts.js` → the two pages; `router/lazyPages.js` → `router/index.js`,
  `NewUiHost.vue`. The pages themselves show no dependents (`BLIND-FE-002`, above).
- **Fan-in (`RULE-ARCH-003`):** red for exactly the six values named above; each raised with a dated comment. Three
  others were avoided rather than raised: `projects/texts.js` is imported by the two pages only, `PlanDocument.vue`
  names `⌘S` and `Ctrl S` instead of reading the platform from `useCommands.js`, and `ProjectsPage.vue` keeps its
  cursor without `shared/commands.js`.
- **Tests:** vitest 646 → 691 (39 files; `projectOverview.test.js` +14, `projectPlan.test.js` +10, `outboxQueue.test.js`
  +4, `strings.test.js` +1; after the review `usePlan.test.js` +5, `lazyPages.test.js` +11). `make check` GREEN (after `make fix` rebuilt the index),
  `make verify` GREEN (container tier skipped, Docker not running, `RISK-TEST-001`). `./run surfaces` clean: no route,
  storage key or API change.
- **The old UI** is untouched: `git diff --stat 0b1a6a2` over `components/`, `views/`, `stores/`, `App.vue` is empty;
  `router/index.js` changes only the new side of five routes — `/projects` and `/projects/:name` get their pages,
  `/login`, `/settings` and `/review` change only by their new page becoming lazy (above); `old-projects-unchanged.png` shows the old "Projects".
- **Budgets** (`vite build`, after the review's fixes): entry JS 129.80 kB gzip (≤ 130), CSS 13.43 kB gzip (≤ 20);
  Projekte 2.16 + 0.78 kB, a project's page 6.26 + 1.58 kB, login page 1.16 + 0.46 kB, placeholder 0.67 + 0.18 kB gzip.
- **Acceptance on the harness** (2026-11-11, an own backend on :8047 and Vite on :5219 over a scratch data root, both
  stopped afterwards; the 06 demo set with a resting and a finished project and a full plan; every request and number in [`build/m13/README.md`](../design/2026-10-31-unified-ui/build/m13/README.md)):
  every plan step of the old modal reachable (Zweck, Werte, Vision, Ideen add/remove, Ordnen add/remove/move/import,
  "→ Task" as "→ Nächste"); the deep link `/projects/Website-Relaunch` opens the project, signed out via
  `/login?next=` and back; create with the API's name rules; a next action refused without a context, then one
  `POST /tasks` with `project` and `["next", "@ctx"]`; status with Rückgängig; the stalled callout gone the moment a
  next action exists; `Esc` asks before discarding; `⌘S` saves; leaving with changes asks; a todo's detail in the
  margin and the plan back unchanged after it; no console errors.
- **Accessibility:** axe-core 4.10.2: 0 serious or critical issues in all twenty-three shot states (light, dark, reduced
  motion, narrow, phone, WebKit, 200 % zoom); Tab goes rail → top line → "← Projekte" → the status pills → the rows' rings → the capture field → the plan's
  fields and buttons in the margin, and round again, nothing traps; 200 % zoom at 1440 px: no horizontal scroll.
- **Shots:** `build/m13/` — `projects-desktop-{light,dark}`, `projects-narrow-{light,dark}`, `projects-reduced-desktop-light`, `projects-new-desktop-light`, `project-desktop-{light,dark}`,
  `project-stalled-desktop-light`, `project-add-desktop-light`, `project-ask-desktop-light`, `project-reduced-desktop-light`,
  `project-narrow-light`, `project-narrow-plan-dark`, `projects-phone-{light,dark}`, `project-phone-{light,dark}`,
  `project-phone-plan-light`, WebKit desktop and phone, `project-zoom200-light`, `old-projects-unchanged`; 06 has
  no shot of these pages, so its `index.html` was rendered for the comparison (`06-projects-desktop-light`,
  `06-project-desktop-light`, `06-project-noplan-desktop-light`, kept beside them).
- **Fixed after looking at the shots** (details in the README): the status pills are 06's quiet pills, not bordered
  ones (`ProjectStatus.vue`); the next-action field and the plan's text fields no longer draw the global focus box
  inside a row that marks its focus with the yellow rule, as the capture line (`NextActionAdd.vue`, `PlanDocument.vue`);
  "Nicht gespeichert" no longer sits 6 px in when it wraps. All twenty states re-shot; `make check` GREEN after
  `make fix` rebuilt the index, vitest 675 green.
- **Review (2026-11-11):** thirteen findings, each checked on the harness (a scratch Playwright run on a freshly
  seeded user, `m13-r1`) or in the code — none rejected; ten fixed, three answered here. Fixed: Rückgängig on a next
  action made from a plan step makes the step "→ Nächste" again (`ProjectPage.vue`); a save that answers after the
  page moved to another project neither shows its error on that project's plan nor skips the overview's refresh,
  and a plan loaded fresh never says "Gespeichert" (`usePlan.js`, `usePlan.test.js`); the plan document is keyed
  by the project, so a half-typed idea or step or an open "verwerfen?" question does not travel to the next one;
  the next-action and project-name fields show their focus (the rule turns yellow only while the text field has
  it, `NextActionAdd.vue`, `ProjectsPage.vue`); closing a field or answering the plan's question puts the focus
  back where the person was instead of on `<body>` (the opener, else "Nächste Aktion festlegen" / "+ Projekt" /
  the field typed in / the document); the capture line shows no `n` on a project's page (`CaptureLine.vue`
  `keyHint`, from `ListFrame.vue`); a resting or finished project offers no next action (pill, `n`, palette); the
  kit's missing shots `projects-reduced-desktop-light` and `projects-narrow-{light,dark}`. Answered: the lazy
  pages are a departure from plan §6.2, now listed above with the widening to `ComingPage` and `LoginPage`, measured
  (static: 130.82 kB entry) and pinned by `lazyPages.test.js`; "three routes" corrected to five; "← Projekte" above
  the eyebrow listed as a deviation from 06. `./run impact frontend/src/tasks/components/CaptureLine.vue` →
  `ListFrame.vue` and through it the five list pages and `ProjectPage.vue` (the prop defaults to the old hint).
  All twenty-three states shot again (axe 0 serious or critical, 0 px horizontal scroll); `make fix` rebuilt the
  index, `make check` GREEN, `make verify` GREEN (container tier skipped, Docker not running, `RISK-TEST-001`),
  vitest 691 green.

