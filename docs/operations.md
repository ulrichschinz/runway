# Operations

How this repository is verified, shipped, protected and rolled back.

## The pipeline

```
pull request ──> Verify (verify.yml)                    required to merge
push to main ──> Build and Deploy (deploy.yml)
                   └─ verify        (the same reusable workflow)
                        └─ build-and-push   needs: verify
                             └─ deploy      needs: build-and-push
```

**Nothing is built and nothing is shipped unless `verify` passes.** Before 2026-08-04 this pipeline went
straight from push to build to deploy with no verification of any kind — see [the incident](#incident-2026-08-04)
below for what that cost.

## Branch protection

`RULE-GOV-001`. `ops/github/ruleset.json` is **canonical**; the live GitHub configuration is compared
against it on every `verify`, so a protection switched off in the web UI is detectable rather than silent.

```sh
tools/apply-ruleset.sh          # push the checked-in state to GitHub
./run verify                    # includes the drift check
```

The ruleset requires the `verify` status check, and forbids branch deletion and non-fast-forward pushes.
It does **not** require a pull request. It does, however, require the `verify` status check — and that
**does reject a direct push to `main`**, because a freshly pushed commit has no check runs yet:

```
remote: - Required status check "verify" is expected.
remote: ! [remote rejected] HEAD -> main (push declined due to repository rule violations)
```

**This corrects a claim made on 2026-08-04.** The test that appeared to show direct pushes surviving was
invalid: it pushed a *new branch* matching the rule, which is branch creation, not a push onto a protected
branch. The error was found on 2026-08-14 by trying to push a documentation commit to `main`.

So decision **F4** — a required status check *and* continued direct pushes — is not achievable with this
ruleset. In practice every change has gone through a pull request regardless, so the half that matters holds.
The open choice is recorded in `docs/plan/STATUS.md`: keep PR-only, or drop `required_status_checks` and rely
solely on `deploy.yml` gating, which would restore direct pushes but let a red pull request merge.

Two governance gaps are recorded rather than papered over: `RISK-GOV-001` (a single maintainer cannot be
independently reviewed) and `RISK-GOV-002` (the drift check cannot prove anything from an offline machine).

### Governance drift evidence

`RULE-GOV-001` has no automated negative fixture — the offline fixture sandbox has no GitHub to drift from
(`RISK-GOV-003`). Its violations were constructed by hand against the live API on 2026-08-04, and all three
were detected:

| Drift introduced | Detected as |
|---|---|
| `enforcement` set to `disabled` | `enforcement is 'disabled', want 'active'` |
| `non_fast_forward` rule removed | `rule 'non_fast_forward' is missing from the live ruleset` |
| A bypass actor added | `1 bypass actor(s) configured, want 0` |

Re-run that procedure whenever the check changes.

## Rolling back

Every deploy pushes two tags per image: `:latest` and an immutable `:<commit-sha>`. **Before 2026-08-04
there was only `:latest`, which means there was no rollback target at all** — nothing named the previous
build.

To roll back, pin the last good SHA on the deploy host:

> **This works, as of a host read on 2026-08-28.** Both services on the host are declared
> `image: ghcr.io/ulrichschinz/runway-{backend,frontend}:${RUNWAY_SHA:-latest}`, so the variable below has
> something to substitute into. The warning that stood here until 2026-08-28 — that the host pinned
> `:latest` literally and `export RUNWAY_SHA=...` had no effect — was true when it was written and is not
> true now; the parameterisation was applied to the host in PR #15 and nothing recorded that it had landed.
>
> Read on one date, by one command. Nothing continuously compares the host against the checked-in copy
> (`RISK-OPS-002`), so this is a verified observation and not a standing guarantee.

**Rolling back by hand** — no longer required, kept because it is what to do if the variable is ever
removed from the host file:

```sh
# on the deploy host
cd /opt/services/runway
sudo cp docker-compose.yml docker-compose.yml.bak
sudo sed -i 's|runway-backend:latest|runway-backend:<sha>|; s|runway-frontend:latest|runway-frontend:<sha>|' \
  docker-compose.yml
sudo docker compose pull && sudo docker compose up -d --remove-orphans
```

**To make the documented procedure work**, the host's compose file needs the tag parameterised once:

```yaml
image: ghcr.io/ulrichschinz/runway-backend:${RUNWAY_SHA:-latest}
image: ghcr.io/ulrichschinz/runway-frontend:${RUNWAY_SHA:-latest}
```

That is behaviour-preserving while `RUNWAY_SHA` is unset, and it turns the block below into a real runbook:

```sh
cd /opt/services/runway
export RUNWAY_SHA=<the last good commit sha>
sudo docker compose pull && sudo docker compose up -d --remove-orphans
```

Find candidate SHAs in the Actions run summary of any successful deploy, or:

```sh
gh api /users/ulrichschinz/packages/container/runway-backend/versions \
  --jq '.[] | .metadata.container.tags' | head
```

## Health

Both services declare a healthcheck in the **checked-in** `docker-compose.yml`, and `frontend` waits for
`backend` to be healthy rather than merely started. A crash-looping container used to be indistinguishable
from a working one: `docker compose up -d` returns success either way.

The backend healthcheck calls `/health` with Python's `urllib`, because the runtime image ships no HTTP
client.

> **These healthchecks now run in production. Read directly from the host on 2026-08-28.**
> `/opt/services/runway/docker-compose.yml` carries a `healthcheck` block on both services and orders
> `frontend` behind `depends_on: backend: condition: service_healthy` — *healthy*, not merely *started* —
> exactly as the checked-in copy at [`ops/deploy/docker-compose.yml`](../ops/deploy/docker-compose.yml)
> declares. The defect that kept a dead backend in production through two green deploys on 2026-08-04 is
> closed on the host, not only in this repository.
>
> The only drift between the host and the checked-in copy is the two `logging:` blocks and the `LOG_LEVEL`
> line — log rotation, which is still unapplied. See *The log stream*.
>
> **Do not read this as a standing guarantee.** It is one read on one date, and the sentence it replaces
> was also true when it was written. Nothing continuously compares the host against the checked-in copy
> (`RISK-OPS-002`); CI has no host access, so this paragraph starts ageing the moment it is committed.

## Timeouts

`RULE-OPS-001` requires every blocking outward call the serving application makes — process execution and
network egress — to declare a timeout at the call site.

A call with no timeout does not fail. It waits, and the worker serving the request waits with it. There is
one Taskwarrior binary behind every list this application renders, so a `task` invocation that never returns
is not a slow page: it is a worker that never comes back. Enough of them is an outage, and it is an outage
with nothing in any log to explain it, because nothing errored.

The application makes exactly one such call today —
[`task_runner._run`](../backend/app/services/task_runner.py) — and it already declares `timeout=10`. The rule
therefore costs nothing to satisfy right now. That is the point: it exists so the property survives the
second such call, which will be written by someone who never read this page.

**What the check reads.** [`tools/checks/timeouts.py`](../tools/checks/timeouts.py) parses every tracked
Python file under `backend/app/`, resolves import aliases so a rename cannot hide a call, and requires a
`timeout=` keyword on the process and HTTP client calls it knows. Three shapes are refused:

- **no `timeout=`** — the ordinary case
- **`timeout=None`** — the absence of a timeout, spelled out; deliberate enough to be worth a review
- **keywords arriving through `**kwargs`** — a bound that cannot be read at the call site cannot be reviewed
  at the call site
- **`subprocess.Popen`** — it takes no timeout argument at all; the waiting happens later, in
  `.communicate()`, which is exactly the indirection this rule refuses

**Scope.** `backend/app/` only. Repository tooling under `tools/` also shells out, but it runs inside the
gate's own runtime budget (`RULE-GATE-001`), which bounds it already; extending the rule there would add
standing exceptions without adding a control.

**What it does not check.** That the value is *sensible*. A `timeout=86400` satisfies this rule and helps
nobody. Declaration is mechanically checkable and sufficiency is not — recorded as `RISK-OPS-003`.

## The log stream

Everything this deployment emits is **one JSON object per line, on stdout, from one handler**.
Application lines, uvicorn's access lines and any traceback are the same shape and pass through the same
redaction filter. Before 2026-08-28 the serving application logged nothing at all and what production wrote
was uvicorn's plain-text default; see [ADR 0024](adr/0024-structured-logging.md).

```json
{"timestamp": "2026-08-28T08:31:12.404Z", "level": "INFO", "logger": "app.routers.auth", "message": "login succeeded", "request_id": "1e4c7a90b2d5", "username": "alice"}
```

`timestamp` is UTC to the millisecond, `logger` is the module that spoke, and everything after `message` is
whatever that call passed as structured fields.

```sh
docker compose logs -f backend
docker compose logs --no-log-prefix backend | jq -r 'select(.level != "INFO")'
docker compose logs --no-log-prefix backend | jq -r 'select(.request_id == "1e4c7a90b2d5")'
```

**One stream, not two.** uvicorn's `uvicorn`, `uvicorn.error` and `uvicorn.access` loggers are stripped of
their own handlers and propagate to the same one, through
[`backend/log_config.json`](../backend/log_config.json) on the image's `uvicorn --log-config` command line.
That file is generated from [`app.logging_setup.dict_config`](../backend/app/logging_setup.py) and a unit
test holds the two together; edit the module and regenerate, never the file by hand. The reason it is a
file and not just a call inside the application is timing: uvicorn installs its own plain-text handlers
before it imports the app, and those lines would otherwise reach stdout unredacted.

### `LOG_LEVEL`

The only logging knob. `DEBUG`, `INFO` (the default), `WARNING`, `ERROR` or `CRITICAL`; an unrecognised
value falls back to `INFO` rather than refusing to boot, because the cost of a typo in a verbosity setting
should not be an outage.

**There is deliberately no `LOG_FORMAT`.** The format is JSON unconditionally and the redaction filter is
not optional, because a switch that turns a control off is the switch that gets turned off at 3am by the
person who is already having a bad night.

### The correlation id

Every request is assigned a 12-hex-character id by `RequestIdMiddleware`
([`backend/app/middleware.py`](../backend/app/middleware.py)). It appears as `request_id` on every line
logged while that request runs — the access line included — and is returned to the caller in the
**`X-Request-Id`** response header, so a user reporting a problem can quote it and the whole request can be
pulled out of the log with one `jq`. A line logged outside a request has no `request_id` field at all
rather than an empty one.

The id is always minted here and never read from the request. An inbound `X-Request-Id` would be
attacker-controlled text copied verbatim into every line of that request, which is how a log injection
starts.

It is carried in a `contextvars.ContextVar`, not a module global: this process serves requests
concurrently, and a correlation id that correlates the wrong lines is worse than none.

### Redaction at runtime

`RULE-OPS-002` refuses a credential-bearing *name* in the source. The filter here removes a credential-bearing
*value* from the output. Neither is sufficient alone and the two are not alternatives:

| | catches | misses |
|---|---|---|
| `RULE-OPS-002` (static) | anything named `password`, `token`, `api_key`, `jwt_secret`, … at a logging call in `backend/app/` | the same value under a neutral name; uvicorn, libraries, tracebacks |
| the redaction filter (runtime) | a JWT, a bcrypt hash, a 43-character API key and the resolved `JWT_SECRET` **anywhere in the line**, whatever it is called, plus any field whose name says credential | a value with no recognised shape under a name that does not say credential — a plain password, for one |

What remains after both is recorded as `RISK-OPS-005`.

The clearest case for keeping both is a line neither this repository nor `RULE-OPS-002` can reach — uvicorn's
own access log, where the credential is in the URL:

```json
{"timestamp": "…", "level": "INFO", "logger": "uvicorn.access", "message": "127.0.0.1:55982 - \"GET /auth/me?api_key=[redacted] HTTP/1.1\" 401", "request_id": "2af2784bea6e"}
{"timestamp": "…", "level": "INFO", "logger": "uvicorn.access", "message": "127.0.0.1:55983 - \"GET /nope/[redacted] HTTP/1.1\" 404", "request_id": "75f85290942b"}
```

Observed on 2026-08-28 against a locally run `uvicorn app.main:app --log-config log_config.json` — the same
command the image starts with, not the image itself — with a real API key and a real JWT put in the path.
No source scan could have prevented either line; nobody in this repository wrote it.

Redaction replaces with the literal marker `[redacted]` rather than deleting: a line saying a token was
there and has been removed is still evidence, a line with a hole in it is a puzzle.

### Rotation

Both compose files declare the `json-file` driver with `max-size: 10m` and `max-file: 5` — 50 MB per
service, which is a long time at this scale. Docker's default is **no limit at all**, and on this host the
partition that holds the container logs also holds `users.db` and `data/`, so an unbounded log is a full
disk that takes the database down with it. That mattered less when the application logged nothing; it
writes a line per request now.

> **Rotation is not yet active in production.** [`ops/deploy/docker-compose.yml`](../ops/deploy/docker-compose.yml)
> is a checked-in *copy* of the host's file and editing it does not change the host (`RISK-OPS-002`). The
> `logging:` blocks and the `LOG_LEVEL` line were added to the copy on 2026-08-28 and are reviewable here;
> the deployment at `/opt/services/runway` is still running with Docker's unlimited default. **Outstanding
> action:** apply the file to the host with the procedure in [Changing it](#changing-it) below, then
> `docker compose up -d` — a logging driver change takes effect when the container is recreated, not on
> reload. Until that is done, this repository states the intent and not the state, which is the same
> distinction the *Health* section above draws about the healthchecks.

## No secrets in logs

`RULE-OPS-002` forbids the serving application from passing a credential-bearing expression to a logging
call — a secret, a password or its hash, a token, an API key, a bearer credential — whether it goes into the
message, into an interpolation, or into the structured fields.

**If the gate just sent you here,** you wrote a log line that names a credential. The fix is almost always
to log the *identity* instead of the *proof of identity*: the username, the key's owner, the token's `sub`
claim, a truncated key id — anything that lets someone follow the request without handing them the
credential. If the expression genuinely is not a credential (a variable that only *looks* like one), append
`# log-secrets: allow` to the logging statement with a reason. That marker is one `grep` away from review,
which is the point: an exemption is a decision somebody has to be able to find.

A credential in the database is a credential under a control. The same credential in a log line is a
credential in a file, in a backup, and in whoever's terminal scrollback — kept for as long as the retention
policy says, which is longer than anyone remembers. Nothing raises and nothing errors, so the disclosure is
invisible until somebody reads the file, and by then the remedy is rotation, not deletion — the same remedy
`RULE-DEP-003` exists for.

**Why the rule landed before the logging did.** When it was written the application had no logging at all —
no `import logging`, no `getLogger`, no `print()` anywhere under `backend/app/` — so the property held for
free and would stop holding in the first commit that added a logger. That commit landed hours later and is
[described above](#the-log-stream); the rule was already there to meet it. Landing it afterwards would have
meant relying on the reviewer of a large new logging module to notice one interpolated field, which is the
review that never happens.

**What the check reads.** [`tools/checks/log_secrets.py`](../tools/checks/log_secrets.py) parses every
tracked Python file under `backend/app/`. It resolves import aliases, so `import logging as lg` and
`from logging import getLogger as gl` are not holes, and it treats as a logging call: the `logging.*`
module functions, any name assigned from `getLogger`/`getChild`, a `getLogger(...)` call used inline
without ever being bound to a name at all, any receiver named like a logger
(`logger`, `log`, `self.logger`, `audit_log`), and `print()` — because in a container, stdout *is* the log.
Inside such a call it flags:

- a credential-bearing name passed directly, in an f-string, or through `%` or `.format()`
- a credential-bearing key or value in the `extra={...}` dict, which is where structured fields go
- `extra=locals()` and its relatives — a payload that cannot be read at the call site cannot be reviewed
  there, and in a request handler the locals are exactly where the password is

The names it knows are the ones this repository actually uses — `password`, `current_password`,
`new_password`, `hashed`, `jwt_secret`, `token`, `access_token`, `credentials`, `api_key`, `x_api_key`,
`new_key` — not a generic word list.

**Transport-independent by construction.** It reads source, not emitted output, so it survived the
transport decision it was written before: the uvicorn access logger *was* replaced, and this rule did not
change a line.

**What it does not check.** That a credential arriving under a *neutral* name stays out — logging `body`,
`row` or a request object discloses the password with nothing to match on. Nor does it see anything outside
`backend/app/`: a credential logged by a library, by uvicorn itself, or in an exception traceback is beyond
it. Recorded as `RISK-OPS-004`. The [runtime redaction filter](#redaction-at-runtime) covers most of that
second column by reading values instead of names — it is the other half of this control, not a replacement
for it, and what neither half reaches is `RISK-OPS-005`.

## The audit log

**A second SQLite file, `data/audit.db`, holding what was done to accounts and data — not what the process
was doing.** The log stream above answers "what happened during that request"; this answers "who changed
that role, when was that key rotated, and which credential shape let them in". It is a separate file and not
a table in `users.db` on purpose, and not a stdout stream on purpose: the reasoning for both is in
[ADR 0026](adr/0026-the-audit-log.md).

It lives under `DATA_ROOT`, which is the only directory either compose file bind-mounts, so **it survives a
container recreation and it is inside whatever backs up `data/`**. There is no HTTP endpoint that reads it.
Reading the audit log is an operator activity, performed on the host:

```sh
# on the deploy host
cd /opt/services/runway
sqlite3 -header -column data/audit.db 'SELECT * FROM audit_events ORDER BY id DESC LIMIT 20;'
```

One row per event, ten columns:

| column | what it holds |
|---|---|
| `recorded_at` | UTC to the millisecond, the same stamp shape the JSON log lines carry |
| `event` | the event name, dotted — `auth.login.failed`, `admin.role.changed`, `task.deleted` |
| `actor` | the acting principal, or `NULL` where there is none (a boot-time promotion has no actor) |
| `subject` | what was acted upon, where it differs from the actor — the target of a role change, the uuid of a deleted task |
| `outcome` | `success`, `failure` (the request was wrong), `refused` (a control said no) or `noop` |
| `auth_shape` | **which credential shape authenticated the request** — see below |
| `route` | the route *template*, `PUT /admin/users/{target}/role`, never the requested path |
| `request_id` | the same correlation id as [the log lines](#the-correlation-id) from that request |
| `detail` | short context in words. Never a credential |

**No credential is ever in a row** — not a key, not a token, not a password, not a hash. The row says which
*shape* was used, never the value, and every string written additionally passes through the same redaction
the log stream uses, so a future call site that gets it wrong still cannot persist one.

**No IP address and no user-agent.** That is a deliberate deferral, not an omission: it is a PII and
retention question that has not been decided. The schema is flat and nullable so adding one column later is
one `ALTER TABLE`.

**Nothing prunes this file.** It grows for the life of the deployment, on the same partition as `users.db`
and `data/`. Recorded as `RISK-OPS-006`, with the trigger to come back to it.

### Is anyone still using the Bearer-as-API-key shape?

The question `SHIM-SEC-006` has been blocked on since Step 13, and the reason this table exists. Three
credential shapes reach `get_current_user` and until now all three left the same trace — none:

| `auth_shape` | the request looked like | |
|---|---|---|
| `api-key-header` | `X-Api-Key: <key>` | the clean API-key path |
| `bearer-jwt` | `Authorization: Bearer <jwt>` | the clean JWT path |
| `bearer-api-key` | `Authorization: Bearer <key>` | **the shim** — reached only after a failed JWT decode |

```sh
# on the deploy host: who is still sending an API key in the Bearer slot, and where
sqlite3 -header -column /opt/services/runway/data/audit.db "
  SELECT actor,
         route,
         COUNT(*)         AS calls,
         MIN(recorded_at) AS first_seen,
         MAX(recorded_at) AS last_seen
  FROM audit_events
  WHERE event = 'auth.authenticated'
    AND auth_shape = 'bearer-api-key'
  GROUP BY actor, route
  ORDER BY calls DESC, route;"
```

```sh
# the same question as a one-line ratio, for a quick look
sqlite3 -column /opt/services/runway/data/audit.db "
  SELECT auth_shape, COUNT(*) FROM audit_events
  WHERE event = 'auth.authenticated' GROUP BY auth_shape ORDER BY 2 DESC;"
```

**Read the result carefully, because the two answers are not symmetric.**

*Rows returned* is proof: a caller still depends on the shape, and you now have their account and the exact
endpoints to migrate. Removing the shim today would break precisely those.

*No rows* is **not** proof that nothing depends on it. It is a statement about the window you observed. A
weekly report job, a monthly reconciliation, an agent someone has switched off for a fortnight — all of them
are invisible to a query run over four days. Removal therefore needs a soak period on the real deployment,
longer than the slowest caller's cycle, counted from the day this audit log actually reaches production and
not from the day it was merged. Two further blind spots: only *successful* authentication is recorded, so a
caller sending an expired key never appears; and a client that has migrated but still carries the old code
path is indistinguishable from one that never had it.

Until that window has passed, `SHIM-SEC-006` stays, and its expiry has not moved.

### Other questions this table answers

```sh
# every disclosure of an API key in cleartext (finding SEC-5), most recent first
sqlite3 -header -column data/audit.db "
  SELECT recorded_at, actor FROM audit_events
  WHERE event = 'auth.apikey.disclosed' ORDER BY id DESC LIMIT 20;"

# every administrative action and every refusal
sqlite3 -header -column data/audit.db "
  SELECT recorded_at, event, actor, subject, outcome, detail FROM audit_events
  WHERE event LIKE 'admin.%' OR outcome = 'refused' ORDER BY id DESC;"

# a login attack: failures and lockouts, by account
sqlite3 -header -column data/audit.db "
  SELECT actor, event, COUNT(*) AS n, MAX(recorded_at) AS last_seen FROM audit_events
  WHERE event LIKE 'auth.login.%' AND outcome != 'success'
  GROUP BY actor, event ORDER BY n DESC;"

# everything about one request, both halves — the row, then the lines
sqlite3 -header -column data/audit.db \
  "SELECT * FROM audit_events WHERE request_id = '1e4c7a90b2d5';"
docker compose logs --no-log-prefix backend | jq -r 'select(.request_id == "1e4c7a90b2d5")'
```

**A missing row is not the same as a missing event.** An audit write can never fail a request — the write is
wrapped, and a failure is logged at `ERROR` as `the audit event could not be written` and the request is
served anyway. So if a row seems absent, grep the log stream for that message before concluding the event
did not happen.

## The deploy host's topology

**Read directly from the host on 2026-08-24 and checked in as** [`ops/deploy/docker-compose.yml`](../ops/deploy/docker-compose.yml).
This section replaces an open question that stood since 2026-08-04. `BLIND-OPS-001` is narrowed rather than
closed: the file is now reviewable and diffable, but nothing compares it against the host, so drift is still
undetected (`RISK-OPS-002`).

The file contains no secrets — `JWT_SECRET` is a `${...}` reference resolved from a `.env` beside it on the
host, which is not and must never be in this repository. `RULE-HYG-003` fails the gate if a literal ever
replaces a reference there, because in a diff that looks like almost nothing.

The host is `ar00`, reachable as `adm.agentic-reach.com`. The deployment lives in `/opt/services/runway`,
owned by root, containing `docker-compose.yml`, `.env`, `users.db` and `data/`. Its compose file is **not**
the one in this repository:

```yaml
services:
  backend:
    image: ghcr.io/ulrichschinz/runway-backend:latest
    restart: unless-stopped
    volumes:
      - ./data:/app/data
      - ./users.db:/app/users.db
    environment:
      - JWT_SECRET=...        # from .env, beside the compose file
      - DATA_ROOT=...
      - DB_PATH=...
    networks:
      - traefik-public

  frontend:
    image: ghcr.io/ulrichschinz/runway-frontend:latest
    restart: unless-stopped
    environment:
      - BACKEND_HOST=...
    depends_on:
      - backend
    networks:
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.runway.rule=Host(`runway.agentic-reach.com`)"
      - "traefik.http.routers.runway.entrypoints=websecure"
      - "traefik.http.routers.runway.tls.certresolver=letsencrypt"
      - "traefik.http.services.runway.loadbalancer.server.port=4000"

networks:
  traefik-public:
    external: true
```

`.env` beside it declares **`JWT_SECRET` only**.

It also carried `ALLOW_REGISTRATION` until 2026-08-24, which did nothing: the host's compose file never
passed it to the backend, so the container never saw it. `ALLOW_REGISTRATION` is a **first-run seed** —
`init_db()` writes it into the `site_settings` table with `INSERT OR IGNORE`, so once that row exists the
environment variable is ignored for the life of the database. The row is the authoritative value and an
admin changes it through `PUT /admin/settings`. Production reads `allow_registration = false`, so
registration is closed. The dead line was removed; a backup of the previous file is at `.env.bak-2026-08-24`
on the host.

The repository-root `docker-compose.yml` still declares `ALLOW_REGISTRATION=${ALLOW_REGISTRATION:-true}`.
That is the development file, where seeding a fresh database with registration open is the useful default.

### What this settles

- **The images CI pushes are the images that run.** Both services name `ghcr.io/ulrichschinz/runway-*`, so
  `docker compose pull` consumes them. They are not decorative, and the host does not build from source.
- **No ports are published.** Traffic arrives through Traefik on the external `traefik-public` network, TLS
  terminated by Let's Encrypt, routed to the frontend on port 4000. The backend is not reachable from
  outside the compose network except through the frontend.
- **The rollback runbook works**, as of a host read on 2026-08-28: both images are declared with
  `${RUNWAY_SHA:-latest}`, so pinning a SHA takes effect. See *Rolling back*.
- **The healthchecks do run**, as of a host read on 2026-08-28. The transcript above is the file as it
  stood on 2026-08-24, before they were applied. See *Health*.
- **The checked-in `docker-compose.yml` is a development artefact**, not a description of production. It
  declares `build:` with no `image:`, publishes ports, and has no Traefik labels. Reading it to learn how
  production is wired gives the wrong answer on every one of those points.

### Changing it

`ops/deploy/docker-compose.yml` is **not deployed from here.** The deploy job runs `docker compose pull &&
docker compose up -d` against whatever file is already on the host. Changing the topology means editing the
host **and** updating the checked-in copy in the same change; nothing enforces that they agree
(`RISK-OPS-002`).

```sh
scp ops/deploy/docker-compose.yml <host>:/tmp/runway-compose-new.yml
ssh <host> 'cd /opt/services/runway && sudo cp -a docker-compose.yml docker-compose.yml.bak-$(date +%F)'
ssh <host> 'sudo docker compose --project-directory /opt/services/runway \
              -f /tmp/runway-compose-new.yml config --quiet'   # validate BEFORE installing
ssh <host> 'sudo install -o root -g root -m 644 /tmp/runway-compose-new.yml \
              /opt/services/runway/docker-compose.yml'
ssh <host> 'cd /opt/services/runway && sudo docker compose up -d'
```

Validate before installing, always. A compose file that fails to parse leaves `up -d` unable to run at all,
and the service stays on whatever it was.

### What is still open

Nothing compares the checked-in copy against the host. A gate check cannot do it — CI has no access to the
deploy host — so the honest options are a scheduled job that reports divergence from somewhere that does, or
accepting that this file is correct as of the date on it.

## Incident 2026-08-25

Every container test failed on a backend nobody had touched:

```
RuntimeError: Could not find file in CWD, directory of config file or search paths 'default.theme'
15 failed, 2 passed
```

Both images install Taskwarrior with `pacman -Sy task` from `archlinux:latest` and copy **only the binary**
out of the builder stage. That was sufficient until Arch rolled forward to Taskwarrior **3.5.0**, which
refuses to run without the theme files it keeps in `/usr/share/doc/task/rc/`.

The trap underneath it: the Arch container image ships `NoExtract = usr/share/doc/*` in `pacman.conf` to
stay small, so those files are never written to disk. `pacman -Ql task` lists them regardless — it reports
what the package *declares*, not what was extracted — so the obvious diagnostic agrees the files are there
while the filesystem does not. The builder stage now drops the `NoExtract` rules before installing, and both
images copy the theme directory.

**Nothing reached production.** The running containers were built before the roll-forward and are healthy;
the next deploy would have shipped a broken backend, and `verify` gating the deploy (ADR 0005) is what
stopped it. The container tier — which an arm64 developer never sees locally (`RISK-TEST-001`) — is what
caught it.

What it cost, and what is still owed: the failure was indistinguishable at a glance from the workflow-level
failure it was hiding behind, because a run that cannot resolve an action reports the same red `verify` as a
gate that found real violations, except no rule ran at all. Both are fixed here. The underlying exposure —
an unpinned rolling distro deciding what binary the tests run against — is recorded as `RISK-DEP-001` and
belongs to Step 14.

## Incident 2026-08-04

The backend could not start in any image built after `mcp 2.0.0` was published.

`requirements.txt` pinned nine direct dependencies exactly and nothing transitive. `fastapi-mcp==0.3.3`
declares `mcp>=1.6.0` with no upper bound; `mcp 2.0.0` changed `Server.__init__`, so `import app.main`
raised `TypeError` before uvicorn bound a port.

Nothing reported it. The image built — the failure was at import, not install. The registry push succeeded.
The deploy job went green. The service was down.

What changed as a result:

| Change | Prevents |
|---|---|
| `mcp==1.29.0` pinned (ADR 0004) | this specific break |
| `RULE-DEP-001` — the backend must import cleanly | the whole class, in under a second, on every `check` |
| `verify` gates build and deploy (ADR 0005) | shipping anything that fails verification |
| Healthchecks in compose | a crash-looping container reporting success |
| Immutable SHA tags | having no rollback target |

Still open: transitive dependencies are unpinned as a whole (Step 14's hash-pinned lockfile). The deploy
host's topology is no longer unknown, but two of the mitigations in that table — the healthchecks, and the
SHA tags as a rollback mechanism — turn out not to be active on the host. Both are recorded above.
