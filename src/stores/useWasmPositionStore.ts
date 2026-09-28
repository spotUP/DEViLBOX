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
  /**
   * Set the position an engine reports from its own playback. From the first
   * such report until clear(), the engine owns the position.
   */
  setPosition: (row: number, songPos?: number, channelRows?: number[], channelPositions?: number[]) => void;
  /**
   * Set the position the tracker scheduler computes for a song an engine
   * plays (notes suppressed). Ignored while an engine reports its own: the
   * scheduler's row runs on the song's nominal tempo, not the engine's, and
   * the two alternating made the editor jump between rows and patterns
   * (ghostbattle_gameover.hip7: engine row 31 at 2.0 s, scheduler row 23).
   */
  setSchedulerPosition: (row: number, songPos?: number) => void;
  /** Clear — call when engine stops or song changes */
  clear: () => void;
}

// rAF-throttled position updates — WASM engines fire onPositionUpdate at audio
// callback rate (potentially 100s/sec). We coalesce into one store write per frame.
type PendingPos = { row: number; songPos?: number; channelRows?: number[]; channelPositions?: number[] };
let _pendingPos: PendingPos | null = null;
let _posRaf = 0;
/** An engine has reported its own position since the last clear(). */
let _engineOwned = false;

export const useWasmPositionStore = create<WasmPositionState>()((set, _get) => ({
  active: false,
  row: 0,
  songPos: 0,
  channelRows: [],
  channelPositions: [],
  setPosition: (row: number, songPos?: number, channelRows?: number[], channelPositions?: number[]) => {
    _engineOwned = true;
    queuePosition(set, { row, songPos, channelRows, channelPositions });
  },
  setSchedulerPosition: (row: number, songPos?: number) => {
    if (_engineOwned) return;
    queuePosition(set, { row, songPos });
  },
  clear: () => {
    // Cancel any pending position update
    if (_posRaf) { cancelAnimationFrame(_posRaf); _posRaf = 0; }
    _pendingPos = null;
    _engineOwned = false;
    set({ active: false, row: 0, songPos: 0, channelRows: [], channelPositions: [] });
  },
}));

/** Coalesce position writes into one store update per frame; the latest wins. */
function queuePosition(set: (s: Partial<WasmPositionState>) => void, pos: PendingPos): void {
  _pendingPos = pos;
  if (_posRaf) return;
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
