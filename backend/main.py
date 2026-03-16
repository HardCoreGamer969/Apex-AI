"""
ApexAI FastAPI backend.
Run from project root:
  uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000
  # or: uvicorn backend.main:app --host 0.0.0.0 --port 8000
"""
# Reduce memory before FastF1/matplotlib load (Render free tier = 512MB)
import os
os.environ.setdefault("MPLBACKEND", "Agg")
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

cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174,http://localhost:3000").split(",")
origins = [o.strip() for o in cors_origins if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.vercel\.app",  # Allow any Vercel deployment
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
    """Health check for Render/deployment."""
    return {"status": "ok"}


@app.get("/health/cache")
def health_cache():
    """Check if Supabase cache is configured (for debugging)."""
    from backend.services import cache
    configured = bool(cache.SUPABASE_URL and cache.SUPABASE_KEY)
    return {"supabase_configured": configured, "bucket": cache.CACHE_BUCKET}
