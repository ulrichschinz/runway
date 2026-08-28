# Change Impact Brief 0018 — Structured logging: one redacted JSON stream, correlated per request

Step 15a in full. It landed as **two commits** and this brief covers both, because they are one plan step
and the second is unreviewable without the first:

| Commit | What it did |
|---|---|
| `2ec8bec` | `RULE-OPS-002` — an AST scan that fails the gate when a credential-bearing expression reaches a logging call in `backend/app/`. No application code; the rule deliberately landed before there was any logging to break it. See [ADR 0023](../adr/0023-no-secrets-in-logs.md). |
| this one | The logging itself: the JSON formatter, the runtime redaction filter, `LOG_LEVEL`, the per-request correlation id, log rotation in both compose files. See [ADR 0024](../adr/0024-structured-logging.md). |

| Field | Value |
|---|---|
| **Requested outcome** | Give the serving application an output surface it did not have: structured logs that can be queried, that tie together within a request, that cannot carry a credential, and that cannot fill the disk. |
| **Owning unit** | `be/leaves`, `be/app`, `be/routers`, `ops`, `docs`, `tests` |
| **Applicable contracts** | [`AGENTS.md`](../../AGENTS.md), [`architecture.toml`](../../architecture.toml) |
| **Governed by** | [`adr:0023`](../adr/0023-no-secrets-in-logs.md), [`adr:0024`](../adr/0024-structured-logging.md) |
| **Rule IDs introduced** | `RULE-OPS-002`, in `2ec8bec`. **None in this commit** — the property was already enforced, and the code is written to satisfy it. |
| **Risks recorded** | `RISK-OPS-004` (the static scan is blind to a credential under a neutral name), `RISK-OPS-005` (the runtime filter is blind to a credential with no recognisable shape). Together they state exactly what the two-part control does not cover. |
| **Entry points** | [`backend/app/logging_setup.py`](../../backend/app/logging_setup.py), [`backend/app/middleware.py`](../../backend/app/middleware.py), [`backend/log_config.json`](../../backend/log_config.json), [`backend/Dockerfile`](../../backend/Dockerfile), [`backend/app/config.py`](../../backend/app/config.py), [`backend/app/main.py`](../../backend/app/main.py), [`backend/app/routers/auth.py`](../../backend/app/routers/auth.py), [`docker-compose.yml`](../../docker-compose.yml), [`ops/deploy/docker-compose.yml`](../../ops/deploy/docker-compose.yml), [`tools/checks/log_secrets.py`](../../tools/checks/log_secrets.py) |
| **Affected public surfaces** | **No route, MCP tool, schema, template or SPA surface moves.** Middleware is not a route; all five snapshots in `ops/surfaces/` regenerate byte-identically. Two additive surfaces do appear: the `LOG_LEVEL` environment variable, documented in [`README.md`](../../README.md) as `RULE-SURF-002` requires, and an `X-Request-Id` response header, which no snapshot records. |
| **Known dependents** | Everything, one way: `be/leaves` is the layer every other backend unit is allowed to reach, which is why the logging module belongs there. Nothing imports it back. |
| **Uncertain / dynamic areas** | `BLIND-OPS-001` and `RISK-OPS-002` — the deploy host's compose file. `BLIND-TEST-001` — test protection is import-derived, so the gate scripts show as unprotected by construction. |
| **Analogous implementations** | [`backend/app/rate_limit.py`](../../backend/app/rate_limit.py) — a `be/leaves` module holding process-local state for a cross-cutting concern, with its single-host assumptions written down rather than assumed. [`backend/app/startup_checks.py`](../../backend/app/startup_checks.py) — the refuse-versus-fall-back judgement `LOG_LEVEL` deliberately decides the other way. |
| **Delivery Pattern** | **Security or Operability Change** — failure scenario, control, adversarial proof. It is behaviour-changing: it creates an output surface that did not exist. |
| **Required tests** | The formatter emits one JSON object per line; a real JWT, a real API key, a real bcrypt hash and the resolved `JWT_SECRET` are redacted both by field name and by value shape under a neutral name; the request id is on every line of a request and differs between requests; and the adversarial regression — drive the credential endpoints and prove nothing leaked. |
| **Intended scope** | Step 15a only. Not the audit log (15c), not the migration `except` clause `WAIVER-OPS-001` covers (15b), not log shipping, not retention beyond a file count. |
| **Base revision** | `4d11cde` |
| **Index revision** | `2ec8bec` |

## The failure scenario

Two of them, and they are the reason this is an operability change rather than a feature.

**A credential is written down.** Everything a logger wants to record sits beside something that must never
be recorded — the login handler holds `body.password` two lines from the outcome worth logging; key rotation
holds `new_key` in the clear because it has to return it. A credential in the database is under a control; the
same credential in a log line is in a file, in a backup and in somebody's scrollback, for as long as the
retention policy says. Nothing raises, nothing errors, and by the time anyone reads the file the remedy is
rotation, not deletion.

**A disk fills.** Docker's `json-file` driver has no size limit by default. The application logged nothing
before today, so that cost nothing. It writes a line per request now, and on this host the partition holding
container logs also holds `users.db` and `data/` — an unbounded log takes the database down with it.

## The control

Four decisions, each recorded in full in [ADR 0024](../adr/0024-structured-logging.md):

1. **One stream, uvicorn included.** `--log-config log_config.json` on the image's command line, because
   uvicorn configures logging before it imports the application; a `configure_logging()` call alone would
   leave the startup banner and any bind failure outside the filter. A second stream would be a path around
   the redaction control, which is worse than a second format.
2. **`LOG_LEVEL` only, default `INFO`.** No `LOG_FORMAT`: there is no configuration in which structure or
   redaction is off. An unrecognised level falls back rather than refusing to boot.
3. **Rotation in both compose files** — `json-file`, `max-size: 10m`, `max-file: 5`, 50 MB per service.
4. **A per-request correlation id** on every line and on the response as `X-Request-Id`, carried in a
   `ContextVar` and assigned by raw-ASGI middleware so that uvicorn's access line — the one line per request
   guaranteed to exist — is inside the request's context when it is written.

**Two halves, and neither is sufficient.** `RULE-OPS-002` reads source and matches credential *names*; it is
blind to the same value under a neutral one and reads nothing outside `backend/app/` (`RISK-OPS-004`). The
runtime filter reads *values* and matches shapes — a JWT, a bcrypt hash, `token_urlsafe(32)`'s 43 characters,
and the resolved `JWT_SECRET` matched literally — so it catches a credential in a traceback, in a uvicorn
line, or under the field name `detail`; it is blind to a value with no shape under a name that does not say
credential, which a user's password is (`RISK-OPS-005`). The union is strictly larger than either, and what
remains is small enough to write down and to pin with a test.

## Adversarial proof

`test_no_credential_reaches_the_log_stream` in
[`backend/tests/unit/test_logging.py`](../../backend/tests/unit/test_logging.py) is the one that counts. With
the real application booted through the `client` fixture and the real logging configuration installed, its
stream redirected into a buffer *before* the credentials are created, it registers a user, logs in, reads and
rotates the API key, changes the password, authenticates with the rotated key, and drives login past its rate
limit — then asserts that the JWT, both API keys, both passwords and the signing key appear nowhere in what
was written, and that the expected messages *are* present so the assertion cannot pass vacuously.

The mechanism tests above it push a real JWT, a real API key, a real bcrypt hash and the resolved secret
through the formatter under the field name `detail`, and require each redacted. One test asserts the
*limit* — a plain password under a neutral name survives — so `RISK-OPS-005` is executable knowledge rather
than a paragraph.

It was also run outside the suite, against `uvicorn app.main:app --log-config log_config.json`, the command
the image starts with: 41 lines emitted, all 41 valid JSON, 19 distinct request ids, and none of the token,
either API key, the password or the signing key present. Then a real API key and a real JWT were put **in
the URL**, where they reach uvicorn's own access line — outside `RULE-OPS-002` entirely — and both came out
`[redacted]`. That line is quoted in [`docs/operations.md`](../operations.md#redaction-at-runtime).

`RULE-GATE-002`'s side of this was done in `2ec8bec`: both arms of `RULE-OPS-002` were constructed and
watched going red, and the first fixture found a real hole (an inline `logging.getLogger(__name__).info(...)`
that the scan did not recognise). The scanner was fixed, not the fixture.

## Behaviour change

**New:** every request is assigned an id and answers with `X-Request-Id`. The backend writes JSON to stdout —
six log lines exist today: registration, login succeeded, login rejected, login throttled, API key
regenerated, startup complete. Each logs the identity and never the proof of identity, and the
login-rejected line deliberately does not distinguish "no such account" from "wrong password", because a log
line that did would be the user-enumeration oracle the rate limiter exists to prevent, moved from the API
into the log file.

**Changed:** the container's `CMD` gains `--log-config`. `docker compose logs -f backend` now shows JSON, not
uvicorn's plain text; [`README.md`](../../README.md) says so and gives the `jq` line.

**Unchanged:** every route, every MCP tool name, the database schema, the Taskwarrior template, the SPA. No
snapshot in `ops/surfaces/` moved.

## What the index knows

**15 production path(s) changed**, out of 22 total, across both commits: `README.md`, `architecture.toml`,
`backend/Dockerfile`, `backend/app/config.py`, `backend/app/logging_setup.py`, `backend/app/main.py`,
`backend/app/middleware.py`, `backend/app/routers/auth.py`, `backend/log_config.json`,
`backend/tests/unit/test_logging.py`, `docker-compose.yml`, `ops/deploy/docker-compose.yml`,
`tools/checks/log-secrets.sh`, `tools/checks/log_secrets.py`, `tools/checks/profiles.conf`.

The index reports `backend/tests/unit/test_logging.py` protecting `backend/app/logging_setup.py`,
`backend/app/middleware.py`, `backend/app/config.py`, `backend/app/auth.py` and `backend/app/database.py` by
import. It reports **no** import-derived protection for `backend/app/routers/auth.py`, the compose files, the
Dockerfile or the gate scripts — read that as `BLIND-TEST-001` doing its job rather than as a gap. Routers
are exercised only through the FastAPI TestClient, which creates no import edge, and a gate check is proven
by construction in [`tools/fixtures/negative.sh`](../../tools/fixtures/negative.sh), never by a test that
imports it. Line coverage of the two new modules is 100%.

### Blind spots relevant to this answer

- **`BLIND-OPS-001`** — the deploy host's compose file is not in this repository. Its contents were read on
  2026-08-24 and are recorded, but nothing verifies the transcription and nothing detects drift.
- **`BLIND-TEST-001`** — test protection is import-derived; absence of an edge means "no import-derived
  protection", not "untested".
- **`BLIND-MCP-001`** (resolved) and **`BLIND-NGINX-001`** are reported by the index for the changed set but
  neither bears on this change: no tool name moves and nginx is untouched.

## Outstanding, and stated as outstanding

**Log rotation is checked in but not applied in production.** [`ops/deploy/docker-compose.yml`](../../ops/deploy/docker-compose.yml)
is a *copy* of the host's file; editing it changes nothing on the host (`RISK-OPS-002`). The `logging:` blocks
and the `LOG_LEVEL` line are in the copy, reviewable and diffable; `/opt/services/runway` is still running
Docker's unlimited default, and a logging-driver change only takes effect when the container is recreated.
The apply procedure is in [`docs/operations.md`](../operations.md#changing-it) and the gap is recorded beside
it at [Rotation](../operations.md#rotation), in the same shape the healthcheck gap is recorded.

This is written this way deliberately. Two claims this repository previously made about production — that the
healthchecks ran there, and that the documented rollback worked — turned out to be false when the host was
finally read. The correct response is to keep "what is checked in" and "what is applied" as two separate
statements, and never to let a green gate imply the second.

## Follow-on

Step 15b (the migration `except` clause and `WAIVER-OPS-001`), 15c (the audit log, whose rows carry the
`request_id` this change introduces, and which is what makes `SHIM-SEC-006`'s removal evidence-based), and
15e/f (`docs/threat-model.md`, the shim evidence runbook, the SEC-5 waiver). Remaining scope is in
[`docs/plan/STATUS.md`](../plan/STATUS.md) §3.
