"""
ApexAI FastAPI backend.
Run from project root:
  uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import compare, lap, replay, sessions, strategy, telemetry, websocket

app = FastAPI(
    title="ApexAI API",
    description="F1 Race Replay - session list and replay data",
    version="0.1.0",
)

cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174,http://localhost:3000").split(",")
origins = [o.strip() for o in cors_origins if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router)
app.include_router(replay.router)
app.include_router(websocket.router)
app.include_router(strategy.router)
app.include_router(telemetry.router)
app.include_router(lap.router)
app.include_router(compare.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/health/cache")
def health_cache():
    from backend.services import cache
    return {
        "supabase_configured": bool(cache.SUPABASE_URL and cache.SUPABASE_KEY),
        "bucket": cache.CACHE_BUCKET,
        "redis_configured": cache.redis_configured(),
    }
