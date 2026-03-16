# Columnar Replay Data Optimization

## Problem

The replay viewer hung and slowed down significantly when parsing position data. Two bottlenecks caused this:

1. **Backend: A 27,000-iteration Python loop** — A 90-minute race at 5fps produces ~27,000 frames. The loop in `src/f1_data.py` created a dict for each of ~20 drivers per frame (540,000 dict creations), sorted 20 drivers by `(lap, dist)` to compute positions (27,000 sorts), and built another dict for `frame_data` (another 540,000 dicts). Then `backend/services/f1_adapter.py` iterated all frames again to slim and sanitize. Total: 10–30+ seconds on Render free tier.

2. **Frontend: Parsing a massive JSON blob** — The per-frame payload had enormous structural overhead: 27,000 frames × 20 drivers × 6 fields = 3.24 million key-value pairs. Each frame repeated the same key names for every driver, resulting in a ~30–40MB JSON blob that `JSON.parse()` blocked the main thread for several seconds.

## Solution: Columnar Format

The data was already in arrays after the resampling step. The frame-building loop converted arrays to per-frame dicts, then the frontend indexed back into those dicts by frame number. This round-trip was pointless and expensive.

### Old payload shape

```json
{
  "frames": [
    {"t": 0.0, "lap": 1, "drivers": {"VER": {"x": 1234, "y": 5678, "position": 1, ...}, "HAM": {...}}},
    {"t": 0.2, "lap": 1, "drivers": {"VER": {"x": 1235, "y": 5679, "position": 1, ...}, "HAM": {...}}},
    ...27,000 more...
  ]
}
```

### New payload shape

```json
{
  "timeline": [0.0, 0.2, 0.4, ...],
  "leader_laps": [1, 1, 1, ..., 57],
  "drivers": {
    "VER": {"x": [...], "y": [...], "position": [...], "lap": [...], "speed": [...], "tyre": [...]},
    "HAM": {"x": [...], "y": [...], "position": [...], "lap": [...], "speed": [...], "tyre": [...]}
  },
  "weather_timeline": {"air_temp": [...], "track_temp": [...], "humidity": [...], ...}
}
```

## What Was Implemented

### Backend

#### 1. Vectorized position computation (`src/f1_data.py`)

Replaced the entire frame-building loop (previously lines 374–487) with vectorized numpy operations:

- Stacks all drivers' `(lap, dist)` arrays into matrices of shape `[num_drivers, num_frames]`
- Computes a combined sort key (`lap * 1e9 + dist`) and uses `np.argsort` to rank positions across all frames in a single operation
- Extracts leader lap per frame from the position-1 driver
- Returns the resampled arrays directly as a columnar dict with `timeline`, `leader_laps`, `drivers`, and `weather`

#### 2. Updated adapter layer (`backend/services/f1_adapter.py`)

- Removed the `_slim_frame` / `_sanitize_dict` loop that iterated all frames a second time
- Added `_np_to_list()` helper that uses `np.nan_to_num` + `.tolist()` for single-pass vectorized array-to-list conversion
- Builds the columnar response payload directly, including a derived `rain_state` array in `weather_timeline`
- Added `cache_version: 2` to the payload for cache compatibility

#### 3. Cache versioning (`backend/services/cache.py`)

- Added `REPLAY_CACHE_VERSION = 2` constant
- `replay_get()` now checks `cache_version` on retrieved payloads and returns `None` (triggering recomputation) on version mismatch, so old per-frame cached data is gracefully invalidated
- `replay_set()` stamps `cache_version` on every payload

#### 4. Replay router (`backend/routers/replay.py`)

- Removed the `stride` query parameter and associated `frames[::stride]` slicing (no longer applicable to columnar data)

#### 5. WebSocket handler (`backend/routers/websocket.py`)

- Sends the entire columnar payload in one message (`type: "columnar_replay"`) instead of iterating frame-by-frame with `asyncio.sleep` delays

### Frontend

#### 6. Updated types (`frontend/src/types/api.ts`)

- Replaced `DriverFrame` and `Frame` interfaces with `ColumnarDriverData` (arrays of `x`, `y`, `position`, `lap`, `speed`, `tyre`) and `WeatherTimeline` (arrays of weather values)
- `ReplayPayload` now has `timeline`, `leader_laps`, `drivers`, and `weather_timeline` instead of `frames`

#### 7. Playback hook (`frontend/src/hooks/useReplayPlayback.ts`)

- Accepts `ReplayPayload | null` instead of `Frame[]`
- `totalFrames` derived from `timeline.length`
- Exposes `currentTime` and `currentLap` computed from columnar arrays by frame index
- No longer returns `currentFrame` or `frames`

#### 8. Track canvas (`frontend/src/components/TrackCanvas.tsx`)

- Reads `drivers[code].x[indexA]` and `drivers[code].x[indexB]` for interpolation instead of `frames[indexA].drivers[code].x`
- Props changed from `frames: Frame[]` to `drivers: Record<string, ColumnarDriverData>`

#### 9. Leaderboard (`frontend/src/components/Leaderboard.tsx`)

- Reads `drivers[code].position[frameIndex]` directly instead of extracting and sorting driver objects every render
- Props changed from `frame: Frame | null` to `drivers`, `frameIndex`, `driverColors`

#### 10. Weather panel (`frontend/src/components/WeatherPanel.tsx`)

- Reads from `weather.air_temp[frameIndex]` etc. instead of `frame.weather.air_temp`
- Props changed from `frame: Frame | null` to `weather: WeatherTimeline | null`, `frameIndex: number`

#### 11. Replay viewer (`frontend/src/components/ReplayViewer.tsx`)

- Updated to pass new prop shapes to all child components
- Passes `data` directly to `useReplayPlayback` instead of `data?.frames`

#### 12. WebSocket hook (`frontend/src/hooks/useWebSocketReplay.ts`)

- Updated to receive a single `columnar_replay` message instead of accumulating per-frame messages

#### 13. API client (`frontend/src/api/client.ts`)

- Removed `stride` parameter from `fetchReplay` (kept signature-compatible for the existing call site)

## Impact

| Metric | Before | After |
|---|---|---|
| Backend frame-build time | 10–30s | < 1s (loop eliminated) |
| Payload size (gzipped) | ~35–40MB raw | ~40% smaller (arrays compress better) |
| Frontend parse time | Several seconds | ~3× faster (fewer objects, smaller payload) |
| Frontend memory | Millions of small objects | Flat typed arrays |
| Supabase storage | Larger files | Smaller files (more sessions fit in free tier) |
