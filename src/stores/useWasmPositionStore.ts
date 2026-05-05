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

// rAF-throttled position updates — WASM engines fire onPositionUpdate at audio
// callback rate (potentially 100s/sec). We coalesce into one store write per frame.
let _pendingPos: { row: number; songPos?: number; channelRows?: number[]; channelPositions?: number[] } | null = null;
let _posRaf = 0;

export const useWasmPositionStore = create<WasmPositionState>()((set, _get) => ({
  active: false,
  row: 0,
  songPos: 0,
  channelRows: [],
  channelPositions: [],
  setPosition: (row: number, songPos?: number, channelRows?: number[], channelPositions?: number[]) => {
    // Last-write-wins: overwrite pending with latest position
    _pendingPos = { row, songPos, channelRows, channelPositions };
    if (!_posRaf) {
      _posRaf = requestAnimationFrame(() => {
        _posRaf = 0;
        const p = _pendingPos;
        if (!p) return;
        _pendingPos = null;
        set({
          active: true, row: p.row,
          ...(p.songPos !== undefined ? { songPos: p.songPos } : {}),
          ...(p.channelRows ? { channelRows: p.channelRows } : {}),
          ...(p.channelPositions ? { channelPositions: p.channelPositions } : {}),
        });
      });
    }
  },
  clear: () => {
    // Cancel any pending position update
    if (_posRaf) { cancelAnimationFrame(_posRaf); _posRaf = 0; }
    _pendingPos = null;
    set({ active: false, row: 0, songPos: 0, channelRows: [], channelPositions: [] });
  },
}));
