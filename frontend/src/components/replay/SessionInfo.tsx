import type { SessionInfo as SessionInfoType } from '../../types/api';

interface SessionInfoProps {
  info: SessionInfoType | null;
}

export default function SessionInfo({ info }: SessionInfoProps) {
  if (!info) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="font-ui text-base font-semibold text-white">{info.event_name}</h2>
      <p className="font-mono text-xs text-zinc-400">
        {info.circuit_name} · {info.country} · {info.date}
        {info.total_laps > 0 && ` · ${info.total_laps} laps`}
        {info.circuit_length_m != null && ` · ${Math.round(info.circuit_length_m)}m`}
      </p>
    </div>
  );
}
