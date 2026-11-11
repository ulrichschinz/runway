# Change Impact Brief 0061 — Rückblick, Einstellungen, Alle in the new UI

| Field | Value |
|---|---|
| **Requested outcome** | Milestone **M14** of [the plan](../plan/unified-ui-web.md) (the plan calls it 0060; the numbers moved by one because 0056 went to a vanished user's 401): behind `?ui=neu`, **Rückblick** and **Einstellungen** replace the placeholder, and **Alle** gets its polish. Rückblick (`/review`, 06 `renderHead('review')`, `reviewSteps`, `renderReview`) heads itself with the last weekly review ("// Rückblick · zuletzt Di 03.11. · vor 8 Tagen") and walks 06's six steps — Inbox leeren, Nächste Aktionen durchsehen, Warten auf: nachhaken, Projekte: jedes hat eine nächste Aktion, Irgendwann durchsehen, Kalender — each with its live count from the snapshot as a way into the list ("2 offen →"), ticked by itself where runway can check it (an empty Inbox, no stuck project) and by hand otherwise; under the steps what was done in the last seven days (the plan's "erledigt letzte 7 Tage"); "Rückblick abschließen" sends `POST /gtd/review {kind: weekly}` through the outbox and says "Rückblick gespeichert". Einstellungen (`/settings`, 06 `renderSettings`) is German and in the brand: Konto (name and e-mail, `PUT /auth/me`), Passwort (`PUT /auth/password`), API-Key (hidden, Anzeigen, Kopieren, Neu erzeugen with a question first), "Claude verbinden" with the four pinned steps of `claudeConnect.js` unchanged, MCP-Server with the tabs **Claude Code / Claude Desktop / curl** of `mcpSnippets.js` unchanged, Darstellung (System / Hell / Dunkel), Sprache, Verwaltung for an admin (registration, users and roles), Abmelden. Alle shows its `d` key on the "Erledigte zeigen" toggle as 06 does. Nothing changes for anyone without `?ui=neu`. |
| **Owning unit** | `fe/tasks` — new `tasks/views/ReviewPage.vue`; `tasks/views/AllPage.vue` (polish); `tasks/stores/gtd.js` (`followUpCounts`); `tasks/listState.js` (`reviewChecked`, the hand ticks); `tasks/panels/MarginPanels.vue` (no "Rückblick" panel on the Rückblick page). `fe/identity` — new `identity/SettingsPage.vue`, `identity/SettingsSection.vue`, `identity/ClaudeSettings.vue`, `identity/AdminSettings.vue`, `identity/CodeBlock.vue`, `identity/useAccount.js`, `identity/texts.js`. `fe/shared` — new `shared/weeklyReview.js` (the steps, their counts and checks, the head), new `shared/settingsRules.js` (the password check, the key's mask, what a role change sends), new `shared/messages.review.de.js` and `shared/messages.settings.de.js` (the two pages' own texts; the `rs.*`, `review.*` and the settings-only `set.*` keys move there from `messages.de.js`). `fe/app` — `router/index.js` (the two pages), `router/lazyPages.js` (the two pages lazily; the placeholder goes). `fe/layout` — `layout/ComingPage.vue` **deleted**: after M14 no route shows it; `layout/ui/PillButton.vue` dims an `aria-disabled` pill as a disabled one (the review: a busy button keeps the focus). `tests` — new `weeklyReview.test.js`, `settingsRules.test.js`, `useAccount.test.js`; `strings.test.js`, `lazyPages.test.js`. `docs` — this brief, [`build/m14/`](../design/2026-10-31-unified-ui/build/m14/README.md); brief 0050's link to the deleted placeholder becomes plain text (`RULE-DOC-004`). `ops` — `ops/structure-baseline.toml` (raises, Pre-checks). |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3–§5; [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (new files only in unit folders; features never import features — `fe/identity` may reach `fe/shared` and `fe/layout` only, so Einstellungen reads no task store and reports in place, not on the task notice; `layout/` imports no feature; tests cover logic). |
| **Governed by** | [ADR 0042](../adr/0042-the-new-ui-coexists-behind-a-switch.md) (old side unchanged). [ADR 0007](../adr/0007-frontend-test-scope.md) (pure logic tested, no component mounting). [ADR 0033](../adr/0033-the-mcp-server-nobody-could-connect-to.md) (the MCP snippets: no key in the Claude Code command) and [ADR 0041](../adr/0041-the-plugin-ships-a-review-reminder.md) (the four steps) — read, not changed. |
| **Rule IDs introduced** | **None.** `ops/structure-baseline.toml` raises six recorded fan-in values (`RULE-ARCH-003`), each approved by the owner (RISK-GOV-001: not an independent approval) and justified in a dated comment: `layout/ui/PillButton.vue` 7 → 10, `layout/ui/EyebrowLine.vue` 9 → 10, `composables/useFrame.js` 5 → 6, `stores/auth.js` 5 → 6, `tasks/notice.js` 6 → 7, and a new entry `layout/ui/PageHeading.vue` 5 (at the default cap of 4). |
| **Entry points** | `ReviewPage.vue`, `SettingsPage.vue` (route components behind `pick()`, lazily), `shared/weeklyReview.js` (`reviewSteps`, `reviewHead`, `doneShown`), `shared/settingsRules.js` (`passwordError`, `maskKey`, `shownText`, `roleAfter`, `roleError`, `copyFailedKey`), `identity/useAccount.js` (profile, password, key, admin; one request at a time per action, `pending`), the store's `followUpCounts`. |
| **Affected public surfaces** | **None.** The routes `/review` and `/settings` exist (`ops/surfaces/spa.json`); the storage keys written (`fullName`, `email`, through the profile save; `theme`, through `useTheme`) exist and are written as before; no new API call — every endpoint is the API's own, used as the old settings page uses it. |
| **Known dependents** | From `./run impact` before the code: `views/SettingsView.vue` → `router/index.js` → `main.js`; `shared/claudeConnect.js` → `SettingsView.vue`; `shared/mcpSnippets.js` → `claudeConnect.js`, `SettingsView.vue`. None of the three changes (the old side stays as it is; the two shared modules are only read). `tasks/views/AllPage.vue` → `router/index.js`. `router/lazyPages.js` → `router/index.js`, `NewUiHost.vue`. `layout/ComingPage.vue` has no import-derived dependent (`BLIND-FE-002`: only `lazyPages.js` loads it, with `import()`). Added during the work: see Pre-checks. |
| **Uncertain / dynamic areas** | **`BLIND-FE-002`** — both pages are reached from the router only through `import()` (`router/lazyPages.js`), as M13's pages are, for the entry budget (129.80 of 130 kB gzip after M13); `./run impact` on them names no dependent, `lazyPages.test.js` holds the edge. **F13** — the index credits no frontend test; protecting tests are named below. **`RISK-TEST-004`** — the pages are presentation over tested rules; they are driven on the harness, not mounted in tests. **Settings writes are not in the outbox** (§6.4 lists none; the old page sends them directly): each is one request, and a failure keeps what was typed and says why. **The clipboard** (`navigator.clipboard`) is missing outside a secure context; a copy that fails says so instead of claiming "Kopiert". |
| **Analogous implementations** | `06-kombination/web.js` `renderHead('review')`, `reviewSteps`, `renderReview`, `renderSettings`, `renderHead('settings')`, `renderHead('all')`; `web.css` `.step`, `.review-foot`, `.set`, `.code`; the old `views/SettingsView.vue` (every section, request and text, the key masking of the "Claude verbinden" step). In this repository `projects/ProjectsPage.vue` (a page on `AppFrame` with the margin), `projects/texts.js` and `messages.projects.de.js` (a lazy page's table), `projects/ProjectPage.vue` (a page's own notice), `tasks/panels/ReviewPanel.vue` (the review's day and age). |
| **Delivery Pattern** | **New Capability** (units declared in M0). |
| **Required tests** | New: `weeklyReview.test.js` — the six steps in order with their counts; which steps tick themselves (Inbox empty, no stuck project) and that a hand tick is kept apart from them; step 4 names the stuck projects; the head for a review today, yesterday, n days ago and never; the done list's cap. `settingsRules.test.js` — the password check (empty, mismatch, fine), the key's mask (never the key, its last four characters, a missing key), what is shown of a text that holds the key (masked unless revealed, every occurrence, a text without it unchanged), the role a change sends and the last-admin refusal's message; what a failed copy says, with the key masked or not (`copyFailedKey`). `useAccount.test.js` (the review; a fake client answering one call at a time) — a second click while a request is out sends nothing, for the registration switch, "Neuen Key erzeugen", each user's role button on its own, the profile and the password; a refused or failed request frees the action. Extended: `strings.test.js` — every lazy table (projects, review, settings) is text, shares no key with the main table or another lazy table, holds no heading, and every `t()` key is found in one of them; `lazyPages.test.js` — the two new pages are lazy, the placeholder is gone. **Unchanged and passing:** `claudeConnect.test.js`, `mcpSnippets.test.js` (plan M14). Existing that protect touched code: `strings.test.js`, `commands.test.js`, `gtdRules.test.js` (`reviewAgoKey`, `reviewDue`), `sections.test.js` (`waitingSections`), `pick.test.js` (one wrapper for every route). |
| **Intended scope** | The files above. **Not** in scope: the old UI; a context editor in Einstellungen (06's "Kontexte" section needs the shared list of D1's other answer, optional MB1, not taken); English (v1 is German only, 06's "Sprache" says so); the daily review (the API's `kind: daily` is the skill's). |
| **Base revision** | `d50ea7d` (`main`, M13 merged) |

## Design

- **Rückblick stands on `AppFrame`** like Projekte: head, steps, the margin's panels (without its own "Rückblick"
  panel, which would offer to begin the review the page is), and the notice. Each step's count is a link into its
  list; going there and coming back keeps the hand ticks (they live with the page's module for the session, as
  06's `ui.reviewChecked`), and "Rückblick abschließen" clears them.
- **The steps are a pure rule** (`weeklyReview.js`): counts in, steps out (message keys and values, ticked or not,
  where each leads). The page reads the counts from the store — the Inbox, Nächste and its Fällig, Warten auf's due
  and this week's follow-ups (`followUpCounts`, the same split as Warten auf's sections), the stuck projects as the
  snapshot reads them (M13), Irgendwann — so a step agrees with its list the moment a todo moves.
- **"Erledigt · letzte 7 Tage"** sits under the steps: the store's `doneWeek`, newest first, struck through, the
  seven newest and "und n weitere · in Alle zeigen" ("in Alle zeigen" when nothing is cut off), which opens Alle with
  its done section on. 06 leaves it out (its lead says six steps); the plan's M14 line names it, and a weekly review that looks back starts there.
- **The review is recorded through the outbox** (`recordReview`, M3): sent at once, idempotent, a failure in the
  rail's "nicht gesendet" line like every write; the head and the rail's ring follow the reply.
- **Einstellungen stands on `AppFrame`** with 06's `.set` rows (label left, content right; one column on the phone).
  `fe/identity` may not import `fe/tasks`, so it reports in place ("Gespeichert", "Passwort geändert", an error under
  the field) rather than on the task notice, and reads the user from `stores/auth.js` (its own unit).
- **The key is never on screen unless asked for.** The API-Key row shows its last four characters behind dots; every
  text that holds it — the first "Claude verbinden" step, the Claude Desktop and curl snippets — is shown masked
  until "Anzeigen" (`shownText`), while "Kopieren" always takes the real text. The old page masked the step only and
  showed the two snippets with the key in plain.
- **The four steps and the three tabs are the shared modules' strings, unchanged** (`connectClaudeSteps`,
  `mcpSnippets`, `mcpUrl`, `skillZipUrl`, `RUNWAY_PROJECT_LINE`, `PLUGIN_UPDATE`). Only the step titles are German, by
  the step's `id` from the page's table; the copied text is byte for byte what the old page copies.
- **Android's "Key einfügen"** (`key_way_help`: "Kopiere den API-Key in den runway-Einstellungen im Browser") finds
  the row "API-Key" in Einstellungen with "Kopieren" beside the key, and the row's text names the app.
- **The entry budget.** Both pages are chunks of their own, prefetched in idle time like M13's; their texts travel in
  their own tables (`addMessages`), and the keys only they show leave the main table, so the entry does not grow.

## Where this departs from the plan or the prototype

- **Six steps, not five:** the plan's M14 line lists Inbox leeren, Nachhaken, Projekte ohne nächste Aktion,
  Irgendwann, erledigt letzte 7 Tage; 06 (the approved design) has six steps with Nächste and Kalender. The page
  keeps 06's six and adds the done list under them, so both are there.
- **"Rückblick abschließen"** (06's text) where the plan says "Rückblick eintragen". It comes after the done list, so
  at 1440×900 it is below the fold (06 has it right under step 06): the review looks back before it closes, and the
  keyboard order follows; closing takes a scroll on a desktop screen.
- **No "Kontexte" section** (06 shows an editable list): under D1's default there is no stored list to edit (MB1 not
  taken); the contexts are those in the open todos.
- **No "Zuletzt geändert vor 3 Monaten"** under Passwort (06): the API does not record it.
- **The placeholder page is deleted**, not kept: after M14 every route of the new UI has its page.

## Open points

- `make verify` container tier: skipped locally, Docker is not running (`RISK-TEST-001`); CI runs it.

## Pre-checks

- **Before the code:** `make check` GREEN on `ui/m14-review-settings` at `d50ea7d`. `./run map` on
  `frontend/src/views/SettingsView.vue` (unit `fe/identity`), `shared/claudeConnect.js`, `shared/mcpSnippets.js`
  (`fe/shared`), `tasks/views/AllPage.vue` (`fe/tasks`); `./run map frontend/src/identity/SettingsPage.vue` and
  `frontend/src/tasks/views/ReviewPage.vue` before they existed (no match; the globs `frontend/src/identity/**` and
  `frontend/src/tasks/**` cover them); `./run impact` on the three Before-you-start paths, `AllPage.vue`,
  `router/lazyPages.js` and `layout/ComingPage.vue` (dependents above); `./run brief --paths` for them.

- **After it**, `./run map` puts `identity/*.vue`, `identity/useAccount.js` and `identity/texts.js` in `fe/identity`,
  `tasks/views/ReviewPage.vue` in `fe/tasks`, `shared/weeklyReview.js`, `settingsRules.js`, `messages.review.de.js` and
  `messages.settings.de.js` in `fe/shared`, as intended (the new files were marked with `git add -N` so the index sees
  them before the commit). `./run impact`: `shared/weeklyReview.js` → `ReviewPage.vue`; `shared/settingsRules.js` →
  `ClaudeSettings.vue`, `SettingsPage.vue`, `useAccount.js`; `identity/useAccount.js` → `SettingsPage.vue`,
  `AdminSettings.vue`; `tasks/listState.js` → `AllPage.vue`, `NextPage.vue`, `ReviewPage.vue`; `tasks/stores/gtd.js` →
  every page through the store (one added computed, nothing changed); `router/lazyPages.js` → `router/index.js`,
  `NewUiHost.vue`. The two pages themselves show no dependents (`BLIND-FE-002`, above). `shared/claudeConnect.js` and
  `shared/mcpSnippets.js` are unchanged (`git diff` empty) and gain the new page as a reader.
- **Fan-in (`RULE-ARCH-003`):** red for exactly the six values named above; each raised with a dated comment. Avoided
  rather than raised: the page reads the user through `useAccount.js` only (one more importer of `stores/auth.js`, not
  four), the theme through the frame's props and events (no import of `useTheme.js`), Warten auf's split through the
  store (`followUpCounts`, no fifth importer of `shared/sections.js`), and no settings or review component imports
  `useKeymap.js` or `shared/dates.js`.
- **Tests:** vitest 691 → 725 (42 files; `weeklyReview.test.js` +9, `settingsRules.test.js` +13, `useAccount.test.js` +7,
  `strings.test.js` +2, `lazyPages.test.js` +3). `claudeConnect.test.js` (21) and `mcpSnippets.test.js` (9) pass unchanged, and so do their
  modules. `make check` GREEN (after `make fix` rebuilt the index), `make verify` GREEN (container tier skipped, Docker not
  running, `RISK-TEST-001`). `./run surfaces` clean: no route, storage key or
  API change.
- **The old UI** is untouched: `git diff --stat d50ea7d` over `components/`, `views/`, `stores/`, `App.vue` is empty;
  `router/index.js` changes only the new side of `/settings` and `/review`; `old-settings-unchanged.png` shows the old
  "Account" page.
- **Budgets** (`vite build`, after the review): entry JS 129.18 kB gzip (≤ 130; M13: 129.80), CSS 13.50 kB gzip
  (≤ 20); Rückblick 2.70 + 0.89 kB, Einstellungen 7.30 + 1.90 kB gzip.
- **Acceptance on the harness** (2026-11-11, an own backend on :8061 and Vite on :5261 over a scratch data root; the
  06 demo set, an admin and two users; every request and number in
  [`build/m14/README.md`](../design/2026-10-31-unified-ui/build/m14/README.md)): the six steps with their counts, hand
  ticks kept across a visit to a list, one `POST /gtd/review` and the notice; profile, password (refused before
  sending, refused by the server, changed), the key hidden in the page's HTML, copied for real, revealed, regenerated
  after a question; the four steps and the three tabs copy byte for byte what the shared modules build, with the key;
  the theme choice; registration and roles as an admin; no Verwaltung for a user. **Android's "Key einfügen"** ("Kopiere
  den API-Key in den runway-Einstellungen im Browser"): Einstellungen → API-Key → "Kopieren" puts the key on the
  clipboard. No console errors but the one 400 the wrong password causes.
- **Accessibility:** axe-core 4.10.2: 0 serious or critical issues in all thirty-four new-UI shot states (light,
  dark, reduced motion, narrow, phone, WebKit, 200 % zoom); keyboard walkthrough of both pages, focus visible, nothing
  traps, `Esc` closes an open form and returns the focus to its button; 200 % zoom at 1440 px: no horizontal scroll.
- **Shots:** [`build/m14/`](../design/2026-10-31-unified-ui/build/m14/README.md) — `review-*` (13), `settings-*` (18),
  `all-*` (3), `old-settings-unchanged`, and 06's prototype rendered for the comparison (`06-review-desktop-light`,
  `06-settings-desktop-light`, `06-all-desktop-light`).
- **Fixed after looking at the shots** (details in the README): the code blocks no longer widen the column on desktop
  or phone (`minmax(0, 1fr)` in `ClaudeSettings.vue` and `SettingsSection.vue`), a command takes the phone's whole
  width with "Kopieren" under it (`CodeBlock.vue`), Anzeigen before Kopieren as 06, the forms' buttons are not coral
  (one primary action per view), the done list is 06's `.donelist` (struck, muted, no coral ring), "du" passes
  contrast, no rule above Konto, the phone's role buttons in line.
- **Review (2026-11-11): fifteen findings, all fifteen checked and real, none rejected.** Fixed in code:
  the registration switch, "Neuen Key erzeugen" and the role buttons could send a request twice (one `busy` for all
  users) → `useAccount.js` sends one request per action at a time, each user's role on its own key
  (`useAccount.test.js`, 7); a button that disabled itself dropped the focus → `aria-disabled` and an ignored second
  press, `PillButton.vue` dims it; status regions were inserted with their text and not read → one region per
  section and per code block, always in the page; the role buttons had one name for every user → "Zum Admin machen
  (m14-u)"; "Kopieren"'s fixed `aria-label` did not contain "Kopiert" and success was silent → the visible word first,
  the "what" hidden after it, "Kopiert" announced; Anzeigen was a pressed toggle with a changing label → a plain pill;
  a failed copy of a masked text asked for a hand copy of the dots → `copyFailedKey` says to show the key first
  (`settingsRules.test.js`, +3); a one-line text was cut off on the phone → it wraps; two rules under the last user →
  one. Fixed in the docs: the shot count (18), the done-list link as it ships, the README's claim of "und 4 weitere" in
  the two desktop shots, and the done list above "Rückblick abschließen" as a recorded deviation. `./run impact` after
  the fixes: `shared/settingsRules.js` → `ClaudeSettings.vue`, `CodeBlock.vue` (new reader), `SettingsPage.vue`,
  `useAccount.js` (fan-in 4, at the default cap); `layout/ui/PillButton.vue` → its ten importers (one CSS rule added,
  nothing else changes for them); `identity/useAccount.js` → `AdminSettings.vue`, `SettingsPage.vue`. Driven on the
  harness with every write held 1.2 s and with the clipboard refused (README, "Fixed after the review"); every
  `settings-*` re-shot, axe 0 serious or critical in all 18. `make check` GREEN after `make fix` rebuilt the index;
  `make verify` GREEN (container tier skipped, Docker not running, `RISK-TEST-001`).
