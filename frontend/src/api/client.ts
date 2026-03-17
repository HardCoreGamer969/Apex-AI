import type { ReplayPayload, Session, QualifyingPayload } from '../types/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8765';

// Local desktop: no cold starts — use shorter timeouts
const REPLAY_TIMEOUT_MS = 600_000; // 10 min for first-ever load (FastF1 download)
const POLL_INTERVAL_MS = 2_000;    // Poll faster locally
const RETRY_EXTENSION_MS = 60_000;
const MAX_RETRY_CYCLES = 1;

interface TaskStatus {
  task_id: string;
  status: 'pending' | 'computing' | 'ready' | 'error';
  progress: string | null;
  error: string | null;
}

async function fetchApi<T>(
  path: string,
  params?: Record<string, string | number>,
  options?: { timeoutMs?: number },
): Promise<T> {
  const url = new URL(path, API_BASE);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }
    const text = await res.text();
    if (!text) throw new Error('Empty response from server');
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`JSON parse failed (response length: ${text.length}, first 200 chars: ${text.slice(0, 200)})`);
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new Error('Request timed out. The first load for a session downloads F1 data and can take a few minutes.');
      }
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('Load failed')) {
        throw new Error('Connection failed. The backend may still be starting up — wait a few seconds and try again.');
      }
    }
    throw err;
  }
}

/**
 * Fetch an endpoint that may return 202 with a task_id for async computation.
 * Polls /replay/status until the task is done, then re-fetches the original
 * endpoint (which should now hit cache).
 */
async function fetchWithPolling<T>(
  path: string,
  params?: Record<string, string | number>,
  onProgress?: (msg: string) => void,
): Promise<T> {
  const url = new URL(path, API_BASE);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }

  const startTime = Date.now();
  let deadline = startTime + REPLAY_TIMEOUT_MS;
  let retryCycles = 0;

  const res = await fetch(url.toString());
  if (!res.ok && res.status !== 202) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  const body = await res.json();

  if (res.status !== 202) {
    return body as T;
  }

  let taskId: string = body.task_id;
  onProgress?.('Server is computing this session...');

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    // Tiered progress messages based on elapsed time
    const elapsed = Date.now() - startTime;

    try {
      const status = await fetchApi<TaskStatus>('/replay/status', { task_id: taskId });

      if (status.status === 'ready') {
        onProgress?.('Loading cached data...');
        return fetchApi<T>(path, params, { timeoutMs: 60_000 });
      }

      if (status.status === 'error') {
        throw new Error(status.error ?? 'Computation failed on server');
      }

      // Show backend progress if available, otherwise use tiered messages
      if (status.progress && status.progress !== 'Computing...') {
        onProgress?.(status.progress);
      } else if (elapsed > 120_000) {
        onProgress?.('Almost there — processing final data...');
      } else if (elapsed > 30_000) {
        onProgress?.('Processing telemetry — large sessions can take a few minutes...');
      } else {
        onProgress?.('Computing session data...');
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Unknown task_id')) {
        // Instance may have restarted; retry original request - cache may be populated
        onProgress?.('Retrying...');
        const retryRes = await fetch(url.toString());
        if (!retryRes.ok && retryRes.status !== 202) {
          const text = await retryRes.text();
          throw new Error(`API error ${retryRes.status}: ${text}`);
        }
        const retryBody = await retryRes.json();
        if (retryRes.status !== 202) {
          return retryBody as T;
        }
        taskId = retryBody.task_id;
        continue;
      }
      if (err instanceof Error && (err.message.includes('API error') || err.message.includes('Computation failed'))) {
        throw err;
      }
      onProgress?.('Waiting for server...');
    }
  }

  // Deadline expired — auto-retry: re-fetch the original endpoint.
  // Computation may have finished just after our deadline; if so the cache will serve it immediately.
  while (retryCycles < MAX_RETRY_CYCLES) {
    retryCycles++;
    onProgress?.(`Session is taking longer than expected — retrying (${retryCycles}/${MAX_RETRY_CYCLES})...`);

    const retryRes = await fetch(url.toString());
    if (!retryRes.ok && retryRes.status !== 202) {
      const text = await retryRes.text();
      throw new Error(`API error ${retryRes.status}: ${text}`);
    }
    const retryBody = await retryRes.json();

    // Cache was populated — return immediately
    if (retryRes.status !== 202) {
      onProgress?.('Loading cached data...');
      return retryBody as T;
    }

    // Still computing — extend deadline and keep polling
    taskId = retryBody.task_id;
    deadline = Date.now() + RETRY_EXTENSION_MS;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      try {
        const status = await fetchApi<TaskStatus>('/replay/status', { task_id: taskId });
        if (status.status === 'ready') {
          onProgress?.('Loading cached data...');
          return fetchApi<T>(path, params, { timeoutMs: 60_000 });
        }
        if (status.status === 'error') {
          throw new Error(status.error ?? 'Computation failed on server');
        }
        onProgress?.(status.progress ?? 'Still computing...');
      } catch (err) {
        if (err instanceof Error && (err.message.includes('API error') || err.message.includes('Computation failed'))) {
          throw err;
        }
      }
    }
  }

  throw new Error('Session computation is taking too long. Please try again in a few minutes.');
}

export async function fetchSessions(year?: number, place?: string): Promise<Session[]> {
  const params: Record<string, string | number> = {};
  if (year) params.year = year;
  if (place) params.place = place;
  return fetchApi<Session[]>('/sessions', Object.keys(params).length ? params : undefined);
}

export async function fetchRaceNames(startYear = 2018, endYear = 2025): Promise<string[]> {
  return fetchApi<string[]>('/sessions/race-names', { start_year: startYear, end_year: endYear });
}

export async function fetchReplay(
  year: number,
  round: number,
  session: 'R' | 'S',
  keyframeInterval?: number,
  onProgress?: (msg: string) => void,
): Promise<ReplayPayload> {
  const params: Record<string, string | number> = { year, round, session };
  if (keyframeInterval !== undefined && keyframeInterval >= 0) {
    params.keyframe_interval = keyframeInterval;
  }
  return fetchWithPolling<ReplayPayload>('/replay', params, onProgress);
}

export async function fetchQualifying(
  year: number,
  round: number,
  session: 'Q' | 'SQ' = 'Q',
  onProgress?: (msg: string) => void,
): Promise<QualifyingPayload> {
  return fetchWithPolling<QualifyingPayload>('/replay/qualifying', { year, round, session }, onProgress);
}
