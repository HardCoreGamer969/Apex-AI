import { useEffect, useState, useRef } from 'react';
import type { ReplayPayload } from '../types/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const wsBase = API_BASE.replace(/^http/, 'ws');

interface UseWebSocketReplayParams {
  year: number;
  round: number;
  session: string;
}

export function useWebSocketReplay({
  year,
  round,
  session,
}: UseWebSocketReplayParams) {
  const [data, setData] = useState<ReplayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    setData(null);
    setLoading(true);
    setError(null);
    setProgress(0);

    const url = `${wsBase}/ws/replay`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ year, round, session }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'columnar_replay') {
          const { type: _t, ...payload } = msg;
          setData(payload as ReplayPayload);
          setLoading(false);
          setProgress(1);
        } else if (msg.type === 'done') {
          ws.close();
        } else if (msg.type === 'error') {
          setError(msg.detail ?? msg.message ?? 'Unknown error');
          setLoading(false);
          ws.close();
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
