# Change Impact Brief 0035 — Scoped GTD lists, and a text search for the task list

| Field | Value |
|---|---|
| **Requested outcome** | Every GTD list can be narrowed to an area by tag, so a repository that declares a scope never receives another area's titles at all, and `GET /tasks` can find a task by a word in its description — the duplicate check the skill has always been told to run and had no operation for. |
| **Owning unit** | `be/routers` (`gtd.py`, `tasks.py`), `be/services` (`task_service.py`), backend tests (unit, MCP-session, container), `integrations` (the skill), `ops` (snapshots), `docs` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md) §3 (anything touching Taskwarrior goes through the task service, which is where validation lives), §5 (REST and MCP are externally consumed; the OpenAPI snapshot moves with them), §4 (`be/routers` → `be/services`, no new import) |
| **Governed by** | [ADR 0038](../adr/0038-validated-filters-and-exact-project-match.md) (filter values are validated; `q` deliberately stays in Python), [ADR 0036](../adr/0036-list-semantics-against-taskwarrior-3-5.md) (what each list filter means on 3.5), [ADR 0019](../adr/0019-the-taskwarrior-argv-boundary.md) (the argv boundary both of them extend) |
| **Rule IDs introduced** | None. No gate rule changes; no ledger entry is added or reworded. |
| **Entry points** | [`backend/app/routers/gtd.py`](../../backend/app/routers/gtd.py) `TAG_FILTER`, [`backend/app/routers/tasks.py`](../../backend/app/routers/tasks.py) `list_tasks`, [`backend/app/services/task_service.py`](../../backend/app/services/task_service.py) `search_tasks`, `_tag_filters`, `gtd_list`, `project_tasks` |
| **Affected public surfaces** | **REST (S1):** `GET /gtd/inbox`, `/gtd/next`, `/gtd/waiting`, `/gtd/someday`, `/gtd/tickler` and `/gtd/projects/{name}` gain a repeatable `tag`; `GET /tasks` gains `q`. All additive, every existing call unchanged. `ops/surfaces/openapi.json` updated. **MCP (S2):** unchanged — 22 tools, every name and summary the same, so `mcp-tools.json` does not move. **Route count:** unchanged at 33, guards unchanged at 32 (25 user / 4 admin / 3 open). **Claude skill** 0.5.0 → 0.6.0. |
| **Known dependents** | MCP clients, the runway skill above all: both parameters are optional, so nothing existing changes. The SPA sends no `tag` and no `q` and needs no change. `backend/app/routers/inbox.py` imports the task service but not `search_tasks` or `gtd_list`. |
| **Uncertain / dynamic areas** | `BLIND-TEST-001` (the routers are exercised through the ASGI client, so no import-derived test edge exists for `routers/gtd.py`), `RISK-TEST-001` (the container tier cannot run on arm64 in the local gate; run by hand, see Pre-checks), `RISK-MCP-001` (the index derives one tool per route; the snapshot is the count source). |
| **Analogous implementations** | [Brief 0034](0034-filters-for-the-task-list.md) — the same seam and the same validate-before-export rule, for the task list. [Brief 0032](0032-list-semantics.md) — `_tag_filters` and `gtd_list(…, tags=None)` were built there and left unexposed until now. |
| **Delivery Pattern** | **New Capability.** Both parameters are additive and optional, so no migration is owed. The `tag` half inherits the Security-pattern obligations of brief 0034 — it becomes a `+tag` filter token, a position `--` cannot protect — and carries the same regex, the same bound, the same negative tests and the same fuzz assertion that nothing refused reaches the binary. The `q` half has the opposite obligation: to stay out of argv entirely. |
| **Required tests** | Unit (`test_gtd.py`, `TestTagScoping`): each status list narrowed by one tag; the tickler and a project narrowed; two tags AND-ed; any tag emptying the inbox; a refused tag (`-next`, `""`, `a,b`, `1abc`) a 400 on all six lists; eleven tags a 422; a fuzz sweep asserting no poisoned value in any recorded argv. Unit (`test_tasks.py`, `TestTheTextSearch`): casefold matching with umlauts; the duplicate check needing `status=waiting` for a hidden tickler; `q` narrowing *before* `limit` slices; the 200-character bound; and that no part of `q` — `(`, ` or `, a newline, `rc.data.location=…`, `description.has:x` — ever appears in an argument vector or in free text. MCP session (`test_mcp_session.py`): a repeated `tag` arriving as a list and AND-ing, a non-ASCII `q` with `status=completed`, and `Haus Umbau` / `Büro` surviving the unencoded path parameter. Container (`test_real_task.py`): two `+tag` tokens AND on the real binary. |
| **Intended scope** | The `tag` query parameter on the six GTD lists, `q` on `GET /tasks`, the `q` filter step in `search_tasks`, the four test tiers, the openapi snapshot, the skill's scoping, capture, engage, duplicate-check and daily-review prose (0.6.0), and one sentence in `docs/threat-model.md` §2 recording that `q` is deliberately not a token. **Not** in scope: the summary route and its counters, review timestamps, project status and the stalled definition (later items), the remaining description work of P1-9, and any frontend change. |
| **Base revision** | `935ef46` |

## Behaviour change

- **`tag` on every GTD list.** `GET /gtd/{inbox,next,waiting,someday,tickler}` and
  `GET /gtd/projects/{name}` take a repeatable `tag`, AND-ed, at most ten, each validated with
  `TAG_RE` and bounded at 100 characters — the same `_tag_filters` helper `GET /tasks` already
  used. The service side has accepted `tags=` since brief 0032; this exposes it.
- **The inbox is the one list where a tag is always empty**, because the inbox *is* "no project
  and no tag". That is not a quirk to fix: a scoped repository must not list the inbox at all,
  only count it, and the parameter description says so where an MCP client reads it.
- **`q` on `GET /tasks`.** A casefold substring of the description, bounded at 200 characters,
  applied in Python over the export and **never** handed to Taskwarrior. It narrows before
  `limit` slices, so `q=meyer&limit=2` means "the two most urgent Meyer tasks", not "Meyer among
  the two most urgent".
- **Why `q` is not a Taskwarrior filter.** `description.has:` would put the user's own words into
  a filter position, the one place `--` cannot cover, and Taskwarrior would read `(`, `or` or an
  `rc.` prefix inside them as grammar. This is the mistake `create_task` made with
  `description:<text>` before `+LATEST` replaced it (ADR 0019). The cost is that `q` cannot use
  Taskwarrior's search grammar; a plain substring is what the skill's duplicate check needs.

## Pre-checks

- Container tier by hand (D25), the authoritative check for anything touching Taskwarrior
  semantics, against `/opt/homebrew/bin/task` **3.5.0**:
  `cd backend && TZ=UTC PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest -p no:cacheprovider -m container tests/container`
  → **65 passed** (64 before; 1 new). CI's x86_64 run is the authoritative one.
- Unit tier: 518 passed (499 before; 19 new). Full backend suite: 583.
- Adversarial, each on a temporary edit that was reverted:
  - `tag` dropped on the way from the router to the service (`None` passed instead): **9 unit
    tests, 1 MCP-session test and the 1 container test red** — including the fuzz sweep, because
    a filter that is silently ignored also stops being validated.
  - `q` applied *after* the `limit` slice: 1 unit test red
    (`test_it_narrows_before_the_limit_applies`), which is the only test that can see the
    difference.
  - `q` dropped on the way from the router to the service (`None` passed instead): **5 unit
    tests red**, including the MCP-session one and the duplicate check. Both of those were
    green under this mutation at first — each held a single task the `status` filter alone
    already isolated — and were given a second, non-matching task so that only an applied `q`
    can produce the asserted row.
  - `tag=` (the empty string) is a 400 on all six lists, asserted permanently rather than by
    hand: it fails `TAG_RE`, and an empty `+` token would be Taskwarrior grammar.
- The MCP-session tests exist because `mcp-tools.json` records names and summaries only. A
  repeated query parameter and an unencoded path parameter are exactly the two things
  `fastapi-mcp` does on its own, and neither was covered by any snapshot before this commit.

## Skill

0.6.0. `references/conventions.md`: the operation table row for the GTD lists names the optional
`tag` and now includes the tickler, and a new row gives the duplicate check its operation
(`q`, once with `status=pending` and once with `status=waiting`, because a hidden tickler is not
pending). "Scoping" stops saying "use the server's tag filter when it has one" and states the
rule — pass the scope tags as `tag` on **every** task list call, never list the inbox in a
scoped repository, capture there untagged. The rule names its own exception: `GET /gtd/projects`
has no `tag` (it returns names, not tasks, and D13 leaves it unscoped), and an unknown query
parameter is silently ignored by FastAPI, so a scoped agent must take the project names it
needs from a scoped task list rather than from that list. "Contexts" points at `q` instead of
"text search".
`SKILL.md`: the `runway_scope` bullet, the capture rule, the duplicate check, and an "Engage"
sentence that resolves the trap in scoping by context — fetch `next` scoped by the *area* tag
only and filter by context locally, because a task without a context fits everywhere and a
server-side context filter would drop exactly those. `references/daily-review.md` §1 says the
same for its gather step. The permissions block in `references/setup.md` is unchanged: this item
adds no MCP tool.

## Counts

Unchanged: REST 33, MCP 22, route guards 32 (25 user / 4 admin / 3 open). No route is added or
removed and no handler is renamed, so `AGENTS.md` §5, `README.md`, the route breakdown in
`docs/threat-model.md` §1 and `rules/ledger.yaml` need no edit.
