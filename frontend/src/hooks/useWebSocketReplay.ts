import { useEffect, useState, useRef } from 'react';
import type { ReplayPayload, Frame } from '../types/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const wsBase = API_BASE.replace(/^http/, 'ws');

interface UseWebSocketReplayParams {
  year: number;
  round: number;
  session: string;
}

interface ReplayMetadata
  extends Omit<ReplayPayload, 'frames'> {}

export function useWebSocketReplay({
  year,
  round,
  session,
}: UseWebSocketReplayParams) {
  const [data, setData] = useState<ReplayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const metadataRef = useRef<ReplayMetadata | null>(null);
  const framesRef = useRef<Frame[]>([]);
  const totalExpectedRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    metadataRef.current = null;
    framesRef.current = [];
    totalExpectedRef.current = null;
    setData(null);
    setLoading(true);
    setError(null);
    setProgress(0);

    const url = `${wsBase}/ws/replay`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          year,
          round,
          session,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const { type } = msg;

        switch (type) {
          case 'metadata': {
            const { type: _t, frames: _f, total_frames: tf, ...meta } = msg;
            metadataRef.current = meta as ReplayMetadata;
            if (typeof tf === 'number') {
              totalExpectedRef.current = tf;
            }
            break;
          }
          case 'frame': {
            const frame = msg.frame as Frame;
            framesRef.current.push(frame);
            const count = framesRef.current.length;
            const total = totalExpectedRef.current;
            setProgress(total != null ? count / total : count);
            break;
          }
          case 'done': {
            const meta = metadataRef.current;
            const frames = [...framesRef.current];
            if (meta) {
              setData({
                ...meta,
                frames,
              });
            } else {
              setData({
                frames,
                driver_colors: {},
                track_statuses: [],
                total_laps: 0,
                max_tyre_life: {},
                track: {
                  centerline_x: [],
                  centerline_y: [],
                  inner_x: [],
                  inner_y: [],
                  outer_x: [],
                  outer_y: [],
                  x_min: 0,
                  x_max: 0,
                  y_min: 0,
                  y_max: 0,
                  drs_zones: [],
                },
                circuit_rotation: 0,
                session_info: {
                  event_name: '',
                  circuit_name: '',
                  country: '',
                  year: 0,
                  round: 0,
                  date: '',
                  total_laps: 0,
                  circuit_length_m: null,
                },
              });
            }
            setLoading(false);
            setProgress(1);
            ws.close();
            break;
          }
          case 'error': {
            setError(msg.detail ?? msg.message ?? 'Unknown error');
            setLoading(false);
            ws.close();
            break;
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to parse message');
        setLoading(false);
        ws.close();
      }
    };

    ws.onerror = () => {
      setError('WebSocket error');
      setLoading(false);
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [year, round, session]);

  return { data, loading, error, progress };
}
