# ADR 0024 — One JSON stream, redacted on the way out, correlated per request

- **Date:** 2026-08-28
- **Status:** Accepted
- **Scope:** `ops`, `backend`

## Context

The serving application logged nothing. [ADR 0023](0023-no-secrets-in-logs.md) established that as a fact
and used it as an argument: the no-credentials-in-logs property was free to hold while there was nothing to
log with, so `RULE-OPS-002` landed first and the transport decision was left open. This record closes it.

What production emitted until today was uvicorn's plain-text default — a request line, a status code, and
nothing else. There was no way to answer *which* account failed to log in, *how many* times, or *what
happened during the request that returned 500*, and no way to tie two lines together at all. The plan named
this in Step 15 (`docs/plan/phase-0-2.md`, "Operability and the minimal threat model") as "structured
logging" with "a test asserting the formatter redacts JWTs, API keys and passwords".

It is also a prerequisite. Step 15c's audit log needs something to correlate its rows against, and
`SHIM-SEC-006`'s removal needs evidence gathered from a running production — evidence that arrives as log
lines before it arrives as audit rows.

The work creates an **output surface that did not exist**, which is why it follows the Security or
Operability pattern in [`docs/change-workflow.md`](../change-workflow.md): the failure scenario is that a
credential is written to a file, a backup and somebody's scrollback, and the control has to be watched
working rather than assumed.

## Decision

Four decisions, taken together because each one constrains the next.

### One stream, uvicorn included

uvicorn's `uvicorn`, `uvicorn.error` and `uvicorn.access` loggers lose their own handlers and propagate to
the same handler, the same formatter and the same redaction filter as the application's loggers. The image
starts with `--log-config log_config.json` ([`backend/Dockerfile`](../../backend/Dockerfile)) and that file
is the only reason it works: uvicorn configures its own logging **before it imports the application**, so a
`configure_logging()` call inside the app would leave every line emitted before that point — the startup
banner, a bind failure, an import error — in plain text and outside the filter.

The alternative was a JSON application logger running alongside uvicorn's plain-text one. It was rejected on
the second point rather than the first: two formats is an annoyance, but **a second stream is a path around
the redaction filter**, and a control with a path around it is a control that will one day be reported as
having worked. The rule that made this decision cheap is that nothing had to be migrated — there were no
existing log lines to keep compatible with.

`log_config.json` is generated from `app.logging_setup.dict_config`, not written by hand, and a unit test
asserts the file equals what the function produces. A checked-in copy of a computed value drifts; this is
the cheapest thing that stops it.

### The level is configurable, nothing else is

`LOG_LEVEL`, default `INFO`, documented in [`README.md`](../../README.md) — `RULE-SURF-002` requires that in
both directions. An unrecognised value falls back to `INFO` instead of refusing to boot. That is the
opposite of the posture `startup_checks` takes for `JWT_SECRET`, and deliberately: a bad signing key means
forgeable tokens for every user, while a typo in a verbosity knob means some missing `DEBUG` lines, and
refusing to serve over the second one converts a harmless mistake into an outage.

**There is no `LOG_FORMAT`.** JSON is unconditional and the redaction filter cannot be detached. A setting
that turns a control off is the setting that gets turned off at 3am by someone who is already having a bad
night and just wants to read the log, and the moment it is available it is a supported configuration in
which credentials reach disk. The cost is that a developer tailing the container sees JSON; `jq` is in the
runbook for that, and it is a smaller cost than a switch nobody can safely leave in the box.

### Redaction at runtime, even though a static rule already exists

`RULE-OPS-002` is not made redundant by this and does not make it redundant. They fail in mirror-image ways:

* The **static rule** reads source and matches *names*. It cannot see `logger.warning("rejected %s", row)`
  where `row` carries a password hash; it does not read uvicorn, a library, or an exception traceback. That
  is `RISK-OPS-004`, recorded when the rule landed.
* The **runtime filter** reads values and matches *shapes* — a JWT (`eyJ` and three dot-separated segments),
  a bcrypt hash (`$2b$…` plus 53 characters), the exact 43 characters of URL-safe base64 that
  `generate_api_key`'s `secrets.token_urlsafe(32)` produces — plus the resolved `JWT_SECRET` matched
  literally, because a good signing key is random bytes with no shape at all. It sees a credential under any
  name, in a traceback, and in a line this repository did not write. What it cannot see is a value with no
  recognisable shape under a name that does not say credential: **a user's password is exactly that.**

So the static rule covers what has a name, the filter covers what has a shape, and what has neither is
`RISK-OPS-005`, with a test that pins it rather than a sentence that implies it. Defence in depth is an
overused phrase; here it is literal — the union of the two is strictly larger than either, and the
remaining hole is small enough to write down.

Redaction replaces with the marker `[redacted]` rather than deleting the value. A line that says a token was
there and was removed is still evidence of what happened; a line with a hole in it is a puzzle, and the
person solving it is the person who will ask for the filter to be switched off.

The filter is attached to the **handler**, not to a logger. A logger filter sees only that logger's own
records; a handler filter sees every record that reaches the handler, whichever logger produced it. With one
handler and everything propagating to root, that is the single point every emitted line passes through — the
property "no emitted line bypasses redaction" is a consequence of the topology rather than a convention.

### A correlation id, now rather than after the audit log

Every request gets a 12-hex-character id. The middleware publishes it in a `contextvars.ContextVar`, the
formatter attaches it to every line, and the response carries it back as `X-Request-Id` so a user reporting
a problem can quote it.

Three things about it are decisions rather than defaults:

**It ships now.** Step 15c's audit rows will carry the same id, so an audit event ties to the lines around
it. Adding it afterwards would mean either a period of audit rows correlating with nothing, or retrofitting
every line already written. It costs almost nothing today and it is the join key for the next change.

**A `ContextVar`, not a module global.** This process serves requests concurrently; a global would be read
by whichever request happened to be formatting a line at that moment. A correlation id that correlates the
wrong lines is worse than no correlation id, because it is believed.

**Raw ASGI, not `BaseHTTPMiddleware`.** Starlette's `BaseHTTPMiddleware` runs the handler in a child task
and returns before the response is actually sent, so the context variable is already reset when uvicorn
writes its access line — the one line per request guaranteed to exist would have been the one without an
id. Implementing `__call__` directly keeps uvicorn's `send` inside the request's context. This is not
gold-plating; it is the difference between the feature working and appearing to.

The id is always minted here and never read from an inbound `X-Request-Id`. Accepting one would copy
attacker-controlled text into every line of the request, which is how log injection starts, and the value of
the id is that this service knows where it came from.

### Rotation, in both compose files

`json-file` with `max-size: 10m` and `max-file: 5` — 50 MB per service. Docker's default is **no limit at
all**, and on this host the partition holding container logs also holds `users.db` and `data/`, so an
unbounded log is a full disk that takes the database down with it. That was theoretical while the
application logged nothing. It writes a line per request now.

10 MB × 5 is chosen to be boring: at this deployment's traffic it is a long retention, it is small enough
that nobody has to think about disk, and it is large enough that a single incident's lines are still there
the next morning. There is no log shipping and none is planned (decision F1: one host, one operator), so
these files are the only copy.

## Consequences

The application has an output surface. `backend/app/logging_setup.py` and `backend/app/middleware.py` join
`be/leaves` in [`architecture.toml`](../../architecture.toml) — a logging module has to be reachable from
routers, dependencies and the database adapter alike, and any higher layer would make one of those an upward
edge that `RULE-ARCH-001` refuses. Five log lines were added to
[`backend/app/routers/auth.py`](../../backend/app/routers/auth.py) and one to
[`backend/app/main.py`](../../backend/app/main.py): registration, login succeeded, login rejected, login
throttled, key regenerated, startup complete. Every one of them logs the *identity* and never the *proof of
identity* — the login-rejected line deliberately does not distinguish "no such account" from "wrong
password", because a log line that did would be the user-enumeration oracle the rate limiter exists to
avoid, moved from the API into the log file.

**The adversarial proof.** `test_no_credential_reaches_the_log_stream` in
[`backend/tests/unit/test_logging.py`](../../backend/tests/unit/test_logging.py) registers a user, logs in,
reads and rotates the API key, changes the password, authenticates with the new key, and drives the login
route past its rate limit — with the real logging configuration installed and its stream redirected into a
buffer — then asserts that the token, both API keys, both passwords and the signing key appear nowhere in
what was written, and that the expected lines are present so the assertion cannot pass vacuously. The
mechanism tests above it push a real JWT, a real API key, a real bcrypt hash and the resolved secret through
the formatter under the field name `detail`, which says nothing, and require them redacted. `RULE-TEST-003`
holds the whole module at 100% line coverage.

The proof was also run outside the test suite, against `uvicorn app.main:app --log-config log_config.json` —
the command the image starts with. Forty-one lines were emitted across registration, login, key rotation,
API-key authentication and a rate-limit trip; all forty-one parsed as JSON, nineteen distinct request ids
appeared, and none of the token, either API key, the password or the signing key was present. Two further
requests put a real API key and a real JWT **in the URL**, where they land in uvicorn's access line — a line
no source scan could ever have prevented, because nobody in this repository wrote it — and both came back
`[redacted]`. That single observation is the whole argument for having a runtime half at all, and it is
quoted in [`docs/operations.md`](../operations.md#redaction-at-runtime).

**No route moved.** Middleware is not a route, so the 32 REST routes and 32 MCP tools are unchanged and
every snapshot in `ops/surfaces/` regenerated byte-identically. The new `X-Request-Id` response header is
additive and appears in no snapshot.

**No new gate rule.** `RULE-OPS-002` already holds the static property and this change satisfies it rather
than extending it; the conformance suite still proves 44 rules able to fail. Adding a rule per change is how
a gate becomes noise, and `RULE-GATE-002` would then require a fixture for a property already fixtured.

**Production is not rotating logs yet.** [`ops/deploy/docker-compose.yml`](../../ops/deploy/docker-compose.yml)
is a checked-in *copy* of the deploy host's file; editing it does not change the host, which is `RISK-OPS-002`
and, before that, `BLIND-OPS-001`. The `logging:` blocks are in the copy and reviewable; `/opt/services/runway`
is still running Docker's unlimited default, and a driver change only takes effect when the container is
recreated. That is recorded as an outstanding action in
[`docs/operations.md`](../operations.md#rotation) in the same shape the healthcheck gap is, and it is stated
that way on purpose: two claims this repository made about production turned out to be false when the host
was finally read, and the correct response to that is to say what is checked in and what is applied, as two
different things.

**What this deliberately does not do.** It does not add an audit log — Step 15c, with its own persistence
decision. It does not touch the migration `except` clause that `WAIVER-OPS-001` covers — Step 15b. It does
nothing about `RISK-DEP-001`-class supply-chain concerns and nothing about API keys sitting in cleartext in
`users.db`, which redaction from *logs* does not touch and which the plan tracks separately. And it adds no
log shipping, no retention policy beyond the file count, and no metrics: those belong to a deployment shape
this one is explicitly not (`AGENTS.md` §10).
