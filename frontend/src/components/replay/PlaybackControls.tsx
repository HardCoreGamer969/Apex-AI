import { motion } from 'framer-motion';
import { Play, Pause } from 'lucide-react';
import { cn } from '../../lib/cn';

interface PlaybackControlsProps {
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (value: number) => void;
  frameIndex: number;
  totalFrames: number;
  playbackSpeed: number;
  onSpeedChange: (speed: number) => void;
  currentTime?: number;
  totalLaps?: number;
  currentLap?: number;
}

const SPEEDS = [0.5, 1, 2, 4];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function PlaybackControls({
  isPlaying, onPlay, onPause, onSeek,
  frameIndex, totalFrames, playbackSpeed, onSpeedChange,
  currentTime = 0, totalLaps = 0, currentLap = 1,
}: PlaybackControlsProps) {
  const progress = totalFrames > 1 ? frameIndex / (totalFrames - 1) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={isPlaying ? onPause : onPlay}
          className="flex items-center justify-center w-9 h-9 rounded-full bg-accent hover:bg-accent-hover text-white transition-colors"
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </motion.button>

        <div className="flex gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={cn(
                'px-2 py-1 rounded font-mono text-xs transition-all',
                playbackSpeed === s
                  ? 'bg-accent/20 text-accent border border-accent/50'
                  : 'bg-white/5 text-zinc-400 border border-white/10 hover:border-white/20'
              )}
            >
              {s}x
            </button>
          ))}
        </div>

        <div className="ml-auto font-mono text-xs text-zinc-400 tabular-nums">
          <span className="text-white">Lap {currentLap}</span>
          <span> / {totalLaps}</span>
        </div>
        <span className="font-mono text-xs text-zinc-500 tabular-nums">{formatTime(currentTime)}</span>
      </div>

      {/* Scrubber */}
      <div className="relative h-1.5 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 bg-accent rounded-full"
          style={{ width: `${progress * 100}%` }}
        />
        <input
          type="range"
          min={0}
          max={Math.max(0, totalFrames - 1)}
          value={frameIndex}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
        />
      </div>
    </div>
  );
}
