# The Runway task interface

One command surface over every ecosystem in this repository. Any coding agent and any human with a shell
uses the same commands; nothing on the required path depends on a particular vendor's tooling.

> This document is the command reference. The repository *contract* — the organizing principle, the
> dependency rules, and the decision procedure for "where does a change of kind X go" — arrives in Step 9 as
> the root `AGENTS.md`, which will link here rather than repeat this.

Start with `make help`.

## Two front doors, one implementation

| Surface | Use it when |
|---|---|
| `make <command>` | You are a human, or the exit code does not matter. Discoverable, tab-completes. |
| `./run <command>` | **The exit code matters** — automation, agents, CI branching. |

Both dispatch to the same scripts and accept the same modifiers, so a command copied from this document
behaves identically either way. The split exists for one reason: **GNU make reports exit code `2` for any
failed recipe**, so it physically cannot pass the documented exit codes through. `make check` on a rule
violation exits `2`, not `1`. `./run check` exits `1`. Prefer `./run` in anything that reads the code.

`./run` with no arguments prints the command list.

## Commands

### `make help`
Lists every command, read from the `Makefile` itself so the two cannot drift.

### `make doctor`
Reports whether this machine can build, test and verify the repository. Never mutates anything. Exits `3`
when something required is missing, naming what and why. Optional tooling (Docker, the `task` binary) is
reported as absent rather than as a failure.

### `make bootstrap`
Prepares a clean clone. Idempotent — safe to re-run. Writes only to git-ignored paths:

- creates `users.db` **as an empty file**. `docker-compose.yml` bind-mounts it; if it does not exist, Docker
  creates a *directory* at that path and the backend fails with an error that points nowhere near the cause;
- creates `data/` for per-user Taskwarrior storage;
- creates `.env` with a **freshly generated** `JWT_SECRET` when absent — never the placeholder from
  `.env.example`, because a working default signing key is exactly the problem Step 11 exists to fix;
- provisions `backend/.venv` (via `uv` when present, otherwise `python3 -m venv` — see ADR 0002) and installs
  `backend/requirements.txt`;
- runs `npm ci` in `frontend/`.

### `make check`
The fast local gate. Run it before every commit. Runs the `check` profile at **full scope** and must
complete inside its runtime budget.

### `make verify`
The authoritative mergeability gate: a green `verify` is the definition of "mergeable". Runs the `verify`
profile at full scope, including everything `check` runs. **`check` never substitutes for `verify`.**

### `make rebuild-verify`
Clean deterministic rebuild and equivalence validation of the index layers. *Implemented in Step 5.*

### `make test`
Runs the focused test suite for the changed scope. *Implemented in Step 3.*

### `make map`
Locates a symbol and reports the unit that owns it, the contracts and rules that govern it, and the
uncertainty relevant to the answer. *Implemented in Step 7.*

### `make impact`
Reports the change-impact radius of a symbol, file or unit, including connected public surfaces and known
blind spots. *Implemented in Step 7.*

### `make index`
Builds or refreshes the repository knowledge graph. *Implemented in Step 5.*

### `make brief`
Generates a Change Impact Brief for the working diff, pre-filled from the index. *Implemented in Step 10.*

### `make scaffold`
Creates a new unit that is conformant to the structure and the boundary rules by construction, with a
passing smoke test and zero manual edits. *Implemented in Step 16.*

### `make fix`
Applies every deterministic, semantics-preserving repository-owned fix: `ruff` import order, safe lint fixes
and formatting for the backend, `eslint --fix` for the frontend. Tool-owned and generated files are repaired
by running this, never by hand-editing — a hand-edit produces a diff the tool undoes on its next run.

### `make decay-review`
Runs the recurring agent-readiness decay review and writes verifiable evidence of the run. *Implemented in
Step 16.*

## Exit codes

Every command uses the same codes. They are part of the interface: automation may depend on them.

| Code | Meaning |
|---|---|
| `0` | Success. |
| `1` | **Rule violation.** A checked-in rule failed. The message names the rule id and points at the section that explains it. |
| `2` | **Needs input.** A required value is missing. The message names each missing field and how to supply it. |
| `3` | **Tooling or environment problem.** A prerequisite is missing or unusable, or the command is not implemented yet. Nothing was verified. |
| `4` | **Stale index.** The index is older than the working tree; the answer would have been unreliable. |

`1` and `3` are different failures and must not be conflated: `1` means the repository is wrong, `3` means
the machine is.

**These codes reach you only through `./run`.** `make` collapses every failure to `2`. This is a limitation
of `make`, not a choice — see ADR 0001.

## Machine-readable output

Pass `JSON=1` to any command to get a single JSON object on stdout. Both surfaces accept it:

```sh
./run check JSON=1      # exit code preserved
make check JSON=1       # identical output, exit code collapsed to 2 on failure
```

A `check` or `verify` run reports its profile, scope, elapsed time, budget, counts, and every finding with
its rule id, message, contract reference and fix command.

`RULE-TI-003` enforces that this stream is *only* the JSON object. A check that prints a friendly summary
without honouring JSON mode corrupts it for every machine consumer while the human output still looks
perfect — two such bugs reached CI before the rule existed.

## The resolved execution plan

Pass `PLAN=1` to `check` or `verify` to see exactly what would run, and why, without running it:

```sh
make check PLAN=1
make verify PLAN=1 JSON=1
```

**Scope selection is currently trivial: both profiles run at full scope.** No affected-target selection is
applied, so a green run is never weakened by a selection heuristic. At this repository's size full-scope
execution is fast enough that selection would add risk without buying time. The re-open trigger is recorded
in `docs/plan/phase-0-2.md` §2.1: `verify` exceeding 10 minutes, or `check` exceeding 3.

## Runtime budgets

`tools/checks/budgets.conf` declares a budget per profile, measured on every run and enforced by
`RULE-GATE-001`. A slow gate gets bypassed, which is worse than no gate — it teaches contributors that green
is optional. Raising a budget means raising it there, saying why in a decision record, and doing both in the
same commit.

## Adding a check

One file and one line:

1. write `tools/checks/<name>.sh` — source `tools/lib.sh`, call `fail_rule <RULE-ID> "<message>"` for each
   violation, exit `1` if any fired;
2. add `<name>` with its profiles to `tools/checks/profiles.conf`;
3. add the rule to `rules/ledger.yaml` with its class, its check, and its negative fixture.

Step 3 is not optional. A rule without a fixture proving that a real violation turns the gate red is a rule
nobody has confirmed works.

## Repository hygiene

`RULE-HYG-001` and `RULE-HYG-002`. `.env`, `users.db` and `data/` are bind-mounted from the production host.
This is a public repository, so tracking any of them publishes live credentials and user data irreversibly.
They must stay untracked, and `.gitignore` must cover them so it cannot happen by accident.

## Toolchain

`RULE-TI-002`. `tools/versions.env` is the single source of truth for the declared runtime versions, and the
Dockerfiles must agree with it. It is what `make bootstrap` provisions against, so disagreement means every
local environment is quietly wrong about what production runs.

## The service must be able to start

`RULE-DEP-001`. `python -c 'import app.main'` — no server, no database, no Docker.

This rule exists because the situation it forbids actually happened. `fastapi-mcp 0.3.3` requires
`mcp>=1.6.0` with no upper bound; `mcp 2.0.0` changed `Server.__init__`, so every image built after that
release contained a backend that raised before uvicorn bound a port. The image built, the registry push
succeeded, the deploy job went green, and the service was down. See ADR 0004.

Transitive dependencies are still not pinned as a whole — Step 14 owns that. This rule is what makes the
gap survivable meanwhile.

### Changing frontend dependencies

After any change to `frontend/package.json`, regenerate the lockfile with:

```sh
tools/npm-lock.sh
```

Development happens on whatever Node you have; CI and the frontend image build on the version in
`tools/versions.env`. **npm majors do not agree on lockfile contents** — npm 11 omits the optional
`@esbuild/*` platform packages that npm 10 then reports as *"Missing from lock file"*, so `npm ci` fails in
CI while every local command succeeds. This script writes the lockfile using the same npm that will later
read it.

CI catches the mismatch (that is how it was found), but only after a push.

## Formatting, linting and types

`RULE-FMT-001`, `RULE-LINT-001`, `RULE-LINT-002`, `RULE-TYPE-001`.

| Ecosystem | Tools | Config |
|---|---|---|
| `backend` | `ruff` (format + lint), `mypy` | `backend/pyproject.toml` |
| `frontend` | `eslint` + `eslint-plugin-vue` (`flat/essential`) | `frontend/eslint.config.js` |

Run `make fix` first — it repairs everything deterministic. What remains needs a decision.

Rule selections are deliberately modest, and ADR 0003 records why plus the trigger to widen them. Dev tools
are pinned exactly (`backend/requirements-dev.txt`): a gate whose tools float is a gate whose verdict changes
without anyone changing code.

**Suppressions are not free.** Every `# noqa` and `# type: ignore` must correspond to an entry in
`rules/waivers.yaml` — either a `scheduled_remediation` carrying an owner, a risk, a mitigation and an
expiry, or a reviewed `justified_suppression` explaining why the finding is a false positive. Step 9 makes
that correspondence a gate check. Suppressing a finding silently is the one thing that turns a lint gate into
theatre.

## Tests

`RULE-TEST-001`, `RULE-TEST-002`, `RULE-TEST-003`. Two tiers, split at the Taskwarrior boundary (ADR 0006).

| Tier | Where | Needs | Profile |
|---|---|---|---|
| backend unit | `backend/tests/unit` | nothing — Taskwarrior is faked at `task_runner._run` | `check`, `verify` |
| backend container | `backend/tests/container` | Docker, x86_64, the real `task` binary | `verify` |
| frontend logic | `frontend/tests` | nothing — pure modules, no jsdom, no mounting | `check`, `verify` |

```sh
./run test              # both, where they can run here
./run test unit         # the fast tier
./run test container    # the real-binary tier
```

Everything above the `_run` seam executes for real in the unit tier: argv construction, validation, routing,
error mapping. The container tier covers what only the binary can answer — urgency from the checked-in
coefficients, the storage format, and **cross-tenant isolation**, which rests entirely on three environment
variables handed to a subprocess.

The container tier **cannot run on arm64**: archlinux publishes no arm64 image and `pacman` fails under
emulation. The check says so and passes; CI is x86_64 and runs it for real (`RISK-TEST-001`).

Coverage is a **ratchet**, currently a 90% floor against 96% actual. Raise it when coverage rises; never
lower it to make a change fit.

The frontend tier covers `src/shared/` — the context-tag and filtering rules that produced every frontend
defect this repository has shipped. Rendering, routing and gestures are deliberately untested
(`RISK-TEST-004`, ADR 0007).

The backend tiers are **characterization** tests: they pin current behaviour *including its defects*. Six defects are
asserted as-is and labelled in place with the step that will change them. A test failing after an
intentional change is the point — it makes the behaviour change visible in the diff.

## The index

`RULE-IDX-001`, `RULE-IDX-002`. A queryable, evidence-bearing model of the repository.

```sh
make index          # rebuild (every build is a clean build)
make fix            # also rebuilds it, along with every other deterministic repair
```

Any change to a tracked file — including a document — makes the index stale, because ADRs, rules and
contracts are nodes in it. `make fix` rebuilds it, which is why that is the documented first response to a
gate failure.

`index/graph.jsonl` is the canonical export — JSON Lines, versioned, documented in `index/schema.md`.
It and `index/state.json` are **generated and git-ignored**; the extractors, schema, `index/manifest.toml`
and `architecture.toml` are checked in. `make bootstrap` builds it, so a clean clone has one.

**Every fact carries an evidence class** — `STATIC_CONFIRMED`, `CONFIG_CONFIRMED`, `CONTRACT_DECLARED`,
`RUNTIME_OBSERVED`, `SEMANTIC_MATCH` or `UNKNOWN`. Nothing is asserted without one, and a heuristic is never
promoted to a confirmed fact. Test protection is never inferred from a file name: a `TESTED_BY` edge exists
only where a test *imports* what it protects.

**The index is descriptive; `architecture.toml` is normative.** An edge the index found never legitimises a
dependency the contract forbids — and the first build found exactly that, reporting a
`be/routers → be/adapters` dependency that `architecture.toml` does not allow.

Six blind spots are declared up front rather than discovered later, including Taskwarrior's internals, MCP
tool-name derivation, and the deploy host's compose file. See `index/schema.md`.

### Qualification

`RULE-IDX-003`. `tools/index/tests/` decides whether the index may be trusted — installation is not proof of
compliance. 27 assertions covering: required languages and mechanisms are indexed (including Vue SFCs, the
gap that ruled out SCIP); direction is preserved; every fact carries a declared evidence class and static
code edges carry a source location; impact and flow queries return known facts **and** the blind spots
relevant to them; missing test protection is reported explicitly; and declared facts are never dressed up as
parsed ones.

Three negative fixtures run the extractors over synthetic inputs and prove that unsupported mechanisms
surface as `UNKNOWN` rather than as invented edges — a dynamic `import()`, a template-only component, and an
unparseable file.

**Test protection is import-derived.** Every router in this repository is tested through the FastAPI
`TestClient`, so no test imports it and no `TESTED_BY` edge exists. Absence of an edge therefore means *no
import-derived protection*, **not** *untested* — declared as `BLIND-TEST-001` rather than papered over with
a naming convention.

`make map` and `make impact` — the query surface over this graph — arrive in Step 7.

## Gate conformance

`RULE-GATE-002`. `tools/fixtures/negative.sh` constructs a genuine violation of every executable rule and
requires the gate to go red. It runs as part of `verify`.

Each fixture executes inside a throwaway copy of the **current working tree**, with the toolchains symlinked
rather than copied, so it never mutates the tree you are working in and is safe to run with uncommitted
changes in flight.

This is the rule that makes the others trustworthy: a gate component nobody has watched fail is not a rule,
it is a shell call, and it is worse than nothing because it is believed.

## Known gaps at this step

- The commands marked *implemented in Step N* exit `3` with a message naming that step. They do not pretend
  to succeed.
- Gate failure messages point at this document. Step 9 repoints them at the root `AGENTS.md` and adds the
  contract self-check that keeps the reference honest.
- **`make verify` runs no tests.** There is not a single test in this repository yet. A green `verify` means
  the repository is hygienic, its interface is coherent, and its code is formatted, lint-clean and
  type-clean — **not that it behaves correctly.** Steps 3 and 4 add the safety net; Steps 5–8 add the index
  and boundary enforcement.
- `rules/waivers.yaml` is not yet validated by a check, so an expired waiver does not currently fail the
  gate. Four entries carry expiry dates of 2026-11-04. Step 9 adds the validator.
- The frontend dependency tree carries 5 known vulnerabilities (1 moderate, 4 high) reported by `npm`.
  Dependency auditing and the license policy are Step 14.



