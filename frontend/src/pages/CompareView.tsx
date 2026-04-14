import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, GitCompare } from 'lucide-react';
import { useCompare } from '../api/queries';
import { useReplayPlayback } from '../hooks/useReplayPlayback';
import GlassPanel from '../components/glass/GlassPanel';
import TrackCanvas from '../components/replay/TrackCanvas';
import PlaybackControls from '../components/replay/PlaybackControls';

const KNOWN_DRIVERS = [
  'VER','PER','HAM','RUS','LEC','SAI','NOR','PIA','ALO','STR',
  'OCO','GAS','HUL','MAG','BOT','ZHO','ALB','SAR','TSU','RIC',
];

function DriverInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[var(--accent)]/50"
      >
        <option value="">Select driver</option>
        {KNOWN_DRIVERS.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
    </div>
  );
}

function GapChart({ gapSeries, currentDist }: {
  gapSeries: Array<{ dist: number; gap_s: number }>;
  currentDist: number;
}) {
  if (!gapSeries.length) return null;

  const W = 320, H = 80, PAD = 8;
  const dists = gapSeries.map(g => g.dist);
  const gaps = gapSeries.map(g => g.gap_s);
  const minD = Math.min(...dists), maxD = Math.max(...dists);
  const minG = Math.min(...gaps), maxG = Math.max(...gaps);
  const rangeD = maxD - minD || 1;
  const rangeG = maxG - minG || 1;

  const toX = (d: number) => PAD + ((d - minD) / rangeD) * (W - PAD * 2);
  const toY = (g: number) => PAD + (1 - (g - minG) / rangeG) * (H - PAD * 2);

  const path = gapSeries.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.dist).toFixed(1)},${toY(p.gap_s).toFixed(1)}`).join(' ');
  const scrubX = toX(currentDist);

  return (
    <GlassPanel className="p-3">
      <p className="text-[10px] font-mono text-zinc-500 mb-2">Gap (s)</p>
      <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`}>
        <line x1={PAD} y1={toY(0)} x2={W - PAD} y2={toY(0)} stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="3,3" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
        <line x1={scrubX} y1={PAD} x2={scrubX} y2={H - PAD} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
      </svg>
    </GlassPanel>
  );
}

export default function CompareView() {
  const { year, round, session } = useParams<{ year: string; round: string; session: string }>();
  const y = parseInt(year ?? '0', 10);
  const r = parseInt(round ?? '0', 10);
  const s = session ?? 'R';

  const [driverA, setDriverA] = useState('VER');
  const [driverB, setDriverB] = useState('HAM');
  const [submitted, setSubmitted] = useState(false);

  const enabled = submitted && !!driverA && !!driverB;
  const { data, isLoading, error } = useCompare(y, r, s, driverA, driverB, enabled);

  const framesA = data?.driver_a?.frames?.map((f) => ({
    t: f.dist,
    lap: f.lap,
    drivers: { [driverA]: { x: f.x, y: f.y, dist: f.dist, lap: f.lap, position: 1, speed: f.speed, gear: 0, drs: 0, rel_dist: 0, tyre: 0 } },
  })) ?? [];

  const playback = useReplayPlayback(framesA);
  const currentDist = playback.currentFrame?.t ?? 0;

  return (
    <div className="flex flex-col h-screen bg-[#0A0B14] overflow-hidden">
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
            <GitCompare size={14} className="text-[var(--accent)]" /> Head-to-Head
          </p>
          <p className="text-[10px] font-mono text-zinc-500">{y} · Round {r} · {s}</p>
        </div>
      </motion.header>

      {/* Driver picker */}
      {!submitted && (
        <div className="flex-1 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <GlassPanel glow className="p-8 w-full max-w-md">
              <h2 className="text-base font-semibold text-white mb-6 flex items-center gap-2">
                <GitCompare size={16} className="text-[var(--accent)]" /> Select Drivers
              </h2>
              <div className="flex flex-col gap-4">
                <DriverInput label="Driver A" value={driverA} onChange={setDriverA} />
                <DriverInput label="Driver B" value={driverB} onChange={setDriverB} />
                <button
                  onClick={() => setSubmitted(true)}
                  disabled={!driverA || !driverB || driverA === driverB}
                  className="mt-2 w-full py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Compare
                </button>
              </div>
            </GlassPanel>
          </motion.div>
        </div>
      )}

      {/* Loading */}
      {submitted && isLoading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="w-7 h-7 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
          <p className="font-mono text-sm text-zinc-400 animate-pulse">Loading comparison data…</p>
          <p className="font-mono text-xs text-zinc-600">This may take a minute on first load.</p>
        </div>
      )}

      {/* Error */}
      {submitted && error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
          <GlassPanel className="p-6 max-w-md text-center">
            <p className="text-sm text-zinc-300">{(error as Error)?.message ?? 'Failed to load comparison'}</p>
          </GlassPanel>
          <button onClick={() => setSubmitted(false)} className="font-mono text-xs text-zinc-400 hover:text-white transition-colors">
            Try different drivers
          </button>
        </div>
      )}

      {/* Main comparison */}
      {submitted && data && !isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-1 min-h-0"
        >
          {/* Track canvas */}
          <div className="flex-1 min-w-0 relative">
            {data.track && (
              <TrackCanvas
                track={data.track}
                circuitRotation={data.circuit_rotation ?? 0}
                frames={framesA}
                driverColors={{
                  [driverA]: data.driver_a.color,
                  [driverB]: data.driver_b.color,
                }}
                interpRef={playback.interpRef}
              />
            )}
          </div>

          {/* Sidebar */}
          <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.1 }}
            className="w-64 flex-shrink-0 flex flex-col gap-3 p-3 border-l border-white/5 overflow-y-auto"
          >
            {/* Driver badges */}
            <GlassPanel className="p-3 flex gap-3 items-center justify-around">
              {[
                { code: driverA, color: data.driver_a.color },
                { code: driverB, color: data.driver_b.color },
              ].map(({ code, color }) => (
                <div key={code} className="flex flex-col items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-xs font-mono text-white">{code}</span>
                </div>
              ))}
            </GlassPanel>

            <GapChart gapSeries={data.gap_series ?? []} currentDist={currentDist} />

            <button
              onClick={() => setSubmitted(false)}
              className="text-xs font-mono text-zinc-500 hover:text-white transition-colors text-center py-1"
            >
              Change drivers
            </button>
          </motion.aside>
        </motion.div>
      )}

      {/* Playback controls */}
      {submitted && data && !isLoading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.15 }}
          className="flex-shrink-0 px-5 py-4 border-t border-white/5 bg-white/[0.02]"
        >
          <GlassPanel className="px-4 py-3">
            <PlaybackControls
              isPlaying={playback.isPlaying}
              onPlay={playback.play}
              onPause={playback.pause}
              onSeek={playback.seek}
              frameIndex={playback.frameIndex}
              totalFrames={playback.totalFrames}
              playbackSpeed={playback.playbackSpeed}
              onSpeedChange={playback.setSpeed}
              currentTime={playback.currentFrame?.t ?? 0}
              totalLaps={data.driver_a.frames[data.driver_a.frames.length - 1]?.lap ?? 1}
              currentLap={playback.currentFrame?.lap ?? 1}
            />
          </GlassPanel>
        </motion.div>
      )}
    </div>
  );
}
