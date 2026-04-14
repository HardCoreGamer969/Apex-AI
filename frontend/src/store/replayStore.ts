import { create } from 'zustand';

interface ReplayStore {
  isPlaying: boolean;
  playbackSpeed: number;
  frameIndex: number;
  overlayToggles: {
    speed: boolean;
    throttle: boolean;
    brake: boolean;
    gear: boolean;
    drs: boolean;
  };
  setIsPlaying: (v: boolean) => void;
  setPlaybackSpeed: (v: number) => void;
  setFrameIndex: (v: number) => void;
  toggleOverlay: (channel: keyof ReplayStore['overlayToggles']) => void;
}

export const useReplayStore = create<ReplayStore>((set) => ({
  isPlaying: false,
  playbackSpeed: 1,
  frameIndex: 0,
  overlayToggles: {
    speed: true,
    throttle: false,
    brake: false,
    gear: false,
    drs: false,
  },
  setIsPlaying: (v) => set({ isPlaying: v }),
  setPlaybackSpeed: (v) => set({ playbackSpeed: v }),
  setFrameIndex: (v) => set({ frameIndex: v }),
  toggleOverlay: (channel) =>
    set((s) => ({
      overlayToggles: { ...s.overlayToggles, [channel]: !s.overlayToggles[channel] },
    })),
}));
