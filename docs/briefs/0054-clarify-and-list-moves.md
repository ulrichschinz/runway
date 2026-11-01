# Change Impact Brief 0054 — Clarify panel and list moves

| Field | Value |
|---|---|
| **Requested outcome** | Milestone **M8** of [the plan](../plan/unified-ui-web.md): behind `?ui=neu` the Inbox (list mode) gets 06's clarify panel — in the margin column on wide screens, docked beside the list at 761–1180 px, as a sheet from the bottom on the phone (a tap on a row). Two keys file the item: `a` then 1–5 (context) → Nächste; `w` then 1–4 (morgen / Freitag / nächste Woche / ohne Datum) → Warten auf; `v` → Irgendwann; `p` then 1–9 (project) or `n` (Neues Projekt, name checked by `projectNameError`), then the first action's context; `x` Erledigt; `Entf` Löschen; `Esc` one step back. A missing answer is always asked, never defaulted. Rows on every list move with `m` then `n` / `w` / `v`; the notice says where the todo went ("→ Nächste · @computer") and Rückgängig (button or `z`) sends the exact inverse. Leaving Warten auf clears the follow-up day (F1), so Warten auf → Nächste leaves the day's caption unchanged. Nothing changes for anyone without `?ui=neu`. |
| **Owning unit** | `fe/tasks` — new `tasks/components/ClarifyPanel.vue`, `tasks/useClarify.js`; `views/InboxPage.vue` (panel, lead, keys), `components/ListFrame.vue` (the page's own `panel` slot, scope order, `selectOnly`, `holdCursor`, exposes `cursor` / `select` / `leave` / `open`), `useListPage.js` (`leave`, `m` moves, a held cursor), `components/SectionList.vue` + `TaskLine.vue` (a filed row fades without a strike; the docked day column at 06's 156 px), `components/TaskDetail.vue` (opened asking for a context; move notice), `stores/gtd.js` (`contextChoices`). `fe/shared` — new `shared/clarify.js`; `shared/contexts.js` (`clarifyContexts`); `shared/commands.js` (scopes `inbox`, `step`, `stepProject`, chords `m n|w|v`, scope precedence); `shared/gtdRules.js` + `shared/dates.js` (Rückgängig restores the time of `scheduled`: `beforeOf().scheduledAt`, `minuteOf`); `shared/rowMeta.js` takes `noteDay` from `detailFields.js` (the panel lists notes too, without a fifth importer of `detailFields.js`); keys in `messages.de.js`. `ops/structure-baseline.toml` (two fan-in lines, below). `tests` — `clarify.test.js` (new), `commands.test.js`, `contexts.test.js`, `dates.test.js`, `gtdRules.test.js`, `rowMeta.test.js` / `detailFields.test.js` (noteDay moved). `docs` — this brief, `build/m8/`. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3–§5; [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (new files only in unit folders; `layout/` imports no feature; tests cover logic). |
| **Governed by** | [ADR 0042](../adr/0042-the-new-ui-coexists-behind-a-switch.md) (old side unchanged). [ADR 0007](../adr/0007-frontend-test-scope.md) (pure logic tested, no component mounting). |
| **Rule IDs introduced** | **None.** No change to `architecture.toml`. `ops/structure-baseline.toml`: `shared/dates.js` 6 → 7 (`shared/clarify.js` names the follow-up days) and `layout/ui/EyebrowLine.vue` 5 → 6 (the clarify panel's `// Klären · noch n`). Approved by Uli as owner; under `RISK-GOV-001` that approval is not independent. |
| **Entry points** | `startStep()`, `stepBack()`, `stepChoices()`, `pickChoice()`, `answerStep()`, `filedLabel()`, `moveLabel()` (`shared/clarify.js`); `clarifyContexts()` (`shared/contexts.js`); `minuteOf()` (`shared/dates.js`); `beforeOf().scheduledAt` (`shared/gtdRules.js`); commands `clarify.*`, `step.*`, `move.*`; `useClarify()`; store `contextChoices`. |
| **Affected public surfaces** | **None new.** No route, no storage key, no API change (the moves use `PUT /tasks/{uuid}` as M3 defined it). `./run surfaces` stays clean. |
| **Known dependents** | From `./run impact` before the code: `shared/gtdRules.js` → contexts, dayProgress, detailFields, outboxQueue, rowMeta, sections, TaskDetail, the store, and through them every new list page; `tasks/stores/gtd.js` → NewUiHost, CaptureLine, ListFrame, TaskDetail, useListPage, the six pages. In `gtdRules.js` only `beforeOf` / `inversePayload` change, and only additively: a `before` without `scheduledAt` (the shared vectors) gives exactly the M2 result, so `vectors.test.js` and Android's copy are unaffected. The store gains one computed, no changed action. The old UI imports none of these files. |
| **Uncertain / dynamic areas** | **F13** — the index credits no frontend test; protecting tests named below. `RISK-TEST-004` — the panel, focus and layouts are not unit-tested by construction; driven on the harness and recorded below. **Index artefact:** a JSDoc type `import('vue')…` is read as an import edge to a file `vue` (fan-in 4 → 5 tripped `RULE-ARCH-003`); `useClarify.js` writes its types without it. |
| **Analogous implementations** | `06-kombination/web.js` `clarifyPanel`, `filedPanel`, `clarify`, `clarifyKey`, `labelFor`, `setList` / `moveWithUndo`, the Inbox branch of the keydown handler; `common.js` `followOptions`; `store.js` `clarify` / `undoClarify` / `setList`; `web.css` `.question`, `.choice`, `.subchoices`, `.keyhints`, `.filed`, the 761–1180 px `.app.dock` and the phone sheet. |
| **Delivery Pattern** | **New Capability** (`fe/tasks`, `fe/shared` units declared in M0). |
| **Required tests** | New: `frontend/tests/clarify.test.js` — which step a key opens or closes, Esc's way back, the choices a step offers (only the first five contexts and nine projects keyed; follow-up days with their weekday), how a digit or a click answers each step, `n` only in the project step, that no answer ever yields a target `clarifyPayload` refuses, the notice labels for every target and every list move. Extended: `commands.test.js` (a step's answer keys win over the global ones while it is open; the first listed scope wins; chords `m n|w|v`; the sheet's new group), `contexts.test.js` (`clarifyContexts`), `dates.test.js` (`minuteOf`, `dayOf` of a server-local minute), `gtdRules.test.js` (Rückgängig keeps 08:00; a vector-style `before` still restores the day), `rowMeta.test.js` (`noteDay`, moved from `detailFields.test.js`). Existing that protect touched code: `vectors.test.js` (`clarifyPayload`, `listPayload`, `inversePayload` cases unchanged), `outboxQueue.test.js` (undo enqueues the inverse), `strings.test.js` (every `t('…')` literal exists). |
| **Intended scope** | The files above. **Not** in scope: the card stack and the Liste/Stapel switch (M10), the palette (M9), the margin's panels for an empty Inbox (06 `filedPanel`: "Geklärt" and Heute — M12 with the other margin panels). |
| **Base revision** | `5718243` (branch `ui/m7-task-detail`, M7, not on `main`) |

## Design

- **The panel files the cursor row.** In the Inbox the cursor stays on a row while there are rows
  (wide and docked layouts), so the highlighted row, the panel's item and the keys always agree
  (06 shows the first item focused). `j` / `k` move it and drop an open step. On the phone a tap on
  a row opens the panel as a sheet for that row.
- **One step at a time** (`useClarify`, the pure rules in `shared/clarify.js`): `a` → context, `w` →
  follow-up, `p` → project → its context (or `n` → name → context). Pressing the step's key again
  closes it; `Esc` goes back one level. The answer keys live in the command table under the scope
  `step`, which is active only while a question is open and is resolved before every other scope,
  so `1`–`9`, `n` and `Esc` answer the question and do nothing else. A target is filed only with its
  answer: the store's `clarify` is never called with a missing context (`NeedsAnswer` would throw).
- **Contexts offered** are the present ones in D1 order (`gtd.contexts`); a user with no context at all
  is offered the shared preset (`@home @computer @work @business`), so clarifying to Nächste is never
  impossible. Projects offered are the active ones of `/gtd/projects/overview`.
- **New project:** the name is checked against `projectNameError` with every known name (overview and
  open todos); the project comes into being with the filing PUT (`project: Name`), as the API documents
  ("it also exists implicitly as soon as a task names it"). No `POST /projects` is sent, so Rückgängig
  leaves nothing behind.
- **Leaving rows.** `useListPage.leave(uuid, how, write, text)` is the one path for a row that leaves
  by an action — done, delete, filed, moved: the write first (a `NeedsAnswer` throws before anything
  else happens), then the leave mark and the notice with Rückgängig; once the page has rendered, the
  cursor goes to the next row still shown (on Alle a moved row stays, and so does the cursor). A
  filed row fades without the ink strike. On the phone the sheet closes with each filing, so the
  notice's Rückgängig in the dock is not covered by it.
- **Rückgängig is exact to the minute.** M2's inverse restored `scheduled` as a bare day, which
  Taskwarrior stores as midnight: a follow-up at 08:00 came back as 00:00 (found by the GET diff
  below). `beforeOf` now also records `scheduledAt`, the server-local minute (`minuteOf`, `null` for
  midnight and bare days), and `inversePayload` sends it (`"scheduled": "2026-10-31T08:00"`, the API's
  documented `YYYY-MM-DDTHH:MM`). Seconds are dropped (the API takes none). `dayOf` reads that form as
  its day, so an optimistic patch never shifts with the browser's zone.
- **List moves from rows:** `m` then `n` / `w` / `v` (`move.*`, scope `rows`). A move that needs an
  answer opens the todo's detail asking for it ("Nächste braucht einen Kontext", or the legacy-tag
  note); the context chosen there goes into the move's own PUT (`listPayload(t, 'next', ctx)`,
  `gtd.setList(uuid, list, ctx)`), so the one Rückgängig of the notice takes back both — never a
  context left behind. In the Inbox `m n|w|v` open the matching clarify step instead.
- **The panel's keys live only while the panel is shown.** While a todo's detail takes the panel's
  place (`Enter`, `o`, a click), `ListFrame` exposes `detailOpen` and the Inbox drops its scopes
  `inbox` / `step` and ignores `m n|w|v`; an open question is closed when the panel hides, so nothing
  is filed by a question nobody sees.
- **Notices** name the destination: `→ Nächste · @computer`, `→ Warten auf · nachhaken Fr 06.11.`,
  `→ Projekt · Garten · @zuhause`, `→ Irgendwann`. The detail's list toggles use the same label.

## Where this departs from the plan or the prototype

- **No `POST /projects` for a new project** (06 `submitProjectName` creates it at once): an exact undo
  must leave no empty project behind; the project exists through its todo.
- **No preset when contexts exist** (06 offers its fixed five): D1. The preset only when none exists.
- **The filed stamp** ("→ Nächste · @computer" in the leaving row, 06 `.stamp`) is not drawn: the row
  is out of the list within 300 ms and the notice says the same.
- **Projects beyond nine / contexts beyond five** are offered as buttons without a digit key (06 cut
  them off).
- **Phone:** the panel is a sheet opened by a tap (06 behaves the same) and closes with each filing
  (06 keeps it open on the next item, over its own notice); the card stack, D6's touch Klären mode, is M10.
- **No "Geklärt" log in the margin** for an empty Inbox (06 `filedPanel`): it comes with M12's margin
  panels; the plan does not list it for M8.
- **Rückgängig restores the time of `scheduled`** (above): an extension of M2's `inversePayload`. The
  vectors are unchanged (no version bump); Android's inverse still restores the day only — named in
  the open points for Android.

## Open points

- `RULE-GOV-002` red on `main` and here (decay review overdue) — outside this change.
- **For Android (plan §11):** the web's undo restores a follow-up's time of day (`scheduledAt`); if
  Android wants the same, a vector case with `scheduledAt` and a `version` bump are the way — not done
  here, so Android's copy stays valid as it is.
- **Pending for Uli** (none blocks the milestone): approval of this commit and the stacked branch;
  clarifying on a Pixel 9 / an iPhone (sheet with the on-screen keyboard for "Neues Projekt"); the
  plan's §10 live-data steps (parity check, production opt-in, `task export` backup).

## Pre-checks

- **Before the code:** `./run impact` on `shared/gtdRules.js` and `tasks/stores/gtd.js` (dependents
  above); `./run map` puts `shared/clarify.js` in `fe/shared`, `useClarify.js` and `ClarifyPanel.vue`
  in `fe/tasks`.
- **Tests:** vitest 516 → 539 (29 files; new `clarify.test.js` 14 cases; `commands.test.js` +2,
  `contexts.test.js` +1, `dates.test.js` +2, `gtdRules.test.js` +4 — the last two after review: the
  context chosen in the detail rides in the move's PUT and its inverse removes it; `noteDay` moved,
  not added). `make check` GREEN.
- **Gates:** `./run surfaces` clean (no new route, key or env var); `./run violations` — only the two
  declared cycles (`CYCLE-001`, `CYCLE-002`), nothing new; `RULE-ARCH-003` green with the two baseline
  lines above; `make verify` (355 s, after review) RED only for the pre-existing `RULE-GOV-002` (decay review overdue,
  out of scope); every other rule green, 56 fixture arms pass.
- **Acceptance on the harness (own user `m8-agent`, Playwright with real keys, `GET /tasks/{uuid}`
  before the move, after it, and after Rückgängig; tags sorted / project / scheduled):**

| Move | Todo | Before | After the move | After Rückgängig | Result | Notice |
|---|---|---|---|---|---|---|
| Inbox → Nächste (a 1) | `3ef6c497` | – / – / – | @computer next / – / – | – / – / – | identisch | → Nächste · @computer |
| Inbox → Warten auf (w 1) | `3ef6c497` | – / – / – | waiting / – / 20261101T230000Z | – / – / – | identisch | → Warten auf · nachhaken Mo 02.11. |
| Inbox → Warten auf (w 2) | `3ef6c497` | – / – / – | waiting / – / 20261105T230000Z | – / – / – | identisch | → Warten auf · nachhaken Fr 06.11. |
| Inbox → Warten auf (w 3) | `3ef6c497` | – / – / – | waiting / – / 20261108T230000Z | – / – / – | identisch | → Warten auf · nachhaken Mo 09.11. |
| Inbox → Warten auf (w 4) | `3ef6c497` | – / – / – | waiting / – / – | – / – / – | identisch | → Warten auf |
| Inbox → Irgendwann (v) | `3ef6c497` | – / – / – | someday / – / – | – / – / – | identisch | → Irgendwann |
| Inbox → Projekt (p 1, 2) | `3ef6c497` | – / – / – | @anrufe next / Website-Relaunch / – | – / – / – | identisch | → Projekt · Website-Relaunch · @anrufe |
| Inbox → neues Projekt (p n "Keller-Ausbau" ⏎ 1) | `3ef6c497` | – / – / – | @computer next / Keller-Ausbau / – | – / – / – | identisch | → Projekt · Keller-Ausbau · @computer |
| Warten auf → Nächste (m n) | `b9f1de16` | @anrufe waiting / Buero-Umzug / 20261031T070000Z | @anrufe next / Buero-Umzug / – | @anrufe waiting / Buero-Umzug / 20261031T070000Z | identisch | → Nächste · @anrufe |
| Nächste → Warten auf (m w) | `257fe604` | @computer next / Steuer-2025 / – | @computer waiting / Steuer-2025 / – | @computer next / Steuer-2025 / – | identisch | → Warten auf |
| Nächste → Irgendwann (m v) | `257fe604` | @computer next / Steuer-2025 / – | @computer someday / Steuer-2025 / – | @computer next / Steuer-2025 / – | identisch | → Irgendwann |
| Warten auf ohne Kontext → Nächste (m n, Kontext im Detail; own user `m8-fix`) | `a3af71a6` | waiting / Buero-Umzug / 20261031T070000Z | @computer next / Buero-Umzug / – | waiting / Buero-Umzug / 20261031T070000Z | identisch | → Nächste · @computer |

  Bodies sent: `a 1` → `{"tags_add":["next","@computer"]}`, undo `{"tags_remove":["next","@computer"]}`;
  `w 1` → `{"tags_add":["waiting"],"scheduled":"2026-11-02"}`, undo `{"tags_remove":["waiting"],"scheduled":""}`;
  `w 4` → `{"tags_add":["waiting"]}`; `p n` → `{"project":"Keller-Ausbau","tags_add":["next","@computer"]}`, undo
  `{"tags_remove":["next","@computer"],"project":""}` (no `POST /projects`; the overview lists no
  Keller-Ausbau afterwards); Warten auf → Nächste → `{"tags_add":["next"],"tags_remove":["waiting"],"scheduled":""}`,
  undo `{"tags_remove":["next"],"tags_add":["waiting"],"scheduled":"2026-10-31T08:00"}`. Before the
  `scheduledAt` fix that last row came back as `20261030T230000Z` (midnight): same day, not the same
  stamp — the reason for the fix. (The follow-up-yesterday todo got `@anrufe` by API first, so Nächste
  had a context.) The last row is after review: one PUT
  `{"tags_add":["next","@computer"],"tags_remove":["waiting"],"scheduled":""}`, undo
  `{"tags_remove":["next","@computer"],"tags_add":["waiting"],"scheduled":"2026-10-31T08:00"}`; before
  the fix the context went in a PUT of its own and stayed after Rückgängig.
- **Never guess:** `a`, `w`, `p 1` and `p n` alone send **0** writes and show their question;
  `m n` on a Warten-auf todo without a context sends 0 writes and opens its detail with "Nächste
  braucht einen Kontext. Wähl einen, dann wandert das Todo."
- **Lens caption:** Nächste's caption "3 von 7 heute" before and right after Warten auf → Nächste of
  the follow-up-yesterday todo (its follow-up day is cleared, so it does not count as planned).
- **Keyboard:** with a todo's detail open in the Inbox (`Enter`), `a 1 v m n m v p 1` send **0** writes;
  after `Esc` the panel is back with no question open and `a` asks again (after review). `p` → projects, `1` → its context question, `Esc` → projects, `Esc` → first question;
  `a` `a` opens and closes; `p n` focuses the name field, `a/b` ⏎ says "Ohne diese Zeichen: …", `Esc` in
  the field → projects; with Warten auf's question open `n` still focuses the capture line; `j` then `v`
  files the second row and leaves cursor, focus and panel on the next row; Abhaken in a detail moves
  cursor and focus to the next row. Panel buttons carry names without their key glyphs (`aria-hidden`).
  axe-core 4.10.2: 0 serious/critical (desktop with a question open, phone with the sheet).
- **Phone:** a tap opens the sheet (`role=dialog`, "Klären"); filing closes it and the notice with
  Rückgängig in the dock undoes it (checked).
- **Shots:** `build/m8/` (README there): Inbox desktop and phone light/dark, each question, the refused
  new name, the notice after filing (desktop, phone), the sheet (phone light/dark), one narrow (docked).
  Chromium only (speed mode); WebKit and narrow dark to M15. The two review fixes change no rendered view, so no shot was retaken.
- **Budgets:** not touched beyond the list chunk; not measured (speed mode).
