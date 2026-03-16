import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReplayPayload } from '../types/api';

export interface InterpolationState {
  indexA: number;
  indexB: number;
  alpha: number;
}

/** Find last index where timeline[i] <= t */
function findIndexForTime(timeline: number[], t: number): number {
  if (timeline.length === 0) return 0;
  if (t <= timeline[0]) return 0;
  if (t >= timeline[timeline.length - 1]) return timeline.length - 1;
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (timeline[i] <= t) return i;
  }
  return 0;
}

export function useReplayPlayback(data: ReplayPayload | null) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const currentTimeRef = useRef(0);
  const interpRef = useRef<InterpolationState>({ indexA: 0, indexB: 0, alpha: 0 });
  const lastTickRef = useRef(0);
  const rafId = useRef<number | undefined>(undefined);
  const playingRef = useRef(false);
  const speedRef = useRef(1);

  const totalFrames = data?.timeline.length ?? 0;
  const totalDuration = data && data.timeline.length > 0
    ? data.timeline[data.timeline.length - 1]
    : 0;

  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    speedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    currentTimeRef.current = 0;
    interpRef.current = { indexA: 0, indexB: 0, alpha: 0 };
    setFrameIndex(0);
    setIsPlaying(false);
  }, [totalFrames]);

  const currentTime = data ? (data.timeline[frameIndex] ?? 0) : 0;
  const currentLap = data ? (data.leader_laps[frameIndex] ?? 1) : 1;

  const seek = useCallback(
    (newIndex: number) => {
      if (!data) return;
      const clamped = Math.max(0, Math.min(newIndex, totalFrames - 1));
      const t = data.timeline[clamped] ?? 0;
      currentTimeRef.current = t;

      const idxA = findIndexForTime(data.timeline, t);
      const idxB = Math.min(idxA + 1, totalFrames - 1);
      const dt = (data.timeline[idxB] ?? data.timeline[idxA]) - (data.timeline[idxA] ?? 0);
      const alpha = dt > 0 ? (t - (data.timeline[idxA] ?? 0)) / dt : 0;

      interpRef.current = { indexA: idxA, indexB: idxB, alpha };
      setFrameIndex(idxA);
    },
    [data, totalFrames]
  );

  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);

  useEffect(() => {
    if (!isPlaying || totalFrames === 0 || !data) return;

    const tick = (now: number) => {
      if (!playingRef.current) return;

      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;

      const newTime = Math.min(
        currentTimeRef.current + (elapsed / 1000) * speedRef.current,
        totalDuration
      );
      currentTimeRef.current = newTime;

      const idxA = findIndexForTime(data.timeline, newTime);
      const idxB = Math.min(idxA + 1, totalFrames - 1);
      const tA = data.timeline[idxA] ?? 0;
      const tB = data.timeline[idxB] ?? tA;
      const alpha = tB > tA ? (newTime - tA) / (tB - tA) : 0;

      interpRef.current = { indexA: idxA, indexB: idxB, alpha };
      setFrameIndex(idxA);

      if (newTime >= totalDuration) {
        setIsPlaying(false);
        return;
      }

      rafId.current = requestAnimationFrame(tick);
    };

    lastTickRef.current = performance.now();
    rafId.current = requestAnimationFrame(tick);
    return () => {
      if (rafId.current !== undefined) cancelAnimationFrame(rafId.current);
    };
  }, [isPlaying, totalFrames, totalDuration, data]);

  return {
    frameIndex,
    totalFrames,
    isPlaying,
    play,
    pause,
    seek,
    setSpeed: setPlaybackSpeed,
    playbackSpeed,
    interpRef,
    currentTime,
    currentLap,
  };
}
