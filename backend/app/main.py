import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import audit, database, mcp_gate, rate_limit, startup_checks, task_storage
from app.auth import prepare_dummies
from app.config import cors_origin_list, settings
from app.database import init_db, legacy_cutoff, legacy_cutoff_problem
from app.logging_setup import configure_logging, resolve_level
from app.middleware import BodyLimitMiddleware, RequestIdMiddleware
from app.routers import admin, auth, gtd, inbox, projects, skill, tasks
from app.services import skill_service, task_service

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
    # The dummy hashes every login verifies against when an account has no hash of that kind:
    # made now, so the first login after a boot costs what every other one costs (SEC-006).
    prepare_dummies()
    # Before init_db, because init_db can promote an administrator and that promotion is the
    # first thing there would otherwise be nowhere to write.
    audit.init_store()
    bootstrap_reason = await init_db()
    # Reported by GET /skill for the post-deploy check (brief 0073, RISK-OPS-002).
    skill_service.record_schema_version(database.applied_schema_version)
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
    # RISK-OPS-006 (brief 0073): the audit file's size, now and hourly; a WARNING above
    # AUDIT_DB_WARN_BYTES. Measured, never pruned — retention is the operator's decision (ADR 0047).
    audit.measure()
    size_watch = asyncio.create_task(audit.watch_size(), name="audit.watch_size")
    # The login limiter's source tier trusts X-Forwarded-For only from these (brief 0069). A
    # skipped entry trusts fewer hops, never more — but the operator meant something by it.
    rejected = rate_limit.rejected_proxy_entries(settings.trusted_proxies)
    if rejected:
        logger.error(
            "TRUSTED_PROXIES entries ignored: not an address or network, or prefix length 0",
            extra={"ignored_entries": rejected},
        )
    if not rate_limit.trusted_networks(settings.trusted_proxies):
        # Brief 0069, R2: behind an undeclared proxy every login arrives from the proxy's
        # address. Such a peer is not counted as a source, so the source tier is off for it
        # and only the account and global budgets apply until TRUSTED_PROXIES is set.
        logger.warning(
            "TRUSTED_PROXIES is not set: the login source budget does not apply to "
            "loopback or private peers (a proxy); see docs/operations.md, The login budget"
        )
    # WAIVER-SEC-003 (ADR 0044 Decision 6): a cutoff the setting tried to push later, or could
    # not parse, is not applied — the default is. Said once, at the boot that ignores it.
    cutoff_problem = legacy_cutoff_problem()
    if cutoff_problem:
        logger.warning("API_KEY_LEGACY_CUTOFF ignored: " + cutoff_problem)
    logger.info(
        "startup complete",
        # The storage mode as the resolver will apply it, so an operator can see the switch
        # took (an unrecognised value reads `strict`, which is what it does). SEC-001.
        extra={
            "log_level": resolve_level(),
            "registration_seed": settings.allow_registration,
            "task_storage_mode": task_storage.storage_mode(),
            "login_trusted_proxies": len(rate_limit.trusted_networks(settings.trusted_proxies)),
            "legacy_key_cutoff": datetime.fromtimestamp(legacy_cutoff(), UTC).date().isoformat(),
            "mcp_max_inflight": settings.mcp_max_inflight,
            "mcp_source_max_inflight": settings.mcp_source_max_inflight,
            "schema_version": database.applied_schema_version,
        },
    )
    try:
        yield
    finally:
        size_watch.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await size_watch


app = FastAPI(
    title="Runway",
    description="A self-hosted GTD task manager. Authenticate with JWT (Authorization: Bearer <token>) or API key (X-Api-Key: <key>).",
    lifespan=lifespan,
    # First on every route: an MCP tool call may run only its own handler (REV-005, brief 0071).
    # It takes nothing but the request, so no route and no MCP tool gains a parameter.
    dependencies=[Depends(mcp_gate.bind_mcp_target)],
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

# Inside the request id (a 413 carries one) and in front of everything else: an oversized body
# is refused before CORS, routing, body parsing, hashing or a query (SEC-006, brief 0067).
app.add_middleware(BodyLimitMiddleware)

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
app.include_router(skill.router)


@app.exception_handler(task_service.ArgumentTooLong)
async def argument_too_long(_request: Request, exc: task_service.ArgumentTooLong) -> JSONResponse:
    """413, not 500: the kernel refused a value as too long for `task` (RISK-SEC-004, brief 0073).
    The request models bound every field below the kernel's limit, so this is the backstop."""
    return JSONResponse(status_code=413, content={"detail": str(exc)})


@app.get("/health", summary="Health check", description="Returns ok if the service is running.")
def health():
    return {"status": "ok"}


# The MCP surface. `headers` and `mount_http` each fix a defect that made the server unusable
# in production from its first deploy until 2026-09-18 — see ADR 0033.
#
# `headers` is the allowlist of request headers forwarded into the tool call. It defaults to
# ["authorization"] alone, which meant the `X-Api-Key` header the README and the Settings
# page have always documented arrived at the endpoint as no credential at all: every tool
# call came back 401, and the only shape that worked was Bearer-as-API-key — SHIM-SEC-006,
# the shim scheduled for removal. Forwarding both makes the documented shape the working one
# and stops MCP depending on the shim.
#
# `mount_http` is Streamable HTTP rather than the deprecated HTTP+SSE of `mount()`. SSE
# advertises its own message endpoint as an absolute path (`/mcp/messages/`), and production
# reaches this application under the `/api/` prefix that nginx strips — so the path the
# server handed out resolved to the SPA, and no client could post a second message. Streamable
# HTTP is one endpoint that never advertises a path, so it is correct behind the proxy with
# no root_path to keep in sync.
#
# `include_tags` + `include_operations` make the tool list an allowlist (ADR 0037): the task,
# GTD, project and inbox routers, plus `health` (which has no tag) and `me`. Every auth,
# API-key, user and admin operation stays REST-only, so an agent session holding a key cannot
# read the key back, rotate it, or reach an admin route. A router with a new tag is not a tool
# until it is added here — the list fails closed. fastapi-mcp takes the union of the two
# include kinds, and refuses include with exclude of the same kind. `include_operations`
# ignores a name that matches nothing, so test_mcp_session.py pins both.
#
# `RunwayMCP` (backend/app/mcp_gate.py, brief 0071, ADR 0045) is FastApiMCP with three controls:
# every tool call must reach the route its tool was made from (REV-005 — a `..` in a path argument
# used to reach REST-only routes), the transport is stateless and holds no session (REV-004), and
# every MCP request is reserved in an in-flight budget and bounded by a deadline.
mcp = mcp_gate.RunwayMCP(
    app,
    headers=["authorization", "x-api-key"],
    include_tags=["tasks", "gtd", "projects", "inbox"],
    include_operations=["health_health_get", "me_auth_me_get"],
)
mcp.mount_http()
