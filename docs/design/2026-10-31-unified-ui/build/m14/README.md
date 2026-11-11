# M14 — Rückblick, Einstellungen, Alle (brief 0061)

Taken 2026-11-11 on an own dev harness (real backend, Taskwarrior 3.5.0, **06 demo set**): the backend on **:8061**
over a fresh data root and users database in the session's scratchpad (`BOOTSTRAP_ADMIN=m14-ph`, so one user is an
admin; `LOGIN_RATE_LIMIT` raised for the shot runs), the Vite dev server on **:5261** proxying to it (started from
`frontend/`), both started for this acceptance and stopped after it; the backends on :8000, :8010 and :8031 and the Vite server on :5197
belong to other sessions and were not touched. The production build (`vite build` into the scratchpad) for the
budgets. Users `m14-ph` (admin, "Ulla Beispiel"), `m14-a`, `m14-u` ("Max Muster"), each seeded with the 06 demo set
shifted from 31.10. to 11.11. (M13's seed: Garten resting, Messestand-2026 finished, Podcast stalled) plus eight todos
done today, and a weekly review recorded on Di 03.11. for `m14-ph` and `m14-a` (06's "vor 8 Tagen"). Chrome (GPU on,
as `shared/tools/shot.mjs`) and Playwright WebKit, driven by scratch Playwright scripts with real clicks and keys.
Desktop 1440×900, narrow 1024×768, phone 412×915 @2x. The shots use `m14-ph`, the API key shown is the harness's.

06 has no shot of these views, so its `index.html` was rendered at 1440×900 for the comparison and the renders are
kept here: `06-review-desktop-light.png` (`#review`), `06-settings-desktop-light.png` (`#settings`),
`06-all-desktop-light.png` (`#all`).

## Shots

| Shot | What it shows |
|---|---|
| `review-desktop-{light,dark}.png` | Rückblick: `// Rückblick · zuletzt Di 03.11. · vor 8 Tagen`, "Die Woche, *sortiert*", 06's lead; the six steps with their live counts as links ("5 offen →", "13 · 1 fällig →", "0 heute · 2 diese Woche →", "1 steckt fest →" with "Steckt fest: Podcast", "3 Ideen →", "Kalender"); `// Erledigt · letzte 7 Tage · 11` and its first seven rows, struck through at rest (06's `.donelist`); the rest of the list, its "und 4 weitere · in Alle zeigen →" and "Rückblick abschließen" are below the fold at 1440×900 (see `review-done-desktop-light.png`, `review-phone-done-light.png`, and Deviations); the margin without its own "Rückblick" panel, "3 von 7" once |
| `review-ticked-desktop-light.png` | steps 02 and 06 ticked by hand ("02 ✓", the step's text muted) |
| `review-done-desktop-light.png` | scrolled to the foot: the done list's last rows, "und 4 weitere · in Alle zeigen →", "Rückblick abschließen" sent (`m14-u`, who had recorded none): the notice "Rückblick gespeichert", the hand ticks cleared, the rail's "fällig" gone |
| `review-reduced-desktop-light.png` | reduced motion: the margin's lens as M12's flat SVG lens, no canvas |
| `review-narrow-{light,dark}.png` | 1024 px: no margin column |
| `review-phone-{light,dark}.png`, `review-phone-done-light.png` | the phone: the count under the step's text; the done list with "und 4 weitere · in Alle zeigen →" |
| `review-webkit-light.png`, `review-phone-webkit-light.png` | WebKit, desktop and phone |
| `review-zoom200-light.png` | 200 % zoom at 1440×900 (a 720×450 viewport): the phone layout, no horizontal scroll |
| `settings-desktop-{light,dark}.png` | Einstellungen: `// Einstellungen · m14-ph · Admin`, "Dein *runway*"; Konto ("Ulla Beispiel · ulla@example.com · m14-ph · Admin", Profil bearbeiten), Passwort, API-Key (dots and the last four characters, Anzeigen · Kopieren, "Neuen Key erzeugen …"), the start of "Claude verbinden" |
| `settings-claude-desktop-light.png` | the four steps with German titles, their text from `claudeConnect.js` (the key masked in step 01, "Der Key ist verborgen; Kopieren nimmt den echten."), the skill download, `references/setup.md`, the project line and the update command, each with "Kopieren" |
| `settings-mcp-desktop-dark.png` | MCP-Server: the endpoint, the tabs Claude Code · Claude Desktop · curl (Claude Desktop selected, its key masked), Darstellung, Sprache, the start of Verwaltung |
| `settings-admin-desktop-light.png` | Darstellung, Sprache, Verwaltung (Registrierung erlauben as a switch; the users with their role, "Zum Admin machen", "du" on your own row; one rule under the last user, the section's), Abmelden |
| `settings-forms-desktop-light.png` | "Profil bearbeiten" and "Passwort ändern" open; two different new passwords refused before anything is sent ("Die beiden neuen Passwörter stimmen nicht überein.") |
| `settings-regen-desktop-light.png` | "Neuen Key erzeugen …": the question, with the focus on Abbrechen |
| `settings-user-desktop-light.png` | a user who is no admin (`m14-u`): no Verwaltung |
| `settings-reduced-desktop-light.png` | reduced motion: the margin's flat lens |
| `settings-narrow-{light,dark}.png` | 1024 px: the label column 150 px, no margin column |
| `settings-phone-{light,dark}.png`, `settings-phone-claude-light.png`, `settings-phone-admin-light.png` | the phone: one column; a command takes the whole width, "Kopieren" under it; the users with their buttons under them |
| `settings-webkit-light.png`, `settings-phone-webkit-light.png` | WebKit, desktop and phone |
| `settings-zoom200-light.png` | 200 % zoom: the phone layout, no horizontal scroll |
| `all-desktop-light.png` | Alle after `d`: "Erledigte zeigen `d`" pressed (the key in the chip, as 06), `// Alle · 25 offen · 11 erledigt in 7 Tagen` |
| `all-desktop-dark.png`, `all-phone-light.png` | Alle, dark; the phone (the key hidden on touch, the chip a 44 px target) |
| `old-settings-unchanged.png` | without `?ui=neu`: the old "Account" page as before |
| `06-*.png` | 06's prototype rendered for the comparison (above) |

## Fixed after looking at the shots

- **The code blocks pushed the column wider than the page** ("Kopieren" off screen, the text cut at the margin): the
  steps' list is a grid whose column took the width of the longest command, and on the phone the section's one column
  was `1fr` (`min-width: auto`). Both are `minmax(0, 1fr)` now and the block scrolls inside itself. Re-shot: every
  `settings-*`.
- **On the phone a command shared its line with "Kopieren"**, leaving half the width for the text: there it takes the
  whole width and "Kopieren" sits under it.
- **"Kopieren" before "Anzeigen"** in the key row; 06 has Anzeigen · Kopieren. The reveal button comes first now.
- **Two coral buttons on one screen** with both forms open (Speichern, Passwort ändern); the brand has one primary
  action per view. The forms' buttons are bordered pills; Rückblick's "Rückblick abschließen" is its one coral action.
- **The done list wore a filled coral ring on every row**: seven coral dots above the one coral action, where 06's
  done list (`base.css .donelist`) is muted text with the ink strike and nothing else ("ink means done"). It is 06's
  list now: no ring, 13.5 px, 7 px apart, the project at the right. Re-shot: every `review-*` (the finished review
  with `m14-u`, since `m14-a` had already recorded one in the drive).
- **"du" failed contrast** (axe `color-contrast`, the soft colour on 11 px): it is the muted colour now.
- **A rule above Konto** that 06 does not draw; gone. On the phone the role buttons sat 12 px in; in line with the name now.

## Fixed after the review (2026-11-11)

Fifteen findings, each checked against the code and the shots; all fifteen were real. Re-shot: every `settings-*`
(18), on the same harness, axe again 0 serious or critical in each; the `review-*` shots are unchanged (no Rückblick
code changed, only this README's text about them).

- **One request at a time per action** (`useAccount.js`, `useAccount.test.js`): two quick clicks on the registration
  switch sent the same value twice (it flips on the answer), so it ended where it started; a double click on "Neuen
  Key erzeugen" rotated the key twice and could leave the page showing a key the server had already replaced; one
  shared `busy` for all users freed user A's button when B's started. Now each action (`reg`, `key`, `profile`,
  `password`, `role:<name>`) has its own in-flight key and a second click while it is out sends nothing. Driven with
  every write held 1.2 s: two clicks on the switch → one `PUT /admin/settings`; Enter twice on m14-u's button and once
  on m14-a's → one PUT each; a forced double click on "Neuen Key erzeugen" → one `POST`, and the key shown is the
  server's.
- **The focus stays on a busy button:** the role buttons, Speichern, Passwort ändern and the regenerate confirm are
  `aria-disabled` while their request is out (`PillButton` dims it as `disabled`), not `disabled`, which dropped the
  focus to the page. Driven: Enter on "Zum Admin machen (m14-u)" → the focus stays on it, `aria-disabled="true"`.
- **Status regions are always in the page:** every answer ("Gespeichert", "Passwort geändert.", "Neuer Key erzeugt.",
  the registration's, a role refusal, "Kopiert", a copy that failed) goes into a `role="status"` element present from
  the start and empty until there is something to say; before, each was inserted together with its text, often
  inside the branch that only renders as the form closes, and was not read. The section's region sits under its
  form or button (the answer moved from beside the button to under it).
- **The role buttons name their user:** "Zum Admin machen (m14-u)", the user hidden after the visible words.
- **"Kopieren" names its visible word first:** "Kopieren (Dein API-Key)", then "Kopiert (…)" (WCAG 2.5.3; the fixed
  `aria-label` "Dein API-Key kopieren" did not contain "Kopiert"); "Kopiert" is announced in the block's region.
- **Anzeigen is no longer a pressed toggle:** its label changes (Anzeigen / Verbergen), so `aria-pressed` contradicted
  it ("Verbergen, gedrückt"); it is a plain quiet pill, as 06.
- **A copy that fails on a masked text says to show the key first** (`copyFailedKey`, `settingsRules.test.js`): a hand
  copy of step 01 took the dots. Driven with the clipboard refused: step 01 → "… Der Key ist hier verborgen: zeig ihn
  erst mit „Anzeigen“ beim API-Key …"; the update command → the plain message.
- **A one-line text wraps instead of being cut off:** the update command was "claude plugin marketplace up…" on the
  phone (and cut at 1440 px too); it wraps where it must now and reads in full (`settings-admin-desktop-light.png`
  shows it on two lines).
- **One rule under the last user**, the section's; the row's own is gone there.
- **Docs:** this table no longer claims "und 4 weitere" for the two desktop review shots; the brief names the link as
  it ships ("und n weitere · in Alle zeigen") and counts 18 `settings-*` shots; the done list's place above
  "Rückblick abschließen" is a Deviation below.

## Driven on the harness

- **Rückblick** (`m14-a`): the head and the six steps as above; step 2 ticked by hand (`aria-pressed="true"`), "Inbox
  leeren: 5 offen" opens the Inbox, back: step 2 still ticked; "Rückblick abschließen" → exactly one
  `POST /gtd/review {"kind":"weekly"}`, the notice "Rückblick gespeichert", the head "zuletzt Mi 11.11. · heute", the
  hand tick cleared; "und 4 weitere · in Alle zeigen" opens Alle with its done section on ("11 erledigt in 7 Tagen").
  The margin has no "Rückblick beginnen" on this page. An empty Inbox and no stuck project tick steps 01 and 04 by
  themselves (`weeklyReview.test.js`; on this data both have work, so both are open).
- **Einstellungen** (`m14-a`, no admin): the key is nowhere in the page's HTML while hidden (only its last four
  characters); "Profil bearbeiten" puts the focus in Name; Speichern → `PUT /auth/me {"full_name":"Anna Agent","email":"anna@example.com"}`,
  "Gespeichert", `localStorage.fullName` updated as the old page does; two different new passwords → the message and
  **no request**; a wrong current password → `PUT /auth/password` answered 400, "Das aktuelle Passwort stimmt nicht.";
  the right one → "Passwort geändert."; "Kopieren" beside the key puts the real key on the clipboard (Android's "Key
  einfügen": "Kopiere den API-Key in den runway-Einstellungen im Browser"); step 01's "Kopieren" copies the real key,
  its text on screen does not show it; `→` in the tab list moves to Claude Desktop, whose shown snippet has the key
  masked and whose copy has it; "Anzeigen" shows the key everywhere; "Neuen Key erzeugen …" asks with the focus on
  Abbrechen, `⏎` keeps the key and the focus goes back to "Neuen Key erzeugen …"; confirmed → `POST /auth/apikey/regenerate`,
  the new key shown, "Neuer Key erzeugt. Trag ihn in der Android-App und in ~/.zshenv neu ein."; Dunkel →
  `data-theme="dark"`, `localStorage.theme = dark`; System → the key removed. `Esc` in an open form closes it and the
  focus goes back to its button. No Verwaltung for this user.
- **Verwaltung** (`m14-ph`): the three users; the switch → `PUT /admin/settings {"allow_registration":false}`,
  "Gespeichert", and back; "Zum Admin machen" on `m14-u` → `PUT /admin/users/m14-u/role {"role":"admin"}`, the row
  "Admin · Admin-Rechte entziehen", and back with `{"role":"user"}`; your own row has no button. The last-admin refusal
  (409) is the server's and has its message (`settingsRules.test.js`); with one admin the page offers no way to cause it.
- **Keyboard:** 40 × Tab on Rückblick: rail → top line → each step's number ("Schritt 1 abhaken") and its link
  ("Inbox leeren: 5 offen") → "und 4 weitere · in Alle zeigen" → "Rückblick abschließen" → the margin's rows → back
  to the rail. 70 × Tab on Einstellungen: rail → Profil bearbeiten → Passwort ändern → Anzeigen → "Dein API-Key
  kopieren" → "Neuen Key erzeugen …" → each step's block (scrollable, so focusable, named by its title) and its
  "… kopieren" → the zip link → the project line, the update command, the endpoint → the tab list (one stop, `←` `→`
  inside) and its block → System · Hell · Dunkel → the switch → the role buttons → Abmelden → the margin → the rail.
  (Names as of the review: "Kopieren (Dein API-Key)", each step's "Kopieren (…)", "Zum Admin machen (m14-u)".)
  Focus visible on every stop but the browser's own document stop between rounds (as on every page); nothing traps.
- **No console errors or warnings** in any shot or run, except the 400 the wrong-password step causes on purpose.

## Measured

| Criterion | Bound | Measured |
|---|---|---|
| Entry JS (gzip) | ≤ 130 kB | 129.18 kB (M13: 129.80; the moved texts and the placeholder left it; unchanged after the review) |
| CSS (gzip) | ≤ 20 kB | 13.50 kB (13.49 before the review's `aria-disabled` look) |
| Rückblick chunk | — | 2.70 kB JS + 0.89 kB CSS gzip |
| Einstellungen chunk (with its texts) | — | 7.30 kB JS + 1.90 kB CSS gzip (7.03 + 1.80 before the review) |
| WebGL canvases | ≤ 1; 0 at ≤ 760 px | 1 on both pages at 1440 px (the margin's lens), 0 with reduced motion, at 1024 px and on the phone |
| "3 von 7" per screen (M12) | at most once | once at 1440 px; none where the margin column is not shown |
| 200 % zoom at 1440 px | no horizontal scroll | 0 px |
| Horizontal scroll, every shot | 0 | 0 px in all thirty-five |

**Accessibility:** axe-core 4.10.2: **0 serious or critical issues** in all thirty-four shot states of the new UI (the
old page's shot is not checked); the one moderate `region` finding on Alle is M6's capture field, as in M9–M13. The
step numbers are `aria-pressed` toggles named "Schritt n abhaken" (a step runway ticks itself says so and does not
toggle); each count link is named "Inbox leeren: 5 offen"; the settings sections are regions named by their heading;
the MCP tabs are an ARIA tab list; the registration toggle is a `switch`; every "Kopieren" is named by its visible word
and then what it copies, every role button by its words and then its user; statuses and errors are `role="status"`
regions that are always in the page.

## Deviations from 06

- **Six steps and the done list:** 06's six steps, and under them the last seven days' done todos (the plan's
  "erledigt letzte 7 Tage"), which 06 does not show.
- **"Rückblick abschließen" comes after the done list**, so at 1440×900 it is below the fold, where 06 has it right
  under step 06 (about y 697). A weekly review looks back at what was done before it is closed, and the keyboard
  order follows the page: the steps, the done list and its link, then the one coral action. The trade-off: on a
  desktop screen closing the review takes a scroll.
- **No "Rückblick" panel in the margin on the Rückblick page** (06 shows it, with "Rückblick beginnen" while due).
- **No capture line and no search field** on Rückblick and Einstellungen (06 shows both on every view): like Projekte
  (M13) they stand on `AppFrame`; `/` opens the palette.
- **Einstellungen** has every section of the old page in full (06 shows a summary line for MCP and Verwaltung): the
  four steps, the three tabs, the users. No "Kontexte" section (D1's default keeps no list to edit) and no "Zuletzt
  geändert vor 3 Monaten" (the API does not record it). "Neuen Key erzeugen …" under the key (the old page's; 06 has none).
- **The key row shows dots and the last four characters**, as 06 (`rw_live_••••3f9a`), without 06's prefix: the
  API's keys have none.
