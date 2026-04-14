import type { Frame } from '../../types/api';

interface WeatherPanelProps {
  frame: Frame | null;
}

export default function WeatherPanel({ frame }: WeatherPanelProps) {
  const weather = frame?.weather;
  if (!weather) return null;

  const items = [
    weather.air_temp != null && { label: 'Air', value: `${Math.round(weather.air_temp)}°C` },
    weather.track_temp != null && { label: 'Track', value: `${Math.round(weather.track_temp)}°C` },
    weather.humidity != null && { label: 'Humidity', value: `${Math.round(weather.humidity)}%` },
    weather.wind_speed != null && { label: 'Wind', value: `${Math.round(weather.wind_speed)} km/h` },
    weather.rain_state && {
      label: 'Conditions',
      value: weather.rain_state === 'RAINING' ? 'Wet' : 'Dry',
      className: weather.rain_state === 'RAINING' ? 'text-blue-400' : 'text-green-400',
    },
  ].filter(Boolean) as { label: string; value: string; className?: string }[];

  return (
    <div className="mt-4 pt-4 border-t border-white/5">
      <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-400 mb-3">Weather</h3>
      <div className="grid grid-cols-2 gap-2">
        {items.map(({ label, value, className }) => (
          <div key={label} className="flex flex-col gap-0.5">
            <span className="font-mono text-xs text-zinc-500">{label}</span>
            <span className={`font-mono text-xs font-medium text-white ${className ?? ''}`}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
