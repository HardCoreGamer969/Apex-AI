# Render Free Tier Optimization

This document describes the optimizations implemented to make the ApexAI backend run reliably on Render's free tier (512MB RAM, ephemeral disk, cold starts) while persisting computed data to Supabase Storage.

---

## Problem

On a Supabase cache miss, the backend must download a full race session from the FastF1 API, process telemetry for ~20 drivers, build frames, and return the result. This was failing because:

1. `multiprocessing.Pool` forked multiple processes, each duplicating session data in memory -- exceeding 512MB.
2. Track geometry loading pulled in a **second** qualifying session on top of the race session.
3. Long computations (1-3 min) caused HTTP timeouts before the result could be cached.
4. Qualifying data had no Supabase cache, so it was recomputed from scratch after every cold start.
5. Desktop GUI dependencies (`arcade`, `pyglet`, `pyside6`) were installed on Render despite never being used.

---

## Changes Implemented

### 1. Sequential driver processing (`src/f1_data.py`)

Replaced `multiprocessing.Pool` with a sequential loop + `gc.collect()` after each driver in both `get_race_telemetry()` and `get_quali_telemetry()`.

**Before:**
```python
with Pool(processes=num_processes) as pool:
    results = pool.map(_process_single_driver, driver_args)
```

**After:**
```python
results = []
for args in driver_args:
    result = _process_single_driver(args)
    results.append(result)
    gc.collect()
```

**Impact:** Peak memory drops from 500MB+ to ~150-200MB. Computation is slower (3-5 min vs 1-2 min) but actually completes instead of OOM-killing.

### 2. Removed double session load (`backend/services/f1_adapter.py`)

`_get_example_lap()` was loading a separate qualifying session just for DRS zone data in the track layout. Now it uses the fastest lap from the already-loaded session.

**Impact:** ~200-300MB of RAM freed (one entire FastF1 session object).

### 3. Async computation with polling (`backend/routers/replay.py`, `backend/services/tasks.py`)

Instead of blocking an HTTP request for minutes, the flow is now:

1. `GET /replay` checks Supabase cache.
2. On cache miss, returns **HTTP 202** with a `task_id` and starts computation in a background thread.
3. Frontend polls `GET /replay/status?task_id=...` every 4 seconds.
4. When the background thread finishes, it stores the result in Supabase.
5. Frontend detects `status: "ready"` and re-fetches `/replay` (which now hits cache).

Duplicate requests for the same session are deduplicated -- only one background thread runs per session.

**New file:** `backend/services/tasks.py` -- lightweight in-memory task tracker with thread-safe status updates.

### 4. Supabase caching for qualifying data (`backend/services/cache.py`, `backend/routers/replay.py`)

Added `quali_get()` and `quali_set()` to the cache layer, following the same gzip-compressed JSON pattern as replay data. The `/replay/qualifying` endpoint now checks Supabase first and uses the same 202 + polling pattern on cache miss.

### 5. Memory-efficient numpy processing (`src/f1_data.py`)

- **float32 arrays:** Telemetry extraction now uses `dtype=np.float32` instead of the default float64, halving numpy memory.
- **Configurable FPS:** `get_race_telemetry()` accepts a `target_fps` parameter. The web backend passes `target_fps=5`, producing 5x fewer frames directly instead of computing at 25fps and striding later.
- **Intermediate cleanup:** Raw driver data is deleted and garbage-collected after resampling.

### 6. Slim dependencies (`pyproject.toml`, `requirements.txt`, `render.yaml`)

Desktop GUI packages were moved to an optional dependency group:

```toml
[project.optional-dependencies]
desktop = ["arcade", "pyglet", "pyside6", "questionary", "rich"]
```

`uv sync` on Render only installs core dependencies. Desktop users install the full set with `uv sync --extra desktop`.

**Impact:** Faster builds, smaller container, less import-time memory overhead.

### 7. Pre-warm cache endpoint (`backend/routers/admin.py`)

New admin endpoints protected by `ADMIN_SECRET` env var:

- `POST /admin/precompute` -- accepts a list of `{year, round, session}` objects and kicks off background computation for each. Returns task IDs for monitoring.
- `POST /admin/cleanup` -- removes old completed/errored tasks from memory.

These can be triggered by an external cron service (cron-job.org, GitHub Actions schedule) to pre-populate the Supabase cache before users request sessions.

### 8. Frontend polling UI (`frontend/src/api/client.ts`, `frontend/src/components/`)

- `fetchReplay()` and `fetchQualifying()` now accept an `onProgress` callback.
- A new `fetchWithPolling()` helper handles 202 responses by polling `/replay/status` every 4 seconds with a 5-minute overall timeout.
- `ReplayViewer` and `QualifyingViewer` display live progress messages (e.g. "Server is computing this session...") instead of a static loading spinner.

### 9. WebSocket cache-only mode (`backend/routers/websocket.py`)

The WebSocket endpoint no longer attempts heavy computation inline. If the replay isn't cached, it returns a `not_cached` error directing the client to use the HTTP polling flow. This prevents a WebSocket connection from holding a long-running computation in memory.

---

## Files Changed

| File | Change |
|------|--------|
| `src/f1_data.py` | Sequential processing, float32, target_fps, gc.collect |
| `backend/services/f1_adapter.py` | Removed double session load, passes target_fps=5 |
| `backend/services/cache.py` | Added quali_get/quali_set |
| `backend/services/tasks.py` | **New** -- background task tracker |
| `backend/routers/replay.py` | 202 polling pattern for replay + qualifying |
| `backend/routers/admin.py` | **New** -- precompute + cleanup endpoints |
| `backend/routers/websocket.py` | Cache-only mode |
| `backend/main.py` | Registered admin router |
| `pyproject.toml` | Split core vs desktop deps |
| `requirements.txt` | Updated to core-only |
| `render.yaml` | Added ADMIN_SECRET env var |
| `frontend/src/api/client.ts` | fetchWithPolling + onProgress callbacks |
| `frontend/src/components/ReplayViewer.tsx` | Live progress display |
| `frontend/src/components/QualifyingViewer.tsx` | Live progress display |

---

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `SUPABASE_URL` | Render dashboard | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Render dashboard | Supabase service role key for Storage |
| `CACHE_BUCKET` | render.yaml | Storage bucket name (default: `replay-cache`) |
| `CACHE_MAX_SESSIONS` | render.yaml | Max cached files before eviction (default: 50) |
| `ADMIN_SECRET` | Render dashboard | Bearer token for /admin/* endpoints |
| `CORS_ORIGINS` | Render dashboard | Comma-separated Vercel frontend URLs |
