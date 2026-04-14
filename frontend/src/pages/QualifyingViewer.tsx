import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useQualifying } from '../api/queries';
import GlassPanel from '../components/glass/GlassPanel';

function formatLapTime(seconds: string | null): string {
  if (!seconds) return '-';
  const s = parseFloat(seconds);
  if (isNaN(s)) return '-';
  const mins = Math.floor(s / 60);
  const secs = (s % 60).toFixed(3);
  return mins > 0 ? `${mins}:${secs.padStart(6, '0')}` : secs;
}

const rowVariants = {
  hidden: { opacity: 0, x: -12 },
  show: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.03, type: 'spring' as const, stiffness: 260, damping: 24 },
  }),
};

export default function QualifyingViewer() {
  const { year, round, session } = useParams<{ year: string; round: string; session: string }>();
  const y = parseInt(year ?? '0', 10);
  const r = parseInt(round ?? '0', 10);
  const s = (session === 'SQ' ? 'SQ' : 'Q') as 'Q' | 'SQ';

  const { data, isLoading, error } = useQualifying(y, r, s, !!y && !!r);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0B14] flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        <p className="font-mono text-sm text-zinc-400 animate-pulse">Loading qualifying results...</p>
        <p className="font-mono text-xs text-zinc-600">This may take a minute if the session hasn't been cached yet.</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0A0B14] flex flex-col items-center justify-center gap-4">
        <div className="bg-accent/10 border border-accent/30 text-accent px-6 py-4 rounded-xl font-mono text-sm max-w-md text-center">
          {(error as Error)?.message ?? 'Failed to load qualifying'}
        </div>
        <Link to="/" className="font-mono text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5">
          <ArrowLeft size={14} /> Back to sessions
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0B14] flex flex-col">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="flex items-center gap-4 px-5 py-3 border-b border-white/5 bg-white/[0.02] flex-shrink-0"
      >
        <Link
          to="/"
          className="flex items-center gap-1.5 font-mono text-xs text-zinc-400 hover:text-white transition-colors flex-shrink-0"
        >
          <ArrowLeft size={14} /> Back
        </Link>
        <div className="flex flex-col gap-0.5">
          <h2 className="font-ui text-base font-semibold text-white">
            {data.session_info.event_name} — Qualifying
          </h2>
          <p className="font-mono text-xs text-zinc-400">
            {data.session_info.circuit_name} · {data.session_info.country} · {data.session_info.date}
          </p>
        </div>
      </motion.header>

      <div className="flex-1 px-6 py-6 max-w-4xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.1 }}
        >
          <GlassPanel className="overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-3 font-mono text-xs uppercase tracking-widest text-zinc-400 w-12">Pos</th>
                  <th className="text-left px-4 py-3 font-mono text-xs uppercase tracking-widest text-zinc-400">Driver</th>
                  <th className="text-left px-4 py-3 font-mono text-xs uppercase tracking-widest text-zinc-400">Q1</th>
                  <th className="text-left px-4 py-3 font-mono text-xs uppercase tracking-widest text-zinc-400">Q2</th>
                  <th className="text-left px-4 py-3 font-mono text-xs uppercase tracking-widest text-zinc-400">Q3</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((d, i) => (
                  <motion.tr
                    key={d.code}
                    custom={i}
                    variants={rowVariants}
                    initial="hidden"
                    animate="show"
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{d.position}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: d.color }}
                        />
                        <span className="font-mono text-sm text-white font-medium">{d.code}</span>
                        <span className="font-ui text-xs text-zinc-400">{d.full_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-white tabular-nums">{formatLapTime(d.Q1)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-white tabular-nums">{formatLapTime(d.Q2)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-white tabular-nums">{formatLapTime(d.Q3)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </GlassPanel>
        </motion.div>
      </div>
    </div>
  );
}
