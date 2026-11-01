# M3 — the snapshot store and the outbox, on the dev harness

Milestone M3 of [the plan](../../../../plan/unified-ui-web.md) adds the new UI's data layer and
no view: [brief 0049](../../../../briefs/0049-snapshot-store-and-outbox.md) has the change. This
folder has the proof that it works against the real backend.

All of it was taken on 2026-11-01 against the dev harness (the real backend, Taskwarrior 3.5.0,
the Vite dev server). Reads used the shared user `demo` (the 06 demo set); everything that
writes used this milestone's own user `m3-agent` (the same set, seeded separately).

| File | What |
|---|---|
| `debug-store-desktop-light.png`, `-desktop-dark.png`, `-phone-light.png`, `-phone-dark.png` | the development page `/next?ui=neu&debug=store` as `demo`: what the store computes, as JSON. Not a view of the new UI (there is none yet) and absent from production builds; there is no 06 shot to compare with. Dark follows `prefers-color-scheme` through `useTheme`. |
| `old-next-desktop-light.png` | the old UI's Nächste on this branch, no `ui` choice stored: unchanged (see the brief's *Pre-checks* for the comparison with the M2 branch). |
| `harness-runs.txt` | the output of a scratch Playwright script (kept in the session's scratchpad, not in the repository) that drives the store through `window.__runway.gtd` and reads the backend's access log: keepalive on close, undo inside the hold, offline and back, a refused write, a 401 during a hold, a capture whose page closed mid-request, a hidden tab during a hold, the refresh throttle. |

## What the runs show

- **Keepalive** — a done ticked at 13:24:09.481, the page closed 2 s later (13:24:11.486): the
  backend logged `POST /tasks/<uuid>/done 204` at 13:24:11.511, four seconds before the hold would
  have ended; the task is completed on the server. (The doubled `/gtd/*` reads before it came from
  a first version of the development page that read the server lists twice; fixed.)
- **Undo inside the hold** — hidden while held, back in the list after Rückgängig, still
  `pending` on the server 7 s later, queue empty: nothing was sent.
- **Offline** — a move while the browser is offline: op `failed` (`network`), the row shows the
  move with `sync: failed`; a refresh keeps the 26 rows and the Stand and sets `offline`. Back
  online: the op is sent, the queue is empty, `offline` is cleared at once (the return of the
  network may skip the 30 s wait), the server has the new tags and the cleared follow-up day.
  Rückgängig of that sent move restores `waiting` and the follow-up day on the server.
- **Refused (400 `Invalid tag: a/b`)** — `failed` with the server's message; `focus` and `online`
  send nothing; "Erneut senden" sends once (400 again); undo dismisses it.
- **401 during a hold** — the token is made invalid while a done is held: the hold's request is
  refused, the interceptor drops the token and loads `/login`; the queue in storage holds the
  done as `auth`. After logging in through the old login page and opening the store again, the
  done is sent and the task is completed.
- **Capture, page closed mid-request** — stored as `sending` before the request left; the request
  did reach the server (`POST /inbox 201`). The reopened page verified it with
  `GET /tasks?status=all&q=…` instead of posting again: one copy on the server, one row.
- **Hidden tab** — 1 s into a hold, `visibilitychange → hidden` sends the done at once.
- **Throttle** — five `focus` events within 2 s of the first load: no further `GET /gtd/summary`.
