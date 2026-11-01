# Change Impact Brief 0047 — Design tokens and local fonts

| Field | Value |
|---|---|
| **Requested outcome** | Milestone **M1** of [the plan](../plan/unified-ui-web.md): the foundation every later milestone styles with. One token source, [`frontend/tokens/tokens.json`](../../frontend/tokens/tokens.json) (06's tokens plus the names the phone design m3 adds), generates the web's custom properties, a Tailwind theme extension and the Kotlin file the Android app copies; the brand fonts are served from this origin instead of Google Fonts; and the new UI gets its theme logic — follow the system unless a choice is stored, under the same `theme` key the old UI uses. The old UI keeps its look; only its fonts move, same faces, and bold is drawn instead of synthesised. |
| **Owning unit** | `fe/shared` — [`frontend/tokens/`](../../frontend/tokens/tokens.json) (the source, the generator [`generate.js`](../../frontend/tokens/generate.js), the generated [`tailwind-tokens.js`](../../frontend/tokens/tailwind-tokens.js) and [`RunwayTokens.kt`](../../frontend/tokens/RunwayTokens.kt)), the new [`frontend/src/shared/theme.js`](../../frontend/src/shared/theme.js) and [`frontend/src/composables/useTheme.js`](../../frontend/src/composables/useTheme.js). `fe/app` — [`frontend/src/main.js`](../../frontend/src/main.js) and the new [`frontend/src/assets/`](../../frontend/src/assets/fonts.css) (`fonts.css`, `fonts/*.woff2`, `fonts/OFL.txt`, generated `tokens.css`). `ops` — [`frontend/index.html`](../../frontend/index.html), [`frontend/tailwind.config.js`](../../frontend/tailwind.config.js), the new [`tools/gen-tokens.mjs`](../../tools/gen-tokens.mjs) and [`frontend/public/fonts/OFL.txt`](../../frontend/public/fonts/OFL.txt) (the licence the build publishes). `tests` — the new [`frontend/tests/tokens.test.js`](../../frontend/tests/tokens.test.js), [`frontend/tests/theme.test.js`](../../frontend/tests/theme.test.js) and [`frontend/tests/useTheme.test.js`](../../frontend/tests/useTheme.test.js). `docs` — this brief and the screenshots under [`docs/design/2026-10-31-unified-ui/build/m1/`](../design/2026-10-31-unified-ui/build/m1/README.md). |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §4 (frontend units and allowed edges are declared in `architecture.toml`), §5 (SPA localStorage keys are a public surface); [`frontend/AGENTS.md`](../../frontend/AGENTS.md) (new files only in the unit folders; tests cover logic, not components); the brand rules in `~/projects/agentic-reach/brand/AGENTS.md` (brand colours and mixes only, no new shadows). |
| **Governed by** | [ADR 0042](../adr/0042-the-new-ui-coexists-behind-a-switch.md) — the old UI stays the default and must not change for anyone who has not opted in; the only planned exception is this milestone's font move. [ADR 0007](../adr/0007-frontend-test-scope.md) — the theme decision and the token generator are tested as pure logic; the composable that applies them is not mounted. |
| **Rule IDs introduced** | **None**, and no rule or gate configuration changes. |
| **Entry points** | `generateTokens` and `resolveColour` in `frontend/tokens/generate.js` (run by `node tools/gen-tokens.mjs` and by the test); `parseTheme`, `resolveTheme`, `themeColorFor` in `frontend/src/shared/theme.js`; `useTheme()` in `frontend/src/composables/useTheme.js` (no caller yet, see *The theme*); the two stylesheet imports in `frontend/src/main.js`; the font preload in `frontend/index.html`. |
| **Affected public surfaces** | **None changed.** The SPA's localStorage keys and routes are unchanged (`./run surfaces`: no drift): `useTheme` reads and writes the existing key `theme` with the two values `useDarkMode` already writes, and removes it for "System". REST 40 routes, MCP 27 tools, schema and Taskwarrior template untouched. Not a snapshotted surface but consumed by another repository: `frontend/tokens/RunwayTokens.kt` and `tokens.json` are what the Android plan's M1 copies (plan §11). |
| **Known dependents** | From the index: `frontend/src/assets/tokens.css` and `fonts.css` have one dependent, `frontend/src/main.js`; `frontend/tokens/tailwind-tokens.js` is imported by `frontend/src/shared/theme.js`, which `frontend/src/composables/useTheme.js` imports; nothing imports `useTheme.js` yet. `./run impact frontend/src/style.css`: `main.js` only — `style.css` is not changed, and `tokens.css` is imported before it, so where both define a brand variable `style.css` wins (they agree, and a test holds them to it). `./run impact frontend/src/composables/useDarkMode.js`: `AppShell.vue`, and through it the router and every old view — not changed. `frontend/index.html` and `frontend/tailwind.config.js` (unit `ops`) have no indexed dependents. Invisible to the index (it extracts imports only under `frontend/src/`): `tailwind.config.js` → `frontend/tokens/tailwind-tokens.js` and `tools/gen-tokens.mjs` → `frontend/tokens/generate.js`, see *Where the generator lives*. |
| **Uncertain / dynamic areas** | `RISK-TEST-004` — `useTheme` (document, media query, storage) and the font loading are rendering, untested by construction; the decision `useTheme` calls is tested, its lifetime is tested in node with stand-ins for the document, the media query and storage (`frontend/tests/useTheme.test.js`, no mounting), and the composable was driven in the running SPA (*Pre-checks*). **F13**: the index credits no frontend test, so the protecting tests are named here: `frontend/tests/tokens.test.js` (generated files equal the generator's output, brand fidelity, colour mixing, contrast, the shipped font licence), `frontend/tests/theme.test.js` (the theme decision) and `frontend/tests/useTheme.test.js` (the composable outlives its first caller). `BLIND-FE-001` and `BLIND-FE-002` do not apply (no component, no dynamic import). |
| **Analogous implementations** | `06-kombination/tokens/gen-tokens.mjs` (the design's generator, ported); `frontend/src/shared/uiFlag.js` and `frontend/tests/uiFlag.test.js` (brief 0046 — a per-browser preference split into a pure decision in `shared/` and a guarded storage read); `frontend/src/composables/useDarkMode.js` (the old UI's theme, the same key). |
| **Delivery Pattern** | **New Capability** (owner `fe/shared` / `fe/app`, declared in M0; failure behaviour: storage that throws leaves the system's scheme; a font that fails to load falls back to the stack in `--rw-font-*` with `font-display: swap`). The old UI's font move is the plan's one sanctioned change to the old UI before M16. |
| **Required tests** | `frontend/tests/tokens.test.js` (21): each of the three generated files equals what `generateTokens` writes from `tokens.json`, so a hand edit or a forgotten regeneration fails; the generator writes exactly those three; the brand colours, the four shadows and the four trackings equal the kit's (`docs/design/2026-10-31-unified-ui/shared/brand/tokens.css`); every brand colour and every shadow the old `style.css` also defines has the same value in `tokens.css`; a mix is computed as `color-mix(in srgb)` draws it, premultiplied, a translucent operand included; every semantic colour's leaves are brand colours; both schemes name the same colours, m3's names included; an unknown colour is refused; contrast in light and dark: text on page and card ≥ 7:1, muted text on page and card ≥ 4.5:1, ink on coral ≥ 7:1, overdue on the page ≥ 4.5:1; `public/fonts/OFL.txt` is the same licence as `src/assets/fonts/OFL.txt`. `frontend/tests/theme.test.js` (6): exactly `light`/`dark` parse, anything else is no choice; a stored choice wins; nothing stored follows the system; the theme colour is each scheme's page background. `frontend/tests/useTheme.test.js` (2): after the effect scope of the first caller stops (what a component's unmount does), a choice and a system change still reach `data-theme`, the `dark` class and `theme-color`; a stored `dark` from the old UI is read. The existing 102 frontend tests must pass unchanged. |
| **Intended scope** | The files under *Owning unit*. **Not** in scope: any component or page (M4 onwards); a caller of `useTheme` (M4's frame and sheet, M14's settings); changing `useDarkMode.js`, `style.css` or `<meta name="theme-color">` / `<title>` in `index.html` (M16, M17); a token sample page (the plan: tests suffice); every live-data step of the plan's section 10. |
| **Base revision** | `05585c1` (branch `ui/m0-coexistence-switch`, M0, not yet on `main`) |

## Behaviour change

For a person on the old UI (everyone; nobody sees a new view yet):

- The page no longer requests anything from `fonts.googleapis.com` or `fonts.gstatic.com`. The
  fonts come from this origin: Space Grotesk is preloaded, JetBrains Mono loads where text uses it
  (the login page), Fraunces nowhere (the old UI does not use it).
- Text set in Space Grotesk 400/500 and in JetBrains Mono looks as before: the files are
  the same bytes Google served (SHA-1 of the kit's `space-grotesk-*.woff2` and
  `jetbrains-mono-*.woff2` equals that of Google's current `v22` / `v24` latin files, fetched on
  2026-11-01 into the scratchpad).
- Text in `font-semibold` and `font-bold` (page titles, urgency badges, 20 places) is now drawn at
  its weight. Google's stylesheet declared only 400 and 500, so the browser drew 600/700 by
  smearing 500 — visibly heavy in WebKit. In the ten before/after pairs in `build/m1/` (`/next`,
  `/inbox`, `/settings`, the task modal; desktop, narrow, phone; light and dark; WebKit) only those
  places differ. Projects, the project plan modal and the phone's action sheet were not shot; they
  use the same classes, so the same change is inferred there, not shown.
- Characters outside the latin subset (for example Polish or Czech letters in a task) now fall
  back to the system font; Google's stylesheet also offered `latin-ext`, `vietnamese`, `cyrillic`,
  `cyrillic-ext` and `greek` files (the last three for JetBrains Mono only).
  The kit has the latin subset only, which covers German including „“ and €.

For the new UI there is nothing to see yet; the tokens, Tailwind utilities (`bg-rw-bg`,
`font-rw-serif`, …) and `useTheme` are what M4 onwards build with.

## The fonts: three files, not four

The plan asks for "Space Grotesk 400/500, Fraunces 300 italic, JetBrains Mono 400 woff2 … 4 woff2
files, ≤ 160 kB … bold no longer synthesised". The kit's files are **variable fonts** (read from
their `fvar` tables): its three `space-grotesk-{400,500,700}.woff2` are one file (wght 300-700),
its two Fraunces files one file (wght 100-900, opsz 9-144), its two JetBrains Mono files one file
(wght 400-800). The old UI asks Google for Space Grotesk 400/500, Fraunces italic 300 and
JetBrains Mono 400/500, and uses Space Grotesk at 600 and 700 too (Tailwind's `font-semibold`,
`font-bold`). Decided:

| Face | Shipped | Why |
|---|---|---|
| Space Grotesk | the kit's variable file unchanged, `font-weight: 300 700`, 22.3 kB | Same bytes the old UI got from Google; one file draws 400, 500 and the old UI's 600/700. Two static instances (400, 500, made with fontTools) would be 26.7 kB and still synthesise 600/700. |
| JetBrains Mono | the kit's variable file unchanged, `font-weight: 400 800`, 31.3 kB | Same bytes as Google's; covers the old UI's 400 and 500. A static 400 would be 21.2 kB and synthesise the old UI's 500. |
| Fraunces italic | the kit's variable file **pinned to weight 300, optical-size axis kept**, 41.8 kB | Neither UI uses another weight. The full file is 81.7 kB. A fully static 300 (opsz 9, what Google serves today, 22.7 kB) draws headings differently from the 06 shots, which were rendered from the variable file with automatic optical sizing. |

**Three files, 95.5 kB in total** (budget: four, ≤ 160 kB), only Space Grotesk preloaded. The
Fraunces instance was made outside the repository with fontTools 4.68.0 (+ brotli 1.2.1) in a
scratch venv: `instancer.instantiateVariableFont(font, {"wght": 300})`, saved as woff2; it is a
Modified Version under the OFL, which the licence allows (no Reserved Font Name).
[`frontend/src/assets/fonts/OFL.txt`](../../frontend/src/assets/fonts/OFL.txt) carries the three
copyright lines, names the three files and the instance, and the licence text. Vite emits only
what something references, so that copy never reached `dist/`, and the font files' own name
tables carry only the licence URL (ID 14), not its text (ID 13). The same text is therefore also
[`frontend/public/fonts/OFL.txt`](../../frontend/public/fonts/OFL.txt), which the build copies as
is: production serves it at `/fonts/OFL.txt` beside the fonts (checked in a scratch build), and a
test holds the two copies equal. Each `@font-face` keeps Google's latin `unicode-range`.

## Where the generator lives

`tools/` is unit `ops`, and `ops` may import nothing (`architecture.toml`), while tests may import
`fe/shared` but not `ops`. So the generator — pure, an object in and three strings out — is
`frontend/tokens/generate.js` (`fe/shared`), which the test runs in memory, and
[`tools/gen-tokens.mjs`](../../tools/gen-tokens.mjs), the path the plan and the Android plan name,
is a 17-line command that reads `tokens.json`, calls it and writes the files.

That leaves two `ops` files importing `fe/shared` at build time: `tools/gen-tokens.mjs` →
`frontend/tokens/generate.js` and `frontend/tailwind.config.js` → `frontend/tokens/tailwind-tokens.js`
(the plan's "extend … from `tailwind-tokens.js`"). Neither is visible to the index, which extracts
imports only under `frontend/src/` and `backend/app/`, so `./run violations` reports nothing new —
**that is the index's blind spot, not a clean bill**. Both are a tool reading generated data, not a
runtime dependency; the alternatives were a second copy of the generator in `tools/` (two sources
of truth, which the test exists to prevent) or a Tailwind theme typed by hand. Recorded under
*Open points* for Uli as owner: accept them as build-time data reads, or declare them in
`architecture.toml` (`RISK-GOV-001`: that approval is not independent).

## The theme

[`shared/theme.js`](../../frontend/src/shared/theme.js) decides; [`composables/useTheme.js`](../../frontend/src/composables/useTheme.js)
applies. A stored `light` or `dark` wins; anything else, or nothing, follows
`(prefers-color-scheme: dark)`. The key is the old UI's `theme`, and both UIs write only `light`
and `dark`, so a stored choice means the same in both. They differ only with nothing stored: the
old UI is then light (commit cb707b4), the new one follows the system — the plan's intent. Choosing
"System" in the new UI removes the key, which the old UI reads as light.

`useTheme()` starts once (later calls share the state), in a detached effect scope, and keeps three things in step, synchronously
on every change: `data-theme` on `<html>`, which switches the tokens; the `dark` class, so Tailwind's
`dark:` variants (`darkMode: 'class'`, kept) agree inside the new UI; and `<meta name="theme-color">`
from the tokens (`#fbf6ee` / `#1b1428`). It has **no caller in M1**: the new UI's frame (M4) is the
first, then the More sheet (M4) and Settings (M14). Calling it from `main.js` now would turn the old
views — which `?ui=neu` still renders — dark under a dark system while their own toggle says light.

The detached scope is a review fix: created in the scope of its first caller — a component's
`setup()` from M4 on — the watcher stopped when that component unmounted, and later choices and
system changes then reached storage but no longer the document. `frontend/tests/useTheme.test.js`
holds it (it fails with the scope removed).

## Where this departs from the plan or the prototype

1. **Three font files, not four** (*The fonts*).
2. **The generator is `frontend/tokens/generate.js`; `tools/gen-tokens.mjs` is a thin command**
   (*Where the generator lives*).
3. **The dark scheme switches on `data-theme` only, not on the media query.** 06's `tokens.css`
   puts the dark values (and `color-scheme`) under `@media (prefers-color-scheme: dark)` too. Here
   `useTheme` resolves the system preference itself and always sets `data-theme`, so the stylesheet
   needs no media query — and must not have one: it is loaded for the old UI as well, and
   `color-scheme: dark` on its root under a dark system would darken its native form controls and
   scrollbars. The light values stay on `:root`, unconditionally, as in 06.
4. **`tokens.css` defines the brand variables it uses** (`--ar-*` colours, the kit's four shadows
   and four trackings, all copied from the kit and held to it by a test), where 06 relied on the kit's `tokens.css` being
   loaded first. 06's CSS uses `--ar-shadow-*` and `--ar-tracking-snug`; with them in `tokens.json`
   later milestones port it unchanged, and "no shadows other than the kit's" has the kit's at hand.
   The font stacks are `--rw-font-*` directly (family plus the kit's fallbacks, from a new
   `fontFallback` group), not `--ar-font-*`, so the old UI's own `--ar-font-mono` is not redefined.
5. **`tokens.json` gains m3's names**: colours `press`, `overdueEdge`, `strike`, `kbd`, `key`,
   `swipe` (m3's values, light and dark) and the motion step `notice` (120 ms). Where m3 used a
   shared name with a slightly different value (`mute` 66 % vs 62 %, `ruleStrong`, `scrim`,
   `inverseAction`, the strike and collapse durations), 06's value is kept: the plan says the web's
   tokens are 06's, and m3's README says its values "equal the web's". Not added: m3's bare size
   names (`--rw-row`, `--rw-touch`, `--rw-ring` with Android's dp values) and `--rw-undo-hold` —
   `size.rowAndroid`/`touch`/`ringAndroid` and `motion.undo` already carry them, and a web
   `--rw-row: 56px` beside `--rw-size-row-web: 40px` would be a trap. Every colour 06 had keeps its
   value; the generated Kotlin differs from 06's only by the added lines.
6. **The Tailwind extension is prefixed `rw`** (`colors.rw.*`, `font-rw-sans`, `rounded-rw-pill`,
   `shadow-rw-sm`, `ease-rw`, `duration-rw-fast`), and also carries the kit's shadows. Unprefixed,
   `fontFamily.mono` would turn the old UI's four `font-mono` blocks (Tailwind's system monospace
   today) into JetBrains Mono.
7. **A new `frontend/src/shared/theme.js`**, not in the plan's file list: the pure part of
   `useTheme`, so it can be tested without a document (`frontend/AGENTS.md`: tests cover
   `src/shared/`).
8. **`useDarkMode.js` is not changed.** "Make both agree on stored values" holds without a change
   (*The theme*); its `theme-color` values (`#FFFFFF` / `#1F2937`) stay until M17 deletes it.

## Open points

- **Uli, as owner (`RISK-GOV-001`, not independent):** the two build-time `ops` → `fe/shared`
  imports (*Where the generator lives*) — accept as data reads, or declare them. Until then a
  question to the index about `ops` or `tailwind-tokens.js` gets a clean answer that is incomplete
  (`./run impact frontend/tokens/tailwind-tokens.js` lists `theme.js`, not `tailwind.config.js`).
  Once decided, record it where a cold reader and the tools see it: an allowed edge
  `ops -> fe/shared` noted as build-time reads of generated token data, or a declared blind spot
  next to the `ops` unit naming the two files. M2's brief carries this point forward until then.
  No `architecture.toml`, baseline or gate-configuration change was made in M1.
- **For M4's brief (obligations, not options):**
  - **Hand the document back on `?ui=alt`.** Once `useTheme` has run, nothing removes the
    `data-theme` attribute, the `dark` class or its `theme-color`; M0's `pick()` switches UIs on a
    client-side navigation without a reload, so the old UI would then render with the new UI's
    `dark` class and, under `data-theme="dark"`, `color-scheme: dark` on its native controls — a
    change to the old UI that ADR 0042 forbids before M16. M4 gives `useTheme` a release path
    (delete `dataset.theme`, restore the class and `theme-color` from `useDarkMode`'s value) and
    calls it whenever the rendered UI is `alt`, or applies the theme only between AppFrame's mount
    and unmount. Latent in M1: there is no caller.
  - **Dark first paint.** Without 06's media query (deviation 3), the new UI's first paint under a
    dark system with nothing stored is light until `useTheme` runs. M4 calls `useTheme()` before
    the app mounts when `uiFlag` reads `neu` (from `main.js`), so `data-theme` is set before the
    first paint, and checks it with a `--dark` shot of the first frame.
- **For the Android plan:** it names `tools/gen-tokens.mjs` as the generator; the logic is in
  `frontend/tokens/generate.js`, the command still at that path. `RunwayTokens.kt` gained six colours
  per scheme and `NOTICE_MS`.
- **`RULE-GOV-002` is red on this branch and on `main`**: the decay review is overdue since
  2026-10-14. Outside this change; no decay evidence is committed with it.
- **Pending for Uli** (none blocks the milestone): approval of this commit and the stacked branch;
  after the merge, one look at production on a phone and in Safari that the type renders (the
  device check the harness cannot do); the plan's section-10 live-data steps begin with M3/M5 and
  are not owed here.

## Pre-checks

- **Before touching anything** (branch `ui/m1-design-tokens` just created from
  `ui/m0-coexistence-switch` at `05585c1`, tree clean): `make check` **GREEN**, 16 s of 180 s.
- **Tests:** frontend **102 → 131 passed** (29 new: 21 in `frontend/tests/tokens.test.js`, 6 in
  `frontend/tests/theme.test.js`, 2 in `frontend/tests/useTheme.test.js`); backend unit **642 passed**, unchanged; container tier by hand
  against `/opt/homebrew/bin/task` 3.5.0 (`cd backend && TZ=UTC PYTHONDONTWRITEBYTECODE=1
  .venv/bin/python -m pytest -p no:cacheprovider -m container tests/container`) **81 passed**,
  unchanged — a control, this change has no Python.
- **The new tests can fail.** Faults put in one at a time, each reverted (the tree was compared
  with copies afterwards): a hand edit in `tokens.css` (`--rw-dur-fast` 100 ms) → 1 failed (the
  generated-file test); light `mute` lowered to 50 % and regenerated → 1 failed (muted text below
  4.5:1); `coral` changed by one step and regenerated → 2 failed (kit fidelity, agreement with
  `style.css`); a non-brand leaf (`teal`) in a mix → the file fails to load (the generator refuses
  it); dark `press` removed and regenerated → 1 failed (both schemes name the same colours);
  `parseTheme` made case-insensitive and trimming → 2 failed; the system preference winning over a
  stored choice → 1 failed. Added with the review fixes: the kit's `md` shadow darkened in
  `tokens.json` and regenerated → 2 failed (kit shadows, agreement with `style.css`); the old,
  non-premultiplied mixing restored in `generate.js` → 1 failed (the mixing test; the committed
  files are unchanged by the fix, every current mix has opaque operands); `effectScope(true)`
  removed from `useTheme.js` → 1 failed (data-theme stayed `light` after the first caller's
  scope stopped — the reviewer's reproduction).
- **Generator:** `node tools/gen-tokens.mjs` reproduces the three committed files byte for byte
  (that is the test). Every colour of 06's `RunwayTokens.kt` has the same ARGB value in the
  generated one; the diff is the added lines (six colours per scheme, `NOTICE_MS`).
- **Index** (after `./run index`; new files made visible with `git add -N`): `./run map` →
  `frontend/tokens/{tokens.json,generate.js,tailwind-tokens.js,RunwayTokens.kt}`,
  `frontend/src/shared/theme.js`, `frontend/src/composables/useTheme.js` → `fe/shared`;
  `frontend/src/assets/{fonts.css,tokens.css,fonts/*.woff2,fonts/OFL.txt}` → `fe/app`;
  `tools/gen-tokens.mjs` and `frontend/public/fonts/OFL.txt` → `ops`; the three tests → `tests`. `./run impact frontend/src/shared/theme.js`:
  direct dependent `useTheme.js`, both without import-derived test protection (F13, hence the tests
  named above). `./run violations`: the two declared cycles, nothing new (and see *Where the
  generator lives* for what it cannot see). Before you start, as the plan asks: `./run impact` of
  `style.css` (dependent `main.js`), `index.html` (none), `useDarkMode.js` (`AppShell.vue`, router,
  seven views); `./run map frontend/tailwind.config.js` → `ops`.
- **`./run surfaces`:** no drift (exit 0), 5 snapshots match — no key and no route added.
- **Budgets** (production build into the scratchpad, never into the repository; rebuilt after the
  review fixes with the same numbers, and `dist/fonts/OFL.txt` now present): entry JavaScript
  **249.45 kB, 81.73 kB gzip**, unchanged from M0 (nothing imports `useTheme` yet, so `theme.js` and
  `tailwind-tokens.js` are not in the bundle; budget ≤ 130 kB); CSS **34.07 → 39.92 kB, 6.60 → 7.72
  kB gzip** (`tokens.css`, `fonts.css`; budget ≤ 20 kB); fonts **3 woff2 files, 95.5 kB** (22 320 +
  31 340 + 41 808 bytes; budget 4 files, ≤ 160 kB), emitted with content hashes; the built
  `index.html` preloads `/assets/space-grotesk-<hash>.woff2`, the same URL `fonts.css`
  references, so the preload is used rather than fetched twice. Lens and frame budgets do not apply
  yet.
- **Screenshots**, in [`build/m1/`](../design/2026-10-31-unified-ui/build/m1/README.md), each looked
  at: the old UI's `/next` desktop light and dark, narrow light and dark, `/inbox` phone light and
  dark, `/settings` desktop, `/next` with the task modal open (`--eval` click, read-only), `/next`
  in WebKit, before (M0) and after; the review added the narrow, phone-dark, settings and modal
  pairs, their "before" served from a temporary worktree of `ui/m0-coexistence-switch` on a second
  Vite port (removed afterwards). In these views the differences are only the semibold and bold
  text (page titles, section headings, urgency badges, the modal's title and buttons) and the
  sub-pixel shift of the row text next to the badges; ProjectsView, ProjectPlanModal and
  TaskActionSheet were not shot; Space Grotesk 400/500 and
  JetBrains Mono text is unchanged. `/login` logged out (Space Grotesk 400/500 and JetBrains Mono, no
  bold) is pixel for pixel identical to M0's `build/m0/after/login-desktop-light.png`. No console
  error or warning in any shot. The `--requests` lists show `fonts.googleapis.com` and
  `fonts.gstatic.com` before and no request off `127.0.0.1` after, on `/next` and on `/login`.
  No full light/dark/narrow/phone matrix of the new UI: M1 adds no view.
- **`useTheme` in the running SPA** (dev harness, `/login`, the module imported through Vite with
  `--eval`, since nothing calls it yet): nothing stored and a light system → `system`, `light`,
  `data-theme="light"`, no `dark` class, theme-color `#fbf6ee`, `color-scheme: light`; a dark
  system → `dark`, the `dark` class, `#1b1428`, `--rw-bg` `#1B1428`, `color-scheme: dark`;
  `setChoice('light')` under a dark system → light at once, `localStorage.theme = "light"`;
  `setChoice('system')` → the key removed, dark again; stored `light` under a dark system → light;
  stored `bogus` under a dark system → `system`, dark. Without `useTheme` (the old UI) under a dark
  system: no `data-theme`, `color-scheme: normal`, theme-color `#FFFFFF` from `useDarkMode` — as
  before. Not exercised: the system preference changing while the page is open (the listener).
- **Accessibility:** no new UI and no new interaction, so the keyboard walkthrough and accessible
  names have nothing new to cover. axe-core 4.10.2 on the old `/next` after the change: 1 serious
  violation (`color-contrast`, 5 nodes) and 2 moderate or minor — the same as M0 reported, all the
  old UI's.
- **`make check`**: GREEN, 15 s. **`make verify`: RED on `RULE-GOV-002` only**, 109 s of 600 s on the
  final tree after the review fixes; every other component green (`js-lint`, `js-test` 131, `index-fresh`, `contract`,
  `surfaces`, `supply-chain`, `boundaries` with 0 new and 0 forbidden edges, …), the container tier
  skipped (no Docker, `RISK-TEST-001`; run by hand above); gate conformance **56 fixture arms
  passed, 0 failed; 46 of 49 executable rules proven able to fail**, unchanged.
