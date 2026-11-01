# runway today: what the web app and the Android app do

Inventory for the five unified-UI proposals. Facts only, no design. Read on 2026-10-31 from
runway `11e1287` and runway-android `712d795`.

**Path prefixes used below**

| Prefix | Means |
|---|---|
| `web/` | `runway/frontend/src/` |
| `api/` | `runway/backend/` and `runway/ops/surfaces/openapi.json` |
| `kt/` | `runway-android/app/src/main/java/com/agenticreach/runway/` |
| `res/` | `runway-android/app/src/main/res/` |
| `acc/` | `runway-android/acceptance/drivers/` (critic-owned acceptance contracts) |
| `and/` | `runway-android/` root (`PLAN.md`, `docs/…`) |

---

## 0. The ten facts that matter most

1. **Two different products.** The web app is a full GTD client: every list, every field, projects, plans, settings. The Android app is a capture-and-glance companion with three tabs (Inbox, Nächste, Warten auf), a Quick Settings tile, a share target, launcher shortcuts and a home-screen widget. Android edits only a task's description. For anything else it opens the web app in a Custom Tab.
2. **Android's scope was a decision, not a gap.** `and/PLAN.md:33-42` (confirmed by Uli on 24.10.2026) lists as non-goals: project, tag, date or priority pickers on any capture surface (wording: "nie", never); clarifying, project planning and weekly review in the app; a native task detail. Priority order for conflicts (`and/PLAN.md:23-31`): 1 effortless capture, 2 effortless seeing, 3 no loss and no duplicate, 4 security, 5 everything else. "A feature that adds a tap or a wait to capturing is a defect."
3. **Language.** Android is German and its acceptance tests reject English UI strings. The web is mostly English with German islands (login, mobile row actions, task-form hints, the whole project-plan modal). `index.html` declares `lang="de"`.
4. **Look.** Web: Tailwind grays plus indigo as the action colour; Agentic Reach tokens appear only on the login card, the wordmark and the nav highlight. Android: Material 3 dynamic colour (wallpaper-derived), system font, no logo in the app. Its launcher icon is a white plus on blue `#1F4E79`, not the brand mark.
5. **Contexts behave differently.** Web filter = only tasks carrying that `@context`, applied to every list including Inbox (where it always empties the list). Android filter = tasks with that context **or with no `@` tag at all**, only on "Nächste". The web derives its context list from the tasks; Android uses a fixed preset (`@home, @computer, @work, @business`) with no editor.
6. **Undo and offline exist only on Android.** Every Android write goes through a local outbox, with a 6 s undo for capture, check-off and delete. The web completes and deletes immediately, with no confirmation and no undo. It has no offline mode and shows no load errors.
7. **No manual ordering anywhere.** The API sorts by Taskwarrior urgency, or by `entry`/`wait` for some lists. There is no position field. The only user-ordered list in the system is a project plan's "Ordnen" step (an array).
8. **The API offers more than either client uses:** project overview with counts, status and "stalled"; project status `active|on_hold|done`; GTD summary counters; tickler (tasks hidden until a date); daily and weekly review records; `tags_add`/`tags_remove`.
9. **Many Android labels and layout rules are pinned by acceptance contracts** (section 6.2): tab names, the field name `Neues Todo`, row accessibility strings, `Abhaken: …`, `In Inbox ✓`, `Rückgängig`, `Stand hh:mm`, the chip names, the widget header `Inbox N · fällig M`, ≥ 48 dp targets, no spinners, no bitmaps in the widget, and cold-start budgets in the hundreds of milliseconds. Changing them needs Uli plus the critic.
10. **The Android → web handoff is broken today.** Android opens `<web>/next?task=<uuid>` or `<web>/waiting?task=<uuid>`. The web ignores `?task=`, so the user lands on the list, and a browser that is not logged in ends on the Inbox after login.

---

## 1. The task model as the UI sees it

### 1.1 Fields

The API returns Taskwarrior fields (`api/` schema `Task`). Dates come back as UTC basic format `YYYYMMDDTHHMMSSZ` and are written as `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` in **server local time (Europe/Berlin)**.

| Field | Meaning (API) | Web: shown | Web: editable | Android: shown | Android: editable |
|---|---|---|---|---|---|
| `description` | free text, never parsed for tags; can be replaced, never cleared | every row (desktop 1 line truncated, mobile 2 lines) | task modal | every row (max 2 lines, ellipsis) | capture field, share card, Inbox "Bearbeiten" |
| `project` | name; dots nest (`home.garden`), each subproject is its own project | desktop: blue chip; mobile: grey text | modal (input + datalist of existing projects) | no | no |
| `tags` | without `+`. Status tags `next`, `waiting`, `someday`; contexts `@name`; any other tag | desktop: chips (`+tag`, colour per kind); mobile: no | modal: context chips, status-tag chips, free input | no (used only for filtering) | no |
| `priority` | `H`/`M`/`L` or none | desktop: dot (H red, M amber, L grey); mobile: no | modal: High/Medium/Low toggle | no | no |
| `due` | hard deadline | desktop "Due YYYY-MM-DD", mobile "Fällig YYYY-MM-DD", red when past | modal (date input, under "Mehr Optionen") | Nächste "Fällig" section, status `überfällig` / `fällig heute`; widget mark | no |
| `scheduled` | earliest start, or follow-up day; does not hide | no | modal | Warten auf: "Nachhaken heute / seit dd.mm." or "Wiedervorlage dd.mm." | no |
| `wait` | hides the task from every list until the date (tickler) | no | modal ("Wait until") | no | no |
| `until` | task expires and is deleted after the date | no | modal ("Expires") | no | no |
| `recur` | `daily`, `weekly`, `2d`, `3 weeks` …; **needs `due`**; a recurring task cannot lose due or recur (400) | desktop chip "↻ weekly" | modal: presets daily/weekly/monthly/yearly + free text | no | no |
| `depends` | UUIDs that must be done first | no | modal "Blocked by" checklist of all pending tasks | no | no |
| `annotations` | timestamped notes, add only | modal only (edit mode) | add in modal (edit mode only) | no | share text and long captures become the note, i.e. an annotation, on create |
| `start` | in-progress marker | green left bar + tint, mobile "läuft" with pulse, modal "In Progress" | Start/Pause in row (desktop), sheet (mobile) and modal | no | no |
| `urgency` | Taskwarrior score, server-computed | badge on every row | no | no | no |
| `status` | `pending`, `waiting` (= hidden by `wait`), `completed`, `deleted` | All Tasks with "Done": completed rows faded and struck through | complete, delete | no | check off (done), delete |
| `entry`, `end`, `modified`, `id`, `uuid` | metadata | no | no | `entry` sorts the Inbox; last 8 chars of `uuid` in row accessibility text | no |

### 1.2 GTD lists as the server defines them

Source: `api/app/services/task_service.py:41-69`.

| List | Rule | Order | Web | Android |
|---|---|---|---|---|
| Inbox `/gtd/inbox` | visible (no future `wait`) **and no tags and no project** | urgency desc | yes | yes, re-sorted newest `entry` first, plus unsent local captures |
| Next `/gtd/next` | visible and `+next` (any project) | urgency desc | yes | yes (server order), filtered by chip |
| Waiting `/gtd/waiting` | open, hidden ones included, and `+waiting` | urgency desc | yes | yes; follow-up due first |
| Someday `/gtd/someday` | visible and `+someday` | urgency desc | yes | no |
| Tickler `/gtd/tickler` | hidden by a future `wait` | `wait` ascending | no | no |
| Project `/gtd/projects/{name}` | visible, `project.is:name` (exact, subprojects excluded) | urgency desc | yes | no |
| Due (Android only) | `GET /tasks?due_before=<summary.today+1>`: every open task due today or earlier, `+next` or not | overdue first, then by due time | no | "Fällig" section |
| All `/tasks` | visible pending; `include_done=true` adds completed and hidden | urgency; completed newest first | yes | no |

Consequences designers should know:

- **Any tag or a project takes a task out of the Inbox.** Giving an inbox task only a context (`@computer`) moves it into *no* list at all. The summary counts these as `unclarified`. In the web they are visible only under All Tasks or their project.
- **Status tags are not exclusive.** A task can be `+next` and `+waiting` and then shows in both lists. Clarifying in the web means adding the tag `next`, `waiting` or `someday` by hand in the task form. There is no "move to" action.
- A task with a project but no status tag shows only in its project view and in All Tasks.
- **Two meanings of "waiting":** `status=waiting` in the API is Taskwarrior's "hidden by a future `wait` date". The GTD "Waiting For" list is the `+waiting` tag (`api/app/services/task_service.py:50-52`).

### 1.3 Urgency

Coefficients from `api/taskrc_template.txt:4-16`: `+next` +15, `+waiting` −3, `+someday` −5, blocking +8, blocked −5, due 12, scheduled 5, active (started) 4, priority 6, age 2, project 1, tags 1, annotations 1.

Web badge colours (`web/components/UrgencyBadge.vue:12-17`): ≥ 15 red, ≥ 8 amber, ≥ 0 green, < 0 grey, one decimal. Because of the +15 for `next`, practically every next action shows a **red** badge. Android never shows urgency.

### 1.4 Contexts (`@tags`) and the comma-joined quirk

- A context is a tag starting with `@`. Contexts have no endpoint of their own: they exist only as tags.
- **Quirk:** older tasks hold several contexts as *one* tag element, e.g. `"@home,@errands"`. Every reader must split on commas. The web does so in exactly one place, `web/shared/contextTags.js:1-16, 30-44`, after two shipped bugs. Android does the same in `kt/gtd/ContextFilter.kt:15-16`.
- The API now **refuses a comma in new tags** (`api/app/services/task_service.py:22-27`, `TAG_RE = ^(?:@|letter)[\w@.-]*$`). Legacy comma tags stay removable (`EXISTING_TAG_RE`, lines 29-35).
- Web form: splits a legacy tag into separate chips (`allTagParts`) and splits typed input on commas, tolerating a leading `+` (`parseTagInput`, `web/shared/contextTags.js:83-101`). Saving sends the full split set, which silently repairs a legacy tag.
- Web search matches the *raw* tag strings, so `home,work` finds `"@home,@work"` (`web/shared/taskFilters.js:34-51`).
- Allowed tag shape: starts with a letter, `_` or `@`; then letters, digits, `_`, `@`, `.`, `-`. No spaces, no commas, no leading digit.

**Context filter semantics differ:**

| | Web | Android |
|---|---|---|
| Rule | task carries the context (`taskHasContext`, `web/shared/contextTags.js:58-60`) | task carries the context **or carries no `@` tag** (`kt/gtd/ContextFilter.kt:18-22`, the runway skill's rule) |
| Where | sidebar "Context" list; filter persists across Inbox, Next, Waiting, Someday and All (not the project view) | chips on "Nächste" only; the "Fällig" section and "Warten auf" are never filtered |
| Context list | every `@` part of all pending tasks, sorted (`web/stores/tasks.js:19-24`); the task form adds base suggestions `@home @work @computer @phone @errands` (`web/components/TaskModal.vue:263-267`) | preset `@home, @computer, @work, @business` from UI prefs, **no editor** (`kt/ui/ContextSettings.kt:7-27`); "Alle" first |
| Toggle | click again to clear (`web/stores/tasks.js:26-28`) | exactly one chip selected, "Alle" = none |

### 1.5 Waiting and follow-up

- Waiting = `+waiting` tag. The API's `scheduled` doubles as the **follow-up day** (`waiting_followup_due` in the summary).
- Android "Warten auf": rows whose `scheduled` day (Europe/Berlin) is ≤ today come first, marked "Nachhaken heute" or "Nachhaken seit 25.10." with a 4 dp bar in the primary colour. Later follow-ups read "Wiedervorlage 29.10." in a quiet colour (`kt/ui/WaitingRows.kt:29-93`). The tab is never filtered by context.
- Web "Waiting For": a plain urgency-sorted list. It shows no follow-up date and does not use `scheduled`.

### 1.6 Someday

`+someday` tag, urgency −5. Web has a "Someday / Maybe" view ("Ideas to revisit later"). Android does not show someday tasks anywhere. The demo data gives one *project* the status `someday`, which the API does not have (section 6.5).

### 1.7 Projects, plans, status, stalled

- A project exists because a task names it **or** because it was created explicitly (`POST /projects`). `GET /gtd/projects` returns names only.
- `GET /gtd/projects/overview` (unused by both clients) returns per project: `pending`, `next`, `waiting`, `hidden` counts, `status`, `stalled`, `explicit`, `has_plan`.
- **Status** (`PUT /projects/{name}/status`, unused): `active` (default; needs a next action), `on_hold` (parked, never stalled), `done`. **Stalled** = active and no `+next`, nothing `+waiting`, nothing in the tickler.
- **Plan** (GTD Natural Planning Model, `GET/PUT /projects/plans/{name}`): `purpose`, `principles`, `vision`, `brainstorm[{id,text}]`, `organized[{id,text}]` (ordered), `updated_at`. Saving a plan also creates the project.
- Name rules (`api/app/models.py:15-20`): 1–100 chars; none of `( ) " ' \ : / ? # %` or control characters; no leading `+`, `-` or space; no trailing space. `overview` and `plans` are reserved. There is **no rename, no delete, no merge** endpoint.

### 1.8 Dates and the day boundary

- The server's "today" is Europe/Berlin (`/gtd/summary.today`). Android derives every day boundary from it (`kt/gtd/DueBoundary.kt:7-43`).
- The web formats dates by taking the UTC digits of the stored timestamp (`web/components/TaskRow.vue:155-159`, `TaskModal.vue:324-328`) and marks a date red when `new Date('YYYY-MM-DD') < now` (`TaskRow.vue:135-139`). By code reading (not run): a due date entered as a plain day is stored as 23:00 or 22:00 UTC the day before, so the web shows it **one day early** and red all day. Annotation dates are shown as `entry.slice(0,10)`, i.e. `20261031T1` (`TaskModal.vue:202`).

---

## 2. Web app (Vue 3, Tailwind, Pinia)

### 2.1 Shell and navigation

`web/components/AppShell.vue`. Breakpoint `sm` = 640 px.

| | Desktop (≥ 640 px) | Phone (< 640 px) |
|---|---|---|
| Frame | fixed left sidebar 224 px, white / gray-800 (`:4-49`) | top bar 56 px with hamburger, mark + "Runway", dark-mode emoji (`:52-63`); slide-in drawer 256 px with black/40 scrim (`:66-111`) |
| Brand | mark 28 px (light/dark variants, `web/components/BrandMark.vue`) + wordmark "Runway" (Space Grotesk 15/500, plum; `#e2d9f3` in dark, `:154-160`); username under it links to Settings | mark 24 px + wordmark |
| Nav | emoji + label: 📥 Inbox, ⚡ Next Actions, ⏳ Waiting For, 💭 Someday / Maybe, 📁 Projects, 📋 All Tasks (`:15-20`). Active item: coral 10 % tint + plum text (`web/components/NavItem.vue:22-47`) | same in the drawer; tapping closes it |
| Contexts | heading "CONTEXT" + one button per context `@name`; active = coral 12 % tint, plum text, coral `×` (`:22-36, 162-190`) | same in the drawer |
| Footer | "Sign out", settings gear, dark toggle ☀️/🌙 (`:38-48`) | drawer: "Sign out", gear (no dark toggle) |
| New task | round indigo "+" (36 px) in every list header | the same header "+" **and** a FAB 56 px indigo bottom-right, aria "Neuen Task anlegen", on `/inbox /next /waiting /someday /all` (`:119-125, 145-146`) |

Routes (`web/router/index.js:11-22`): `/login`, `/` → `/inbox`, `/inbox`, `/next`, `/waiting`, `/someday`, `/projects`, `/projects/:name`, `/all`, `/settings`. Guard: no token → `/login` (`:29-32`), with **no return path**.

### 2.2 Views

All list views share one composable (`web/views/_useTaskView.js`) and one layout: a white header with title (lg, bold), subtitle (xs, gray-400), the "+" button and a full-width search input "Search tasks…", then a full-width list with no cards and no max width.

| Route | Title / subtitle | Data | Specifics |
|---|---|---|---|
| `/inbox` | Inbox / "Uncategorised tasks to process" | `GET /gtd/inbox` | none |
| `/next` | Next Actions / "Things you can do right now" | `GET /gtd/next` | none |
| `/waiting` | Waiting For / "Delegated — waiting on someone else" | `GET /gtd/waiting` | none |
| `/someday` | Someday / Maybe / "Ideas to revisit later" | `GET /gtd/someday` | none |
| `/all` | All Tasks / "Pending tasks, sorted by urgency" | `GET /tasks` | "Done" toggle (title "Erledigte Tasks anzeigen/ausblenden") reloads with `include_done=true`; label "✓ Done" when on (`web/views/AllTasksView.vue:11-16, 42-45`) |
| `/projects` | Projects / "Select a project to see its tasks" | `GET /gtd/projects` (names only) | rows "📁 name ›" plus a 🗂 button "Projekt planen"; "+" opens an inline "Project name…" input with Create/Cancel; Create → `POST /projects`, then the plan modal opens (`web/views/ProjectsView.vue:5-49, 137-151`) |
| project detail | name / "Project tasks sorted by urgency", back "‹" | `GET /gtd/projects/{name}` | **local state, not the route**: `/projects/:name` is never read, so a deep link shows the list. Search covers description and tags only; the context filter does not apply. "+" opens a **blank** task form, so the project is not prefilled (`:52-67, 107-114, 133`) |
| `/settings` | "Account" | section 2.8 | none |
| `/login` | brand card | section 2.7 | none |

States: "Loading…" and "No tasks here." centred in gray-400 (`web/components/TaskList.vue:3-4`). `store.error` is set on a failed load but **never rendered**: a failed load looks like an empty list.

### 2.3 Task row

`web/components/TaskRow.vue`. Each row is full width with a 4 px left border (transparent; green when started) and a gray-100 bottom border.

| Element | Desktop (`:57-106`) | Phone (`:4-54`) |
|---|---|---|
| Leading | urgency badge | complete circle 24 px in a 48 px tap column; green filled when done (`:14-28`) |
| Text | description, 14 px medium, 1 line truncated | description, 15 px medium, 2 lines |
| Meta | project chip (blue), tag chips `+tag` (`next` indigo, `waiting` yellow, `someday` grey, `@ctx` purple, other grey), recur chip "↻ weekly" (violet), "Due YYYY-MM-DD" (red bold when past) | "läuft" with green pulse dot, urgency badge, "Fällig YYYY-MM-DD", project as grey text |
| Trailing | ▶/⏸ start/pause; ✓ done **only while started**; priority dot | ⋮ opens the action sheet (48 px) |
| Tap | whole row opens the task modal | body opens the task modal |
| Started | green-100 background, green left border | green-50 background |
| Done (All + Done) | 50 % opacity, struck through | same |

On desktop, a task that is not started can be completed only from the modal ("Mark Done"). **Desktop has no delete anywhere** (not in the row, not in the modal).

### 2.4 Task modal (create and edit)

`web/components/TaskModal.vue`. A centred card (max 512 px, radius 16) on desktop; a bottom sheet (max 90 dvh, top radius 16) on the phone, over a black/50 scrim. The description gets focus on open. Escape or a scrim click closes it.

- **Header** (`:7-39`): "New task" / "Edit task"; when started, "In Progress" with a pulse. Edit mode adds a Start/Pause button, a green "Done" while started, and ×.
- **Description \*** (textarea, 2 rows, "What needs to be done?"). It is required; the error reads "Description is required." (`:404`).
- **Project**: text input with a datalist of existing projects ("e.g. Home, Work").
- **Priority**: three toggle buttons High (red) / Medium (amber) / Low (grey); clicking again clears it.
- **Contexts "(@wo / womit)"**: chips of known plus base contexts (selected = violet-600). **Tags**: chips `+next`, `+waiting`, `+someday` (selected = indigo-600). Free input "@kontext oder tag + Enter" with an "Add" button. Current tags appear as removable chips (`:84-126`). Choosing `+next`/`+waiting`/`+someday` here is **the only way to clarify a task in the web**.
- **"Mehr Optionen (Datum, Wiederholung, …)" / "Weniger Optionen"**: dashed toggle, collapsed on create and expanded on edit (`:129-135, 300`). It contains:
  - Due, Scheduled, Wait until, Expires (native date inputs, 2×2 grid; dates only, no times)
  - Repeat: presets daily/weekly/monthly/yearly plus free text "or type: daily, weekly, 2weeks…". There is no check that due is set.
  - Blocked by: a scrollable checklist of all other pending tasks (`GET /tasks` on every open)
  - Notes / Annotations (edit only): list plus "Add note + Enter"
- **Footer**: "Mark Done" (green, edit only), "Save changes" / "Add task" (indigo).
- **Payload rule** (`web/shared/taskPayload.js`): on create, empty fields are `null`; on edit only changed fields are sent, and `''` clears. Tags and depends are always the full set (this overwrites tag changes made elsewhere; the API offers `tags_add`/`tags_remove` instead).
- **New-task context:** "+" from any list opens a blank form. A task created from "Next Actions" therefore lands in the Inbox unless the user adds `+next`. The list shows it optimistically until the reload.

### 2.5 Phone action sheet (⋮)

`web/components/TaskActionSheet.vue:1-51`. A bottom sheet with a grab handle and the task title. Actions: "Starten"/"Pausieren", "Bearbeiten", "Löschen" (red), then "Abbrechen". The sheet is in German, while the rest of the screen is English. **Löschen deletes at once** (`DELETE /tasks/{uuid}`), with no confirmation and no undo.

### 2.6 Project plan modal ("Plan: name")

`web/components/ProjectPlanModal.vue`, entirely German. Subtitle "Natürliche Planung · GTD". Five tabs with emoji (`:254-260`):

1. 🎯 **Warum**: Zweck, Werte & Prinzipien (textareas, with hints)
2. 🔭 **Vision**: Outcome-Vision (textarea)
3. 💡 **Ideen**: "Neue Idee + Enter" input with "Hinzu"; removable list; empty state "Noch keine Ideen — einfach losschreiben."
4. 🗂 **Ordnen**: own input; "Aus Brainstorming übernehmen"; HTML5 drag-and-drop with handle ⠿, numbering and ▲/▼ buttons (`:132-162`). This is the only user ordering in the system.
5. ▶ **Aktionen**: every organized item has "→ Task", which creates a task with the description and project, **no tags** (so it lands in no GTD list), and then shows "✓ erstellt" (`:176-191, 344-352`).

The footer has an explicit "Speichern" button (no autosave), "Gespeichert" for 2 s, and errors. Escape closes it **without saving**. The modal opens automatically after a project is created.

### 2.7 Login

`web/views/LoginView.vue`. The only screen fully in the brand: background `--ar-bg` (dark `#1a1228`), a white card with radius 18 and `--ar-shadow-lg`, the mark at 40 px, the title "Runway" (20/500, plum) and "by Agentic Reach" (JetBrains Mono 11, muted). Fields "Benutzername" and "Passwort" (radius 10, plum focus ring); Enter in the password field submits. A coral pill button reads "Anmelden" / "Konto erstellen". The toggle "Noch kein Konto? Registrieren" shows only while `GET /auth/registration-status` allows it (`:55-72`). A wrong password stays on the page with the server's message (`web/shared/sessionEnd.js`). After login the app goes to `/`.

### 2.8 Settings ("Account")

`web/views/SettingsView.vue`, white cards with radius 12, max width 672 px, English.

| Card | Content |
|---|---|
| Profile (`:8-41`) | initial avatar (indigo), username, "{role} account", Full name, Email address, Save, "Saved!" |
| Change Password (`:44-71`) | current, new and confirm fields, "Update password", inline errors |
| API Key (`:74-109`) | masked `••••` code field, reveal 👁 toggle, copy, "Regenerate key…" with inline confirm "Regenerate? The old key will stop working immediately." |
| Connect Claude (`:112-157`) | four numbered, copyable code steps from `web/shared/claudeConnect.js:96-127`: shell exports `RUNWAY_API_KEY`/`RUNWAY_URL` (key masked unless revealed), `claude mcp add …`, plugin install, the standing rule for `~/.claude/CLAUDE.md`; a skill .zip download link; notes on `runway_project:` and plugin update |
| MCP Server (`:160-185`) | endpoint `<origin>/api/mcp`; tabs **Claude Code / Claude Desktop / curl** with a copyable snippet |
| Admin only (`:188-235`) | Site Settings: toggle "Allow registration"; Users: list with role pill and Promote/Demote |

### 2.9 Every user action in the web

| Action | How |
|---|---|
| New task | header "+", phone FAB, key `n` (list views; in a project only inside one) (`web/views/_useTaskView.js:15-27`, `ProjectsView.vue:94-105`) |
| Focus search | key `/` |
| Close modal or plan | `Escape`, scrim click, × |
| Add tag / note / idea, create project | `Enter` in the respective input; `Escape` cancels project creation |
| Open or edit task | click the row (desktop) or tap its body (phone) |
| Complete | phone: circle; desktop: ✓ only while started; modal "Mark Done" / "Done". Immediate, no undo |
| Delete | phone ⋮ → "Löschen" only. Immediate, no undo, no confirmation |
| Start / pause | desktop ▶/⏸ in the row; phone ⋮ sheet; modal header. The list reloads |
| Filter by context | sidebar or drawer context button (toggle) |
| Search | client-side over the loaded list: description, project, raw tags (`web/shared/taskFilters.js:21-51`) |
| Show completed | All Tasks → "Done" |
| Plan project | 🗂 in the project list, or automatically after "Create" |
| Dark mode | ☀️/🌙 toggle |
| Sign out | sidebar or drawer "Sign out" |
| Touch gestures | **none.** The README claims "Swipe gestures"; there is no swipe or long-press code |
| Drag | only in the plan's "Ordnen" step |

### 2.10 Feedback, refresh, errors

- Data loads on view mount only. There is no refresh on focus, no polling, no pull-to-refresh and no freshness indicator.
- Optimistic: complete and delete drop the row from the list; start and stop flip the marker before the request (`web/stores/tasks.js:103-123`). Failed writes are not shown.
- A 401 on a request that carried the token drops it and reloads `/login` (`web/api/client.js:13-22`).
- There is no toast or snackbar system. The only feedback is inline "Saved!" / "Gespeichert" text in Settings and the plan modal.
- There is no PWA manifest and no offline support (`frontend/public/` holds only `favicon.svg`).

### 2.11 How the web looks today

| Aspect | Today |
|---|---|
| Colour | Tailwind defaults: page gray-50 / gray-900, surfaces white / gray-800, borders gray-100 / gray-700. Primary action **indigo-600** (buttons, FAB, focus rings). Status: green (done, started, Mark Done), amber, red, violet (contexts in the form, recur), blue (project chip), purple (`@ctx` chip), yellow (`+waiting`). Brand tokens (`web/style.css:6-24`) are used only by the login page, the wordmark, the nav and context highlight (coral tint, plum text) and the favicon (mark on a plum circle) |
| Type | Space Grotesk for everything (`body`), loaded from Google Fonts at **400 and 500 only** (`frontend/index.html:14-17`), while headings use `font-bold`/`font-semibold`, so the browser synthesises bold. Fraunces is loaded but unused. JetBrains Mono only on the login subtitle; code blocks use Tailwind's default mono stack |
| Sizes | titles 18 px bold, rows 14 px (desktop) / 15 px (phone), meta 12 px. Inputs are forced to 16 px on phones against iOS zoom (`web/style.css:36-42`) |
| Shape | rounded-lg (8) inputs and buttons, rounded-xl (12) cards, rounded-2xl (16) modals, pills for badges and chips, circle FAB |
| Icons | emoji for nav, plan tabs, project rows and the dark toggle; inline Heroicons-style SVG for actions |
| Motion | drawer slide 250 ms, fade 200 ms, pulse dot for "started", `active:scale-90` on icon buttons. Nothing else |
| Dark mode | class-based, toggled manually, stored in `localStorage.theme`, **defaults to light and ignores the system setting** (`web/composables/useDarkMode.js:3-7`). `theme-color` switches #FFFFFF / #1F2937; `index.html` starts it as plum `#3D2B5C` |
| Density | one task per row, full width, no grouping, no section headers, no counts anywhere |
| Title | `<title>Runway — Agentic Reach</title>`, `lang="de"` |

---

## 3. Android app (Kotlin, Jetpack Compose; Glance widget; plain Views for overlays)

Personal app for one Pixel 9 on Android 17, sideloaded (`and/PLAN.md:10-15`). minSdk 35, targetSdk 37. Package `com.agenticreach.runway`, app name **`runway`** (lowercase, `res/values/strings.xml:3`).

### 3.1 Surfaces at a glance

| Surface | Entry | Shows | Actions | Source |
|---|---|---|---|---|
| Main screen | launcher icon, shortcut "Inbox", notification, widget | tabs Inbox · Nächste · Warten auf, "Mehr" menu | section 3.2 | `kt/ui/MainScreen.kt` |
| Capture overlay | shortcut "Neues Todo", widget "+", tile over the keyguard | only the field "Neues Todo" docked at the bottom over the dimmed current screen | type, Enter, Rückgängig, Back or tap beside to close | `kt/capture/CaptureActivity.kt:19-33`, `OverlayViews.kt` |
| Tile "+ Todo" (unlocked) | Quick Settings panel | the same overlay as a QS dialog of the tile service (no activity start; the app underneath stays resumed) | as above | `kt/capture/CaptureDialog.kt:21-34`, `kt/tile/CaptureTileService.kt:23-37` |
| Lock screen | tile on the keyguard | the overlay with `showWhenLocked`: field only, no lists, no counters, no digits; before the first unlock after a reboot it asks for the PIN first | capture without unlocking | `runway-android/app/src/main/AndroidManifest.xml:53-70`, `kt/tile/CaptureTileService.kt:23-37` |
| Share target "runway" | Android share sheet (`text/plain`), pinned as a direct-share target | bottom card: description (subject or first line, ≤ 120 chars) + note preview (≤ 3 lines) + full-width "In Inbox" | one tap saves and closes; Back or tap beside cancels | `kt/capture/ShareActivity.kt`, `ShareViews.kt:28-35`, `kt/gtd/ShareSplit.kt` |
| Launcher shortcuts | long press on the icon | "Neues Todo" (overlay), "Inbox" (app) | none | `res/xml/shortcuts.xml` |
| Widget "runway Übersicht" | home screen; placed through Mehr → "Widget hinzufügen" | 4×3 cells, section 3.7 | refresh, cycle chip, "+", check off, undo, "+K weitere", badge | `kt/widget/RunwayWidget.kt` |
| Setup | first start, "neu einrichten" banner, after logout | login or key paste, server URL | section 3.8 | `kt/ui/SetupScreen.kt` |
| Task details | tap a row in Nächste or Warten auf | **the web app in a Chrome Custom Tab** | none in the app | `kt/ui/TaskDetails.kt` |
| Notifications | system | "N nicht gesendet"; silent "Neues Todo: Eingabefeld offen" while the tile dialog is open | tap → app inbox | `kt/sync/FailedNotice.kt`, `kt/tile/CaptureTileService.kt:139-146` |

### 3.2 Main screen

`kt/ui/MainScreen.kt:109-260`. It is edge to edge. There is no app bar, no title and no logo.

**Top row** (`:262-324`): three equal text tabs **Inbox · Nächste · Warten auf** (`titleSmall`; selected = primary colour with a 3 dp underline across the middle 60 %), then an overflow "Mehr" ⋮. A tab switch is one tap, also with the keyboard open. Back on Nächste or Warten auf returns to Inbox; Back on Inbox leaves the app (`:141-146`).

**Mehr menu** (`:285-294`): "Angemeldet als {user}" (text), "Widget hinzufügen" (only while no widget is placed), "Protokoll exportieren" (usage-log JSON through the system file picker), "Abmelden" (confirm dialog "Abmelden?" with "Key und Zwischenspeicher werden gelöscht. Nicht gesendete Todos bleiben …").

**Banners** above the content (`:326-469`): "Verbunden als {user}" (primary text, right after setup); error card "Key abgelehnt – neu einrichten" / "Gespeicherter Key nicht mehr lesbar – neu einrichten" (tap → setup); card "Altes Konto: N nicht gesendet" + "Sie gehen raus, sobald du dich mit dem alten Konto anmeldest." + "Verwerfen" (asks again in place: "N Todos endgültig verwerfen?" + "Abbrechen"). In landscape or at large font sizes they collapse to one 48 dp line, or into the notice slot next to the field.

**Inbox tab** (the start screen; `:476-718`):

- Line "Stand hh:mm": the time of the last successful refresh, or "Noch nicht geladen" (`kt/ui/InboxRows.kt:117-121`).
- List = server inbox ∪ local captures not yet sent, **newest first** by `entry` or capture time (`kt/gtd/Display.kt:3-18, 190-191`). Row: 48 dp circle "Abhaken" (22 dp ring), description (`bodyLarge`, max 2 lines), a status line only when not plain Inbox: "wartet auf Netz", "Nicht gesendet" (error colour), "wartet auf Setup" (`kt/ui/InboxRows.kt:30-33`). Rows are ≥ 52 dp with dividers.
- **Tap on a row** → dropdown at the row's right edge: "Bearbeiten", "Löschen"; for failed captures: "Erneut senden", "Bearbeiten und erneut senden", "Löschen" (`:703-716`).
- **Bearbeiten** replaces the bottom field with an edit area: title "Todo bearbeiten" (or "Bearbeiten und erneut senden"), "Abbrechen" and "Speichern"/"Senden", and the field "Beschreibung" prefilled. Enter saves. Only the description can be edited. Predictive back shrinks the area (`:762-827`, `kt/ui/CaptureParts.kt:243-253`).
- Empty: "Inbox ist leer". When new rows arrive above while the user reads lower down, a pill "↑ Neue Todos oben" appears (`:720-736`).
- **Bottom**: a notice bar (inverse surface, radius medium: "In Inbox ✓ · Rückgängig", "Gelöscht · Rückgängig", "Erledigt: {text} · Rückgängig", info texts), then the **always-focused capture field "Neues Todo"** (outlined, ≥ 56 dp, up to 3 lines, Enter = save). The keyboard opens on every open and resume (`:148-164`, `kt/ui/CaptureParts.kt:134-186, 280-355`).

**Nächste tab** (`:975-1131`): "Stand"; FlowRow of FilterChips **Alle, @home, @computer, @work, @business** (the check slot is always reserved so chips never move; they wrap at large font sizes instead of scrolling); divider. Section **"Fällig"** (all open tasks due today or earlier, unfiltered, overdue first with a red 4 dp bar, red ring and status "überfällig"; "fällig heute" in grey), empty "Nichts fällig"; section **"Nächste Aktionen"** (filtered `+next`), empty "Keine nächsten Aktionen". A due `+next` task appears in both sections. No keyboard on this tab.

**Warten auf tab** (`:866-946`): "Stand"; the whole `+waiting` set, follow-up due first (section 1.5); empty "Du wartest auf nichts".

Row rules on all three tabs: "Abhaken" with one tap; **swipe right = check off**; pull-to-refresh. A tap on a row opens the menu (Inbox) or the web details (Nächste, Warten auf).

### 3.3 Capture rules (every surface)

- Captures always go to `POST /inbox` **without project or tag** (`and/PLAN.md:225-228`).
- The description is trimmed and line breaks collapse into spaces. It is capped at 500 code points; the rest goes to the front of the note, which is capped at 32 KB (`kt/gtd/Capping.kt`).
- Share: description from the subject, else the first non-blank line, ≤ 120 chars, cut at a word with "…". The full text or URL becomes the note (`kt/gtd/ShareSplit.kt`).
- Enter saves, empties the field and keeps it open for the next item. "In Inbox ✓ · Rückgängig" appears at once, also offline.
- **A non-empty draft is never lost.** Leaving the screen (Home, second Back, call, kill, reboot) turns it into a capture. Tap beside, scroll or the first Back only closes the keyboard (`and/docs/done-bar.md:94`, `acc/P04-CONTRACT.md` section 4).
- Voice input is Gboard's microphone in the field; there is no custom voice feature (`and/PLAN.md:51-55`).
- Before any setup, captures wait unbound in the outbox for the first account.

### 3.4 Quick Settings tile "+ Todo"

Label "+ Todo", icon: a check circle with a plus (`res/drawable/ic_tile_add.xml`). The setup flow asks to add it (`requestAddTileService`) and shows a one-time hint "Zieh die Kachel + Todo in die erste Reihe" with explanation text and "OK". Unlocked, it shows a QS dialog; on the keyguard, `CaptureActivity` with `showWhenLocked`; before the first unlock, it asks for the PIN, then opens the field without another tap. While the dialog is open, a low-importance foreground notification "Neues Todo: Eingabefeld offen" keeps it alive.

### 3.5 Launcher shortcuts

"Neues Todo" opens the capture overlay (surface `shortcut`). "Inbox" opens the app (`res/xml/shortcuts.xml:5-30`). Icons are their own vectors (`ic_shortcut_new_todo`, `ic_shortcut_inbox`).

### 3.6 Share target

The sheet label is "runway". A dynamic sharing shortcut puts it in the sheet's top row from the first share. The card (`kt/capture/ShareViews.kt:28-35`) has a dimmed scrim, a docked card with radius 16 showing the description (title) and note preview, and a pill button "In Inbox" (primary, ≥ 56 dp, radius 28) that reads "In Inbox ✓" until the card closes. No keyboard. Works offline.

### 3.7 Home-screen widget "runway Übersicht"

`kt/widget/RunwayWidget.kt:61-136`, `res/xml/runway_widget_info.xml`. Default 4×3 cells, resizable in height only, **text only** (no bitmaps; one vector icon). Uses GlanceTheme dynamic colours and the system widget radius.

| Line | Content | Tap |
|---|---|---|
| Header (48 dp) | "Inbox N · fällig M" (16 sp medium); chip with the current context (secondaryContainer, radius 8); "+" (26 sp, primary; content description "+ Todo") | header = reload from the server (the app stays closed); chip = cycle Alle → @home → @computer → @work → @business → Alle; "+" = capture overlay |
| Rows (48 dp each, at most 8, as many as fit) | check ring (error tint when due), description 14 sp on 1 line, mark "überfällig"/"heute" (12 sp, error colour) | ring = check off with undo; the row itself does nothing |
| Bottom line | "+K weitere" (primary) / for 5.5 s "Erledigt · Rückgängig" / badge "Nicht gesendet" or "N nicht gesendet" (error colour) / "lädt …" / "Stand hh:mm" | "+K weitere" → app on Nächste with the same chip; badge → app Inbox; Rückgängig = undo |
| Not set up | "runway einrichten" | opens the app |
| Error fallback | "Widget konnte nicht angezeigt werden" + "Widget neu laden" (system neutral colours, `res/layout/widget_error.xml`) | redraw |

Refresh: on app start, after every sent action, every 30 min, and on a header tap.

### 3.8 Setup, onboarding, logout

`kt/ui/SetupScreen.kt:67-72`, `kt/ui/AppViewModel.kt:140-165`, `res/values/strings.xml:5-20`.

- Title "runway einrichten" (`headlineSmall`). Login way: "Benutzername", "Passwort" (masked), filled button "Anmelden". This calls `POST /auth/login` → `GET /auth/apikey` → `GET /auth/me`; password and JWT are discarded and only the API key is kept (Android Keystore, AES-GCM).
- Key way ("Key einfügen"): help text "Kopiere den API-Key in den runway-Einstellungen im Browser und füge ihn hier ein.", field "API-Key" (masked; "Key anzeigen"/"Key verbergen"), "Einfügen" (from the clipboard), "Verbinden". "Mit Passwort anmelden" switches back.
- "Erweitert" reveals "Server-URL", prefilled `https://runway.agentic-reach.com/api`. "Abbrechen" appears when re-setting up.
- Messages: "Verbinde …", "Benutzername oder Passwort falsch", "Key ungültig", "Server nicht erreichbar (…). Netz und Server-URL prüfen.", "Zu viele Versuche, in N s erneut", "Server-URL ungültig".
- After success: "Verbunden als {user}", then once each: the notification permission, the add-tile system dialog, and the hint dialog (`kt/ui/MainActivity.kt:225-257`).
- Logout keeps unsent captures, bound to their account. Signing in with another account shows the "Altes Konto" banner.

### 3.9 Context settings

Stored comma-separated in the UI prefs, preset `@home, @computer, @work, @business`. **There is no screen to edit them** (`and/docs/assumptions.md:640-642`). The selected chip starts at "Alle" and lasts while the process lives. The widget keeps its own chip.

### 3.10 Task details open in the browser

`kt/ui/TaskDetails.kt:9-61`. A tap on a Nächste or Warten auf row opens `<web origin>/next?task=<uuid>` or `/waiting?task=<uuid>` in a Custom Tab, where the web origin is the API base without `/api`. The web has **no task-detail route and does not read `?task=`** (`and/docs/assumptions.md:735-746`). If no browser is available: "Kein Browser für die Details gefunden". Back returns to the same tab and scroll position. Inbox rows never open details; they open the menu.

### 3.11 Offline and outbox, with their UI signals

`and/PLAN.md:156-212`, `kt/sync/*`, `kt/gtd/Display.kt`.

- **Every write goes to a local outbox first** (Room): kinds `inbox`, `done`, `edit`, `delete`. States: held → pending → sending → sent | failed | paused_auth (+ discarded, skipped).
- **Undo windows:** done and delete are held for **6 s** (`kt/sync/OutboxRepository.kt:299-300`; the done-bar says 5 s, and the app holds 6 s so that a tap at 5.0 s still works). Undoing a capture before sending deletes the row; after sending it queues a checked `DELETE`.
- Retries: linear 30 s backoff, capped at 5 min. 5xx: at most 8 attempts, then failed. 4xx: failed at once. 401: every row of the account pauses until a new setup. 429: waits for `Retry-After`. Before resending a capture, a duplicate check runs (`GET /tasks?status=all&q=`).
- **Display rule** (S9): server cache minus tasks with an open done or delete, plus unsent captures; a pending edit shows its local text. A refresh never brings back a task that was checked off optimistically.
- **Refresh:** inbox, next, waiting, summary and the due list load on every open and every resume, after each sent action, every 30 min and on pull. A failed list keeps its old rows and "Stand".

UI signals:

| Signal | Where |
|---|---|
| "Stand hh:mm" / "Noch nicht geladen" | top of every tab; widget bottom line |
| Row status "wartet auf Netz" (unsent), "Nicht gesendet" (failed, error colour), "wartet auf Setup" (paused for auth) | inbox rows |
| "Abhaken nicht gesendet" / "Nicht gesendet" | Nächste and Warten auf rows whose done failed |
| Menu "Erneut senden", "Bearbeiten und erneut senden" | failed inbox rows |
| Badge "Nicht gesendet" / "N nicht gesendet" | widget |
| One bundled notification "N nicht gesendet" / "Antippen, um sie zu bearbeiten oder erneut zu senden" (channel "Nicht gesendet"), posted only when N changes | system |
| Banners "neu einrichten", "Altes Konto: N nicht gesendet" | main screen |
| Info notices "Rückgängig nicht mehr möglich", "Erneut senden nicht möglich", "Protokoll gespeichert"/"… nicht gespeichert" (4 s) | notice bar |
| **Never:** spinners longer than 1 s, error texts for being offline, blocking loaders | everywhere |

### 3.12 Gestures, keyboard, back

| Gesture | Effect | Source |
|---|---|---|
| Tap the circle "Abhaken" | check off (held 6 s, undo bar) on every row, including inbox rows (2-minute rule), keeping the keyboard | `kt/ui/MainScreen.kt:1133-1156` |
| Swipe right on a row | check off past 35 % of the width (min 96 dp); primaryContainer background with ✓; haptic tick at the threshold; swipe left does nothing | `kt/ui/ListGestures.kt:41-113` |
| Pull down | refresh (Material 3 indicator, only while pulling or refreshing) | `ListGestures.kt:115-135` |
| Tap a row | Inbox: menu; Nächste and Warten auf: web details | none |
| Scroll, tap outside, first Back | close the keyboard and keep the draft | `MainScreen.kt:471-475` |
| Back | from Nächste or Warten auf → Inbox; while editing: keyboard first, then cancel (predictive back preview) | `kt/ui/CaptureParts.kt:188-226` |
| Hardware Enter | submit capture or edit | `CaptureParts.kt:161-168` |
| No long press, no multi-select, no drag | none | none |

### 3.13 How Android looks today

| Aspect | Today |
|---|---|
| Colour | `dynamicLightColorScheme`/`dynamicDarkColorScheme` (Material You from the wallpaper), `kt/ui/MainActivity.kt:194-202`. Overlays read the same system roles from `android.R.color.system_*` (`kt/capture/OverlayViews.kt:33-63`). **No brand colours.** Overdue = `error` (red); follow-up due = `primary`; notices = `inverseSurface` |
| Type | Material 3 default typography (system font): tabs `titleSmall`, rows `bodyLarge`, status `labelMedium`, section headers `titleSmall` in primary |
| Brand | app name "runway" lowercase; **no logo in the app**; launcher icon = white plus over a line on `#1F4E79` blue (`res/drawable/ic_launcher_foreground.xml`, `res/values/colors.xml:3`), with a themed monochrome variant |
| Shape | M3 small/medium shapes; field radius 8 dp; overlay and share cards radius 16 dp; share button pill |
| Density | 48 dp controls, rows ≥ 52 dp, dividers `outlineVariant`, no cards for rows |
| Motion | swipe follow plus settle animation, predictive back, pull indicator, system translucent window animation for overlays. **No custom transitions** |
| Dark mode | follows the system only; no in-app toggle |
| Accessibility | every control has a contentDescription and ≥ 48 dp; no overflow at 150 % font; rows cut at the list edge leave the accessibility tree |

### 3.14 Product rules Android was built against

From `and/PLAN.md` and `and/docs/done-bar.md` (frozen; only Uli may change it):

- Time budgets (Pixel 9): tile tap → keyboard up, warm ≤ 700 ms / cold ≤ 1200 ms; app icon → inbox with field focused and keyboard up, ≤ 800 / 1500 ms; "In Inbox ✓" ≤ 300 ms after Enter; share dialog ≤ 600 ms; check-off row gone ≤ 1 s.
- For those budgets the tile and shortcut overlay are **plain Views, not Compose** (`kt/capture/CaptureActivity.kt:30-32`), and the widget is text-only because of Android 17's RemoteViews bitmap limit (`and/PLAN.md:75-76`).
- ≥ 5 inbox rows fully visible with the keyboard open, so there is no tall top bar while typing (`acc/P04-CONTRACT.md` section 1).
- The main action sits in the lower half; "In Inbox" never sits under the keyboard (U13).

---

## 4. Parity table

| Feature | Web | Android |
|---|---|---|
| Quick capture (one field, Enter, stays open) | no: modal form via "+", FAB, `n` | **yes**: always-focused field at the bottom, Enter |
| Capture with project, tags, dates, priority | yes (form) | no, by rule |
| Capture from outside the app (tile, lock screen, share, shortcut, widget "+") | no | yes |
| Capture note on create | no (annotations only after create) | yes (share text and overflow become the note) |
| Undo after capture | no | 6 s |
| Inbox | yes, urgency order | yes, newest first, includes unsent |
| Clarify (inbox → next, waiting, someday, project) | only by editing tags and project in the form | no (non-goal) |
| Next actions | flat list | "Fällig" + "Nächste Aktionen" sections |
| Due / overdue overview | no (red date in rows only) | "Fällig" section, widget header and marks |
| Waiting for | flat list | follow-up due first, "Nachhaken" marks |
| Someday / maybe | yes | no |
| Tickler (hidden by `wait`) | no (only via All + Done) | no |
| Projects list | names only | no |
| Project tasks | yes | no |
| Project plan (5 steps) | yes | no (non-goal) |
| Project status, stalled | no (API yes) | no |
| All tasks / completed | yes | no |
| Weekly or daily review | no (API and Claude skill only) | no (non-goal) |
| Summary counts or badges | none | widget header "Inbox N · fällig M" |
| Search | client-side over the loaded list | no |
| Context filter | sidebar, strict, all lists | chips on Nächste, lenient; widget chip |
| Context list | derived from tasks | fixed preset, no editor |
| Complete | phone circle; desktop only when started or via the modal; no undo | circle or swipe on every row and in the widget; 6 s undo |
| Delete | phone ⋮ only; immediate; desktop none | inbox rows only; 6 s undo |
| Edit description | modal | inbox rows only (in place) |
| Edit other fields | modal | no; Nächste and Warten auf rows open the web in a Custom Tab |
| Start / pause (in progress) | yes | no |
| Priority, project, tags, recur, urgency shown | desktop yes; phone urgency, due and project | no |
| Annotations view and add | modal (edit) | no |
| Dependencies, recurrence, until, wait | modal | no |
| Offline | no | full outbox, cache, "Stand" |
| Refresh | on view mount | resume, pull, 30 min, after send |
| Freshness indicator | no | "Stand hh:mm" |
| Error visibility | none (failed loads look empty) | row statuses, badge, notification, banners |
| Swipe, pull-to-refresh | no | swipe right = done; pull = refresh |
| Keyboard shortcuts | `n`, `/`, Esc, Enter | hardware Enter |
| Dark mode | manual toggle, default light | follows the system |
| Login | username + password (+ register) | password login **or** paste API key; server URL under "Erweitert" |
| Profile, password, API key, Claude/MCP connect, admin | yes | no |
| Logout | "Sign out", immediate | "Abmelden" with confirmation; unsent work kept |
| Notifications | none | failed bundle; tile foreground |
| Home widget, QS tile, share target, shortcuts | no | yes |
| Deep link to a task | `/projects/:name` and `?task=` are not honoured | sends `/next?task=…` and `/waiting?task=…` |
| UI language | English with German parts | German |

---

## 5. Inconsistencies between the two

### 5.1 Naming

| Concept | Web | Android |
|---|---|---|
| Product name | "Runway" (`<title>` "Runway — Agentic Reach", "by Agentic Reach") | "runway" |
| The thing | "task" ("New task", "Add task", "Neuen Task anlegen", "→ Task") | "Todo" ("Neues Todo", "+ Todo", "Todo bearbeiten") |
| Next list | "Next Actions" | tab "Nächste", section "Nächste Aktionen" |
| Waiting list | "Waiting For" | "Warten auf" |
| Someday | "Someday / Maybe" | not present |
| Complete | "Mark Done", "Done", aria "Als erledigt markieren" | "Abhaken", notice "Erledigt" |
| Edit | "Edit task", sheet "Bearbeiten" | "Bearbeiten", "Todo bearbeiten" |
| Delete | sheet "Löschen" (phone only) | "Löschen", notice "Gelöscht" |
| Due | "Due YYYY-MM-DD" (desktop), "Fällig YYYY-MM-DD" (phone) | "Fällig" section, "überfällig", "fällig heute", widget "heute" |
| Scheduled | "Scheduled" | "Nachhaken …" / "Wiedervorlage …" (only in Warten auf) |
| In progress | "In Progress", "läuft", "Start/Pause", "Starten/Pausieren" | not present |
| Contexts heading | "Context" (sidebar), "Contexts (@wo / womit)" (form) | no heading; "Alle" for all |
| Sign out | "Sign out" | "Abmelden" |
| API key | "API Key" | "API-Key" |
| Cancel | "Cancel" (projects, settings), "Abbrechen" (sheet) | "Abbrechen" |
| Save | "Save changes", "Save", "Speichern" (plan) | "Speichern", "Senden" |
| Empty states | "No tasks here." | "Inbox ist leer", "Keine nächsten Aktionen", "Nichts fällig", "Du wartest auf nichts" |
| Loading | "Loading…" | no spinner; "Stand hh:mm", "lädt …" (widget) |

Mixed language **inside** the web: English shell, views, modal and settings; German in login, phone row ("läuft", "Fällig"), phone action sheet, FAB aria label, form hints ("(@wo / womit)", "@kontext oder tag + Enter", "Mehr/Weniger Optionen"), the All Tasks toggle title, "Projekt planen" and the whole plan modal.

### 5.2 Flows

- **Capture:** web = a form (description required, everything else optional) via `POST /tasks`, which can bypass the Inbox. Android = a single always-open line via `POST /inbox`, which always lands in the Inbox.
- **Complete:** web = instant, irreversible, and on desktop only via the modal unless the task is started. Android = one tap or swipe anywhere, a 6 s undo, then sent.
- **Delete:** web = phone-only, instant and irreversible. Android = Inbox only, with undo.
- **Edit:** web edits every field. Android edits only the Inbox description and otherwise hands off to the web. That handoff is broken: `?task=` is ignored, and an unauthenticated Custom Tab ends at the Inbox after login.
- **Order:** web sorts every list by urgency. Android sorts the Inbox newest first, "Fällig" overdue first and then by due time, Waiting follow-up first. The same Inbox appears in different orders on the two clients.
- **Context filter:** strict and global (web) versus lenient and on one tab (Android). The context sets differ as well.
- **Due:** web marks overdue by comparing a UTC date with now (and probably shows the day before). Android uses the Berlin calendar day against `summary.today`.
- **Waiting follow-up** exists only on Android. **Someday, projects, plans, All, settings and in-progress** exist only on the web.
- **Freshness:** Android always shows how old the data is. The web never does and never reloads on its own.
- **Dark mode:** a manual web toggle that defaults to light, versus the system setting on Android.
- **Post-create:** web shows nothing. Android shows "In Inbox ✓ · Rückgängig".

### 5.3 Look

- Palette: web = Tailwind gray and indigo plus seven accent hues for chips. Android = wallpaper-derived Material You. Neither uses coral, plum, cream backgrounds or the yellow accent dot of the brand outside the web login and nav tint.
- Brand mark: present in the web sidebar, login and favicon. Absent in the Android app; the Android launcher icon is a different blue icon.
- Type: Space Grotesk (with synthetic bold) on the web; the system font on Android.
- Iconography: emoji (web nav, plan tabs, dark toggle) versus Material vectors (Android).
- The completion control: web phone has a 24 px circle that turns green when done, web desktop a ✓ only while started. Android has a 22 dp ring in every row and in the widget.
- Tabs versus sidebar: web uses a sidebar or drawer with six destinations; Android uses three text tabs plus a menu.
- Meta density: web desktop shows chips for project, tags, recur, priority and urgency. Android shows only the description plus one status line.

---

## 6. Constraints any design must respect

### 6.1 What the API can and cannot do

**Cannot** (no endpoint or field):

- **Manual ordering** of tasks or projects (no position field; lists come back urgency-sorted, the tickler by `wait`). The only stored order is a plan's `organized` array.
- Rename, delete or merge a project. Contexts and areas as entities. Subtasks (only `depends`). Attachments. Comments other than annotations.
- **Reopen a completed task** or undelete a deleted one. Undo must be a client-side hold before sending, as Android does.
- Edit or delete an annotation (add only). Clear a description.
- Real-time updates (no push, no websocket): polling or refresh only.
- Search beyond a case-insensitive substring of the description (`q`, ≤ 200 chars). Annotations, projects and tags are not searched server-side.
- Parse inline syntax: the description is never parsed, so any "`@ctx +next` in the text" quick-add must be parsed by the client.
- Tags with commas or spaces, or starting with a digit (400). Project names with `( ) " ' \ : / ? # %` or longer than 100 chars, or named `overview` or `plans`.
- `recur` without `due` (400); removing `due` or `recur` from a recurring task (400).
- Mutual exclusivity of `next`, `waiting` and `someday`: the server does not enforce it.
- An idempotency key: Android de-duplicates on the client.

**Can, but no client uses it yet:**

| Endpoint | Gives |
|---|---|
| `GET /gtd/projects/overview` | per project: open, next, waiting and hidden counts, `status`, `stalled`, `has_plan`, `explicit` |
| `PUT /projects/{name}/status` | `active` / `on_hold` / `done` |
| `GET /gtd/summary` (Android uses only `today`, `overdue`, `due_today`) | `inbox`, `inbox_oldest_entry`, `overdue`, `due_today`, `next`, `waiting`, `someday`, `hidden`, `waiting_followup_due`, `scheduled_passed`, `tickler_returned_today`, `unclarified`, `stalled_projects[]`, `last_review`, `today`; optional `tag` scope |
| `GET /gtd/tickler` | tasks hidden by `wait`, soonest first |
| `GET/POST /gtd/review` | when a `daily` or `weekly` review last happened, per scope (e.g. `@work+ar`) |
| `PUT /tasks/{uuid}` with `tags_add` / `tags_remove` | change single tags without overwriting the set |
| `GET /tasks` filters | `status`, `project`, `tag` (AND, ≤ 10), `due_before/after`, `scheduled_before`, `completed_since`, `q`, `limit` ≤ 500 |
| `GET /tasks/{uuid}` | one task with annotations (would back a web detail route) |
| `POST /inbox` | `{description, note, priority}`; the note becomes an annotation |

Auth: the web keeps a JWT in `localStorage`. Android, MCP and agents use the per-user API key (`X-Api-Key`). Users are isolated, and admins exist (registration toggle, roles).

### 6.2 Android acceptance contracts: labels and layout that cannot change freely

`acceptance/` belongs to the critic and `docs/done-bar.md` is frozen by SHA-256 (`runway-android/acceptance/FROZEN`); only Uli changes the bar. Drivers find elements **by exact German text or contentDescription** in uiautomator dumps. A renamed label fails the round. `res/values/strings.xml` marks the pinned blocks: lines 5, 44, 48 and 83-84.

**Pinned strings**

| Where | Exact text (contract) |
|---|---|
| Setup (`acc/P03-CONTRACT.md` §2) | `Benutzername`, `Passwort` (masked), `Anmelden`, `Erweitert`, `Server-URL` (hidden until Erweitert, prefilled), `Key einfügen`, `API-Key`, `Einfügen`, `Verbinden`; errors containing `falsch`, `ungültig`, `Zu viele Versuche, in N s erneut`; `Verbunden als <user>`; hint containing `Zieh die Kachel + Todo in die erste Reihe` + `OK` |
| Main screen | field contentDescription `Neues Todo` (bottom, above the keyboard); tabs `Inbox`, `Nächste`, `Warten auf`; menu `Mehr` with `Abmelden`, `Protokoll exportieren`, `Widget hinzufügen`; banners containing `neu einrichten`, `Altes Konto: N nicht gesendet` + `Verwerfen` |
| Freshness | a node exactly `Stand hh:mm` on every tab and in the widget |
| Row accessibility text | exactly `<description>, <status>, ID <last 8 of uuid>` (or `lokal <8>`). Status vocabulary: Inbox `Inbox` / `wartet auf Netz` / `Nicht gesendet` / `wartet auf Setup`; Nächste `überfällig` / `fällig heute` / `Nächste`; Warten auf `Nachhaken fällig` / `Wartet` |
| Check-off control | contentDescription exactly `Abhaken: <description>` in **every** row (inbox rows included) and in widget rows |
| Notices | `In Inbox ✓` + `Rückgängig`; `Erledigt` + `Rückgängig` (must **not** repeat the row's accessibility string); `Gelöscht` |
| Inbox row menu | `Bearbeiten`, `Löschen` with one tap (no long press); edit field `Beschreibung`; failed rows `Erneut senden`, `Bearbeiten und erneut senden` |
| Nächste (`acc/P08-CONTRACT.md` §1) | chips exactly `@home`, `@computer`, `@work`, `@business`, `Alle`, all fully visible without scrolling at font scale 1.0 and 1.5, exactly one selected; heading exactly `Fällig` at the top; the next section's heading must **not** be the bare word `Nächste` (today `Nächste Aktionen`) |
| Warten auf (`acc/P10-CONTRACT.md`) | a visible mark starting with `Nachhaken` on due rows, never on others |
| Widget (`acc/P09-CONTRACT.md`) | header exactly `Inbox N · fällig M` (U+00B7); chip from the same five, tap = next in that order; `+K weitere`; `+` with content description `+ Todo`; badge `Nicht gesendet` / `N nicht gesendet`; fallback `Widget neu laden`; the receiver label must not be `runway`, `Nächste` or `Inbox` |
| Tile and shortcuts (`acc/P05-CONTRACT.md`) | tile label starts with `+ Todo` (class `tile.CaptureTileService` kept); shortcuts `Neues Todo`, `Inbox` |
| Share (`acc/P06-CONTRACT.md`) | sheet label exactly `runway`; button exactly `In Inbox`; German only, no English words such as Cancel, Save, Done, Share, Undo |

**Pinned layout and behaviour**

- Inbox: field at the bottom directly above the keyboard, in the lower half; ≥ 5 one-line rows fully visible with the keyboard open (no tall top bar while typing); rows ≥ 48 dp; text max 2 lines with ellipsis (`testTag("inbox-row-text")` is the only node allowed to ellipsize); newest first; a fresh capture on top at once and visible exactly once.
- On every open: field focused **and** keyboard shown with no extra tap. Nächste and Warten auf open **without** a keyboard.
- **No progress spinner** (`ProgressBar`) of the app visible ≥ 1 s, ever, including while offline. Freshness is shown with `Stand`.
- A checked-off row leaves the accessibility tree ≤ 1 s: **no exit fade that keeps the node**.
- Overdue rows must be measurably red (pixel hue test, light **and** dark); "fällig heute" clearly less red.
- Swipe right across a row checks off; vertical scrolls must never check off; pull-to-refresh on every list. Nächste scrolls vertically only (no horizontal list).
- Tapping a Nächste or Warten auf row opens a **Custom Tab** (not the full browser, no chooser) whose URL path starts with a web route (`/inbox`, `/next`, `/waiting`, `/someday`, `/all`, `/projects`) and carries the uuid in the path or query.
- Capture overlay: only the field (plus notice, `Rückgängig` and `Schließen`); over the keyguard nothing else (no lists, no counters, no digits).
- Widget: 4×3 default, vertical resize, ≤ 8 rows of 48 dp, no scrollable list, no row cut off, `views_bitmap_memory=0` (**no bitmaps: no rendered 3D, no images**), luminance < 0.35 in dark and > 0.6 in light.
- Every control ≥ 48 dp with a contentDescription; no visual overflow at font scale 1.5; follows the system dark and light setting; German only.
- Kept class names: `ui.MainActivity` (the critic's Compose test launches it), `tile.CaptureTileService`.
- Time budgets in section 3.14. Cold-start paths (tile, shortcut, icon) cannot carry heavy rendering.

### 6.3 Web contracts

- `frontend/tests/` pins pure logic only (`web/shared/`): context splitting, filtering, payload diff, session end, the MCP snippets (the tab names **Claude Code / Claude Desktop / curl** are tested), and the Connect Claude steps, which are pinned verbatim against the skill's `setup.md`. Components are untested by design (ADR 0007).
- Architecture (`runway/AGENTS.md:57-73`, `frontend/AGENTS.md`): features `fe/tasks`, `fe/projects`, `fe/identity` never import each other (one recorded exception: projects reuses the task list); pure rules about tags, filtering and sorting belong in `src/shared/`.
- **Routes used from outside:** Android builds `/next?task=` and `/waiting?task=`, and its contract accepts any of `/inbox`, `/next`, `/waiting`, `/someday`, `/all`, `/projects[/name]`. Keep them, or redirect them.
- The settings page is where a person copies the API key for Android's "Key einfügen" and the MCP setup for Claude.

### 6.4 Brand assets versus today

`shared/brand/tokens.css` is the Agentic Reach kit: coral `#FF7A6B` (primary), plum `#3D2B5C`, yellow `#F4C84A` ("single dot, never as fill"), ink `#1B1428`, warm off-white `#FBF6EE`; Space Grotesk, Fraunces italic, JetBrains Mono; radii 8/12/18/22/pill; motion 120/180/260 ms with `cubic-bezier(.2,.8,.2,1)`. The web's `style.css:6-24` already carries a subset (no serif, no spacing or motion scale). Android uses none of it.

### 6.5 Demo data note

`shared/data/tasks.js` uses the contexts `@computer @anrufe @zuhause @unterwegs @buero`, not Android's preset, and gives the project "Podcast" the status `someday`, which the API does not know (it has `active`, `on_hold`, `done`). A prototype that shows the Android chips should remember that the acceptance tests pin chips to whatever the context setting holds (defaults `@home, @computer, @work, @business`).
