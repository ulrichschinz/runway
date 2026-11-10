# Change Impact Brief 0049 — Snapshot store and outbox

| Field | Value |
|---|---|
| **Requested outcome** | Milestone **M3** of [the plan](../plan/unified-ui-web.md): the new UI's data layer. One Pinia store holds a snapshot of the five reads of plan §6.3 and computes every list, section, chip count and the day progress from it with M2's rules. Every write goes through an outbox (plan §6.4): moves and captures are sent at once and undone by their exact inverse or a `DELETE`; done and delete are held 6 s and undone by cancelling the hold; a write that fails stays visible and is retried; nothing the user asked for is lost when the tab closes, the network drops or the session ends. The snapshot refreshes on focus, visibility and `online`, at most once per 30 s, and says how old it is ("Stand hh:mm"). No view of the new UI yet: a development-only page (`?ui=neu&debug=store`) shows what the store computes. |
| **Owning unit** | `fe/shared` — the new [`frontend/src/shared/outboxQueue.js`](../../frontend/src/shared/outboxQueue.js) (the pure queue), [`frontend/src/composables/useOutbox.js`](../../frontend/src/composables/useOutbox.js) (its effects), [`frontend/src/composables/useFreshness.js`](../../frontend/src/composables/useFreshness.js), [`frontend/src/api/keepalive.js`](../../frontend/src/api/keepalive.js); `timeOf` added to [`dates.js`](../../frontend/src/shared/dates.js), `byWeight` exported from [`sections.js`](../../frontend/src/shared/sections.js). `fe/tasks` — the new [`frontend/src/tasks/stores/gtd.js`](../../frontend/src/tasks/stores/gtd.js) and the development page [`frontend/src/tasks/views/StoreDebugPage.vue`](../../frontend/src/tasks/views/StoreDebugPage.vue). `fe/app` — [`frontend/src/App.vue`](../../frontend/src/App.vue) (mounts the development page in development builds only). `ops` — [`ops/surfaces/spa.json`](../../ops/surfaces/spa.json) (the new key `outbox`). `tests` — [`outboxQueue.test.js`](../../frontend/tests/outboxQueue.test.js), [`freshness.test.js`](../../frontend/tests/freshness.test.js). `docs` — this brief and [`docs/design/2026-10-31-unified-ui/build/m3/`](../design/2026-10-31-unified-ui/build/m3/README.md). |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 (frontend rules are pure and live in `shared/`), §4 (units and allowed edges), §5 (localStorage keys are a public surface, snapshotted in `ops/surfaces/spa.json`); [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (new files only in the unit folders; tests cover logic, not components; the old UI stays as it is). |
| **Governed by** | [ADR 0042](../adr/0042-the-new-ui-coexists-behind-a-switch.md) — nothing a person without `?ui=neu` sees changes; in a production build nothing of this milestone is even shipped (see *Production build*). [ADR 0007](../adr/0007-frontend-test-scope.md) — the queue and the freshness rules are tested as pure logic; the store, the composables and the page are not mounted. |
| **Rule IDs introduced** | **None.** No gate rule, ledger entry, waiver, `architecture.toml` or structure-baseline change: `gtd.js` was put on the fan-in allowlist in M0, and every other new import stays under the cap of four (see *Known dependents*). |
| **Entry points** | `useGtdStore()` (`tasks/stores/gtd.js`): `load`/`refresh`, the computed lists, `capture`, `complete`, `remove`, `undo`, `clarify`, `setList`, `setContext`, `togglePlanned`, `update`, `start`, `stop`, `annotate`, `createProject`, `setProjectStatus`, `recordReview`, `retry`. `outboxQueue.js`: `createOp`, `enqueue`, `hold`, `isSendable`, `begin`, `commit`, `fail`, `failureOf`, `pauseAuth`, `resume`, `retry`, `undo`, `recover`, `opsOf`, `withOpsOf`, `serialize`, `restore`, `verifyRequest`, `alreadyApplied`, `captureRow`, `applyOutbox`, `withSettled`. `useOutbox()`, `useFreshness()` (+ the pure `mayRefresh`, `afterRefresh`), `sendKeepalive()`. No caller in the shipped app: the first page that uses the store is M5's. |
| **Affected public surfaces** | **One localStorage key added: `outbox`** (`./run surfaces --update`, diff in *Pre-checks*). It holds the user's unsent writes as JSON (`{"v":1,"ops":[…]}`); a later change of its shape must keep reading version 1 or drop it knowingly. No route, no REST/MCP change, no change to an existing key: the store reads `token` and `username`, which `stores/auth.js` writes. |
| **Known dependents** | Written before the code from `./run impact` (re-checked after, *Pre-checks*): `api/client.js` (allowlisted hub) gains two importers, `useOutbox.js` and `gtd.js`; `dates.js` gains `gtd.js` (3 → 4, the cap — so `useFreshness.js` does not import it: it keeps the time of the last snapshot, the store formats it); `sections.js`, `contexts.js` and `dayProgress.js` gain `gtd.js` (2, 2, 1); `gtdRules.js` (allowlisted) gains `outboxQueue.js` and `gtd.js`; `contextTags.js` stays at its cap of four because nothing new imports it (tags are read through `gtdRules.js`). The development page imports `gtd.js`, `api/client.js` (to read the server's lists for the parity check) and `composables/useTheme.js` (its first importer). `sessionEnd.js` and `stores/tasks.js` are not changed and gain no dependent: the outbox relies on the existing interceptor, and the old store stays as it is. |
| **Uncertain / dynamic areas** | **F13**: the index credits no frontend test, so the protecting tests are named under *Required tests*. **BLIND-FE-002**: `App.vue` reaches the development page through a dynamic `import()` inside `import.meta.env.DEV`, recorded as an UNKNOWN edge — on purpose, so the production bundle carries none of it. `RISK-TEST-004`: the effects (timers, listeners, `fetch` with `keepalive`, storage events) and the page are untested by construction; each was driven against the dev harness instead (*Pre-checks*). The plan's live-data parity check on Uli's account is his step (*Open points*); here it ran on the harness's demo data. |
| **Analogous implementations** | `06-kombination/store.js` (the prototype's store: holds, `send`, `flush`, `retry`, `clarify`, `undoClarify`, `setList`, `togglePlanned`, the demo-data corrections) and `web.js` (where "Nicht gesendet · Erneut senden", the rail's outbox line and "Stand" are shown); `frontend/src/stores/tasks.js` (the old store: how the API is called); `frontend/src/shared/uiFlag.js` (guarded storage behind single-quoted literal keys). |
| **Delivery Pattern** | **New Capability** — owners `fe/shared` (queue, composables, keepalive) and `fe/tasks` (store), declared in M0. Failure behaviour designed and tested, see *Failure behaviour*. |
| **Required tests** | `frontend/tests/outboxQueue.test.js` (the plan's list: send-now vs hold; undo inside the window sends nothing; undo of a sent move enqueues the exact inverse; undo of a sent capture enqueues `DELETE`, of an unsent one drops it; 401 pauses all and resumes after login, with the queue already in storage when the interceptor reloads; 4xx fails without automatic retry; restore after reload sends expired holds and verifies `sending` ops; `applyOutbox` never resurrects a held or failed done after a refresh; a capture retry runs the duplicate check first — plus the parts this brief adds: other users' ops, storage garbage, the settled overlay). `frontend/tests/freshness.test.js` (throttle, the freshness state after success and failure, "Stand" formatting in the server's zone). The existing 345 frontend tests pass unchanged. |
| **Intended scope** | The files under *Owning unit*. **Not** in scope: any view, row, notice or rail line that shows the outbox (M4/M5 render what the store exposes); the strings for "wartet auf Anmeldung" and the offline mark (added with the view that shows them); the old UI's store and views; any backend change; the plan's section-10 live-data steps. |
| **Base revision** | `6dc9859` (branch `ui/m2-gtd-rules`, M2, not yet on `main`) |

## What the API does (asked before the code was written)

Asked over HTTP against the dev harness (real backend, Taskwarrior 3.5.0) with a user of this
milestone's own (`m3-agent`), 2026-11-01:

| Question | Observed | Consequence |
|---|---|---|
| `POST /tasks/{uuid}/done` twice | `204`, `204`; the task stays `completed` | A done that is sent again does no harm. |
| `POST …/done` and `DELETE` on an unknown uuid | `204` both | No 4xx tells the client "already gone". |
| `DELETE` twice | `204`, `204`; `GET` then answers the task with `status: deleted` | as above |
| `GET /tasks/{uuid}` for an unknown uuid | `400 {"detail":"Task not found"}` (not 404) | The verification treats this 400 as "gone". |
| `POST …/start` / `…/stop` twice | `200` each | Start and stop are idempotent. |
| A request with an invalid bearer token | `401 {"detail":"Not authenticated"}` | the interceptor's case |

**Correction to plan §10.5:** "a held done on a task an agent already completed gets a 4xx and
shows *Nicht gesendet*" does not happen: the server answers `204`, so the second writer's done is
silently a no-op. That is the better outcome (nothing to explain); the plan's sentence describes a
failure the API does not produce. The verification of `sending` done/delete ops before a resend
(plan §6.4) is kept, but as a safety belt: with this API a resend would also be harmless.

## Design

### The queue (`shared/outboxQueue.js`, pure)

An op is a plain object that serialises as is: `id`, `kind`, `user`, `at` (ms), `label`
(the task's text, for notices), `uuid` (the task, or `local:<id>` for a capture until the
server names it), the request (`method`, `path`, `body`), `state`, and when they apply `until`
(end of a hold), `inverse` (a move's exact inverse, from M2's `inversePayload`),
`plannedAtHold` (F6, from M2's `countsAsPlanned`), `verify` (the outcome of an earlier try is
unknown), `failure` (`{reason, message}`), `undone` (undo arrived while the request was in flight).

| State | Meaning | Leaves by |
|---|---|---|
| `held` | done/delete inside its 6 s window | `undo` (dropped) · timer or flush → `sending` |
| `queued` | to be sent now | `sending` |
| `sending` | request in flight; persisted **before** the request leaves | `commit` (removed) · `fail` · `pauseAuth` |
| `failed` | refused (4xx) or not delivered (network, 5xx, 408, 429) | `retry` → `queued` · `undo` (dropped) |
| `auth` | a 401 paused it ("wartet auf Anmeldung") | `resume` after login → `held` or `queued` |

Kinds and requests: `capture` `POST /inbox` · `put` `PUT /tasks/{uuid}` · `done` `POST …/done` ·
`delete` `DELETE /tasks/{uuid}` · `start`/`stop` `POST …/start|stop` · `annotate` `POST …/annotate`
· `createProject` `POST /projects` · `projectStatus` `PUT /projects/{name}/status` · `review`
`POST /gtd/review` (`kind: weekly`). `put`, `start`, `stop`, `projectStatus` and `review` are
idempotent and resent without a check; for the others an unknown outcome sets `verify`, and the
next send first asks the server (`verifyRequest` / `alreadyApplied`): a capture searches
`GET /tasks?status=all&q=<text>` (`q` cut to the first 200 code points, the API's `max_length`; the match still compares the whole text) for a task with exactly that text, not deleted, entered at most
five minutes (clock skew) before the op was made (F5, Android's duplicate check); done, delete and annotate read `GET /tasks/{uuid}`; a project reads
`GET /gtd/projects`.

### Undo

| What was done | Undo while unsent (`held`, `queued`, `failed`, `auth`) | Undo in flight (`sending`) | Undo after it was sent |
|---|---|---|---|
| capture | drop it: nothing reaches the server | mark `undone`; the commit enqueues `DELETE` for the new uuid | enqueue `DELETE /tasks/{uuid}` |
| move (`put` with an inverse) | drop it: the row reverts | mark `undone`; the commit enqueues the inverse | enqueue the inverse `PUT` |
| done / delete | drop the hold | not possible (the server is doing it) | not possible |

A failed op is dismissed the same way (the row returns to what the server has).

### The snapshot and the overlay (`tasks/stores/gtd.js`)

`refresh` sends the five reads of plan §6.3 in parallel; done-this-week uses the client's
Berlin day and is fetched again when `summary.today` differs. Lists are **computed**:
`applyOutbox(snapshot, ops)` first (held/failed/paused done and delete hidden — a done moves to
the done list with `plannedAtHold`; moves patched with `applyPayload`; unsent captures added;
every touched row carries `sync` = its op's state), then M2's `listOf`, `nextSections`,
`contextCounts`, `dayProgress`. Because the overlay is applied to every snapshot, a refresh can
never resurrect a task whose done or delete is still in the queue.

A write that **was** sent can still race a refresh that started before it: the read may have
been answered before the write landed. The store therefore keeps, per task, the state the last
reply gave it and when (`settled`); `withSettled` lays those over a refresh that started before
the reply arrived, and drops entries older than the last successful refresh. Every `PUT`,
`start`, `stop` and `annotate` reply replaces the local task with the server's (F3: no
timestamp is made up; a capture's provisional row carries the client's capture time as `entry`
only until `GET /tasks/{uuid}` replaces it).

### Freshness (`composables/useFreshness.js`)

`visibilitychange` → visible, `focus` and `online` each retry failed network ops once and then
refresh, at most once per 30 s (`mayRefresh`; the first load is not throttled, and `online` after a
failed refresh is not either, see deviation 5). A refresh that
fails keeps the rows and the Stand and sets `offline`; the next success clears it. "Stand hh:mm"
is the time of the last successful snapshot in the server's zone (`dates.js` `timeOf`).

### Failure behaviour (New Capability)

| Failure | What happens | Where it is pinned |
|---|---|---|
| **Offline / network error** | The op turns `failed` with reason `network`, keeps its overlay (the row shows "Nicht gesendet" in M5); non-idempotent ops get `verify`. `online`, `focus` and a visible tab retry it once each; "Erneut senden" retries on demand. A refresh that fails sets `offline`, keeps the rows and the Stand. | `outboxQueue.test.js` *network failures*, `freshness.test.js` |
| **5xx, 408, 429** | As a network error (the server may have applied it). | `failureOf` cases |
| **4xx** | `failed` with reason `refused` and the server's `detail`; never retried automatically, only by "Erneut senden"; undo dismisses it. | *a refused write* |
| **401** | The interceptor (`shared/sessionEnd.js`) drops the token and loads `/login`. Every op was written to `localStorage['outbox']` before its request left, so the queue survives the reload whether or not the catch handler still runs: if it runs, `pauseAuth` marks all ops `auth`; if not, the op is still `sending` and is verified. After login the store boots, `recover` resumes `auth` ops (a hold whose window has passed is sent; the user did not undo) and re-queues `sending` ones with `verify`. Ops belong to the user who made them: another user logging in on the same browser never sends them. | *401*, *other users* |
| **Tab closed or hidden during a hold** | `pagehide` and `visibilitychange → hidden` send every held op at once with `fetch(…, {keepalive: true})` and the bearer token read from `localStorage` (`api/keepalive.js`), after marking them `sending` in storage. If the request is lost anyway, the next boot verifies and resends. A tab hidden and shown again inside the window has sent its holds early; undo is then no longer possible (as prototyped). | *restore*; keepalive driven in Chrome (*Pre-checks*) |
| **Page closed while a send-now request is in flight** | The XHR is aborted with the page; the op is `sending` in storage, so the next boot resends it (idempotent) or verifies it first (capture, annotate, project). | *restore* |
| **Storage refuses** (private mode, quota) | The queue lives in memory for this page; nothing else changes. | guarded in `useOutbox.js` |
| **Several tabs** | Storage is the queue: every change re-reads `localStorage['outbox']`, changes it and writes it back in one synchronous step, and a `storage` event updates the other tabs. An op is sent by the tab that moves it to `sending` first, stamped with that tab and the time (`sentAt`). A tab that boots leaves another tab's op in flight alone for `IN_FLIGHT_MS` (30 s), so a capture or note still under way is not created twice; then it takes the op over (verified, or resent when idempotent), about 31 s after boot. A tab never takes back its own op in flight. | *two tabs*, *recover* |

## Where this departs from the plan or the prototype

1. **localStorage, not IndexedDB** (plan F9 over 06's `idb` mirror), and the whole queue is
   persisted — held, queued, sending, failed and paused ops — not only holds.
2. **The queue is per user.** 06 had no users; the plan does not say. Ops carry `user` (the
   stored `username`); another user's ops stay in storage untouched and are never sent with
   the wrong token.
3. **Undo of an in-flight capture or move** (`undone`) is not in the plan's list; without it an
   undo pressed during the request's round trip would be lost.
4. **`useOutbox` lives in `fe/shared`** (`composables/`, plan §6.1/§6.4), not in `fe/tasks` as
   06's README build plan says; the plan wins.
5. **`useFreshness` does not format the Stand**: `dates.js` would get a fifth importer (fan-in cap
   four, F10); it returns the time of the last snapshot and the store formats it with the new
   `timeOf`. The 30 s throttle is the plan's, with one exception found on the harness: when the
   last refresh failed (`offline`), the `online` event refreshes at once. Without it the page
   said "offline" for up to 30 s after the network was back, though the failed attempt never
   reached the server, so the budget is not touched (`mayRefresh({reconnect})`).
6. **Plan §10.5 corrected** (see *What the API does*).
7. **`dates.js` gains `timeOf`, `sections.js` exports `byWeight`**: small additions to M2 modules
   the store needs (the Stand; the order of Nächste, Irgendwann and "ohne Liste" outside the
   sections). Neither changes a vector.
8. **The development page** is mounted from `App.vue` by query, not as a route: a route would be
   a public surface (`spa.json`) and would ship. It exists only when `import.meta.env.DEV`.
9. **Captures are cut by code points, the rest goes to the note** (`captureText`): at most 500
   code points, never inside an emoji, the cut-off text moved in front of the note. Interim rule
   until M6's `capping.js` (Android's `Capping.kt`) replaces it.

## Open points

- Carried forward from M1: the two build-time `ops` → `fe/shared` imports await Uli's decision as
  owner (`RISK-GOV-001`, not independent). Nothing in M3 changes them.
- **For M4/M5:** the store exposes `sync` per row and the ops by state; the view adds the strings
  for "wartet auf Anmeldung" and the offline mark beside "Stand".
- **Known limits, accepted:** (1) the settled overlay covers tasks, not projects: a refresh that
  started before a project's status change was confirmed can show the old status until the next
  refresh. (2) Several tabs: an op another tab put in flight less than 30 s ago is left to that tab; a
  request still unanswered after 30 s while a second tab boots can be checked a moment before it
  lands (a duplicate is then possible), and a reload during a send resends, after its check,
  only ~31 s later. (3) A tab that was hidden inside a hold has sent the
  hold early; Rückgängig is then no longer possible (as prototyped). (4) The F6 flag
  (`plannedAtHold`) is kept for the session; after a reload a todo that counted as planned only
  because it was running shows as "zusätzlich" (M2's documented scope).
- **`RULE-GOV-002` is red on this branch and on `main`** (decay review overdue since 2026-10-14).
  Outside this change.
- **Pending for Uli** (none blocks the milestone): approval of this commit and the stacked branch;
  the plan's section-10 parity check on **his** account (the development page shows the diff: open
  `/next?ui=neu&debug=store` against a local copy of his data; differences must be exactly the F4
  dual-tag cases and legacy comma tags holding a status tag); the local copy of his data and the
  `task export` backup (section 10, before M5's first production write); a keepalive check in
  Safari (M15's WebKit pass).

## Pre-checks

- **Start:** branch `ui/m3-snapshot-store` from `ui/m2-gtd-rules` at `6dc9859`; working tree clean;
  `make check` GREEN before the first file; this brief written before the code.
- **Before you start, as the plan asks:** `./run impact frontend/src/api/client.js` → six direct
  dependents (`ProjectPlanModal.vue`, `TaskModal.vue`, `stores/auth.js`, `stores/tasks.js`,
  `LoginView.vue`, `SettingsView.vue`), allowlisted hub; `./run impact frontend/src/shared/sessionEnd.js`
  → `api/client.js` only; `./run impact frontend/src/stores/tasks.js` → `AppShell.vue`,
  `ProjectPlanModal.vue`, `TaskModal.vue`, `ProjectsView.vue`, `_useTaskView.js` (none of the three
  is changed). Fan-in before: `dates.js` 3, `sections.js` 1, `contexts.js` 1, `dayProgress.js` 0,
  `contextTags.js` 4.
- **After** (`./run index`, new files made visible with `git add -N`): `./run map` puts
  `outboxQueue.js`, `useOutbox.js`, `useFreshness.js` and `keepalive.js` in `fe/shared`, `gtd.js` and
  `StoreDebugPage.vue` in `fe/tasks`, the two tests in `tests`. Direct dependents: `dates.js` 4
  (`gtdRules.js`, `i18n.js`, `sections.js`, `gtd.js` — at the cap, not over), `sections.js` 2,
  `contexts.js` 2, `dayProgress.js` 1, `outboxQueue.js` 2 (`useOutbox.js`, `gtd.js`), `gtdRules.js`
  5 (allowlisted), `api/client.js` 9 (allowlisted), `contextTags.js` 4 (unchanged). Every new
  module is "without import-derived test protection" (F13): the protecting tests are
  `frontend/tests/outboxQueue.test.js` and `frontend/tests/freshness.test.js`. The dynamic
  `import()` in `App.vue` is an UNKNOWN edge (`BLIND-FE-002`), as intended.
- **Tests:** frontend **345 → 400 passed** (+55: `outboxQueue.test.js` 46, `freshness.test.js` 9);
  the 345 existing ones unchanged. Backend unchanged (no backend file touched). The vectors file
  is unchanged (SHA-256 `30b916f9e10daa7a135b079729363f25c12a292ac377d68a5317b997781a7ce4`, as M2).
- **The new tests can fail.** Faults put in one at a time and reverted (file compared with a copy
  afterwards): a held done no longer hidden by `applyOutbox` → 2 failed; `recover` no longer
  verifying ops left `sending` → 2 failed; automatic retry of a refused op → 1 failed; undo of a
  sent capture sending nothing → 2 failed; a 401 not verifying other ops in flight → 2 failed;
  the duplicate check ignoring the entry time → 1 failed; no resume after login → 1 failed; a failed
  refresh moving the Stand → 1 failed; "Stand" formatted in UTC → 3 failed.
- **Review fixes** (findings of the independent review, all three confirmed): a capture over 200
  characters got `422` from its duplicate check (`q` has `max_length=200`) and stayed "Nicht
  gesendet" for good — `q` is now cut to 200 code points (*long captures*); `capture` cut at 500
  UTF-16 units and dropped the rest — now deviation 9; a booting tab resent another tab's capture
  still in flight — now `sentAt`/`tab` and `IN_FLIGHT_MS` (*two tabs*). Each new test fails with
  its fix taken out (q uncut → 1 failed; cut by UTF-16 units → 1 failed; no in-flight guard → 2 failed).
- **What the API does** was asked on the harness before the code (table above).
- **Driven against the dev harness** (scratch Playwright script, user `m3-agent`; output and a
  summary in [`build/m3/`](../design/2026-10-31-unified-ui/build/m3/README.md)): keepalive on
  close — a done ticked at 13:24:09.481, the page closed at 13:24:11.486, the backend logged
  `POST /tasks/<uuid>/done 204` at 13:24:11.511 (4 s before the hold's end) and the task is
  completed; undo inside the hold sends nothing; offline → `failed` (`network`) with the move
  shown, a failed refresh keeps rows and Stand and sets `offline`, back online the op is sent and
  `offline` cleared at once (which is how deviation 5 was found), Rückgängig of the sent move
  restores the tags and the follow-up day on the server; a refused write (`400 Invalid tag: a/b`)
  is not retried by `focus`/`online`, is retried once by "Erneut senden" and dismissed by undo; a
  401 during a hold → `/login`, the done in storage as `auth`, sent after logging in through the
  old login page; a capture whose page closed mid-request was verified with
  `GET /tasks?status=all&q=…` on the next load instead of posted twice (one copy on the server); a
  hidden tab sends its hold at once; five `focus` events within 2 s of the first load cause no
  further `GET /gtd/summary`.
- **Parity check** (plan §10.2, on the harness — Uli's account is his step): the development page
  as `demo` compares the store's lists with `GET /gtd/inbox|next|waiting|someday`: Inbox 5 = 5,
  Warten auf 5 = 5, Irgendwann 3 = 3, Nächste client 14 / server 15 — the one difference is
  *Druckerei: Freigabe der Flyer abwarten* (`@anrufe next waiting`), the F4 case. With a legacy
  `next,@home` todo added by the `task` CLI to `m3-agent`, Nächste also shows the second expected
  class: *Legacy: Status im Komma-Tag* (`next,@home`) is in the client's Nächste and not in the
  server's. Nothing else differs. Store values for `demo`: "3 von 7 heute" (as 06), contexts
  `@computer @anrufe @buero @unterwegs @zuhause`, chip counts Alle 14, ohne Kontext 1.
- **The old UI is unchanged.** On 2026-11-01 around 14:33 the `demo` user was shot at the same moment
  from this branch and from a temporary worktree of `ui/m2-gtd-rules` (two Vite servers, one
  backend): `/next`, `/inbox`, `/waiting`, `/projects` at desktop and phone, `/next` dark and
  `/next?ui=neu` — **0 differing pixels** in all ten pairs. (The harness backend on :8000 had been
  replaced by another session's backend at 13:27, so this comparison ran on a private backend on
  :8001 over the harness's data; the worktree and both servers were removed afterwards.)
- **Production build** (`vite build` into the scratchpad): one JS chunk **249.54 kB, 81.78 kB gzip**
  (M2: 249.45 / 81.73; budget ≤ 130 kB gzip), CSS 39.96 kB / 7.73 kB gzip (unchanged; budget ≤ 20 kB).
  No trace of this milestone in it: `outbox`, `StoreDebug`, `data-store-dump`, `debug`, `__runway`,
  `completed_since`, `keepalive`, `gtd/projects/overview` and `withSettled` occur in no file of
  `dist/` — the development page's chunk is not emitted and nothing else imports the store yet.
- **Screenshots:** [`build/m3/`](../design/2026-10-31-unified-ui/build/m3/README.md) — the
  development page at desktop and phone, light and dark (phone dark taken later the same day on a
  private backend on :8001 over the harness's data, :8000 still being held by another session's
  backend; not a product view: no 06 shot to
  compare with, no lens, so no reduced-motion or narrow shot), the old `/next` unchanged.
  **Keyboard walkthrough, accessible names, axe:** not applicable — M3 adds no interactive UI.
- **`./run surfaces`:** one intended change, `ops/surfaces/spa.json`:
  `"local_storage_keys"` gains `"outbox"`; nothing else. **`./run violations`:** the two declared
  cycles, nothing new.
- **`make check`:** GREEN. **`make verify`: RED on `RULE-GOV-002` only** (re-run on the final tree after the review fixes): every
  other component green (`js-lint`, `js-test` 400, `py-test` 642, `index-fresh`, `contract`,
  `surfaces`, `supply-chain`, `boundaries` with 0 new edges and 0 hub regressions, …), the container
  tier skipped (no Docker, `RISK-TEST-001`; no backend change in M3); gate conformance **56 fixture
  arms passed, 0 failed; 46 of 49 executable rules proven able to fail**, unchanged.
