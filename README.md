# Runway

> *In GTD, the "Runway" is where you are right now — the ground level of next actions,*
> *the things you can actually do today. Before you can reach altitude, you need a clear runway.*

Self-hosted GTD web app wrapping [Taskwarrior](https://taskwarrior.org/) (v3).  
Built by [Agentic Reach](https://agenticreach.com). Multi-user, mobile-friendly, dark mode.

## Stack

| Layer | Tech |
|-------|------|
| Backend | Python · FastAPI · aiosqlite |
| Frontend | Vue 3 · Vite · Tailwind CSS · Pinia |
| Tasks | Taskwarrior 3.x (TaskChampion / SQLite storage) |
| Auth | JWT · bcrypt |
| Deploy | Docker Compose |

## Features

- **GTD views**: Inbox, Next Actions, Waiting For, Someday/Maybe, Projects, All Tasks
- **Urgency scoring** via Taskwarrior's algorithm (displayed on every task)
- **In Progress**: Start/pause tasks with visual highlighting; auto-resort by urgency
- **Natural Planning** (5-step GTD): Warum/Werte → Vision → Brainstorming → Ordnen → Aktionen
- **Projects**: Create projects independently of tasks; plan before you act
- Task attributes: priority, due/scheduled/wait/until dates, tags, recurrence, dependencies, annotations
- Swipe gestures (mobile), search/filter, dark mode
- Per-user data isolation (separate Taskwarrior data directories)

## Setup

```bash
cp .env.example .env
# Edit .env: set JWT_SECRET and ALLOW_REGISTRATION

docker compose up -d
```

Frontend: http://localhost:4000  
Backend API: http://localhost:8000

## Data persistence

| Path | Contents |
|------|----------|
| `./data/<username>/` | Per-user Taskwarrior data (`taskchampion.sqlite3`) |
| `./users.db` | Users, projects, GTD plans (SQLite) |

Both are bind-mounted into the containers and excluded from git.

## Development

```bash
# Rebuild after code changes
docker compose build <backend|frontend>
docker compose up -d <backend|frontend>
```

Backend runs on Python 3.12 + uvicorn. Frontend built with Vite, served via nginx on port 4000 with `/api/` proxied to the backend.

> Network mode: `host` (required in this environment — bridge networking not available).
