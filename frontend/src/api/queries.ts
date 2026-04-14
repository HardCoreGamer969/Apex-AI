import { useQuery } from '@tanstack/react-query';
import { fetchSessions, fetchRaceNames, fetchReplay, fetchQualifying, fetchStrategy, fetchTelemetry, fetchLap, fetchCompare } from './client';

export function useSessions(year?: number, placeOrOptions?: string | { enabled?: boolean }, options?: { enabled?: boolean }) {
  const place = typeof placeOrOptions === 'string' ? placeOrOptions : undefined;
  const opts = typeof placeOrOptions === 'object' ? placeOrOptions : options;
  return useQuery({
    queryKey: ['sessions', year, place],
    queryFn: () => fetchSessions(year, place),
    staleTime: 5 * 60 * 1000,
    enabled: opts?.enabled ?? true,
  });
}

export function useRaceNames(startYear = 2018, endYear = new Date().getFullYear()) {
  return useQuery({
    queryKey: ['raceNames', startYear, endYear],
    queryFn: () => fetchRaceNames(startYear, endYear),
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useReplay(year: number, round: number, session: 'R' | 'S', enabled = true) {
  return useQuery({
    queryKey: ['replay', year, round, session],
    queryFn: () => fetchReplay(year, round, session),
    enabled: enabled && !!year && !!round,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export function useQualifying(year: number, round: number, session: 'Q' | 'SQ' = 'Q', enabled = true) {
  return useQuery({
    queryKey: ['qualifying', year, round, session],
    queryFn: () => fetchQualifying(year, round, session),
    enabled: enabled && !!year && !!round,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export function useStrategy(year: number, round: number, session: 'R' | 'S' = 'R', enabled = true) {
  return useQuery({
    queryKey: ['strategy', year, round, session],
    queryFn: () => fetchStrategy(year, round, session),
    enabled: enabled && !!year && !!round,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export function useTelemetry(year: number, round: number, session: string, driver: string, enabled = true) {
  return useQuery({
    queryKey: ['telemetry', year, round, session, driver],
    queryFn: () => fetchTelemetry(year, round, session, driver),
    enabled: enabled && !!year && !!round && !!driver,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export function useLap(year: number, round: number, session: string, driver: string, lap: number, enabled = true) {
  return useQuery({
    queryKey: ['lap', year, round, session, driver, lap],
    queryFn: () => fetchLap(year, round, session, driver, lap),
    enabled: enabled && !!year && !!round && !!driver && !!lap,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export function useCompare(year: number, round: number, session: string, driverA: string, driverB: string, enabled = true) {
  return useQuery({
    queryKey: ['compare', year, round, session, driverA, driverB],
    queryFn: () => fetchCompare(year, round, session, driverA, driverB),
    enabled: enabled && !!year && !!round && !!driverA && !!driverB,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}
