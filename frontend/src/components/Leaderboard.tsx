import type { ColumnarDriverData } from '../types/api';

interface LeaderboardProps {
  drivers: Record<string, ColumnarDriverData>;
  frameIndex: number;
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

export default function Leaderboard({ drivers, frameIndex, driverColors }: LeaderboardProps) {
  const codes = Object.keys(drivers);
  if (codes.length === 0) {
    return (
      <div className="leaderboard">
        <h3>Leaderboard</h3>
        <p className="muted">No data</p>
      </div>
    );
  }

  const rows = codes
    .map((code) => {
      const d = drivers[code];
      return {
        code,
        position: d.position[frameIndex] ?? 99,
        lap: d.lap[frameIndex] ?? 0,
        speed: d.speed[frameIndex] ?? 0,
        tyre: d.tyre[frameIndex] ?? 0,
      };
    })
    .sort((a, b) => a.position - b.position);

  return (
    <div className="leaderboard">
      <h3>Leaderboard</h3>
      <ul>
        {rows.map((d) => (
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
