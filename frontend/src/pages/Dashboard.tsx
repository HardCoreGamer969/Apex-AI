import { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import { ArrowRight, Bookmark, Calendar, Clock } from 'lucide-react';
import { useSessions } from '../api/queries';
import { useSavedStore } from '../store/savedStore';
import GlassPanel from '../components/glass/GlassPanel';
import { format } from 'date-fns';

const TrackHero = lazy(() => import('../components/hero/TrackHero'));
import TrackHeroSVG from '../components/hero/TrackHeroSVG';

const isLowEnd = typeof navigator !== 'undefined' && navigator.hardwareConcurrency < 4;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 260, damping: 24, delay: i * 0.07 },
  }),
};

function SessionCard({ session, index }: { session: { round_number: number; event_name: string; country: string; date: string; year?: number }, index: number }) {
  const year = session.year ?? new Date(session.date).getFullYear();
  return (
    <motion.div custom={index} variants={fadeUp} initial="hidden" animate="visible">
      <GlassPanel glow className="p-4 hover:bg-white/[0.08] transition-colors group cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-1">
              Round {session.round_number} · {session.country}
            </p>
            <p className="text-sm font-semibold text-white truncate">{session.event_name}</p>
            <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1">
              <Calendar size={11} />
              {format(new Date(session.date), 'dd MMM yyyy')}
            </p>
          </div>
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <Link
              to={`/replay/${year}/${session.round_number}/R`}
              className="text-[10px] font-mono px-2 py-1 rounded-md bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30 transition-colors"
            >
              Race
            </Link>
            <Link
              to={`/strategy/${year}/${session.round_number}/R`}
              className="text-[10px] font-mono px-2 py-1 rounded-md bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
            >
              Strategy
            </Link>
          </div>
        </div>
      </GlassPanel>
    </motion.div>
  );
}

export default function Dashboard() {
  const currentYear = new Date().getFullYear();
  const { data: currentSessions, isLoading: loadingCurrent } = useSessions(currentYear);
  const currentIsEmpty = !loadingCurrent && (currentSessions?.length ?? 0) === 0;
  const { data: prevSessions, isLoading: loadingPrev } = useSessions(currentYear - 1, { enabled: currentIsEmpty });
  const { sessions: saved } = useSavedStore();

  const sessions = currentIsEmpty ? prevSessions : currentSessions;
  const displayYear = currentIsEmpty ? currentYear - 1 : currentYear;
  const isLoading = loadingCurrent || (currentIsEmpty && loadingPrev);
  const featured = sessions?.slice(0, 6) ?? [];

  return (
    <div className="flex flex-col min-h-screen bg-[#0A0B14]">
      {/* Hero */}
      <div className="relative h-[420px] overflow-hidden flex-shrink-0">
        {isLowEnd ? (
          <TrackHeroSVG />
        ) : (
          <Suspense fallback={<TrackHeroSVG />}>
            <TrackHero />
          </Suspense>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0A0B14]/40 to-[#0A0B14]" />

        {/* Hero text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <p className="text-[10px] font-mono text-[var(--accent)] tracking-[0.3em] uppercase mb-3">
              F1 Race Telemetry
            </p>
            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight leading-tight">
              Apex<span className="text-[var(--accent)]">AI</span>
            </h1>
            <p className="text-zinc-400 text-sm mt-3 max-w-sm">
              Glassmorphism-grade race analysis. Replay, compare, and dissect every stint.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, type: 'spring', stiffness: 260, damping: 24 }}
            className="flex gap-3"
          >
            <Link
              to="/saved"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white hover:bg-white/10 transition-all"
            >
              <Bookmark size={14} /> Saved Sessions
            </Link>
            <Link
              to="/"
              onClick={() => document.getElementById('sessions-grid')?.scrollIntoView({ behavior: 'smooth' })}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-all"
            >
              Browse Races <ArrowRight size={14} />
            </Link>
          </motion.div>
        </div>
      </div>

      {/* Sessions grid */}
      <div id="sessions-grid" className="flex-1 px-6 pb-12 max-w-6xl mx-auto w-full">
        {/* Saved strip */}
        {saved.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-mono text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <Bookmark size={12} className="text-[var(--accent-amber)]" /> Saved Sessions
              </h2>
              <Link to="/saved" className="text-xs text-zinc-500 hover:text-white transition-colors flex items-center gap-1">
                View all <ArrowRight size={11} />
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
              {saved.slice(0, 5).map((s) => (
                <GlassPanel key={s.id} className="flex-shrink-0 w-48 p-3">
                  <p className="text-[10px] font-mono text-zinc-500 truncate">{s.country}</p>
                  <p className="text-xs font-semibold text-white truncate mt-0.5">{s.eventName}</p>
                  <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                    <Clock size={10} /> {format(new Date(s.savedAt), 'dd MMM')}
                  </p>
                  <Link
                    to={`/replay/${s.year}/${s.round}/${s.session}`}
                    className="mt-2 block text-center text-[10px] font-mono px-2 py-1 rounded bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30 transition-colors"
                  >
                    Open
                  </Link>
                </GlassPanel>
              ))}
            </div>
          </motion.section>
        )}

        {/* Featured races */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
            {displayYear} Season{currentIsEmpty && <span className="text-zinc-600 ml-2 normal-case tracking-normal">(no {currentYear} data yet)</span>}
          </h2>
          <Link
            to="/sessions"
            className="text-xs text-zinc-500 hover:text-white transition-colors flex items-center gap-1"
          >
            All sessions <ArrowRight size={11} />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : featured.length === 0 ? (
          <GlassPanel className="p-8 text-center">
            <p className="text-zinc-400 text-sm">No sessions available for {displayYear} yet.</p>
          </GlassPanel>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {featured.map((session, i) => (
              <SessionCard
                key={`${session.round_number}-${session.event_name}`}
                session={{ ...session, year: displayYear }}
                index={i}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
