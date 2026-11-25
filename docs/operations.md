# Operations

How this repository is verified, shipped, protected and rolled back.

## The pipeline

```
pull request ──> Verify (verify.yml)                    required to merge
push to main ──> Build and Deploy (deploy.yml)
                   └─ verify        (the same reusable workflow)
                        └─ build-and-push   needs: verify
                             └─ deploy      needs: build-and-push
                                  └─ verify-deploy   needs: deploy
```

**Nothing is built and nothing is shipped unless `verify` passes.** Before 2026-08-04 this pipeline went
straight from push to build to deploy with no verification of any kind — see [the incident](#incident-2026-08-04)
below for what that cost.

## The deploy mechanism

The `deploy` job connects to the host with a key that carries a **forced command**, so the `script:` in
[`deploy.yml`](../.github/workflows/deploy.yml) is never executed as a script. A compromised CI run gets
that one command and never a shell.

The forced command is **not runway-specific**. Read from the host on 2026-08-31, the deploy account's
`authorized_keys` carries one key per service, each of the form:

```
command="sudo /opt/scripts/deploy.sh runway",no-port-forwarding,no-X11-forwarding,no-agent-forwarding
```

`/opt/scripts/deploy.sh` is shared by every service on that host and takes the service name as its only
argument. For each image in the stack it pulls the image and tries to extract
`/opt/stack/docker-compose.yml` from it; the first image that carries one wins, and that file is written
over the on-disk `docker-compose.yml`. Then it pulls and runs `up -d --remove-orphans`. An image carrying
no such file leaves the host's copy untouched.

So the way this repository determines its own deployment is by **baking
[`ops/deploy/docker-compose.yml`](../ops/deploy/docker-compose.yml) into the backend image** at that path.
That is why [`backend/Dockerfile`](../backend/Dockerfile) has the repository root as its build context
rather than `./backend`: a file can only enter an image from inside its own build context, and the compose
file has exactly one source of truth. [`.dockerignore`](../.dockerignore) keeps that context to the backend
tree plus that one file.

`SSH_ORIGINAL_COMMAND` is ignored by the host. The commit sha in the `script:` line is not read by
anything; it is kept because the action requires a non-empty script and it makes the connection legible in
the host's auth log.

### What says the deploy actually happened

The `deploy` job is green when the SSH connection closed. That is a statement about the connection, not
about production: the host script falls through silently for an image that carries no baked compose — six
days of deploys did exactly that — and a container that starts and then dies leaves the previous one
serving. Every earlier false claim about this service's production state was found by a human reading the
host, never by anything failing.

The `verify-deploy` job closes the narrowest, most valuable part of that gap with the only access CI has:
HTTP to the public origin (`vars.RUNWAY_PUBLIC_URL`, defaulting to the literal). It asks the running server
about itself, through [`GET /api/skill`](../backend/app/routers/skill.py) — the route that reports the
commit its image was built from and the release record of the skill that image carries (ADR 0040):

1. **Poll** `/api/skill` every ten seconds for up to six minutes, until `.server.commit` is the commit that
   was just pushed. Until that matches, production is still serving the previous build.
2. **Compare** `.skill.version` and `.skill.sha256` against
   [`plugin.json`](../integrations/claude/.claude-plugin/plugin.json) and
   [`ops/skill-release.json`](../ops/skill-release.json) at that commit.
3. **Check** `/api/health` says `ok`.
4. **Download** `/api/skill/runway.zip` and confirm it carries `runway/SKILL.md`.

Steps 2 and 4 are there for a failure the gate structurally cannot see: it builds no image, so a
`.dockerignore` or `Dockerfile` edit that stops admitting the skill tree passes every check and then answers
**503** in production. The same comparison catches an image built from a different commit than the one
being verified, and a deploy that never reached the host at all.

Since brief 0073 the same step also checks **which image, under which compose, at which schema version**
(`RISK-OPS-002`, ADR 0047 Decision 4). `GET /api/skill`'s `server` object reports:

| field | what it is | must equal |
|---|---|---|
| `build` | `/app/BUILD_ID`, the workflow run id baked by `ARG RUNWAY_BUILD` | this run's `GITHUB_RUN_ID` |
| `compose_sha256` | SHA-256 of `/opt/stack/docker-compose.yml`, the compose baked into the image | SHA-256 of `ops/deploy/docker-compose.yml` at this commit |
| `applied_compose_sha256` | SHA-256 of the host's own `./docker-compose.yml`, which the deploy compose mounts read-only at `/etc/runway/applied-compose.yml` | the same |
| `schema_version` | the version `init_db()` left `users.db` at ([Schema migrations](#schema-migrations)) | the `-- schema_version` line of `ops/surfaces/db-schema.sql` |

Only hashes and a number leave the container; the file is never served. An `applied_compose_sha256` that is
`null` or differs is the failure this repository could not see before: the host script did not write the
compose the image carries, and the new image is running under the old configuration. A second step then asks
the registry (`docker buildx imagetools inspect`) whether `:latest` and `:<sha>` resolve to the digest
`build-and-push` pushed.

What it still does **not** do is read the host: CI has no access, so which digest the host's container runs is
inferred — the build id is baked only into the image this run pushed — not observed, and between deploys
nothing compares anything. `RISK-OPS-002` stays open, narrowed to that.

### The correction of 2026-08-31

Between 2026-08-28 and 2026-08-31 this section, [`deploy.yml`](../.github/workflows/deploy.yml) and the
compose file's own header all described a different mechanism: a runway-specific forced command,
`ops/deploy/deploy-command.sh`, that fetched the compose from `raw.githubusercontent` at the deployed
commit, validated it, and applied it.

**That script was written, reviewed, merged and never installed.** No forced command ever pointed at it.
The runbook it came with instructed the reader to repoint the deploy key with a `sed` addressed to a line
containing `docker compose pull` — a string that appears in no `authorized_keys` on that host. The script
would also have failed if it had been installed: the deploy account may `sudo` only `/opt/scripts/deploy.sh`,
so its own `sudo -n docker compose` calls would have been refused.

It was found by reading the host, which is how all four of the earlier stale claims were found. The pattern
is now five for five, and `RISK-DOC-004` is the record of it.

### Why the compose file is deployed rather than described

Until 2026-08-31 runway's images carried no baked compose, so the host script's extraction loop fell through
and the host's copy was whatever someone last edited by hand. This repository's copy was a transcription of
it.

A transcription is accurate on the day it is taken. Four claims made here about production were each true
when written and each drifted silently afterwards — the healthchecks did not run and then did, the rollback
runbook was broken and then was not, log rotation was checked in and not applied, and the deploy mechanism
itself was described as something that did not exist. **Every one was found by someone reading the host,
never by anything failing.** `RISK-OPS-002` is the record of that gap.

So the compose file became part of the deployed artefact. Configuration changes now travel the same path as
code: a pull request, `verify`, a merge, a deploy. Rollback also gets more correct rather than less — pinning
an old `RUNWAY_SHA` now restores that commit's compose too, instead of pairing an old image with today's
configuration.

### What it costs, and the boundary on it

Whatever is in `ops/deploy/docker-compose.yml` on `main` now decides what runs on the host. Compose can mount
host paths, join the host network namespace and ask for privilege — none of which application code can do
from inside a container. Merging to `main` was container-scoped and is now host-scoped.

`RULE-OPS-003` bounds that: it fails the gate on `privileged: true`, on `network_mode: host`, on `cap_add`,
and on any bind mount whose source lies outside the service directory. `RULE-HYG-003` already fails on a
literal secret where a `${...}` reference belongs.

Neither is a sandbox, and neither is claimed to be. Whoever can merge to `main` can still change what the
services run — they always could, through the application code. What these rules refuse is the narrow set of
edits that convert a container-scoped change into a host-scoped one, quietly, in a file that reviews skim
because it is mostly YAML.

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

**Rolling back across brief 0066** (the session version): while the older image runs, a password change
ends no session. After rolling forward again, end every session once — see
[Ending sessions](#ending-sessions).

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
> This is one read on one date and it is not amended afterwards: `TZ` was added to the checked-in copy on
> 2026-09-20, after this read, and is therefore drift this paragraph never saw. See *The container clock*.
>
> **Do not read this as a standing guarantee.** It is one read on one date, and the sentence it replaces
> was also true when it was written. Nothing continuously compares the host against the checked-in copy
> (`RISK-OPS-002`); CI has no host access, so this paragraph starts ageing the moment it is committed.

The healthcheck is Docker's opinion of one container. Since 2026-09-20 `/health` is also read from outside,
once per deploy, by the `verify-deploy` job — after it has established that the commit answering is the one
just pushed. That ordering is the whole point: a healthy container serving the *previous* image is what a
silently failed deploy looks like, and a health probe alone cannot tell the two apart. See
[*What says the deploy actually happened*](#what-says-the-deploy-actually-happened).

## The container clock

The backend service declares **`TZ=Europe/Berlin`** in
[`ops/deploy/docker-compose.yml`](../ops/deploy/docker-compose.yml). It is not application configuration:
no `Settings` field reads it, so it is not an environment variable in `README`'s sense and `RULE-SURF-002`
does not apply to it. libc reads it, and both the backend process and the `task` binary it spawns follow.

It decides one thing — **which calendar day a stored timestamp falls on**. Taskwarrior stores UTC and
interprets a bare `YYYY-MM-DD` in the local zone, and every day question the API answers asks the same
question back: overdue, due today, a tickler task returning, the `due_before` / `due_after` filters, and
the review's "today". `task_service._now()` is the single clock behind all of them.

On the image's default UTC, that answer is one day behind Berlin between local midnight and 02:00 — CET is
UTC+1, CEST UTC+2. A task the user entered as due *today* is stored at 22:00 or 23:00 UTC on the previous
day, so a server thinking in UTC reads it back as due yesterday and reports it overdue, and a task whose
`wait` date has just passed returns on the wrong day. The users are in Berlin; the server now is too.

**A zone is two offsets, not one.** Berlin is UTC+1 in winter and UTC+2 in summer, so the clock has to
carry the zone's *rules*: `task_service._zone()` resolves `TZ` to a `ZoneInfo`, and `_local_day()` asks it
for the offset that held at the stamp's own instant. Reading a stamp with a snapshot of *today's* offset —
which is what `datetime.now().astimezone().tzinfo` is — puts every timestamp from the other half of the
year a calendar day out, which is the same off-by-one this section exists to remove, made permanent for
half the tasks instead of two hours a night.

**Nothing else moves with it.** The JSON log lines, the audit log and the JWT expiry all ask for UTC by
name (`datetime.now(tz=UTC)`), which is what the rest of this document promises. The container tier pins
all of it: `TestTheBerlinZone` in
[`backend/tests/container/test_real_task.py`](../backend/tests/container/test_real_task.py) checks that
the runtime image carries `/usr/share/zoneinfo/Europe/Berlin` at all — without tzdata a `TZ` value leaves
the process on UTC silently — that a bare due date and the day logic agree on the Berlin day at 23:30 UTC,
that the same stamp reads as the day before under UTC (the defect this removes), that a summer and a
winter stamp each keep their own day, and that the log and audit stamps stay UTC in a Berlin container.

**The declaration itself is held by a test, not by a gate rule.** Every zone test sets `TZ` for itself, so
deleting the line from the deploy compose would otherwise leave the suite green while production went back
to UTC. `TestTheServersZone` in
[`backend/tests/unit/test_task_service.py`](../backend/tests/unit/test_task_service.py) reads
`ops/deploy/docker-compose.yml` and fails if the `backend` service stops declaring `TZ=Europe/Berlin`.

Changing the zone is a behaviour change for every user, not a preference: it moves which tasks a review
calls overdue. It belongs in a reviewed commit to the deploy compose, like any other topology change.

`TZ` was added to the checked-in compose on **2026-09-20**, after the host read recorded under *Health*
above. Like the `logging:` blocks it is drift until a deploy applies this file to the host, and nothing in
CI can see that it did (`RISK-OPS-002`): confirming it is a production read, owed once after the next
deploy, not a gate result.

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
| the redaction filter (runtime) | a JWT, a bcrypt hash, an Argon2id hash, an API key (`rwk_…` and the legacy 43-character one) and the resolved `JWT_SECRET` **anywhere in the line**, whatever it is called, plus any field whose name says credential | a value with no recognised shape under a name that does not say credential — a plain password, for one |

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

### The size of the audit log

Since brief 0073 the backend measures the file at boot and every hour and logs one line:

```
INFO    audit store size  audit_db_bytes=…  audit_db_high_water_bytes=…  audit_db_warn_bytes=104857600
WARNING audit store size  …  hint="over AUDIT_DB_WARN_BYTES; nothing prunes it …"
```

`audit_db_bytes` is `audit.db` plus its `-wal` and `-shm` files; `audit_db_high_water_bytes` is the largest
size ever measured, kept in the file's own `audit_meta` table, so it still says how large the store was after
an archive or a `VACUUM`. The threshold is `AUDIT_DB_WARN_BYTES` (README). Watch for the WARNING:

```sh
# on the deploy host
docker compose logs backend | grep '"audit store size"' | tail -1
```

**What to do at the warning is not automated, on purpose.** How long audit rows must be kept — and which
must outlive that, because a revocation, a role change or a storage migration is evidence — is the
operator's decision (gate D7 of the remediation plan, [ADR 0047](adr/0047-audit-retention-and-versioned-migrations.md)
Decision 1, which also lists what the eventual retention job must respect). Until it is taken nothing in
this repository deletes, archives or vacuums a row. Free space on the partition is the operator's to watch
(`df -h /opt/services/runway`).

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
# every disclosure of a legacy API key in cleartext (finding SEC-5; only the deprecated GET, until the
# legacy cutoff), most recent first
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

## Schema migrations

`init_db()` runs at every start (ADR 0025, ADR 0047). First the **additive baseline** — the frozen list of
`ALTER TABLE` statements every historical database needs — then the **versioned steps**, each applied once,
in one transaction, and recorded in `schema_migrations`:

```sh
# on the deploy host: which version is this database at?
cd /opt/services/runway
sqlite3 users.db 'SELECT version, name, datetime(applied_at, "unixepoch") FROM schema_migrations;'
```

The boot also says it: one INFO line `schema migration applied` (with `schema_version`) the first time a
step runs, and `GET /api/skill` reports `server.schema_version`, which `verify-deploy` compares with the
`-- schema_version` line of `ops/surfaces/db-schema.sql`.

**Version 1 — `users` in one declared shape** (brief 0073). The table is rebuilt with the same columns and
data, a `CHECK (role IN ('user', 'admin'))`, and without the `UNIQUE` on `api_key` that only fresh databases
had. Ids and the id sequence are kept; every index and trigger is re-created. `role` NULL or empty becomes
`user`. **A role that is neither refuses the step**: the boot continues at version 0 and logs

```
ERROR schema migration refused  migration_version=1  migration_error="N account(s) carry a role ..."
```

and `verify-deploy` fails on `schema_version`. Find and fix the rows, then restart the backend — the step
runs again at the next boot:

```sh
sqlite3 users.db "SELECT id, role FROM users WHERE role NOT IN ('user', 'admin');"
sqlite3 users.db "UPDATE users SET role='user' WHERE id=<id>;"   # or 'admin', deliberately
docker compose restart backend
```

**Rollback.** The previous image boots on a rebuilt database and serves it unchanged: it ignores
`schema_migrations`, and its additive loop finds every column present. Rolling forward again does not re-run
a step. Taking a copy of `users.db` before the first deploy of a new step stays the rule (plan §7).

**Version 2 — the API-key contract — is not shipped.** It drops `users.api_key` after the legacy cutoff
(2027-01-15) and its soak, in its own change (ADR 0044).

## Moving task storage off the username

Finding SEC-001, [ADR 0043](adr/0043-account-identity-and-taskwarrior-storage.md), brief
[0065](briefs/0065-account-identity-is-not-a-storage-path.md). Since that change a new account's tasks
live in `data/<storage_id>/`. Accounts created before it keep `users.storage_layout='legacy'` and their tasks
in `data/<username>/` until this procedure has run; the default `TASK_STORAGE_MODE=compat` serves them from
there only when the name is one path component that is, in exactly that spelling, a directory directly under
`data/` (`SHIM-SEC-007`, expires 2027-02-28). Compat refuses, until `apply` has moved them, legacy names of 32 hex
characters, names of the form `.<32 hex>.…` (the migration's own staging and set-aside directories) and
`audit.db*`; the dry run in step 2 lists them as `blocked` or `ready` before anything is deployed.

Nothing below has been run against production by this repository. Each step is the operator's, on the deploy
host, and none of them copies a task, a token or a password into a ticket, a chat or a log.

**1. Before anything — baseline (plan milestone M0).**

- Is registration open? `sqlite3 users.db "SELECT value FROM site_settings WHERE key='allow_registration'"`.
  If `true`, close it (`PUT /admin/settings`, or Settings in the web UI) until step 5 — containment, not the fix.
- Record the running commit (`GET /health`), the image digests (`docker compose images`), the process UID
  (`docker compose exec backend id -u`) and the mount permissions of `data/`.
- **The filesystem under `data/` is case- and normalisation-sensitive** (ext4 is; APFS and a Docker Desktop
  bind mount on macOS are not): `mkdir data/.probe-a && test ! -e data/.probe-A; rmdir data/.probe-a` must
  succeed. On a folding filesystem `ALICE` opens `alice`'s directory. Compat and the migration both refuse
  that, but only a sensitive filesystem makes it impossible.
- Take an **encrypted backup** of `users.db`, `data/audit.db` and every directory under `data/`, and restore it
  once into a scratch directory to prove it restores. This is the rollback point after a write (step 4).

**2. The dry run.** The backend can keep running for this; it changes nothing.

```sh
docker compose run --rm --no-deps backend python -m app.services.storage_migration plan
```

One line per account: `user <id>  <status>  <files> files <bytes> bytes  <legacy path> -> <storage id>`, paths
relative to `DATA_ROOT`, no task text. Statuses: `done` (already in the new layout), `ready` (will be copied),
`blocked` with a reason. Exit 1 when anything is blocked. **Exit 3 when `DATA_ROOT` does not exist or is not a
directory** — the tool never creates it, so an unmounted volume cannot be "migrated" onto an empty root. **A legacy
account without `data/<username>/` is `blocked`** (`no legacy directory; pass --provision-missing …`): every earlier
image created that directory at registration, so its absence means a wrong root or a lost volume — check the mount
and the backup first. Only once you know the store is really gone, `plan --provision-missing` reports it as
`provision` and `apply --provision-missing` gives it an empty store. An error reading one account's tree (an
unreadable file: `tree contains an unreadable entry`) or copying it (`copy failed: ENOSPC`) blocks that account
only, with no path in the output; the others go on. **`blocked: alias of another account's directory` is a possible incident** — two account names open
the same directory (compared by inode, so `ALICE`/`alice` on a case-insensitive filesystem counts, and so does a
legacy name equal to another account's storage id), so one account may have read or written the other's tasks. Lock the accounts concerned,
keep the originals untouched, and follow the incident process; do not "fix" the directory. Every other blocked
reason (a symlink, a hard link, a special file, a foreign owner, a name that is not one component, a target with
other content, `store is spelled differently on disk`) stops that account only, and needs a human decision before
it is retried.

**3. Apply, with the backend stopped** — a live SQLite store copied while it is written is not a copy.

```sh
docker compose stop backend
docker compose run --rm --no-deps backend python -m app.services.storage_migration apply
docker compose start backend
```

`apply` copies each `ready` account into a staging directory, verifies every file's size and SHA-256 against
the source, renames it into place, re-verifies, and only then switches the account. **The legacy directory is
never modified or removed.** It writes a row per account to `users.db`'s `storage_migrations` table and a
`storage.migrated` row to the audit log. It is safe to run again: `done` accounts are skipped and an interrupted
run is completed. `--user-id N` limits it to one account; `--json` prints one JSON document.

**4. Rolling back one account.** Only while the new store has not been written to since the copy, and only with
`TASK_STORAGE_MODE=compat` (the tool refuses in `strict`, where a legacy account is a 500):

```sh
docker compose run --rm --no-deps backend python -m app.services.storage_migration rollback --user-id N
```

The copy the account no longer uses is renamed to `data/.<storage_id>.rolled-back.<timestamp>/` — kept, not
deleted; it goes with the contract step. The account is served from `data/<username>/` again, and **may be
migrated again later**: the next `apply` copies the legacy store afresh, including whatever was written to it
after the rollback. (A copy a rollback could not set aside is recognised by its recorded manifest and replaced
the same way; any other existing `data/<storage_id>/` still blocks.)

An account `apply --provision-missing` provisioned rolls back the same way while its store is still the bare
`.taskrc` template (nothing written); it is then a legacy account without a directory again, as `plan` found it.

**After a write to a migrated store, rollback refuses**, and the way back is the backup from step 1 or a
forward fix. **Redeploying the previous image after a migration serves the frozen legacy copy**: every task
written since the migration would seem lost (it is still in `data/<storage_id>/`). **It also leaves every account
without a legacy directory without task access** — accounts registered after this deploy and accounts `apply`
provisioned: the previous image looks in `data/<username>/`, finds nothing, and answers 500 until the new image
is rolled forward (their data is untouched). List them before rolling back:

```sql
SELECT id FROM users WHERE storage_layout='storage_id'
  AND id NOT IN (SELECT user_id FROM storage_migrations WHERE action='migrated');
```

Keeping registration closed (step 1) keeps the first group empty. Prefer fixing forward.

**5. The switch.** When `plan` reports every account `done`: set `TASK_STORAGE_MODE=strict` in the host `.env`
and restart. The deploy compose passes the variable into the container (`TASK_STORAGE_MODE=${TASK_STORAGE_MODE:-compat}`);
**check that it took** — the running backend's startup line must say `strict`:

```sh
docker compose logs backend | grep '"startup complete"' | tail -1   # ... "task_storage_mode": "strict"
```

A legacy account is then refused with 500 and a `storage.refused` audit row:

```sql
SELECT recorded_at, actor, detail FROM audit_events WHERE event = 'storage.refused' ORDER BY id DESC;
```

Registration may be reopened once the commit running in production has its container tier green in CI.

**6. Contract — not yet, and not by hand.** Removing `data/<username>/` directories is its own change, after
`strict` has run for 14 days and one migrated account has been restored from the backup. Until then the legacy
directories are the rollback source; the backup still has to include them.

## API keys

Since brief 0070 (`WAIVER-SEC-003`, ADR 0044 Decision 6) a key is `rwk_<key id>_<secret>`, stored only as a
SHA-256 in the `api_keys` table of `users.db`, and shown once — nobody, operator included, can read one
back. Keys issued before 2026-11-25 (43 characters, kept in cleartext in `users.api_key`) were hashed into
`legacy` rows at the first boot of this image and authenticate by that hash only, **until the legacy
cutoff**: `API_KEY_LEGACY_CUTOFF`, default and latest `2027-01-15` (00:00 UTC). The startup line carries
the effective date as `legacy_key_cutoff`; a later or malformed value is ignored with a `WARNING`.

**Before the cutoff — who has not moved yet** (counts and names only; the query selects no key):

```sh
sqlite3 -header -column users.db "
  SELECT u.username, datetime(k.last_used_at, 'unixepoch') AS legacy_last_used
  FROM api_keys k JOIN users u ON u.id = k.user_id
  WHERE k.kind = 'legacy' AND k.revoked_at IS NULL ORDER BY k.last_used_at DESC;"
```

Tell those users to create a new key in Einstellungen → API-Key and put it where the old one was. Moving
the cutoff earlier (once that list is empty, or in an incident) is `API_KEY_LEGACY_CUTOFF=<YYYY-MM-DD>` in
the host `.env` and a redeploy; it cannot be moved later. The boot after the change also moves the
`expires_at` of every live legacy row to the new date, so the settings page announces the day the key
really stops working. That is one-way: moving the setting back later again does not extend those rows.

**On the cutoff day — restart the backend once** (`docker compose up -d --force-recreate backend`, or any
deploy). Authentication refuses legacy keys from 00:00 UTC without it; the boot is what **revokes every
legacy row and empties `users.api_key` in every row**, so that the file holds no cleartext key. Check:

```sh
sqlite3 users.db "SELECT COUNT(*) FROM users WHERE api_key IS NOT NULL;"   # 0 after that boot
```

**Backups.** Every backup of `users.db` taken before the cutoff holds the legacy keys in cleartext; until
the cutoff they are working credentials, after it they are refused. Protect those backups as credentials
until then, and replace them by the retention policy afterwards. **A restored backup** is opened by a boot,
and a boot after the cutoff empties the column before the first request; before the cutoff, a restore
brings the restored keys back as valid legacy keys — and restores revocations made since then as undone.
After a restore, end every key that was revoked since the backup again (below).

**Rollback.** Until the contract step the previous image still reads `users.api_key`, so a rollback
inside the window keeps legacy keys working; keys created with this image (`rwk_…`) do not work under the
previous image. **Every rollback, before the cutoff as after it, re-mints cleartext keys:** the previous
image's boot gives every row whose `users.api_key` is NULL a fresh cleartext key — every account registered
under this image, and every account whose legacy key was revoked or rotated here — and its
`GET /auth/apikey` returns that key to the account. While the previous image runs, those keys work and lie in
`users.db` and in every backup taken then. **After rolling forward**, this image's boot imports nothing for
those accounts: `users.api_key_closed_at` marks the account as closed, and the boot empties its column
instead (brief 0070, review round 1). A key one of them obtained from the previous image therefore stops at
the roll-forward; the user creates a new one. An account that never met this image — one with
`api_key_closed_at` NULL, including one the previous image registered during the rollback — keeps its key as
a legacy key until the cutoff, and a regenerate by the previous image replaces that account's legacy key.
Check after the roll-forward boot that the closed accounts hold no cleartext:

```sh
sqlite3 users.db "SELECT COUNT(*) FROM users WHERE api_key IS NOT NULL AND api_key_closed_at IS NOT NULL;"  # 0
```

Backups taken while the previous image ran hold those re-minted keys; after the roll-forward they are not
credentials to this image, but they are to the previous one — replace them by the retention policy.
**Do not roll back past this image after the cutoff** unless you accept that re-minting for every row. The
cutoff is never rolled back.

### Ending API keys

One key: Einstellungen → API-Key → Widerrufen, or `DELETE /api/auth/apikeys/{key_id}` with a session. Every
key of one account (an incident; the account's owner does it with the deprecated
`POST /api/auth/apikey/regenerate`, or the operator on the host):

```sh
sqlite3 users.db "
  UPDATE api_keys SET revoked_at = strftime('%s','now')
    WHERE revoked_at IS NULL AND user_id = (SELECT id FROM users WHERE username = 'alice');
  UPDATE users SET api_key = NULL, api_key_closed_at = COALESCE(api_key_closed_at, strftime('%s','now'))
    WHERE username = 'alice';"
```

Without the `WHERE … username` / `user_id` conditions the same two statements end every key of every
account. A revoked key stays revoked (trigger `api_keys_revocation_is_final`). Who used which key last is
`last_used_at` (to the minute); `auth.apikey.created` and `auth.apikey.revoked` in the audit log name the
public key id, never the key.

## The signing key: `JWT_SECRET`

Tokens are HS256, always (ADR 0046); the key is `JWT_SECRET` from the host `.env`, and nothing in this
repository ever holds a real one. **Generate it, never type it:**

```sh
openssl rand -base64 48
```

The backend refuses to start (finding SEC-002, brief 0072) on an empty value, fewer than 32 characters,
any value published in this repository or one that reads like a placeholder, a public key (PEM, OpenSSH, a
JWK or JWK set, DER or an uncompressed EC point in hex or base64, or anything PyJWT refuses as an HMAC key),
a value that is mostly repetition or a run, or an estimated entropy under 80 bits — and on `JWT_ALGORITHM`
set to anything but `HS256`. A raw Ed25519 key or a compressed EC point is *not* recognised (it looks like
random bytes): generating the key is what rules those out. The refusal names the reason and never the value.

**Before merging a change with new startup checks** (brief 0072 is one), run them against the host's
environment — merging to `main` deploys with no manual step, so after the merge is too late. Run it through
compose from the service directory, so the check sees exactly the environment the backend gets: compose
interpolates `JWT_SECRET=${JWT_SECRET}` from the `.env` beside it (stripping quotes and a trailing comment)
and passes nothing else from that file — `docker run --env-file` reads the `.env` by different rules and
can answer for a value production never sees. It prints `ok` or the reason, never the secret, and touches
no data.

*Before the merge* the new image does not exist yet, so mount the branch's two checking modules over the
deployed image's copies (both are self-contained: the standard library, `pydantic-settings` and PyJWT's
`HMACAlgorithm`, all in the deployed image):

```sh
# from a checkout of the branch, on your machine
scp backend/app/startup_checks.py backend/app/config.py <host>:/tmp/runway-check/
# on the host
cd /opt/services/runway
docker compose run --rm --no-deps \
  -v /tmp/runway-check/startup_checks.py:/app/app/startup_checks.py:ro \
  -v /tmp/runway-check/config.py:/app/app/config.py:ro \
  backend python -m app.startup_checks
rm -r /tmp/runway-check
```

*After a deploy* (or for a rollback target), the image carries the checks itself:
`RUNWAY_SHA=<sha> docker compose run --rm --no-deps backend python -m app.startup_checks`.

If it refuses, rotate (below) before the merge. While there, remove a `JWT_ALGORITHM` line if the `.env`
has one: it chooses nothing any more and goes with `SHIM-SEC-010`.

**Rotating it** ends every session of every account at once — every JWT was signed with the old key — and
leaves API keys, and so agents and MCP clients, untouched. Replace the value in the host `.env` with a newly
generated one and recreate the backend container. Ending sessions without rotating is cheaper and usually
what you want (next section); rotate when the key itself may be known — a leaked `.env`, a backup of it, a
log line that should not exist.

## Ending sessions

Since brief 0066 (finding REV-001, ADR 0044) every JWT carries the account's `users.auth_version`, and
`get_current_user` refuses a token whose version is not the stored one. `PUT /auth/password` raises it,
which is how a password change ends every other session. API keys are **not** touched by any of this.

**End one account's sessions** — a suspected stolen token, a lost device — on the host, with the backend
running (the next request with an old token is 401; nothing needs restarting):

```sh
sqlite3 users.db "UPDATE users SET auth_version = auth_version + 1 WHERE username = 'alice';"
```

**End every session of every account** — the global event, e.g. after a rollback (below) or when tokens may
have leaked from a log. Cheaper than rotating `JWT_SECRET` and leaves agents on API keys running:

```sh
sqlite3 users.db "UPDATE users SET auth_version = auth_version + 1;"
```

The version can only go up (trigger `users_auth_version_monotone`); a statement that lowers it fails. If
a key may be compromised too, end it as well (Einstellungen → API-Key → Widerrufen, or *Ending API keys*
below) — a password change deliberately does not.

**The deploy that introduces it.** Tokens issued by the previous image have no `auth_version`. For one
`JWT_EXPIRE_HOURS` after this image first boots they are accepted as version 1 (`SHIM-SEC-008`); after that
none qualifies, with no action. When that is (UTC epoch seconds, plus `JWT_EXPIRE_HOURS`):

```sh
sqlite3 users.db "SELECT value FROM site_settings WHERE key = 'auth_version_expand_at';"
```

After the deploy, check with a **synthetic** account (never a real user's credentials): log in twice, change
the password with the first token, and confirm the second token gets `401` on `GET /api/auth/me` while the
token in the change's response gets `200`.

**Rollback.** The previous image ignores `auth_version`: while it runs, a password change ends no session
(REV-001 is open again) and nothing else breaks. **After rolling forward, run the global statement above
once**, so a token that should have been revoked during the rollback is not valid again. Users log in once
more; that is the price.

**Restoring `users.db` from a backup** brings back the `auth_version` values *and the password hashes*
from the moment of the backup. Every revocation made since then is undone: a token that a later password
change or the per-account `UPDATE` above had ended carries the restored version again and is accepted
until it expires, and the old password logs in again. The monotone trigger cannot prevent that, because
a restore replaces the file and runs no `UPDATE`. **After every restore, run the global statement above
once, before the app serves traffic**, and tell the users whose password changed after the backup that
their old password is back.

## The login budget

Since brief 0069 (findings SEC-8, REV-003; `docs/security.md`, *Login throttling*) `POST /auth/login`
reserves a slot in three budgets — per username, per network source, in total — before any password work,
and answers 429 when one is full. The counters are in the backend's memory: **a restart clears every
lockout**, which is also the fastest way to lift one for a real user. API keys are never throttled.

**What a lockout looks like in the audit log.** One `auth.login.throttled` row per locked key and window,
not one per request; each says how many refused attempts it stands for. Account rows name the attempted
username; source and global rows name nothing (no address is ever recorded).

```sh
# refused attempts by tier and account over the last day
sqlite3 -header -column data/audit.db "
  SELECT actor,
         substr(detail, instr(detail, 'by the ') + 7,
                instr(detail, ' budget') - instr(detail, 'by the ') - 7) AS tier,
         SUM(CAST(substr(detail, instr(detail, 'refusals: ') + 10,
                         length(detail) - instr(detail, 'refusals: ') - 10) AS INTEGER)) AS refused,
         MAX(recorded_at) AS last_seen
  FROM audit_events
  WHERE event = 'auth.login.throttled' AND recorded_at >= strftime('%Y-%m-%dT%H:%M', 'now', '-1 day')
  GROUP BY actor, tier ORDER BY refused DESC;"
```

Rows written before brief 0069 have the old detail `locked out, retry in Ns` and no count: one row per refusal.

**`TRUSTED_PROXIES` in production** — not set by this repository, because which addresses Traefik and nginx
have on `traefik-public` is a fact of the host. **Set it on the host before the deploy that ships brief
0069**, not after. Until it is set, nginx's address is a private one nobody declared, so it is not counted as
a source at all: the source tier is off, the boot logs a `WARNING` (`TRUSTED_PROXIES is not set`), and a
spray is bounded only by the account budget per name and the global brake (300 failures per five minutes,
after which every account's password login is refused for as long as the spray continues). Counting nginx's
address instead would have let any one client lock every account out with 30 wrong logins. To set it:

1. On the host, list the network's members: `sudo docker network inspect traefik-public --format
   '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{"\n"}}{{end}}'`. Note the Traefik container's address
   and the runway frontend's (nginx). Container addresses on a user-defined network can change on recreate;
   if the network has a fixed subnet you may list the subnet instead, **but then every container on that
   network is trusted to write `X-Forwarded-For`** — only do that if nothing else on it accepts traffic you
   do not control. **When a listed address drifts** (every merge recreates the frontend), nginx arrives
   from a private address that is not listed. The backend then does not count it as a source at all — the
   source tier is off again, as with `TRUSTED_PROXIES` unset, and a spray is bounded by the account
   budget and the global brake — and logs a `WARNING` `login request from an undeclared proxy` at most
   once per window. Counting it would have made every client one budget of 30. After each deploy, check
   the log for that line (`sudo docker compose logs backend | grep 'undeclared proxy'`); if it is there,
   repeat this step with the new address.
2. Add `TRUSTED_PROXIES=<traefik address>,<nginx address>` (or the subnet) to `/opt/services/runway/.env`.
   The deploy compose passes it through (`TRUSTED_PROXIES=${TRUSTED_PROXIES:-}`).
3. `sudo docker compose up -d backend`, then check the boot line: `startup complete` carries
   `login_trusted_proxies` (how many entries were accepted), and an ignored entry logs an `ERROR`
   `TRUSTED_PROXIES entries ignored`.
4. Confirm Traefik sets `X-Forwarded-For` to the client address and does not forward a client's own
   (`forwardedHeaders.insecure` off, no `trustedIPs` for the internet) — that is Traefik's configuration,
   outside this repository.

A wrong value fails safe in one direction only: an address that is not a proxy is never trusted unless
listed, but a listed address is believed. Rolling back to an image before brief 0069 ignores the variable.

**Recovery after a suspected credential compromise** needs both credentials: a password change (or the
`auth_version` bump in *Ending sessions*) ends JWT sessions, and *Ending API keys* ends the
API keys. The login budget protects neither once the attacker holds one.

**The budgets' other variables.** `LOGIN_RATE_LIMIT`, `LOGIN_RATE_WINDOW_SECONDS`, `LOGIN_SOURCE_RATE_LIMIT`,
`LOGIN_GLOBAL_RATE_LIMIT` and `LOGIN_RATE_MAX_KEYS` are passed through by both compose files with the
README defaults, so a value in `/opt/services/runway/.env` takes effect on `docker compose up -d backend`.
During a sustained global lockout, raising `LOGIN_GLOBAL_RATE_LIMIT` buys real users room at the price of
more guesses; an API key and `make grant-admin` on the host keep working throughout.

**The re-open trigger (`RISK-SEC-003`).** The budgets hold only while one backend process serves every login.
`backend/tests/unit/test_login_budget.py` (`TestTheSingleWorkerAssumption`, `TestTheSingleWorkerPinIsWholeFile`)
fails if the Dockerfile's CMD stops pinning `--workers 1`, the Dockerfile sets `WEB_CONCURRENCY`, an
`ENTRYPOINT` or gunicorn, or either compose file sets `WEB_CONCURRENCY`, `replicas`, `scale` or `--workers`.
It reads the files; a host that starts the image some other way is outside what it can see. If that test goes red, do
not adjust it: a limiter shared by every worker — Traefik's rate-limit middleware at the edge, or a counter in
a store all workers use — has to exist first.

## MCP

Since brief 0071 (findings REV-004, REV-005; ADR 0045) the MCP endpoint (`/api/mcp`) is **stateless**: it
issues no `Mcp-Session-Id` and keeps nothing between requests, so a restart or deploy loses no MCP state
(there is none) and clients need no reconnect logic beyond retrying a request. `GET` and `DELETE` on it
answer `405` by design.

**Capacity.** Every MCP request takes a slot before any work: at most `MCP_MAX_INFLIGHT` (32) at once in
total and `MCP_SOURCE_MAX_INFLIGHT` (8) per network source — the source as for the login budget, so with
`TRUSTED_PROXIES` unset every client behind nginx counts against the total only — and requests without a
credential header at most a quarter of the total (presence, not validity: a made-up header escapes the
share, not the two ceilings; `RISK-MCP-002`). Above that: `503` (total) or `429` (source), `Retry-After:
1`. A request longer than 30 seconds is cancelled and answered `504`. Both compose files pass the two
variables through; raise them in `/opt/services/runway/.env` and `docker compose up -d backend`. Like the
login budget they are per process (`RISK-SEC-003`).

**What it is doing.** The backend logs one INFO line `mcp budget` at most once an hour, and a WARNING
`mcp budget: a request was refused for capacity` at most once in five minutes, each with `mcp_counters`:
`served_with_header`, `served_anonymous`, `refused_source`, `refused_global`, `refused_anonymous_share`,
`refused_unbound_target`, `timed_out`, `inflight`, `inflight_anonymous`,
`live_transports`. Integers only — no caller, address, header or argument. `live_transports` above zero
with no traffic would mean a torn-down request left a server task behind: report it. A
`MCP tool call refused: it does not reach its own route` WARNING names a tool whose argument tried to
address another route (REV-005); it is refused before the credential is looked up.

```sh
sudo docker compose logs backend | grep '"mcp budget' | tail -5
```

**Anonymous discovery is still open** (`RISK-MCP-002`): the handshake and the tool list are served
without a key; every tool call needs one. `served_anonymous` in the summary line says how much of the
traffic lists tools without a key — evidence for the planned switch that requires a credential on the
handshake (ADR 0045, deferred).

**Rollback.** The previous image is stateful again and ignores the two variables; nothing on disk
changed, so rolling back and forward is free. It also reopens REV-005 (a `..` path argument reaching
REST-only routes) for as long as it runs.

## Password hashing: Argon2id and the bcrypt migration

Since brief 0067 (finding SEC-006, ADR 0044 Decision 5) new passwords are hashed with Argon2id; the
bcrypt hashes passlib wrote before are still verified (`SHIM-SEC-009`) and replaced on login. Nothing in
this section needs a setting or a deploy: every step is dated from the image's first boot.

**When the timeline started** (UTC epoch seconds):

```sh
sqlite3 users.db "SELECT value FROM site_settings WHERE key = 'password_kdf_expand_at';"
```

| From | What happens |
|---|---|
| first boot | Policy (a new password 8–1024 bytes, no NUL; a typed one at most 4096, the previous image's bound), body limits (16 KiB on `/auth/*`, 1 MiB elsewhere) and uniform login work apply. **New and changed passwords are still bcrypt** — the soak — and so must be **shorter than 72 bytes** until Switch 1 (422 otherwise): bcrypt would store a longer one truncated, and any password with the same first 72 bytes would log in to it. |
| + 7 days | **Switch 1.** New and changed passwords are Argon2id; an exact bcrypt login is rehashed (`auth.password.rehashed` in the audit log). |
| + 67 days | **Switch 2.** A bcrypt login with a password of 72 bytes or more is refused; those accounts need the reset below. |

**Before Switch 1, measure on this host** — the parameters were measured on a development machine, not here.
Two budgets: **250 ms and 64 MiB per Argon2id verification**, and **500 ms per login** — until the contract
step every login also runs a bcrypt check at cost 12 (against the stored hash or a dummy, so that an
unknown account costs the same), and that part is about twice the Argon2id one:

```sh
docker compose exec backend python -m app.auth
```

It prints the median of each part and of a whole failed login, and `within budget` or `OVER BUDGET`. If
either is over, lower `ARGON2_TIME_COST` in `backend/app/auth.py` (never the memory below 19 MiB or the time
below 2 — the OWASP floor, held by a test) and deploy. The bcrypt cost cannot be lowered: it is fixed by the
hashes already stored.

**Change the Argon2id parameters only before Switch 1**, while no Argon2id hash exists yet. After it, an
account whose hash is still at the old parameters is measurably slower (or faster) to refuse than an
unknown account, until it logs in once and is rehashed — a timing oracle for "this account exists and has
not logged in since". If a later change is unavoidable, record it as a residual in the brief of that change
and the threat model until no hash at the old parameters is left (`SELECT COUNT(*) FROM users WHERE
hashed_password LIKE '$argon2id$v=19$m=65536,t=3,p=1$%'` counts the current ones), or reset those accounts.

**How far the migration is** (counts only, no hashes in the output):

```sh
sqlite3 users.db "SELECT substr(hashed_password, 1, 4) AS scheme, COUNT(*) FROM users GROUP BY scheme;"
sqlite3 data/audit.db "SELECT COUNT(*) FROM audit_events WHERE event = 'auth.password.rehashed';"
```

`$arg` is Argon2id, `$2b$` is bcrypt. **Who must change a long password** — every login accepted through a
bcrypt hash for 72 bytes or more, before Switch 2 (passwords of up to 4096 bytes reach this path; a
longer one was refused by the previous image too); tell them, the app already does. Their new password
must differ from the old one in its first 72 bytes — the server refuses it otherwise:

```sh
sqlite3 data/audit.db "SELECT DISTINCT actor FROM audit_events WHERE event = 'auth.login.succeeded' AND detail LIKE 'bcrypt-era password%';"
```

**Operator reset** — the recovery path for an account refused after Switch 2 (an `auth.login.failed` row
whose detail starts `bcrypt-era password`), and for any account still on bcrypt at the contract step.
Confirm the person out of band first. It reads a temporary password twice at a terminal prompt — never on
the command line, so it reaches no shell history — applies the same rule as a password change, and ends
every session of the account (`auth.password.changed`, actor `operator`, in the audit log):

```sh
docker compose exec -it backend python -m app.services.password_reset alice
```

Exit code 0 is done; 1 means no such account; 2 means the two entries differed or the password broke the
rule (nothing changed). During the soak the temporary password is stored as bcrypt, so it must be shorter
than 72 bytes then, and the previous image can still verify it.

Hand the temporary password over out of band and ask the person to change it in Einstellungen at once. The
API key is untouched; rotate it as well if the account may be compromised.

**Rollback.** Within the 7-day soak the previous image verifies every hash this one wrote. **After Switch 1
it cannot verify an Argon2id hash**: passlib raises on an unknown hash, so those accounts get `500` at login
on the previous image while bcrypt accounts keep working. Roll forward to this image or later — the
rollback target after Switch 1 is this image's `:<commit-sha>`, not the one before it — or reset the
affected accounts as above if a roll forward is impossible.

**After a deploy**, with a **synthetic** account: register it with a password of 8 bytes or more; a
7-byte one must get `422`; a 20 KB login body must get `413`; after Switch 1 its stored hash starts
`$argon2id$`.

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

## Defect fixed 2026-11-10: a token for a deleted account was still accepted

Until this date a valid JWT whose account row had been removed from `users.db` was accepted by every
`user` route as if the account still existed — `/tasks` and `/gtd/*` served the old data directory,
`GET /auth/apikey` returned an empty key, `/admin/*` answered 403 — while `GET /auth/me` crashed on the
missing row and answered **500**. Every route now answers **401**, and the web UI goes back to the login
page. There is no route that deletes an account, so the state arises only from removing a row on the host
by hand; no occurrence is known.

What would have caught it: a test that deletes an account and keeps using its token. It exists now
(`TestVanishedAccount`, [brief 0056](briefs/0056-a-vanished-user-gets-401.md)); the defect itself was
found by mypy in Step 2 and carried as `WAIVER-TYPE-001` until its expiry stopped the gate.

## Defect fixed 2026-10-12: a wrong password reloaded the login page without a word

Until this date, logging in with a wrong username or password in the web UI brought the login form back
empty, with no message. The API client treated every 401 as an expired session and reloaded `/login`, and
`POST /auth/login` answers 401 for refused credentials — so "Invalid credentials" was discarded before it
could be shown, and a typo could not be told apart from a broken login. In production from the first
release; the backend refused correctly throughout, and no session or data was affected.

What would have caught it: a test that submits a wrong password and looks at what the user is left with.
The decision is now a pure, tested function (`frontend/src/shared/sessionEnd.js`); the wiring around it
remains under `RISK-TEST-004` ([brief 0045](briefs/0045-a-refused-login-stays-on-the-page.md)).

## Defect fixed 2026-09-19: removing a tag did nothing

Until this date, removing a tag in the web UI, or sending a shorter `tags` list to `PUT /tasks/{uuid}`
over REST or MCP, returned 200 and changed nothing: modify only ever emitted `+tag`, so the removed tag
stayed. A status swap such as someday → next left the task in both lists. `depends` had the same defect
(`depends:X` only adds). It was in production from the first release. No data was lost; affected tasks
simply kept extra tags, which users can now remove.

What would have caught it: a test that removes something. The unit fake removed tags on `-tag`
correctly, but no test ever sent a shorter set and looked at the result. Both tiers now do
([brief 0030](briefs/0030-tags-are-a-full-set.md)).

## Defect fixed 2026-09-19: the web UI could not clear a field, nor anyone a priority

Until this date, emptying a date, the project or the priority in the web UI and saving returned 200 and
changed nothing: the form sent `null` for every empty field, which the API reads as "unchanged". Over REST
and MCP an empty string cleared dates and the project, but a priority could not be cleared at all (`""` was
an invalid priority, 400), and on create `project: ""` was sent through to Taskwarrior. Separately, every
input Taskwarrior itself refused (exit code 2: a bad date, `recur` without `due`) came back as a 500, and
the inbox webhook turned an invalid priority into a 500. In production from the first release; no data was
lost.

What would have caught it: a test that clears something through the same payload the UI builds. The payload
is now a pure, tested function (`frontend/src/shared/taskPayload.js`), and both backend tiers clear every
field ([brief 0031](briefs/0031-empty-string-clears.md)).

## Defect fixed 2026-09-19: the inbox held project tasks, waiting-fors vanished

Until this date `/gtd/inbox` filtered on `-project`, which Taskwarrior 3.5 reads as "not tagged `project`",
not "has no project": every untagged task of a project showed up in the inbox. And every list filtered on
`status:pending`, which on 3.5 excludes a task whose `wait` lies in the future — so a `+waiting` task with a
future wait vanished from `/gtd/waiting`, a project whose only task was parked vanished from `/gtd/projects`,
and nothing listed parked tasks at all. In production from the first release; no data was lost. The inbox
now filters `project:` (empty), waiting and the project list read pending and hidden tasks alike, and
`GET /gtd/tickler` lists the hidden ones.

What would have caught it: the unit fake. It implemented `-project` as "no project" and knew no `wait`, so
the unit tier agreed with the code and the binary was never asked. The fake now models both, and each
claim it makes is pinned against the binary ([brief 0032](briefs/0032-list-semantics.md),
[ADR 0036](adr/0036-list-semantics-against-taskwarrior-3-5.md)).

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
