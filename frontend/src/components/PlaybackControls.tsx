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
  isPlaying,
  onPlay,
  onPause,
  onSeek,
  frameIndex,
  totalFrames,
  playbackSpeed,
  onSpeedChange,
  currentTime = 0,
  totalLaps = 0,
  currentLap = 1,
}: PlaybackControlsProps) {
  return (
    <div className="playback-controls">
      <div className="controls-row">
        <button className="play-btn" onClick={isPlaying ? onPause : onPlay}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <div className="speed-buttons">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={playbackSpeed === s ? 'active' : ''}
              onClick={() => onSpeedChange(s)}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
      <div className="scrubber">
        <input
          type="range"
          min={0}
          max={Math.max(0, totalFrames - 1)}
          value={frameIndex}
          onChange={(e) => onSeek(Number(e.target.value))}
        />
      </div>
      <div className="time-display">
        <span>{formatTime(currentTime)}</span>
        <span className="lap-info">
          Lap {currentLap} / {totalLaps}
        </span>
      </div>
    </div>
  );
}
