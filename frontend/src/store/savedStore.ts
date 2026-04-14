import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SavedSession {
  id: string;
  year: number;
  round: number;
  session: string;
  eventName: string;
  country: string;
  date: string;
  savedAt: string;
}

interface SavedStore {
  sessions: SavedSession[];
  save: (session: SavedSession) => void;
  remove: (id: string) => void;
  isSaved: (id: string) => boolean;
}

export const useSavedStore = create<SavedStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      save: (session) =>
        set((s) => ({
          sessions: [session, ...s.sessions.filter((x) => x.id !== session.id)],
        })),
      remove: (id) => set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),
      isSaved: (id) => get().sessions.some((x) => x.id === id),
    }),
    { name: 'apex-saved-sessions' }
  )
);
