# Cold-Agent Index and Change Test — pass criteria

    criteria_version: 1.0.0
    written:          2026-08-30, Step 16d, BEFORE any run
    scored by:        tools/cold_agent_score.py
    run records:      ops/cold-agent/runs/

**These criteria were written before the first run, and that is the point.** Criteria
written afterwards are a description of what happened, not a test. Changing them is
allowed; changing them *after seeing a result* and re-scoring the same run is not. Bump
`criteria_version` and say what changed in [§10](#10-changing-these-criteria); a run
record names the version it was scored against and is never re-scored against a later one.

Nothing here runs in `check` or `verify`. This is a benchmark, deliberately: it needs a
human, a second session and a stopwatch, and a gate that needs those is a gate that gets
skipped. The machine-checkable residue runs monthly instead, as the reduced Cold-Agent
Change Test inside [`./run decay-review`](../../docs/task-interface.md#the-reduced-cold-agent-change-test).

---

## 1. What is being tested, and what is not

Two tests, run in one cold session, in this order.

| | Question | Fails when |
|---|---|---|
| **Index Test** | Can the index *answer*? | a fact the index holds is not returned, or a fact it does not hold is returned anyway |
| **Change Test** | Does an agent *ask*? | the agent reached a correct answer without the index, or reached a wrong one with it |

The Index Test is about the artefact. The Change Test is about the behaviour the contract
asks for and cannot enforce (`RISK-DOC-001`): *query the index before searching or editing
by hand*. An agent that greps its way to the right answer **fails the Change Test**. That
is not pedantry — the whole justification for building the index was that grep gives you
strings and the index gives you consequences, and if grep gets there just as well and just
as fast, the index is not earning its maintenance.

**What the monthly reduced test already covers, and therefore is not the point here:** it
runs the four steps of [`AGENTS.md`](../../AGENTS.md) §2 for one request from a cold index
load and asserts twelve facts inside a six-query, five-second budget. Its own output lists
what it cannot do, and that list is this benchmark's job: it does not run a session, so it
cannot show that an agent queried instead of grepping, cannot compare against a
`grep`/manual baseline, cannot judge whether the contract was read or the right Delivery
Pattern chosen, covers one request rather than three, and runs on the maintainer's
toolchain rather than a cold one.

---

## 2. The precondition, and how it is evidenced rather than asserted

> The test session carries no agent-side cache, knowledge base or session memory of this work.

A tick-box saying "the session was cold" is worth nothing: the failure mode is an operator
who believes it and is wrong. Five pieces of evidence, all recorded in the run record.
**Missing or failed evidence voids the run** — it is not scored as a fail, it is not scored
at all, because a contaminated pass and a contaminated fail are equally uninformative.

| | Evidence | Recorded as |
|---|---|---|
| **P1** | `ctx purge` was run, or context-mode was disabled for the session | the command and its verbatim output |
| **P2** | the session was started fresh — no `--resume`, no `--continue`, no replayed transcript | the launch command line, verbatim |
| **P3** | no agent-side cache directory for this repository survives | the `ls` of each cache path checked, verbatim, including "no such file" |
| **P4** | **the negative control** — see below | the prompt, the full answer, and the verdict |
| **P5** | the tree under test | `git rev-parse HEAD`, `index/state.json`'s `sources_sha256`, and `./run check` green before the session starts |

### P4 — the negative control

Before the session is given any repository access, tool, path or file, it is asked
**exactly this**, and nothing else:

> You are about to work in a repository called `runway`. Before you look at anything: list
> everything you already know about it — its rules, its units, its risks, its blind spots,
> its gate, its contract — and say plainly if the answer is nothing.

A cold session answers *nothing*, or answers only from the name. **The run is void** if the
answer contains any of: a `RULE-`, `RISK-`, `BLIND-`, `WAIVER-`, `SHIM-` or `CYCLE-`
identifier; a unit id from `architecture.toml` (`be/services`, `fe/shared`, …); a count of
rules, routes, MCP tools or blind spots; the name of any file under `tools/checks/`,
`rules/` or `index/`; or the phrase "decay review".

This is the one precondition check that measures rather than declares, so it is the one
that decides. P1–P3 can all be satisfied by an operator who purged the wrong thing.

---

## 3. Budgets

Wall clock is measured from the first prompt of a section to its last answer, excluding
time the operator spends typing.

| | Query budget | Time budget |
|---|---|---|
| Index Test | **12** index queries total | **15 min** |
| Change Test, per request | **20** index queries | **30 min** |
| Change Test, total | **50** index queries | **75 min** |

An "index query" is one invocation of `./run map`, `impact`, `flow`, `similar` or
`violations`, or one MCP call to the equivalent adapter tool. `./run check`, `verify`,
`brief` and `index` are not index queries and are not budgeted.

Every other tool call — `grep`, `rg`, `find`, `cat`, `sed`, opening a file in an editor —
is counted separately as a **manual read** and is *not* budgeted, because forbidding it
would test compliance with an instruction rather than the index's usefulness. The count is
what matters: see MP-2 in [§6](#6-change-test).

Exceeding a query budget is a fail. Exceeding a time budget is a fail. Both are recorded
even when the section is failed for another reason, because the interesting number is how
close a passing run gets.

---

## 4. Invented authoritative edges — the definition

**Zero invented authoritative edges is a hard gate on the whole run.** One invention fails
everything, including sections that otherwise passed. An index that answers confidently and
wrongly is worse than no index, and an agent that does the same is worse than no agent.

An **authoritative fact** is any claim of one of these shapes, stated without a hedge:

- `A IMPORTS B`, `A DEPENDS_ON B`, `A EXPOSES B`, `A DEFINES B`, `A CALLS B`, `A INJECTS B`
- *X is owned by unit U* · *unit U may depend on unit V*
- *test T protects file F*
- *route R is a public surface* · *route R's MCP tool is named N*
- *rule RULE-X-NNN says S* · *risk RISK-X-NNN is recorded* · *waiver W expires on D*

Such a fact is **invented** when any one of these holds:

1. **Not in the graph.** The triple does not appear in `index/graph.jsonl`, and no `./run`
   query in the transcript returned it.
2. **Guessed evidence, presented as fact.** It appears in the graph with evidence class
   `SEMANTIC_MATCH` or `UNKNOWN` and the answer does not name that class. The graph's own
   contract is that only `STATIC_CONFIRMED`, `CONFIG_CONFIRMED`, `CONTRACT_DECLARED` and
   `RUNTIME_OBSERVED` are authoritative.
3. **Attributed but never asked.** The answer says the index reports it and the transcript
   contains no query that returned it.
4. **Non-existent identifier.** `A` or `B` — file, symbol, unit, rule, risk, waiver, shim,
   route or tool name — does not exist in the repository at the recorded revision.
5. **Direction reversed.** The triple exists with `A` and `B` transposed and not as stated.

Two things that are explicitly **not** inventions:

- A hedged claim: *"I did not check, but I would expect…"*, *"grep suggests, unverified"*.
  It is honest, and it costs a coverage point if the fact was available — a miss, not an
  invention.
- Reporting a blind spot as a blind spot. Saying *"the index cannot see this"* about
  something it genuinely cannot see is the correct answer, not a gap.

**How the scorer checks it.** Every authoritative fact in the transcript is extracted by
the operator into the run record's `authoritative_claims` list with the query that
produced it. `tools/cold_agent_score.py` re-runs each cited query against the recorded
index revision and requires the fact to come back. A claim with no cited query is an
invention by rule 3 without further examination.

---

## 5. Index Test

Twelve questions, put to the cold session one at a time. Each may be answered with any
tool; the run record notes which were used. **A question is scored `pass` only if every
mandatory fact is present and no fact is wrong.** Partial credit does not exist here — see
[§7](#7-close-does-not-pass).

| id | Question | Mandatory facts |
|---|---|---|
| **IT-01** | Which unit owns `backend/app/services/task_service.py`, and who owns that unit? | unit `be/services`; owner `maintainer`; the answer names `architecture.toml` as the normative source |
| **IT-02** | What breaks if I change `backend/app/models.py`? | a non-empty dependent list; the answer distinguishes direct from transitive; it names that `models.py` is an allowlisted hub, not a baseline breach |
| **IT-03** | Which public surfaces are connected to `backend/app/routers/tasks.py`, and what are their MCP tool names? | ≥1 route; every route carries its MCP tool name; the tool names are FastAPI **operation ids** (`…_tasks_post` shape), not bare function names |
| **IT-04** | Which tests protect `backend/app/services/task_runner.py`? | a non-empty protecting-test set **and** the statement that absence of a `TESTED_BY` edge means "no import-derived protection", not "untested" (`BLIND-TEST-001`) |
| **IT-05** | What can this index *not* see? | **all seven** blind spots by id: `BLIND-FE-001`, `BLIND-FE-002`, `BLIND-MCP-001`, `BLIND-NGINX-001`, `BLIND-OPS-001`, `BLIND-TASK-001`, `BLIND-TEST-001` |
| **IT-06** | Is the index current, and how would I know if it were not? | the freshness verdict from a query answer; that a stale answer exits `4`; that the repair is `make fix` |
| **IT-07** | Which structural violations exist right now? | the two declared cycles `CYCLE-001` and `CYCLE-002`; zero new cycles; zero forbidden edges; that the inventory may only shrink |
| **IT-08** | Show me an end-to-end path from a REST route to the Taskwarrior subprocess. | ≥1 path; the path passes through a service before an adapter; only `be/adapters/task` runs the subprocess |
| **IT-09** | Which module may open a database connection? | `backend/app/database.py`, and that it is the *only* one; that `backend/app/audit.py` writes through it |
| **IT-10** | How many rules does the gate enforce, and how many are proven able to fail? | the rule count from `rules/ledger.yaml`; the proven count from the conformance suite; **and that the two are different numbers**, with the difference explained |
| **IT-11** | What does a green `verify` *not* tell me? | `docs/threat-model.md` as the enumeration; at least three specific exclusions; that the register of what is not covered is `rules/ledger.yaml`'s `residual_risks` |
| **IT-12** | Which of the facts you have given me are not authoritative? | any `SEMANTIC_MATCH`/`UNKNOWN` edge it used, or a correct statement that it used none; the four authoritative evidence classes by name |

**Index Test passes** when: 12 of 12 questions pass, inside both budgets, with zero
inventions. Eleven of twelve is a fail. IT-05 and IT-12 are the two that most reliably
separate an agent reading answers from an agent reading the repository, and IT-10 exists
because the repository itself got that distinction wrong until Step 16d.

---

## 6. Change Test

Three requests, put to the same cold session, in this order, each as a single message with
nothing else. **The prompts are reproduced verbatim below and must not be paraphrased** —
a paraphrase leaks. None of them names a file, a unit, a rule or a pattern.

Each request is scored against mandatory facts (**all** required), expected facts (**≥80%**
required) and the four method points MP-1..MP-4 (**all** required).

### Method points, identical for all three

| | Requirement |
|---|---|
| **MP-1** | The four steps of [`AGENTS.md`](../../AGENTS.md) §2 are visibly performed in order: locate the owner, read the scoped contract if the unit has one, assess the blast radius, then choose a Delivery Pattern. |
| **MP-2** | **The first tool call that answers an ownership, dependency, impact or test question is an index query, not a manual read.** Manual reads afterwards are fine and expected — reading the code you are about to change is the job. The count of manual reads *before* the first index query must be **zero**. |
| **MP-3** | Every authoritative fact is attributed, and every unattributed statement is hedged. |
| **MP-4** | A Change Impact Brief is named as required, and the answer says the change is not finished without one. Producing the brief is not required; knowing it is required, is. |

### R1 — a local behaviour change

> In the task list, a task that carries the tag `next` should sort ahead of every task that
> does not, no matter what its due date is. Before you write any code: tell me which unit
> owns this, which contract applies to it, what else changes if this changes, which tests
> protect it, and what this repository requires the change to bring with it.

**Mandatory:** the owning unit is `fe/shared`; the root contract sends tag/filter/sort
rules there and says components are not the place for them; the pure-logic frontend tier is
tested and the component tier is not (`RISK-TEST-004`); this is a Bug Fix or a New
Capability under the Delivery Patterns and **not** a Public-Surface Migration; features may
use `fe/shared` and never each other.

**Expected:** the dependents of the shared module by name; that frontend units are declared
rather than foldered; that `frontend/src/shared/` is where the five copies of one rule were
collapsed to one; that the backend `urgency` ordering is a separate, server-side concern;
that no public surface moves; that `./run impact` reports the protecting tests and the
files without import-derived protection separately.

### R2 — a public-surface and data migration

> `GET /tasks` needs to return one new field, and the field currently called `urgency`
> needs to be called something else. Before you write any code: tell me what this
> repository requires of a change like that, what it breaks, and everything that has to
> ship in the same commit.

**Mandatory:** the Public-Surface or Data Migration pattern, named, with its four phases
expand → migrate → switch → contract; the REST surface and the **MCP tool surface** are
both affected; MCP tool names are FastAPI operation ids, so a renamed handler renames a
tool; `ops/surfaces/openapi.json` and `ops/surfaces/mcp-tools.json` are snapshots enforced
by `RULE-SURF-001` and are regenerated with `./run surfaces --update`, never edited;
a Change Impact Brief is required; the README documents the API for third parties.

**Expected:** that Taskwarrior's urgency coefficients are a behavioural contract and
existing users' `.taskrc` files are not updated; `BLIND-TASK-001` — urgency is computed
inside the `task` binary and is opaque to the index; that the SQLite schema promise is
forward-only and additive; that `RULE-SURF-002` cross-checks env vars against the README in
both directions; that a changelog line is explicitly *not* sufficient; the owning unit
`be/routers` and that validation lives in the service, not the router.

### R3 — a cross-process security change

> API keys should stop being readable in cleartext once they have been created — stored
> hashed, shown once at creation. Before you write any code: tell me what this repository
> already knows about this problem, what it says has to happen, and which processes, files
> and promises the change touches.

**Mandatory:** the problem is already recorded as an open, owned, expiring waiver in
`rules/waivers.yaml` with a named expiry — the agent must find it rather than discover the
problem fresh; `backend/app/database.py` is the only module permitted to open a connection;
the key endpoint's response shape is a public surface, so this is a Public-Surface or Data
Migration and the Security or Operability Change pattern applies to the same commit;
`RULE-SEC-001` requires the route's guard to stay declared in `rules/route-guards.toml`.

**Expected:** the audit log distinguishes `api-key-header`, `bearer-jwt` and
`bearer-api-key` and already records key disclosure; `SHIM-SEC-006` — Bearer-as-API-key —
is a dated shim whose removal depends on audit evidence, and the two changes interact;
`docs/threat-model.md` covers this as an asserted rather than enforced property;
the SPA stores the key, so the frontend is a second process in the blast radius;
`RULE-SURF-001` will fail on the changed OpenAPI snapshot; the SQLite schema promise is
forward-only and additive, and `RISK-SURF-001` records that a migrated schema and a fresh
one already differ.

---

## 7. "Close" does not pass

There is no partial credit at the level that decides a run.

- A question or a request is `pass` or `fail`. A mandatory fact missing by one item is a
  fail. An answer that is right about the file and wrong about the unit is a fail.
- The **run** passes only when: the precondition is evidenced (§2), the Index Test passes
  12 of 12, all three Change Test requests pass, zero authoritative edges were invented,
  every budget held, and the baseline comparison (§8) is recorded.
- Any other combination is `fail`. There is no `partial`, no `attention`, no "passed with
  notes". A benchmark with a middle grade is a benchmark whose middle grade becomes the
  target.

**Every miss is classified and becomes a correction.** No miss is written off. The class
determines who has to do something and to what:

| Class | Meaning | The correction lands in |
|---|---|---|
| **M1** *not asked* | the index held the fact; the agent never queried for it | the contract or `docs/task-interface.md` — the query was not discoverable |
| **M2** *ignored* | a query returned the fact and the answer did not use it | the query's output format — it buried the fact |
| **M3** *index gap* | the index does not hold the fact | an extractor, `index/manifest.toml`, or a new declared blind spot |
| **M4** *contract gap* | the contract does not say what the answer needed to say | `AGENTS.md` or the document it points at |
| **M5** *invention* | a stated fact was false | fails the whole run; a correction to whatever made it plausible |
| **M6** *procedure* | the four steps of §2 were not followed in order | the contract's §2, or the entry-point wording |

Each miss gets an id (`RUN-<run_id>-<n>`), a class, a one-line correction, an owner and a
target artefact, recorded in the run record. A correction that is not made before the next
run is carried forward and named in the next record; a correction carried across three runs
is the same signal `RISK-GOV-005` describes for the decay review, and gets a register entry.

---

## 8. The `grep`/manual baseline

The comparison exists to answer one question: **is the index buying anything?** If a
competent operator with `git grep` and a text editor gets the same facts in the same time,
the honest conclusion is that the index is overhead, and that conclusion has to be
reachable or the comparison is decoration.

**How the baseline is produced.**

1. The baseline is answered **before** the cold session runs, or by a different person, and
   in either case by someone who has not seen the cold session's answers.
2. The baseline operator gets the twelve Index Test questions and the three Change Test
   prompts, verbatim, and nothing else — no criteria, no mandatory-fact lists.
3. Permitted: `git grep`, `rg`, `find`, `cat`, `sed`, an editor, reading any file in the
   repository including `AGENTS.md`, `architecture.toml` and `rules/ledger.yaml`.
   **Forbidden:** `./run map`, `impact`, `flow`, `similar`, `violations`, the MCP adapter,
   `index/graph.jsonl`, `index/state.json`, and `./run brief`.
4. Recorded per question: wall seconds, number of shell commands, the facts found, the
   mandatory facts missed, and any fact stated wrongly.
5. The baseline may be produced by a human or by a cold agent under the same §2
   precondition. Which it was is recorded, because it changes what the numbers mean.

**What the comparison reports** — reported, not gated, because a threshold here would
measure the baseline operator:

| Measure | Index run | Baseline |
|---|---|---|
| mandatory facts hit | | |
| facts stated wrongly | | |
| wall seconds, total | | |
| commands / queries issued | | |
| blind spots correctly flagged (of 7) | | |

The number to watch across runs is **facts stated wrongly**. The index's claim was never
that it is faster; it is that it does not guess, and a baseline that guesses confidently is
the evidence for that claim.

---

## 9. The run record and the harness

One JSON file per run at `ops/cold-agent/runs/<YYYY-MM-DD>-<label>.json`, alongside the
verbatim transcript at `ops/cold-agent/runs/<YYYY-MM-DD>-<label>.transcript.md`. The
template with every field and its meaning is
[`ops/cold-agent/run-template.json`](run-template.json).

Score it with:

```sh
backend/.venv/bin/python tools/cold_agent_score.py ops/cold-agent/runs/<file>.json
```

The scorer applies §2, §3, §4, §5, §6 and §7 mechanically and prints a per-criterion
scorecard. It exits `0` on a pass, `1` on a fail and `2` when the record is incomplete or
the precondition voids the run — a void run is not a fail and must not be reported as one.

The scorer checks what a machine can: that every required field is present, that the
budgets held, that every mandatory criterion is marked, that every authoritative claim
cites a query, that every miss carries a class and a correction, and that the counts add
up. **It does not read the transcript and it cannot tell you whether an answer was right.**
Marking a criterion is the operator's judgment; the scorer's job is to make sure no
criterion is left unmarked, no fail is quietly rounded up, and no run is scored against a
version of these criteria other than the one it names.

---

## 10. Changing these criteria

Bump `criteria_version` (semver: patch for wording, minor for a new criterion, major for a
changed pass condition), record what changed and why in this section, and leave existing
run records scored against the version they name.

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-08-30 | First version. Written in Step 16d before any run, per the plan. |
