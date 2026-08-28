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

> **This does not work as written today.** The host's compose file pins `:latest` literally, with no
> variable to substitute — see *The deploy host's topology* below. `export RUNWAY_SHA=...` has no effect,
> and `docker compose pull` will fetch `:latest`, which is the broken build you are trying to escape.

**Rolling back today** means editing the tag on the host by hand:

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

> **These healthchecks do not run in production.** The host uses its own compose file, which declares no
> `healthcheck` for either service and orders `frontend` after `backend` with a plain `depends_on` — which
> waits for *started*, not *healthy*. The defect the healthchecks were added to prevent is therefore still
> live on the deploy host. Copying the two `healthcheck` blocks into the host's compose file closes it.

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

**Why the rule is here before the logging is.** The application has no logging at all today: no
`import logging`, no `getLogger`, no `print()` anywhere under `backend/app/`. So the property holds for
free, and it stops holding in the first commit that adds a logger. Landing the rule afterwards would mean
relying on the reviewer of a large new logging module to notice one interpolated field — which is the review
that never happens.

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

**Transport-independent by construction.** It reads source, not emitted output, so it holds whichever way
structured logging is wired up: a replaced uvicorn access logger, a JSON application logger alongside it, or
both. A rule that inspected emitted lines would need rewriting the day the transport changed.

**What it does not check.** That a credential arriving under a *neutral* name stays out — logging `body`,
`row` or a request object discloses the password with nothing to match on. Nor does it see anything outside
`backend/app/`: a credential logged by a library, by uvicorn itself, or in an exception traceback is beyond
it. Recorded as `RISK-OPS-004`.

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
- **The rollback runbook does not work as written** — the tag is a literal `:latest`. See *Rolling back*.
- **The healthchecks in this repository do not run.** See *Health*.
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
