# Runway

> *In GTD, the "Runway" is where you are right now — the ground level of next actions,
> the things you can actually do today. Before you can reach altitude, you need a clear runway.*

Self-hosted GTD web app built on [Taskwarrior](https://taskwarrior.org/) v3.
Multi-user, mobile-friendly, dark mode. Built by [Agentic Reach](https://agenticreach.com).

---

## Features

- **GTD views** — Inbox, Next Actions, Waiting For, Someday/Maybe, Projects, All Tasks
- **Urgency scoring** via Taskwarrior's algorithm, displayed on every task
- **In Progress** — start/pause tasks with visual highlighting and automatic re-sorting
- **Natural Planning** — 5-step GTD project planning (Purpose → Vision → Brainstorm → Organize → Actions)
- **Projects** — create and plan projects independently of tasks
- **Full task attributes** — priority, due/scheduled/wait/until dates, tags, recurrence, dependencies, annotations
- **Agent-ready** — REST API + MCP server for LLM and automation integration
- Swipe gestures, search/filter, dark mode, per-user data isolation

**The new interface is the default** (06-kombination, [ADR 0042](docs/adr/0042-the-new-ui-coexists-behind-a-switch.md)):
every page opens in it unless the browser chose otherwise. Until the old interface is removed,
open any page with `?ui=alt` (for example `/next?ui=alt`) to use the old one, and with `?ui=neu`
to come back. The choice is remembered per browser, in the `localStorage` key `ui`; a browser
that chose the old interface earlier keeps it until it asks for `?ui=neu`.

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12 · FastAPI · aiosqlite |
| Frontend | Vue 3 · Vite · Tailwind CSS · Pinia |
| Task engine | Taskwarrior 3.x (TaskChampion / SQLite) |
| Auth | JWT · Argon2id · per-user API keys |
| Deploy | Docker Compose |

---

## Getting started

**Prerequisites:** Docker and Docker Compose on a Linux host.

```bash
git clone https://github.com/ulrichschinz/runway.git
cd runway

cp .env.example .env
# Set JWT_SECRET to a long random string:
#   openssl rand -base64 48
```

`.env`:
```env
JWT_SECRET=your-secret-here
ALLOW_REGISTRATION=true
```

**Every setting the application reads.** Only `JWT_SECRET` is required; the rest have working
defaults. `RULE-SURF-002` fails the build if this table and the code disagree in either
direction, so a variable documented here always does something and a variable that does
something is always here.

```env
# Required. The app refuses to start on a default, an empty value, or fewer than 32
# characters. Generate one with: openssl rand -base64 48
JWT_SECRET=

# Seeded into the database on FIRST RUN ONLY. Afterwards the stored value wins and an
# administrator changes it in Settings; editing this variable later does nothing.
ALLOW_REGISTRATION=false

# Promoted to admin at startup ONLY when the database contains no admin at all. It cannot
# override a role set through the app, and it never creates an account.
BOOTSTRAP_ADMIN=

# Browser origins allowed to call the API cross-origin, comma-separated. Empty means none,
# which is correct behind the bundled nginx proxy — the SPA is same-origin there.
CORS_ORIGINS=

# The login budget. Failed (or still running) password verifications allowed per window
# before the API answers 429 — logins and the current-password check of a password change:
# per username (spelling variants count as one), per network source, and in total — the total
# is the emergency brake on password-hashing work, sized from its measured cost. A correct
# password clears its username's count only. The window is in seconds. Requests with an API
# key are not throttled, but a password change made with one is. Both compose files pass all
# five through, with these defaults.
LOGIN_RATE_LIMIT=10
LOGIN_RATE_WINDOW_SECONDS=300
LOGIN_SOURCE_RATE_LIMIT=30
LOGIN_GLOBAL_RATE_LIMIT=300

# The most usernames, and separately the most sources, the limiter remembers at once. A new
# one beyond that is refused with 429 rather than making room by forgetting another.
LOGIN_RATE_MAX_KEYS=10000

# Comma-separated addresses or CIDR networks of the proxies in front of the backend whose
# X-Forwarded-For the login limiter believes (in the shipped setup: nginx and the TLS proxy in
# front of it). Empty believes none: a public peer is then counted as itself, and a loopback
# or private peer — a proxy nobody declared — is not counted as a source at all, so only the
# per-username and total budgets apply (a startup WARNING says so). Set it before deploying.
# A malformed entry, or 0.0.0.0/0, is ignored and reported at startup. See docs/operations.md.
TRUSTED_PROXIES=

# JWT signing algorithm and token lifetime.
JWT_ALGORITHM=HS256
JWT_EXPIRE_HOURS=24

# How much of the log stream is emitted: DEBUG, INFO, WARNING, ERROR or CRITICAL. An
# unrecognised value falls back to INFO rather than refusing to start. The *format* is not
# configurable — logs are always JSON and always pass through the redaction filter.
LOG_LEVEL=INFO

# Which Taskwarrior directory layout is served (ADR 0043). `compat` (the default) still
# serves an account created before the storage-id switch from data/<username>/, if that name
# is, in exactly that spelling, a directory directly under data/; `strict` serves only
# data/<storage_id>/. Both compose files pass it through to the backend. Set `strict` after
# the storage migration reports every account `done` — see docs/operations.md. An
# unrecognised value is treated as `strict`.
TASK_STORAGE_MODE=compat

# Container paths. Change these only alongside the compose bind mounts.
DATA_ROOT=/app/data
DB_PATH=/app/users.db
```

> `PORT` used to be listed here and was read by nothing — the frontend's port is fixed in
> `frontend/nginx.conf` and published by the compose file. Removed in Step 13, which is the
> change that added the check that would have caught it.

```bash
docker compose up -d
```

The app is available at `http://your-host:4000`.
The API is available at `http://your-host:8000`.

Register your first user at the login page (set `ALLOW_REGISTRATION=false` afterwards to lock it down).

## Data persistence

| Path | Contents |
|---|---|
| `./data/<storage_id>/` | Per-user Taskwarrior data (`taskchampion.sqlite3`). The directory is named by a random, immutable id stored in `users.storage_id` — never by the username (finding SEC-001, ADR 0043). |
| `./data/<username>/` | The same, for an account created before that change and not yet migrated. Kept as the rollback source after migration until the contract step removes it. |
| `./data/audit.db` | The audit log |
| `./users.db` | Users, API keys, projects (SQLite) |

Both are bind-mounted and excluded from git. Back them up to retain all data. To move existing
accounts to the storage-id layout, follow
[Moving task storage off the username](docs/operations.md#moving-task-storage-off-the-username).

---

## Authentication

Runway supports two authentication methods, accepted by all API endpoints:

**JWT** — obtained via `POST /api/auth/login`, valid for 24 hours:
```
Authorization: Bearer <token>
```

**Changing the password ends every session.** `PUT /api/auth/password` revokes every JWT of the
account issued before it, on every route and every MCP tool, and answers with a new one for the
caller (`{"detail": …, "access_token": …, "token_type": "bearer"}`); a client that keeps using its
old token gets `401`. API keys are not affected by a password change — rotate them with
`POST /api/auth/apikey/regenerate` if they may be compromised.

**Passwords** are hashed with Argon2id and limited in **UTF-8 bytes**: a password being set
(`POST /api/auth/register`, `PUT /api/auth/password`) is 8 to 1024 bytes and may not equal the
current one in its first 72 bytes when that one is a bcrypt-era long password; one being typed to
log in or as the current password at most 4096 (the bound the previous version had). A password outside the rule is refused with `422` before any work is
done; a request body over 16 KiB on `/api/auth/*` (1 MiB elsewhere) with `413`. A login keeps no
minimum, so an older short password still works. Passwords set before 2026-11 were hashed with
bcrypt, which read only their first 72 bytes; a login with such a password of 72 bytes or more
answers `"password_change_required": true` beside the token — set a new password then, because
after a transition window that login is refused. Every failed login is the same
`401 Invalid credentials`, whether or not the account exists.

**API key** — permanent, per-user, managed in the app settings:
```
X-Api-Key: <key>
```

API keys are ideal for agents and automations. Each user can view and rotate their key via `GET /api/auth/apikey` and `POST /api/auth/apikey/regenerate`.

---

## Agent & automation integration

### Inbox endpoint

Any agent can add a task to a user's inbox without a login flow:

```bash
curl -X POST https://your-host/api/inbox \
  -H "Authorization: Bearer <api-key>" \
  -H "Content-Type: application/json" \
  -d '{"description": "Follow up on proposal", "priority": "H"}'
```

The task lands in that user's GTD inbox, ready for processing.

### MCP server

Runway exposes a full [Model Context Protocol](https://modelcontextprotocol.io) server over
**Streamable HTTP**, at **`/api/mcp`** — the same `/api` prefix every REST call uses, because
the backend is only reachable through it. Any MCP-compatible client (Claude Code, Claude
Desktop, custom agents) can manage tasks directly.

> The URL and the transport here were both wrong until 2026-09-18, and the server they
> described could not complete a handshake at all. If you are carrying an older snippet —
> `type: sse` pointed at `https://your-host/mcp` — replace it; that one never worked. See
> [ADR 0033](docs/adr/0033-the-mcp-server-nobody-could-connect-to.md).

**Claude Code** — add to `.mcp.json` in your project, or run the equivalent command:
```json
{
  "mcpServers": {
    "runway": {
      "type": "http",
      "url": "https://your-host/api/mcp",
      "headers": {
        "X-Api-Key": "<your-api-key>"
      }
    }
  }
}
```
```sh
claude mcp add --transport http runway https://your-host/api/mcp \
  --header "X-Api-Key: <your-api-key>"
```

**Claude Desktop** — its config file takes local commands rather than URLs, so a remote
server is reached through the [`mcp-remote`](https://www.npmjs.com/package/mcp-remote)
wrapper. Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "runway": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "https://your-host/api/mcp",
        "--header", "X-Api-Key:${RUNWAY_API_KEY}"
      ],
      "env": { "RUNWAY_API_KEY": "<your-api-key>" }
    }
  }
}
```

Both credential shapes work — `X-Api-Key: <key>` and `Authorization: Bearer <key>` — because
`backend/app/main.py` forwards both into the tool call. Prefer `X-Api-Key`: the Bearer form is
`SHIM-SEC-006`, a dated compatibility shim, and it will stop working when the shim is removed.
The MCP endpoint itself is open — anyone who can reach it may list the tools — but every tool
call is authenticated by the REST endpoint behind it (`RISK-MCP-002`).

The MCP tools are an **allowlist** of the REST API: every operation of the `tasks`, `gtd`,
`projects` and `inbox` routers, plus `GET /health` and `GET /auth/me`. Login, registration,
API-key, profile, password, user and admin operations are **REST-only** — an agent session
holding a key cannot read the key back or rotate it, and a new router is not a tool until it is
added to the list in `backend/app/main.py` (ADR 0037). **The tool names are FastAPI operation ids** — the
handler function name, then the path, then the method — not the bare function names this
section claimed until Step 13, none of which ever existed:

| REST | MCP tool |
|---|---|
| `GET /tasks` | `list_tasks_tasks_get` |
| `POST /tasks` | `create_task_tasks_post` |
| `POST /tasks/{uuid}/done` | `complete_task_tasks__uuid__done_post` |
| `POST /inbox` | `webhook_inbox_inbox_post` |

MCP clients discover tools at connect time, so nothing had to hardcode these — which is
exactly why the documentation could be wrong for so long without anyone noticing. The full
list of all 27 is checked in at
[`ops/surfaces/mcp-tools.json`](ops/surfaces/mcp-tools.json), captured by booting the app and
reading the tool list, and `RULE-SURF-001` fails the build when it changes.

**Renaming a route handler function renames its MCP tool.** That is a breaking change to a
public surface — see [`AGENTS.md`](AGENTS.md).

### Use runway from Claude

[`integrations/claude/`](integrations/claude/README.md) is a Claude Code plugin with one skill,
`runway`, that runs Getting Things Done on this server: capture from any repository, clarify the
inbox, daily and weekly review, project planning. Every route below needs the MCP connection
above, once per machine and in user scope — the skill on its own is instructions for operations
that nothing answers.

**From the settings page**, which is the shortest way and the only one that already knows your
host. Log in and open Settings: the **Connect Claude** card lays out the four steps — the two
environment variables, the `claude mcp add` command, the plugin install, the standing rule to
copy — generated for this origin, each with a copy button. The command stores the *placeholder*
`${RUNWAY_API_KEY}`; your key stays in your shell, so rotating it is one edit rather than a
re-paste.

**From the marketplace**, by hand. This is the channel the plugin documentation recommends, and
it installs the same plugin the card's third step does — either way you get the SessionStart hook
that reminds you when a review is due. The zip below does not carry it:

```sh
export RUNWAY_API_KEY='<your-api-key>'   # from the settings page; e.g. in ~/.zshenv
export RUNWAY_URL='https://your-host'    # origin only — the review reminder reads it

claude mcp add --scope user --transport http runway https://your-host/api/mcp \
  --header 'X-Api-Key: ${RUNWAY_API_KEY}'
claude plugin marketplace add ulrichschinz/runway
claude plugin install runway@runway
```

**From the server, as a zip**, for a client that has no plugin marketplace but can send a fixed
`X-Api-Key` header to a remote MCP server:

```sh
curl -fsSOJ https://your-host/api/skill/runway.zip
```

That download is the copy *your* server carries rather than this repository's `main`, which
matters because the skill no longer hedges: every operation it names has to exist on the server
it talks to. It carries the skill text only — a hook is a plugin mechanism, and a client without
plugins has nowhere to register one.

**What a server is running.** There is no changelog and no release checklist here. `GET /api/skill`
on the running server **is** the release record: it names the skill version that build ships, the
content hash of that skill — the same one [`ops/skill-release.json`](ops/skill-release.json)
records — and the commit the image was built from. The deploy asks it that question after every
push and fails the run when the answer is not the commit it just shipped, so the record is
maintained by the deployment instead of by remembering to edit a file.

**The server's clock decides what "today" means.** Taskwarrior stores UTC, and runway resolves
every stored timestamp to a calendar day in the server's own zone — which is what `due_today`,
`overdue`, the daily review and the day a tickler task comes back are all counted in. The
deployed compose declares `Europe/Berlin` for the backend; a container left on the image default
of UTC answers one day behind Berlin between local midnight and 02:00. See
[the container clock](docs/operations.md#the-container-clock).

Updating, the install script for people without plugins, and why nothing is ever symlinked into a
checkout: [`integrations/claude/README.md`](integrations/claude/README.md). The one-time personal
setup — permissions, the standing rule that makes Claude offer tasks, a profile — is in
[`references/setup.md`](integrations/claude/skills/runway/references/setup.md).

---

## Development

> **Working on this repository?** Read **[`AGENTS.md`](AGENTS.md)** first — it is the contract:
> the decision procedure, the structure rules, the public surfaces, and the meta-rule that
> binds changes to them. It takes five minutes and saves considerably more.

This repository has one command surface for every ecosystem. Start here:

```bash
make help        # every available command
make bootstrap   # prepare a clean clone (idempotent)
make check       # fast local gate — run before every commit
make verify      # the authoritative gate; green means mergeable
```

Full reference, exit codes and JSON output: [`docs/task-interface.md`](docs/task-interface.md).
Use `./run <command>` instead of `make` when the exit code matters — `make` reports `2` for any failure.

```bash
# Rebuild and restart a single service after code changes
docker compose build backend && docker compose up -d backend
docker compose build frontend && docker compose up -d frontend

# View logs — one JSON object per line, application and uvicorn access lines together
docker compose logs -f backend

# Readable, if you have jq
docker compose logs -f --no-log-prefix backend | jq -r \
  '"\(.timestamp) \(.level) \(.request_id // "-") \(.message)"'
```

Every line carries a `request_id`, echoed to the caller in the `X-Request-Id` response
header, so a reported problem can be traced to the lines that produced it. Credentials are
stripped from the stream before it is written — by field name and by value shape — and that
cannot be switched off. Set `LOG_LEVEL=DEBUG` for more; see
[`docs/operations.md`](docs/operations.md#the-log-stream).

The backend runs on uvicorn (port 8000). The frontend is built with Vite and served by nginx on port 4000, with `/api/` proxied to the backend.

> **Note:** Docker Compose is configured with `network_mode: host`, which requires a Linux host. Mac and Windows users would need to adjust port mappings in `docker-compose.yml`.

---

## License

MIT — see [LICENSE](LICENSE).
