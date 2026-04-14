# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (Python, uv-managed, runs from repo root)

```bash
uv sync                                                          # install deps
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000       # dev server
uv run pytest                                                    # run all tests (no tests exist yet)
uv run pytest path/to/test_file.py::test_name                    # run single test
```

Do not use pip / requirements.txt — the project is uv-managed (`pyproject.toml`, `uv.lock`). `[tool.uv] package = false` means it's a virtual project (deps only, no build).

### Frontend (in `frontend/`)

```bash
npm install
npm run dev        # Vite dev server on :5173
npm run build      # tsc -b && vite build — type-check then bundle
npm run lint       # ESLint
npm run preview    # preview built bundle
```

`VITE_API_URL` overrides the default `http://localhost:8000` backend URL (set in `frontend/.env` for local, in Vercel env for prod).

## Architecture

### Monorepo layout

- `backend/` — FastAPI app (routers + services)
- `src/` — **shared F1 domain logic imported by `backend/`**. Not `backend/src/`. Moving or renaming `src/` breaks backend imports. Contains `f1_data.py` (FastF1 wrapper, frame generation, telemetry), `track_geometry.py` (pure-numpy track outline + DRS zones), and `lib/` (settings, time, tyres, season helpers). All import-safe in headless containers — do not add GUI deps (arcade, pyglet, pyside) here.
- `frontend/` — React 19 + Vite + TypeScript SPA
- `railway.toml` — Railway backend deploy config (Nixpacks, uvicorn start, `/health` healthcheck)
- `frontend/vercel.json` — SPA rewrite rules for Vercel

### Backend boundaries (important)

1. **All FastF1 access goes through `backend/services/f1_adapter.py`.** It is the single place that converts pandas/numpy types to JSON-safe primitives (NaN/Inf → None via `_sanitize`, RGB tuples → hex via `_rgb_to_hex`). Routers must call the adapter, never FastF1 directly.
2. **Two-tier cache in `backend/services/cache.py`:**
   - **L1** — small keyed entries (sessions, race-names, strategy, telemetry, lap, compare). Redis if `REDIS_URL` is set; falls back to in-process `TTLCache` otherwise. API: `l1_get(key)` / `l1_set(key, value)`.
   - **L2** — full replay payloads, stored gzip-compressed. Supabase Storage if `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` set; falls back to in-process `LRUCache(10)`. API: `replay_get(year, round, session)` / `replay_set(...)`.
   Both tiers degrade gracefully — **local dev needs no env vars**.
3. **Routers live in `backend/routers/`** (one per concern: sessions, replay, websocket, strategy, telemetry, lap, compare). Each is registered in `backend/main.py`. Cache keys should be typed: `strategy:{year}:{round}:{session}`, compare uses sorted driver pair so `VER+HAM` and `HAM+VER` share a cache entry.
4. **CORS** — explicit list from `CORS_ORIGINS` env var (comma-separated) **plus** a regex allowing any `https://*.vercel.app` for preview deployments. Don't tighten the regex without updating Vercel preview flows.
5. Backend deploys via **Dockerfile** at repo root (not Nixpacks). It's a slim `python:3.11-slim` image that installs via `uv sync --no-dev --frozen` and sets `MPLBACKEND=Agg` + `MPLCONFIGDIR=/tmp/matplotlib` at image-build time so matplotlib never tries GUI init in the container. `railway.toml` points at this Dockerfile.

### Frontend architecture

- **Routes (8 total)** are defined in `src/App.tsx`: `/` (Dashboard), `/sessions` (picker), `/replay/:year/:round/:session`, `/qualifying/...`, `/compare/...`, `/lap/...`, `/strategy/...`, `/saved`.
- **State split:**
  - **Zustand** for client state — `src/store/replayStore.ts` (playback, selected drivers, overlay toggles) and `src/store/savedStore.ts` (localStorage-persisted bookmarks via zustand/middleware).
  - **TanStack Query** for server state — all fetchers are hooks in `src/api/queries.ts` wrapping the plain fetch functions in `src/api/client.ts`. `QueryClientProvider` is mounted in `src/main.tsx`. Don't bypass the query layer in new components; reuse or add hooks.
- **Styling** — Tailwind v4 via `@tailwindcss/vite` plugin (configured in `vite.config.ts`, tokens in `frontend/tailwind.config.ts` + `src/styles/tokens.css`). Glassmorphism is centralized in `src/components/glass/GlassPanel.tsx` — use it for any panel-shaped container.
- **Motion** — Framer Motion throughout. Use `AnimatePresence` for route transitions and shared-layout IDs.
- **WebGL hero** — `src/components/hero/TrackHero.tsx` is lazy-loaded (`React.lazy`); `TrackHeroSVG.tsx` is the fallback. Dashboard picks the fallback when `navigator.hardwareConcurrency < 4`. Keep that branch — low-end devices will otherwise hit a 888 KB Three.js chunk they can't render smoothly.
- **Replay playback** — backend emits ~5 FPS telemetry frames; `src/hooks/useReplayPlayback.ts` interpolates to 60 FPS via `requestAnimationFrame`. `src/components/replay/TrackCanvas.tsx` consumes the interpolated frames and reads live state from `replayStore`. Don't move interpolation into the canvas or into Zustand actions — the RAF loop owns it.

### Deployment

- **Backend** — Railway, `railway.toml` (Nixpacks build, `uv run uvicorn backend.main:app --host 0.0.0.0 --port $PORT`). Optional env vars: `REDIS_URL` (Railway Redis plugin), `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` + `CACHE_BUCKET`, `CORS_ORIGINS`, `CACHE_SESSIONS_TTL`.
- **Frontend** — Vercel, `frontend/vercel.json` rewrites all paths to `index.html` for SPA routing. Set `VITE_API_URL` in Vercel project env.

### Things to know before changing behavior

- **Do not reintroduce stride-downsampling defaults.** `f1_adapter` currently returns full-fidelity frames; the client can still request `stride` as a query param. This was a deliberate choice after moving off the 512 MB Render tier.
- **Do not add Render-specific `MPLBACKEND` / `MPLCONFIGDIR` hardcodes to `backend/main.py`.** Railway doesn't need them; add to Railway env vars if matplotlib misbehaves in a new environment.
- **No tests exist yet** (`pytest` + `httpx` are installed as dev deps). If you add tests, put them in a top-level `tests/` directory; imports like `from backend.main import app` and `from src.f1_data import ...` work because of the virtual-project setup.
