import type { ReplayPayload, Session } from '../types/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

async function fetchApi<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(path, API_BASE);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }
  const res = await fetch(url.toString());
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
  return fetchApi<ReplayPayload>('/replay', { year, round, session, stride });
}
