# Change Impact Brief 0048 — GTD rules shared with Android

| Field | Value |
|---|---|
| **Requested outcome** | Milestone **M2** of [the plan](../plan/unified-ui-web.md): the pure rules every later milestone computes with, ported from the approved prototype (`docs/design/2026-10-31-unified-ui/06-kombination/rules.js`, `store.js`, `common.js`, `i18n.js`) into `frontend/src/shared/`, with the plan's corrections F2, F4 and F6 applied; the German message table and its `t()`; and one JSON file of rule vectors that the web runs and the Android app copies, so both clients file, section, count and caption the same way. Backed by container tests that pin the API behaviour these rules rely on. No UI. |
| **Owning unit** | `fe/shared` — the new [`gtdRules.js`](../../frontend/src/shared/gtdRules.js), [`sections.js`](../../frontend/src/shared/sections.js), [`dayProgress.js`](../../frontend/src/shared/dayProgress.js), [`contexts.js`](../../frontend/src/shared/contexts.js), [`dates.js`](../../frontend/src/shared/dates.js), [`i18n.js`](../../frontend/src/shared/i18n.js), [`messages.de.js`](../../frontend/src/shared/messages.de.js). `tests` — the new frontend tests named under *Required tests*, the vectors [`frontend/tests/vectors/gtd-rules.v1.json`](../../frontend/tests/vectors/gtd-rules.v1.json) and [`backend/tests/container/test_ui_contract.py`](../../backend/tests/container/test_ui_contract.py). `docs` — this brief. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 (a frontend rule about tags, filtering or sorting goes in `frontend/src/shared/`), §4 (units and allowed edges); [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (new files only in the unit folders; tests cover logic, not components; comma-joined tags are split in one place, `contextTags.js`). |
| **Governed by** | [ADR 0007](../adr/0007-frontend-test-scope.md) — every module here is pure and tested in node, nothing is mounted. [ADR 0042](../adr/0042-the-new-ui-coexists-behind-a-switch.md) — nothing here is imported by the old UI, so nobody's screen changes. |
| **Rule IDs introduced** | **None.** No gate rule, ledger entry, waiver, `architecture.toml` or baseline change: `gtdRules.js` and `i18n.js` were put on the fan-in allowlist in M0 for exactly this milestone. |
| **Entry points** | `listOf`, `clarifyPayload`, `listPayload`, `contextPayload`, `inversePayload`, `applyPayload`, `planPayload`, `beforeOf`, `projectNameError`, `isAddableTag` (`gtdRules.js`); `ringOf`, `plannedToday`, `nextSections` (`sections.js`); `dayProgress`, `countsAsPlanned`, `lensCaption` (`dayProgress.js`); `orderContexts`, `presentContexts`, `contextCounts`, `chipCount`, `eyebrowCount` (`contexts.js`); `dayOf`, `plusDays`, `formatDay`, `followUpDay`, `followUpOptions` (`dates.js`); `t` (`i18n.js`). No caller in production code yet: M3's store is the first. |
| **Affected public surfaces** | **None snapshotted.** No route, no storage key, no REST/MCP change (`./run surfaces` clean). Consumed by another repository, so treated as a contract: the vectors file — the Android plan copies it and records its SHA-256; a rule change bumps `version`. |
| **Known dependents** | From the index: `contextTags.js` gains one importer, `gtdRules.js` (now four direct dependents, the `RULE-ARCH-003` fan-in cap; its existing dependents `TaskModal.vue`, `taskFilters.js`, `stores/tasks.js` are untouched); `contexts.js`, `sections.js` and `dayProgress.js` reach it only through the `gtdRules.js` re-export, and later milestones must keep going through it, because one more direct importer of `contextTags.js` would need a dated baseline line (F10); the seven new modules are imported only by each other and by the tests. See *Pre-checks*. |
| **Uncertain / dynamic areas** | **F13**: the index credits no frontend test, so the protecting tests are named under *Required tests*. **F7**: the client takes the day boundary from `SERVER_TZ = 'Europe/Berlin'` (the server does not publish its zone); a deployment in another zone would mis-day rows — recorded risk, not changed here. `RISK-TEST-001`: the container tier does not run on arm64 in Docker; it was run by hand against the local Taskwarrior 3.5.0 and the observed answers were first taken over HTTP from the dev harness (*What the API does*). |
| **Analogous implementations** | `06-kombination/rules.js` + `rules.test.mjs` (ported), `store.js` (`lists`, `ringOf`, `ctxCount`, `progress`), `common.js` (`followOptions`, the date formats), `web.js` (the merged Fällig heading, the eyebrow), `i18n.js` (the table); `frontend/src/shared/contextTags.js` (the comma rule this builds on); `backend/tests/container/test_real_task.py` (container style and fixtures). |
| **Delivery Pattern** | **New Capability** — owner `fe/shared` (declared in M0). Failure behaviour: a move that would have to guess a context throws `NeedsAnswer('context')` before anything is sent; a plan for a todo outside Nächste returns `null`; a missing message key renders as the key and logs an error in dev builds. |
| **Required tests** | `frontend/tests/gtdRules.test.js`, `sections.test.js`, `dayProgress.test.js`, `contexts.test.js`, `dates.test.js`, `i18n.test.js`, `vectors.test.js` (every case of the JSON against the JS functions, plus the file's own shape), `strings.test.js` (the pinned strings equal `messages.de.js`; every `t('…')` literal under `frontend/src` is a key of the table; no markup in the table). `backend/tests/container/test_ui_contract.py` (CI tier). The existing 131 frontend tests pass unchanged. |
| **Intended scope** | The files under *Owning unit*. **Not** in scope: the store, the outbox and `plannedAtHold` being recorded (M3); any component; `taskFilters.js`/`contextTags.js` behaviour (unchanged); the plan's section-10 live-data steps. |
| **Base revision** | `61196e6` (branch `ui/m1-design-tokens`, M1, not yet on `main`) |

## What the API does (asked before the test was written)

Asked over HTTP against the dev harness (real backend, Taskwarrior 3.5.0, `TZ=Europe/Berlin`),
user `m2-probe` of its own, on 2026-11-01. `backend/tests/container/test_ui_contract.py` pins
each answer:

| Question | Observed |
|---|---|
| `PUT {scheduled: ""}` on a waiting todo with a follow-up | `scheduled` → `null`; tags and description unchanged. |
| `PUT {tags_add: [next], tags_remove: [waiting], scheduled: ""}` in one request, then its inverse `{tags_add: [waiting], tags_remove: [next], scheduled: "2026-10-31"}` | `["@anrufe","next"]`, `scheduled: null`; then `["@anrufe","waiting"]`, `scheduled: "20261030T230000Z"` (local midnight of 31.10., F3). |
| A legacy comma tag `next,@home` (written with the `task` CLI) | `tags_add: ["next,@home"]` → **400** `Invalid tag: next,@home` (F2: an inverse may never re-add it). `tags_remove: ["next,@home"], tags_add: ["waiting","@home"]` → `["@home","waiting"]`. A `tags_add` of a tag already present and a `tags_remove` of an absent one are no-ops. |
| `done` on a started task (F6) | **`start` does not survive**: before `start: "20261101T102324Z"`, after `start: null`, `end` set, `status: completed`. Taskwarrior's own `task <uuid> export` shows no `start` either, so it is the binary, not the service. |
| `GET /tasks?completed_since=<summary.today>` | Returns the task done today with its `end`, `status: completed`. |
| A legacy `next,@home` in `GET /gtd/next` | **Not listed**: the binary matches whole tags, so the server's Nächste misses a comma tag that the client's `listOf` (which splits) puts in Nächste. |

The probe was repeated on 2026-11-01 (13:42) with the same answers. The container file itself
was run by hand on this machine against the real binary (`/opt/homebrew/bin/task` 3.5.0, not the
CI image): 7 passed (see *Pre-checks*).

**Consequence for the plan's section-10 parity check:** the differences between `listOf` and
the server's `/gtd/*` lists are the F4 dual-tag cases **and** legacy comma tags holding a status
tag (the server misses them, the client lists them). Both are expected; anything else is a bug.

## Design corrections (plan facts F2, F4, F6) and where the vectors hold them

- **F2, legacy comma tags.** The API refuses a new tag with a comma. 06's `listPayload` removed a
  raw `next,@home` without adding back `@home`; 06's `inversePayload` re-added removed raw tags,
  i.e. the comma tag → 400. Here `listPayload` adds back the parts that are not status tags, and
  `inversePayload` works on **parts**: it removes the tags the move added (unless they were parts
  before) and adds back each part the task had before, singly. Undo therefore repairs a comma
  tag instead of restoring it. Vectors `listPayload/legacy-*`, `inversePayload/legacy-*`.
  **Limit (review finding):** a part is added back through `tags_add`, which the API checks
  against `TAG_RE`, stricter than the `EXISTING_TAG_RE` that let the legacy tag in. A legacy
  `next,a/b` would make every move answer 400 (checked on the harness: `tags_add: ["a/b"]` →
  `400 Invalid tag: a/b`), and *Erneut senden* would fail again each time. `listPayload` and
  `contextPayload` therefore check every part with `isAddableTag` (a mirror of `TAG_RE`, never
  stricter than the server: compared over all code points, it accepts everything Python accepts)
  and throw `NeedsAnswer('legacyTag')` before anything is sent, so the UI can explain it. Vectors
  `listPayload/legacy-part-the-api-refuses`, `contextPayload/legacy-part-the-api-refuses`.
- **F4, dual-tagged todos.** `GET /gtd/next` lists a `+next +waiting` todo; the rules put it in
  Warten auf only (`listOf` → `waiting`), and Android must filter `/gtd/next` the same way.
  Vector `listOf/f4-next-and-waiting`.
- **F6, start is dropped on done.** Answered above: yes. A todo counted as planned only because it
  was running would turn into "zusätzlich" on completion. `dayProgress` therefore also counts a
  done todo as planned when it carries `plannedAtHold: true` — the flag M3's outbox hold sets from
  `countsAsPlanned` at the moment of the tick. Vector `dayProgress/f6-*`.
- **Correction to 06's day count (review finding).** 06 (`rules.js:128-129`) counted an open todo
  as planned only outside Inbox, Warten auf and Irgendwann, but a done todo by `plannedToday`
  alone. Ticking an Irgendwann, Inbox or Warten-auf todo due today therefore grew the denominator
  ("0 von 1" → "1 von 2") instead of showing "0 von 1 · 1 zusätzlich", against the stable rule.
  (The harness confirms the input occurs: a completed `+someday` todo due today comes back from
  `GET /tasks?completed_since=today` still tagged `someday` with its due.) One exported predicate,
  `countsAsPlanned`, now decides the open side, the done side and the hold's `plannedAtHold`, so
  they cannot disagree. Vectors `dayProgress/*-due-today-done-is-extra`. The prototype's store
  cases 11 and 14 (demo day 3 von 7 → 4 von 7 → 4 von 7 · 1 zusätzlich; Warten auf → Nächste keeps
  the denominator) are now pure snapshot vectors too (`dayProgress/demo-day-*`,
  `dayProgress/waiting-to-next-keeps-the-denominator`), so Android runs them.
- **F3, no fabricated timestamps.** `applyPayload` returns a new task whose `scheduled` is the bare
  day the PUT sent (`2026-10-31`), not 06's invented `T070000Z`; `dayOf` reads a bare day as that
  day, which is how Taskwarrior stores it (local midnight). The store replaces the optimistic copy
  with the task the PUT returns (M3).

## Where this departs from the plan or the prototype

1. **Section keys are ASCII:** `faellig`, `faelligAndere`, `jetzt`, `bald`, `spaeter` (the plan
   writes `fällig`, `fälligAndere` beside `spaeter`). Plain keys are safer in Kotlin and JSON
   tooling; they are internal names, never shown.
2. **`nextSections` returns `dueMerged`** — true when a context filter is on, that context has
   nothing due and other contexts do: the view then shows those under the one Fällig heading with
   the note "andere Kontexte" (`sec.otherCtx`) instead of "Nichts fällig" (critic 4). Fällig is
   ordered by due date, oldest first, as in 06 (the plan's "running, prio H, urgency" order is
   applied to Jetzt · Bald · Später, where 06 applies it too).
3. **`planPayload` refuses Inbox, Warten auf and Irgendwann** (returns `null`), not only Warten
   auf: those three are exactly what `dayProgress` never counts as planned, so a plan there would
   change nothing visible. 06 allowed `t` only on Nächste; "ohne Liste" todos (a context without
   a status tag) are counted by `dayProgress`, so they may be planned too.
4. **`projectNameError` follows `backend/app/models.py`** where 06 differed: the DEL character is
   refused, any leading or trailing whitespace counts (not only a space; "whitespace" is Python's
   `str.isspace` set spelled out, because JS `\s` differs: U+0085 counts, U+FEFF does not — found
   in review, vectors `projectNameError/trailing-next-line`, `…/byte-order-mark-is-not-space`,
   `…/ideographic-space-only`), length is counted in
   code points as Python does, and the reserved names are matched exactly (`Overview` is a valid
   name on the server). The duplicate check stays case-insensitive as prototyped (a UI guard).
5. **Markup removed from the message table.** 06 had `<b>` and `<kbd>` inside eight strings,
   which a Vue port would need `v-html` for — with a project name interpolated, an injection
   path. Those values are now arrays: `[before, emphasised, after]` (as the headings already
   were), and the two keyboard hints are lists of `[key, label]` pairs. `t()` interpolates every
   element of an array. A test refuses `<` in any message. The wording is 06's: the step hint
   is `[['1–{n}', 'wählen'], ['0 oder Esc', 'zurück']]` (reads "1–5 wählen · 0 oder Esc zurück";
   M10 renders the key part, "oder" included, as it sees fit).
6. **Notice keys are `notice.*`** (06: `n.*`), with the plan's values: `notice.done = 'Erledigt'`,
   `notice.deleted = 'Gelöscht'`, `notice.captured = 'In Inbox ✓'`; `lens.extraShort` (`+{n}`) is
   deleted, and `lensCaption({short: true})` uses `lens.short` + ` · {n} zusätzlich`. New key
   `empty.inbox = 'Inbox ist leer'` (a pinned Android string; 06 had only the heading form).
7. **The vectors' `strings` section is the pinned subset** the plan lists (plus the list names,
   `ohne Kontext`, `+{n} ohne Kontext` and the lens caption parts), keyed by message key; the test
   holds each equal to `messages.de.js`. The whole table is not copied: web-only strings would
   force a vectors version bump on every wording change.
8. **Vector args are complete argument lists** (`today` included), so a runner needs no
   per-function context; the file's top-level `today` and `functions` describe them.
9. **New helpers not in the plan's list**, each needed by a listed function or by M3: `beforeOf(t)`
   (the snapshot an inverse needs), `presentContexts(tasks)` and `chipCount` (D1 chips; the eyebrow
   and the chip share `chipCount`), `followUpOptions(today)` (06's `followOptions` without the
   labels' rendering), `countsAsPlanned` and `isAddableTag` (the two review corrections above).
10. **`eyebrowCount` returns the parts, not the joined string** the plan writes
   (`['@anrufe', '3', '+1 ohne Kontext']`, not `@anrufe · 3 · +1 ohne Kontext`): the view renders
   them with the `·` separator spans, as 06's `eyebrow()` does. The vectors' `functions` entry
   says so; Android joins them with ` · `.

## Open points

- Carried forward from M1: the two build-time `ops` → `fe/shared` imports await Uli's decision as
  owner (`RISK-GOV-001`, not independent). Nothing in M2 changes them.
- **For Android** (plan §11): copy `frontend/tests/vectors/gtd-rules.v1.json`, record its SHA-256
  (in *Pre-checks*), run every case; adopt the F4 rule (filter `/gtd/next`); the F6 rule needs a
  `plannedAtHold` flag recorded at the tick from `countsAsPlanned`; a move of a todo whose legacy
  comma tag holds a part the API refuses is refused before sending (`legacyTag`).
- **`RULE-GOV-002` is red on this branch and on `main`** (decay review overdue since 2026-10-14).
  Outside this change.
- **Pending for Uli** (none blocks the milestone): approval of this commit and the stacked branch;
  the plan's section-10 parity check (`listOf` against `/gtd/*` on his account; differences must be
  exactly the F4 cases and legacy comma tags holding a status tag, see above) is due before M5.
  The other section-10 live-data steps (local copy of his data, production opt-in, `task export`
  backup) belong to later milestones and stay his manual steps. No screenshots, device tests or
  lens choices are due in M2 (no UI).

## Pre-checks

- **Start:** branch `ui/m2-gtd-rules` from `ui/m1-design-tokens` at `61196e6`; `make check` GREEN
  before the first file. The work was resumed once after an interruption; every file was read
  again against the prototype and the plan before it was kept.
- **Before you start, as the plan asks** (after `./run index`, new files made visible with
  `git add -N`): `./run impact frontend/src/shared/contextTags.js` → direct dependents
  `TaskModal.vue`, `gtdRules.js`, `taskFilters.js`, `stores/tasks.js` (four, the fan-in cap;
  `contexts.js` and `sections.js` read tags through `gtdRules.js`, which re-exports
  `contextTagsOf`), transitively the old views and the three new modules; `./run impact
  frontend/src/shared/taskFilters.js` → `stores/tasks.js`, `views/_useTaskView.js`, unchanged;
  `./run map backend/tests/container` → `conftest.py`, `test_real_task.py`, `test_skill.py`,
  `test_ui_contract.py`, all `tests`. `./run map` puts the seven new modules in `fe/shared` and the
  vectors, the eight frontend tests and the container test in `tests`. Every new module is listed
  "without import-derived test protection" (F13): the protecting tests are the ones under
  *Required tests*.
- **Tests:** frontend **131 → 345 passed** (+214 in 8 new files; `vectors.test.js` runs all **140
  vector cases**). Backend unit **642 passed**, unchanged. Container tier **by hand** on this machine
  against `/opt/homebrew/bin/task` 3.5.0 (`cd backend && TZ=UTC PYTHONDONTWRITEBYTECODE=1
  .venv/bin/python -m pytest -p no:cacheprovider -m container tests/container`): **81 → 88
  passed** (the 7 of `test_ui_contract.py`). `ruff check` and `ruff format --check` clean on the
  new file.
- **The new tests can fail.** Faults put in one at a time, each reverted (compared with a copy
  afterwards): F4 exclusion removed from `isNext` → 4 failed; `listPayload` no longer adding back
  the parts of a removed comma tag (06's behaviour) → 2 failed; `inversePayload` restoring raw tags
  (06's behaviour) → 5 failed; `plannedAtHold` ignored → 2 failed; the follow-up day not cleared
  on leaving Warten auf → 3 failed; `notice.done` back to 06's `Erledigt: {d}` → 2 failed; `dayOf`
  in UTC → 12 failed; contexts sorted by code point instead of German collation → 1 failed; the
  lens caption using a `+N` key → 5 failed; a source file calling `t('no.such.key')` →
  `strings.test.js` failed naming the file and key.
- **Review round** (nine findings, all confirmed and fixed; none rejected or deferred): the
  `dayProgress` done-side correction, the `legacyTag` refusal, Python's whitespace set in
  `projectNameError`, the two missing prototype store cases as vectors, the step-hint wording, the
  eyebrow deviation note, the dependents row above, and a `strings.test.js` check that every key
  the rules return or pick in a ternary (`proj.err.*`, `fu.*`, `lens.*`) exists — the literal scan
  cannot see those.
- **Vectors:** valid JSON, `version: 1`, self-describing (`about`, `conventions`, `functions`), 140
  cases, 24 pinned strings. SHA-256 of `frontend/tests/vectors/gtd-rules.v1.json` as committed:
  `30b916f9e10daa7a135b079729363f25c12a292ac377d68a5317b997781a7ce4`.
- **API answers** taken over HTTP from the dev harness before the container test was written,
  and again on 2026-11-01 13:42 with the same results (*What the API does*).
- **`./run surfaces`:** no drift (exit 0) — no key, no route. **`./run violations`:** the two
  declared cycles, nothing new.
- **Budgets** (production build into the scratchpad): entry JavaScript **249.45 kB, 81.73 kB gzip**,
  CSS 39.96 kB / 7.73 kB gzip — unchanged from M1, because nothing in the app imports the new
  modules yet (none of their strings is in the bundle). Lens and frame budgets do not apply.
- **Screenshots, keyboard walkthrough, accessible names:** none — M2 adds no view and changes no
  screen, so no `build/m2` folder is created.
- **`make check`**: GREEN. **`make verify`: RED on `RULE-GOV-002` only** (201 s of 600 s, after the review fixes); every
  other component green (`js-lint`, `js-test` 345, `py-test` 642, `index-fresh`, `contract`,
  `surfaces`, `supply-chain`, `boundaries` with 0 new edges and 0 hub regressions, …), the container
  tier skipped (no Docker, `RISK-TEST-001`; run by hand above); gate conformance **56 fixture arms
  passed, 0 failed; 46 of 49 executable rules proven able to fail**, unchanged.
