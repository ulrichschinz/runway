# ADR 0026 — The audit log, and the credential shape that makes a shim removable

- **Date:** 2026-08-28
- **Status:** Accepted
- **Scope:** `backend`, `ops`

## Context

Step 15's plan text asks for "an audit log for role changes, key regeneration, task deletion". Taken
literally that is three call sites and a table. Taken as what it is for, it is the instrument that turns one
specific open decision from a guess into a query.

`SHIM-SEC-006` accepts an API key presented as `Authorization: Bearer <key>`. It was created in Step 11 when
`/inbox` stopped implementing its own authentication (finding SEC-6), and it has now missed one removal date
already: Step 13 arrived and the precondition did not. The precondition was never a code change. It was
*knowing whether anyone still sends that shape* — and this repository could not see what its callers send.
`RULE-SEC-002` counts down to 2026-11-25 regardless, so the choice on that date was going to be between
breaking every agent and MCP client at once, and re-approving a shim nobody had evidence about.

[ADR 0024](0024-structured-logging.md) landed the log stream hours before this, with a per-request
correlation id put in deliberately early *for this change*. The stream on its own is not enough for the
shim question: container logs rotate, and Step 15a capped them at 50 MB per service precisely so they
cannot fill the disk. Evidence that a rotation policy is allowed to delete is not evidence you can wait
three months on.

This is a **Security or Operability Change** under [`docs/change-workflow.md`](../change-workflow.md) — it
persists new data, so it needs a failure scenario, a control and an adversarial proof rather than a
changelog line.

## Decision

### It is its own SQLite file

`data/audit.db`, not a table in `users.db` and not a stdout stream. The human took this decision on
2026-08-27 and it is recorded in [`docs/plan/STATUS.md`](../plan/STATUS.md) §3; what follows is the
reasoning it rests on and the two costs it accepts.

A table in `users.db` would move the schema surface that `RULE-SURF-001` snapshots, and it would trip the
clause in [`rules/waivers.yaml`](../../rules/waivers.yaml) — kept alive in the resolved `WAIVER-OPS-001`
entry — that makes a `migrations/` directory due when a third table changes shape. That is a whole piece of
infrastructure arriving as a side effect of an observability feature. A stdout stream would be lost to
rotation, as above.

**The path is `DATA_ROOT/audit.db`, and that is not an arbitrary choice.** It is the only directory either
compose file bind-mounts. Anywhere else inside the container — `/app/audit.db` beside `users.db`, for
instance — lives in the writable layer and disappears the next time the container is recreated, which is
every deploy. An audit log that a routine deploy silently empties is worse than none, because it looks
present. This also means the file needs no compose change to persist, and no compose file was touched.

**The two costs, stated.** There are **no foreign keys to `users`**: `actor` and `subject` are plain text,
so a renamed or deleted account leaves rows naming a username that no longer resolves. That is the correct
behaviour for an audit trail — a row must survive the deletion of what it describes — but it does mean
nothing enforces that an `actor` was ever a real user. And **there are now two files to back up.** `users.db`
alone is no longer a complete backup of this deployment's state; `data/` was already in the backup set for
the Taskwarrior data, so in practice the audit log arrives inside an existing one, but the sentence "back up
`users.db`" has stopped being sufficient and the runbook says so.

### The connection stays in `database.py`; the writer is a new module in the same unit

[`AGENTS.md`](../../AGENTS.md) §3 says `backend/app/database.py` is the only module that opens a database
connection. A second database is not a reason to make that rule mean something narrower than it says, so
`database.audit_connection()` opens the file and [`backend/app/audit.py`](../../backend/app/audit.py) —
schema, vocabulary, writer — asks it for the connection.

`audit.py` is registered in `be/adapters/db` in [`architecture.toml`](../../architecture.toml). That is the
only placement that works, and it took reading the allowed edges to see it. The writer has to be reachable
from `be/di`, because `get_current_user` is where the credential shape is known — and `be/di` may depend on
`be/adapters/db` and `be/leaves`, nothing else. A leaf would be reachable from everywhere but could not open
a connection, since `be/leaves` may depend on nothing. `be/adapters/db` is reachable from `be/di`,
`be/routers`, `be/services` and `be/app`, which is exactly the set with events to record. `RULE-ARCH-001`
would have refused any other answer.

Its fan-in is five and is recorded in [`ops/structure-baseline.toml`](../../ops/structure-baseline.toml).
Concentration at a single sink is the design here, the same way it is for the frontend's single HTTP egress;
what would be a signal is a sixth dependent, because that means a new class of event and a new call site to
read for what it puts in a row.

The writer is synchronous `sqlite3`, not `aiosqlite`. Its callers are both kinds — `get_current_user` is
`async`, and `delete_task` is an ordinary `def` running in the threadpool and cannot await anything. One
interface that works from both is worth more than the few hundred microseconds of event loop a local file
write costs. Under decision F1 this is a single host with a single operator; the trade would look different
under load.

### The credential-shape discriminator is the load-bearing field

Three shapes reach `get_current_user`, and every successful authentication now writes a row naming which
one, with the route template it was used on:

| value | the request looked like |
|---|---|
| `api-key-header` | `X-Api-Key: <key>` |
| `bearer-jwt` | `Authorization: Bearer <jwt>` |
| `bearer-api-key` | `Authorization: Bearer <key>` — the shim, reached only after a failed JWT decode |

The route is there because a shape can be dead on one endpoint and alive on another, and the shim's own
history says so: it exists because `/inbox` was different from everything else. The route is stored as the
**template** and never as the requested path, for two reasons. It groups — "who still uses the shim, on
what" is a question about endpoints, and a thousand rows keyed by task uuid answer it worse than one. And it
is safe: a path is caller-controlled text that really does arrive with a credential in it, as the two access
lines quoted in [`docs/operations.md`](../operations.md#redaction-at-runtime) show.

**Only successful authentication is recorded.** A rejected credential writes nothing. That is a deliberate
asymmetry: recording failures would let an unauthenticated caller append to this file at will, and the file
has no pruning. Rejected requests are still visible in the access log, which *is* rotated and bounded. The
login route is different — a login failure does write a row, because it is the event an operator most wants
after the fact, and the per-username rate limiter from finding SEC-8 bounds it.

### There is no read endpoint

Not `GET /admin/audit`, not now. Three reasons, in order of weight.

An audit log the audited party can read through the same API they are audited on is a weaker record than one
they cannot. The only role that could be allowed to read it is `admin`, and administrators are the principals
whose actions this table exists to record.

Second, it would be a new public surface. `AGENTS.md` treats the REST and MCP surfaces as externally
consumed (decision F2), the route count is a checked claim, and every route becomes an MCP tool
automatically — so "add a read endpoint" is a public-surface migration with a shape, a pagination story and a
name we would be stuck with, arriving inside a change whose actual subject is whether a shim can be removed.

Third, it is not needed for the thing this is for. The shim question is answered by an operator with
`sqlite3` on the host, once, at the end of a soak. That is in
[`docs/operations.md`](../operations.md#the-audit-log) with the query written out.

### No caller fingerprint, and that is deferred rather than settled

No IP address and no user-agent column. An audit row's honest answer to "who" is the authenticated
principal; an IP address is a different kind of claim — it is personal data, it is often a proxy's, and
keeping it starts a retention obligation that nobody here has agreed to. Collecting it "just in case" is
precisely how a retention question gets answered by accident.

**This is an open question with the human, recorded as open.** The schema is a flat table of nullable
columns specifically so that answering it later is one additive `ALTER TABLE` and one extra argument, not a
redesign. If the answer is yes, the same change has to bring a retention period with it, because the reason
to hesitate and the reason to prune are the same reason.

### Retention: nothing prunes it, and that is written down rather than built

No pruning, no vacuum, no archival. A first cut that deletes rows is a first cut that can delete the evidence
`SHIM-SEC-006` is waiting on, and what may be forgotten is a decision with a legal half and an operational
half, neither of which is taken. Building a retention policy nobody has agreed to would be inventing an
answer.

So the growth is recorded honestly as `RISK-OPS-006` with a re-open trigger, rather than implied. The
dominant term is one row of roughly 150 bytes per successfully authenticated request; ten thousand requests
a day is on the order of half a gigabyte a year, on the same partition that holds `users.db` and `data/` —
the partition whose exhaustion the Step 15a rotation decision was written to prevent, now with a second
unbounded writer on it that Docker's log driver does not bound. Nothing measures the file and nothing alerts
on it.

### No snapshot under `ops/surfaces/`, and a test instead

Considered and declined, and the reason is the one `RISK-SURF-001` records about the users schema. That
snapshot is captured by running `init_db()` against an empty temporary file — the *fresh* path — so it
describes a database created after a column existed and not the migrated one production actually runs;
`RULE-SURF-001` compares that artefact against itself and passes. Adding a second snapshot generated the
same way would reproduce the same illusion for a schema that is not even a public surface: no route reads
this table, no third party consumes it, and its consumer is an operator with `sqlite3`.

What the snapshot would genuinely have bought — noticing that the shape moved — is bought instead by a unit
test that asserts the live table's `PRAGMA table_info` equals the declared column tuple. That fails on a
change to either the `CREATE` statement or the table, which is the property that matters.

The audit database is created fresh in every deployment, so it does **not** inherit the fresh-versus-migrated
divergence today. Keeping it that way is a rule for whoever adds the next column: the `CREATE` and an
additive `ALTER TABLE` have to land in the same change, or the two paths part company exactly as
`users.api_key` did.

## Consequences

**Twelve event types**, in [`backend/app/audit.py`](../../backend/app/audit.py): the three the plan named
(role change, key regeneration, task deletion) plus login succeeded, login failed, login lockout,
registration, password change, API-key disclosure, the refused last-admin demotion, the registration toggle,
and the admin bootstrap. **There is no logout event** — authentication is stateless JWT and the frontend
simply drops the token, so there is no moment to record and inventing one would be a fiction.

**The admin bootstrap finally has a consumer.** `bootstrap_admin` has always returned a string naming the
branch it took and `init_db` has always discarded it; that return value was written for this. `init_db` now
returns it and the lifespan records it — including `noop: an admin already exists`, which is the evidence
that the recovery path did *not* fire on this start. A role change that happens at boot with no request and
no acting principal is the one role change that otherwise leaves no trace at all.

**A write can never fail a request.** Every entry point catches its own `sqlite3.Error` or `OSError` and logs
at `ERROR`; the request is served. The same judgement `init_db` makes about a migration failure
([ADR 0025](0025-narrowing-the-migration-except.md)): losing the evidence must not also lose the service. The
consequence is stated in the runbook rather than hidden — a missing row is not the same as a missing event,
so `the audit event could not be written` is the thing to grep for before concluding otherwise.

**No credential can be persisted, and it is enforced twice.** No call site passes one — the row names the
*shape*, never the value — and every string written additionally passes through `logging_setup.redact_text`,
the same value-shape redaction the log stream uses, so a JWT, a bcrypt hash, an API key or the resolved
signing key cannot reach a column even from a future call site that gets it wrong. What that backstop cannot
see is a plain password, which has no recognisable shape; that is the audit-side face of `RISK-OPS-005`, and
it is why the proof below drives real endpoints rather than trusting the mechanism.

**The adversarial proof.** `test_no_credential_appears_anywhere_in_the_audit_database` in
[`backend/tests/unit/test_audit.py`](../../backend/tests/unit/test_audit.py) registers, logs in, reads and
rotates the API key, authenticates with the rotated key in both slots, changes the password and fails a
login — then concatenates every value of every column of every row and asserts the token, both API keys, both
passwords, the signing key and the stored bcrypt hash are absent, having first asserted the rows are there so
it cannot pass vacuously.

It was also run outside the suite, against `uvicorn app.main:app --log-config log_config.json` — the command
the image starts with. Twenty-two rows across registration, login, a login failure, key disclosure, key
rotation, a role change in both directions, the refused last-admin demotion, the registration toggle and all
three credential shapes on four routes. The three shapes came back as three distinct values; the shim query
named the caller and three endpoints; six requests with rejected credentials added zero rows; and none of the
password, the JWT, either API key, the `JWT_SECRET` or either bcrypt hash appeared anywhere in the 2,296
characters of column values. One audit row and the two log lines from the same request all carried
`request_id` `ed39f8663114`, which is the join working.

**No route moved.** `Request` is injected into `get_current_user` and eight handlers for the route template
alone; it is not a body or query parameter, so it appears in no schema. The 32 REST routes and 32 MCP tools
are unchanged and every snapshot in `ops/surfaces/` regenerated byte-identically.

**No new gate rule**, so the conformance suite still proves 44 rules able to fail. Nothing here is a
property a rule would hold better than the tests do, and `RULE-GATE-002` would require a fixture for each
one. One `# noqa: S105` was added — `PASSWORD_CHANGED` is an event name, not a credential — with a reviewed
justified suppression in [`rules/waivers.yaml`](../../rules/waivers.yaml), which is what `RULE-RULE-003`
requires.

**`SHIM-SEC-006` is not removed and its expiry has not moved.** The instrument is local; the evidence is
not. Its `evidence:` field now points at the query in [`docs/operations.md`](../operations.md#the-audit-log)
and states plainly what the query can and cannot prove: rows are proof that a caller depends on the shape and
name them; *no* rows is a statement about the observed window only, and a monthly job or a client switched
off for a fortnight is exactly what a short window misses. Removal needs a soak on the real deployment,
counted from the day this reaches production and not from the day it merged — which, given
`RISK-OPS-002`, is a day that has to be observed rather than assumed.

**SEC-5 is instrumented, not fixed.** `GET /auth/apikey` still returns a permanent, unscoped key in
cleartext. What changed is that every disclosure is on the record with a timestamp and an account. The fix
changes that response contract and is a public-surface migration of its own.
