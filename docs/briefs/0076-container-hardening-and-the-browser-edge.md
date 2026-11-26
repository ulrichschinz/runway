# Change Impact Brief 0076 — Container hardening and the browser edge

| Field | Value |
|---|---|
| **Requested outcome** | Work package M7.3 + M7.4 of the November 2026 security remediation plan (`docs/plan/security-remediation-2026-11.md`, untracked, German), ordered by Uli on **2026-11-24** ("please fully implement security-fixes for all"). Findings SEC-003 (the backend image runs as root, no `USER`, no compose hardening) and SEC-004 (nginx sends no browser security headers). Both were rated *low / hardening* by the audit and its Codex review: neither is an exploit on its own; each removes a layer that bounds some other defect. |
| **Owning unit** | `ops` — `backend/Dockerfile`, `backend/Dockerfile.test`, `frontend/Dockerfile`, `frontend/nginx.conf`, new `frontend/nginx-main.conf`, `ops/deploy/docker-compose.yml`, `docker-compose.yml`, new `ops/deploy/volume_ownership.py`, `tools/checks/deploy_compose.py`, new `tools/checks/edge_headers.py` + `edge-headers.sh`, `tools/checks/py-test-container.sh`, new `tools/checks/container_hardening.py`, `tools/checks/profiles.conf`, `tools/fixtures/negative.sh`, `tools/bootstrap.sh`, `tools/checks/repo-hygiene.sh`, `.dockerignore`, `.gitignore`, `.github/workflows/deploy.yml`, `rules/ledger.yaml`, `rules/shims.yaml`, `architecture.toml` (one path). `tests` — new `backend/tests/unit/test_volume_ownership.py`, new `frontend/tests/cspBuild.test.js`. `docs` — this brief, ADR 0048, `docs/security.md`, `docs/threat-model.md`, `docs/operations.md`, `README.md`. |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §2 (procedure), §5 (env vars documented in README; container images), §6 (governance files: ledger, shims, `architecture.toml`, gate config — owner approval, `RISK-GOV-001`), §9 (META-RULE: check + ledger + fixture + docs + ADR in one commit). [`docs/change-workflow.md`](../change-workflow.md) *Security or Operability Change* and *Public-Surface or Data Migration*. |
| **Governed by** | New [ADR 0048](../adr/0048-container-hardening-and-the-browser-edge.md). Builds on ADR 0032 (the compose file is deployed from the image) and ADR 0006 (two test tiers). |
| **Rule IDs introduced** | `RULE-OPS-004` (container hardening floor: deploy compose + final-stage `USER`), `RULE-OPS-005` (browser headers declared at the nginx edge). `RULE-TEST-002` is widened: the container tier also runs the *runtime* images under the deploy hardening. Three dated shims: `SHIM-OPS-001` (backend still uid 0 until the host volumes are migrated), `SHIM-OPS-002` (frontend compose keeps the previous deploy's shape for one deploy, so `RUNWAY_SHA` alone rolls back — second review), `SHIM-WEB-001` (strict CSP still report-only). `RULE-OPS-003` is widened (second review): host `pid`/`ipc`/`uts`/`userns_mode`/`cgroup` namespaces, `devices`, `device_cgroup_rules` and `sysctls` are refused. |
| **Entry points** | Container start (`CMD` of both images), the compose service blocks, nginx `server {}`. Operator entry point: `python /opt/runway/volume_ownership.py` inside the backend image. |
| **Affected public surfaces** | **Container images**: the frontend now ends on a numeric non-root `USER 10002:10002`; the backend carries `10001:10001` but ends on `USER 0:0` until the contract step (see *Review amendments*). **Deploy compose**: new `./db` bind mount, `DB_PATH` moves from `/app/users.db` to `/app/db/users.db` while the *same host file* `./users.db` is still mounted there (see *Migration*). **Env**: new compose-only variable `RUNWAY_BACKEND_USER` (not read by the application, so not a `Settings` field; documented in README beside `RUNWAY_SHA`). `DB_PATH`'s README default stays the application default `/app/users.db`; only the compose value changes. **HTTP**: every response through nginx gains six headers. No REST route, MCP tool, DB schema, SPA route or `localStorage` key changes, so `ops/surfaces/` is untouched. |
| **Known dependents** | From `./run impact` (index current at `5d85f6ee539e`, 1636 nodes): no import dependents for any file above; every one is `files_without_import_derived_test_protection`. Blind spots: `BLIND-OPS-001` (the host's compose is this file, but nothing observes the write), `BLIND-NGINX-001` (nginx.conf is templated at start), `BLIND-TEST-001`. `frontend/src/layout/lens/LensFlat.vue` was checked as a CSP risk (inline `style=` on SVG stops) and needs **no change**: the build compiles it to a CSSOM style object, not an attribute. Consumers of the edge: the SPA, MCP clients via `/api/mcp`, the webhook `/api/inbox`, CI's `verify-deploy`. |
| **Uncertain / dynamic areas** | (1) **Host ownership is unknown** (plan M0): who owns `/opt/services/runway/users.db` and `data/**` was never read. That is why the backend's switch to uid 10001 is an operator step behind a dry-run, not part of this deploy, and why the transitional root keeps `DAC_OVERRIDE`. (2) **Traefik** terminates TLS and may add, strip or override headers; only `verify-deploy` against the public origin sees that. (3) **Arm64**: the container tier cannot run on this machine (`RISK-TEST-001`), so the runtime-image proofs run first in CI. (4) The strict CSP is proven against a local build and a local headless browser, not against every view in production — hence report-only first. (5) **How `/opt/scripts/deploy.sh` extracts the baked compose** (`docker create`+`docker cp`, or a `docker run` as the image's user) has never been read from the host (plan M0), and the extraction has silently not happened before (`RISK-OPS-002`). This change is therefore built to be safe under *either* compose for the backend. |
| **Analogous implementations** | `RULE-OPS-003` in `tools/checks/deploy_compose.py` (bounds the deploy compose); `SHIM-SEC-006` (a dated compatibility shim with a removal step); the `verify-deploy` job (post-deploy evidence from the public origin). |
| **Delivery Pattern** | **Security or Operability Change** for both findings, with **expand → migrate → switch → contract** for the backend's data mounts and user (a data-bearing surface). |
| **Required tests** | See *Tests and evidence*. Red first: the two new static rules against today's tree; the volume-migration unit tests against a missing module; the CSP build scanner against a crafted inline script. |
| **Intended scope** | SEC-003 and SEC-004 only. **Not** in scope: SEC-001 (path-from-username; M1), API-key hashing (M4), body limits (M8), HSTS *configuration* (documented only, plan M7.4), moving `users.db` physically into `./db` (a later, optional contract step). |
| **Base revision** | `5d85f6e` (`main`) |

## Failure scenarios

**SEC-003.** A defect that yields a file write or a command inside the backend container — SEC-001's
`../` directory creation is the worked example — runs as uid 0 on a writable root filesystem with
Docker's default capability set. It can rewrite the application code under `/app` (persisting until the
image is re-pulled), create files anywhere in the container, and use `CHOWN`, `FOWNER`, `SETUID`,
`NET_RAW` and the rest. What it gets is the container, not the host and not other tenants; non-root does
not prove tenant isolation and is not claimed to.

**SEC-004.** An attacker frames the SPA on their own page (clickjacking), or a future script-injection
sink runs attacker script on the origin, where the JWT lives in `localStorage`. Without a CSP nothing
limits where that script loads from or sends data to; without `nosniff` a mistyped response can be
sniffed into script.

## Controls

**Backend image.** A dedicated `runway` user, uid/gid `10001`, no login shell, no home. The code stays
root-owned and is therefore read-only to the process. `/app/data` and the new `/app/db` are the only
directories it owns. The image still ends on `USER 0:0` until the contract step, so it behaves as before
under the previous compose; the deploy compose names its user explicitly (amended after review).

**Frontend image.** A dedicated `runway-web` user, uid/gid `10002`, no login shell. A main nginx
config of our own puts the pid file, the temp paths and the generated server config under `/tmp`, so
the container runs non-root on a read-only root with one tmpfs. `USER 10002:10002`.

**Deploy compose, both services.** A size-capped `noexec,nosuid,nodev` tmpfs on `/tmp` and
`security_opt: [no-new-privileges:true]` — the only `security_opt` key allowed, its last value the one
that counts — and no `group_add`. The backend also `read_only: true` and an explicit `user:`. The
frontend, for this deploy only, keeps the previous deploy's shape otherwise — no `user:`, a writable root,
Docker's default capabilities — so that the image of the commit before this one still starts under it
(`SHIM-OPS-002`, second review). Its image runs as uid 10002 regardless, from its own `USER`; the compose
`read_only: true`, `cap_drop: [ALL]` and `user: "10002:10002"` follow in the frontend's switch change. The
backend, until the operator has migrated volume ownership: `user:
"${RUNWAY_BACKEND_USER:-0:0}"` and every default capability dropped **except `DAC_OVERRIDE`**, so a
host file not owned by root keeps working exactly as today (`SHIM-OPS-001`).

**SQLite needs a writable directory.** The rollback journal is created beside the database. Today that
is `/app`, the image's own layer, which is why the journal is lost whenever the container is recreated.
Under a read-only root, or as uid 10001, `/app` is not writable and every write would fail. So the
compose mounts a new `./db` directory at `/app/db`, mounts the *existing* host file `./users.db` at
`/app/db/users.db` inside it, and sets `DB_PATH=/app/db/users.db`. Same inode, new directory: no file
moves, the journal now persists on the host, and the old image and old compose still read the same file.

**Volume-ownership migration.** `ops/deploy/volume_ownership.py`, shipped in the image at
`/opt/runway/volume_ownership.py`. Dry-run by default; `--apply` changes nothing unless the dry-run is
clean of anomalies. Targeted, not a recursive `chown`: it walks only `DATA_ROOT` (depth 2: account
directories and their files, plus `audit.db*`) and the `DB_PATH` directory (the database and its
journals), refuses to cross a device boundary, never follows or changes a symlink, refuses hard-linked
files, special files and anything deeper than expected, and opens each entry with `O_NOFOLLOW` and
re-checks its inode before `fchown`/`fchmod`. It also tightens modes to owner-only (`0700`/`0600`).
`users.db` holds cleartext API keys (`WAIVER-SEC-003`) and is world-readable on the host today.

**nginx edge.** At server level, with `always` so 4xx/5xx carry them too, and no `add_header` in any
`location` (which would silently drop the inherited set):
- `Content-Security-Policy` (enforced, safe subset): `frame-ancestors 'none'; object-src 'none';
  base-uri 'none'; form-action 'self'`.
- `Content-Security-Policy-Report-Only` (the strict policy): `default-src 'self'; script-src 'self';
  style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self';
  worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self';
  frame-ancestors 'none'`. No `report-uri`: no foreign reporting endpoint (plan M7.4).
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`,
  `Permissions-Policy` denying every powerful feature the SPA does not use (clipboard write stays
  `self`: Settings copies the API key and the MCP snippets).
- **No HSTS here.** This nginx speaks plain HTTP behind Traefik; HSTS belongs on the TLS terminator and
  only after confirming every affected host is permanently HTTPS. Documented in `docs/operations.md`.

## Migration — expand, migrate, switch, contract

| Step | What | When | Rollback |
|---|---|---|---|
| **Expand** (this change) | Images carry the users; compose mounts `./db`, moves `DB_PATH`, backend read-only root, tmpfs, no-new-privileges, reduced capabilities. Backend still uid 0, and its image still *defaults* to uid 0, so the new image also runs under the previous compose if the host keeps it. Frontend image non-root (uid 10002, writes only `/tmp`, headers); frontend compose in the previous shape plus tmpfs and no-new-privileges (`SHIM-OPS-002`). Migration tool shipped. | Deploys on merge — **after** the container tier's first green CI run. | Pin the previous `RUNWAY_SHA`. Both previous images start under this compose: the backend's as before, the frontend's because its block is the previous one plus a tmpfs on `/tmp` and no-new-privileges. Data needs nothing: the old compose mounts the same `./users.db`. |
| **Frontend switch** | A later change: the frontend compose gains `user: "10002:10002"`, `read_only: true`, `cap_drop: [ALL]`; `SHIM-OPS-002` is removed and `RULE-OPS-004` then holds the frontend to the full floor. | Trigger: this change deployed and `verify-deploy` green on it (its image is then the rollback target), **by 2026-12-31** (`SHIM-OPS-002` expires). | Pin `RUNWAY_SHA` to this change: its frontend image is the hardened one and starts under the switched compose. |
| **Migrate** | Operator: dry-run, review, `--apply`, dry-run again (must be clean). | Operator, after a backup; trigger = this change running in production. | Ownership change is harmless to uid 0, which still has `DAC_OVERRIDE`. |
| **Switch** | Operator sets `RUNWAY_BACKEND_USER=10001:10001` in the host `.env`, `docker compose up -d`, runs the post-deploy checks. | Operator, after a clean dry-run. | Delete the line, `up -d`: back to uid 0. Switching to 10001 again repeats *Migrate* first: what uid 0 created meanwhile is root's. |
| **Contract** | A later change: backend compose default and image `USER` `10001:10001`, `cap_drop: [ALL]`, the knob and `SHIM-OPS-001` removed — after the host's on-disk compose has been read and the `deploy.sh` extraction recorded (M0). Optionally `users.db` moved physically into `./db`. | After the switch has run without incident for 14 days, **by 2027-02-28** (`SHIM-OPS-001` expires; `RULE-SEC-002` fails the gate on that date). | Forward-fix only for the capability change; the data layout is unchanged. |

CSP follows the same shape: **report-only** now; a later change moves the strict policy into the enforced
header after a soak in which the maintainer has used every view with DevTools open and seen no violation,
**by 2027-01-15** (`SHIM-WEB-001` expires; the gate stops on the date).

## Tests and evidence

| Tier | Test | Status |
|---|---|---|
| Static gate | `RULE-OPS-004` against today's compose and Dockerfiles — red before the change (no `read_only`, no `user`, no `USER`), green after. | Observed red, then green. |
| Static gate | `RULE-OPS-005` against today's `nginx.conf` — red before the change (no header at all), green after. | Observed red, then green. |
| Negative fixtures | Six arms for `RULE-OPS-004` (writable root, root user, root spelled `00:00` in compose and Dockerfile, no `USER`, backend image switched to 10001 while the shim stands, shim removed) and five for `RULE-OPS-005` (no `always`, per-location `add_header`, `'unsafe-inline'`, HSTS, shim removed). | All eleven observed red in `make verify` (counts in *Review amendments*); seven more arms from the second review (see there). The two new arms were first observed **green** against the pre-review check — i.e. the check missed them. |
| Unit | `backend/tests/unit/test_volume_ownership.py`: dry-run changes nothing; apply converges and is idempotent; symlink, hard link, FIFO, foreign-depth entries refuse `--apply`; no path outside the two roots is touched; a swapped inode is refused. Written before the tool. | Observed red (module missing), then green. |
| Build | `frontend/tests/cspBuild.test.js`: builds the SPA and refuses inline scripts, inline handlers, `style=` attributes, `eval`/`new Function`, `javascript:` URLs and any off-origin `src`/`href`/`url()`; a crafted inline script proves the scanner can fail. | Observed red on the crafted input, green on the build. |
| Browser (local, one-off) | Built SPA behind a local proxy that **enforces** the strict policy, real Taskwarrior 3.5.0 backend, headless Chrome: login, every new-UI route, the old UI's main routes. | 0 violations over 16 page loads; positive control caught 2. Recorded below. |
| Container (CI, amd64) | `RULE-TEST-002` tier, now two parts: the existing suite **as uid 10001 on a read-only root with `cap_drop ALL`**; then the runtime images — the new backend image under the **previous** compose (no user, writable root, `./users.db` at `/app`), then under the deploy hardening: non-root uid, write refusal outside the mounts, legacy root-owned volume → symlink refused → dry-run → apply → clean, real Taskwarrior task created and read back as uid 10001, healthcheck, root fallback on migrated data, a uid-0 registration → dry-run plans it → apply → both accounts work as 10001 again, frontend non-root and read-only, headers on 200 `/`, SPA fallback, an asset, 405, proxied 404, 502. | **Never executed** — arm64, no Docker daemon (`RISK-TEST-001`). Every runtime-image property in this brief and in docs/operations.md#container-hardening is **pending this run**. Its first green CI run is a merge precondition, since merging deploys a read-only frontend whose start has never been executed. |
| Edge (post-deploy) | `verify-deploy` checks the public origin's headers on `/`, `/api/health` and a 404 after each deploy, and reports whether HSTS is present (informational). | Runs after the authorised deploy only. |

### The headless-browser pass, 2026-11-24

Real backend from this tree (uvicorn, Taskwarrior 3.5.0, synthetic account and five synthetic tasks,
data in a temporary directory), the production build served by a local stdlib proxy that sends the
strict policy from `frontend/nginx.conf` as the **enforced** `Content-Security-Policy`, headless Chrome
driven over CDP with a `securitypolicyviolation` listener installed before every document:

- `/login`, then logged in: `/`, `/next`, `/inbox`, `/all`, `/waiting`, `/someday`, `/projects`,
  `/projects/Probe`, `/review`, `/settings` in the new UI; `/?ui=alt`, `/next`, `/projects`, `/settings`
  in the old UI; back to `?ui=neu`. 16 page loads, every one rendered (62–267 nodes, stylesheets
  loaded), **0 violations**, no CSP console message.
- **Positive control:** an injected inline `<script>` did not run and a `style=""` attribute was
  refused; the listener recorded `script-src-elem` and `style-src-attr`. The probe can see a violation.

This is not nginx — it shows only that the build runs under the policy string, which is why the
nginx behaviour is proven separately in the container tier.

### `verify-deploy` header step

Extracted from `deploy.yml` and run against a stub `curl`: exit 0 with every header present; exit 1 naming
`x-content-type-options` when it is dropped from the 404 only.

**Forbidden pseudo-evidence, honoured.** Local nginx headers are not the TLS terminator's answer —
hence the post-deploy check. Non-root is not tenant isolation. A green static rule is a declaration,
not a response — hence the container tier.

## Review amendments (2026-11-24)

An independent review of the first commit raised seven points; each was checked against the tree.

1. **New backend image under the previous compose** (important, upheld). With `USER 10001:10001` the
   image would run as 10001 under any compose naming no user — the previous one included, which the
   host keeps whenever `deploy.sh` does not extract the new file. There it could write neither
   `users.db` nor a task, behind a green `/api/health`. Fixed: the image ends on `USER 0:0` while
   `SHIM-OPS-001` stands; `RULE-OPS-004` requires exactly that (arm `OPS-004-early-user`, observed green
   against the old check, red after); the container tier's new step 0 runs the image under the previous
   compose's flags and mounts.
2. **Frontend rollback needs the old compose** (minor, upheld as a trade, not fixed in code —
   **superseded by the second review, point 2 below**). No compose
   shape starts both the old frontend image (root nginx: writes `/etc/nginx/conf.d`, needs `SETUID`,
   `SETGID`, `CHOWN`; a tmpfs on `conf.d` would also hide its template) and the hardened one. The
   alternative — frontend hardening one deploy later — ships it unhardened meanwhile. The procedure is
   documented; **merge needs the maintainer's sign-off on it**.
3. **Switching back to 10001 after an undo** (minor, upheld). Documented in docs/operations.md; container
   step 5 now registers an account as uid 0 and proves the dry-run plans it and 10001 works after a
   second apply.
4. **Symlink fixture assumed the username layout** (minor, upheld). It is now planted in whichever account
   directory exists, so it survives SEC-001's storage ids (brief 0065). **Merge-order note:** whichever of
   SEC-001 and this lands second must re-run the container tier on the merged tree.
5. **`00:00` passed as non-root** (minor, upheld). Root is now judged by integer value; arm
   `OPS-004-zero-pad` (observed green against the old check, red after).
6. **`/api/docs`, `/api/redoc` under the strict CSP** (minor, upheld). Recorded in `SHIM-WEB-001`'s
   removal and evidence, docs/security.md and ADR 0048: the enforcing change must decide them.
7. **Runtime claims stated as held** (minor, upheld). Scoped as *pending the first CI run* here, in
   docs/operations.md, docs/threat-model.md, ADR 0048 and RULE-TEST-002's rationale.

Gate after the amendments, this checkout (arm64): `make check` GREEN; `make verify` GREEN — 67 fixture
arms passed, 48 of 51 executable rules proven able to fail (RULE-GATE-002, RULE-GOV-001, RULE-TEST-002
declare no automated fixture), and **`py-test-container` skipped: no Docker daemon (`RISK-TEST-001`)**.

## Second review amendments (2026-11-24)

1. **`security_opt` was a membership test** (important, upheld). `no-new-privileges:false` appended after
   the `true` entry, `seccomp:unconfined`, `apparmor:unconfined`, `group_add: ["0"]`, and `pid`/`ipc`/
   `userns_mode: host`, `devices`, `sysctls` all passed the gate. Fixed: `security_opt` is parsed in
   order as moby's `parseSecurityOpt` does (split on `=`, else `:`; bare key means true; Go
   `ParseBool` values; last value wins), `no-new-privileges` is the only allowed key and must end up
   true; `group_add` is refused (`RULE-OPS-004`); host `pid`/`ipc`/`uts`/`userns_mode`/`cgroup`,
   `devices`, `device_cgroup_rules`, `sysctls` are refused (`RULE-OPS-003`). Red first: arms
   `OPS-004-nnp-override`, `OPS-004-seccomp`, `OPS-004-group-root`, `OPS-003-host-pid`,
   `OPS-003-devices` were added to `tools/fixtures/negative.sh` and **observed failing (the check
   stayed green, "67 passed, 5 failed")** before the check changed; all red after. Also checked by hand
   in a scratch copy: bare `no-new-privileges` passes, `=false`, `:yes`, `apparmor:unconfined`,
   `label=disable`, `ipc: host`, `userns_mode: host`, `sysctls`, `group_add: [wheel]` are refused.
2. **The frontend skipped the expand step** (important, upheld). The first amendment's "no compose
   shape" argument judged the compose alone: the previous frontend block starts the old image *and*
   runs the new one as uid 10002 by its `USER`, writing only `/tmp`. Fixed: the frontend block keeps
   the previous shape plus the tmpfs and no-new-privileges (`SHIM-OPS-002`, expires 2026-12-31);
   `RULE-OPS-004` requires exactly that while the shim stands and the full floor once it goes. Red
   first: declaring `SHIM-OPS-002` against the then-current compose made the gate report the frontend's
   `read_only`, `cap_drop` and `user:` (observed), green after the block changed. Arms
   `OPS-004-early-front` (read-only added during the transition) and `OPS-004-front-shim-gone` (shim
   removed, block left transitional) observed red. Container tier step 6 now runs the new frontend
   image under the previous block and under the expand block (health, uid 10002, headers); step 7 is
   the switch change's flags. The backward half — the previous frontend image under the expand block —
   is reasoned, not executed: that image is root nginx writing `/etc/nginx/conf.d` with no setuid exec,
   which no-new-privileges and a `/tmp` tmpfs do not touch. The maintainer sign-off is no longer a
   merge precondition. Existing arms `OPS-004-writable`, `-root-user`, `-zero-pad` were re-anchored
   (backend read-only removed; a frontend `user:` inserted), still red.

Gate after the second amendments, this checkout (arm64): `make check` GREEN (18 s of 180 s); `make verify`
GREEN — 74 fixture arms passed, 48 of 51 executable rules proven able to fail, and **`py-test-container`
skipped again: no Docker daemon (`RISK-TEST-001`)**, so container steps 6 and 7 have not executed.

## What stays open

- **Merge precondition:** the container tier's first green run in CI on this tree. It cannot be
  produced in this checkout.
- **Frontend switch change** (`SHIM-OPS-002`, by 2026-12-31): after this change is deployed and
  `verify-deploy` is green on it, add `user: "10002:10002"`, `read_only: true`, `cap_drop: [ALL]` to the
  frontend block and remove the shim.
- **Plan M0:** how `/opt/scripts/deploy.sh` extracts the baked compose, and whether the host's on-disk
  compose is this repository's after the deploy. Required before the contract step flips the image's
  default user.
- **`/api/docs` and `/api/redoc`** break once the strict CSP is enforced; decided in the change that
  removes `SHIM-WEB-001`.

- **SEC-003 is not closed by this change.** Its criterion — the runtime is demonstrably non-root with
  minimal file rights — is met by the frontend's process now (uid 10002 by its image), by its read-only root only after the frontend switch change, and by the backend only after the operator's
  *migrate* and *switch*. `SHIM-OPS-001` carries the date.
- **SEC-004 is not closed by this change.** Framing is blocked and the headers exist on every path, but
  the strict CSP is report-only and the edge answer has not yet been read after an authorised deploy.
  `SHIM-WEB-001` carries the date.
- No XSS or clickjacking is claimed fixed; what is added is the missing layer.

## Pre-checks

- `./run map` and `./run impact` on every touched file: index `current` at `5d85f6ee539e`.
- `make check` on the unchanged tree: GREEN, 22 s of 180 s.
