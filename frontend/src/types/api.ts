export interface Session {
  round_number: number;
  event_name: string;
  date: string;
  country: string;
  type: string;
  session_dates: Record<string, string>;
  year?: number;
}

export interface ColumnarDriverData {
  x: number[];
  y: number[];
  position: number[];
  lap: number[];
  speed: number[];
  tyre: number[];
}

export interface WeatherTimeline {
  air_temp?: number[] | null;
  track_temp?: number[] | null;
  humidity?: number[] | null;
  wind_speed?: number[] | null;
  wind_direction?: number[] | null;
  rainfall?: number[] | null;
  rain_state?: string[] | null;
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
  columnar: true;
  timeline: number[];
  leader_laps: number[];
  drivers: Record<string, ColumnarDriverData>;
  weather_timeline?: WeatherTimeline | null;
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
