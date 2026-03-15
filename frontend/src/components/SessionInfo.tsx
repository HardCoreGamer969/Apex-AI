import type { SessionInfo as SessionInfoType } from '../types/api';

interface SessionInfoProps {
  info: SessionInfoType | null;
}

export default function SessionInfo({ info }: SessionInfoProps) {
  if (!info) return null;

  return (
    <div className="session-info">
      <h2>{info.event_name}</h2>
      <p className="meta">
        {info.circuit_name} · {info.country} · {info.date}
      </p>
      <p className="laps">
        {info.total_laps} laps
        {info.circuit_length_m != null && ` · ${Math.round(info.circuit_length_m)}m`}
      </p>
    </div>
  );
}
