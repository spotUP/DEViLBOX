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
  /** Current row reported by the WASM engine (global / channel 0) */
  row: number;
  /** Current song position (global / channel 0) */
  songPos: number;
  /** Per-channel row positions (MusicLine — channels advance independently) */
  channelRows: number[];
  /** Per-channel song positions (MusicLine — channels advance independently) */
  channelPositions: number[];
  /** Set position from WASM callback */
  setPosition: (row: number, songPos?: number, channelRows?: number[], channelPositions?: number[]) => void;
  /** Clear — call when engine stops or song changes */
  clear: () => void;
}

export const useWasmPositionStore = create<WasmPositionState>()((set, _get) => ({
  active: false,
  row: 0,
  songPos: 0,
  channelRows: [],
  channelPositions: [],
  setPosition: (row: number, songPos?: number, channelRows?: number[], channelPositions?: number[]) => {
    set({
      active: true, row,
      ...(songPos !== undefined ? { songPos } : {}),
      ...(channelRows ? { channelRows } : {}),
      ...(channelPositions ? { channelPositions } : {}),
    });
  },
  clear: () => {
    set({ active: false, row: 0, songPos: 0, channelRows: [], channelPositions: [] });
  },
}));
