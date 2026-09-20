# Change Impact Brief 0037 — The container clock is Berlin

| Field | Value |
|---|---|
| **Requested outcome** | The deployed backend answers day questions in the zone its users live in. Every "today" this API produces — overdue, due today, a tickler task returning, the `due_before` / `due_after` filters, and the day the review counters will be built on — asks which calendar day a stored UTC timestamp falls on, in the server's zone, and Taskwarrior reads a bare `YYYY-MM-DD` in that same zone. The image runs UTC, so between local midnight and 02:00 the server's day is still yesterday's: a task entered as due today reads back as due yesterday and is reported overdue. The decision to fix that by setting `TZ=Europe/Berlin` in the deploy compose was taken by the owner; this commit is the whole of it. |
| **Owning unit** | `ops` ([`ops/deploy/docker-compose.yml`](../../ops/deploy/docker-compose.yml)), `be/services/task` (`_zone()`), backend unit and container tests, `docs` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §5 (the deploy compose is the deployed artefact — it is baked into the backend image and written over the host's copy, so editing it changes production configuration), §10 (`RISK-OPS-002`: nothing compares the host against this file, so the change lands with the next deploy and is not verified from here) |
| **Governed by** | No ADR. The decision is one environment variable with a single, documented effect and no alternative under consideration once the users' zone is fixed; it is recorded here and in [`docs/operations.md`](../operations.md) ("The container clock") rather than as a decision record. [ADR 0036](../adr/0036-list-semantics-against-taskwarrior-3-5.md) is where the clock (`task_service._now()`) became a single seam, and [ADR 0038](../adr/0038-validated-filters-and-exact-project-match.md) is where the day filters that consume it were written. |
| **Rule IDs introduced** | None. No gate rule changes; no ledger entry is added or reworded. `RULE-OPS-003` (what the deploy compose may ask of the host) already reads this file and is unaffected by an environment variable. |
| **Entry points** | [`ops/deploy/docker-compose.yml`](../../ops/deploy/docker-compose.yml), service `backend`, `environment:`. The code it reaches is [`backend/app/services/task_service.py`](../../backend/app/services/task_service.py) `_zone()`, `_now()` and `_local_day()`, and the `task` subprocess `task_runner._run` spawns with `os.environ`. |
| **Affected public surfaces** | **None.** No route, schema, operation id, MCP tool, database object, SPA route or storage key moves: REST stays 33, MCP 22, route guards 32 (25 user / 4 admin / 3 open), and `ops/surfaces/*` is byte-identical. **Not an env-var surface:** `RULE-SURF-002` compares `README` against the fields of `Settings`, and no field reads `TZ` — libc does. Documenting it in a README code block would in fact be wrong in one direction (`README` documents what the application reads), which is why it is documented in `docs/operations.md` instead. The **Claude skill is untouched**, so it stays 0.6.0 and no bump is owed (`RULE-SURF-004`). |
| **Known dependents** | Everything that asks `task_service` a day question: the `due_before` / `due_after` / `scheduled_before` / `completed_since` filters, the tickler order, and the summary counters that P1-6 will add on top of the same `_now()`. Nothing else in the process reads the zone: the JSON log lines, the audit log and the JWT expiry all ask for UTC by name. |
| **Uncertain / dynamic areas** | `RISK-OPS-002` and `BLIND-OPS-001` — this file *is* the host's compose since 2026-08-31, but nothing checks that the write happened; the variable is real only after the next deploy, and confirming it is a production read, not a gate result. `RISK-TEST-001` — the container tier does not run on an arm64 developer machine, so the new tests are proved here against `/opt/homebrew/bin/task` 3.5.0 by hand (D25) and authoritatively in CI. `BLIND-TEST-001` — test protection is import-derived, and a YAML file has none by construction, so nothing would notice the declaration being deleted; `TestTheServersZone` reads the compose from the unit tier to close that, which is a test rather than a gate rule (no ledger entry, no negative fixture) and is recorded as such. |
| **Analogous implementations** | [Brief 0025](0025-bake-the-compose-into-the-image.md) — why editing this file is a deploy and not a description, and what that widened. [Brief 0032](0032-list-semantics.md) — where `_now()` became the single clock the day logic asks, and the container tests that pin Taskwarrior's own date handling. |
| **Delivery Pattern** | **Operability Change.** Failure scenario, control, adversarial proof, below. |
| **Required tests** | **Container tier** — the deployed image and the real binary, which the unit tier fakes. `TestTheBerlinZone` in [`backend/tests/container/test_real_task.py`](../../backend/tests/container/test_real_task.py): (1) the runtime image carries `/usr/share/zoneinfo/Europe/Berlin` and `TZ` plus `tzset()` actually moves `task_service._now()` off UTC at the test instant; (2) at 23:30 UTC on 2026-09-20 — 01:30 Berlin on the 21st — `POST /tasks` with `due: 2026-09-21` is stored by the real binary as `20260920T220000Z`, `_local_day()` calls that the 21st, a "due today" window around the 21st returns it and `due_before=2026-09-21` does not; (3) the same stamp at the same instant under UTC reads as the 20th, so the "due today" window misses it and the overdue query claims it; (4) in a Berlin container the audit stamp and the JSON log timestamp still end in `Z`, and `_now()` carries Berlin's *current* offset rather than a hard-coded `+02:00` — asserting `+02:00` would turn this tier red every winter for a reason unrelated to any change; (5) a summer stamp and a winter stamp each keep their own Berlin day, which no single fixed offset can satisfy. **Unit tier** — `TestTheServersZone` in [`backend/tests/unit/test_task_service.py`](../../backend/tests/unit/test_task_service.py): the same two-season day conversion without the binary, a `TZ` naming no zone falling back rather than raising, and the assertion that the `backend` service of the deploy compose still declares `TZ=Europe/Berlin`. |
| **Intended scope** | One `TZ=Europe/Berlin` line with its comment in the backend service of the deploy compose, the five container tests and three unit tests that hold it, the one correctness fix the move forces in `task_service` (`_zone()`; see *Behaviour change*), the two test-tier sentences that said the shipped image runs UTC, the `docs/operations.md` section, and this brief. **Not** in scope: the frontend service (it renders no dates server-side), the development `docker-compose.yml` (a developer's own machine is their zone), `Settings`, `README`, the `Rotation` callout's outstanding host action, and the summary counters that will consume this clock (P1-6). |
| **Base revision** | `cb29f23` |

## Behaviour change

For the deployed server, one thing changes: the calendar day it believes it is, and the day it reads a
bare `YYYY-MM-DD` as. Stored data does not move — Taskwarrior stores UTC and always did. What moves is
the interpretation on both ends of the round trip, and they move together, which is the point: the date
the user types and the day the API reports are now the same calendar.

Nothing else follows the zone. `docs/operations.md` promises UTC timestamps in the log stream and the
audit log, and `auth.py`, `audit.py` and `logging_setup.py` all say `tz=UTC` at the call site rather than
relying on the process zone, so a Berlin container stamps exactly what a UTC one did. The fourth new test
exists so that stays a fact rather than a reading of the source.

**One line of application code moves, and it has to.** `_local_day()` converted a stamp with
`_now().tzinfo`, and `datetime.now().astimezone().tzinfo` is a *fixed offset* — `CEST` (+02:00) today,
`CET` (+01:00) in December — not Berlin's rule set. Under UTC that offset was always zero and the
difference could not show; a zone with two offsets makes it live, and every stamp from the other half of
the year reads a calendar day out. A bare `due:2026-07-15` is stored as `20260714T220000Z` and, once the
server clock is on CET, reads back as the 14th: the very off-by-one this commit exists to remove, made
permanent for cross-season dates instead of lasting two hours a night. `_zone()` resolves `TZ` to a
`ZoneInfo` — the same name libc and the `task` binary read — so the conversion asks the rule that held at
the stamp's own instant. `_now()` stays the single seam tests replace (D10); only the zone it carries
changes, which is why no existing test moves. Without this the commit would trade a two-hour nightly
defect for a six-month one, and the four tests it shipped with could not see it: they pin one instant.

## Failure scenario, control, adversarial proof

**Failure scenario.** A user in Berlin adds a task at 00:30 local (22:30 UTC the previous day) and gives
it `due: <today>`. The binary, in a UTC container, stores midnight UTC of that date. The user's next daily
review — run at 01:00 local, still the previous day in UTC — asks for overdue and due-today counts. The
task is reported neither as due today nor overdue on the day the user meant, and a tickler task whose
`wait` passed at 00:10 local returns a day late in the counters. Nothing errors; the numbers are simply
wrong for two hours a night, in the exact tool whose job is to be trusted about what is due.

**Control.** `TZ=Europe/Berlin` on the backend service in the deploy compose. It is nearly the whole
control: `task_service._now()` already is the single clock (D10, ADR 0036) and `_run` already hands
`os.environ` to the subprocess, so one variable moves the application and the binary together. What the
variable does *not* do by itself is make the clock understand that a zone has two offsets — `_zone()`
does that, and without it the control would trade the defect for a larger one (see *Behaviour change*).

**Adversarial proof.** The violation is constructed rather than described, and it is red where it should
be red:

- `test_under_utc_the_same_stamp_reads_as_the_day_before` *is* the defect, run at the same instant in a
  UTC process: `_local_day("20260920T220000Z")` is the 20th, the Berlin "due today" window returns
  nothing, and `due_before=2026-09-21` — an overdue query on the Berlin day — returns the task. It passes
  today and will keep passing; it is the control's counterexample, pinned so the difference cannot be
  argued about.
- `test_a_bare_due_date_and_the_day_logic_agree_on_the_berlin_day` fails if the zone does not reach the
  process: run it with the tier's default UTC instead of the `_zone("Europe/Berlin")` block and the
  stored value is `20260921T000000Z`, not `20260920T220000Z` — the first assertion goes red.
- `test_the_runtime_image_carries_the_berlin_zone` is the assumption made executable: `TZ` names a file
  under `/usr/share/zoneinfo`, and a container without tzdata silently stays on UTC while the compose
  claims otherwise. Verified independently against the pinned runtime base
  (`python:3.12-slim@sha256:7a8b47…`, the digest both Dockerfiles use): `/usr/share/zoneinfo/Europe/Berlin`
  is present, from `tzdata 2026b-0+deb13u1`, and Python resolves the test instant to
  `2026-09-21T01:30:00+02:00` there.
- `test_the_deploy_compose_puts_the_backend_in_berlin` guards the control itself, which the four tests
  above cannot: each of them sets `TZ` for itself, so deleting the line from the compose left the whole
  suite green while the deployed day logic went back to UTC. Constructed: with `- TZ=Europe/Berlin`
  removed from `ops/deploy/docker-compose.yml`, that test is the one failure in the unit tier; with the
  line back, green. It is a test rather than a gate rule — a rule would mean a ledger entry, a check
  script, a profile line and a negative fixture for a single literal, and `RULE-OPS-003` is about what
  the compose asks of the *host*, not what it declares to the process.
- `test_a_stamp_from_the_other_half_of_the_year_keeps_its_day`, and its unit-tier twin, are the proof
  for the `_zone()` fix. Constructed: put `_now()` back to `datetime.now().astimezone()` and the summer
  stamp reads as 2026-07-14 on a machine in CET and the winter stamp as 2026-01-15 on one in CEST — one
  of the two is red whichever side of a transition the suite runs on, which is the point. Both are green
  with `ZoneInfo`.
- Residual, and deliberately not made executable: whether the running host actually has the variable.
  Nothing in CI can see the host (`RISK-OPS-002`, `BLIND-OPS-001`). It is checked once after the next
  deploy by reading the container's environment, and this brief is the record that it is owed.

## Pre-checks

- Container tier by hand (D25), against `/opt/homebrew/bin/task` **3.5.0**: **71 passed** (66 before;
  5 new). This item touches Taskwarrior's own date interpretation, so the real binary is the only
  witness that matters; the fake normalises dates itself and could not show any of it.
- Unit tier: **528 passed** (525 before; 3 new). No existing test moves — `_now()` is still the seam,
  and the two sentences reworded in `tests/fake_task.py` and `TestWhatTheFakeClaims` are docstrings
  that said the shipped image runs UTC, which stopped being true in this commit.
- Surfaces: `./run surfaces` reports no drift; `ops/surfaces/` is untouched by this commit.

## Counts

Unchanged: REST 33, MCP 22, route guards 32 (25 user / 4 admin / 3 open). No route is added or removed and
no handler is renamed, so `AGENTS.md` §5, `README.md`, `docs/threat-model.md` and `rules/ledger.yaml` need
no edit.
