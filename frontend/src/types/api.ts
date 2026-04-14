export interface Session {
  round_number: number;
  event_name: string;
  date: string;
  country: string;
  type: string;
  session_dates: Record<string, string>;
  year?: number;
}

export interface DriverFrame {
  x: number;
  y: number;
  dist: number;
  lap: number;
  position: number;
  speed: number;
  gear: number;
  drs: number;
  rel_dist: number;
  tyre: number;
  tyre_life?: number;
  throttle?: number;
  brake?: number;
}

export interface Frame {
  t: number;
  lap: number;
  drivers: Record<string, DriverFrame>;
  weather?: {
    air_temp?: number;
    humidity?: number;
    rain_state?: string;
    track_temp?: number;
    wind_direction?: number;
    wind_speed?: number;
  };
}

export interface DRSZone {
  start: { x: number; y: number; index: number };
  end: { x: number; y: number; index: number };
}

export interface Track {
  centerline_x: number[];
  centerline_y: number[];
  inner_x: number[];
  inner_y: number[];
  outer_x: number[];
  outer_y: number[];
  x_min: number;
  x_max: number;
  y_min: number;
  y_max: number;
  drs_zones: DRSZone[];
}

export interface SessionInfo {
  event_name: string;
  circuit_name: string;
  country: string;
  year: number;
  round: number;
  date: string;
  total_laps: number;
  circuit_length_m: number | null;
}

export interface ReplayPayload {
  frames: Frame[];
  driver_colors: Record<string, string>;
  track_statuses: unknown[];
  total_laps: number;
  max_tyre_life: Record<string, number>;
  track: Track;
  circuit_rotation: number;
  session_info: SessionInfo;
}

export interface QualifyingDriver {
  code: string;
  full_name: string;
  position: number;
  color: string;
  Q1: string | null;
  Q2: string | null;
  Q3: string | null;
}

export interface QualifyingPayload {
  results: QualifyingDriver[];
  max_speed: number;
  min_speed: number;
  session_info: {
    event_name: string;
    circuit_name: string;
    country: string;
    year: number;
    round: number;
    date: string;
  };
}

export interface Stint {
  stint: number;
  compound: 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET' | 'UNKNOWN';
  start_lap: number;
  end_lap: number;
  avg_lap_time_s: number | null;
  pit_stop_lap: number | null;
}

export interface DriverStrategy {
  driver: string;
  team_color: string;
  stints: Stint[];
}

export type StrategyPayload = DriverStrategy[];

export interface TelemetrySample {
  speed: number;
  throttle: number;
  brake: number;
  gear: number;
  drs: number;
  distance: number;
}

export interface TelemetryLap {
  lap_number: number;
  samples: TelemetrySample[];
}

export interface TelemetryPayload {
  driver: string;
  laps: TelemetryLap[];
}

export interface LapSectorTimes {
  sector1: number | null;
  sector2: number | null;
  sector3: number | null;
}

export interface LapPayload {
  driver: string;
  lap_number: number;
  lap_time_s: number | null;
  sector_times: LapSectorTimes;
  samples: TelemetrySample[];
}

export interface CompareDriverData {
  driver: string;
  color: string;
  frames: Array<{
    lap: number;
    x: number;
    y: number;
    speed: number;
    dist: number;
  }>;
}

export interface ComparePayload {
  driver_a: CompareDriverData;
  driver_b: CompareDriverData;
  gap_series: Array<{ dist: number; gap_s: number }>;
  session_info: SessionInfo;
  track: Track;
  circuit_rotation: number;
}
