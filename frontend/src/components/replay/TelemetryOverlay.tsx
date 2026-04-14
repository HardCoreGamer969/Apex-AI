import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/cn';
import type { Frame } from '../../types/api';
import GlassPanel from '../glass/GlassPanel';

interface TelemetryOverlayProps {
  frames: Frame[];
  frameIndex: number;
  selectedDriver: string | null;
  toggles: {
    speed: boolean;
    throttle: boolean;
    brake: boolean;
    gear: boolean;
    drs: boolean;
  };
  onToggle: (channel: keyof TelemetryOverlayProps['toggles']) => void;
}

const CHANNELS = ['speed', 'throttle', 'brake', 'gear', 'drs'] as const;
type Channel = (typeof CHANNELS)[number];

const CHANNEL_LABELS: Record<Channel, string> = {
  speed: 'Speed', throttle: 'Throttle', brake: 'Brake', gear: 'Gear', drs: 'DRS',
};

const CHANNEL_COLORS: Record<Channel, string> = {
  speed: '#f59e0b', throttle: '#22c55e', brake: '#e11d48', gear: '#818cf8', drs: '#38bdf8',
};

const CHANNEL_MAX: Record<Channel, number> = {
  speed: 360, throttle: 100, brake: 100, gear: 8, drs: 1,
};

function getChannelValue(frame: Frame, driver: string, channel: Channel): number | null {
  const d = frame?.drivers?.[driver];
  if (!d) return null;
  switch (channel) {
    case 'speed': return d.speed;
    case 'throttle': return d.throttle ?? null;
    case 'brake': return d.brake != null ? (d.brake ? 100 : 0) : null;
    case 'gear': return d.gear;
    case 'drs': return d.drs;
  }
}

export default function TelemetryOverlay({
  frames, frameIndex, selectedDriver, toggles, onToggle,
}: TelemetryOverlayProps) {
  const activeChannels = CHANNELS.filter((c) => toggles[c]);
  const windowSize = 120;
  const start = Math.max(0, frameIndex - windowSize);
  const visibleFrames = frames.slice(start, frameIndex + 1);

  return (
    <GlassPanel className="p-4 flex flex-col gap-3">
      {/* Channel toggles */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs text-zinc-400 mr-1">Channels:</span>
        {CHANNELS.map((c) => (
          <button
            key={c}
            onClick={() => onToggle(c)}
            className={cn(
              'px-2 py-0.5 rounded font-mono text-xs border transition-all',
              toggles[c]
                ? 'border-transparent text-[#0A0B14] font-medium'
                : 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/20'
            )}
            style={toggles[c] ? { backgroundColor: CHANNEL_COLORS[c] } : undefined}
          >
            {CHANNEL_LABELS[c]}
          </button>
        ))}
      </div>

      {/* Traces */}
      <AnimatePresence>
        {activeChannels.map((channel) => {
          const color = CHANNEL_COLORS[channel];
          const max = CHANNEL_MAX[channel];
          const points = visibleFrames
            .map((f, i) => {
              const v = selectedDriver ? getChannelValue(f, selectedDriver, channel) : null;
              return v != null ? { x: i, y: v } : null;
            })
            .filter(Boolean) as { x: number; y: number }[];

          const w = 400;
          const h = 40;
          const xScale = points.length > 1 ? w / (points.length - 1) : 1;
          const pathD = points.length > 0
            ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * xScale} ${h - (p.y / max) * h}`).join(' ')
            : '';

          return (
            <motion.div
              key={channel}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-3"
            >
              <span
                className="font-mono text-xs w-14 flex-shrink-0"
                style={{ color }}
              >
                {CHANNEL_LABELS[channel]}
              </span>
              <div className="flex-1 overflow-hidden rounded" style={{ height: h }}>
                <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
                  <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </div>
              {selectedDriver && points.length > 0 && (
                <span className="font-mono text-xs w-10 text-right tabular-nums" style={{ color }}>
                  {Math.round(points[points.length - 1].y)}
                  {channel === 'speed' ? '' : channel === 'throttle' || channel === 'brake' ? '%' : ''}
                </span>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>

      {activeChannels.length === 0 && (
        <p className="font-mono text-xs text-zinc-500">Select channels above to display telemetry traces.</p>
      )}
    </GlassPanel>
  );
}
