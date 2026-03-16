import type { ReplayPayload, Session, QualifyingPayload } from '../types/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const REPLAY_TIMEOUT_MS = 300_000; // 5 min overall timeout for polling loop
const POLL_INTERVAL_MS = 4_000;

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
        throw new Error('Request timed out. First replay load can take 1–2 minutes — try again or pick a different race.');
      }
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('Load failed')) {
        throw new Error('Connection failed. The server may be starting up (Render free tier spins down after inactivity). Try again in 30s.');
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

  const deadline = Date.now() + REPLAY_TIMEOUT_MS;

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

    try {
      const status = await fetchApi<TaskStatus>('/replay/status', { task_id: taskId });

      if (status.status === 'ready') {
        onProgress?.('Loading cached data...');
        return fetchApi<T>(path, params, { timeoutMs: 60_000 });
      }

      if (status.status === 'error') {
        throw new Error(status.error ?? 'Computation failed on server');
      }

      onProgress?.(status.progress ?? 'Computing...');
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

  throw new Error('Timed out waiting for session computation. Please try again.');
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
