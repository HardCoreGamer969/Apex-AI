# ── ApexAI Backend — Development Image ──────────────────────────────────────
# Python 3.11 slim + uv + FastAPI + FastF1
# Hot-reload enabled: mount backend/ and src/ as volumes.

FROM python:3.11-slim

WORKDIR /app

# System deps: gcc/g++ for native extensions (numpy, pandas, orjson)
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        g++ \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv (fast Python package manager)
RUN pip install --no-cache-dir uv

# ── Dependency layer (cached unless pyproject.toml or uv.lock changes) ───────
COPY pyproject.toml uv.lock ./
# --no-dev skips pytest/httpx; optional desktop group is not installed by default
RUN uv sync --no-dev

# ── Source (overridden by volume mounts in docker-compose for hot-reload) ────
COPY backend/ ./backend/
COPY src/ ./src/

# ── Runtime config ────────────────────────────────────────────────────────────
ENV MPLBACKEND=Agg
ENV MPLCONFIGDIR=/tmp/mpl
ENV APEX_MODE=desktop
ENV APEX_CACHE_DIR=/app/cache
ENV PYTHONUNBUFFERED=1

EXPOSE 8765

HEALTHCHECK --interval=10s --timeout=5s --start-period=25s --retries=5 \
    CMD curl -sf http://localhost:8765/health || exit 1

# --reload watches backend/ and src/ for changes
CMD ["uv", "run", "uvicorn", "backend.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8765", \
     "--reload", \
     "--reload-dir", "backend", \
     "--reload-dir", "src"]
