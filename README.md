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

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12 · FastAPI · aiosqlite |
| Frontend | Vue 3 · Vite · Tailwind CSS · Pinia |
| Task engine | Taskwarrior 3.x (TaskChampion / SQLite) |
| Auth | JWT · bcrypt · per-user API keys |
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

# Failed logins allowed per username before the API answers 429, and the window in seconds.
LOGIN_RATE_LIMIT=10
LOGIN_RATE_WINDOW_SECONDS=300

# JWT signing algorithm and token lifetime.
JWT_ALGORITHM=HS256
JWT_EXPIRE_HOURS=24

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
| `./data/<username>/` | Per-user Taskwarrior data (`taskchampion.sqlite3`) |
| `./users.db` | Users, API keys, projects (SQLite) |

Both are bind-mounted and excluded from git. Back them up to retain all data.

---

## Authentication

Runway supports two authentication methods, accepted by all API endpoints:

**JWT** — obtained via `POST /api/auth/login`, valid for 24 hours:
```
Authorization: Bearer <token>
```

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

Runway exposes a full [Model Context Protocol](https://modelcontextprotocol.io) server at `/mcp`.
This allows any MCP-compatible client (Claude Desktop, Claude Code, custom agents) to manage tasks directly.

**Claude Desktop** — add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "runway": {
      "type": "sse",
      "url": "https://your-host/mcp",
      "headers": {
        "X-Api-Key": "<your-api-key>"
      }
    }
  }
}
```

**Claude Code** — add to `.mcp.json` in your project:
```json
{
  "mcpServers": {
    "runway": {
      "type": "sse",
      "url": "https://your-host/mcp",
      "headers": {
        "X-Api-Key": "<your-api-key>"
      }
    }
  }
}
```

Available MCP tools mirror the REST API. **The tool names are FastAPI operation ids** — the
handler function name, then the path, then the method — not the bare function names this
section claimed until Step 13, none of which ever existed:

| REST | MCP tool |
|---|---|
| `GET /tasks` | `list_tasks_tasks_get` |
| `POST /tasks` | `create_task_tasks_post` |
| `POST /tasks/{uuid}/done` | `complete_task_tasks__uuid__done_post` |
| `POST /inbox` | `add_to_inbox_inbox_post` |

MCP clients discover tools at connect time, so nothing had to hardcode these — which is
exactly why the documentation could be wrong for so long without anyone noticing. The full
list of all 32 is checked in at
[`ops/surfaces/mcp-tools.json`](ops/surfaces/mcp-tools.json), captured by booting the app and
reading the tool list, and `RULE-SURF-001` fails the build when it changes.

**Renaming a route handler function renames its MCP tool.** That is a breaking change to a
public surface — see [`AGENTS.md`](AGENTS.md).

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

# View logs
docker compose logs -f backend
```

The backend runs on uvicorn (port 8000). The frontend is built with Vite and served by nginx on port 4000, with `/api/` proxied to the backend.

> **Note:** Docker Compose is configured with `network_mode: host`, which requires a Linux host. Mac and Windows users would need to adjust port mappings in `docker-compose.yml`.

---

## License

MIT — see [LICENSE](LICENSE).
