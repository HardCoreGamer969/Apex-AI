import type { ReplayPayload, Session, QualifyingPayload, StrategyPayload, TelemetryPayload, LapPayload, ComparePayload } from '../types/api';

function normalizeApiBase(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return 'http://localhost:8000';
  // Accept bare hostnames like "my-app.up.railway.app" by prepending https://
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  // Strip trailing slash so `new URL('/path', base)` behaves consistently
  return withScheme.replace(/\/+$/, '');
}

const API_BASE = normalizeApiBase(import.meta.env.VITE_API_URL);

const REPLAY_TIMEOUT_MS = 180_000; // 3 min for replay (first load can take 1–2 min on Render)

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
        throw new Error('Connection failed. The server may be starting up or the request timed out (Render free tier limits to ~30s). Try again.');
      }
    }
    throw err;
  }
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
  stride = 5,
): Promise<ReplayPayload> {
  return fetchApi<ReplayPayload>('/replay', { year, round, session, stride }, { timeoutMs: REPLAY_TIMEOUT_MS });
}

export async function fetchQualifying(
  year: number,
  round: number,
  session: 'Q' | 'SQ' = 'Q',
): Promise<QualifyingPayload> {
  return fetchApi<QualifyingPayload>('/replay/qualifying', { year, round, session });
}

export async function fetchStrategy(year: number, round: number, session: 'R' | 'S' = 'R'): Promise<StrategyPayload> {
  return fetchApi<StrategyPayload>('/strategy', { year, round, session });
}

export async function fetchTelemetry(year: number, round: number, session: string, driver: string): Promise<TelemetryPayload> {
  return fetchApi<TelemetryPayload>('/telemetry', { year, round, session, driver }, { timeoutMs: REPLAY_TIMEOUT_MS });
}

export async function fetchLap(year: number, round: number, session: string, driver: string, lap: number): Promise<LapPayload> {
  return fetchApi<LapPayload>('/lap', { year, round, session, driver, lap }, { timeoutMs: REPLAY_TIMEOUT_MS });
}

export async function fetchCompare(year: number, round: number, session: string, driver_a: string, driver_b: string): Promise<ComparePayload> {
  return fetchApi<ComparePayload>('/compare', { year, round, session, driver_a, driver_b }, { timeoutMs: REPLAY_TIMEOUT_MS });
}
