/**
 * useWasmPositionStore — Lightweight position store for WASM engines.
 *
 * WASM engines (JamCracker, PreTracker, etc.) report their position
 * directly from the AudioWorklet. This store receives those updates
 * and exposes them to the pattern editor for scrolling.
 *
 * Deliberately separate from useTransportStore to avoid triggering
 * the usePatternPlayback effect chain (which causes recursive engine spawns).
 */

import { create } from 'zustand';

interface WasmPositionState {
  /** Whether a WASM engine is actively reporting position */
  active: boolean;
  /** Current row reported by the WASM engine */
  row: number;
  /** Current song position */
  songPos: number;
  /** Set position from WASM callback */
  setPosition: (row: number, songPos?: number) => void;
  /** Clear — call when engine stops or song changes */
  clear: () => void;
}

export const useWasmPositionStore = create<WasmPositionState>()((set, _get) => ({
  active: false,
  row: 0,
  songPos: 0,
  setPosition: (row: number, songPos?: number) => {
    set({ active: true, row, ...(songPos !== undefined ? { songPos } : {}) });
  },
  clear: () => {
    set({ active: false, row: 0, songPos: 0 });
  },
}));
