# M1 — the old UI before and after the local fonts

Milestone M1 of [the plan](../../../../plan/unified-ui-web.md) adds the design tokens, the theme
logic of the new UI and the brand fonts as local files. The new UI has no view yet, so the only
thing a person can see change is the old UI's type: its fonts now come from this origin instead
of Google Fonts, and the weights Google never delivered (Tailwind's `font-semibold` and
`font-bold`) are drawn instead of synthesised. [Brief 0047](../../../../briefs/0047-design-tokens-and-local-fonts.md)
has the change; this folder has the proof.

All shots were taken on 2026-11-01 with [`shared/tools/shot.mjs`](../../shared/tools/shot.mjs)
against the dev harness (the real backend, Taskwarrior 3.5.0, the Vite dev server, user `demo`
seeded with the 06 demo set shifted to that day), Chrome unless the name says `webkit`.
Desktop is 1440 × 900, narrow 1024 × 768, phone 412 × 915 @2x; dark is `--dark --storage=theme=dark`, because the
old UI reads only the stored theme.

| Folder | What |
|---|---|
| `before/` | branch `ui/m0-coexistence-switch` (the old UI as on `main`, fonts from Google); the pairs added after review (settings, narrow, phone dark, task modal) from a temporary worktree of that branch on a second Vite port against the same backend |
| `after/` | this branch, no `ui` choice stored: the old UI with the local fonts |

There is no 06 shot to compare with: M1 adds no view of the new UI.

## Requests

`*.requests.txt` is the tool's `--requests` list for the shot of the same name.

- `before/next-desktop-light.requests.txt`: `GET https://fonts.googleapis.com/css2?…` and
  `GET https://fonts.gstatic.com/s/spacegrotesk/v22/…woff2`.
- `after/next-desktop-light.requests.txt` and `after/login-desktop-light.requests.txt` (logged out):
  no request leaves `127.0.0.1`; the fonts are `GET /src/assets/fonts/space-grotesk.woff2` (once:
  the preload and the stylesheet's `url()` are the same request) and, on `/login`, which sets
  text in JetBrains Mono, `/src/assets/fonts/jetbrains-mono.woff2`. Fraunces is not requested:
  nothing in the old UI uses it.

## Comparison with `before/`

Differing pixels (Pillow, `ImageChops.difference`), with the bounding box of the difference.

| Shot | Differing pixels | Where |
|---|---|---|
| `next-desktop-light` | 25 304 | x 15-607: the semibold page title, the bold urgency badges, and the row text beside each badge, which moves by a fraction of a pixel because a drawn bold is narrower than a synthesised one |
| `next-desktop-dark` | 25 426 | the same |
| `inbox-phone-light` | 2 648 | x 33-157 (device pixels): the semibold page title |
| `webkit-next-desktop-light` | 42 448 | x 16-611: as in Chrome; WebKit's synthesised bold was visibly heavier, so the difference is larger |
| `next-narrow-light` | 21 566 | x 15-568: as on desktop (title, badges, the rows beside them) |
| `next-narrow-dark` | 21 656 | the same |
| `inbox-phone-dark` | 2 667 | x 33-157 (device pixels): the semibold page title and the bold urgency badges |
| `settings-desktop-light` | 1 183 | x 15-595: the semibold section heading "Account", the bold avatar initial and the sidebar's semibold "CONTEXT" label |
| `taskmodal-desktop-light` | 23 807 | x 15-897: inside the modal (`--eval` clicks the first row, read-only) the semibold title "Edit task", the priority buttons and the two footer buttons; behind the backdrop the same list changes as in `next-desktop-light` |

In the views shot here, everything set in Space Grotesk 400/500 or JetBrains Mono is unchanged: the files are the same
bytes Google served (SHA-1 compared, brief 0047). `/login` (logged out, no bold text) is pixel for
pixel identical to [`../m0/after/login-desktop-light.png`](../m0/after/login-desktop-light.png).
No console error or warning in any shot. Not shot: ProjectsView, ProjectPlanModal and the phone's
TaskActionSheet, which use the same `font-semibold`/`font-bold` classes; by the same mechanism they
change in the same way, but that is inferred, not shown.
