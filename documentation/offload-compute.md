# Offload Compute to GitHub Actions and Browser

This document describes how ApexAI offloads replay computation to GitHub Actions and reduces payload size via browser-side keyframe interpolation, so Render serves cache hits with minimal memory.

---

## Goals

1. **GitHub Actions**: Run FastF1 computation in CI, upload results to Supabase. Render only serves cache hits (no heavy compute).
2. **Browser**: Receive smaller keyframe payloads and interpolate for smooth playback. Reduces backend payload size and memory.

---

## Part 1: GitHub Actions Pre-Computation

### Architecture

```
GitHub Actions (scheduled weekly)
    → precompute_to_supabase.py
    → get_replay_data() + replay_set()
    → Supabase Storage (replay-cache bucket)

Render Backend
    → replay_get() checks Supabase first
    → Cache hit = instant response, no compute
```

### Implementation

**Script:** `scripts/precompute_to_supabase.py`

- Standalone script runnable via `uv run python scripts/precompute_to_supabase.py`
- Reads sessions from env `PRECOMPUTE_SESSIONS` (JSON array) or defaults to 2024 rounds 1–6
- For each session: calls `get_replay_data` with `keyframe_interval=5`, uploads via `replay_set`
- Requires `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- Sets `RENDER=1`, `MPLBACKEND=Agg`, `MPLCONFIGDIR=/tmp/mpl` before importing

**Workflow:** `.github/workflows/precompute.yml`

- **Trigger**: `schedule` (Monday 2am UTC) and `workflow_dispatch` for manual runs
- **Job**: checkout → setup Python 3.11 → install uv → `uv sync` → run script
- **Secrets**: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- **Optional**: `PRECOMPUTE_SESSIONS` repo variable (JSON array of `{year, round, session}`)

**Setup**

1. Add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` as GitHub repository secrets
2. Optionally set `PRECOMPUTE_SESSIONS` as a repo variable to customize which sessions are precomputed

---

## Part 2: Browser Keyframe Interpolation

### Concept

- **Backend**: Sends 1 sample per 5 seconds (`keyframe_interval=5`) instead of 2 per second. Payload ~10x smaller.
- **Browser**: Advances playback by race time (seconds), derives `indexA`, `indexB`, `alpha` from the timeline, interpolates between keyframes with `lerp`.

### Implementation

**Backend**

- `backend/services/f1_adapter.py`: `get_replay_data` accepts `keyframe_interval` (default 5). When > 0, uses `target_fps = 1/keyframe_interval`; when 0, uses full 2fps.
- `backend/routers/replay.py`: Query param `keyframe_interval` (default 5)
- Payload includes `keyframe_interval` for frontend metadata

**Frontend**

- `frontend/src/hooks/useReplayPlayback.ts`: Time-based playback
  - Advances `currentTimeRef` by `(elapsed/1000) * playbackSpeed` (race seconds)
  - Derives `indexA`, `indexB`, `alpha` from `currentTime` and `data.timeline`
  - `indexA` = last index where `timeline[i] <= currentTime`
  - `alpha` = fractional position between keyframes for smooth interpolation
- `frontend/src/api/client.ts`: `fetchReplay` accepts `keyframeInterval`, passes as query param
- `TrackCanvas`, `Leaderboard`, `WeatherPanel`: No changes — already use `interpRef` and `frameIndex`

---

## File Reference

| File | Purpose |
|------|---------|
| `scripts/precompute_to_supabase.py` | Standalone precompute + Supabase upload |
| `.github/workflows/precompute.yml` | Scheduled workflow |
| `backend/routers/replay.py` | `keyframe_interval` query param |
| `backend/services/f1_adapter.py` | `keyframe_interval` param, `target_fps` logic |
| `backend/services/tasks.py` | Passes `keyframe_interval=5` to `get_replay_data` |
| `frontend/src/hooks/useReplayPlayback.ts` | Time-based playback |
| `frontend/src/api/client.ts` | `keyframe_interval` in fetch |
| `frontend/src/types/api.ts` | `keyframe_interval` in `ReplayPayload` |

---

## Trade-offs

| Aspect | Benefit | Cost |
|--------|---------|------|
| GA precompute | Render rarely computes; cache hits = low memory | GA minutes (free for public repos); sessions must be precomputed ahead |
| Keyframe 5s | ~10x smaller payload, less backend memory | Slightly less accurate motion between keyframes (5s interpolation) |
| Time-based playback | Works for any keyframe interval, cleaner model | Small refactor of playback hook |

---

## Verification

1. **GA**: Run workflow manually, check Supabase bucket for new files, then request same session from app — should be instant (cache hit).
2. **Keyframe**: Request replay with `keyframe_interval=5`, verify smaller payload, smooth playback, and correct positions/laps.
