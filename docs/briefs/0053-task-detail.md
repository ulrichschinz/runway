# Change Impact Brief 0053 — Task detail

| Field | Value |
|---|---|
| **Requested outcome** | Milestone **M7** of [the plan](../plan/unified-ui-web.md): behind `?ui=neu` a todo opens in a detail — in the margin column on wide screens (> 1180 px), as a docked panel beside the page at 761–1180 px, as a sheet from the bottom on the phone. A click on a row, `Enter`/`o` on the cursor row, `e` (open and edit the title) and a `?task=<uuid>` link (Android's Custom Tab) open it; `Esc`, "schließen", the scrim (phone) close it. Every field of the old `TaskModal` is reachable (checklist below). Field edits go out at once through the outbox; tags only as deltas (`tags_add` / `tags_remove`), never the full set; a refused edit (e.g. recur without due) shows the server's 400 message with "Erneut senden" and "Verwerfen". Nothing changes for anyone without `?ui=neu`. |
| **Owning unit** | `fe/tasks` — new `tasks/components/TaskDetail.vue` (+ `DetailField.vue`, `DetailMore.vue`, `DayInput.vue`, `OptToggle.vue`), `ListFrame.vue` puts it into the frame's `panel` slot, `useListPage.js` gains open/edit/start/delete-from-detail, `stores/gtd.js` (recurring template reply, depends patch, deferred todos held aside: `taskOf`, `keepAside`). `fe/shared` — new `shared/detailFields.js`; `shared/gtdRules.js` gains `tagPayload` (contextPayload becomes its context case); `shared/outboxQueue.js` patches `depends`; `shared/commands.js` gains `open`, `edit`, `start`; keys in `messages.de.js`. `fe/layout` — `AppFrame.vue` gains the `panel` slot (margin / docked / sheet) and a `closePanel` event. `fe/app` — `router/NewUiHost.vue` provides `openTask`. `ops/structure-baseline.toml` (two fan-in allowances, below). `tests` — `detailFields.test.js` (new), `gtdRules.test.js` (tagPayload), `outboxQueue.test.js` (depends). `docs` — this brief, `build/m7/`. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3–§5; [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (new files only in unit folders; `layout/` imports no feature; tests cover logic). |
| **Governed by** | [ADR 0042](../adr/0042-the-new-ui-coexists-behind-a-switch.md) (old side unchanged). [ADR 0007](../adr/0007-frontend-test-scope.md) (pure logic tested, no component mounting). |
| **Rule IDs introduced** | **None.** No change to `architecture.toml`. `ops/structure-baseline.toml`: two fan-in allowances — `shared/dates.js` 5 → 6 (the detail's form reads server days) and `layout/ui/EyebrowLine.vue` recorded at 5 (the detail is its fifth user). Approved by Uli as owner; under `RISK-GOV-001` that approval is not independent. |
| **Entry points** | `detailFields()`, `formOf()`, `fieldEdit()`, `extraTagsOf()`, `readTag()`, `readDay()`, `isDeferred()`, `deferredUntil()`, `committingEnter()` (`shared/detailFields.js`); `tagPayload()` (`shared/gtdRules.js`); commands `open`, `edit`, `start`; frame `openTask(uuid)` / `closeTask()`. |
| **Affected public surfaces** | **None new.** `?task=<uuid>` (M4, F19) now opens the real detail; no new route, no storage key, no API change. `./run surfaces` stays clean. |
| **Known dependents** | From `./run impact` before the code: `components/TaskModal.vue` and `components/TaskActionSheet.vue` → the six old views → `router/index.js` → `main.js`; `shared/taskPayload.js` → `TaskModal.vue`. None of them is touched (the old UI keeps its modal until M17); `taskPayload.js` gains a second caller (`detailFields.js`), its rule unchanged. |
| **Uncertain / dynamic areas** | **F13** — the index credits no frontend test; protecting tests named below. `RISK-TEST-004` — the component, focus and layouts are not unit-tested by construction; driven on the harness. **Recurring:** a `PUT` that gives a pending todo `recur` + `due` turns it into Taskwarrior's template (`status: recurring`) and a child with a **new uuid** appears (checked by curl on the harness); the store drops the template and refreshes, the detail says so. |
| **Analogous implementations** | `06-kombination/web.js` `detailPanel`, `openTask`, `setList` / `setContext` (needCtx), `editTitle`, the margin's keydown/change handlers; `web.css` `.field`, `.livebar`, `.notes`, `.detail-actions`, the 761–1180 px `.app.dock` column and the phone `.margin` sheet; `combo.css` `.needctx`, `.field.ask`, `.ulink`; old `components/TaskModal.vue`. |
| **Delivery Pattern** | **New Capability** (`fe/tasks`, `fe/shared` units declared in M0). |
| **Required tests** | New: `frontend/tests/detailFields.test.js` — which fields a todo offers (plan toggle only where `planPayload` plans; Nachhaken vs Geplant for `scheduled`; recurring keeps due and recur), `fieldEdit` goes through `buildTaskPayload` and never sends `tags`, sends `depends` only when it changed, `''` clears; `extraTagsOf`; `readTag` refuses a tag or context the todo has; `readDay` holds back the keystroke values of a date field; `isDeferred` / `deferredUntil`; `committingEnter` (IME). Extended: `gtdRules.test.js` (`tagPayload` on plain, context and legacy comma tags; refused part), `outboxQueue.test.js` (`applyOutbox` patches `depends`). Existing that protect touched code: `vectors.test.js` (contextPayload unchanged), `taskPayload.test.js` (rule unchanged, not edited), `commands.test.js` (new rows: unique keys, message keys), `strings.test.js` (every `t('…')` literal exists). |
| **Intended scope** | The files above. **Not** in scope: the clarify panel for Inbox items and `m` list moves from rows (M8), palette (M9), the margin's Heute/Nachhaken panels (M12), a project link target (M13 page; the project field is an input here). |
| **Base revision** | `1f75f90` (branch `ui/m6-capture`, M6, not on `main`) |

## Old TaskModal → detail (checklist)

| Old field | New place |
|---|---|
| Description | title, `e` or double-click / "Text ändern": inline edit, Enter saves, Esc cancels |
| Project (input + existing names) | field "Projekt": input with the existing names (`datalist`), checked with `projectNameError` (format only), empty clears |
| Priority H/M/L (toggle off) | field "Priorität": three toggles, pressing the set one clears it |
| Contexts (suggestions + toggle) | field "Kontext": toggles for the contexts present (D1 order) plus the todo's own, via `contextPayload` (delta) |
| Status tags next/waiting/someday | field "Liste": Nächste · Warten auf · Irgendwann via `listPayload` (delta, exact undo in the notice); Nächste without a context asks first ("Nächste braucht einen Kontext") |
| Custom tags (add / remove) | Mehr → "Tags": the todo's other tags with remove, an input that only adds one (`tagPayload`, delta; a new `@x` is a new context; a tag or context it already has is refused with "Das Todo hat diesen Tag schon.", never toggled off) |
| Due | field "Fällig": date; not clearable on a recurring todo |
| Scheduled | "Heute" toggle (`planPayload`) on Nächste; Mehr → "Nachhaken" (Warten auf) or "Geplant" (others) as a date |
| Wait | Mehr → "Zurückstellen" (date, "bis dahin unsichtbar"); a deferred todo's detail (a `?task=` link, a reload) still opens with "zurückgestellt bis …", so the deferral can be undone |
| Until | Mehr → "Läuft ab" (date) |
| Recur (presets + free text) | Mehr → "Wiederholen": täglich · wöchentlich · monatlich · jährlich toggles and a free-text field; without due the server's 400 is shown |
| Depends (multi select) | Mehr → "Hängt ab von": the current ones with remove, a select that adds one (full `depends` list, as the API defines it) |
| Annotations (list + add) | "¶ Notizen": list and "Notiz hinzufügen, Enter" |
| Start / Pause | live bar: "läuft seit …" / "nicht gestartet" and Starten/Pausieren (`s`) |
| Done | "Abhaken" (`x`): held 6 s with "Erledigt · Rückgängig" |
| (action sheet) Löschen | "Löschen" (`Entf`): held 6 s with "Gelöscht · Rückgängig" |
| Create mode | the capture line (M6) |

## Design

- **One open todo, in the address.** The detail is open while the route has `?task=<uuid>`;
  opening a row is `router.replace` with that query, closing drops it (`closeTask`). So Android's
  handoff link, a reload and the back stack all mean the same thing, and `NewUiHost` keeps reading
  the todo that is not in the snapshot (deleted, done) to say "Dieses Todo gibt es nicht mehr."
- **The frame places it, the feature fills it.** `AppFrame` gets a `panel` slot: on wide screens it
  replaces the margin column's content, at 761–1180 px it adds a 360 px column beside the page (06's
  `.app.dock` geometry), on the phone it is a bottom sheet (`role="dialog"`, scrim, 86 dvh, focus moved
  in and back). AppFrame still imports no store; it emits `closePanel`.
- **Writes** go through the store as M3 defined them: list and context moves with their exact inverse
  and a notice with Rückgängig; field edits, start/stop and notes at once without undo. A field edit is
  `fieldEdit(task, changes)`: `buildTaskPayload(formOf(task) + changes, formOf(task))` with `tags`
  dropped and `depends` kept only when it changed — so `''` clears and an untouched date is never
  rewritten. Failed ops of this todo are listed in the detail with the server's message.
- **Day fields send one clean value** (`DayInput.vue`). Chrome's date field fires `change` per
  keystroke (`''` with `badInput`, then `0002-…`, `0020-…`, `0202-…`); `readDay` takes only a whole day
  with a year ≥ 1900 or a field emptied on purpose, and the value goes out on blur, Enter, after 0.9 s
  of rest (a picker choice) or when the detail closes. An unfinished entry is put back on blur.
- **Deferred todos stay reachable.** A future `wait` outside Warten auf takes a todo out of every read
  of the snapshot. The store holds such a todo aside (`keepAside`, from `NewUiHost`'s `GET /tasks/{uuid}`
  and from any reply that defers it): `taskOf` and the writes reach it, the lists never show it.
  "gibt es nicht mehr" only for status deleted or 400/404; a completed one says "Dieses Todo ist erledigt."
- **Keys in fields.** Enter that confirms an IME conversion never saves (`committingEnter`); Esc in a
  field leaves the field (which commits a typed project or day) and only a second Esc closes.

## Where this departs from the plan or the prototype

- **761–1180 px:** 06 slides the detail in as an overlay (`.margin` fixed, shadow); the plan says
  "docked panel", so it is a static column beside the page (06's own `.app.dock` geometry). Plan wins.
- **Inbox rows open the detail too** until M8 brings the clarify panel (06 opens the clarify sheet).
- **Contexts offered** are the ones present in open todos (D1) and the todo's own, not 06's fixed
  `CONTEXTS`; a new context is added as a tag in Mehr → Tags.
- **Extra fields beyond 06** (Tags, Geplant, free-text recur, a list of dependencies) so that every old
  field stays reachable; 06's "Mehr" lists only Nachhaken, Zurückstellen, Läuft ab, Wiederholen, Hängt ab.
- **Recurring:** setting recur + due makes Taskwarrior replace the todo by a template and a child with
  a new uuid; the detail shows "Wiederholt sich jetzt …" instead of a todo that would no longer exist.

## Open points

- `RULE-GOV-002` red on `main` and here (decay review overdue) — outside this change.
- **Pending for Uli** (none blocks the milestone): approval of this commit and the stacked branch;
  the Custom Tab handoff from the Android app on a Pixel 9 (`/next?task=<uuid>` opens the sheet);
  the sheet with the on-screen keyboard on an iPhone; the plan's §10 live-data steps.

## Pre-checks

- **Before the code:** `./run impact` on `TaskModal.vue`, `taskPayload.js`, `gtdRules.js`, `outboxQueue.js`,
  `AppFrame.vue` (dependents above); `./run map` puts every new file in its unit (`detailFields.js` →
  `fe/shared`; `TaskDetail.vue`, `DetailMore.vue`, `DetailField.vue`, `OptToggle.vue` → `fe/tasks`).
  `./run impact shared/commands.js`: only `useKeymap.js` and the new list pages — the old UI does not
  read it, so `ownsKey`'s Enter/Space rule changes nothing without `?ui=neu`.
- **Tests:** vitest 486 → 516 (30 new cases: `detailFields.test.js`, `gtdRules.test.js` tagPayload,
  `outboxQueue.test.js` depends, `commands.test.js`; 8 of them from the review fixes: readTag on an
  existing tag, readDay ×3, isDeferred ×2, deferredUntil, committingEnter). `make check` GREEN (16 s).
- **Review fixes (independent review of 305ddf1), checked on the harness with Playwright, own user `m7fix2`:**
  typing `07` and `2027` into Fällig sends one `PUT {"due":"2027-11-07"}` (was six, one clearing due,
  three refused); a picker-like change sends after the pause, a change followed by "schließen" sends on
  close, an emptied field sends `{"due":""}` on blur; `@zuhause` typed into Tags on a todo that has it
  sends nothing and says "Das Todo hat diesen Tag schon." (was `tags_remove`); Zurückstellen to 20.11.
  then reload of `/next?task=…` shows the full detail with "zurückgestellt bis Fr 20.11." and the todo
  in no list, clearing the day brings it back to Nächste; Esc in Projekt sends `{"project":"Keller"}`
  and keeps the detail, a second Esc closes; an Enter with `isComposing` adds no note.
- **Gates:** `./run map` puts `DayInput.vue` in `fe/tasks`; `committingEnter` lives in `detailFields.js`
  so `shared/commands.js` keeps its fan-in baseline (no third allowance). `./run violations` — only the
  two declared cycles (`CYCLE-001`, `CYCLE-002`), nothing new;
  `./run surfaces` clean (no new route, key or env var); `make verify` 304 s, RED only for the
  pre-existing `RULE-GOV-002` (decay review overdue, out of scope) and `RULE-IDX-001`, which only said the index predated the last brief edit and is green after `make fix`; every other rule green.
- **Harness, by HTTP and Playwright (own user `m7-agent`):** each field writes the expected body
  (`{"due":…}`, `{"priority":""}`, `{"tags_add":["kunde"]}` / `{"tags_remove":["kunde"]}`,
  `{"depends":[…]}`, list moves with exact undo); "wöchentlich" without due → 400 shown as
  `Nicht gesendet: You cannot specify a recurring task without a due date.` with Erneut senden /
  Verwerfen; Nächste without a context asks, then `{"tags_add":["@zuhause"]}` and the move; Abhaken
  closes the detail with "Erledigt · Rückgängig"; an unknown `?task=` says "Dieses Todo gibt es nicht
  mehr."; 1024 px docks 208 / 456 / 360 px; phone sheet `role=dialog`, scrim closes it.
- **Keyboard:** click → focus on the heading; `Esc` → detail closed, focus back on the row; `e` → text
  field; `Esc` in it cancels and keeps the detail; `Esc` again closes; `Enter` on the cursor row opens;
  0 unnamed controls. axe-core 4.10.2: 0 serious/critical (desktop and phone).
- **Shots:** `build/m7/` (README there): desktop and phone, light and dark; one narrow (docked);
  Mehr on a Warten-auf todo; the refused edit; a deferred todo opened by link (desktop light, phone dark). Chromium only (speed mode); WebKit and narrow dark to M15.
- **Budgets:** not touched by this milestone beyond the list chunk; not measured (speed mode).
