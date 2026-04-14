import { motion, AnimatePresence } from 'framer-motion';
import type { Frame } from '../../types/api';
import GlassPanel from '../glass/GlassPanel';

interface LeaderboardProps {
  frame: Frame | null;
  driverColors: Record<string, string>;
}

const TYRE_LABELS: Record<number, string> = {
  0: '?', 1: 'S', 2: 'M', 3: 'H', 4: 'I', 5: 'W',
};

const TYRE_COLORS: Record<string, string> = {
  S: 'text-red-400', M: 'text-yellow-400', H: 'text-zinc-300',
  I: 'text-green-400', W: 'text-blue-400', '?': 'text-zinc-500',
};

export default function Leaderboard({ frame, driverColors }: LeaderboardProps) {
  if (!frame?.drivers) {
    return (
      <GlassPanel className="p-4">
        <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-400 mb-3">Leaderboard</h3>
        <p className="text-zinc-500 font-mono text-xs">No data</p>
      </GlassPanel>
    );
  }

  const drivers = Object.entries(frame.drivers)
    .map(([code, d]) => ({ code, ...d }))
    .sort((a, b) => a.position - b.position);

  return (
    <GlassPanel className="p-4">
      <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-400 mb-3">Leaderboard</h3>
      <ul className="space-y-0.5">
        <AnimatePresence initial={false}>
          {drivers.map((d) => {
            const tyre = TYRE_LABELS[d.tyre] ?? String(d.tyre);
            return (
              <motion.li
                key={d.code}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-[8px_20px_32px_28px_44px_18px] gap-1.5 items-center py-1 border-b border-white/5 last:border-0"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: driverColors[d.code] || '#888' }}
                />
                <span className="font-mono text-xs text-zinc-400">{d.position}</span>
                <span className="font-mono text-xs text-white font-medium">{d.code}</span>
                <span className="font-mono text-xs text-zinc-400">L{d.lap}</span>
                <span className="font-mono text-xs text-amber-400 tabular-nums">{Math.round(d.speed)}</span>
                <span className={`font-mono text-xs font-bold ${TYRE_COLORS[tyre] ?? 'text-zinc-400'}`}>{tyre}</span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </GlassPanel>
  );
}
