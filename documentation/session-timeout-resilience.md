# Session Computation Timeout Resilience

This document describes the changes made to eliminate the "Timed out waiting for session computation" error and improve the user experience during long session loads.

---

## Problem

Users occasionally hit a hard error:

> *Timed out waiting for session computation. Please try again.*

This was thrown after 5 minutes of polling (`REPLAY_TIMEOUT_MS = 300_000`) if the backend had not yet returned `status: 'ready'`.

### Root Causes

1. **Large sessions take >5 min** — a full race with 20 drivers can take 6–7 minutes to compute from scratch.
2. **Queue buildup** — only one computation runs at a time (`_compute_semaphore = Semaphore(1)`). If User B arrives while User A's computation is running, User B must wait for A *and* run their own, easily pushing past 5 minutes combined.
3. **Render free tier cold start** — the server spins down after inactivity and takes 30–60s to restart, consuming part of the 5-minute budget before computation even begins.
4. **In-memory task state** — if the server restarts mid-computation, task records are lost from memory; the frontend eventually gets a 404 (`Unknown task_id`) and had to restart from scratch.

The 5-minute deadline was a fixed guess that didn't account for queue depth, server cold starts, or genuine variation in session size.

---

## Changes Implemented

All changes are in `frontend/src/api/client.ts` — no backend changes required.

### 1. Increased Base Timeout (Option B)

```typescript
// Before
const REPLAY_TIMEOUT_MS = 300_000; // 5 min

// After
const REPLAY_TIMEOUT_MS = 480_000; // 8 min
```

8 minutes covers worst-case full race computation (~6–7 min) plus Render cold start overhead (~60s).

---

### 2. Tiered Progress Messages (Option B)

Previously the UI showed `"Computing..."` for the entire wait with no indication of how long was expected. Now messages adapt to elapsed time:

| Elapsed | Message shown |
|---------|--------------|
| 0–30s | `"Computing session data..."` |
| 30–90s | `"Large sessions can take a few minutes — still working..."` |
| >90s | `"Almost there — finishing up..."` |

Backend-provided progress strings (e.g. `"Loading session..."`, `"Saving to cache..."`) still pass through and override the tiered messages when available.

```typescript
if (status.progress && status.progress !== 'Computing...') {
  onProgress?.(status.progress);
} else if (elapsed > 90_000) {
  onProgress?.('Almost there — finishing up...');
} else if (elapsed > 30_000) {
  onProgress?.('Large sessions can take a few minutes — still working...');
} else {
  onProgress?.('Computing session data...');
}
```

---

### 3. Auto-Retry on Deadline Expiry (Option A)

Previously the deadline expiring immediately threw the error to the user. Now the code makes up to **2 retry cycles** before giving up.

**Flow on deadline expiry:**

1. Re-fetch the original endpoint (`GET /replay` or `GET /replay/qualifying`)
2. **If it returns 200** → computation finished during the wait and the cache was populated; return data immediately (user never sees an error)
3. **If it returns 202** → still computing; update `task_id`, extend the deadline by 2 minutes (`RETRY_EXTENSION_MS = 120_000`), and continue polling
4. Repeat up to `MAX_RETRY_CYCLES = 2` times
5. Only throw after both cycles are exhausted

**New constants:**

```typescript
const RETRY_EXTENSION_MS = 120_000; // +2 min per retry cycle
const MAX_RETRY_CYCLES = 2;
```

**Worst-case total wait:** 8 min (initial) + 2 × 2 min (retries) = **12 minutes** before surfacing an error.

This catches the most common real-world failure scenario — computation finishes just after the initial deadline — without any user-visible error at all.

The updated error message (only shown after all retries fail) is:

> *Session computation is taking too long. Please try again in a few minutes.*

---

## What Was Planned but Not Yet Implemented

### Option C — Queue Position + Dynamic Deadline

Track queue position in the backend (`tasks.py`) and surface it in the `/replay/status` response alongside an estimated wait time. The frontend would then:

- Show messages like `"You are #2 in queue — estimated wait: ~4 min"`
- Dynamically set `deadline = now + estimated_wait_seconds + 60s` instead of a fixed constant

This eliminates false timeouts caused purely by queue depth and makes the UX honest about why the wait is long.

**Files that would change:** `backend/services/tasks.py`, `backend/routers/replay.py`, `frontend/src/api/client.ts`

---

### Option D — Persistent Task State via Supabase

Fix a restart-recovery gap: `find_active_task()` only checks the in-memory `_active_keys` dict. After a server restart the dict is empty, so a new task is created even if Supabase still records the previous one as `'computing'`. This can cause two concurrent computations for the same session.

Fix: on an in-memory miss, query Supabase for any non-stale task (created <15 min ago, status `pending` or `computing`) for the same `(year, round, session)` key. Requires migrating task state from Supabase Storage files to a proper Supabase `tasks` database table with an index on `(year, round, session, status)`.

**Files that would change:** `backend/services/tasks.py`, `backend/services/cache.py` (schema migration)

---

### Option E — Server-Sent Events (SSE) Progress Stream

Replace the 4-second polling loop entirely with Server-Sent Events. The backend pushes progress updates in real time and the frontend is notified the instant computation finishes — no more 4-second lag on completion.

Would also enable per-driver granularity in progress messages (e.g. `"Processing HAM telemetry... 8/20"`).

**Files that would change:** `backend/routers/replay.py`, `backend/services/tasks.py`, `frontend/src/api/client.ts`, `backend/services/f1_adapter.py`

---

## Affected Files

| File | Change |
|------|--------|
| `frontend/src/api/client.ts` | Timeout increase, tiered messages, auto-retry on deadline expiry |
