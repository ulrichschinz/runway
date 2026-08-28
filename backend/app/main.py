import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi_mcp import FastApiMCP

from app import audit, startup_checks
from app.config import cors_origin_list, settings
from app.database import init_db
from app.logging_setup import configure_logging, resolve_level
from app.middleware import RequestIdMiddleware
from app.routers import admin, auth, gtd, inbox, projects, tasks

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # First, so that everything below it — including a startup refusal — is emitted as JSON
    # through the redaction filter rather than in whatever shape the runner happened to
    # configure. Under uvicorn this is a re-application of the same configuration the
    # `--log-config` file already installed, now at the operator's LOG_LEVEL.
    configure_logging()
    # Before the database, before anything binds: an unsafe configuration must not be
    # reachable, and a container that refuses to start is a louder signal than one that
    # serves forgeable tokens quietly (finding SEC-1).
    startup_checks.run_all()
    # Before init_db, because init_db can promote an administrator and that promotion is the
    # first thing there would otherwise be nowhere to write.
    audit.init_store()
    bootstrap_reason = await init_db()
    # bootstrap_admin has always returned a string naming the branch it took, and the caller
    # has always thrown it away. It is recorded here because a role change that happens at
    # boot, with no request and no acting principal, is the one role change that leaves no
    # other trace — and "noop: an admin already exists" is worth a row too: it is the
    # evidence that the recovery path did NOT fire on this start.
    audit.record(
        audit.ADMIN_BOOTSTRAP,
        outcome=audit.NOOP if bootstrap_reason.startswith("noop:") else audit.SUCCESS,
        detail=bootstrap_reason,
    )
    logger.info(
        "startup complete",
        extra={"log_level": resolve_level(), "registration_seed": settings.allow_registration},
    )
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

# Added last, so it is the outermost layer: every request gets a correlation id before any
# other middleware can answer it, and every response carries the id back — including the
# ones CORS or an exception handler produces without the route ever running.
app.add_middleware(RequestIdMiddleware)

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
