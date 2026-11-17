import { create } from 'zustand';

export interface FurnaceLogEntry { tick: number; cmd: number; channel: number; value1: number; value2: number }

/** Newest-last ring of chip commands shown by the Log Viewer. */
export const FURNACE_LOG_LIMIT = 500;

interface FurnaceLogState {
  entries: FurnaceLogEntry[];
  append: (batch: FurnaceLogEntry[]) => void;
  clear: () => void;
}

export const useFurnaceLogStore = create<FurnaceLogState>((set) => ({
  entries: [],
  append: (batch) => set((s) => ({ entries: [...s.entries, ...batch].slice(-FURNACE_LOG_LIMIT) })),
  clear: () => set({ entries: [] }),
}));
