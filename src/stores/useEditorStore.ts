/**
 * Editor Store — Editor settings, recording state, display preferences.
 *
 * Extracted from useTrackerStore to reduce its ~1900-line god-store.
 * Contains only self-contained editor state with no pattern data dependencies.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { ColumnVisibility } from '@typedefs';
import { DEFAULT_COLUMN_VISIBILITY } from '@typedefs';
import { MAX_CHANNELS } from '../constants/trackerConstants';
import { useCursorStore } from './useCursorStore';
import { getBehaviorForScheme, DEFAULT_BEHAVIOR, type EditorBehavior } from '../engine/keyboard/EditorBehavior';

// FT2-style bitwise mask system for copy/paste/transpose operations
const MASK_NOTE = 1 << 0;      // 0b00001
const MASK_INSTRUMENT = 1 << 1; // 0b00010
const MASK_VOLUME = 1 << 2;     // 0b00100
const MASK_EFFECT = 1 << 3;     // 0b01000
const MASK_EFFECT2 = 1 << 4;    // 0b10000
const MASK_ALL = 0b11111;       // All columns

const _toggleMaskBit = (mask: number, bit: number): number => mask ^ bit;

interface EditorStore {
  // Editor settings
  currentOctave: number;
  recordMode: boolean;
  editStep: number;
  insertMode: boolean;
  wrapMode: boolean;
  recordQuantize: boolean;
  autoRecord: boolean;
  multiChannelRecord: boolean;
  linearPeriods: boolean;

  // Display preferences
  followPlayback: boolean;
  showGhostPatterns: boolean;
  columnVisibility: ColumnVisibility;
  bookmarks: number[];

  // FT2-style bitwise masks for selective operations
  copyMask: number;
  pasteMask: number;
  transposeMask: number;

  // Multi-channel recording
  multiRecEnabled: boolean;
  multiEditEnabled: boolean;
  multiRecChannels: boolean[];
  multiKeyJazz: boolean;
  recQuantEnabled: boolean;
  recQuantRes: number;
  recReleaseEnabled: boolean;

  // Key tracking for multi-channel recording
  keyOnTab: number[];
  keyOffTime: number[];
  keyOffCounter: number;

  // Active editor behavior profile (per-scheme)
  activeBehavior: EditorBehavior;

  // PT-style effect macro slots (10 slots for storing effect commands)
  effectMacros: Array<{ effTyp: number; eff: number } | null>;

  // PT-style sample bank (0 = low bank 0-15, 16 = high bank 16-31)
  ptSampleBank: number;
  setPtSampleBank: (bank: number) => void;

  // Jump positions
  ptnJumpPos: number[];

  // Actions — editor behavior
  setActiveBehavior: (schemeName: string) => void;

  // Actions — editor settings
  setCurrentOctave: (octave: number) => void;
  toggleRecordMode: () => void;
  setEditStep: (step: number) => void;
  toggleInsertMode: () => void;
  toggleWrapMode: () => void;
  toggleRecordQuantize: () => void;
  toggleAutoRecord: () => void;
  toggleMultiChannelRecord: () => void;
  setLinearPeriods: (enabled: boolean) => void;

  // Actions — display
  setFollowPlayback: (enabled: boolean) => void;
  setShowGhostPatterns: (enabled: boolean) => void;
  setColumnVisibility: (visibility: Partial<ColumnVisibility>) => void;
  toggleBookmark: (row: number) => void;
  clearBookmarks: () => void;
  nextBookmark: () => void;
  prevBookmark: () => void;

  // Actions — masks
  setCopyMask: (mask: number) => void;
  setPasteMask: (mask: number) => void;
  setTransposeMask: (mask: number) => void;
  toggleMaskBit: (maskType: 'copy' | 'paste' | 'transpose', bit: number) => void;

  // Actions — multi-channel recording
  setMultiRecEnabled: (enabled: boolean) => void;
  setMultiEditEnabled: (enabled: boolean) => void;
  toggleMultiRecChannel: (channelIndex: number) => void;
  setMultiKeyJazz: (enabled: boolean) => void;
  setRecQuantEnabled: (enabled: boolean) => void;
  setRecQuantRes: (res: number) => void;
  setRecReleaseEnabled: (enabled: boolean) => void;

  // Actions — key tracking
  setKeyOn: (channelIndex: number, noteNum: number) => void;
  setKeyOff: (channelIndex: number) => void;
  resetKeyTracking: () => void;

  // Actions — jump positions
  setPtnJumpPos: (index: number, row: number) => void;
  getPtnJumpPos: (index: number) => number;

  // Actions — effect macros (PT-style)
  setEffectMacro: (slot: number, effTyp: number, eff: number) => void;
  getEffectMacro: (slot: number) => { effTyp: number; eff: number } | null;

  // Reset editor state (called by useTrackerStore.reset)
  reset: () => void;
}

export const useEditorStore = create<EditorStore>()(
  immer((set, get) => ({
    // Initial state
    currentOctave: 4,
    recordMode: false,
    editStep: 1,
    insertMode: false,
    wrapMode: false,
    recordQuantize: false,
    autoRecord: false,
    multiChannelRecord: false,
    linearPeriods: false,

    followPlayback: false,
    showGhostPatterns: true,
    columnVisibility: { ...DEFAULT_COLUMN_VISIBILITY },
    bookmarks: [],

    copyMask: MASK_ALL,
    pasteMask: MASK_ALL,
    transposeMask: MASK_NOTE,

    multiRecEnabled: false,
    multiEditEnabled: false,
    multiRecChannels: Array(MAX_CHANNELS).fill(true),
    multiKeyJazz: false,
    recQuantEnabled: false,
    recQuantRes: 16,
    recReleaseEnabled: false,

    keyOnTab: Array(MAX_CHANNELS).fill(0),
    keyOffTime: Array(MAX_CHANNELS).fill(0),
    keyOffCounter: 0,

    ptnJumpPos: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    effectMacros: Array(10).fill(null) as Array<{ effTyp: number; eff: number } | null>,
    ptSampleBank: 0,
    activeBehavior: DEFAULT_BEHAVIOR,

    // ── Editor behavior ──────────────────────────────────────────────────
    setActiveBehavior: (schemeName) =>
      set((state) => {
        state.activeBehavior = getBehaviorForScheme(schemeName) as any;
      }),

    setPtSampleBank: (bank) =>
      set((state) => { state.ptSampleBank = bank; }),

    // ── Editor settings ──────────────────────────────────────────────────

    setCurrentOctave: (octave) =>
      set((state) => {
        state.currentOctave = Math.max(1, Math.min(7, octave));
      }),

    toggleRecordMode: () =>
      set((state) => { state.recordMode = !state.recordMode; }),

    setEditStep: (step) =>
      set((state) => {
        state.editStep = Math.max(0, Math.min(16, step));
      }),

    toggleInsertMode: () =>
      set((state) => { state.insertMode = !state.insertMode; }),

    toggleWrapMode: () =>
      set((state) => { state.wrapMode = !state.wrapMode; }),

    toggleRecordQuantize: () =>
      set((state) => { state.recordQuantize = !state.recordQuantize; }),

    toggleAutoRecord: () =>
      set((state) => { state.autoRecord = !state.autoRecord; }),

    toggleMultiChannelRecord: () =>
      set((state) => { state.multiChannelRecord = !state.multiChannelRecord; }),

    setLinearPeriods: (enabled) =>
      set((state) => { state.linearPeriods = enabled; }),

    // ── Display preferences ──────────────────────────────────────────────

    setFollowPlayback: (enabled) =>
      set((state) => { state.followPlayback = enabled; }),

    setShowGhostPatterns: (enabled) =>
      set((state) => { state.showGhostPatterns = enabled; }),

    setColumnVisibility: (visibility) =>
      set((state) => { Object.assign(state.columnVisibility, visibility); }),

    toggleBookmark: (row) =>
      set((state) => {
        const idx = state.bookmarks.indexOf(row);
        if (idx === -1) {
          state.bookmarks.push(row);
          state.bookmarks.sort((a, b) => a - b);
        } else {
          state.bookmarks.splice(idx, 1);
        }
      }),

    clearBookmarks: () =>
      set((state) => { state.bookmarks = []; }),

    nextBookmark: () => {
      const sorted = [...get().bookmarks].sort((a, b) => a - b);
      const curRow = useCursorStore.getState().cursor.rowIndex;
      const after = sorted.find(r => r > curRow);
      if (after !== undefined) useCursorStore.getState().moveCursorToRow(after);
    },

    prevBookmark: () => {
      const sorted = [...get().bookmarks].sort((a, b) => a - b);
      const curRow = useCursorStore.getState().cursor.rowIndex;
      const before = [...sorted].reverse().find(r => r < curRow);
      if (before !== undefined) useCursorStore.getState().moveCursorToRow(before);
    },

    // ── Mask operations ──────────────────────────────────────────────────

    setCopyMask: (mask) =>
      set((state) => { state.copyMask = mask & MASK_ALL; }),

    setPasteMask: (mask) =>
      set((state) => { state.pasteMask = mask & MASK_ALL; }),

    setTransposeMask: (mask) =>
      set((state) => { state.transposeMask = mask & MASK_ALL; }),

    toggleMaskBit: (maskType, bit) =>
      set((state) => {
        if (maskType === 'copy') {
          state.copyMask = _toggleMaskBit(state.copyMask, bit);
        } else if (maskType === 'paste') {
          state.pasteMask = _toggleMaskBit(state.pasteMask, bit);
        } else if (maskType === 'transpose') {
          state.transposeMask = _toggleMaskBit(state.transposeMask, bit);
        }
      }),

    // ── Multi-channel recording ──────────────────────────────────────────

    setMultiRecEnabled: (enabled) =>
      set((state) => { state.multiRecEnabled = enabled; }),

    setMultiEditEnabled: (enabled) =>
      set((state) => { state.multiEditEnabled = enabled; }),

    toggleMultiRecChannel: (channelIndex) =>
      set((state) => {
        if (channelIndex >= 0 && channelIndex < state.multiRecChannels.length) {
          state.multiRecChannels[channelIndex] = !state.multiRecChannels[channelIndex];
        }
      }),

    setMultiKeyJazz: (enabled) =>
      set((state) => { state.multiKeyJazz = enabled; }),

    setRecQuantEnabled: (enabled) =>
      set((state) => { state.recQuantEnabled = enabled; }),

    setRecQuantRes: (res) =>
      set((state) => {
        if ([1, 2, 4, 8, 16].includes(res)) {
          state.recQuantRes = res;
        }
      }),

    setRecReleaseEnabled: (enabled) =>
      set((state) => { state.recReleaseEnabled = enabled; }),

    // ── Key tracking ─────────────────────────────────────────────────────

    setKeyOn: (channelIndex, noteNum) =>
      set((state) => {
        if (channelIndex >= 0 && channelIndex < state.keyOnTab.length) {
          state.keyOnTab[channelIndex] = noteNum;
        }
      }),

    setKeyOff: (channelIndex) =>
      set((state) => {
        if (channelIndex >= 0 && channelIndex < state.keyOnTab.length) {
          state.keyOffCounter++;
          state.keyOnTab[channelIndex] = 0;
          state.keyOffTime[channelIndex] = state.keyOffCounter;
        }
      }),

    resetKeyTracking: () =>
      set((state) => {
        state.keyOnTab = state.keyOnTab.map(() => 0);
        state.keyOffTime = state.keyOffTime.map(() => 0);
        state.keyOffCounter = 0;
      }),

    // ── Jump positions ───────────────────────────────────────────────────

    setPtnJumpPos: (index, row) =>
      set((state) => {
        if (index >= 0 && index < 10) {
          state.ptnJumpPos[index] = row;
        }
      }),

    getPtnJumpPos: (index) => {
      const { ptnJumpPos } = get();
      return (index >= 0 && index < 10) ? ptnJumpPos[index] : 0;
    },

    // ── Effect macros ────────────────────────────────────────────────────

    setEffectMacro: (slot, effTyp, eff) =>
      set((state) => {
        if (slot >= 0 && slot < 10) {
          state.effectMacros[slot] = { effTyp, eff };
        }
      }),

    getEffectMacro: (slot) => {
      const { effectMacros } = get();
      return (slot >= 0 && slot < 10) ? effectMacros[slot] : null;
    },

    // ── Reset ────────────────────────────────────────────────────────────

    reset: () =>
      set((state) => {
        state.currentOctave = 4;
        state.recordMode = false;
        state.editStep = 1;
        state.insertMode = false;
        state.columnVisibility = { ...DEFAULT_COLUMN_VISIBILITY };
        state.copyMask = MASK_ALL;
        state.pasteMask = MASK_ALL;
        state.transposeMask = MASK_NOTE;
        state.linearPeriods = false;
      }),
  }))
);

// Re-export mask constants for use in other modules
export { MASK_NOTE, MASK_INSTRUMENT, MASK_VOLUME, MASK_EFFECT, MASK_EFFECT2, MASK_ALL };
export { _toggleMaskBit as toggleMaskBitFn, type EditorStore };
