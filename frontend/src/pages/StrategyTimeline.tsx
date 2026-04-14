import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Info } from 'lucide-react';
import { useStrategy } from '../api/queries';
import GlassPanel from '../components/glass/GlassPanel';
import type { DriverStrategy, Stint } from '../types/api';

const COMPOUND_COLORS: Record<string, string> = {
  SOFT: '#e11d48',
  MEDIUM: '#f59e0b',
  HARD: '#e4e4e7',
  INTERMEDIATE: '#22c55e',
  WET: '#3b82f6',
  UNKNOWN: '#71717a',
};

function compoundColor(c: string) {
  return COMPOUND_COLORS[c] ?? COMPOUND_COLORS.UNKNOWN;
}

function StintBar({ stint, totalLaps, scrubLap, onHover }: {
  stint: Stint;
  totalLaps: number;
  scrubLap: number | null;
  onHover: (s: Stint | null) => void;
}) {
  const left = ((stint.start_lap - 1) / totalLaps) * 100;
  const width = Math.max(((stint.end_lap - stint.start_lap + 1) / totalLaps) * 100, 0.8);
  const color = compoundColor(stint.compound);
  const highlighted = scrubLap !== null && scrubLap >= stint.start_lap && scrubLap <= stint.end_lap;

  return (
    <div
      className="absolute top-0 h-full rounded-sm cursor-pointer transition-all"
      style={{
        left: `${left}%`,
        width: `${width}%`,
        backgroundColor: color,
        opacity: highlighted ? 1 : 0.7,
        boxShadow: highlighted ? `0 0 8px ${color}` : undefined,
      }}
      onMouseEnter={() => onHover(stint)}
      onMouseLeave={() => onHover(null)}
    />
  );
}

function PitMarker({ lap, totalLaps }: { lap: number; totalLaps: number }) {
  const left = ((lap - 1) / totalLaps) * 100;
  return (
    <div
      className="absolute top-0 h-full w-px bg-white/40 pointer-events-none"
      style={{ left: `${left}%` }}
    >
      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white/70" />
    </div>
  );
}

function DriverRow({ strategy, totalLaps, scrubLap, onHover }: {
  strategy: DriverStrategy;
  totalLaps: number;
  scrubLap: number | null;
  onHover: (s: Stint | null, driver: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 h-8">
      <div className="w-10 text-right flex-shrink-0">
        <span className="text-[11px] font-mono text-zinc-300">{strategy.driver}</span>
      </div>
      <div className="flex-1 relative h-5 bg-white/5 rounded-sm overflow-visible">
        {strategy.stints.map((stint) => (
          <StintBar
            key={stint.stint}
            stint={stint}
            totalLaps={totalLaps}
            scrubLap={scrubLap}
            onHover={(s) => onHover(s, strategy.driver)}
          />
        ))}
        {strategy.stints.filter(s => s.pit_stop_lap !== null).map((stint) => (
          <PitMarker key={`pit-${stint.stint}`} lap={stint.pit_stop_lap!} totalLaps={totalLaps} />
        ))}
        {scrubLap !== null && (
          <div
            className="absolute top-0 h-full w-px bg-white/60 pointer-events-none z-10"
            style={{ left: `${((scrubLap - 1) / totalLaps) * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}

function LapScrubber({ totalLaps, scrubLap, onChange }: {
  totalLaps: number;
  scrubLap: number | null;
  onChange: (lap: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 mt-3">
      <span className="text-[10px] font-mono text-zinc-500 w-10 text-right flex-shrink-0">Lap</span>
      <div className="flex-1">
        <input
          type="range"
          min={1}
          max={totalLaps}
          value={scrubLap ?? 1}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="w-full h-1 accent-[var(--accent)] cursor-pointer"
        />
      </div>
      <span className="text-[11px] font-mono text-zinc-300 w-8">{scrubLap ?? '—'}</span>
    </div>
  );
}

function GridAtLap({ strategies, scrubLap }: { strategies: DriverStrategy[]; scrubLap: number }) {
  const order = strategies
    .map((s) => {
      const activeStint = s.stints.find(st => scrubLap >= st.start_lap && scrubLap <= st.end_lap);
      return { driver: s.driver, color: s.team_color, compound: activeStint?.compound ?? 'UNKNOWN' };
    });

  return (
    <GlassPanel className="p-4">
      <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-3">Grid at Lap {scrubLap}</p>
      <div className="flex flex-col gap-1.5">
        {order.map((d, i) => (
          <div key={d.driver} className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-zinc-600 w-4">{i + 1}</span>
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: d.color }}
            />
            <span className="text-xs font-mono text-zinc-300">{d.driver}</span>
            <span
              className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `${compoundColor(d.compound)}20`, color: compoundColor(d.compound) }}
            >
              {d.compound[0]}
            </span>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

export default function StrategyTimeline() {
  const { year, round, session } = useParams<{ year: string; round: string; session: string }>();
  const y = parseInt(year ?? '0', 10);
  const r = parseInt(round ?? '0', 10);
  const s = (session === 'S' ? 'S' : 'R') as 'R' | 'S';

  const { data, isLoading, error } = useStrategy(y, r, s, !!y && !!r);
  const [scrubLap, setScrubLap] = useState<number | null>(null);
  const [hoveredStint, setHoveredStint] = useState<{ stint: Stint; driver: string } | null>(null);

  const totalLaps = data
    ? Math.max(...data.flatMap(d => d.stints.map(st => st.end_lap)), 1)
    : 58;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0B14] flex flex-col items-center justify-center gap-3">
        <div className="w-7 h-7 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
        <p className="font-mono text-sm text-zinc-400 animate-pulse">Loading strategy data…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0A0B14] flex flex-col items-center justify-center gap-4">
        <GlassPanel className="p-6 max-w-md text-center">
          <Info size={20} className="text-[var(--accent)] mx-auto mb-3" />
          <p className="text-sm text-zinc-300">
            {(error as Error)?.message ?? 'Strategy data unavailable for this session.'}
          </p>
        </GlassPanel>
        <Link to="/" className="font-mono text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5">
          <ArrowLeft size={14} /> Back
        </Link>
      </div>
    );
  }

  const activeLap = scrubLap ?? 1;

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
          <p className="text-sm font-semibold text-white">Tyre Strategy Timeline</p>
          <p className="text-[10px] font-mono text-zinc-500">{y} · Round {r} · {s === 'R' ? 'Race' : 'Sprint'}</p>
        </div>
      </motion.header>

      <div className="flex flex-1 min-h-0 gap-0">
        {/* Main Gantt */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex-1 px-6 py-6 overflow-y-auto"
        >
          {/* Legend */}
          <div className="flex items-center gap-4 mb-5 flex-wrap">
            {Object.entries(COMPOUND_COLORS).filter(([k]) => k !== 'UNKNOWN').map(([compound, color]) => (
              <div key={compound} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                <span className="text-[10px] font-mono text-zinc-400">{compound[0]}{compound.slice(1).toLowerCase()}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 ml-2">
              <div className="w-px h-3 bg-white/40" />
              <span className="text-[10px] font-mono text-zinc-400">Pit stop</span>
            </div>
          </div>

          <GlassPanel className="p-4">
            {/* Lap axis */}
            <div className="flex items-center gap-3 mb-2 h-4">
              <div className="w-10 flex-shrink-0" />
              <div className="flex-1 relative">
                {[1, Math.round(totalLaps * 0.25), Math.round(totalLaps * 0.5), Math.round(totalLaps * 0.75), totalLaps].map((lap) => (
                  <span
                    key={lap}
                    className="absolute text-[9px] font-mono text-zinc-600 -translate-x-1/2"
                    style={{ left: `${((lap - 1) / totalLaps) * 100}%` }}
                  >
                    {lap}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              {data.map((strategy) => (
                <DriverRow
                  key={strategy.driver}
                  strategy={strategy}
                  totalLaps={totalLaps}
                  scrubLap={scrubLap}
                  onHover={(stint, driver) => setHoveredStint(stint ? { stint, driver } : null)}
                />
              ))}
            </div>

            <LapScrubber totalLaps={totalLaps} scrubLap={scrubLap} onChange={setScrubLap} />
          </GlassPanel>

          {/* Hover tooltip */}
          {hoveredStint && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3"
            >
              <GlassPanel className="p-3 inline-flex gap-4 items-center">
                <span className="text-xs font-mono text-white">{hoveredStint.driver}</span>
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: `${compoundColor(hoveredStint.stint.compound)}20`,
                    color: compoundColor(hoveredStint.stint.compound),
                  }}
                >
                  {hoveredStint.stint.compound}
                </span>
                <span className="text-[11px] font-mono text-zinc-400">
                  L{hoveredStint.stint.start_lap}–L{hoveredStint.stint.end_lap}
                  {' '}({hoveredStint.stint.end_lap - hoveredStint.stint.start_lap + 1} laps)
                </span>
                {hoveredStint.stint.avg_lap_time_s && (
                  <span className="text-[11px] font-mono text-zinc-400">
                    Avg {hoveredStint.stint.avg_lap_time_s.toFixed(3)}s
                  </span>
                )}
              </GlassPanel>
            </motion.div>
          )}
        </motion.div>

        {/* Side panel — grid at lap */}
        {scrubLap !== null && (
          <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="w-48 flex-shrink-0 p-4 border-l border-white/5 overflow-y-auto"
          >
            <GridAtLap strategies={data} scrubLap={activeLap} />
          </motion.aside>
        )}
      </div>
    </div>
  );
}
