# M9 — the command palette, the shortcuts sheet and the search (brief 0055)

Taken 2026-11-10 on the dev harness (real backend, Taskwarrior 3.5.0, 06 demo set), Chromium (installed Google Chrome),
driven by a scratch Playwright script with real keys (`Meta+K`, `?`, `/`, `j`, taps on the phone). The backend on
:8000 was held by another session (and refused a login), so this milestone ran its own: the same backend code on
:8001 over a data root and users database in the session's scratchpad, and the Vite dev server on :5179 proxying to
it. Own user `m9-agent`, seeded with the 06 demo set shifted from 31.10. to 10.11. (the legacy comma tag goes in as
its two parts, because the API refuses commas; a context todo gets `next`; Warten auf's date is its follow-up day).
Speed mode: desktop 1440×900 and phone 412×915 @2x, light and dark; narrow 1024×768 light only, for the top line;
WebKit and the rest of narrow deferred to M15's pass. No lens yet (M11), so no reduced-motion shot.

Compared with `06-kombination/shots/web-palette.png` and `web-palette-search.png`.

| Shot | What it shows |
|---|---|
| `web-palette-desktop-{light,dark}.png` | `j` then ⌘K on Nächste: the palette over the token scrim (no blur), the `//` field, Aktionen with the cursor row's actions labelled with the todo ("Abhaken: Belege Oktober hochladen") and their keys, then Gehe zu; foot "↑ ↓ wählen · ⏎ ausführen · Esc schließen" |
| `web-palette-search-desktop-{light,dark}.png` | ⌘K, "arten": Aktionen (Starten, Nach Warten auf — the cursor row), Gehe zu Warten auf, the todo "Rosen zurückschneiden" (found by its project), the project Garten, and "Als Todo erfassen: „arten“" last |
| `shortcuts-desktop-{light,dark}.png` | `?`: "Alles mit der Tastatur", generated from the command table, ⌘ K, `/` and `?` included; the focus on "schließen" |
| `shortcuts-end-desktop-light.png` | the same sheet scrolled to its end: Inbox klären with its answers, "Einen Schritt zurück", "Neues Projekt" |
| `search-desktop-{light,dark}.png` | `/`, "ung" in the top line's field: "// Suche · »ung« · 5 Treffer", "Gefunden in allen Listen", "Suche beenden Esc", the hits by list (Inbox, Nächste, Warten auf) as ordinary rows; the page's chips and lens caption rest |
| `more-phone-{light,dark}.png` | "···" on the phone: the search field "Suchen in allen Listen" on top, the views, "Befehle", Darstellung, Abmelden |
| `palette-phone-{light,dark}.png` | "···" → "Befehle": the palette on the phone, 48 px rows, no key hints (touch) |
| `search-phone-{light,dark}.png` | "···", "ung" ⏎: the sheet closes over the hits and the cursor and focus are on the first hit (re-shot after review, see below) |
| `topline-narrow-light.png` | 1024 px Inbox with the docked clarify panel: the top line fits (see the fix below) |
| `palette-narrow-light.png` | 1024 px, ⌘K on the Inbox: the row actions and the Inbox questions ("Klären: Nächste Aktion, dann Kontext" a …) |

**Every keymap action is reachable from the palette.** `commands.test.js` › "reaches every key action of the table,
except the palette's own" takes every table row that has a key, mounts every handler, scope and offer, and asserts
that the rows the palette leaves out are exactly the palette's own: `palette` (⌘K itself), `search` (`/`), the cursor
moves `j k ↑ ↓`, `Esc` (`close`, `step.back`) and an open question's answers (`step.1`–`step.9`, `step.new`) — each of
which the palette itself does (↑ ↓, Esc, the field) or which answer a question the palette entry already opened. On the
harness the palette held, with `j` on the first row: Inbox 22 entries (Neues Todo, 5 row actions, the 4 Inbox questions,
8 Gehe zu, Tastenkürzel, 3 Darstellung), Nächste 26 (Neues Todo, 6 row actions with Für heute planen, 2 moves, 8 Gehe zu,
5 contexts, Ansicht), Warten auf and Irgendwann 20 each, Alle 22 (all three moves and Erledigte zeigen). Offered only when they apply, and checked:
"Kontextfilter aufheben" after `1` on Nächste, "Rückgängig (die letzte Aktion)" while a notice can undo.

**Driven on the harness** (desktop unless named): ⌘K opens and toggles closed, also from inside the capture field
with "xy" typed, and Esc puts the focus back in that field with "xy" kept; Ctrl+K opens it as well. Tab stays in the
field; a click on the scrim closes it. "abhaken" ⏎ ticks the cursor row through the same handler as `x` (on Irgendwann,
after the hold: `POST /tasks/{uuid}/done`); "Rückgängig" from the palette inside the hold sends nothing. "M9 Palette Probe"
with ↑ (wraps to the last entry, "Als Todo erfassen") ⏎ sends `POST /inbox {"description":"M9 Palette Probe"}`, shows
"In Inbox ✓ · Rückgängig", and the todo is in `GET /gtd/inbox`. A todo hit opens its own list with `?task=<uuid>`; the
project hit opens `/projects/Garten`; "gehe zu wart" ⏎ goes to `/waiting`; "tastenk" ⏎ opens the sheet and `?` closes
it. `/`, "nora", ⏎ puts the focus on the first hit's row; Esc ends the search and the page is back ("Was jetzt zählt").
Phone: "···" → "Befehle" focuses the palette field, a tap on "Gehe zu Inbox" goes to `/inbox`. No console error or
warning in any run.

**Fixed after the shots:** at 1024 px the top line wrapped "Stand 16:24" onto two lines (the search field kept its
260 px). The field now gives way (`flex: 0 1 260px; min-width: 0`) and "Befehle ⌘K" and "Stand …" never wrap
(`TopLine.vue`); `topline-narrow-light.png` is after the fix, the desktop shots are unchanged by it.

Deviations from the prototype (brief 0055): no "Inbox klären (n)" and no "Inbox als Stapel" entries (the first is
"Gehe zu Inbox", the second needs M10's stack); contexts only on Nächste and only the present ones; more actions than 06
(every row key, the moves, the Inbox questions, Rückgängig, Erledigte zeigen). The shortcuts sheet keeps 06's measures
and has more rows than 06, so at 900 px it scrolls (923 px of content in 802 px): `shortcuts-end-desktop-light.png`
shows the rest. On the phone, Nächste's eyebrow wraps its count when the lens caption is long ("0 von 2 · 4
zusätzlich" on this data) — M5's head, not changed here.

axe-core 4.10.2: 0 serious or critical issues in every state shot with axe: palette (desktop, narrow, phone), palette
with a query, shortcuts sheet, `/` search results, "···" with the search field — light and dark. One moderate finding
throughout (`region`: the capture field and its key hint (M6), or on the phone the dock's chips (M5), outside a
landmark); none on anything M9 adds.

**After review** (re-driven on the same harness, same data): a press on the palette's headings or foot keeps the focus
in its field, and a click on the `?` sheet's text puts it on the sheet itself; with the focus on `<body>` as well,
`x`, Entf, `j` and Esc reach nothing behind either modal (no write in the log). ⌘K ⌘K, `?` then ⌘K then Esc, and Esc
in the sheet all put the focus back on the cursor row; a held ⌘K leaves the palette open. The palette's options sit in
one labelled `role=group` per heading (axe: still 0 serious or critical). On the phone, "···", "ung" ⏎ now puts the
cursor and the focus on the first hit like the wide screen's field, and without a hit back on "···" — so
`search-phone-{light,dark}.png` were re-shot. Every other shot was re-taken and differs only in the clock ("Stand",
"erfasst heute"; at most 46 px), so the committed ones stay.
