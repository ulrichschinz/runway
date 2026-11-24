# ADR 0048 — Container hardening and the browser edge

- **Date:** 2026-11-24
- **Status:** Accepted
- **Scope:** `backend/Dockerfile`, `backend/Dockerfile.test`, `frontend/Dockerfile`,
  `frontend/nginx.conf`, `frontend/nginx-main.conf`, `ops/deploy/docker-compose.yml`,
  `docker-compose.yml`, `ops/deploy/volume_ownership.py`, `tools/checks/` (RULE-OPS-004,
  RULE-OPS-005, the RULE-TEST-002 tier), `rules/shims.yaml`, `.github/workflows/deploy.yml`
- **Brief:** [0076](../briefs/0076-container-hardening-and-the-browser-edge.md)
- **Findings:** SEC-003 and SEC-004 of the security audit `20261118T131510Z-claude`, both upheld by
  its independent review, both *low / hardening*: neither is an exploit, each removes a layer that
  bounds some other defect.

## Context

The backend image declared no `USER`, and neither compose file said anything about privilege, so
uvicorn and every `task` it spawns ran as uid 0 on a writable root filesystem with Docker's default
capability set. A write primitive inside the container — SEC-001's `../` directory creation is the
worked example — therefore reached the whole container: the application code in `/app` included.

nginx, the last server of ours a browser talks to, sent no security header. Nothing stopped the SPA
being framed, and nothing bounded what an injected script could load or where it could send the
JWT that lives in `localStorage`. No script-injection sink is known; Vue escapes by default.

Three constraints shaped the answer. **Merging to `main` deploys**, compose included (ADR 0032), so
every step has to start on the data as it is. **Nobody has read who owns the host's files** — the
remediation plan's M0 lists that as open — so a change that assumed root ownership could take
every write down on the deploy that shipped it. And **Traefik terminates TLS** in front of nginx and
is shared host infrastructure this repository does not own.

## Decision 1 — numeric, dedicated, non-root users in both images

Backend `10001:10001` (`runway`), frontend `10002:10002` (`runway-web`); no login shell, no home.
Numbers, not names, because the compose file, the host's ownership and the gate all have to name
the same principal and a name can resolve to anything — root included. Dedicated rather than the
base image's `nginx` (101), so the uid is one this repository chose. Code stays root-owned and so
read-only to the process; each image owns only the directories it must write.

## Decision 2 — read-only root, tmpfs, no new privileges, capabilities dropped

Both services: `read_only: true`, one size-capped `noexec,nosuid,nodev` tmpfs on `/tmp`,
`no-new-privileges:true`, an explicit `user:`. The frontend drops every capability from the first
deploy: it holds no data, listens on 4000, and its own main config moves the pid file, the temp
paths and the generated server block under `/tmp`.

## Decision 3 — the backend switches in four steps, the data never moves

SQLite creates its rollback journal **beside** the database. With `DB_PATH=/app/users.db` that was
`/app`, the image's own layer: unwritable under a read-only root or to uid 10001, and lost whenever
the container was recreated. So the compose mounts a new directory `./db` at `/app/db` and mounts
the **existing** host file `./users.db` inside it at `/app/db/users.db`. Same inode, new directory:
nothing is copied, the journal persists on the host, and the previous compose still opens exactly
this database.

The user cannot switch on the same deploy, because the files belong to root. So:

1. **Expand** (this change): images carry the users, the compose carries every hardening, and the
   backend stays uid 0 through `user: "${RUNWAY_BACKEND_USER:-0:0}"` with every default capability
   dropped **except `DAC_OVERRIDE`** — a root process without it could not write a host file root
   does not own, and nobody has read whether any exists.
2. **Migrate** (operator): `/opt/runway/volume_ownership.py` inside the image — dry-run, review,
   `--apply`, dry-run again until clean. Deliberately not `chown -R`: it walks only the shape the
   application creates, refuses symlinks, hard links, special files, foreign devices and anything
   deeper than expected, refuses to apply anything while one exists, and re-checks each inode
   before changing it. Modes become owner-only — `users.db` holds cleartext API keys
   (`WAIVER-SEC-003`) and was world-readable on the host.
3. **Switch** (operator): `RUNWAY_BACKEND_USER=10001:10001` in the host's `.env`. Undo is deleting
   the line: uid 0 with `DAC_OVERRIDE` still writes the migrated files.
4. **Contract** (its own change, after 14 days on uid 10001, **by 2027-02-28**): the compose default
   becomes `10001:10001`, `cap_drop: [ALL]`, the variable and `SHIM-OPS-001` go.

The variable lives in the host's `.env`, like `RUNWAY_SHA`, rather than in a merge, because the
switch has to follow an operator step on the host that no commit can observe. `SHIM-OPS-001` puts a
date on it, and RULE-OPS-004 accepts the transitional shape only while the shim exists.

## Decision 4 — headers at nginx, always, never per location; CSP report-only first

At server level with `always`, so the 404, 405 and 502 an attacker can provoke carry them too, and
no `add_header` in any `location`, because nginx then inherits none. `X-Content-Type-Options:
nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, a `Permissions-Policy` that
denies every powerful feature except clipboard writing for this origin.

Two CSP headers. The **enforced** one carries only what cannot break the SPA —
`frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'` — so framing is
blocked from this deploy on. The **strict** one — same origin for everything, no inline script or
style, no eval, `data:` images only — is **report-only** until a soak in which every view of both
UIs is used with the console open, **by 2027-01-15** (`SHIM-WEB-001`). There is no reporting
endpoint: the plan forbids a foreign one and none of our own exists.

The strict policy is not a guess. A build test refuses inline script, inline style attributes,
`eval` and off-origin references in what Vite emits; and one headless-browser pass under the
**enforced** strict policy, logged in, over every route of both UIs with real Taskwarrior data,
saw zero violations, with a positive control proving the probe sees one (brief 0076).

## Decision 5 — no HSTS in this repository

This nginx speaks plain HTTP behind Traefik. HSTS set here would claim something about hosts this
file cannot see, and a wrong HSTS is not undone by a rollback: browsers remember it. It belongs on
the TLS terminator, after confirming every host under the name is permanently HTTPS.
`docs/operations.md` says how; `verify-deploy` reports whether it is present and does not fail on it.

## Decision 6 — two static rules, a widened container tier, a post-deploy read

- **RULE-OPS-004** holds the compose and the final-stage `USER` together, in the existing
  deploy-compose check, because the compose `user:` overrides the image and either can silently
  undo the other.
- **RULE-OPS-005** holds the nginx declaration: present, `always`, no per-location override,
  same-origin, no reporting, no HSTS, strict policy enforced once the shim is gone.
- **RULE-TEST-002**'s tier now runs the suite as uid 10001 on a read-only root, then the runtime
  images under the deploy flags: legacy mode, the migration including a refused symlink, switched
  mode, rollback of the switch, and the headers on 200, fallback, asset, 405, proxied 404 and 502.
- **`verify-deploy`** reads the headers from the public origin after every deploy.

Each one says only what it can: a static rule is a declaration, the container tier is our image,
and only the post-deploy step sees Traefik (`RISK-OPS-008`).

## Consequences

- **Rollback across this change needs the old compose too.** The old frontend image writes its
  config into `/etc/nginx` and cannot start read-only. The data needs nothing.
- Backups gain nothing to copy but lose nothing either: `./users.db` is still the database, and
  `./db` holds only the placeholder Docker leaves and, while a write is in flight, the journal.
- SEC-003 is **not closed** until the switch has happened; SEC-004 is **not closed** until the
  strict policy is enforced and the public answer has been read after an authorised deploy.
- Non-root is not tenant isolation and is not claimed as such; that boundary is still `TASKDATA`.

## Alternatives rejected

- **Switch the user on deploy and `chown -R` in an entrypoint.** A root entrypoint on every start,
  a recursive chown over whatever it finds — the exact shape the plan forbids.
- **Keep the journal in a tmpfs.** A crash between the journal write and the commit would leave
  a database the next start cannot roll back.
- **Make `/app` group-writable for the journal.** uvicorn imports from its working directory, so a
  writable `/app` would let a write primitive shadow a module on the next start.
- **Enforce the strict CSP at once.** The plan asks for report-only first, and a policy that blocks
  one view breaks it for every user on the deploy that ships it.
