import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchReplay } from '../api/client';
import type { ReplayPayload } from '../types/api';
import { useReplayPlayback } from '../hooks/useReplayPlayback';
import Leaderboard from './Leaderboard';
import PlaybackControls from './PlaybackControls';
import SessionInfo from './SessionInfo';
import TrackCanvas from './TrackCanvas';
import WeatherPanel from './WeatherPanel';

export default function ReplayViewer() {
  const { year, round, session } = useParams<{ year: string; round: string; session: string }>();
  const [data, setData] = useState<ReplayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const y = parseInt(year ?? '0', 10);
    const r = parseInt(round ?? '0', 10);
    const s = (session === 'S' ? 'S' : 'R') as 'R' | 'S' ;

    if (!y || !r) {
      setError('Invalid session.');
      setLoading(false);
      return;
    }

    fetchReplay(y, r, s)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [year, round, session]);

  const playback = useReplayPlayback(data?.frames ?? []);

  if (loading) {
    return (
      <div className="replay-viewer">
        <div className="loading">
          <p>Loading replay data...</p>
          <p className="muted">This may take a minute if the session hasn't been cached yet.</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="replay-viewer">
        <div className="error-banner">{error ?? 'Failed to load replay'}</div>
        <Link to="/">Back to sessions</Link>
      </div>
    );
  }

  return (
    <div className="replay-viewer">
      <header className="replay-header">
        <Link to="/" className="back-link">← Back</Link>
        <SessionInfo info={data.session_info} />
      </header>

      <div className="replay-main">
        <div className="track-container">
          <TrackCanvas
            track={data.track}
            circuitRotation={data.circuit_rotation}
            frames={playback.frames}
            driverColors={data.driver_colors}
            interpRef={playback.interpRef}
          />
        </div>
        <aside className="sidebar">
          <Leaderboard
            frame={playback.currentFrame}
            driverColors={data.driver_colors}
          />
          <WeatherPanel frame={playback.currentFrame} />
        </aside>
      </div>

      <div className="replay-controls">
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
      </div>
    </div>
  );
}
