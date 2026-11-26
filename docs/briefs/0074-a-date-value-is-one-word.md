# Change Impact Brief 0074 — A date value is one word: the SEC-007 regression and a date grammar

| Field | Value |
|---|---|
| **Requested outcome** | Milestone **M9** of the security remediation plan ("SEC-007: Regression statt Reparatur"), ordered by Uli on 2026-11-24. SEC-007 — an `rc.data.location=` override smuggled inside a `due`/`scheduled`/`wait`/`until` value — was **rejected** for Taskwarrior 3.5.0 by the audit's own probe and confirmed rejected by the Codex review, which added that "the grammar of all four date fields and of other builds stays outside this evidence". So: **no injection fix**. (1) Keep the positive/negative evidence as a container regression for **every** supported date field: one argv element, no shell, no configuration redirect. (2) Validate the date values against the date grammar the product allows, as defence in depth only, without breaking documented public syntax. (3) Re-run the probe with the real binary on every Taskwarrior major/minor upgrade. (4) If another grammar or version shows a redirect, open a **new** finding with its own attack path; SEC-007 is not reinterpreted. Closing criterion (plan §5): "No fix; regression stays green, upgrade re-open trigger documented." |
| **Owning unit** | `be/services` — `backend/app/services/task_service.py` (`_validate_date_value`, called from `_build_args`). `be/leaves` — `backend/app/models.py` (the date fields' description). `tests` — `backend/tests/unit/test_date_values.py` (new), `backend/tests/container/test_real_task.py` (a new class). `docs` — this brief, `docs/security.md`, `docs/threat-model.md`, `docs/operations.md`. `ops` — `ops/surfaces/openapi.json` (a description string). Changed expectation: `backend/tests/unit/test_task_service.py::TestValidatedButPermissive` (see *Test evidence*). |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 (a task operation and its validation go in `task_service.py`; only `be/adapters/task` runs the subprocess), §5 (REST/OpenAPI and MCP tools are public surfaces; the input is narrowed, see *Affected public surfaces*), §7, §10 (`RISK-TEST-001`). [`backend/AGENTS.md`](../../backend/AGENTS.md) (two test tiers split at `task_runner._run`; the container tier is the real binary). Rules: `RULE-TEST-002` (the container tier), `RULE-DEP-004` (the binary comes from a dated Arch archive snapshot, so its grammar cannot move under a rebuild), `RULE-ARCH-004` (one subprocess call site), `RULE-SURF-001` (snapshots), `RULE-DOC-004`. **No rule changes**, so the META-RULE is not engaged; no ledger, waiver, budget or baseline entry changes. |
| **Governed by** | [ADR 0019](../adr/0019-the-taskwarrior-argv-boundary.md) (the argv boundary — respected: `--` and `reject_structural_tokens` unchanged), [ADR 0038](../adr/0038-validated-filters-and-exact-project-match.md) (every value built into a token is shaped first — extended here from filters to the four date modifiers), [ADR 0006](../adr/0006-two-tier-backend-tests.md) (two tiers). No new ADR: the decision is the plan's own (M9), and its reasoning is recorded below. |
| **Rule IDs introduced** | None. |
| **Entry points** | `POST /tasks` → `task_service.create_task` → `_build_args`; `PUT /tasks/{uuid}` → `task_service.modify_task` → `_build_args`. Over MCP: `create_task_tasks_post`, `modify_task_tasks__uuid__put` (each reaches only its own route, ADR 0045). `POST /inbox` carries no date. Every Taskwarrior call: `task_runner._run` → `subprocess.run([...], shell=False)`. |
| **Affected public surfaces** | **REST/OpenAPI and MCP: input narrowed, output unchanged.** A date value containing whitespace inside it, or any character outside ASCII letters, digits and `: + - .`, is now **400** ("not a valid date") before Taskwarrior runs; before, Taskwarrior received it. The status is the one an unparseable date already got (Taskwarrior's rc 2 → `TaskwarriorRejected` → 400), so no client meets a new status code. Surrounding whitespace is stripped (Taskwarrior already ignored it; a whitespace-only value keeps meaning "clear" on modify and "not given" on create). The documented syntax — `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM` — and every one-word Taskwarrior expression (`tomorrow`, `eom`, `now+3d`, `2026-W05`, the stored `20261031T230000Z`, ISO with seconds or offset) is accepted unchanged. The field description gains one sentence; `ops/surfaces/openapi.json` is regenerated for that string only (`ops/surfaces/mcp-tools.json` records names and did not change). Tool names and count unchanged (27). **DB, env vars, SPA:** unchanged. |
| **Known dependents** | From `./run impact` (index `current`, revision `2e6f9bd5b2a2`, 1958 nodes / 3323 edges): `task_service.py` → `main.py`, `routers/gtd.py`, `routers/inbox.py`, `routers/tasks.py`; connected to 22 MCP tools, of which only `create_task` and `modify_task` carry a date. `models.py` → every router and `task_service.py`. Protected by every TestClient suite through `main.py` (`BLIND-TEST-001`: routers are protected import-derived). |
| **Uncertain / dynamic areas** | **What clients send that the repository cannot see.** The SPA sends `YYYY-MM-DD` (`DayInput`, `formatForInput`, `detailFields.dayOf`); the shipped skill says "Use ISO dates"; the inbox route has no date. A third-party MCP agent might send `now + 1d` or `2026-01-01 10:00`. On 3.5.0 the first works and the second **silently drops the time** (probed, see *Evidence*); both are now 400 with a message naming the one-word form. That is the deliberate narrowing, not documented syntax. **Other Taskwarrior builds:** the regression proves the Arch 3.5.0 binary in CI and the Homebrew 3.5.0 binary on this Mac; nothing else. |
| **Analogous implementations** | `_validate_day` (filter dates, ADR 0038), `VALID_RECUR_RE` (the recurrence value is stripped and shaped before it becomes `recur:`), `PROJECT_RE`. The SEC-3 regression in `TestCrossTenantIsolation` (an override in free text against the real binary, with Bob's directory watched). The audit run's grammar probe of 2026-11-18 (not tracked here; its payloads and positive control are re-run in *Evidence*). |
| **Delivery Pattern** | **Security or Operability Change**: failure scenario, control, adversarial proof. For the narrowed input, the **Public-Surface Migration** pattern is judged **not applicable as a multi-step transition**: no documented form is removed, the refused forms are undocumented and either silently wrong (`2026-01-01 10:00`) or have a one-word equivalent (`now+1d`), and the refusal uses the status code those inputs already get when Taskwarrior refuses them. Recorded, not hidden: see *Rollback*. |
| **Required tests** | Plan §6 names for M9 the **Container** tier ("Datumsregression"). Added at the tiers the control lives in: *Unit* (the grammar, argv shape: one element per date, before `--`, `shell` never set), *ASGI/REST* (400 on create and modify, the store untouched; documented forms 201/200), *Container* (per field: embedded override with space, tab and newline, an override as the whole value, an embedded `rc:` file, three shell payloads — none redirects, none spawns a shell; a positive control proving the harness sees a redirect; the documented forms stored as expected; the service refuses the payload; a version tripwire for the upgrade trigger). |
| **Intended scope** | The four M9 items. **Not** in scope: changing `--` or `reject_structural_tokens`, the `recur` grammar (already shaped), the filter dates (already `YYYY-MM-DD`). |
| **Base revision** | `2e6f9bd` (`security/m8-capacity-and-schema`) |

## Failure scenario

An authenticated user (or an agent with their API key) sends `PUT /tasks/{uuid}` with
`{"due": "2026-01-01 rc.data.location=/app/data/<victim-storage-id>"}`. `_build_args` emits it as one
argv element, `due:2026-01-01 rc.data.location=…`, **before** `--`, and `reject_structural_tokens`
only refuses a token that *starts* with `rc.`. If Taskwarrior re-lexed that element and honoured the
override, the command would run against the victim's store — the only tenancy boundary the system has.

What is proven: on Taskwarrior 3.5.0 it does not. The binary lexes a date value (`now + 1d` evaluates;
`2026-01-01 10:00` keeps only the date) but drops an embedded `rc.` or `rc:` term; a **standalone**
override does redirect. So SEC-007 stays rejected, and what remains is (a) keeping that proof alive
against the binary we ship and (b) not depending on a third-party lexer's choice for it.

## Decisions

- **D1 — no "injection fix".** The boundary is unchanged. What changes is what is *proven* (all four
  fields, both tiers) and what is *passed* (a date-shaped word).
- **D2 — the grammar is a word, not a parser.** A date value is ASCII letters, digits and `: + - .`,
  at most 64 characters (the M8 bound), after stripping surrounding whitespace. That admits every
  documented form and every one-word Taskwarrior date expression probed on 3.5.0, and refuses
  internal whitespace (the lexer's boundary), `=` (one of the override's two operators), `/` (every
  absolute path), quotes, `$`, backticks, `;`, parentheses, control characters and non-ASCII (Unicode
  whitespace and look-alikes). *Corrected after the second review:* a character set alone did **not**
  refuse every shape the hypothesis needs — `:` is the override's other operator, so
  `rc.data.location:victim` and `rc:evilrc` were one admitted word — nor the DOM references 3.5.0
  evaluates inside a date. `DATE_DOM_RE` now also refuses a dot next to a letter and `rc:` at a word
  start (D6). A full Taskwarrior date parser was rejected: it
  would reproduce a third-party grammar that changes between releases — the very thing this package
  watches — and refuse values the binary accepts.
- **D3 — whitespace-only keeps its meaning.** Taskwarrior 3.5.0 reads `due:  ` as `due:` (clear on
  modify, nothing on create; probed). Stripping first gives the same result through the existing `""`
  path (D7, [brief 0031](0031-empty-string-clears.md)), so nothing that worked changes meaning.
- **D4 — the refusal is 400, the shape an unparseable date already had.** A `ValueError` from the
  service, mapped by the router as every other invalid value; the message says "not a valid date" like
  Taskwarrior's own and names the one-word form.
- **D5 — the upgrade trigger is executable.** A container test pins the major.minor the evidence was
  taken on (`3.5`). An archive-snapshot bump that brings another minor fails CI with the procedure in
  its message: re-run the date regression and the audit probe against the new binary, update the
  constant in the same change, and open a **new** finding if anything redirects.

- **D6 — no DOM reference in a date (second review).** Taskwarrior 3.5.0 evaluates `rc.<key>`,
  `system.os`, `tw.version`, `<id>.<attr>` inside a date value and echoes the result in its rc-2
  refusal; `rc.data.location` gave the absolute store path (DATA_ROOT plus the storage id), and
  `now+rc.data.location` was accepted and stored as `now`. Every DOM reference has a dot next to a
  letter and no date form does (ISO fractional seconds are `.<digit>`), so that is the rule, plus
  `rc:` at a word start for the rc-file form; case-insensitive. An allow-list parser was rejected for
  D2's reason. And because a grammar can regress, `_run` replaces any rc-2 stderr naming the data
  directory with a generic 400 and logs it — the no-path claim of `docs/security.md` no longer rests
  on the grammar alone. Bare attribute names (`due:description`) evaluate to the *same* task's own
  value; same account, nothing about the server — left alone.

## Control

1. `task_service._validate_date_value(name, value)`: strip; empty → the existing clear/not-given path;
   otherwise `DATE_VALUE_RE.fullmatch` or `ValueError`. Called in `_build_args` for `due`, `scheduled`,
   `wait`, `until` only, before any token is built, so a refused value never reaches `_run`.
   Since the second review also `DATE_DOM_RE.search` → `ValueError` (D6).
2. `task_runner._run`: an rc-2 stderr containing `store.path.parent` (the data directory) is logged and
   raised as `TaskwarriorRejected(_DATA_PATH_REFUSAL)`, no path (D6).
3. `models._DATE_FORMAT` gains: "Other Taskwarrior date expressions are accepted as one word
   (`tomorrow`, `eom`, `now+3d`); a value with spaces is refused (400)."
4. `tests/container/test_real_task.py::TestDateValuesAreOneArgument` — the regression, run through
   `task_runner.add_task`/`modify_task` directly so it holds the **binary's** behaviour whether or not
   the service-level grammar exists.

## Evidence

Probed on 2026-11-25 against the host's Homebrew Taskwarrior 3.5.0 (arm64), synthetic stores in the
session scratch directory, no network, with this repository's `taskrc_template.txt`:

| `due:` value | rc | stored `due` |
|---|---|---|
| `2026-01-01`, `2026-01-01T10:00`, `20260101T100000Z`, `2026-01-01T10:00+02:00`, `tomorrow`, `eom`, `now+3d`, `eom-1wk`, `3d`, `P3D`, `2026-W05`, `9am`, `later` | 0 | as expected |
| `2026-01-01 10:00` | 0 | `20251231T230000Z` — **the time is dropped** |
| `now + 1d` | 0 | now + 1 day — the value **is** lexed |
| `(now+1d)` | 0 | now + 1 day |
| `2026/01/01` | 2 | — (not the `Y-M-D` format) |
| `  ` on modify / create | 0 | cleared / none |

All four fields × {`2026-01-01 rc.data.location=V`, the same with tab and newline, `rc.data.location=V`,
`2026-01-01 rc:EVILRC`, `$(touch M)`, `` `touch M` ``, `2026-01-01;touch M`, `now + rc.data.location=V`}:
`V` stays empty, `M` is never created (rc 0 or 2). Positive control: `task rc.data.location=V add …`
creates `V/taskchampion.sqlite3`. A first reading that `TASKRC=EVILRC` (an rc file naming `V`) also
redirects was wrong — `V` already held the store from the control before it; re-run in the test, `TASKDATA`,
which `_run` always sets, outranks an rc file's `data.location`. So an rc file's `data.location` is no
positive control. *Corrected after the third review:* that also made the `rc:EVILRC` payloads unable to
fail; the rc file now carries signals `TASKDATA` does not override (see *Third review*).

**Observation, not a finding:** an element with a **newline** is not read as an attribute at all on 3.5.0.
`add "due:2026-01-01⏎x" -- probe` stores the description `due:2026-01-01⏎x probe` and no date; `modify`
replaces the description with the token. Same account, same store — no redirect, so not a new security
finding under plan M9; a silent misparse the grammar now refuses. Pinned as characterisation
(`test_a_newline_turns_the_token_into_description_text`).

## Test evidence

Run on 2026-11-25 on an arm64 Mac. "Red" is the new test against the code before the control.

| Tier | What | Red | Green |
|---|---|---|---|
| Unit | `test_date_values.py::TestEachDateIsOneArgument` (9) — per field on create and modify the value is exactly one element `field:value` before `--`, the free text untouched; `subprocess.run` gets a list and never `shell=True` | green before the control: this is the shape the refutation rests on, and it already held | green |
| Unit | `TestTheDateGrammar` (157) — 17 accepted forms × 4 fields pass **unchanged**; 19 refused shapes × 4 fields (embedded override with space/tab/newline, override as the value, `rc:` file, `now + 1d`, `2026-01-01 10:00`, `$(…)`, backticks, `;`, `/`, parentheses, quotes, comma, NUL, zero-width space, no-break space, full-width digits) are `ValueError` with **no call to the binary**; modify refused likewise; surrounding whitespace stripped; whitespace-only still clears/sets nothing; `recur` (`3 weeks`) untouched | **88 red**: every refused shape reached argv; whitespace was passed through | green |
| ASGI/REST | `TestOverHttp` (10) — the payload on `POST /tasks` and `PUT /tasks/{uuid}` for each field is 400 "not a valid date", never in any recorded argv, the store unchanged; the documented forms 201 | **8 red**: 400 already (the fake refuses every date outside its three forms, like rc 2) but the payload **reached argv** — which is why the test asserts the argv, not the status | green |
| Container | `test_real_task.py::TestDateValuesAreOneArgument` (19) — per field, 9 payloads via `task_runner.add_task`/`modify_task` past the service: no store in a watched empty directory, bob's directory and tasks unchanged, no shell marker, at least one payload accepted (so the attempt was real); positive control (standalone override creates the store); the documented forms stored as `…T000000Z`/`…T103000Z`; the service refuses the payload with the store untouched; the version tripwire (`3.5`); the newline characterisation | the binary-side tests were green on the unchanged code — that is the refutation; the 4 service-refusal tests **red** before the control. **Mutation:** `_run` changed to split each argument on whitespace (a re-lexing binary): all **8** redirect tests red, each naming the token that opened a store in the victim directory; reverted | green, **run against the host's Homebrew Taskwarrior 3.5.0, not the CI image** |
| Container (whole tier) | `backend/tests/container` | — | 115 passed on the host's Homebrew 3.5.0 |
| Changed expectation | `test_task_service.py::TestValidatedButPermissive::test_date_fields_are_validated_by_taskwarrior_not_by_us` pinned that a date reached argv unvalidated; renamed `test_a_date_is_shaped_by_us_and_parsed_by_taskwarrior`: a value with spaces never reaches argv, a one-word non-date still reaches the binary and is its 400 | red after the control (intended) | green |
| Unit (whole tier) | `backend/tests/unit` | — | 1 795 passed |

No browser test: nothing in the SPA changed, and it sends `YYYY-MM-DD` only.

## Second review (2026-11-25)

Six findings; each verified against the host's Homebrew Taskwarrior 3.5.0 with synthetic stores.

| # | Finding | Verdict | Change |
|---|---|---|---|
| 1 | The grammar admits DOM references; `due:rc.data.location` → 400 naming the absolute store path, `system.os` → `Darwin`, `tw.version` → `3.5.0`, `now+rc.data.location` stored as `now` | **confirmed** (re-probed: same stderr) — a disclosure, not a redirect | D6: `DATE_DOM_RE`; `_run` path substitution; `security.md`'s no-path claim corrected |
| 2 | The grammar admits the colon override `rc.data.location:..`, `rc:rc`, `rc.hooks:on` | **confirmed** (inert inside a date on 3.5.0, rc 2; a working override standalone) | D6 refuses them; comment, `threat-model.md`, `operations.md` step 4 and D2 corrected |
| 3, 5 | No binary-level payload uses the colon spelling | **confirmed** | `_payloads` gains `rc.data.location:V` (whole value, after a space, after `now+`), `rc.data.location:..`, `rc:EVILRC` as the whole value; the positive control runs for `=` **and** `:` |
| 4, 6 | The modify regression never checks that a payload was accepted, nor bob | **confirmed** | counts accepted modifies and asserts ≥ 1; bob's files and tasks compared; a modify-side positive control |

| Tier | Test | Red before the fix | Green |
|---|---|---|---|
| Unit | `TestTheDateGrammar`: 14 new refused values × 4 fields (`rc.data.location`, `rc.dateformat`, `RC.data.location`, `system.os`, `tw.version`, `now+rc.data.location`, `1.description`, `context.name`, `rc.data.location:victim`, `rc.data.location:..`, `rc.hooks:on`, `rc:rc`, `RC:evilrc`, `now+rc:evilrc`); 2 new accepted (`2030-01-01T10:00:00.5Z`, `march`, both rc 0 on 3.5.0) | **56 red** (all new refused cases reached argv) | green |
| Unit | `TestTheStorePathNeverReachesTheCaller` (2): an rc-2 stderr naming the data path is generic; an ordinary refusal still names its value | **1 red** (the path was passed through); the other green, as intended | green |
| Container | `test_past_the_grammar_the_store_path_still_never_reaches_the_caller` (via `task_runner`, past the grammar) | **red** — the 400 carried the absolute store path | green |
| Container | `test_over_http_a_dom_reference_is_refused_and_names_nothing` × 5 (real ASGI app, real binary) | **4 red** (`rc.data.location`, `system.os`, `tw.version` leaked; `now+rc.data.location` was 201); `rc:rc` green before — the binary refuses it without disclosure | green |
| Container | `test_a_dom_reference_in_a_date_is_evaluated_by_the_binary` × 3 — characterisation: the raw binary does echo the path, so a grammar regression is caught by the tests above | green (it is the binary's behaviour) | green |
| Container | the colon payloads in the add/modify regressions; the strengthened modify test; `test_the_harness_can_see_a_redirect[=]`/`[:]`, `…_on_modify` | green before — no redirect on 3.5.0; the controls prove a standalone override in either spelling, and on modify, does redirect | green |
| Container (whole tier) | `backend/tests/container` on the host's Homebrew 3.5.0 | — | 124 passed |
| Unit (whole tier) | `backend/tests/unit` | — | 1 861 passed |

Public surface: unchanged in shape — the newly refused values were never documented and are 400 as
before (the DOM refs were already 400 from the binary, now without the disclosure; `now+rc.data.location`
was 201 and stored a wrong date, now 400). No OpenAPI string changed. No rule, risk or waiver changed.

## Third review (2026-11-25)

| # | Finding | Verdict | Change |
|---|---|---|---|
| 1 | The `rc:EVILRC` payloads cannot fail: the rc file only set `data.location`, which `TASKDATA` outranks, so a loaded file leaves `victim` empty; no positive control for the `rc:` form | **confirmed.** Re-probed on the host's Homebrew 3.5.0: `task rc:EVILRC add -- control` with `default.project=PWNED` stores project `PWNED` and leaves `victim` empty. A simulated regressed binary on `PATH` (a wrapper that hoists an embedded `rc:<file>` out of a date value into a standalone argument, 40 hoists logged) left the **old** add/modify regressions green (8 passed) | `evil_rc` now also sets `hooks=on`, `hooks.location` to a directory holding an `on-launch` hook that creates a `rc-loaded` file, and `default.project=PWNED`; both loops assert no `rc-loaded` after every payload, the add loop also no alice task in `PWNED`; two positive controls (`test_the_harness_can_see_an_rc_file_load_on_add` / `…_on_modify`) show a standalone `rc:` runs the hook and, on add, sets the project |

| Tier | Test | Red before the fix | Green |
|---|---|---|---|
| Container | `test_an_override_in_a_date_on_{add,modify}_reaches_no_other_store` × 4 fields, against the simulated regressed binary | old version **green (blind)**, 8 passed; new version **8 red**, each naming `<field>:2026-01-01 rc:<evilrc>` "loaded the rc file (its hook ran)" | green against the unmodified Homebrew 3.5.0 |
| Container | `test_the_harness_can_see_an_rc_file_load_on_add`, `…_on_modify` (positive controls) | new | green — a standalone `rc:` is loaded on add and modify |
| Container (class) | `TestDateValuesAreOneArgument` on the host's Homebrew 3.5.0 | — | 32 passed |

The regressed binary was a test-only wrapper in the session scratchpad, never committed. Test-only change
plus docs (`threat-model.md`, `operations.md` step 4); no product code, public surface, rule, risk or waiver
changed.

## Rollback

The previous image passes every date value to Taskwarrior; rolling back gives back exactly that, and no
stored data depends on the grammar (Taskwarrior stores its own normalised `YYYYMMDDTHHMMSSZ`, which the
grammar accepts if a client resends it). Nothing to migrate in either direction.

## Results

- **SEC-007 stays rejected** — now for all four fields, on add and modify, against the binary, in CI on
  every build (`RULE-TEST-002`). Closing criterion of plan §5 ("no fix; regression stays green, upgrade
  re-open trigger documented"): met in this repository; "stays green" in the CI image is the first CI run
  of this branch (see *Deferred*).
- **Defence in depth** — a date is one word; the documented syntax and every one-word Taskwarrior
  expression are unchanged.
- **Upgrade trigger** — executable (the version tripwire) and documented (`docs/operations.md`,
  *Upgrading Taskwarrior*; `docs/threat-model.md`; `docs/security.md`).
- **No rule, risk, waiver, budget or baseline changed.** No residual risk is closed or added: the
  asserted-only part ("another version behaves the same") is held by the tripwire, and the container tier's
  own limits stay `RISK-TEST-001`/`RISK-TEST-002`.

## Deferred, with trigger

- **The container regression in the CI image (Arch, amd64).** It ran here against Homebrew's 3.5.0 on arm64
  only; `py-test-container` is skipped on arm64 (`RISK-TEST-001`). Trigger: the first CI run of this branch;
  if the tripwire or any redirect test fails there, the branch does not merge.
- **The next Taskwarrior major/minor** — the procedure in `docs/operations.md`; trigger: a snapshot-date bump
  in `backend/Dockerfile`/`Dockerfile.test` (the tripwire fails CI).
- **Third-party MCP clients sending `now + 1d` or `2026-01-01 10:00`** — not observable from here; they now
  get a 400 naming the one-word form. Trigger: a user report; the remedy is the client's, the time-dropping
  form was never stored correctly.
