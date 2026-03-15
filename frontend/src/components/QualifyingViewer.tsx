import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchQualifying } from '../api/client';
import type { QualifyingPayload } from '../types/api';

function formatLapTime(seconds: string | null): string {
  if (!seconds) return '-';
  const s = parseFloat(seconds);
  if (isNaN(s)) return '-';
  const mins = Math.floor(s / 60);
  const secs = (s % 60).toFixed(3);
  return mins > 0 ? `${mins}:${secs.padStart(6, '0')}` : secs;
}

export default function QualifyingViewer() {
  const { year, round, session } = useParams<{ year: string; round: string; session: string }>();
  const [data, setData] = useState<QualifyingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const y = parseInt(year ?? '0', 10);
    const r = parseInt(round ?? '0', 10);
    const s = (session === 'SQ' ? 'SQ' : 'Q') as 'Q' | 'SQ';
    if (!y || !r) { setError('Invalid session.'); setLoading(false); return; }
    fetchQualifying(y, r, s)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [year, round, session]);

  if (loading) {
    return (
      <div className="replay-viewer">
        <div className="loading">
          <p>Loading qualifying results...</p>
          <p className="muted">This may take a minute if the session hasn't been cached yet.</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="replay-viewer">
        <div className="error-banner">{error ?? 'Failed to load qualifying'}</div>
        <Link to="/">Back to sessions</Link>
      </div>
    );
  }

  return (
    <div className="replay-viewer">
      <header className="replay-header">
        <Link to="/" className="back-link">← Back</Link>
        <div className="session-info">
          <h2>{data.session_info.event_name} — Qualifying</h2>
          <p className="meta">
            {data.session_info.circuit_name} · {data.session_info.country} · {data.session_info.date}
          </p>
        </div>
      </header>

      <div className="qualifying-table-container">
        <table className="qualifying-table">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Driver</th>
              <th>Q1</th>
              <th>Q2</th>
              <th>Q3</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((d) => (
              <tr key={d.code}>
                <td className="pos">{d.position}</td>
                <td className="driver">
                  <span className="driver-dot" style={{ backgroundColor: d.color }} />
                  <span className="driver-code">{d.code}</span>
                  <span className="driver-name">{d.full_name}</span>
                </td>
                <td className="time">{formatLapTime(d.Q1)}</td>
                <td className="time">{formatLapTime(d.Q2)}</td>
                <td className="time">{formatLapTime(d.Q3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
