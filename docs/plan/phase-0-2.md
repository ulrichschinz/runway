# Runway — Agent-Readiness: Phase 0 Baseline, Phase 1 Decisions, Phase 2 Plan

Status: **awaiting human approval.** Nothing in the repository has been changed.
Repo revision at time of analysis: `1b06703` (main), working tree clean except untracked `agent-ready.md`.

---

# PHASE 0 — BASELINE (read-only)

## 0.1 Ecosystem and process topology

Three toolchains, two languages, one native binary dependency.

| Unit | Language / runtime | Build | Runs as |
|---|---|---|---|
| `backend/` | Python 3.12, FastAPI 0.115.5, uvicorn, aiosqlite | `pip install -r requirements.txt`, Docker | uvicorn `:8000` |
| `frontend/` | Node 20, Vue 3.5, Vite 5, Pinia 2, Tailwind 3, axios | `npm ci && npm run build`, Docker | nginx `:4000` |
| Task engine | Taskwarrior 3.x C++ binary | copied from `archlinux:latest` builder stage into the backend image | `task` subprocess, forked per request |

**Process topology (runtime):**

```
browser ──HTTP:4000──> nginx (frontend container)
                          ├── /            -> static SPA (Vite build, try_files -> index.html)
                          └── /api/        -> proxy_pass http://${BACKEND_HOST}:8000/
MCP client ──SSE──────> uvicorn /mcp        (fastapi-mcp 0.3.3, tools auto-derived from routes)
agent ──HTTP:8000─────> uvicorn             (REST, direct; README documents this)

uvicorn (backend container)
   ├── aiosqlite  ──> /app/users.db          (bind mount ./users.db)
   └── subprocess ──> `task` CLI, env TASKDATA=/app/data/<user>, TASKRC=<user>/.taskrc, HOME=<user>
                       └──> /app/data/<user>/taskchampion.sqlite3   (bind mount ./data)
```

Both containers use `network_mode: host` → Linux host only (README states this). Deployment: push to `main`
→ GH Actions builds both images → `ghcr.io/ulrichschinz/runway-{backend,frontend}:latest` → SSH with a forced
command on the target host runs `docker compose pull && docker compose up -d --remove-orphans`.

**Cross-tenant isolation is enforced solely by three environment variables passed to a subprocess.**
There is no isolation boundary below that. This single fact drives most of the risk profile below.

## 0.2 Maturity

- 63 tracked files, 1 untracked (`agent-ready.md`).
- **6,925 lines tracked; 4,254 excluding `package-lock.json`** — 18 `.vue`, 18 `.py`, 11 `.js`.
- 26 commits, 2026-04-27 → 2026-05-17 (3 weeks), 1 human author (2 e-mail identities).
- Public GitHub repo, MIT licensed, live CI/CD to a production host with real user data.

**Verdict:** young and small in code, but *deployed, multi-user, publicly published, with a public REST + MCP
surface and irreversible operations on user data.* Cost of an incorrect change is high relative to file count.
The prompt's applicability test is met on lifetime, public surfaces, process topology, and cost-of-error —
not on size.

## 0.3 Current structure

```
.
├── .github/workflows/deploy.yml   build+push 2 images, then SSH-trigger deploy. NO verification step.
├── .env.example                   JWT_SECRET, ALLOW_REGISTRATION, PORT   (PORT is never read anywhere)
├── docker-compose.yml             2 services, host networking, bind mounts ./data and ./users.db
├── README.md                      user-facing docs (install, auth, MCP, dev) — the only "contract" today
├── LICENSE                        MIT
├── backend/
│   ├── Dockerfile                 archlinux:latest → task binary; python:3.12-slim runtime
│   ├── requirements.txt           9 direct deps, exact `==` pins, no lock, no hashes
│   ├── taskrc_template.txt        per-user Taskwarrior config; urgency coefficients = behavioural contract
│   └── app/
│       ├── main.py                app factory, CORS, router registration, /health, MCP mount
│       ├── config.py              pydantic-settings Settings (jwt_secret, data_root, db_path, …)
│       ├── database.py            ★ COLLECTOR: DDL for 4 tables + connection factory + ad-hoc migrations
│       │                            + API-key generation + settings read + hard-coded admin promotion
│       ├── models.py              ★ COLLECTOR: 20 Pydantic DTOs for all 5 feature areas, one flat module
│       ├── auth.py                bcrypt hashing + JWT encode/decode
│       ├── dependencies.py        get_current_user (API key OR JWT), get_current_admin
│       ├── routers/               auth, tasks, gtd, projects, inbox, admin  (6 routers, ~30 endpoints)
│       └── services/              task_service (validation + mapping), task_runner (subprocess adapter),
│                                  user_service (per-user dir + .taskrc bootstrap)
└── frontend/
    ├── Dockerfile                 node:20-alpine build → nginx:alpine, envsubst BACKEND_HOST
    ├── nginx.conf                 :4000, /api/ proxy, SPA fallback
    ├── vite.config.js             dev proxy /api → localhost:8000
    └── src/
        ├── main.js, App.vue       bootstrap
        ├── router/index.js        9 routes, localStorage-token guard
        ├── api/client.js          axios instance, Bearer interceptor, 401 → hard redirect to /login
        ├── stores/                ★ tasks.js (COLLECTOR: tasks + projects + context tags + new-task
        │                            trigger), auth.js
        ├── composables/           useDarkMode, useScrollLock
        ├── components/            ★ FLAT BUCKET, 8 files, mixes app chrome (AppShell 210, NavItem,
        │                            BrandMark) with task UI (TaskModal 436, TaskRow 161, TaskList,
        │                            TaskActionSheet, UrgencyBadge) and project UI (ProjectPlanModal 366)
        └── views/                 8 route views + _useTaskView.js (shared controller for the 5 GTD views)
```

**Collector files named explicitly:** `backend/app/database.py`, `backend/app/models.py`,
`frontend/src/stores/tasks.js`, `frontend/src/components/` (as a bucket).
No `utils.py` / `helpers.js` dumping grounds exist. No god-controller. The largest files are three
UI components (436 / 366 / 346 lines) — large, but cohesive.

## 0.4 Coupling reality

**Backend dependency graph is acyclic and layered — it already works:**

```
routers/{auth,tasks,gtd,projects,inbox,admin}
      ↓
services/{task_service,user_service}      dependencies.py ──> auth.py
      ↓                                        ↓
services/task_runner ──> config          database.py ──> config
                                          models.py (leaf)
```

Two real violations of that layering, both mechanically detectable:

| # | Violation | File |
|---|---|---|
| V1 | `routers/gtd.py` imports `services.task_runner.export_tasks` directly, skipping `task_service` | `routers/gtd.py:6` |
| V2 | `routers/auth.py` imports the private `database._generate_api_key` | `routers/auth.py:8` |

Plus one duplicated-logic finding: `routers/inbox.py` re-implements API-key authentication inline
(`SELECT username FROM users WHERE api_key=?`) instead of using `dependencies.get_current_user`, and accepts
the key in the `Authorization: Bearer` slot rather than `X-Api-Key`. **Two divergent authentication paths.**

**Frontend dependency graph** (`views → components → stores → api`) is consistent, with one unit-level cycle
once features are named (see §1.3): `AppShell.vue` (chrome) imports `stores/tasks.js` (tasks feature), while
all five task views import `AppShell.vue`. File-level there is no cycle; unit-level there is one.

Inconsistent data access: `SettingsView.vue` and `ProjectPlanModal.vue` call `api/client.js` directly,
bypassing the Pinia stores that every other view uses.

**Duplicated logic:** the `@context`-tag comma-splitting expression appears three times
(`stores/tasks.js` ×2, `views/_useTaskView.js` ×1) — it has already caused two bugs (`c6ce0f2`, `472b673`).

**Genuine seams (already nearly separable):**
`services/task_runner._run` — the single choke point for every Taskwarrior invocation (perfect injection
seam for tests); `views/_useTaskView.js` — the shared controller behind 5 views; `api/client.js` — the single
HTTP egress; `dependencies.get_current_user` — the single intended auth choke point (currently bypassed once).

## 0.5 Public-surface inventory

| # | Surface | Consumers | Compatibility promise today | Protection today |
|---|---|---|---|---|
| S1 | REST API, ~30 endpoints / 6 routers | SPA, MCP layer, external agents (documented in README with a `curl` example) | **none stated** | none |
| S2 | **MCP server at `/mcp`** — tool names auto-derived by `fastapi-mcp` from route operation ids; README names `list_tasks`, `create_task`, `gtd_inbox`, `add_to_inbox`, … | Claude Desktop, Claude Code, arbitrary MCP clients | none stated | **none — renaming any route *function* silently breaks every client** |
| S3 | Auth surfaces: `Authorization: Bearer <jwt>`, `X-Api-Key: <key>`, and `Authorization: Bearer <api-key>` (inbox only) | all of the above | none | none |
| S4 | SQLite schema `users`, `projects`, `project_plans`, `site_settings` + ad-hoc `ALTER TABLE` migrations in `init_db()` | the live production DB (bind-mounted) | implicit forward-only | no migration tool, no schema version, no test |
| S5 | Taskwarrior data dir + `.taskrc` template. **Urgency coefficients are a behavioural contract** — changing one re-orders every user's list | every user; existing per-user `.taskrc` files are *not* updated by later template changes | none | none |
| S6 | Env vars `JWT_SECRET`, `ALLOW_REGISTRATION`, `DATA_ROOT`, `DB_PATH`, `BACKEND_HOST`; plus `PORT` which is documented but read by nothing | operators | none | none |
| S7 | Container images `ghcr.io/…-{backend,frontend}:latest` | the deploy host | `:latest` only — **no immutable tag, therefore no rollback target** | none |
| S8 | SPA routes `/inbox /next /waiting /someday /projects /projects/:name /all /settings /login`; localStorage keys `token username role fullName email` | bookmarks, the app itself | none | none |
| S9 | Bind-mount paths `./data`, `./users.db` | operators, backups | documented in README | none |

## 0.6 Safety net

**There is none.** Zero test files, zero test runner, zero fixtures, zero characterization baseline, zero
golden output. Coverage of the risky, critical and irreversible paths — authentication, API-key issuance,
admin role change, cross-tenant data isolation, subprocess argument construction, `task delete`, DB
migration — is **0 %**.

## 0.7 Enforcement tooling

| Capability | backend (Python) | frontend (JS/Vue) |
|---|---|---|
| Formatter | ✗ | ✗ |
| Linter | ✗ | ✗ |
| Type checker | ✗ (code is partially annotated) | ✗ |
| Dependency-boundary checker | ✗ | ✗ |
| Test runner | ✗ | ✗ |
| Dependency pinning | `==` pins, **no lock, no hashes** | `package-lock.json` ✓ (ranges in `package.json`) |
| License policy | ✗ | ✗ |
| Security / policy scanner | ✗ | ✗ |
| Base-image pinning | ✗ — `archlinux:latest`, `python:3.12-slim`, `node:20-alpine`, `nginx:alpine` all floating | ✗ |

**CI runs no verification of any kind.** `deploy.yml` triggers on `push: main` and goes straight to
build → push → deploy. There is no branch protection and no ruleset on `main`
(`GET /branches/main/protection` → 404; `GET /rulesets` → `[]`). Every push to `main` deploys to production
unverified.

## 0.8 Contract surface

**None.** No `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `CODEOWNERS`, `docs/`, or ADRs.
`README.md` is user-facing documentation, not an agent contract, and has already drifted:

- documents `PORT=4000` as configuration — **nothing reads `PORT`**;
- documents `X-Api-Key` as accepted by *all* endpoints — `/inbox` accepts only `Authorization: Bearer`;
- `.env.example` says `ALLOW_REGISTRATION=true`, `docker-compose.yml` defaults it to `true`, and
  `config.py` defaults it to `false` — **three sources, two answers**;
- README's clean-clone instructions omit that `./users.db` must exist as a *file* before
  `docker compose up`, or Docker creates a **directory** at that path and the backend fails.

One positive: `.claude/` is git-ignored, so no vendor-specific rules have leaked into the repository.

## 0.9 Index surface

**None.** No symbol index, no dependency graph, no semantic search, no MCP index adapter, no manifest.
Not vendor-bound, not stale — simply absent. A cold agent's only tools today are `grep` and reading files.

## 0.10 Security posture (cross-cutting lens)

Ordered by severity. Items marked **[confirm]** are strong hypotheses that the plan turns into adversarial
fixtures rather than assertions I have executed (no `task` binary is available on this host).

| # | Finding | Severity |
|---|---|---|
| **SEC-1** | `config.py` ships a working default JWT signing key (`"changeme-please-set-in-env"`), and `docker-compose.yml` supplies a *different* working default (`"changeme-set-in-.env"`). Both constants are in a **public** repository. Any deployment that forgets `.env` boots with a publicly known signing key ⇒ **any attacker can forge a JWT for any user.** The app boots happily and gives no signal. | **Critical** |
| **SEC-2** | `database.init_db()` executes, on **every startup**: `UPDATE users SET role='admin' WHERE username='uli' AND role='user'`. On any third-party deployment of this public app, whoever registers the username `uli` is silently promoted to administrator at next restart. | **Critical** |
| **SEC-3** | Argument injection into the Taskwarrior CLI. `subprocess.run` uses a list and `shell=False` (correct, no *shell* injection), and UUID/tag/priority/recur are validated — but `description`, annotation `text`, and `project` are passed to `argv` unvalidated. Taskwarrior consumes `rc.<key>=<value>` **anywhere in its argument list** as a runtime config override, and `_run` places user tokens *after* its own `rc.` flags. A task whose description is exactly `rc.data.location=/app/data/<other-user>` would therefore redirect the data store — **breaking the only cross-tenant isolation boundary the system has.** The same tokens are additionally re-injected into a *filter* expression by `task_service.create_task`'s `["description:" + task.description]` re-query. **[confirm]** | **Critical if confirmed** |
| **SEC-4** | `CORSMiddleware(allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])`. Starlette reflects the request `Origin` when credentials are enabled with a wildcard, so **every origin receives full credentialed CORS access.** Auth is header-based (localStorage), not cookie-based, so this is not directly CSRF-exploitable — but the browser's origin barrier is removed entirely and there is no compensating control. | High |
| **SEC-5** | API keys are stored in plaintext in `users.db`, are permanent, unscoped, un-expiring, and retrievable in cleartext via `GET /auth/apikey`. `users.db` is a bind-mounted file on the deploy host and in backups. | High |
| **SEC-6** | Two divergent authentication code paths (`dependencies.get_current_user` vs. the inline lookup in `routers/inbox.py`), with different accepted header shapes. Divergent auth paths drift. | Medium |
| **SEC-7** | `python-jose==3.3.0` has known unfixed advisories (algorithm confusion / JWT-bomb class). `passlib==1.7.4` is unmaintained and `bcrypt` is pinned to `4.0.1` purely to work around passlib's removed `__about__` attribute — an undocumented reason that a future agent will "helpfully" bump. **[confirm via audit tooling]** | Medium |
| **SEC-8** | No rate limiting or lockout on `POST /auth/login` — unrestricted password brute force. | Medium |
| **SEC-9** | Non-reproducible builds: four floating base-image tags, and `pacman -Sy` (sync without upgrade) against `archlinux:latest` — the classic partial-upgrade pattern. The `task` binary version in the image is whatever Arch published that day, and it is the engine of the entire product. | Medium |
| **SEC-10** | No logging of any kind ⇒ no audit trail for admin role changes, key regeneration, or task deletion. (Also: no secret-in-log risk today — a property worth *keeping* executable once logging is added.) | Medium |
| **SEC-11** | Unverified deploy: `push: main` → production, no gate, `:latest` tags only, no rollback target, no healthcheck in `docker-compose.yml`. | Medium |

Positives worth preserving: `shell=False` with an argv list; bcrypt password hashing; parameterised SQL
everywhere (no string-interpolated SQL found); `.gitignore` correctly excludes `.env`, `users.db`, `data/`;
per-user data directories; the deploy SSH key is constrained by a forced command.

## 0.11 Architecture drivers and Coverage Profiles

**Product:** self-hosted, multi-user GTD application over Taskwarrior 3.
**Primary journeys:** capture → inbox; process/organise (tags, projects, contexts); work next actions
(start/stop, urgency ordering); natural project planning; admin user management; agent/automation
integration via REST + MCP.
**Observed change pattern (from all 26 commits):** ~70 % frontend UX iteration (mobile, dark mode, branding,
context tags), ~25 % backend feature addition (API keys, roles, admin, inbox webhook) each of which added a
DB column, ~5 % ops. Changes inside the backend are **vertical** (router + model + db + dependency together).
**Deployment:** single Linux host, docker compose, host networking, auto-deploy on `main`.
**Lifetime:** treat as long-lived — branding, license, CI/CD, public repo, MCP surface, real users.
**Critical data & irreversible side effects:** credentials, per-user API keys, per-user task data,
`task delete` (permanent), role changes, the registration toggle.
**Required compatibility:** REST + MCP tool names (external clients), DB schema (live production data),
Taskwarrior data format and urgency coefficients.
**Assumptions requiring human confirmation** (Q1–Q4 at the end of this document): non-goals of horizontal
scaling / HA / multi-tenant SaaS; whether external consumers of the REST/MCP surface exist today.

**Coverage Profiles activated:**

| Profile | Status | Evidence |
|---|---|---|
| CORE | **Active** | mandatory for every repository in scope |
| DYNAMIC ARCHITECTURE | **Active** | FastAPI `Depends()` DI, decorator routing, middleware, lifespan; **`fastapi-mcp` reflects routes into MCP tools at runtime**; vue-router route table; Pinia store registration; nginx `envsubst` templating. Static import graphs cannot express route → handler → MCP-tool. |
| DISTRIBUTED / POLYGLOT | **Active** | 2 languages, 3 processes (nginx, uvicorn, `task`), 2 datastores, HTTP + MCP/SSE transports, 2 container images, one shared file-format contract (`.taskrc` / `TASKDATA`). |
| CRITICAL RUNTIME | **Active** | secrets, untrusted input reaching `argv`, irreversible deletes, role changes, production persistence — and cross-tenant isolation that rests on *environment variables handed to a subprocess*, a relationship no static analysis can confirm. Runtime evidence is mandatory here. |
| SCALE / OPERABILITY | **Active, reduced scope** | Not a load-scaling system (single host, small user base) → the *capacity/latency/backpressure* half is proposed as **explicitly out of scope, recorded in the contract** (pending Q1). The *operability* half **is** in scope and mechanically checkable: subprocess timeouts, healthchecks, immutable image tags + rollback, structured logging with a no-secrets rule. |

No profile is recorded as not-applicable; all five are active, one in reduced form with its exclusion
written down rather than assumed.

## 0.12 Co-change evidence

**Filters applied:** merge commits excluded (`--no-merges`); `package-lock.json` excluded (dependency
noise); commits with <2 or >15 files excluded — this drops the 55-file initial commit and all single-file
commits. No mass renames, codemods or generated-code commits exist in this history. **Data volume is low
(26 commits, 1 author), so this is treated as weak corroborating evidence, never as a dependency edge.**

Churn leaders: `AppShell.vue` (8), `TaskModal.vue` (6), `stores/tasks.js` (6), `index.html` (4),
`_useTaskView.js` (4), `config.py` / `models.py` / `database.py` / `main.py` (4 each).

Co-change pairs at ≥3 — only three exist, all intra-frontend:

```
3   frontend/index.html            <-> frontend/src/components/AppShell.vue     (theme + brand tokens)
3   frontend/src/components/TaskModal.vue <-> frontend/src/stores/tasks.js      (tasks feature)
3   frontend/src/stores/tasks.js   <-> frontend/src/views/_useTaskView.js       (tasks feature)
```

**Only 4 of 26 commits touch both `backend/` and `frontend/`.** The deployment-unit boundary between
backend and frontend is real and earned. Within the frontend, the cohesive cluster is
*store + modal + view-controller* — i.e. a **feature**, not a file *type*. Within the backend, co-change is
vertical across layers within one feature (`models` + `database` + `dependencies` + one router).

---

# PHASE 1 — ORGANIZING PRINCIPLE AND MODE

## 1.1 Scope 1 — repository level: **deployable unit**

**Units:** `backend` (FastAPI service including its Taskwarrior adapter) · `frontend` (SPA + nginx) ·
`ops` (compose, CI, deploy, policy).
**Rationale:** 4/26 cross-stack commits, two separate toolchains, two separate images, two separate release
lifecycles. This is not a monorepo of libraries; it is two deployables plus their operations.
**Allowed dependency direction:** `frontend → backend` **over the HTTP/OpenAPI contract only — never by
source import**; `ops → {backend, frontend}` for build/deploy only; no edge from `backend` to `frontend`.
**Cross-unit interface:** the OpenAPI document + the MCP tool list. Both become snapshot-protected surfaces.
**Failure signal:** any source import crossing `backend/ ↔ frontend/`; any frontend change required by a
backend change without a corresponding contract-snapshot change.

## 1.2 Scope 2a — backend internal: **layer, with feature slices inside each layer**

**Chosen:** `routers → services → adapters(task_runner, database) → {config, models}`, with each layer
internally organised by feature (`routers/tasks.py` ↔ `services/task_service.py`). This is what the code
already is, and it holds.

**Rejected alternative — bounded domains (`tasks/`, `projects/`, `identity/`, `admin/` as top-level
packages):** co-change evidence genuinely favours it (backend changes are vertical). But at ~1,000 LOC and 6
routers this would be restructuring for its own sake, which MODE C forbids and the operating rules forbid.
**Recorded as an ADR alternative with an explicit re-open trigger: >12 routers or >3,000 backend LOC or a
second backend deployable.**

**Enforceable rules:** no upward imports; no router → adapter shortcut (catches V1); no import of a
`_`-prefixed symbol across module boundaries (catches V2); `task_runner` is the *only* module permitted to
call `subprocess`; `database` is the only module permitted to open a DB connection.
**Owner unit for a change** = the (router, service) feature pair.

## 1.3 Scope 2b — frontend internal: **feature / route + shared design layer**

**Chosen units** (the prompt's reference axis for frontend apps, and the axis the co-change data supports):

| Unit | Members |
|---|---|
| `fe/tasks` | `components/{TaskList,TaskRow,TaskModal,TaskActionSheet,UrgencyBadge}.vue`, `stores/tasks.js`, `views/{Inbox,Next,Waiting,Someday,AllTasks}View.vue`, `views/_useTaskView.js` |
| `fe/projects` | `views/ProjectsView.vue`, `components/ProjectPlanModal.vue` |
| `fe/identity` | `views/{Login,Settings}View.vue`, `stores/auth.js` |
| `fe/shell` | `App.vue`, `main.js`, `router/index.js`, `components/{AppShell,NavItem,BrandMark}.vue`, `style.css`, `index.html` |
| `fe/shared` | `api/client.js`, `composables/{useDarkMode,useScrollLock}.js` |

**Deliberate deviation, stated openly:** these units are declared as a **path→unit map in a checked-in
`architecture.yaml`, over the existing type-oriented directory layout. No files are moved.** MODE C forbids
restructuring; moving 21 files in a repo with zero tests and a live deployment buys folder tidiness and
nothing else. The unit map gives the cold agent, the index, and the boundary checker everything a folder
move would — ownership, allowed edges, "which unit owns this behaviour" — at zero migration risk.
**Re-open trigger recorded in the ADR:** a third feature unit, or `components/` exceeding 15 files.

**Allowed edges:** `fe/{tasks,projects,identity} → fe/shared`; `fe/{tasks,projects,identity} → fe/shell`
(layout component only); `fe/shell → fe/*` (route composition only); no feature → feature.

**One real cycle found and *not* hidden:** `fe/shell → fe/tasks` (`AppShell.vue` imports `stores/tasks.js`
for the context-tag sidebar) while `fe/tasks → fe/shell` (every task view imports `AppShell.vue`).
This goes into the **cycle inventory with an owner, a recorded teardown path** (pass context tags into
`AppShell` via props/slot so the chrome stops importing the tasks store) **and a ratchet that only allows
the inventory to shrink.** Demonstrating the mechanism on a genuine finding is worth more than pretending
the repository has no cycles.

## 1.4 Axis validation — five requests

| # | Request | Owning unit | Bounded collaborators | Verdict |
|---|---|---|---|---|
| 1 | *Local behaviour:* "Someday tasks should sort by age, not urgency." | `backend/gtd` slice | `task_service.list_tasks` sort; `fe/tasks` display only | ✓ one owner |
| 2 | *Public surface:* "Rename MCP tool `add_to_inbox` → `capture`." | `backend/inbox` slice | S2 MCP snapshot, README, external clients | ✓ — and exposes that route *function names* are the MCP contract |
| 3 | *Data:* "Add a `notes` column to `projects`." | `backend/projects` slice | `database` adapter owns the DDL (a known smear, see below); expand→migrate→switch→contract | ✓ with a recorded hidden contract |
| 4 | *Cross-cutting security:* "Store API keys hashed." | `backend/identity` slice | `auth.py`, `dependencies.py`, DB schema, `fe/identity` (key is shown once, then never again) | ✓ genuinely multi-unit, correctly so |
| 5 | *Cross-process:* "Show per-user storage quota in Settings." | `backend/identity` slice (new `storage_service`) | new REST endpoint → new MCP tool (automatic!), `fe/identity`, `ops` volume note | ✓ and reveals the auto-MCP side effect |

**Hidden contract surfaced by request 3:** all DDL lives in the `database` adapter, not in the owning
feature slice. At 4 tables this is acceptable; recorded in the contract as a known hidden contract with a
trigger — *introduce a `migrations/` directory the first time a third table changes shape.*

**Co-change cross-check:** all three ≥3 co-change pairs fall **inside** a single proposed unit
(`fe/tasks` ×2) or inside `fe/shell` (`index.html ↔ AppShell.vue`). No pair smears across proposed unit
boundaries. Backend vertical co-change is acknowledged and handled by the feature-slice-within-layers rule
rather than being explained away. **The axis survives the evidence.**

## 1.5 MODE: **C — TUNE**

**Evidence for C, not B:**
- the backend follows a clear, acyclic, layered principle with exactly **two** violations, both one-line fixes;
- the frontend follows a consistent (if type-oriented) principle with no cycles at file level and one at unit level;
- no god-modules of consequence, no fat controllers, no `utils` dumping ground, no duplication crisis
  (one duplicated 40-character expression);
- the `_useTaskView` and `task_runner._run` seams show the code was factored deliberately.

**Evidence against A:** the repository is not empty.
**Evidence against B:** there is nothing structural worth migrating; a migration would be churn without a
defect it prevents.

**What is actually missing is everything on the enforcement and knowledge side** — no contract, no gate, no
index, no tests, no boundary rules, no rule ledger, no surface protection, no branch protection.
This is precisely the MODE C shape: *the mode changes the depth of each pillar, never its existence.*

**Consequence for the plan:** almost no code moves. Nearly every step adds a pillar, an executable rule, or
a test. Three steps change behaviour, all of them security fixes, each flagged explicitly.

---

# PHASE 2 — THE PLAN (approval required before any change)

## 2.1 Proportionality review (applied before presenting)

Every item below was tested against MODE C, the active profiles, 4,254 LOC, and demonstrated risk. What that
review **removed or shrank**:

| Considered | Decision |
|---|---|
| Task orchestrator (Nx / Bazel / Turborepo), affected-target selection, remote cache | **Removed.** Full-scope VERIFY on this repo will run in ~1–3 minutes. The prompt states full-scope execution is an explicitly valid strategy when fast enough, and that the absence of an orchestrator is not a capability gap. CHECK and VERIFY both run **full scope**; CHECK simply excludes the slow tiers (docker build, container-integration tests, clean-clone). Re-open trigger recorded in the contract: **VERIFY > 10 min or CHECK > 3 min**. |
| Frontend folder migration to `features/` | **Removed** (§1.3) — declared unit map instead. |
| Backend domain-package restructure | **Removed** (§1.2) — ADR alternative with trigger. |
| `just` / `mise` / `nox` as task runner | **Removed.** `make` + POSIX `sh` is native, present on every dev and CI machine, adds zero dependencies. |
| `import-linter` (Python) + `dependency-cruiser` (JS) as two boundary checkers | **Merged into one.** Neither spans both ecosystems, and `dependency-cruiser` needs extra configuration to resolve `.vue`. One checker reading the canonical index export enforces one rule language across Python, JS and Vue, and makes the index load-bearing for the gate on day one. Home-grown-checker risk is mitigated by mandatory negative fixtures (Step 8). |
| Component/E2E testing (Playwright, @vue/test-utils) | **Removed** for now. Frontend testing is scoped to the pure logic seams that have actually produced bugs. Recorded as explicit residual risk with a re-open trigger. |
| Coverage tooling with a global percentage floor | **Shrunk** to a floor on the critical paths only (`app/services/`, `app/dependencies.py`). |
| Per-unit scoped `AGENTS.md` files | **Shrunk** to two (`backend/AGENTS.md`, `frontend/AGENTS.md`) plus root. Five would be ceremony at this size. |

## 2.2 Index implementation mode — provisional recommendation

Formal ADOPT/EXTEND/BUILD evaluation is a **deliverable of Step 6**, not a foregone conclusion. My
provisional recommendation, with the reasoning to be recorded and challenged there:

- **ADOPT** (scip-python + scip-typescript, or a general repo-graph tool): rejected provisionally —
  no SCIP indexer parses Vue SFCs; none model contracts, rules, public surfaces, evidence classes, or
  freshness; each would still need the entire policy layer, plus an MCP adapter, plus a second toolchain.
- **EXTEND** (tree-sitter base graph + repository-owned policy layer): viable, but tree-sitter buys precise
  call graphs this repository does not need, at the cost of pinned native grammars.
- **BUILD — minimal, dependency-free** (recommended): Python `ast` from the standard library gives *exact*
  imports, definitions, decorators, and `Depends()` arguments for the backend; an ESM import scanner covers
  `.js`/`.vue` (every frontend edge in this repo is a static ESM import — verified in Phase 0); config
  extractors read `router/index.js`, `defineStore(`, `docker-compose.yml`, and the FastAPI route table.
  Estimated 400–600 lines, **zero third-party dependencies**, therefore trivially clean-clone-reproducible,
  offline, license-clean, and deterministic.

Non-negotiable regardless of mode: a **versioned, documented JSON-Lines canonical export** (stable node ids,
directed typed edges, evidence class, source location, coverage, revision, freshness, blind spots) with an
**adapter conformance suite**, so replacing the engine later requires no change to the contract, the Change
Impact Brief format, or the agent workflow.

**Evidence classes in use:** `STATIC_CONFIRMED` (Python `ast`, ESM imports) · `CONFIG_CONFIRMED` (FastAPI
decorators, `Depends()`, vue-router table, compose topology) · `CONTRACT_DECLARED` (`architecture.yaml`
units/owners, Rule Ledger) · `RUNTIME_OBSERVED` (**the MCP tool list, dumped by booting the app in-process
— the only honest way to know the MCP surface**; plus the container-tier isolation tests) · `SEMANTIC_MATCH`
(lexical/BM25 "where do we already solve this", over code *and* `docs/`) · `UNKNOWN`.

**Declared blind spots, reported by every query that touches them:** Taskwarrior's internal behaviour (an
external binary — the index never claims to know it); `fastapi-mcp`'s tool-name derivation (covered only by
runtime observation); Vue template dynamic components; the nginx `envsubst` templating step.

## 2.3 The steps

16 steps in 5 waves. Each = one PR-sized change with one green acceptance gate. Nothing is bundled.
**Steps 11 and 12 change runtime behaviour** and are marked ⚠ — everything else is additive or
behaviour-preserving.

### Wave 1 — make the repository verifiable (nothing else can be proved until this exists)

**Step 1 — Repository task interface + clean-clone bootstrap.**
*Change:* `Makefile` (thin front door) delegating to POSIX `sh` scripts in `tools/`: `doctor`, `bootstrap`,
`check`, `verify`, `rebuild-verify`, `map`, `impact`, `index`, `test`, `brief`, `scaffold`, `fix`,
`decay-review`. Documented exit codes (`0` ok · `1` rule violation · `2` needs input · `3` tooling/environment
· `4` stale index). `--json` output on every command an agent consumes. Non-interactive by default; a
needs-input result names each missing field and how to supply it. New `.github/workflows/verify.yml` running
on `pull_request` **and** `push: main`.
*Gate:* CI performs a clean clone and runs `make bootstrap && make doctor && make verify` — green.
*Also fixes:* the `./users.db`-must-be-a-file footgun, in `make bootstrap`.

**Step 2 — Formatters, linters, type checking per ecosystem, wired into CHECK and VERIFY.**
*Change:* backend — `ruff` (format + lint) and `mypy` on `app/` at a lenient-but-non-trivial setting;
frontend — `eslint` flat config with `eslint-plugin-vue`. Configuration checked in; one mechanical
formatting commit for `backend/app/`.
*Gate:* `make check` runs all four and is green; a seeded violation in a scratch branch makes it red
(first negative fixtures).

**Step 3 — Backend behavioural safety net (characterization tests).**
*Change:* `pytest` + FastAPI `TestClient`. Two tiers: **unit tier** (fast, no Docker) pinning current
observable behaviour of auth, tasks CRUD, GTD filters, projects, admin and inbox against a fake injected at
the `task_runner._run` seam; **container tier** (runs inside the backend image, where the real `task` binary
exists) pinning real subprocess behaviour including **per-user data isolation**. No behaviour changes — this
step *pins what is*, including the bugs. It is the prerequisite for Steps 11 and 12.
*Gate:* both tiers green; coverage floor on `app/services/` and `app/dependencies.py`; CHECK runs the unit
tier, VERIFY runs both.

**Step 4 — Frontend logic safety net.**
*Change:* `vitest` (single new dev dependency) covering the three pure seams that have already produced
bugs: `_useTaskView` filtering, `@context`-tag comma-splitting, urgency sorting. The duplicated splitting
expression is extracted into `fe/shared` in the same step (behaviour-preserving, three call sites).
*Gate:* tests green in CHECK; a regression of `c6ce0f2` / `472b673` makes it red.

### Wave 2 — the index pillar

**Step 5 — Canonical graph schema, manifest, and extractors.**
*Change:* `index/schema.md` (versioned), `index/manifest.yaml` (source coverage and exclusions, content
hashes, schema version, extractor versions, active Coverage Profiles, retrieval configuration, runtime-
evidence inputs, **known unsupported mechanisms**, deterministic validation queries), extractors per §2.2,
and the JSON-Lines canonical export. Derived data is generated-only and git-ignored; tooling, schema,
manifest, adapters and fixtures are checked in.
*Gate:* `make index` builds; **incremental and clean rebuilds are byte-equivalent for authoritative facts**;
`make verify` fails on a stale index.

**Step 6 — Index Qualification Gate + implementation-mode ADR.**
*Change:* repository fixtures proving: required languages/mechanisms/surfaces/processes are covered;
direction is preserved; evidence classes and source locations are correct; impact and flow queries return
known facts *and* their blind spots; known tests are found for a changed symbol and for a changed public
surface, and **missing test protection is reported explicitly rather than guessed**; and **at least one
negative fixture proving a known-unsupported mechanism surfaces as `UNKNOWN` rather than as an invented
edge.** Plus the ADOPT/EXTEND/BUILD ADR.
*Gate:* `make verify` runs the qualification suite; a deliberately-broken extractor makes it red.

**Step 7 — CLI + MCP adapters over one query layer, with fact-level parity.**
*Change:* both adapters sit over the same canonical query layer. Canonical queries: where X is and which
unit owns it · which contracts/rules/ADRs govern it · who imports/calls/injects/produces/consumes it · its
change-impact radius and connected surfaces · its end-to-end control/data path · analogous implementations
and relevant tests · diff vs. `main` including cycles, forbidden crossings and hubs · **all uncertain areas
relevant to the answer.** The retrieval corpus includes `docs/` so that "how do I verify here" and "what was
decided about Y" are index queries returning the governing text with its location.
*Gate:* a parity test asserts equivalent CLI and MCP queries return the same facts, evidence classes,
revision, freshness and blind spots. **No required path depends on any single agent vendor.**

### Wave 3 — the contract and the rules

**Step 8 — `architecture.yaml`, the boundary checker, cycle and hub inventories.**
*Change:* `architecture.yaml` declares units, owners, layers, attributes and allowed edges for **both**
ecosystems (§1.1–1.3). `tools/check_boundaries.py` enforces them over the canonical export. Structural-decay
checks: new cycles between units **always** fail; the existing `fe/shell ↔ fe/tasks` cycle enters the cycle
inventory with owner and teardown path under a shrink-only ratchet; structural-hub fan-in/fan-out baselines
are checked in per scope with an allowlist for legitimate hubs (`router/index.js`, `main.py`, `api/client.js`,
`database.py`). Violations V1 and V2 are fixed here — six lines, behaviour-preserving.
*Gate:* every rule has a negative fixture constructed in a scratch branch that makes the build red.

**Step 9 — Root `AGENTS.md`, Rule Ledger, waiver register, contract self-check.**
*Change:* root `AGENTS.md` (**≤ 250 lines / ≤ 12 KB, enforced**): organizing principle, unit and ownership
map, dependency rules in plain language, the "where does a change of kind X go" decision procedure,
clean-clone bootstrap, the public-surface inventory with its compatibility promises, CHECK/VERIFY commands
and CHECK's runtime budget, and the **index section** — that the index exists, what it answers, the exact
commands, the rule *query the index before searching or editing by hand*, and how to read the staleness
signal. Plus the **meta-rule**: changing any rule means updating the contract, its executable check or Rule
Ledger entry, and a dated ADR **atomically in the same PR**. Scoped `backend/AGENTS.md` and
`frontend/AGENTS.md` may refine local structure but may not weaken root rules; conflicts fail the
self-check. `CLAUDE.md` is a **three-line pointer carrying no rules of its own**. `rules/ledger.yaml` gives
every MUST/MUST NOT a stable id, a class (executable invariant · observable property · required human
judgment · temporary waiver), the check that enforces it, and its negative fixture. Waivers record all five
groups; invalid or expired waivers fail the gate; the SEC-1/2/3 rules are marked **non-waivable**.
*Gate:* `tools/check_contract.py` asserts every factual claim in the contract against the actual code —
including that a named index query returns the expected answer — and fails on drift, on an over-budget
contract, on a MUST without a ledger id, and on an executable rule without a fixture.
*Residual risk recorded:* "query the index first" is not mechanically enforceable → registered with a
re-open trigger, and mitigated by making `make map`/`make impact` genuinely faster than grep.

**Step 10 — Change Impact Brief, Delivery Patterns, ADRs.**
*Change:* `make brief` generates a brief pre-filled from the index and the current diff (requested outcome,
owning unit, applicable contracts and rule ids, entry points and flow, affected public surfaces, known
dependents, uncertain/dynamic areas, analogous implementations, selected Delivery Pattern, required tests,
intended scope, base revision, index revision). `docs/change-workflow.md` defines the five patterns —
Bug Fix (reproduction + regression test before it completes) · New Capability (owner, contract, vertical
slice, failure behaviour, tests) · Behaviour-Preserving Refactor (characterization first) · Public-Surface
or Data Migration (expand → migrate → switch → contract) · Security or Operability Change (failure scenario,
control, adversarial proof). Backfill ADRs for every decision in this document.
*Gate:* CHECK validates brief structure and references and compares declared vs. actual scope for any change
touching production code; a **structured ADR reference in code becomes a `GOVERNED_BY` edge and a dangling
reference fails the gate** (free `WHY:`/`NOTE:` comments are indexed as non-normative and never fail).

### Wave 4 — protect what is promised, and fix what is broken

**Step 11 ⚠ — Security wave 1: authentication and identity (behaviour-changing).**
*Change:* **SEC-1** — the app refuses to start when `JWT_SECRET` is unset or equals any known default;
`docker-compose.yml`'s conflicting default is removed. **SEC-2** — the hard-coded `uli` → admin promotion is
deleted and replaced by an explicit bootstrap (`ADMIN_USERNAME` env var, or first-registered-user, per Q3).
**SEC-4** — CORS wildcard replaced by a configured origin allowlist. **SEC-6** — `/inbox` unified onto
`dependencies.get_current_user`, keeping the old header shape accepted via a **temporary compatibility shim
tracked in the shim inventory with a removal step**. **SEC-8** — login rate limiting.
*Gate:* one adversarial fixture per fix, each proven to make VERIFY red before the fix and green after —
boot with the default secret, register as `uli` and restart, cross-origin credentialed request, unthrottled
login burst.
*Explicitly declared behaviour change:* **a deployment with no `JWT_SECRET` will stop booting.** Q3 covers
the migration for the running instance.

**Step 12 ⚠ — Security wave 2: the Taskwarrior boundary (behaviour-changing).**
*Change:* **SEC-3** — every user-supplied `argv` token is validated at the `task_runner._run` choke point:
tokens matching `^rc\.`, `^--`, or `^[+-][a-zA-Z]` in free-text positions are rejected; `--` is used to
terminate option parsing where Taskwarrior supports it; the `["description:" + description]` filter re-query
in `create_task` is replaced by reading the UUID that `task add` returns. The rule is enforced in *one*
place, and a boundary rule keeps `subprocess` reachable only from `task_runner`.
*Gate:* **the adversarial fixture is the pass criterion** — a task created with description
`rc.data.location=/app/data/victim` must be rejected, and a container-tier test must prove user A cannot
read user B's data through any endpoint. This fixture also **confirms or refutes finding SEC-3**; if it
refutes it, the finding is downgraded in the record and the hardening is kept as defence in depth.

**Step 13 — Public-surface protection.**
*Change:* every surface S1–S9 gets an owner, a compatibility and deprecation promise, a migration/rollback
pattern, and protecting evidence: an OpenAPI snapshot diff (S1); a **runtime-observed MCP tool-list snapshot,
produced by booting the app in-process** (S2 — this simultaneously protects the surface, supplies the
`RUNTIME_OBSERVED` evidence the CRITICAL RUNTIME profile requires, and makes request 2 of §1.4 safe); a DB
schema snapshot with a forward-only migration check (S4); a `.taskrc` template snapshot with a written
statement that existing users' files are **not** updated (S5); an env-var schema that fails on documented-
but-unread variables — **this catches the `PORT` drift immediately** (S6); SPA route and localStorage-key
snapshots (S8).
*Gate:* an applicable surface without an owner or without protection fails VERIFY or needs a valid expiring
waiver; changing a surface without updating its snapshot fails.

**Step 14 — Supply chain, licensing, reproducibility.**
*Change:* hash-pinned Python lock generated by `uv` (already on this machine) from `requirements.txt`;
`package.json` ranges kept, `package-lock.json` remains the tested set, supported-range policy recorded;
`policy/licenses.yaml` — an allowlist of approved permissive licenses that rejects strong copyleft,
non-commercial, unapproved source-available, unknown and missing licenses, and requires recorded per-case
approval for weak copyleft and dual licensing; a checker over both ecosystems' dependency metadata; **all
four base images digest-pinned** and `pacman -Sy` corrected, so the `task` binary version becomes
reproducible (SEC-9); `python-jose` and the `passlib`/`bcrypt` pin re-evaluated with the reason recorded in
an ADR (SEC-7); secret scanning in CI with a local pattern-based fallback; Dependabot configuration.
*Gate:* negative fixtures — add a strong-copyleft dependency, an unpinned dependency, a floating base-image
tag, and a fake secret; each must turn VERIFY red.

**Step 15 — Operability and the minimal threat model.**
*Change:* structured logging with an executable **no-secrets-in-logs** rule (a test asserts the formatter
redacts JWTs, API keys and passwords — SEC-5/SEC-10); an audit log for admin role changes, key regeneration
and task deletion; healthchecks in `docker-compose.yml`; **images tagged with the commit SHA in addition to
`latest`, with a one-line documented rollback** (SEC-11/S7); an executable rule that every subprocess and
egress call declares a timeout; `docs/threat-model.md` (trusted actors, untrusted inputs, secrets, side
effects, egress, persistence, supply chain, abuse cases) with its mechanically enforceable parts entering
the gate and the rest entering the residual-risk register with re-open triggers. **Load, latency and
capacity scaling are recorded here as deliberately out of scope** (pending Q1), never silently assumed.

### Wave 5 — close the loop

**Step 16 — Gate enforcement, scaffold, decay review, and the Phase 4 audit.**
Delivered as four small PRs rather than one:

- **16a — Branch protection as checked-in desired state.** `ops/github/ruleset.json` is canonical;
  `make verify` diffs it against the live GitHub API and fails on drift. VERIFY becomes the required status
  check; `deploy` gains `needs: verify`, so **an unverified commit can no longer reach production.**
  *Requires your approval or your hands — it changes your GitHub repository settings.* With a single
  maintainer, required *reviewers* cannot be enforced; that is recorded as an explicit **governance residual
  risk with a re-open trigger (a second contributor joins).*
- **16b — Scaffold generator.** `make scaffold KIND=backend-feature NAME=x` emits a router + service +
  models + both test tiers + the `architecture.yaml` unit registration with its attribute classification, so
  a new unit **inherits every applicable boundary rule from its first commit**. `KIND=frontend-feature`
  likewise. Acceptance: one command, green with zero manual edits.
- **16c — Decay review.** `make decay-review` runs every mandatory structural analysis and every activated
  conditional diagnostic (cycle inventory and trend, hub baselines, co-change vs. declared units, the
  waiver/quarantine/shim inventories and their expiries, index quality metrics, a reduced Cold-Agent Change
  Test) and writes machine-verifiable evidence (repo revision, index revision, CI run id, report hash,
  executed checks, result). A monthly scheduled workflow is only an adapter. **An overdue or unverifiable
  review fails the governance check; the contract may display the date but is never its source of truth.**
- **16d — Phase 4 audit + Cold-Agent tests.** Every gate component gets a conformance test proving it is
  invoked and that a representative violation makes it fail — **no gate step remains an untested shell
  call.** One adversarial fixture per active Coverage Profile. Confirm that branch protection actually
  *blocks* a merge while VERIFY is red — a gate that runs but does not block is advice, not a rule. Confirm
  failure messages name the violated rule and point to the right contract section, and that deterministic
  violations also print the exact repository-owned `make fix` command.
  **Cold-Agent Index Test** and **Cold-Agent Change Test** with versioned pass criteria defined *before* the
  run — expected facts, mandatory owner/contract/rule hits, **zero invented authoritative edges**, correct
  flagging of the declared blind spots, a query and time budget, a minimum coverage of critical facts, and a
  documented comparison against the `grep`/manual baseline. Three requests: a local behaviour change, a
  public-surface/data migration, and a cross-process security change. **Precondition recorded as verified
  evidence: the test session carries no agent-side cache, knowledge base or session memory from this work
  (`ctx purge` or context-mode disabled).** "Close" does not pass; every miss is classified and becomes a
  correction. Finally: the residual-risk and accepted-debt register, each entry with its re-open trigger,
  and a short migration log.

## 2.4 Deliverables map

| Prompt deliverable | Step |
|---|---|
| Root contract + scoped guidance, index section, meta-rule, length budget | 9 |
| Architecture Driver Brief + active Coverage Profiles | 9 (from §0.11) |
| Task interface with CHECK / VERIFY / REBUILD-VERIFY | 1, refined 2–5 |
| VERIFY as a required status check via branch protection | 16a |
| Change Impact Brief mechanism | 10 |
| Delivery Patterns | 10 |
| Rule Ledger + waiver register | 9 |
| Boundary-checker configuration | 8 |
| Cycle, quarantine and shim inventories with ratchets | 8 (cycle/quarantine), 11 (shim) |
| Ownership / protected public-surface map | 8 (ownership, CODEOWNERS generated from `architecture.yaml`), 13 (surfaces) |
| Scaffold generator | 16b |
| Qualified knowledge graph, CLI + MCP, export format, manifest, lifecycle evidence | 5, 6, 7 |
| Recurring decay-review definition | 16c |
| Cold-Agent Index and Change Test benchmark | 16d |
| Decision records | 10 (backfill), then continuously |
| Migration log | 16d |

## 2.5 Known deviations from the prompt, stated openly

1. **No affected-target selection.** Full-scope CHECK/VERIFY, justified by measured scale, with a re-open
   trigger. (§2.1)
2. **Frontend units are declared, not foldered.** MODE C forbids restructuring; the unit map delivers the
   same navigational and enforcement value at zero migration risk, with a re-open trigger. (§1.3)
3. **One home-grown boundary checker instead of two ecosystem-native ones**, justified by cross-ecosystem
   rule unity and mitigated by mandatory negative fixtures. (§2.1)
4. **SCALE / OPERABILITY is active in reduced form**; the load/capacity half is written into the contract as
   deliberately out of scope rather than silently assumed covered. (§0.11, Step 15)
5. **Required-reviewer governance cannot be enforced with one maintainer** — recorded as an explicit
   governance residual risk with a re-open trigger rather than papered over. (16a)
6. **SEC-3 is a hypothesis, not a demonstrated exploit** (no `task` binary on this host). Step 12's
   adversarial fixture is designed to confirm or refute it, and the record will be updated either way.

---

# FROZEN DECISIONS (answered 2026-08-04)

Per the Phase 2 freeze rule, the following are now fixed. Refinements that preserve them are recorded in
their step; new evidence that *invalidates* one stops work and produces a replan note before direction
changes.

**F1 — Non-goals.** Horizontal scaling, high availability and multi-tenant SaaS operation are **explicitly
out of scope**, recorded as such in the contract. SCALE/OPERABILITY stays in its reduced form: subprocess
and egress timeouts, healthchecks, immutable image tags with a documented rollback, structured logging with
an executable no-secrets rule. Load, latency and capacity budgets are written down as deliberately excluded
— never silently assumed covered. Step 15 keeps its planned size.

**F2 — Compatibility promise: HARD.** The repository is public and the README documents the API and the MCP
tool names for third parties, so S1 (REST) and S2 (MCP tool names) are treated as **externally consumed**.
Consequences: renaming a route *function* — which is what `fastapi-mcp` derives tool names from — or any
endpoint path, requires the **expand → migrate → switch → contract** Delivery Pattern with a deprecation
window, not a changelog line. Step 13's OpenAPI snapshot and runtime-observed MCP tool-list snapshot become
**blocking** surface protections, and validation request 2 of §1.4 (`add_to_inbox` → `capture`) becomes the
canonical worked example in `docs/change-workflow.md`.

**F3 — Security: all three fixes, in plan order.** Steps 11 then 12, unchanged, each gated on the Step 3
characterization safety net existing first. Two operational preconditions are therefore **hard blockers
inside those steps, not afterthoughts**:
 - *before* the boot-refusal lands, verify that `JWT_SECRET` is genuinely set on the deploy host. If it is
   not, the deploy will halt and every session is invalidated. Step 11 opens by checking this and stops with
   a `needs-input` result (exit 2) rather than proceeding blind.
 - *before* the hard-coded `uli` → admin promotion is deleted, the explicit admin bootstrap must be in place
   **and proven on a copy of the production `users.db`**, or you lose your own admin access at next restart.
 These two preconditions are recorded as rollback-relevant facts in the Step 11 Change Impact Brief.

**F4 — Governance: required status check, direct pushes allowed.** `ops/github/ruleset.json` requires VERIFY
on `main`; `deploy` gains `needs: verify`, so no unverified commit reaches production. Direct pushes to
`main` remain permitted. Required-reviewer enforcement is impossible with one maintainer and is recorded as
an explicit **governance residual risk with a re-open trigger: a second contributor joins the repository.**
Step 16a still needs your hands or your approval at the moment it runs, because it mutates GitHub settings.

---

**Nothing in the repository has been changed. Awaiting approval to begin Phase 3, Step 1.**
