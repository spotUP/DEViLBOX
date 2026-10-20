/**
 * The R2 render-event log of the render in flight (spec 2026-10-20_r2a-event-protocol.md 3.4): the store, not a
 * component, holds it. upRoughSongService is the one writer; the build view reads `events`.
 */
import { create } from 'zustand';
import type { R2Event } from '@engine/uprough/r2Events';

interface UpRoughR2State {
  events: R2Event[];
  /** Bumped by every `begin`, so a reader can tell a new render from the same one growing. */
  run: number;
  begin: () => void;
  append: (event: R2Event) => void;
}

export const useUpRoughR2Store = create<UpRoughR2State>((set) => ({
  events: [], run: 0,
  begin: () => set((s) => ({ events: [], run: s.run + 1 })),
  append: (event) => set((s) => ({ events: [...s.events, event] })),
}));
