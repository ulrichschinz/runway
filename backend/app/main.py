from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi_mcp import FastApiMCP

from app import startup_checks
from app.config import cors_origin_list
from app.database import init_db
from app.routers import admin, auth, gtd, inbox, projects, tasks


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Before the database, before anything binds: an unsafe configuration must not be
    # reachable, and a container that refuses to start is a louder signal than one that
    # serves forgeable tokens quietly (finding SEC-1).
    startup_checks.run_all()
    await init_db()
    yield


app = FastAPI(
    title="Runway",
    description="A self-hosted GTD task manager. Authenticate with JWT (Authorization: Bearer <token>) or API key (X-Api-Key: <key>).",
    lifespan=lifespan,
)

# CORS is only mounted when an allowlist is configured (finding SEC-4).
#
# The previous configuration paired `allow_origins=["*"]` with `allow_credentials=True`.
# Starlette reflects the request's own Origin back when credentials are enabled with a
# wildcard, so every origin on the internet held full credentialed CORS access and the
# browser's origin barrier was removed entirely.
#
# Empty is the right default here, not a cautious one: the SPA reaches this API through a
# same-origin `/api` proxy — nginx in production, vite in development — so no browser ever
# makes a cross-origin request to it. Agents and MCP clients are not browsers and are
# unaffected by CORS in either direction. Set CORS_ORIGINS only for a real browser consumer
# on another origin. See ADR 0018.
_cors_origins = cors_origin_list()
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth.router)
app.include_router(tasks.router)
app.include_router(gtd.router)
app.include_router(projects.router)
app.include_router(inbox.router)
app.include_router(admin.router)


@app.get("/health", summary="Health check", description="Returns ok if the service is running.")
def health():
    return {"status": "ok"}


mcp = FastApiMCP(app)
mcp.mount()
