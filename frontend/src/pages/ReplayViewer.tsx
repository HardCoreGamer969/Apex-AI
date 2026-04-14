import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useReplay } from '../api/queries';
import { useReplayPlayback } from '../hooks/useReplayPlayback';
import GlassPanel from '../components/glass/GlassPanel';
import TrackCanvas from '../components/replay/TrackCanvas';
import Leaderboard from '../components/replay/Leaderboard';
import PlaybackControls from '../components/replay/PlaybackControls';
import SessionInfo from '../components/replay/SessionInfo';
import WeatherPanel from '../components/replay/WeatherPanel';

export default function ReplayViewer() {
  const { year, round, session } = useParams<{ year: string; round: string; session: string }>();
  const y = parseInt(year ?? '0', 10);
  const r = parseInt(round ?? '0', 10);
  const s = (session === 'S' ? 'S' : 'R') as 'R' | 'S';

  const { data, isLoading, error } = useReplay(y, r, s, !!y && !!r);
  const playback = useReplayPlayback(data?.frames ?? []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0B14] flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        <p className="font-mono text-sm text-zinc-400 animate-pulse">Loading replay data...</p>
        <p className="font-mono text-xs text-zinc-600">This may take a minute if the session hasn't been cached yet.</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0A0B14] flex flex-col items-center justify-center gap-4">
        <div className="bg-accent/10 border border-accent/30 text-accent px-6 py-4 rounded-xl font-mono text-sm max-w-md text-center">
          {(error as Error)?.message ?? 'Failed to load replay'}
        </div>
        <Link to="/" className="font-mono text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5">
          <ArrowLeft size={14} /> Back to sessions
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0A0B14] overflow-hidden">
      {/* Header */}
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
        <SessionInfo info={data.session_info} />
      </motion.header>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Track */}
        <div className="flex-1 min-w-0 relative">
          <TrackCanvas
            track={data.track}
            circuitRotation={data.circuit_rotation}
            frames={playback.frames}
            driverColors={data.driver_colors}
            interpRef={playback.interpRef}
          />
        </div>

        {/* Sidebar */}
        <motion.aside
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.1 }}
          className="w-56 flex-shrink-0 flex flex-col gap-3 p-3 border-l border-white/5 overflow-y-auto"
        >
          <Leaderboard frame={playback.currentFrame} driverColors={data.driver_colors} />
          <WeatherPanel frame={playback.currentFrame} />
        </motion.aside>
      </div>

      {/* Controls */}
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
            totalLaps={data.total_laps}
            currentLap={playback.currentFrame?.lap ?? 1}
          />
        </GlassPanel>
      </motion.div>
    </div>
  );
}
