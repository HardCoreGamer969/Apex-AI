import type { Frame } from '../types/api';

interface LeaderboardProps {
  frame: Frame | null;
  driverColors: Record<string, string>;
}

const TYRE_LABELS: Record<number, string> = {
  0: '?',
  1: 'S',
  2: 'M',
  3: 'H',
  4: 'I',
  5: 'W',
};

export default function Leaderboard({ frame, driverColors }: LeaderboardProps) {
  if (!frame?.drivers) {
    return (
      <div className="leaderboard">
        <h3>Leaderboard</h3>
        <p className="muted">No data</p>
      </div>
    );
  }

  const drivers = Object.entries(frame.drivers)
    .map(([code, d]) => ({ code, ...d }))
    .sort((a, b) => a.position - b.position);

  return (
    <div className="leaderboard">
      <h3>Leaderboard</h3>
      <ul>
        {drivers.map((d) => (
          <li key={d.code}>
            <span
              className="driver-dot"
              style={{ backgroundColor: driverColors[d.code] || '#888' }}
            />
            <span className="pos">{d.position}</span>
            <span className="code">{d.code}</span>
            <span className="lap">L{d.lap}</span>
            <span className="speed">{Math.round(d.speed)}</span>
            <span className="tyre">{TYRE_LABELS[d.tyre] ?? d.tyre}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
