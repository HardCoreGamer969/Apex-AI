import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReplayPayload } from '../types/api';

const DATA_FPS = 5;

export interface InterpolationState {
  indexA: number;
  indexB: number;
  alpha: number;
}

export function useReplayPlayback(data: ReplayPayload | null) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const positionRef = useRef(0);
  const interpRef = useRef<InterpolationState>({ indexA: 0, indexB: 0, alpha: 0 });
  const lastTickRef = useRef(0);
  const rafId = useRef<number | undefined>(undefined);
  const playingRef = useRef(false);
  const speedRef = useRef(1);

  const totalFrames = data?.timeline.length ?? 0;

  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    speedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    positionRef.current = 0;
    interpRef.current = { indexA: 0, indexB: 0, alpha: 0 };
    setFrameIndex(0);
    setIsPlaying(false);
  }, [totalFrames]);

  const currentTime = data ? (data.timeline[frameIndex] ?? 0) : 0;
  const currentLap = data ? (data.leader_laps[frameIndex] ?? 1) : 1;

  const seek = useCallback(
    (newIndex: number) => {
      const clamped = Math.max(0, Math.min(newIndex, totalFrames - 1));
      positionRef.current = clamped;
      interpRef.current = {
        indexA: Math.floor(clamped),
        indexB: Math.min(Math.floor(clamped) + 1, totalFrames - 1),
        alpha: clamped - Math.floor(clamped),
      };
      setFrameIndex(Math.floor(clamped));
    },
    [totalFrames]
  );

  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);

  useEffect(() => {
    if (!isPlaying || totalFrames === 0) return;

    const tick = (now: number) => {
      if (!playingRef.current) return;

      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;

      const frameDelta = (elapsed / 1000) * DATA_FPS * speedRef.current;
      const newPos = Math.min(positionRef.current + frameDelta, totalFrames - 1);
      positionRef.current = newPos;

      const indexA = Math.floor(newPos);
      const indexB = Math.min(indexA + 1, totalFrames - 1);
      interpRef.current = { indexA, indexB, alpha: newPos - indexA };

      const newFrameIndex = indexA;
      setFrameIndex((prev) => {
        if (prev !== newFrameIndex) return newFrameIndex;
        return prev;
      });

      if (newPos >= totalFrames - 1) {
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
  }, [isPlaying, totalFrames]);

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
