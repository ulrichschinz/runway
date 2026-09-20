# Change Impact Brief 0039 — When the lists were last looked at

| Field | Value |
|---|---|
| **Requested outcome** | A GTD system is trustworthy only as long as somebody looks at all of it regularly, and nothing in runway records that anybody did. The skill has had to guess: take the newest `modified` date among the pending tasks and treat it as "last reviewed". That answers a different question — touching one task is not reviewing the lists — so a user who ticked one thing off three weeks ago is told their system is current, and the reset the skill exists to offer never triggers. `POST /gtd/review` writes down that a daily or weekly review just finished, `GET /gtd/review` reads it back, and the summary carries it in `last_review` so the decision costs no extra call. A review of one area is a different fact from a review of the whole system, so the scope is part of what is recorded. |
| **Owning unit** | `be/adapters/db` (`database.py`), `be/routers` (`gtd.py`), `be/services` (`task_service.py`), `be/leaves` (`models.py`), backend tests (unit), `rules` (route guards), `integrations` (the skill), `ops` (snapshots), `docs` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 (anything reading or writing a database goes in `database.py`, which is the only module that opens a connection), §4 (`be/routers` → `be/services` → `be/adapters/db` → `be/leaves`; the two new helpers are imported from `gtd.py`, which already imports the module, so `database.py` keeps its seven importers and no fan-in grows), §5 (REST and MCP are externally consumed, and the SQLite schema is forward-only and additive — all three snapshots move and the counts in the contract move with them), §7 (`RULE-SEC-001`: two new routes are two new lines in `rules/route-guards.toml`) |
| **Governed by** | No ADR. A new additive table and two routes decide nothing that a later reader would be surprised by; the one judgement worth recording — that the scope belongs in the key rather than beside it — is argued below. [ADR 0037](../adr/0037-the-mcp-surface-is-an-allowlist.md) is why the two tools appear on MCP without a line of configuration, and [ADR 0025](../adr/0025-narrowing-the-migration-except.md) is why this is a `CREATE TABLE` and not an `ALTER`. |
| **Rule IDs introduced** | None. No gate rule changes; no ledger entry is added or reworded beyond the two sentences that state counts. |
| **Entry points** | [`backend/app/database.py`](../../backend/app/database.py) `CREATE_REVIEWS`, `get_reviews`, `record_review`, [`backend/app/routers/gtd.py`](../../backend/app/routers/gtd.py) `last_reviews`, `record_review`, `summary`, [`backend/app/services/task_service.py`](../../backend/app/services/task_service.py) `scope_key`, [`backend/app/models.py`](../../backend/app/models.py) `Review`, `ReviewCreate` |
| **Affected public surfaces** | **REST (S1):** two new routes, `GET /gtd/review` and `POST /gtd/review`. Additive; no existing route, parameter or response moves. **MCP (S2):** two new tools, `last_reviews_gtd_review_get` and `record_review_gtd_review_post` — the `gtd` tag is on the allowlist (ADR 0037), so they are exposed automatically. 23 → 25; every existing name and summary is byte-identical. **SQLite (S4):** one new table, `reviews`. Forward-only and additive: no existing table, column or index changes. **Route guards:** 33 → 35, both `user`. **Counts:** REST 34 → 36. **Claude skill** 0.7.0 → 0.8.0. One field changes value, never shape: `GtdSummary.last_review` stops being two nulls and starts reporting what was recorded (D17). No SPA route or storage key changes. |
| **Known dependents** | The runway skill, which this commit rewrites to use both routes, and any MCP client that discovers tools at connect time. `GET /gtd/summary` is the one existing caller of anything changed here, and it is changed in the same commit. Nothing else reads `last_review` yet; the SessionStart hook that will (C-5) does not exist. `routers/admin.py`, `routers/auth.py`, `routers/projects.py`, `dependencies.py`, `audit.py` and `main.py` import `database.py` and are untouched — the two helpers are additions, not edits. |
| **Uncertain / dynamic areas** | `BLIND-TEST-001` (the routers are exercised through the ASGI client, so no import-derived test edge exists for `routers/gtd.py`; the coverage is real and is in `test_gtd.py`). `RISK-MCP-001` (the index derives one tool per route and is over-inclusive since the allowlist; the snapshot is the count source, `RULE-DOC-001`). `RISK-OPS-002` (the table is created at boot on the deploy host, and nothing in CI can see that host; the proof is a production read after the deploy). `RISK-TEST-001` (the container tier cannot run on arm64 locally; run by hand anyway, see Pre-checks). |
| **Analogous implementations** | [Brief 0038](0038-the-gtd-summary.md) — the summary this fills in, and the scope rule it has to agree with. [Brief 0035](0035-scoped-lists-and-a-text-search.md) — `_tag_filters`, the validation `scope_key` reuses so that a scope tag and a filter tag cannot mean different things. The `projects` table (`database.py`) is the shape this copies: a small per-user table with a `UNIQUE(username, …)` and an upsert, read by one router. |
| **Delivery Pattern** | **Data Migration** (a new table, forward-only, created by `init_db` on every start like every other) plus **New Capability** (two read/write routes, guard-declared, snapshot-covered, tested). No expand → migrate → switch → contract is owed: nothing that exists is read or written differently, and the one existing response field affected changes value within the shape it already promised. The write obligation is the Security pattern's: the body's `scope` becomes a stored key and is validated through the same tag regex as a filter, and every row is read and written under the caller's own username. |
| **Required tests** | Unit (`test_gtd.py`): `TestReviewTimestamps` — a recorded review comes back; nothing recorded is an empty list and not an error; `reviewed_at` parses as Taskwarrior's own stamp; recording the same kind again moves the timestamp *without* adding a row; the two kinds are separate rows; another user never sees the review, in both directions; 401 on both routes; an unknown `kind` is a 422. `TestReviewScope` — `ar+@work` is stored and returned as `@work+ar`; the same scope in another order (and with a duplicate) updates the same row; a scoped review is a different row from the unscoped one; `-x`, `a++b`, `+ar`, `ar+`, `a b`, a newline and eleven parts are each a 400; over 200 characters is a 422. `TestSummaryLastReview` — the summary reports the unscoped review; `?tag=ar&tag=@work` matches the stored `@work+ar` while `?tag=ar` alone does not; an unscoped review does not answer for a scope. `test_migrations.py` — a database from before the table gains it quietly on the next boot, with an empty log; and the `UNIQUE(username, kind, scope)` the upsert depends on holds against real SQLite, including that a third `kind` is refused by the CHECK. The existing "every view requires authentication" list gains `review`. |
| **Intended scope** | The `reviews` table and its two helpers, `scope_key` in the task service, the `Review`/`ReviewCreate` models, the two routes, the summary's `last_review` fill, the guard declarations, the unit tests, the three snapshots, the skill's two review references, its reset rule, operation table, scope note and permissions block (0.8.0), and the sentences that state a count or the table inventory. **Not** in scope: project status and the `/gtd/projects/overview` route (P1-8) — `statuses` still comes from the `projects` rows with every value `"active"`; the SessionStart hook that will read `last_review` over REST (C-5); any frontend change (the SPA shows neither reviews nor the summary); and any pruning or history of reviews, which the table deliberately does not keep. |
| **Base revision** | `ff15384` |

## Behaviour change

One field changes value; everything else is new.

- **A review is state, not a log.** `record_review` upserts on `(username, kind, scope)`, so
  there is exactly one row per kind and scope and "the rows" and "the latest review of each
  kind and scope" are the same set. Appending would grow a row per review per user forever to
  answer a question that only ever needs the newest one, and would turn the read into a GROUP
  BY over a table nothing prunes. The history of what was *done* is the user's Taskwarrior
  data; this table holds only when somebody last looked.
- **The scope is part of the key, not a detail of the row** (D16). A repository that reviews
  only its own area has not reviewed the whole system, and a single row per kind would report
  otherwise — which is exactly the false reassurance this route exists to remove. `scope` is
  the canonical scope key: the scope tags, validated as tags, deduplicated, sorted and joined
  with `+`, or `''` for the whole system. `+` is the separator precisely because `TAG_RE`
  cannot contain one, so no tag we would ever write can be mistaken for two.
- **The key is derived, never trusted.** `ar+@work` and `@work+ar` name the same area, and two
  clients will spell it both ways, so `scope_key` canonicalizes on the way in and the summary
  resolves its own `tag` list through the same function on the way out. A summary asked about
  `?tag=ar&tag=@work` therefore finds the row a review recorded as `ar+@work`, and a summary
  asked about `?tag=ar` alone — a *smaller* scope, which nobody reviewed — correctly reports
  nothing. `scope_key` is built on `_tag_filters`, so a scope part is refused for exactly the
  reasons a filter tag is (brief 0035) and the two can never drift apart.
- **`last_review` starts telling the truth.** It was `{daily: null, weekly: null}` by
  construction (D17); the shape does not move, the values do. The summary already carries the
  counters a review needs, so a hook or a session start can decide whether to speak in one
  call — which is the whole reason the field was reserved there rather than left to a second
  request nobody would make.
- **A new table, not a new column** (D15). The migration loop runs *before* the `CREATE`
  statements, so an `ALTER TABLE … ADD COLUMN` against a table a fresh database does not have
  yet fails on the first boot and succeeds on the second: visible in the log, confusing exactly
  once per deployment. `CREATE TABLE IF NOT EXISTS` is the same statement on a database that
  has never seen it and on one that has, which is why the boot stays silent either way.
- **`kind` is constrained twice, on purpose.** A `Literal["daily","weekly"]` in the model makes
  an unknown kind FastAPI's 422 with a list of what is allowed — the error an agent can act on
  — and the SQLite `CHECK` makes it impossible for anything else to arrive by another path.
  Neither is redundant: the first is documentation an MCP client reads, the second is the
  guarantee the read relies on.

## Pre-checks

- Unit tier: **572 passed** (546 before; 26 new). No existing test moves; `test_gtd.py`'s
  auth list gains one entry.
- Container tier by hand (D25), against `/opt/homebrew/bin/task` **3.5.0**:
  `cd backend && TZ=UTC PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -m container tests/container`
  → **73 passed**, unchanged. This item adds no Taskwarrior semantics — it touches a SQLite
  table and two routes — so the tier gains no test; it was run to prove the seam it shares
  with the summary still holds. CI's x86_64 run is the authoritative one.
- `./run surfaces` reported drift in S1, S2 and S4 before the update and matches after it.
  `mcp-tools.json` gains exactly two entries and its `count` goes 23 → 25, which is what
  `RULE-DOC-001` reads (ADR 0037); `db-schema.sql` gains one `-- table reviews` block and
  nothing else moves.
- Adversarial, each a temporary edit reverted afterwards
  (`scratchpad/adv-p17.sh`, `scratchpad/adv-p17.log`):
  - **`last_review` ignores the scope key** (the row filter dropped): two tests red —
    `?tag=ar` starts reporting the whole system's review as this area's, which is the
    false reassurance the scope key exists to prevent.
  - **The scope is stored as sent** (`scope_key` skipped): ten tests red. Both halves show
    up — the canonical form is gone, *and* every refused scope becomes a stored key, because
    that one call is where a scope is validated at all.
  - **The write appends instead of upserting** (`ON CONFLICT` removed): two tests red with
    `sqlite3.IntegrityError`, so a second daily review would be a 500 rather than a moved
    timestamp.
  - **The table is not created on boot** (`CREATE_REVIEWS` not executed): 27 tests red,
    including every summary test — the proof that the summary now genuinely reads this table
    rather than carrying a constant.
  - **The read is not scoped by username** (`OR 1=1`): one test red, the cross-user one. The
    isolation is asserted, not assumed.
- Not made executable: that the table appears on the *deployed* database. `init_db` runs on
  every start and the snapshot proves the statement, but nothing in CI can see the host
  (`RISK-OPS-002`); the check is a `GET /api/gtd/review` returning `200` and an empty list
  after the deploy, which is in PR B's verification list.

## Skill

0.8.0. `references/daily-review.md` §4 and `references/weekly-review.md` "Close" stop saying
"if the server supports review timestamps" and say what to call: POST `gtd/review` with the
kind, and — when `runway_scope` is declared — the scope tags sorted and joined with `+`, plus
the instruction to pass the same tags as `tag` to the summary so `last_review` answers about
the same area. The repository's own marker, where one exists, is now an addition rather than a
fallback. The Reset step says `weekly` explicitly, because that is the timestamp the ten-day
rule reads. `SKILL.md`'s "when to propose a reset" paragraph drops the `modified`-date stand-in
entirely: it uses `last_review` from the summary. That is the guess this commit exists to
delete, and leaving it in as a fallback would keep the wrong answer available on a server that
now has the right one. What replaces it has to say what `null` means, because that is every
user's state until the first weekly review is recorded: the route's own description says an
empty list means none was ever recorded, not that the system is unreviewed, so both `SKILL.md`
and the Reset section read a `null` weekly as "unknown" and fall back to the overdue share
rather than announcing a gap nobody had. `references/conventions.md` names the route in the operation table and
states the scope-key rule in "Scoping", where the rest of the scope contract already lives.
`references/setup.md` puts both `last_reviews_gtd_review_get` and
`record_review_gtd_review_post` in `allow` (D16): reading how current the lists are is a
lookup, and the write is one timestamp the user just earned by finishing the review. An `ask`
would put a permission prompt at the close of every daily and every weekly review — friction
at exactly the moment the review is over, which is how the timestamp would stop being
recorded and `last_review` would stay null on a server that can now answer.

## Counts

REST 34 → **36**, MCP tools 23 → **25**, route guards 33 → **35** (28 `user` / 4 `admin` /
3 `open`). Updated in `AGENTS.md` §5, `README.md` ("the full list of all 25"), the route
breakdown and the schema-versus-declaration paragraph in `docs/threat-model.md` §1, and the two
sentences in `rules/ledger.yaml` that state them (`RISK-MCP-002`, `RISK-SEC-005`). The
persistence section of `docs/threat-model.md` §6 goes from four tables to **five** and its line
references move with the file. `docs/plan/STATUS.md:15` is a dated record of what production
served in September and is left as it stands.
