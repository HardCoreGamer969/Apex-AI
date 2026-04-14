import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSessions, useRaceNames } from '../api/queries';
import type { Session } from '../types/api';
import GlassPanel from '../components/glass/GlassPanel';
import { cn } from '../lib/cn';

const currentYear = new Date().getFullYear();
const LABEL_TO_CODE: Record<string, string> = { Race: 'R', Sprint: 'S', Qualifying: 'Q', 'Sprint Qualifying': 'SQ' };
const QUALIFYING_SESSIONS = new Set(['Qualifying', 'Sprint Qualifying']);

function isSessionAvailable(sessionDates: Record<string, string>, label: string): boolean {
  const dateStr = sessionDates[label];
  if (!dateStr) return false;
  try {
    return new Date(dateStr) <= new Date();
  } catch {
    return true;
  }
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, type: 'spring' as const, stiffness: 260, damping: 24 },
  }),
};

export default function SessionPicker() {
  const navigate = useNavigate();
  const [year, setYear] = useState(currentYear);
  const [place, setPlace] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<Session | null>(null);

  const { data: sessions = [], isLoading, error } = useSessions(place ? undefined : year, place || undefined);
  const { data: raceNames = [] } = useRaceNames(2018, currentYear);

  const getEventYear = (ev: Session) => ev.year ?? year;

  const availableSessions = selectedEvent
    ? (['Race', 'Sprint', 'Qualifying', 'Sprint Qualifying'] as const).filter((label) =>
        isSessionAvailable(selectedEvent.session_dates || {}, label)
      )
    : [];

  const handleSessionClick = (label: string) => {
    if (!selectedEvent) return;
    const code = LABEL_TO_CODE[label];
    const evYear = getEventYear(selectedEvent);
    if (QUALIFYING_SESSIONS.has(label)) {
      navigate(`/qualifying/${evYear}/${selectedEvent.round_number}/${code}`);
    } else {
      navigate(`/replay/${evYear}/${selectedEvent.round_number}/${code}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0B14] flex flex-col items-center px-4 py-12">
      <motion.header
        className="text-center mb-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      >
        <h1 className="font-ui text-4xl font-bold tracking-widest text-white mb-1">
          APEX<span className="text-accent">AI</span>
        </h1>
        <p className="text-zinc-400 font-mono text-sm tracking-wide">F1 Race Replay</p>
      </motion.header>

      <motion.div
        className="w-full max-w-4xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        {/* Filters */}
        <GlassPanel className="flex gap-6 p-4 mb-6">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-400 uppercase tracking-widest font-mono">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              disabled={!!place}
              className="bg-white/5 border border-white/10 text-white font-mono text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-accent min-w-[100px]"
            >
              {Array.from({ length: currentYear - 2017 }, (_, i) => 2018 + i).map((y) => (
                <option key={y} value={y} className="bg-[#0A0B14]">{y}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-400 uppercase tracking-widest font-mono">Race</label>
            <select
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              className="bg-white/5 border border-white/10 text-white font-mono text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-accent min-w-[160px]"
            >
              <option value="" className="bg-[#0A0B14]">All Races</option>
              {raceNames.map((name) => (
                <option key={name} value={name} className="bg-[#0A0B14]">{name}</option>
              ))}
            </select>
          </div>
        </GlassPanel>

        {error && (
          <div className="bg-accent/10 border border-accent/50 text-accent px-4 py-3 rounded-lg mb-4 font-mono text-sm">
            {(error as Error).message}
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-16 text-zinc-500 font-mono animate-pulse">Loading schedule...</div>
        ) : (
          <div className="grid grid-cols-[1fr_280px] gap-4">
            {/* Schedule list */}
            <GlassPanel className="p-4">
              <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-400 mb-4">Schedule</h2>
              <ul className="space-y-1">
                {sessions.map((ev, i) => (
                  <motion.li
                    key={`${getEventYear(ev)}-${ev.round_number}-${i}`}
                    custom={i}
                    variants={fadeUp}
                    initial="hidden"
                    animate="show"
                    onClick={() => setSelectedEvent(ev)}
                    className={cn(
                      'grid grid-cols-[48px_1fr_auto] gap-3 items-center px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150',
                      'hover:bg-white/5 border border-transparent',
                      selectedEvent === ev
                        ? 'border-accent/60 bg-accent/8'
                        : 'hover:border-white/10'
                    )}
                  >
                    <span className="font-mono text-sm text-accent font-medium">R{ev.round_number}</span>
                    <span className="font-ui text-sm text-white font-medium">{ev.event_name}</span>
                    <span className="font-mono text-xs text-zinc-400">{ev.country} · {ev.date}</span>
                  </motion.li>
                ))}
              </ul>
            </GlassPanel>

            {/* Session panel */}
            <GlassPanel className="p-4" glow>
              <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-400 mb-4">Sessions</h2>
              {selectedEvent ? (
                <>
                  <p className="font-ui text-sm text-white font-medium mb-4">{selectedEvent.event_name}</p>
                  {availableSessions.length === 0 ? (
                    <p className="text-zinc-500 font-mono text-xs">No Race or Sprint data available</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {availableSessions.map((label) => (
                        <motion.button
                          key={label}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleSessionClick(label)}
                          className="w-full px-4 py-2.5 bg-accent hover:bg-accent-hover text-white font-mono text-sm font-medium rounded-lg transition-colors duration-150"
                        >
                          {label}
                        </motion.button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-zinc-500 font-mono text-xs">Select an event</p>
              )}
            </GlassPanel>
          </div>
        )}
      </motion.div>
    </div>
  );
}
