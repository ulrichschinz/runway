# AGENTS.md — the contract

**Read this first. It is the entry point for every agent and every human working here.**
Everything it states is checked by `tools/checks/contract.sh`; a claim that stops being
true fails the build. Budget: 250 lines. Detail lives in linked documents, not here.

Runway is a self-hosted GTD web app over Taskwarrior 3. Two deployables (a FastAPI backend
and a Vue 3 SPA), three processes, one public REST + MCP surface, live users.

---

## 1. Before you edit anything

```sh
make bootstrap        # clean clone -> working environment (idempotent)
./run map <thing>     # where is it, which unit owns it
./run impact <path>   # what breaks, which surfaces, which tests
make check            # fast gate, run before every commit
```

**Query the index before searching or editing by hand.** `./run map` and `./run impact`
answer ownership, dependents, public surfaces and test protection in under a second, with
an evidence class on every fact and the blind spots attached. `grep` gives you strings;
the index gives you consequences.

This rule cannot be mechanically enforced — nothing can detect that you grepped instead.
It is recorded as `RISK-DOC-001`, and the mitigation is that obeying it is *faster* than
not. **Your own session memory or notes are never authoritative**: ownership, dependency,
impact and test facts come from the index alone.

If an answer says `STALE`, run `make fix`. The answer was not trustworthy.

## 2. The decision procedure

1. **Locate the owner.** `./run map <symbol|path>` → the unit, from `architecture.toml`.
2. **Read the scoped contract**, if the unit has one: `backend/AGENTS.md`,
   `frontend/AGENTS.md`. A scoped contract may refine local structure; it may **never**
   weaken a root rule.
3. **Assess the blast radius.** `./run impact <path>` → dependents, connected public
   surfaces (including MCP tool names), protecting tests, declared blind spots.
4. **Write a Change Impact Brief** into `docs/briefs/` for any change to production code.
   Copy the newest one as the template. See `docs/change-workflow.md`.
5. **Pick a Delivery Pattern** — Bug Fix, New Capability, Behaviour-Preserving Refactor,
   Public-Surface or Data Migration, Security or Operability Change. Each states what the
   change must bring with it. See `docs/change-workflow.md`.
6. **Work**, running `make check` as you go.
7. **`make verify` before submitting.** Green means mergeable; nothing else does.

## 3. Where a change of kind X goes

| Change | Goes in |
|---|---|
| A task operation, or anything touching Taskwarrior | `backend/app/services/task_service.py`. **Only `be/adapters/task` may run the subprocess** — routers reach it through the service, which is where validation lives. |
| A new REST endpoint | a router in `backend/app/routers/`. It automatically becomes an MCP tool named after the handler function — see §5. |
| Anything reading or writing a database | `backend/app/database.py`. It is the only module that opens a connection — the users database and the audit log alike. |
| An audit event | `backend/app/audit.py` — the vocabulary and the writer. It lives in `be/adapters/db` because the line above leaves it nowhere else to live. Reading the log is an operator activity; there is no route for it. |
| A frontend rule about tags, filtering or sorting | `frontend/src/shared/`. These are pure and tested; components are not. |
| Frontend feature UI | the owning feature unit — `fe/tasks`, `fe/projects`, `fe/identity`. Features never import each other. |
| A gate rule | a script in `tools/checks/`, a line in `tools/checks/profiles.conf`, an entry in `rules/ledger.yaml`, and a fixture in `tools/fixtures/negative.sh`. All four, or it is not a rule. |
| A non-obvious decision | a dated ADR in `docs/adr/`. |

## 4. Structure and dependency rules

`architecture.toml` is **normative** — it declares units, owners and allowed dependencies.
The index is **descriptive** — it reports what exists. An edge that exists never
legitimises one the contract forbids. `tools/checks/boundaries.sh` compares them.

**Backend** — layers, strictly downward: `be/app` (assembly) → `be/routers` → `be/services`
→ `be/adapters/{db,task}` → `be/leaves`. `be/di` provides what routers inject.

**Frontend** — features over a shared layer: `fe/app` (routing) → features → `fe/layout`,
and every feature may use `fe/shared`. Features never import features.

Frontend units are **declared, not foldered**: the map lives in `architecture.toml` over
the existing directories. Moving files would buy tidiness and cost migration risk.

- A **new cycle between units always fails.** Two are declared today (`CYCLE-001`,
  `CYCLE-002`), both because `AppShell` reads stores directly instead of receiving props.
  The inventory may only shrink — resolving one and leaving it declared also fails.
- **Fan-in** is measured against `ops/structure-baseline.toml`. A high value is not a
  failure; a *growing* one is.

## 5. Public surfaces and what we promise

Treated as **externally consumed**: this is a public repository and the README documents
the API for third parties. Changing one requires the Public-Surface Migration pattern —
expand → migrate → switch → contract — not a changelog line.

| Surface | Promise |
|---|---|
| REST API (32 routes) | Breaking changes go through the migration pattern. The served OpenAPI schema is snapshotted in `ops/surfaces/openapi.json`. |
| **MCP tools (32)** | Tool names are FastAPI **operation ids** — function name, path, method (`create_task_tasks_post`) — *not* the bare function names this table claimed until Step 13. Observed by booting the app; snapshot in `ops/surfaces/mcp-tools.json`, enforced by `RULE-SURF-001`. Renaming a Python function still renames its tool, so it is a breaking public-surface change. |
| Auth: `Authorization: Bearer <jwt>`, `X-Api-Key`, and Bearer-as-API-key everywhere | The third form is `SHIM-SEC-006`, a dated compatibility shim in `rules/shims.yaml`, not a design. `RULE-SEC-002` fails the gate when it expires. |
| SQLite schema | Forward-only, additive. Migrations run in `init_db()` on every start, and the migrated schema is snapshotted in `ops/surfaces/db-schema.sql`. |
| Taskwarrior data and `backend/taskrc_template.txt` | **Urgency coefficients are a behavioural contract** — changing one re-orders every user's list. Existing users' `.taskrc` files are *not* updated. |
| Container images | `:latest` plus an immutable `:<commit-sha>` — the rollback target. |
| Env vars, SPA routes, localStorage keys | Every variable the app reads is documented in `README.md` and `RULE-SURF-002` fails when the two disagree in either direction. SPA routes and storage keys are snapshotted in `ops/surfaces/spa.json`. |

## 6. Ownership

Every unit in `architecture.toml` records an owner. Today that is `maintainer` for all of
them — a single-maintainer repository, recorded honestly rather than dressed up as a team.

Changes to this file, `architecture.toml`, `rules/ledger.yaml`, `rules/waivers.yaml`,
`ops/github/ruleset.json` or the gate configuration require owner approval.
**`RISK-GOV-001`: with one maintainer, that approval cannot be independent.** The re-open
trigger is a second contributor gaining write access.

## 7. The gate

`make check` is fast local feedback. `make verify` is the definition of mergeable, and it
gates the deploy — nothing reaches production without it.

Both run at **full scope**; no affected-target selection is applied, so a green run is
never weakened by a selection heuristic. Budgets live in `tools/checks/budgets.conf` and
are enforced: a slow gate gets bypassed.

**Every rule in `rules/ledger.yaml` has a negative fixture proving it can fail**
(`tools/fixtures/negative.sh`, run by `RULE-GATE-002`). A gate component nobody has
watched fail is not a rule — it is a shell call, and it is worse than nothing because it
is believed.

Exit codes are exact only through `./run`; `make` collapses every failure to `2`. Full
reference: `docs/task-interface.md`.

## 8. Suppressions and waivers

A `# noqa` or `# type: ignore` **must** correspond to an entry in `rules/waivers.yaml` —
either a `scheduled_remediation` with an owner, a risk, a mitigation and an expiry, or a
reviewed `justified_suppression` explaining why the finding is a false positive.
`RULE-RULE-003` enforces the link; `RULE-RULE-002` fails on an expired waiver.

Suppressing a finding silently is the one thing that turns a gate into theatre.

## 9. THE META-RULE

**Changing any rule means changing all of these in the same commit:**

1. the executable check that enforces it,
2. its entry in `rules/ledger.yaml`, including its negative fixture,
3. this contract or the document it points to,
4. a dated ADR in `docs/adr/` if the decision is non-obvious.

A rule that exists in only some of those places is drift, and the contract self-check
will say so.

## 10. What is deliberately not covered

Recorded so a green gate is not mistaken for a broader guarantee:

- **Horizontal scaling, HA and multi-tenant operation are out of scope.** Single host,
  single operator. Load, latency and capacity budgets are not modelled.
- **Frontend rendering, routing and gestures are untested** (`RISK-TEST-004`). The tests
  cover the pure logic where every shipped frontend defect actually was.
- **The container test tier cannot run on arm64** (`RISK-TEST-001`); CI runs it.
- **The deploy host's compose file is not in this repository** (`BLIND-OPS-001`). Its
  contents are now recorded in `docs/operations.md`, but nothing detects drift once the
  host changes (`RISK-OPS-002`), and the rollback runbook does not work as written.
- **Transitive dependencies are not pinned as a whole.** One incident already came from
  that; `RULE-DEP-001` makes the gap survivable, not closed.

Open security findings with owners and expiries: `rules/waivers.yaml`.
Full residual-risk register: the `residual_risks` section of `rules/ledger.yaml`.

---

*Where to go next:* `docs/task-interface.md` (commands, exit codes, every rule) ·
`docs/change-workflow.md` (delivery patterns, briefs) · `docs/operations.md` (deploy,
rollback, incidents) · `index/schema.md` (what the index knows) ·
`docs/plan/phase-0-2.md` (why the repository is shaped this way).
