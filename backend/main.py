"""
ApexAI FastAPI backend.
Run from project root:
  uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000

Desktop mode (spawned by Electron):
  APEX_MODE=desktop uv run uvicorn backend.main:app --host 127.0.0.1 --port 8765
"""
import os
os.environ.setdefault("MPLBACKEND", "Agg")
# On Windows (desktop), use a writable temp dir for matplotlib config
if os.name == "nt":
    _mpl_dir = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "ApexAI", "mpl")
    os.environ.setdefault("MPLCONFIGDIR", _mpl_dir)
else:
    os.environ.setdefault("MPLCONFIGDIR", "/tmp/mpl")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from backend.routers import admin, replay, sessions, websocket

app = FastAPI(
    title="ApexAI API",
    description="F1 Race Replay - session list and replay data",
    version="0.1.0",
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

_default_cors = "http://localhost:5173,http://localhost:5174,http://localhost:3000,http://localhost:8765"
cors_origins = os.environ.get("CORS_ORIGINS", _default_cors).split(",")
origins = [o.strip() for o in cors_origins if o.strip()]

# Desktop mode: Electron loads via file:// — allow all localhost origins
_apex_mode = os.environ.get("APEX_MODE", "")
_origin_regex = r"https://.*\.vercel\.app"
if _apex_mode == "desktop":
    _origin_regex = r"(https://.*\.vercel\.app|http://localhost:\d+|file://.*)"

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(replay.router)
app.include_router(websocket.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    """Health check."""
    return {"status": "ok", "mode": os.environ.get("APEX_MODE", "web")}


@app.get("/health/cache")
def health_cache():
    """Check if Supabase cache is configured (for debugging)."""
    from backend.services import cache
    configured = bool(cache.SUPABASE_URL and cache.SUPABASE_KEY)
    return {"supabase_configured": configured, "bucket": cache.CACHE_BUCKET}
