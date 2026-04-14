import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Timer } from 'lucide-react';
import { useLap } from '../api/queries';
import GlassPanel from '../components/glass/GlassPanel';
import type { TelemetrySample } from '../types/api';

const KNOWN_DRIVERS = [
  'VER','PER','HAM','RUS','LEC','SAI','NOR','PIA','ALO','STR',
  'OCO','GAS','HUL','MAG','BOT','ZHO','ALB','SAR','TSU','RIC',
];

function SparkLine({ data, color, label }: { data: number[]; color: string; label: string }) {
  if (!data.length) return null;
  const W = 280, H = 48, PAD = 4;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (v - min) / range) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M${pts.join(' L')}`;
  const fill = `M${pts[0]} L${pts.join(' L')} L${W - PAD},${H - PAD} L${PAD},${H - PAD} Z`;

  return (
    <div>
      <p className="text-[10px] font-mono text-zinc-500 mb-1">{label}</p>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id={`grad-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fill} fill={`url(#grad-${label})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function SectorBadge({ label, value }: { label: string; value: number | null }) {
  return (
    <GlassPanel className="flex flex-col items-center p-3 gap-1">
      <span className="text-[10px] font-mono text-zinc-500 uppercase">{label}</span>
      <span className="text-sm font-mono text-white">
        {value !== null ? `${value.toFixed(3)}s` : '—'}
      </span>
    </GlassPanel>
  );
}

export default function LapAnalysis() {
  const { year, round, session } = useParams<{ year: string; round: string; session: string }>();
  const y = parseInt(year ?? '0', 10);
  const r = parseInt(round ?? '0', 10);
  const s = session ?? 'R';

  const [driver, setDriver] = useState('VER');
  const [lap, setLap] = useState(1);
  const [submitted, setSubmitted] = useState(false);

  const enabled = submitted && !!driver && !!lap;
  const { data, isLoading, error } = useLap(y, r, s, driver, lap, enabled);

  const speeds = data?.samples.map((s: TelemetrySample) => s.speed) ?? [];
  const throttles = data?.samples.map((s: TelemetrySample) => s.throttle) ?? [];
  const brakes = data?.samples.map((s: TelemetrySample) => s.brake) ?? [];
  const gears = data?.samples.map((s: TelemetrySample) => s.gear) ?? [];

  return (
    <div className="min-h-screen bg-[#0A0B14] flex flex-col">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="flex items-center gap-4 px-5 py-3 border-b border-white/5 bg-white/[0.02] flex-shrink-0"
      >
        <Link to="/" className="font-mono text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5">
          <ArrowLeft size={14} /> Back
        </Link>
        <div>
          <p className="text-sm font-semibold text-white flex items-center gap-2">
            <Timer size={14} className="text-[var(--accent)]" /> Lap Analysis
          </p>
          <p className="text-[10px] font-mono text-zinc-500">{y} · Round {r} · {s}</p>
        </div>
      </motion.header>

      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        {/* Picker */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        >
          <GlassPanel className="p-5 mb-6">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Driver</label>
                <select
                  value={driver}
                  onChange={(e) => { setDriver(e.target.value); setSubmitted(false); }}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[var(--accent)]/50"
                >
                  {KNOWN_DRIVERS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">Lap Number</label>
                <input
                  type="number"
                  min={1}
                  max={80}
                  value={lap}
                  onChange={(e) => { setLap(parseInt(e.target.value, 10) || 1); setSubmitted(false); }}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono w-24 focus:outline-none focus:border-[var(--accent)]/50"
                />
              </div>
              <button
                onClick={() => setSubmitted(true)}
                disabled={!driver || !lap}
                className="py-2 px-5 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-all"
              >
                Analyze
              </button>
            </div>
          </GlassPanel>
        </motion.div>

        {/* Loading */}
        {submitted && isLoading && (
          <div className="flex flex-col items-center gap-3 py-16">
            <div className="w-7 h-7 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
            <p className="font-mono text-sm text-zinc-400 animate-pulse">Loading lap data…</p>
          </div>
        )}

        {/* Error */}
        {submitted && error && (
          <GlassPanel className="p-6 text-center">
            <p className="text-sm text-zinc-300">{(error as Error)?.message ?? 'Failed to load lap data'}</p>
          </GlassPanel>
        )}

        {/* Results */}
        {submitted && data && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="flex flex-col gap-5"
          >
            {/* Lap time + sectors */}
            <div>
              <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-3">
                {data.driver} · Lap {data.lap_number}
              </p>
              <div className="flex gap-3 flex-wrap">
                <GlassPanel glow className="flex flex-col items-center p-4 gap-1 min-w-[100px]">
                  <span className="text-[10px] font-mono text-zinc-500">Lap Time</span>
                  <span className="text-lg font-mono font-bold text-white">
                    {data.lap_time_s !== null ? `${data.lap_time_s.toFixed(3)}s` : '—'}
                  </span>
                </GlassPanel>
                <SectorBadge label="S1" value={data.sector_times.sector1} />
                <SectorBadge label="S2" value={data.sector_times.sector2} />
                <SectorBadge label="S3" value={data.sector_times.sector3} />
              </div>
            </div>

            {/* Telemetry charts */}
            <GlassPanel className="p-5 flex flex-col gap-5">
              <SparkLine data={speeds} color="#e11d48" label="Speed (km/h)" />
              <SparkLine data={throttles} color="#22c55e" label="Throttle %" />
              <SparkLine data={brakes} color="#f59e0b" label="Brake" />
              <SparkLine data={gears} color="#a78bfa" label="Gear" />
            </GlassPanel>
          </motion.div>
        )}
      </div>
    </div>
  );
}
