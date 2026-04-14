import { Link } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import { ArrowLeft, Bookmark, Trash2, ExternalLink, GitCompare } from 'lucide-react';
import { useSavedStore } from '../store/savedStore';
import GlassPanel from '../components/glass/GlassPanel';
import { format } from 'date-fns';

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 260, damping: 24, delay: i * 0.05 },
  }),
};

export default function SavedSessions() {
  const { sessions, remove } = useSavedStore();

  return (
    <div className="min-h-screen bg-[#0A0B14] flex flex-col">
      <div className="max-w-4xl mx-auto w-full px-6 py-8 flex-1">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          className="flex items-center gap-4 mb-8"
        >
          <Link to="/" className="text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Bookmark size={18} className="text-[var(--accent-amber)]" />
              Saved Sessions
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              {sessions.length} session{sessions.length !== 1 ? 's' : ''} bookmarked
            </p>
          </div>
        </motion.div>

        {sessions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <GlassPanel className="p-12 text-center">
              <Bookmark size={32} className="text-zinc-600 mx-auto mb-4" />
              <p className="text-zinc-400 text-sm">No saved sessions yet.</p>
              <p className="text-zinc-600 text-xs mt-1">Bookmark a race from the replay viewer to see it here.</p>
              <Link
                to="/"
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)]/20 text-[var(--accent)] text-sm hover:bg-[var(--accent)]/30 transition-colors"
              >
                Browse Races
              </Link>
            </GlassPanel>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sessions.map((s, i) => (
              <motion.div key={s.id} custom={i} variants={fadeUp} initial="hidden" animate="visible">
                <GlassPanel glow className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">
                        {s.year} · Round {s.round} · {s.country}
                      </p>
                      <p className="text-sm font-semibold text-white truncate">{s.eventName}</p>
                      <p className="text-[10px] text-zinc-500 mt-1">
                        Session: <span className="text-zinc-400 font-mono">{s.session}</span>
                        {' · '}Saved {format(new Date(s.savedAt), 'dd MMM yyyy')}
                      </p>
                    </div>
                    <button
                      onClick={() => remove(s.id)}
                      className="text-zinc-600 hover:text-[var(--accent)] transition-colors flex-shrink-0 mt-0.5"
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="flex gap-2 mt-3">
                    <Link
                      to={`/replay/${s.year}/${s.round}/${s.session}`}
                      className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded-md bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30 transition-colors"
                    >
                      <ExternalLink size={11} /> Replay
                    </Link>
                    <Link
                      to={`/strategy/${s.year}/${s.round}/${s.session}`}
                      className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded-md bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      Strategy
                    </Link>
                    <Link
                      to={`/compare/${s.year}/${s.round}/${s.session}`}
                      className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded-md bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      <GitCompare size={11} /> Compare
                    </Link>
                  </div>
                </GlassPanel>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
