# M0 — the old UI before and after the switch

Milestone M0 of [the plan](../../../../plan/unified-ui-web.md) puts every route behind the `?ui=`
switch with both sides still pointing at the old views, so the old UI must render exactly as
before. [Brief 0046](../../../../briefs/0046-the-new-ui-coexists-behind-a-switch.md) has the
change; this folder has the proof.

All shots were taken on 2026-11-01 with [`shared/tools/shot.mjs`](../../shared/tools/shot.mjs)
against the dev harness (the real backend, Taskwarrior 3.5.0, the Vite dev server, user `demo`
seeded with the 06 demo set shifted to that day), Chrome unless the name says `webkit`.
Desktop is 1440 × 900, phone 412 × 915 @2x; dark is `--dark --storage=theme=dark`, because the
old UI reads only the stored theme.

| Folder | What |
|---|---|
| `before/` | `main` at `11e1287`, before this change: `/next` and `/inbox` taken by the harness; the other routes from `main`'s frontend (`git archive main frontend`, Vite on :5174) against the same backend and user |
| `after/` | this branch, no choice stored: the default, `alt` |
| `neu/` | this branch with `localStorage['ui'] = 'neu'`: two of the eighteen, the other sixteen compared below and not kept |

There is no 06 shot to compare with: M0 adds no view of the new UI.

Every rendered route is covered: `/next` and `/inbox` in the full matrix (desktop and phone, light
and dark, WebKit, axe), and the other seven desktop light — `/login` (logged out), `/waiting`,
`/someday`, `/projects`, `/projects/Website-Relaunch`, `/all`, `/settings` — plus `project-open`,
`/projects` with Website-Relaunch clicked open (`--eval`), because the old `ProjectsView` opens a
project only on a click and renders `/projects/:name` as the list, on `main` as here.

## Comparison with `before/`

ImageMagick `compare -metric AE` (differing pixels) and the SHA-256 of the files.

| Shot | `after/` | `neu/` (all taken) |
|---|---|---|
| `next-desktop-light`, `inbox-desktop-light`, `inbox-desktop-dark`, `inbox-phone-light`, `inbox-phone-dark`, `webkit-next-desktop-light`, `axe-next-desktop-light` | identical files | identical files |
| `next-desktop-dark` | AE 0.007: 2 pixels, at most 3 of 255 levels apart | identical file |
| `next-phone-light`, `next-phone-dark` | AE 0.31 / 0.57: one 12 × 12 box at (104, 422) | identical files |
| `login-desktop-light`, `waiting-desktop-light`, `someday-desktop-light`, `projects-desktop-light`, `project-website-relaunch-desktop-light`, `project-open-desktop-light`, `all-desktop-light`, `settings-desktop-light` | identical files (AE 0) | identical files (AE 0) |

The three differences are not the change: the 12 × 12 box is the old row's pulsing "läuft" dot
(`animate-pulse`), and two shots of the same page on the same branch differ in exactly that box
(AE 0.64); the two dark-desktop pixels are anti-aliasing noise, 3 levels at most.

axe-core 4.10.2 on `/next` (desktop, light) reports the same in all three: 1 serious violation,
`color-contrast` on the same 5 nodes, plus 2 moderate or minor — the old UI's, unchanged
(`*/axe-next-desktop-light.txt`). `shot.mjs` finds axe-core at `--axe=<path>`, then
`$AXE_CORE_PATH`, then beside its Playwright install; with none of them it exits 2, so a missing
axe-core cannot pass for a clean report.

## The switch, driven in the running SPA

Read back with `--eval` (the stored value and the component tree under `RouterView`):

| URL | Stored before | Stored after | Rendered |
|---|---|---|---|
| `/next?ui=neu` | — | `neu` | `UiPick > NextView` |
| `/next?ui=alt` | `neu` | `alt` | `UiPick > NextView` |
| `/next?ui=NEU` | `neu` | `neu` (ignored) | `UiPick > NextView` |
| `/next?ui=neu&ui=alt` | — | — (ignored) | `UiPick > NextView` |
| `/next?ui=neu`, logged out | — | `neu`, kept through the redirect | `UiPick > LoginView` at `/login` |
| `/?ui=neu` | — | `neu` | `UiPick > InboxView` at `/inbox?ui=neu` |
| `/projects/Website-Relaunch` | — | — | `UiPick > ProjectsView` |

Navigating inside the SPA, `/projects` → `/projects/Website-Relaunch` keeps the same
`ProjectsView` instance (patched, as without the wrapper), `/inbox` → `/next` mounts a new one, and
`/next` → `/next?ui=neu` keeps it.
