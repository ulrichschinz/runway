from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi_mcp import FastApiMCP
from app.database import init_db
from app.routers import auth, tasks, gtd, projects, inbox


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Runway",
    description="A self-hosted GTD task manager. Authenticate with JWT (Authorization: Bearer <token>) or API key (X-Api-Key: <key>).",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(tasks.router)
app.include_router(gtd.router)
app.include_router(projects.router)
app.include_router(inbox.router)


@app.get("/health", summary="Health check", description="Returns ok if the service is running.")
def health():
    return {"status": "ok"}


mcp = FastApiMCP(app)
mcp.mount()
