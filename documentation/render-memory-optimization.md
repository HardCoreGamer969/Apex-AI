# Render Memory Optimization (Phase 2)

This document describes additional memory optimizations implemented to further reduce backend memory usage on Render's 512MB free tier, after the initial [Render Free Tier Optimization](render-optimization.md) and [Columnar Replay Optimization](columnar-replay-optimization.md).

---

## Problem

Despite prior optimizations (sequential processing, float32, columnar format, 5fps), the backend still ran out of memory on Render. The main remaining consumers were:

1. **FastF1 session** (~150-250MB) — held for the entire `get_replay_data` call
2. **Driver telemetry** — `results` list held all 20 drivers before building `driver_data`
3. **L2 in-memory cache** — stored full payloads even when Supabase was configured
4. **Resampled + columnar overlap** — both structures existed simultaneously during build
5. **Pickle cache** — unnecessary read/write on Render's ephemeral disk

---

## Changes Implemented

### 1. Reduce target_fps (5 → 3)

**File:** `backend/services/f1_adapter.py`

Changed `target_fps=5` to `target_fps=3` in the `get_race_telemetry` call.

**Impact:** ~40% fewer frames (27k → 16k for a 90-min race). Payload and intermediate arrays shrink proportionally. Slightly choppier playback but still smooth.

---

### 2. Skip L2 in-memory cache when Supabase is configured

**File:** `backend/services/cache.py`

- **replay_set:** Only stores payload in `_l2_memory` when Supabase is *not* available. When Supabase is configured, uploads directly and skips memory storage.
- **replay_get:** When Supabase returns data, does not populate `_l2_memory`. Memory lookup only runs when Supabase is not configured.
- **quali_set / quali_get:** Same logic applied for qualifying data.

**Impact:** Saves 20-50MB by never holding a full replay payload in RAM when Supabase is used. Cache hits come from Supabase only.

---

### 3. Explicit session cleanup

**File:** `backend/services/f1_adapter.py`

Extracted all session-dependent data (track, circuit_rotation, session_info) into local variables, then added:

```python
del session, example_lap, track_tuple
gc.collect()
```

before building the columnar payload. The session is freed as soon as it is no longer needed.

**Impact:** Frees 150-250MB earlier in the call. Ensures the session is not kept alive by lingering references.

---

### 4. Incremental driver processing (no results list)

**File:** `src/f1_data.py`

Replaced the two-phase pattern (collect all results, then build driver_data) with a single loop that consumes each result immediately:

```python
for args in driver_args:
    result = _process_single_driver(args)
    if result is None:
        del result
        gc.collect()
        continue

    code = result["code"]
    driver_data[code] = result["data"]
    # update global_t_min, global_t_max, max_lap_number
    del result
    gc.collect()
```

**Impact:** Never holds more than one driver's telemetry at a time. Saves ~50-100MB during the driver-processing phase.

---

### 5. Drop resampled_data earlier

**File:** `src/f1_data.py`

When building `columnar_drivers`, delete each driver's entry from `resampled_data` as soon as the 6 columns are extracted:

```python
for di, code in enumerate(driver_codes_list):
    d = resampled_data[code]
    columnar_drivers[code] = { ... }
    del resampled_data[code]

del resampled_data, lap_matrix, dist_matrix, ...
gc.collect()
```

**Impact:** Avoids holding both full `resampled_data` (12 arrays per driver) and `columnar_drivers` (6 arrays per driver) simultaneously. Saves ~30-50MB.

---

### 6. Skip pickle cache on Render

**File:** `src/f1_data.py`

Added `_ON_RENDER = bool(os.environ.get("RENDER"))`. When true:

- Skip the pickle load attempt at the start of `get_race_telemetry`
- Skip the pickle save at the end

Render sets the `RENDER` environment variable; the `computed_data/` folder is ephemeral and wiped on cold start.

**Impact:** Saves disk I/O and a small amount of memory during pickle serialization. Reduces unnecessary work.

---

### 7. Reduce L2 memory maxsize when Supabase available

**File:** `backend/services/cache.py`

Set `_l2_memory` maxsize to 1 when Supabase URL and key are configured, 2 otherwise:

```python
_l2_memory: LRUCache = LRUCache(maxsize=1 if (SUPABASE_URL and SUPABASE_KEY) else 2)
```

**Impact:** Reinforces Optimization 2. When Supabase is used, the in-memory cache holds at most one payload as fallback.

---

## Summary of Changes

| Optimization | File(s) | Est. memory saved |
|--------------|---------|------------------|
| target_fps 5→3 | f1_adapter.py | ~10-15MB |
| Skip L2 memory when Supabase | cache.py | ~20-50MB |
| Session cleanup | f1_adapter.py | ~150-250MB (freed earlier) |
| Incremental driver processing | f1_data.py | ~50-100MB |
| Drop resampled_data earlier | f1_data.py | ~30-50MB |
| Skip pickle on Render | f1_data.py | Minor |
| L2 maxsize when Supabase | cache.py | Reinforces #2 |

---

## Trade-offs

- **target_fps=3:** Playback may feel slightly less smooth than 5fps. Consider 4fps as a compromise if needed.
- **No L2 memory cache when Supabase used:** Repeated requests for the same session fetch from Supabase each time instead of from memory. Latency may increase slightly for hot sessions, but memory stays low.

---

## Phase 3: Additional Optimizations (Under 500MB)

### 1. Single-task semaphore

**File:** `backend/services/tasks.py`

Added `_compute_semaphore = threading.Semaphore(1)` so only one replay or qualifying computation runs at a time. Prevents 2x memory spike when two uncached sessions are requested concurrently.

### 2. Qualifying session cleanup

**File:** `backend/services/f1_adapter.py`

Extract `session_info` from session, then `del session; gc.collect()` before building the return dict. Frees ~150-250MB earlier.

### 3. Qualifying incremental driver processing

**File:** `src/f1_data.py`

In `get_quali_telemetry`, merge each driver result into `telemetry_data` immediately, then `del result; gc.collect()`. Never hold all 20 drivers' telemetry in memory. Saves ~50-100MB.

### 4. Skip qualifying pickle on Render

**File:** `src/f1_data.py`

Added `_ON_RENDER` check: skip pickle load and save when `RENDER` env var is set. Saves disk I/O and minor memory.

### 5. Reduce L1 cache (200 → 50)

**File:** `backend/services/cache.py`

`TTLCache(maxsize=50)` instead of 200. Saves ~5-15MB.

### 6. Reduce target_fps (3 → 2)

**File:** `backend/services/f1_adapter.py`, `frontend/src/hooks/useReplayPlayback.ts`

Backend: `target_fps=2`. Frontend: `DATA_FPS=2`. Saves ~10-15MB; slightly choppier playback.

---

## Phase 4: Cache-Hit Passthrough + Qualifying Overhaul

### Problem

Even with all prior optimizations, two major memory spikes remained:

1. **Every cache hit** (the common case) was decompress → parse → re-serialize → re-compress: up to **120–195MB** just to serve data already stored in Supabase.
2. **Qualifying cache-miss** triggered `get_quali_telemetry` which processed 20 drivers × 3 Q-segments = 60 full per-frame telemetry extractions — **all discarded** since the caller only used `results`, `max_speed`, `min_speed`.
3. **`_tasks` dict** accumulated indefinitely; `cleanup_old_tasks()` existed but required manual `/admin/cleanup` calls.
4. **`driver_data` and `resampled_data`** coexisted fully during the resampling loop.
5. **`telemetry` numpy dict** stayed alive through the entire return dict construction.

---

### 1. Gzip Passthrough for Supabase Cache Hits

**Files:** `backend/services/cache.py`, `backend/routers/replay.py`

**Estimated savings: 100–200MB per cache-hit request**

Added `replay_get_compressed()` and `quali_get_compressed()` in `cache.py`. These return the raw gzip bytes from Supabase without decompressing, parsing, or re-serializing.

In `replay.py`, both `get_replay` and `get_qualifying` now try this fast path first:

```python
raw_gz = replay_get_compressed(year, round_number, session)
if raw_gz:
    return Response(
        content=raw_gz,
        media_type="application/json",
        headers={"Content-Encoding": "gzip"},
    )
```

Starlette's `GZipMiddleware` detects the pre-set `Content-Encoding: gzip` header and skips re-compression. The browser receives and decompresses the payload transparently.

The old path (decompress → parse → re-serialize, ~120–195MB peak) is retained as a fallback for the in-memory LRU case (when Supabase is not configured).

---

### 2. Skip Full Telemetry in Qualifying

**Files:** `src/f1_data.py`, `backend/services/f1_adapter.py`

**Estimated savings: 300–400MB per qualifying cache-miss computation**

`get_qualifying_data` previously called `get_quali_telemetry(session)`, which ran 20 drivers × 3 Q-segments of frame-by-frame telemetry extraction. The `telemetry` key in the return value was **never accessed by the caller** — only `results`, `max_speed`, and `min_speed` were used.

Two changes:

**`src/f1_data.py`** — `load_session` now accepts optional `telemetry` and `weather` kwargs (both default `True` for backward compatibility):

```python
def load_session(year, round_number, session_type="R", telemetry=True, weather=True):
    session = fastf1.get_session(year, round_number, session_type)
    session.load(telemetry=telemetry, weather=weather)
    return session
```

**`backend/services/f1_adapter.py`** — `get_qualifying_data` now loads without telemetry and calls `get_qualifying_results` directly:

```python
session = load_session(year, round_number, session_type, telemetry=False, weather=False)
raw_results = get_qualifying_results(session)
quali_data = {"results": raw_results, "max_speed": 0, "min_speed": 0}
```

`get_quali_telemetry` in `f1_data.py` is unchanged — it is still used by the desktop entry point.

---

### 3. Auto-Cleanup Completed Tasks

**File:** `backend/services/tasks.py`

`cleanup_old_tasks()` (removes tasks older than 1 hour in `ready`/`error` state) is now called automatically in the `finally` block of both `start_replay_task._worker` and `start_qualifying_task._worker`, after each computation completes. No manual `/admin/cleanup` required.

---

### 4. Incremental `driver_data` Deletion During Resampling

**File:** `src/f1_data.py`

**Estimated savings: 15–25MB peak**

The resampling loop now pops each driver's raw data immediately after resampling, rather than holding all of `driver_data` until the loop ends:

```python
codes = list(driver_data.keys())
for code in codes:
    data = driver_data.pop(code)  # free immediately after use
    # ... resample onto timeline ...
    resampled_data[code] = { ... }
```

---

### 5. Free `telemetry` Dict Before Building Return Dict

**File:** `backend/services/f1_adapter.py`

**Estimated savings: 10–20MB**

In `get_replay_data`, all values needed from `telemetry` are extracted to locals before the return dict is assembled, then the numpy-array dict is explicitly freed:

```python
timeline_list = _np_to_list(telemetry["timeline"])
leader_laps_list = _np_to_list(telemetry["leader_laps"])
driver_colors_out = _serialize_driver_colors(telemetry["driver_colors"])
track_statuses = telemetry.get("track_statuses", [])
total_laps = int(telemetry["total_laps"])
del telemetry
gc.collect()
```

---

### 6. Uvicorn Tuning

**File:** `render.yaml`

Added `--no-access-log` (removes one I/O write per request) and `--timeout-keep-alive 5` (faster idle connection cleanup) to the start command:

```yaml
startCommand: uv run uvicorn backend.main:app --host 0.0.0.0 --port $PORT --no-access-log --timeout-keep-alive 5
```

---

### Phase 4 Summary

| Optimization | File(s) | Cache-Hit Saving | Compute Saving |
|---|---|---|---|
| Gzip passthrough | cache.py, replay.py | 100–200MB | — |
| Skip qualifying telemetry | f1_data.py, f1_adapter.py | — | 300–400MB |
| Auto-cleanup tasks | tasks.py | leak prevented | leak prevented |
| Incremental driver_data pop | f1_data.py | — | 15–25MB |
| Free telemetry dict early | f1_adapter.py | 10–20MB | 10–20MB |
| Uvicorn tuning | render.yaml | I/O only | I/O only |

After Phase 4, qualifying cache-miss peak drops from ~450MB+ (OOM risk on 512MB) to well under 200MB. Cache-hit requests (the common case) now use negligible memory beyond the compressed bytes (~10–15MB).

---

## See also

- [Offload Compute to GitHub Actions and Browser](offload-compute.md) — Pre-compute in CI, keyframe mode, browser interpolation
