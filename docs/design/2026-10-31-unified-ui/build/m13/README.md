# M13 — projects (brief 0060)

Taken 2026-11-11 on an own dev harness (real backend, Taskwarrior 3.5.0, **06 demo set**): the backend on **:8047**
over a fresh data root and users database in the session's scratchpad, the Vite dev server on **:5219** proxying to
it (started from `frontend/`, so Tailwind finds its content for the old UI's shot), both started for this acceptance
and stopped after it; the backends on :8000, :8010 and :8031 and the Vite server on :5197 belong to other sessions and
were not touched. The production build (`vite build` into the scratchpad) for the budgets. Users `m13-a`, `m13-s1`,
`m13-s2`, `m13-ph`, each seeded with the 06 demo set shifted from 31.10. to 11.11. and 06's day plan (M11), each
project created with its outcome as purpose and vision, plus for M13: Garten resting (`on_hold`), "Messestand-2026"
finished (`done`), and a full plan for Website-Relaunch (Zweck, Werte, a two-line vision, four ideas, three ordered
steps). Podcast has only an Irgendwann todo, so it is the stalled one. Chrome (GPU on, as `shared/tools/shot.mjs`)
and Playwright WebKit, driven by scratch Playwright scripts with real clicks and keys. Desktop 1440×900, narrow
1024×768, phone 412×915 @2x. The shots use the untouched user `m13-ph`.

06 has no shot of these pages (its README: "Projekte, Rückblick, Einstellungen and the plan document are 03's, only
moved to message keys"), so 06's `index.html` was rendered at 1440×900 for the comparison and the renders are kept
here: `06-projects-desktop-light.png` (`#projects`), `06-project-desktop-light.png` (`#projekt/Website-Relaunch`),
`06-project-noplan-desktop-light.png` (`#projekt/Podcast`, a project without a plan in 06's data). Rows and margin
also against `06-kombination/shots/web-desktop.png`.

## Shots

| Shot | What it shows |
|---|---|
| `projects-desktop-{light,dark}.png` | Projekte: `// Projekte · 6 aktiv · 1 steckt fest`, "Was du *bewegst*"; Aktiv with Podcast first (yellow ring, "steckt fest", "0 nächste · 0 wartet"), the others by name, each "mit Plan" or "noch kein Plan"; "+ Projekt `n`"; Ruht (Garten), Abgeschlossen (Messestand-2026); the margin's panels (M12), "3 von 7" once |
| `projects-narrow-{light,dark}.png` | Projekte at 1024 px: no margin column, the rows' counts column kept |
| `projects-reduced-desktop-light.png` | Projekte with reduced motion: the margin's lens (the one view of M13 that has it) as M12's flat SVG lens, no canvas |
| `projects-new-desktop-light.png` | `n`, "Büro/Umzug", `⏎`: the name field refuses it with the API's rule ("Ohne diese Zeichen: …"), nothing sent |
| `project-desktop-{light,dark}.png` | `/projects/Website-Relaunch` (the deep link): "← Projekte", `// Projekt · aktiv · 1 nächste · 1 wartet`, the name, the vision's first line in Fraunces, Status: Ruhen lassen · Abschließen · Nächste Aktion festlegen `n` (quiet pills, as 06); Nächste Aktionen and Warten auf; the plan document in the margin column |
| `project-stalled-desktop-light.png`, `project-reduced-desktop-light.png` | Podcast (no lens: the plan holds the margin): 06's callout "**Steckt fest.** Kein nächster Schritt und nichts, worauf du wartest." with "Nächste Aktion festlegen" (coral), Ruhen lassen, Abschließen (quiet); "Keine nächste Aktion"; reduced motion the same |
| `project-add-desktop-light.png` | `n`, a text, `⏎` without a context: "Erst einen Kontext wählen (Alt 1–5)", the contexts as chips, nothing sent; the field's focus is the row's marker rule, yellow only while the text field has the focus (review) |
| `project-ask-desktop-light.png` | typed at the end of the vision, `Esc`: "Änderungen am Plan verwerfen?" Verwerfen · Weiter bearbeiten (focused); "Nicht gespeichert", Speichern in coral |
| `project-narrow-light.png`, `project-narrow-plan-dark.png` | 1024 px: no margin column; the plan under the todos |
| `projects-phone-{light,dark}.png`, `project-phone-{light,dark}.png`, `project-phone-plan-light.png` | the phone: Projekte without the counts column; a project with the callout; the plan under the todos (no key hint on touch) |
| `projects-webkit-light.png`, `project-webkit-light.png`, `project-phone-webkit-light.png` | WebKit, desktop and phone |
| `project-zoom200-light.png` | 200 % zoom at 1440×900 (a 720×450 viewport): the phone layout, no horizontal scroll |
| `old-projects-unchanged.png` | without `?ui=neu`: the old "Projects" view as before |
| `06-*.png` | 06's prototype rendered for the comparison (above) |

## Fixed after looking at the shots

- **The status pills were bordered pills**; 06 draws them as quiet pills (`pill quiet`, `renderHead('project')`), so
  next to the coral callout action and the "Nächste Aktion festlegen" link they read as three equal buttons.
  `ProjectStatus.vue` now passes `quiet` (still 44 px high). Re-shot: every `project-*` shot.
- **The next-action field drew the global focus outline** (`.rw :focus-visible`, a 2 px box around the input inside a
  row that already marks itself with the yellow rule); the capture line, the palette and the top line's search turn
  it off for their inputs. `NextActionAdd.vue` and the plan's text fields (`PlanDocument.vue`, whose rule turns yellow
  on focus) now do the same. Re-shot: `project-add-desktop-light`.
- **"Nicht gespeichert" sat 6 px in** when it wrapped under Speichern · Verwerfen in the 315 px column; the extra
  margin is gone (the bar's gap spaces it). Re-shot: `project-ask-desktop-light`.
- Harness, not code: the first `project-ask` shot clicked into the middle of the vision and typed there, and the old
  UI's shot came out unstyled because the first Vite run was started outside `frontend/` (Tailwind's `content` globs
  are relative to the working directory). Both re-taken.

## Review (2026-11-11)

Thirteen findings of the review, each checked on this harness (`review.mjs`, user `m13-r1`, seeded like the others)
or in the code; ten fixed, three answered in the docs. The shots were taken again afterwards, all twenty-three.

- **Fixed — undo of a step's next action:** "→ Nächste" on step 01, `Alt 1` `⏎`, Rückgängig → `POST /tasks`, then
  `DELETE /tasks/…`; the step read "✓ angelegt" before, now "→ Nächste" again (3 of 3 buttons back).
- **Fixed — a save that answers after the page moved on** (`usePlan`): a `PUT` held 1.5 s and answered 500 while the
  page went to Podcast: Podcast's status line is empty (was "Nicht gespeichert: kaputt"); held and answered 200:
  the overview is read again, Podcast does not say "Gespeichert". `usePlan.test.js`.
- **Fixed — "Gespeichert" on a plan never saved:** `load()` clears `savedAt`. `usePlan.test.js`.
- **Fixed — a half-typed idea travelled to the next project:** `PlanDocument` is keyed by the project's name;
  "Logo briefen" typed on Website-Relaunch, Podcast's Ideen field is empty.
- **Fixed — no visible focus on the next-action and project-name fields:** the rule under them is the strong rule
  and turns yellow only while the text field has the focus (`rgb(244, 200, 74)` focused, the rule colour with a
  context pill focused, yellow again on Shift+Tab back), as the capture line does.
- **Fixed — focus fell to `<body>`** when a field or the plan's question closed: `Esc` on "+ Projekt"'s field →
  "+ Projekt"; `Esc` on the next-action field, or a next action added → the button that opened it, or "Nächste
  Aktion festlegen" when that is gone (the callout once the project moves, a step now "✓ angelegt"); the plan's
  question answered (Weiter bearbeiten or Verwerfen) → the field typed in, else the document.
- **Fixed — the capture line advertised `n` on a project's page:** it shows no `n` where the page gives `n` to
  something else (`CaptureLine` `keyHint`); Nächste still shows it.
- **Fixed — a next action could be filed into a finished project:** `n` on Messestand-2026 opens nothing, there is
  no "Nächste Aktion festlegen" and the palette offers none.
- **Fixed — missing kit shots:** `projects-reduced-desktop-light`, `projects-narrow-{light,dark}`.
- **Answered in the docs — the lazy pages vs plan §6.2:** kept lazy (static placeholder and login page measured
  130.82 kB gzip entry), listed in the brief's departures with the scope widening to `ComingPage` and `LoginPage`,
  and pinned by `lazyPages.test.js`; the brief's "three routes" is five.
- **Answered in the docs — "← Projekte" above the eyebrow** instead of 06's top line: under Deviations below.

## Driven on the harness

- **Projekte:** the order (stalled first, then by name; Ruht and Abgeschlossen apart); `j` `j` puts the cursor on the
  second project; `n` opens the name field; "a/b" → "Ohne diese Zeichen: …", "Website-Relaunch" → "Dieses Projekt gibt
  es schon.", nothing sent; "Messe-Nachbereitung" `⏎` → `POST /projects {"name":"Messe-Nachbereitung"}` and the new
  project opens, "steckt fest" with the callout (03: a new project is stalled until it gets a next action).
- **A next action:** `n` on the project's page opens the field with the focus; `⏎` without a context refuses; `Alt 2`
  picks the second context, `⏎` → `POST /tasks {"description":"Aussteller anschreiben","project":"Messe-Nachbereitung","tags":["next","@anrufe"]}`;
  the row is there at once, the notice "Nächste Aktion angelegt · Aussteller anschreiben · @anrufe · Rückgängig", the
  eyebrow "aktiv · 1 nächste", the callout gone — before the next snapshot (the stalled reading is the snapshot's).
- **Status:** "Ruhen lassen" → `PUT /projects/Messe-Nachbereitung/status {"status":"on_hold"}`, "… ruht · Rückgängig",
  the eyebrow "ruht"; Rückgängig → `PUT … {"status":"active"}`, "aktiv" again.
- **Deep link:** `/projects/Website-Relaunch` opens that project, the tab says "Website-Relaunch · runway"; signed out,
  the same link goes to `/login?next=/projects/Website-Relaunch?ui=neu` (the login page is now a chunk of its own) and
  back to the project after signing in.
- **The plan:** the five steps 01 Warum · 02 Vision · 03 Ideen · 04 Ordnen · Alt ↑ ↓ · 05 Aktionen — every step of the
  old modal (Zweck and Werte, the vision, ideas added and removed, steps added, removed, moved, "Aus Ideen übernehmen",
  and "→ Task", now "→ Nächste"). A change says "Nicht gespeichert"; `Esc` asks, "Verwerfen" restores the saved text;
  a new idea "Blog", a step moved down, `⌘S` → one `PUT /projects/plans/Website-Relaunch` with all five fields, "Gespeichert".
  "→ Nächste" on step 2 fills the next-action field with "Startseiten-Text kürzen", `Alt 1` `⏎` →
  `POST /tasks … "tags":["next","@computer"]`, the step says "✓ angelegt".
- **The plan and the detail:** a click on a row opens its detail in the margin's place; `Esc` closes it and the plan is
  back as it was, unsaved text included (the page holds the draft).
- **Leaving with changes:** "← Projekte" with an unsaved plan asks "Der Plan hat ungespeicherte Änderungen. Trotzdem
  verlassen?"; dismissed, the page stays.
- **Keyboard:** 70 × Tab on a project's page: rail → top line → "← Projekte" → Ruhen lassen · Abschließen · Nächste
  Aktion festlegen → the rows' rings ("Abhaken: …") → the capture field → the plan's fields, idea and step buttons
  ("nach oben: …", "→ Nächste : …") in the margin → back to the rail; nothing traps.
- **No console errors or warnings** in any run (both flow runs, all twenty-three shots; in `review.mjs` only the
  500 it injected itself).

## Measured

| Criterion | Bound | Measured |
|---|---|---|
| Entry JS (gzip) | ≤ 130 kB | 129.80 kB (M12: 129.85) |
| CSS (gzip) | ≤ 20 kB | 13.43 kB |
| Projekte chunk | — | 2.16 kB JS + 0.78 kB CSS gzip |
| Project page chunk (with the plan document and its texts) | — | 6.26 kB JS + 1.58 kB CSS gzip |
| Login page / placeholder chunks | — | 1.16 + 0.46 kB / 0.66 + 0.18 kB gzip |
| WebGL canvases | ≤ 1; 0 at ≤ 760 px | 1 on Projekte (the margin's lens), 0 there with reduced motion and at 1024 px, 0 on a project's page (the plan takes the margin), 0 on the phone |
| "3 von 7" per screen (M12) | at most once | once on Projekte; not on a project's page (the plan holds the margin, as in 06) |
| 200 % zoom at 1440 px | no horizontal scroll | 0 px |
| Horizontal scroll, every shot | 0 | 0 px in all twenty-three |

**Accessibility:** axe-core 4.10.2: **0 serious or critical issues** in all twenty-three shot states; the one moderate
`region` finding on a project's page is M6's capture field, as in M9–M12. Every pill and link is a button or link with
its text; the context chips of the next-action field are `aria-pressed` toggles in a named group; the name field and
the next-action field announce their error through `aria-live`; the plan's status line is a `role="status"`.

## Deviations from 06

- The overview has no outcome line per project (the API's overview has no plan text); it says "mit Plan" / "noch kein Plan".
- The plan is editable (06 only showed it); it carries the old modal's texts as hints. A project without a plan gets
  the empty document (06: "Noch kein Plan · Plan beginnen" over the Heute panels).
- At ≤ 1180 px the plan sits under the todos, not in a sheet.
- "← Projekte" is a line of its own above the eyebrow; 06 puts it in the top line, left of the search field
  (`.mclose`), so the head sits about 38 px lower than in `06-project-desktop-light.png`. The top line is
  `AppFrame`'s and has no slot for a page.
- On a project's page the capture line shows no `n` (it is the next action there); a resting or finished project
  offers no next action.
- An active project's status line also offers "Nächste Aktion festlegen `n`" (06 only has the key).
- Projekte has no search field and no capture line (06 shows both on every view): like the placeholder pages it stands
  on `AppFrame`, not the list frame; `n` there is a new project and `/` opens the palette, which also finds todos.
