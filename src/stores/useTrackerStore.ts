/**
 * Tracker Store - Pattern Data & Editor State
 *
 * Cursor and selection state live in useCursorStore (extracted for performance).
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  Pattern,
  TrackerCell,
  ClipboardData,
  ColumnVisibility,
  EditorMode,
  FurnaceNativeData,
  HivelyNativeData,
  KlysNativeData,
  FurnaceSubsongPlayback,
} from '@typedefs';
import { DEFAULT_COLUMN_VISIBILITY, EMPTY_CELL, CHANNEL_COLORS } from '@typedefs';
import { getToneEngine } from '@engine/ToneEngine';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { useTransportStore } from './useTransportStore';
import { idGenerator } from '../utils/idGenerator';
import { DEFAULT_PATTERN_LENGTH, DEFAULT_NUM_CHANNELS, MAX_PATTERN_LENGTH, MAX_CHANNELS, MIN_CHANNELS, MIN_PATTERN_LENGTH } from '../constants/trackerConstants';
import { SYSTEM_PRESETS, DivChanType } from '../constants/systemPresets';
import { useHistoryStore } from './useHistoryStore';
import { useCursorStore } from './useCursorStore';

// Extracted helper modules
import {
  setCellInPattern, clearCellInPattern, clearChannelInPattern, clearPatternCells,
  insertRowInChannel, deleteRowInChannel,
  applyInstrumentToSelectionHelper, transposeSelectionHelper, remapInstrumentHelper,
  interpolateSelectionHelper, humanizeSelectionHelper, strumSelectionHelper, legatoSelectionHelper,
  scaleVolumeHelper, fadeVolumeHelper, amplifySelectionHelper, swapChannelsHelper,
} from './tracker/patternEditActions';
import {
  copySelectionHelper, cutSelectionHelper,
  pasteHelper, pasteMixHelper, pasteFloodHelper, pastePushForwardHelper,
  copyTrackHelper, cutTrackHelper, pasteTrackHelper,
} from './tracker/clipboardActions';
import {
  type MacroSlot, createEmptyMacroSlot,
  writeMacroSlotHelper, readMacroSlotHelper, findBestChannelHelper,
} from './tracker/multiRecordActions';

// FT2-style bitwise mask system for copy/paste/transpose operations
const MASK_NOTE = 1 << 0;      // 0b00001
const MASK_INSTRUMENT = 1 << 1; // 0b00010
const MASK_VOLUME = 1 << 2;     // 0b00100
const MASK_EFFECT = 1 << 3;     // 0b01000
const MASK_EFFECT2 = 1 << 4;    // 0b10000
const MASK_ALL = 0b11111;       // All columns

const hasMaskBit = (mask: number, bit: number): boolean => (mask & bit) !== 0;
const toggleMaskBit = (mask: number, bit: number): number => mask ^ bit;

interface TrackerStore {
  // State
  patterns: Pattern[];
  currentPatternIndex: number;
  clipboard: ClipboardData | null;
  trackClipboard: TrackerCell[] | null; // FT2: Single-channel clipboard
  followPlayback: boolean;
  showGhostPatterns: boolean; // Show previous/next patterns as ghosts
  columnVisibility: ColumnVisibility;
  // FT2-style bitwise masks for selective operations
  copyMask: number;      // 5-bit: which columns to copy
  pasteMask: number;     // 5-bit: which columns to paste
  transposeMask: number; // 5-bit: which columns to transpose
  macroSlots: MacroSlot[]; // FT2: 8 quick-entry slots
  insertMode: boolean;   // FT2: Insert vs overwrite mode
  currentOctave: number; // FT2: F1-F7 selects octave 1-7
  recordMode: boolean; // When true, entering notes advances cursor by editStep
  editStep: number; // Rows to advance after entering a note (0-16)
  // FT2: Multi-channel recording features
  multiRecEnabled: boolean;    // FT2: Distribute notes across enabled channels during recording
  multiEditEnabled: boolean;   // FT2: Distribute notes across enabled channels during edit
  multiRecChannels: boolean[]; // FT2: Per-channel recording enable (max 32 channels)
  multiKeyJazz: boolean;       // FT2: Multi-channel jamming when not editing
  recQuantEnabled: boolean;    // FT2: Quantize notes to row boundaries during recording
  recQuantRes: number;         // FT2: Quantization resolution (1, 2, 4, 8, 16 rows)
  recReleaseEnabled: boolean;  // FT2: Record note-off when keys are released
  keyOnTab: number[];          // FT2: Track which note (XM) is playing on each channel
  keyOffTime: number[];        // FT2: Track keyoff timing for channel allocation
  keyOffCounter: number;       // FT2: Global counter for keyOffTime allocation
  ptnJumpPos: number[];        // 10 stored jump positions (0-9); first 4 map to F9-F12
  wrapMode: boolean;           // Cursor wraps at pattern boundaries
  recordQuantize: boolean;     // Quantize recorded notes to step grid
  autoRecord: boolean;         // Auto-record notes while playing
  multiChannelRecord: boolean; // Record to multiple channels simultaneously
  bookmarks: number[];         // Row bookmarks in current pattern
  // FT2: Pattern Order List (Song Position List)
  patternOrder: number[]; // Array of pattern indices for song arrangement
  currentPositionIndex: number; // Current position in pattern order (for editing)

  // Original module data for libopenmpt playback (sample-accurate effects)
  originalModuleData: {
    base64: string;
    format: 'MOD' | 'XM' | 'IT' | 'S3M' | 'UNKNOWN';
    sourceFile?: string;
  } | null;

  // Multi-format editor support
  editorMode: EditorMode;
  linearPeriods: boolean; // true = XM/IT/FTM linear frequency table; false = Amiga periods
  furnaceNative: FurnaceNativeData | null;
  hivelyNative: HivelyNativeData | null;
  hivelyFileData: ArrayBuffer | null;
  klysNative: KlysNativeData | null;
  klysFileData: ArrayBuffer | null;
  musiclineFileData: Uint8Array | null;
  c64SidFileData: Uint8Array | null;
  jamCrackerFileData: ArrayBuffer | null;
  futurePlayerFileData: ArrayBuffer | null;
  hivelyMeta: { stereoMode: number; mixGain: number; speedMultiplier: number; version: number } | null;
  furnaceSubsongs: FurnaceSubsongPlayback[] | null;
  furnaceActiveSubsong: number;
  // MusicLine Editor per-channel sequencing data (null for all other formats)
  channelTrackTables: number[][] | null;
  channelSpeeds: number[] | null;
  channelGrooves: number[] | null;

  // SongDB metadata (optional enrichment from audacious-uade-tools database)
  songDBInfo: {
    authors: string[];
    publishers: string[];
    album: string;
    year: string;
    format: string;
    duration_ms: number;
  } | null;

  // C64 SID metadata (extracted from SID header during import)
  sidMetadata: {
    format: string;
    version: number;
    title: string;
    author: string;
    copyright: string;
    chipModel: '6581' | '8580' | 'Unknown';
    clockSpeed: 'PAL' | 'NTSC' | 'Unknown';
    subsongs: number;
    defaultSubsong: number;
    currentSubsong: number;
    secondSID: boolean;
    thirdSID: boolean;
  } | null;
  setSidMetadata: (info: TrackerStore['sidMetadata']) => void;

  // Actions
  setCurrentPattern: (index: number, fromReplayer?: boolean) => void;
  setCell: (channelIndex: number, rowIndex: number, cell: Partial<TrackerCell>) => void;
  clearCell: (channelIndex: number, rowIndex: number) => void;
  clearChannel: (channelIndex: number) => void;
  clearPattern: () => void;
  insertRow: (channelIndex: number, rowIndex: number) => void;
  deleteRow: (channelIndex: number, rowIndex: number) => void;
  setFollowPlayback: (enabled: boolean) => void;
  setShowGhostPatterns: (enabled: boolean) => void;
  setColumnVisibility: (visibility: Partial<ColumnVisibility>) => void;
  // FT2-style mask operations
  setCopyMask: (mask: number) => void;
  setPasteMask: (mask: number) => void;
  setTransposeMask: (mask: number) => void;
  toggleMaskBit: (maskType: 'copy' | 'paste' | 'transpose', bit: number) => void;
  setCurrentOctave: (octave: number) => void;
  toggleRecordMode: () => void;
  setEditStep: (step: number) => void;
  toggleInsertMode: () => void;
  // FT2: Multi-channel recording actions
  setMultiRecEnabled: (enabled: boolean) => void;
  setMultiEditEnabled: (enabled: boolean) => void;
  toggleMultiRecChannel: (channelIndex: number) => void;
  setMultiKeyJazz: (enabled: boolean) => void;
  setRecQuantEnabled: (enabled: boolean) => void;
  setRecQuantRes: (res: number) => void;
  setRecReleaseEnabled: (enabled: boolean) => void;
  // FT2: Key tracking for multi-channel recording
  setKeyOn: (channelIndex: number, noteNum: number) => void;
  setKeyOff: (channelIndex: number) => void;
  findBestChannel: () => number; // Find least-recently-used channel for note allocation
  resetKeyTracking: () => void;
  // FT2: Jump position storage
  setPtnJumpPos: (index: number, row: number) => void;
  getPtnJumpPos: (index: number) => number;

  // Feature toggles
  toggleWrapMode: () => void;
  toggleRecordQuantize: () => void;
  toggleAutoRecord: () => void;
  toggleMultiChannelRecord: () => void;
  toggleBookmark: (row: number) => void;
  clearBookmarks: () => void;
  nextBookmark: () => void;
  prevBookmark: () => void;

  // Advanced editing
  amplifySelection: (factor: number) => void;
  growSelection: () => void;
  shrinkSelection: () => void;
  swapChannels: (aIdx: number, bIdx: number) => void;
  splitPatternAtCursor: () => void;
  joinPatterns: () => void;

  // Block operations
  copySelection: () => void;
  cutSelection: () => void;
  paste: () => void;
  // Advanced paste modes (OpenMPT-style)
  pasteMix: () => void;           // Only fill empty cells
  pasteFlood: () => void;         // Paste until pattern end
  pastePushForward: () => void;   // Insert and shift down

  // FT2: Track operations (single-channel)
  copyTrack: (channelIndex: number) => void;
  cutTrack: (channelIndex: number) => void;
  pasteTrack: (channelIndex: number) => void;

  // FT2: Macro slots (quick-entry)
  writeMacroSlot: (slotIndex: number) => void;  // Store current cell
  readMacroSlot: (slotIndex: number) => void;   // Paste macro

  // Advanced editing
  applyInstrumentToSelection: (instrumentId: number) => void;
  transposeSelection: (semitones: number, currentInstrumentOnly?: boolean) => void;
  remapInstrument: (oldId: number, newId: number, scope: 'block' | 'track' | 'pattern' | 'song') => void;
  interpolateSelection: (column: 'volume' | 'cutoff' | 'resonance' | 'envMod' | 'pan' | 'effParam' | 'effParam2', startValue: number, endValue: number, curve?: 'linear' | 'log' | 'exp' | 'scurve') => void;
  humanizeSelection: (volumeVariation: number) => void;
  strumSelection: (tickDelay: number, direction: 'up' | 'down') => void;
  legatoSelection: () => void;
  // FT2: Volume operations
  scaleVolume: (scope: 'block' | 'track' | 'pattern', factor: number) => void;
  fadeVolume: (scope: 'block' | 'track' | 'pattern', startVol: number, endVol: number) => void;

  // Pattern management
  addPattern: (length?: number) => void;
  deletePattern: (index: number) => void;
  clonePattern: (index: number) => void;
  duplicatePattern: (index: number) => void;
  resizePattern: (index: number, newLength: number) => void;
  resizeAllPatterns: (newLength: number) => void;
  expandPattern: (index: number) => void;
  shrinkPattern: (index: number) => void;
  reorderPatterns: (oldIndex: number, newIndex: number) => void;
  updatePatternName: (index: number, name: string) => void;
  // updateTimeSignature: (index: number, signature: Partial<TimeSignature>) => void;
  // updateAllTimeSignatures: (signature: Partial<TimeSignature>) => void;

  // FT2: Pattern Order List management
  addToOrder: (patternIndex: number, position?: number) => void;
  removeFromOrder: (positionIndex: number) => void;
  insertInOrder: (patternIndex: number, positionIndex: number) => void;
  duplicatePosition: (positionIndex: number) => void;
  clearOrder: () => void;
  reorderPositions: (oldIndex: number, newIndex: number) => void;
  setCurrentPosition: (positionIndex: number, fromReplayer?: boolean) => void;

  // Channel management
  addChannel: () => void;
  removeChannel: (channelIndex: number) => void;
  toggleChannelMute: (channelIndex: number) => void;
  toggleChannelSolo: (channelIndex: number) => void;
  toggleChannelCollapse: (channelIndex: number) => void;
  setChannelVolume: (channelIndex: number, volume: number) => void;
  setChannelPan: (channelIndex: number, pan: number) => void;
  setChannelColor: (channelIndex: number, color: string | null) => void;
  setChannelRows: (channelIndex: number, rows: TrackerCell[]) => void;
  reorderChannel: (fromIndex: number, toIndex: number) => void;
  updateChannelName: (channelIndex: number, name: string) => void;
  applySystemPreset: (presetId: string) => void;
  applyAmigaSongSettings: (presetId: string) => void;
  setChannelRecordGroup: (channelIndex: number, group: 0 | 1 | 2) => void;
  getChannelsInRecordGroup: (group: 1 | 2) => number[];

  // Clipboard
  setClipboard: (data: ClipboardData) => void;

  // Import/Export
  loadPatterns: (patterns: Pattern[]) => void;
  importPattern: (pattern: Pattern) => number;
  setPatternOrder: (order: number[]) => void;
  setOriginalModuleData: (data: TrackerStore['originalModuleData']) => void;

  // Multi-format editor support
  setEditorMode: (mode: EditorMode) => void;
  setFurnaceNative: (data: FurnaceNativeData | null) => void;
  setFurnaceOrderEntry: (channel: number, position: number, patternIndex: number) => void;
  setHivelyNative: (data: HivelyNativeData | null) => void;
  setSongDBInfo: (info: { authors: string[]; publishers: string[]; album: string; year: string; format: string; duration_ms: number } | null) => void;
  applyEditorMode: (song: { linearPeriods?: boolean; furnaceNative?: FurnaceNativeData; hivelyNative?: HivelyNativeData; hivelyFileData?: ArrayBuffer; klysNative?: KlysNativeData; klysFileData?: ArrayBuffer; musiclineFileData?: Uint8Array; c64SidFileData?: Uint8Array; jamCrackerFileData?: ArrayBuffer; futurePlayerFileData?: ArrayBuffer; hivelyMeta?: { stereoMode: number; mixGain: number; speedMultiplier: number; version: number }; furnaceSubsongs?: FurnaceSubsongPlayback[]; furnaceActiveSubsong?: number; channelTrackTables?: number[][]; channelSpeeds?: number[]; channelGrooves?: number[]; goatTrackerData?: Uint8Array }) => void;
  setFurnaceActiveSubsong: (index: number) => void;

  // Undo/Redo support
  replacePattern: (index: number, pattern: Pattern) => void;

  // UADE live pattern display — updates cells in-place without undo history
  setLiveChannelData: (row: number, channelData: Array<{ note: number; instrument: number; volume: number }>) => void;

  // Reset to initial state
  reset: () => void;
}

const createEmptyPattern = (length: number = DEFAULT_PATTERN_LENGTH, numChannels: number = DEFAULT_NUM_CHANNELS): Pattern => ({
  id: idGenerator.generate('pattern'),
  name: 'Untitled Pattern',
  length,
  channels: Array.from({ length: numChannels }, (_, i) => ({
    id: `channel-${i}`,
    name: `Channel ${i + 1}`,
    rows: Array.from({ length }, () => ({ ...EMPTY_CELL })),
    muted: false,
    solo: false,
    collapsed: false,
    volume: 80,
    pan: 0,
    instrumentId: null,
    color: null,
  })),
});

export const useTrackerStore = create<TrackerStore>()(
  immer((set, get) => ({
    // Initial state
    patterns: [createEmptyPattern()],
    currentPatternIndex: 0,
    clipboard: null,
    trackClipboard: null, // FT2: Single-channel clipboard
    followPlayback: false,
    showGhostPatterns: true, // Show ghost patterns by default
    columnVisibility: { ...DEFAULT_COLUMN_VISIBILITY },
    // FT2-style bitwise masks (all columns enabled by default)
    copyMask: MASK_ALL,
    pasteMask: MASK_ALL,
    transposeMask: MASK_NOTE, // Only transpose notes by default
    macroSlots: Array.from({ length: 8 }, () => createEmptyMacroSlot()), // FT2: 8 macro slots
    insertMode: false, // FT2: Start in overwrite mode
    currentOctave: 4, // Default octave (F4)
    recordMode: false, // Start with record mode off
    editStep: 1, // Default edit step (advance 1 row after note entry)
    // FT2: Multi-channel recording features
    multiRecEnabled: false,
    multiEditEnabled: false,
    multiRecChannels: Array(MAX_CHANNELS).fill(true), // All channels enabled by default
    multiKeyJazz: false,
    recQuantEnabled: false,
    recQuantRes: 16, // Default quantization: 16 rows (1 beat at speed 6)
    recReleaseEnabled: false,
    keyOnTab: Array(MAX_CHANNELS).fill(0), // 0 = no note playing
    keyOffTime: Array(MAX_CHANNELS).fill(0),
    keyOffCounter: 0,
    ptnJumpPos: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // 10 stored jump positions (0-9)
    wrapMode: false,
    recordQuantize: false,
    autoRecord: false,
    multiChannelRecord: false,
    bookmarks: [],
    // FT2: Pattern Order List (Song Position List)
    patternOrder: [0], // Start with first pattern in order
    currentPositionIndex: 0, // Start at position 0

    // Original module data for libopenmpt playback
    originalModuleData: null,

    // Multi-format editor support
    editorMode: 'classic' as EditorMode,
    linearPeriods: false,
    furnaceNative: null,
    hivelyNative: null,
    hivelyFileData: null,
    klysNative: null,
    klysFileData: null,
    musiclineFileData: null,
    c64SidFileData: null,
    jamCrackerFileData: null,
    futurePlayerFileData: null,
    hivelyMeta: null,
    furnaceSubsongs: null,
    furnaceActiveSubsong: 0,
    channelTrackTables: null,
    channelSpeeds: null,
    channelGrooves: null,

    songDBInfo: null,
    sidMetadata: null,

    // Actions
    setCurrentPattern: (index, fromReplayer) =>
      set((state) => {
        if (index >= 0 && index < state.patterns.length) {
          if (state.currentPatternIndex === index) return;
          state.currentPatternIndex = index;
          // If this came from the replayer's natural advancement, don't jump —
          // the replayer already knows where it is. jumpToPattern calls seekTo
          // which resets the scheduler timeline, causing ~100ms drift per pattern.
          if (fromReplayer) return;
          // If playing, tell the replayer to jump to this pattern
          const replayer = getTrackerReplayer();
          if (replayer.isPlaying()) {
            replayer.jumpToPattern(index);
          }
        }
      }),

    setCell: (channelIndex, rowIndex, cellUpdate) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        setCellInPattern(state.patterns[state.currentPatternIndex], channelIndex, rowIndex, cellUpdate);
      });
      useHistoryStore.getState().pushAction('EDIT_CELL', 'Edit cell', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    clearCell: (channelIndex, rowIndex) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        clearCellInPattern(state.patterns[state.currentPatternIndex], channelIndex, rowIndex);
      });
      useHistoryStore.getState().pushAction('CLEAR_CELL', 'Clear cell', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    clearChannel: (channelIndex) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        clearChannelInPattern(state.patterns[state.currentPatternIndex], channelIndex);
      });
      useHistoryStore.getState().pushAction('CLEAR_CHANNEL', 'Clear channel', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    clearPattern: () => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        clearPatternCells(state.patterns[state.currentPatternIndex]);
      });
      useHistoryStore.getState().pushAction('CLEAR_PATTERN', 'Clear pattern', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    insertRow: (channelIndex, rowIndex) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        insertRowInChannel(state.patterns[state.currentPatternIndex], channelIndex, rowIndex);
      });
      useHistoryStore.getState().pushAction('INSERT_ROW', 'Insert row', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    deleteRow: (channelIndex, rowIndex) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        deleteRowInChannel(state.patterns[state.currentPatternIndex], channelIndex, rowIndex);
      });
      useHistoryStore.getState().pushAction('DELETE_ROW', 'Delete row', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    setFollowPlayback: (enabled) =>
      set((state) => {
        state.followPlayback = enabled;
      }),

    setShowGhostPatterns: (enabled) =>
      set((state) => {
        state.showGhostPatterns = enabled;
      }),

    setColumnVisibility: (visibility) =>
      set((state) => {
        Object.assign(state.columnVisibility, visibility);
      }),

    // FT2-style mask operations
    setCopyMask: (mask) =>
      set((state) => {
        state.copyMask = mask & MASK_ALL; // Ensure only valid bits
      }),

    setPasteMask: (mask) =>
      set((state) => {
        state.pasteMask = mask & MASK_ALL;
      }),

    setTransposeMask: (mask) =>
      set((state) => {
        state.transposeMask = mask & MASK_ALL;
      }),

    toggleMaskBit: (maskType, bit) =>
      set((state) => {
        if (maskType === 'copy') {
          state.copyMask = toggleMaskBit(state.copyMask, bit);
        } else if (maskType === 'paste') {
          state.pasteMask = toggleMaskBit(state.pasteMask, bit);
        } else if (maskType === 'transpose') {
          state.transposeMask = toggleMaskBit(state.transposeMask, bit);
        }
      }),

    setCurrentOctave: (octave) =>
      set((state) => {
        // Clamp octave to valid range 1-7 (FT2 style)
        state.currentOctave = Math.max(1, Math.min(7, octave));
      }),

    toggleRecordMode: () =>
      set((state) => {
        state.recordMode = !state.recordMode;
      }),

    setEditStep: (step) =>
      set((state) => {
        // Clamp edit step to valid range 0-16
        state.editStep = Math.max(0, Math.min(16, step));
      }),

    toggleInsertMode: () =>
      set((state) => {
        state.insertMode = !state.insertMode;
      }),

    // FT2: Multi-channel recording actions
    setMultiRecEnabled: (enabled) =>
      set((state) => {
        state.multiRecEnabled = enabled;
      }),

    setMultiEditEnabled: (enabled) =>
      set((state) => {
        state.multiEditEnabled = enabled;
      }),

    toggleMultiRecChannel: (channelIndex) =>
      set((state) => {
        if (channelIndex >= 0 && channelIndex < state.multiRecChannels.length) {
          state.multiRecChannels[channelIndex] = !state.multiRecChannels[channelIndex];
        }
      }),

    setMultiKeyJazz: (enabled) =>
      set((state) => {
        state.multiKeyJazz = enabled;
      }),

    setRecQuantEnabled: (enabled) =>
      set((state) => {
        state.recQuantEnabled = enabled;
      }),

    setRecQuantRes: (res) =>
      set((state) => {
        // Valid values: 1, 2, 4, 8, 16
        if ([1, 2, 4, 8, 16].includes(res)) {
          state.recQuantRes = res;
        }
      }),

    setRecReleaseEnabled: (enabled) =>
      set((state) => {
        state.recReleaseEnabled = enabled;
      }),

    // FT2: Key tracking for multi-channel recording
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

    findBestChannel: () => {
      const state = get();
      const pattern = state.patterns[state.currentPatternIndex];
      const numChannels = pattern?.channels.length || 1;
      const cursorChannel = useCursorStore.getState().cursor.channelIndex;
      return findBestChannelHelper(state, numChannels, cursorChannel);
    },

    resetKeyTracking: () =>
      set((state) => {
        state.keyOnTab = state.keyOnTab.map(() => 0);
        state.keyOffTime = state.keyOffTime.map(() => 0);
        state.keyOffCounter = 0;
      }),

    // FT2: Jump position storage
    setPtnJumpPos: (index, row) =>
      set((state) => {
        if (index >= 0 && index < 10) {
          state.ptnJumpPos[index] = row;
        }
      }),

    getPtnJumpPos: (index) => {
      const state = get();
      if (index >= 0 && index < 10) {
        return state.ptnJumpPos[index];
      }
      return 0;
    },

    copySelection: () =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const { cursor, selection } = useCursorStore.getState();
        state.clipboard = copySelectionHelper(pattern, selection, cursor);
      }),

    cutSelection: () => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const { cursor, selection } = useCursorStore.getState();
        state.clipboard = cutSelectionHelper(pattern, selection, cursor);
      });
      useCursorStore.getState().clearSelection();
      useHistoryStore.getState().pushAction('CUT_SELECTION', 'Cut', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    setClipboard: (data) =>
      set((state) => {
        state.clipboard = data;
      }),

    paste: () => {
      if (!get().clipboard) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        if (!state.clipboard) return;
        const pattern = state.patterns[state.currentPatternIndex];
        const cursor = useCursorStore.getState().cursor;
        pasteHelper(pattern, cursor, state.clipboard, state.pasteMask);
      });
      useHistoryStore.getState().pushAction('PASTE', 'Paste', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // OpenMPT-style Mix Paste: Only fill empty cells
    pasteMix: () => {
      if (!get().clipboard) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        if (!state.clipboard) return;
        const pattern = state.patterns[state.currentPatternIndex];
        const cursor = useCursorStore.getState().cursor;
        pasteMixHelper(pattern, cursor, state.clipboard, state.pasteMask);
      });
      useHistoryStore.getState().pushAction('PASTE_MIX', 'Mix paste', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // OpenMPT-style Flood Paste: Paste repeatedly until pattern end
    pasteFlood: () => {
      if (!get().clipboard) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        if (!state.clipboard) return;
        const pattern = state.patterns[state.currentPatternIndex];
        const cursor = useCursorStore.getState().cursor;
        pasteFloodHelper(pattern, cursor, state.clipboard, state.pasteMask);
      });
      useHistoryStore.getState().pushAction('PASTE_FLOOD', 'Flood paste', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // OpenMPT-style Push-Forward Paste: Insert clipboard data and shift existing content down
    pastePushForward: () => {
      if (!get().clipboard) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        if (!state.clipboard) return;
        const pattern = state.patterns[state.currentPatternIndex];
        const cursor = useCursorStore.getState().cursor;
        pastePushForwardHelper(pattern, cursor, state.clipboard, state.pasteMask);
      });
      useHistoryStore.getState().pushAction('PASTE_PUSH_FORWARD', 'Push-forward paste', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // FT2: Track operations (single-channel copy/paste)
    copyTrack: (channelIndex) =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const result = copyTrackHelper(pattern, channelIndex);
        if (result) state.trackClipboard = result;
      }),

    cutTrack: (channelIndex) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const p = state.patterns[state.currentPatternIndex];
        const result = cutTrackHelper(p, channelIndex);
        if (result) state.trackClipboard = result;
      });
      useHistoryStore.getState().pushAction('CUT_TRACK', 'Cut track', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    pasteTrack: (channelIndex) => {
      if (!get().trackClipboard) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        if (!state.trackClipboard) return;
        const p = state.patterns[state.currentPatternIndex];
        pasteTrackHelper(p, channelIndex, state.trackClipboard, state.pasteMask);
      });
      useHistoryStore.getState().pushAction('PASTE_TRACK', 'Paste track', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // FT2: Macro slots (quick-entry)
    writeMacroSlot: (slotIndex) =>
      set((state) => {
        if (slotIndex < 0 || slotIndex >= 8) return;
        const pattern = state.patterns[state.currentPatternIndex];
        const cursor = useCursorStore.getState().cursor;
        state.macroSlots[slotIndex] = writeMacroSlotHelper(pattern, cursor);
      }),

    readMacroSlot: (slotIndex) => {
      if (slotIndex < 0 || slotIndex >= 8) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        if (slotIndex < 0 || slotIndex >= 8) return;
        const macro = state.macroSlots[slotIndex];
        const pattern = state.patterns[state.currentPatternIndex];
        const cursor = useCursorStore.getState().cursor;
        readMacroSlotHelper(pattern, cursor, macro, state.pasteMask, state.insertMode);
      });
      useHistoryStore.getState().pushAction('READ_MACRO', 'Apply macro', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // Advanced editing - Apply instrument number to all notes in selection
    applyInstrumentToSelection: (instrumentId) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const { cursor, selection } = useCursorStore.getState();
        applyInstrumentToSelectionHelper(pattern, selection, cursor, instrumentId);
      });
      useHistoryStore.getState().pushAction('EDIT_CELL', 'Apply instrument to selection', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // Advanced editing - Transpose selection by semitones
    transposeSelection: (semitones, currentInstrumentOnly = false) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const { cursor, selection } = useCursorStore.getState();
        const targetInstrumentId = currentInstrumentOnly
          ? pattern.channels[cursor.channelIndex].rows[cursor.rowIndex].instrument
          : null;
        transposeSelectionHelper(pattern, selection, cursor, semitones, targetInstrumentId);
      });
      useHistoryStore.getState().pushAction('TRANSPOSE', 'Transpose', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // Swap all occurrences of Instrument A with Instrument B
    remapInstrument: (oldId, newId, scope) =>
      set((state) => {
        const { cursor, selection } = useCursorStore.getState();
        remapInstrumentHelper(state.patterns, state.currentPatternIndex, selection, cursor, oldId, newId, scope);
      }),

    // Advanced editing - Interpolate values in selection
    interpolateSelection: (column, startValue, endValue, curve = 'linear') => {
      const sel = useCursorStore.getState().selection;
      if (!sel) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const currentSel = useCursorStore.getState().selection;
        if (!currentSel) return;
        interpolateSelectionHelper(state.patterns[state.currentPatternIndex], currentSel, column, startValue, endValue, curve);
      });
      useHistoryStore.getState().pushAction('INTERPOLATE', 'Interpolate', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // Advanced editing - Humanize selection (add random variation to volume)
    humanizeSelection: (volumeVariation) => {
      const sel = useCursorStore.getState().selection;
      if (!sel) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const currentSel = useCursorStore.getState().selection;
        if (!currentSel) return;
        humanizeSelectionHelper(state.patterns[state.currentPatternIndex], currentSel, volumeVariation);
      });
      useHistoryStore.getState().pushAction('HUMANIZE', 'Humanize', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // Strum: add incremental note delays across channels (EDx effect)
    strumSelection: (tickDelay, direction) => {
      const sel = useCursorStore.getState().selection;
      if (!sel) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const currentSel = useCursorStore.getState().selection;
        if (!currentSel) return;
        strumSelectionHelper(state.patterns[state.currentPatternIndex], currentSel, tickDelay, direction);
      });
      useHistoryStore.getState().pushAction('STRUM', 'Strum', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // Legato: for each channel in selection, extend each note's duration
    legatoSelection: () => {
      const sel = useCursorStore.getState().selection;
      if (!sel) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const currentSel = useCursorStore.getState().selection;
        if (!currentSel) return;
        legatoSelectionHelper(state.patterns[state.currentPatternIndex], currentSel);
      });
      useHistoryStore.getState().pushAction('LEGATO', 'Legato', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // FT2: Scale volume (multiply by factor)
    scaleVolume: (scope, factor) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const { cursor, selection } = useCursorStore.getState();
        scaleVolumeHelper(pattern, scope, factor, selection, cursor);
      });
      useHistoryStore.getState().pushAction('SCALE_VOLUME', 'Scale volume', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // FT2: Fade volume (linear interpolation)
    fadeVolume: (scope, startVol, endVol) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const { cursor, selection } = useCursorStore.getState();
        fadeVolumeHelper(pattern, scope, startVol, endVol, selection, cursor);
      });
      useHistoryStore.getState().pushAction('FADE_VOLUME', 'Fade volume', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // Feature toggles
    toggleWrapMode: () =>
      set((state) => { state.wrapMode = !state.wrapMode; }),

    toggleRecordQuantize: () =>
      set((state) => { state.recordQuantize = !state.recordQuantize; }),

    toggleAutoRecord: () =>
      set((state) => { state.autoRecord = !state.autoRecord; }),

    toggleMultiChannelRecord: () =>
      set((state) => { state.multiChannelRecord = !state.multiChannelRecord; }),

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

    // Advanced editing methods
    amplifySelection: (factor) => {
      const selection = useCursorStore.getState().selection;
      const { currentPatternIndex } = get();
      if (!selection) return;
      const beforePattern = get().patterns[currentPatternIndex];
      set((state) => {
        amplifySelectionHelper(state.patterns[state.currentPatternIndex], selection, factor);
      });
      useHistoryStore.getState().pushAction('AMPLIFY', 'Amplify selection', currentPatternIndex, beforePattern, get().patterns[currentPatternIndex]);
    },

    growSelection: () => {
      const { patterns, currentPatternIndex } = get();
      const pattern = patterns[currentPatternIndex];
      const sel = useCursorStore.getState().selection;
      if (!sel) return;
      useCursorStore.setState({
        selection: {
          ...sel,
          startRow: Math.max(0, sel.startRow - 1),
          endRow: Math.min(pattern.length - 1, sel.endRow + 1),
          startChannel: Math.max(0, sel.startChannel - 1),
          endChannel: Math.min(pattern.channels.length - 1, sel.endChannel + 1),
        },
      });
    },

    shrinkSelection: () => {
      const sel = useCursorStore.getState().selection;
      if (!sel) return;
      const midRow = Math.floor((sel.startRow + sel.endRow) / 2);
      const midCh = Math.floor((sel.startChannel + sel.endChannel) / 2);
      useCursorStore.setState({
        selection: {
          ...sel,
          startRow: Math.min(sel.startRow + 1, midRow),
          endRow: Math.max(sel.endRow - 1, midRow),
          startChannel: Math.min(sel.startChannel + 1, midCh),
          endChannel: Math.max(sel.endChannel - 1, midCh),
        },
      });
    },

    swapChannels: (aIdx, bIdx) => {
      const { patterns, currentPatternIndex } = get();
      const pattern = patterns[currentPatternIndex];
      if (aIdx < 0 || bIdx < 0 || aIdx >= pattern.channels.length || bIdx >= pattern.channels.length) return;
      const beforePattern = pattern;
      set((state) => {
        swapChannelsHelper(state.patterns[state.currentPatternIndex], aIdx, bIdx);
      });
      useHistoryStore.getState().pushAction('SWAP_CHANNELS', 'Swap channels', currentPatternIndex, beforePattern, get().patterns[currentPatternIndex]);
    },

    splitPatternAtCursor: () => {
      const { patterns, currentPatternIndex } = get();
      const pattern = patterns[currentPatternIndex];
      const splitRow = useCursorStore.getState().cursor.rowIndex;
      if (splitRow <= 0 || splitRow >= pattern.length) return;
      const newPatternRows = pattern.length - splitRow;
      set((state) => {
        const pat = state.patterns[state.currentPatternIndex];
        const newChannels = pat.channels.map(ch => ({
          ...ch,
          id: `${ch.id}-split`,
          rows: ch.rows.slice(splitRow),
        }));
        pat.channels.forEach(ch => { ch.rows = ch.rows.slice(0, splitRow); });
        pat.length = splitRow;
        const newPattern: Pattern = {
          id: idGenerator.generate('pattern'),
          name: `${pat.name} (split)`,
          length: newPatternRows,
          channels: newChannels,
        };
        state.patterns.splice(state.currentPatternIndex + 1, 0, newPattern);
      });
    },

    joinPatterns: () => {
      const { patterns, currentPatternIndex } = get();
      if (currentPatternIndex >= patterns.length - 1) return;
      const beforeCurrent = patterns[currentPatternIndex];
      set((state) => {
        const cur = state.patterns[state.currentPatternIndex];
        const next = state.patterns[state.currentPatternIndex + 1];
        const minChannels = Math.min(cur.channels.length, next.channels.length);
        for (let ch = 0; ch < minChannels; ch++) {
          cur.channels[ch].rows = [...cur.channels[ch].rows, ...next.channels[ch].rows];
        }
        cur.length = cur.channels[0].rows.length;
        state.patterns.splice(state.currentPatternIndex + 1, 1);
      });
      useHistoryStore.getState().pushAction('JOIN_PATTERNS', 'Join patterns', currentPatternIndex, beforeCurrent, get().patterns[currentPatternIndex]);
    },

    addPattern: (length = DEFAULT_PATTERN_LENGTH) =>
      set((state) => {
        const numChannels = state.patterns[0]?.channels.length || DEFAULT_NUM_CHANNELS;
        state.patterns.push(createEmptyPattern(length, numChannels));
        // Add status message
        if (typeof window !== 'undefined') {
          import('@stores/useUIStore').then(({ useUIStore }) => {
            useUIStore.getState().setStatusMessage('PATTERN ADDED');
          });
        }
      }),

    deletePattern: (index) =>
      set((state) => {
        if (state.patterns.length > 1 && index >= 0 && index < state.patterns.length) {
          state.patterns.splice(index, 1);
          if (state.currentPatternIndex >= state.patterns.length) {
            state.currentPatternIndex = state.patterns.length - 1;
          }
          // Update patternOrder: remove references to deleted index, decrement higher indices
          state.patternOrder = state.patternOrder
            .filter((p) => p !== index)
            .map((p) => (p > index ? p - 1 : p));
          if (state.patternOrder.length === 0) state.patternOrder = [0];
          if (state.currentPositionIndex >= state.patternOrder.length) {
            state.currentPositionIndex = state.patternOrder.length - 1;
          }
          // Add status message
          if (typeof window !== 'undefined') {
            import('@stores/useUIStore').then(({ useUIStore }) => {
              useUIStore.getState().setStatusMessage('PATTERN DELETED');
            });
          }
        }
      }),

    clonePattern: (index) =>
      set((state) => {
        if (index >= 0 && index < state.patterns.length) {
          const original = state.patterns[index];
          const cloned: Pattern = structuredClone(original);
          cloned.id = idGenerator.generate('pattern');
          cloned.name = `${original.name} (Copy)`;
          state.patterns.splice(index + 1, 0, cloned);
          // Shift patternOrder indices that are > index to account for the splice
          state.patternOrder = state.patternOrder.map((p) => (p > index ? p + 1 : p));
          // Add status message
          if (typeof window !== 'undefined') {
            import('@stores/useUIStore').then(({ useUIStore }) => {
              useUIStore.getState().setStatusMessage('PATTERN CLONED');
            });
          }
        }
      }),

    resizePattern: (index, newLength) =>
      set((state) => {
        if (index >= 0 && index < state.patterns.length && newLength > 0) {
          const pattern = state.patterns[index];
          const oldLength = pattern.length;
          pattern.length = newLength;

          pattern.channels.forEach((channel) => {
            if (newLength > oldLength) {
              // Add empty rows
              for (let i = oldLength; i < newLength; i++) {
                channel.rows.push({ ...EMPTY_CELL });
              }
            } else {
              // Trim rows
              channel.rows.splice(newLength);
            }
          });
        }
      }),

    resizeAllPatterns: (newLength) =>
      set((state) => {
        if (newLength > 0) {
          state.patterns.forEach((pattern) => {
            const oldLength = pattern.length;
            pattern.length = newLength;

            pattern.channels.forEach((channel) => {
              if (newLength > oldLength) {
                // Add empty rows
                for (let i = oldLength; i < newLength; i++) {
                  channel.rows.push({ ...EMPTY_CELL });
                }
              } else {
                // Trim rows
                channel.rows.splice(newLength);
              }
            });
          });
        }
      }),

    duplicatePattern: (index) =>
      set((state) => {
        if (index >= 0 && index < state.patterns.length) {
          const original = state.patterns[index];
          const cloned: Pattern = structuredClone(original);
          cloned.id = idGenerator.generate('pattern');
          cloned.name = `${original.name} (Copy)`;
          state.patterns.splice(index + 1, 0, cloned);
          // Shift patternOrder indices that are > index to account for the splice
          state.patternOrder = state.patternOrder.map((p) => (p > index ? p + 1 : p));
          state.currentPatternIndex = index + 1;
        }
      }),

    expandPattern: (index) =>
      set((state) => {
        if (index >= 0 && index < state.patterns.length) {
          const pattern = state.patterns[index];
          const oldLength = pattern.length;
          const newLength = Math.min(oldLength * 2, MAX_PATTERN_LENGTH); // Max 256 rows

          if (newLength === oldLength) return;

          pattern.length = newLength;
          pattern.channels.forEach((channel) => {
            const newRows: typeof channel.rows = [];
            // Double each row
            for (let i = 0; i < oldLength; i++) {
              newRows.push(channel.rows[i]);
              newRows.push({ ...EMPTY_CELL });
            }
            channel.rows = newRows;
          });
        }
      }),

    shrinkPattern: (index) =>
      set((state) => {
        if (index >= 0 && index < state.patterns.length) {
          const pattern = state.patterns[index];
          const oldLength = pattern.length;
          const newLength = Math.max(Math.floor(oldLength / 2), MIN_PATTERN_LENGTH); // Min 1 row

          if (newLength === oldLength) return;

          pattern.length = newLength;
          pattern.channels.forEach((channel) => {
            const newRows: typeof channel.rows = [];
            // Take every other row
            for (let i = 0; i < newLength; i++) {
              newRows.push(channel.rows[i * 2]);
            }
            channel.rows = newRows;
          });
        }
      }),

    reorderPatterns: (oldIndex, newIndex) =>
      set((state) => {
        if (
          oldIndex >= 0 &&
          oldIndex < state.patterns.length &&
          newIndex >= 0 &&
          newIndex < state.patterns.length &&
          oldIndex !== newIndex
        ) {
          // Remove pattern from old position
          const [pattern] = state.patterns.splice(oldIndex, 1);
          // Insert at new position
          state.patterns.splice(newIndex, 0, pattern);

          // Update current pattern index to follow the moved pattern if needed
          if (state.currentPatternIndex === oldIndex) {
            state.currentPatternIndex = newIndex;
          } else if (
            oldIndex < state.currentPatternIndex &&
            newIndex >= state.currentPatternIndex
          ) {
            state.currentPatternIndex--;
          } else if (
            oldIndex > state.currentPatternIndex &&
            newIndex <= state.currentPatternIndex
          ) {
            state.currentPatternIndex++;
          }
        }
      }),

    updatePatternName: (index, name) =>
      set((state) => {
        if (index >= 0 && index < state.patterns.length && name.trim()) {
          state.patterns[index].name = name.trim();
        }
      }),

    // updateTimeSignature: (index, signature) =>
    //   set((state) => {
    //     if (index >= 0 && index < state.patterns.length) {
    //       const pattern = state.patterns[index];
    //       if (!pattern.timeSignature) pattern.timeSignature = { beatsPerMeasure: 4, stepsPerBeat: 4 };
    //       Object.assign(pattern.timeSignature, signature);
    //     }
    //   }),

    // updateAllTimeSignatures: (signature) =>
    //   set((state) => {
    //     state.patterns.forEach(pattern => {
    //       if (!pattern.timeSignature) pattern.timeSignature = { beatsPerMeasure: 4, stepsPerBeat: 4 };
    //       Object.assign(pattern.timeSignature, signature);
    //     });
    //   }),

    // Channel management
    addChannel: () =>
      set((state) => {
        const maxChannels = MAX_CHANNELS;
        // Get available colors (excluding null)
        const availableColors = CHANNEL_COLORS.filter((c) => c !== null) as string[];
        // Pick a random color for the new channel
        const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)];

        state.patterns.forEach((pattern) => {
          if (pattern.channels.length < maxChannels) {
            const newChannelIndex = pattern.channels.length;
            pattern.channels.push({
              id: idGenerator.generate('channel'),
              name: `Channel ${newChannelIndex + 1}`,
              rows: Array.from({ length: pattern.length }, () => ({ ...EMPTY_CELL })),
              muted: false,
              solo: false,
              collapsed: false,
              volume: 80,
              pan: 0,
              instrumentId: null,
              color: randomColor,
            });
          }
        });
        // Add status message
        if (typeof window !== 'undefined') {
          import('@stores/useUIStore').then(({ useUIStore }) => {
            useUIStore.getState().setStatusMessage('CHANNEL ADDED');
          });
        }
      }),

    removeChannel: (channelIndex) =>
      set((state) => {
        const minChannels = MIN_CHANNELS;
        state.patterns.forEach((pattern) => {
          if (
            pattern.channels.length > minChannels &&
            channelIndex >= 0 &&
            channelIndex < pattern.channels.length
          ) {
            pattern.channels.splice(channelIndex, 1);
          }
        });
        // Adjust cursor if needed (cursor lives in useCursorStore)
        const curCh = useCursorStore.getState().cursor.channelIndex;
        if (curCh >= state.patterns[0]?.channels.length) {
          useCursorStore.getState().moveCursorToChannel(Math.max(0, state.patterns[0].channels.length - 1));
        }
        // Add status message
        if (typeof window !== 'undefined') {
          import('@stores/useUIStore').then(({ useUIStore }) => {
            useUIStore.getState().setStatusMessage('CHANNEL REMOVED');
          });
        }
      }),

    toggleChannelMute: (channelIndex) => {
      let isMuted = false;
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
            pattern.channels[channelIndex].muted = !pattern.channels[channelIndex].muted;
            isMuted = pattern.channels[channelIndex].muted;
          }
        });
      });
      // Update audio engine with new mute states
      const state = get();
      const pattern = state.patterns[state.currentPatternIndex];
      if (pattern) {
        const engine = getToneEngine();
        engine.updateMuteStates(pattern.channels.map(ch => ({ muted: ch.muted, solo: ch.solo })));
      }
      // Add status message
      if (typeof window !== 'undefined') {
        import('@stores/useUIStore').then(({ useUIStore }) => {
          useUIStore.getState().setStatusMessage(isMuted ? 'MUTED' : 'UNMUTED');
        });
      }
    },

    toggleChannelSolo: (channelIndex) => {
      let isSolo = false;
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
            const wasAlreadySolo = pattern.channels[channelIndex].solo;
            // Clear all solos first (exclusive solo behavior)
            pattern.channels.forEach((ch) => {
              ch.solo = false;
            });
            // Toggle the clicked channel (if it was solo, it's now off; if it wasn't, it's now on)
            if (!wasAlreadySolo) {
              pattern.channels[channelIndex].solo = true;
              isSolo = true;
            }
          }
        });
      });
      // Update audio engine with new mute/solo states
      const state = get();
      const pattern = state.patterns[state.currentPatternIndex];
      if (pattern) {
        const engine = getToneEngine();
        engine.updateMuteStates(pattern.channels.map(ch => ({ muted: ch.muted, solo: ch.solo })));
      }
      // Add status message
      if (typeof window !== 'undefined') {
        import('@stores/useUIStore').then(({ useUIStore }) => {
          useUIStore.getState().setStatusMessage(isSolo ? 'SOLO ON' : 'SOLO OFF');
        });
      }
    },

    toggleChannelCollapse: (channelIndex) =>
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
            pattern.channels[channelIndex].collapsed = !pattern.channels[channelIndex].collapsed;
          }
        });
      }),

    setChannelVolume: (channelIndex, volume) =>
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
            pattern.channels[channelIndex].volume = Math.max(0, Math.min(100, volume));
          }
        });
      }),

    setChannelPan: (channelIndex, pan) =>
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
            pattern.channels[channelIndex].pan = Math.max(-100, Math.min(100, pan));
          }
        });
      }),

    setChannelColor: (channelIndex, color) =>
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
            pattern.channels[channelIndex].color = color;
          }
        });
      }),

    setChannelRows: (channelIndex, rows) =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
          // Ensure rows array matches pattern length
          const paddedRows = [...rows];
          while (paddedRows.length < pattern.length) {
            paddedRows.push({ ...EMPTY_CELL });
          }
          pattern.channels[channelIndex].rows = paddedRows.slice(0, pattern.length);
        }
      }),

    reorderChannel: (fromIndex, toIndex) =>
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (
            fromIndex >= 0 &&
            fromIndex < pattern.channels.length &&
            toIndex >= 0 &&
            toIndex < pattern.channels.length &&
            fromIndex !== toIndex
          ) {
            // Remove channel from original position
            const [channel] = pattern.channels.splice(fromIndex, 1);
            // Insert at new position
            pattern.channels.splice(toIndex, 0, channel);
          }
        });
        // Adjust cursor if it was on the moved channel (cursor lives in useCursorStore)
        const curCh = useCursorStore.getState().cursor.channelIndex;
        if (curCh === fromIndex) {
          useCursorStore.getState().moveCursorToChannel(toIndex);
        } else if (fromIndex < curCh && toIndex >= curCh) {
          useCursorStore.getState().moveCursorToChannel(curCh - 1);
        } else if (fromIndex > curCh && toIndex <= curCh) {
          useCursorStore.getState().moveCursorToChannel(curCh + 1);
        }
      }),

    updateChannelName: (channelIndex, name) =>
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
            pattern.channels[channelIndex].name = name;
          }
        });
      }),

    applySystemPreset: (presetId) =>
      set((state) => {
        const preset = SYSTEM_PRESETS.find((p) => p.id === presetId);
        if (!preset) {
          console.warn(`[useTrackerStore] Preset not found: ${presetId}`);
          return;
        }

        // Map DivChanType to CHANNEL_COLORS indices
        // null, Red, Orange, Yellow, Green, Teal, Cyan, Blue, Purple, Pink, Gray
        const getColorForType = (type: DivChanType): string | null => {
          switch (type) {
            case DivChanType.FM: return CHANNEL_COLORS[7]; // Blue
            case DivChanType.PULSE: return CHANNEL_COLORS[1]; // Red
            case DivChanType.WAVE: return CHANNEL_COLORS[3]; // Yellow
            case DivChanType.NOISE: return CHANNEL_COLORS[10]; // Gray
            case DivChanType.PCM: return CHANNEL_COLORS[4]; // Green
            case DivChanType.OP: return CHANNEL_COLORS[6]; // Cyan
            default: return null;
          }
        };

        state.patterns.forEach((pattern) => {
          if (preset.id === 'none') {
            // Reset to generic names
            pattern.channels.forEach((ch, i) => {
              ch.name = `Channel ${i + 1}`;
              ch.shortName = `${i + 1}`;
              ch.color = null;
              if (ch.channelMeta) {
                delete ch.channelMeta.furnaceType;
                delete ch.channelMeta.hardwareName;
              }
            });
            return;
          }

          if (preset.channelDefs.length > 0) {
            preset.channelDefs.forEach((chDef, idx) => {
              const chColor = getColorForType(chDef.type);
              if (idx < pattern.channels.length) {
                // Update existing channel
                pattern.channels[idx].name = chDef.name;
                pattern.channels[idx].shortName = chDef.shortName;
                pattern.channels[idx].color = chColor;
                
                // Technical metadata for 1:1 compatibility
                pattern.channels[idx].channelMeta = {
                  ...pattern.channels[idx].channelMeta,
                  importedFromMOD: pattern.channels[idx].channelMeta?.importedFromMOD ?? false,
                  channelType: chDef.type === DivChanType.PCM ? 'sample' : 'synth',
                  furnaceType: chDef.type,
                  hardwareName: chDef.name,
                  shortName: chDef.shortName,
                  systemId: preset.fileID
                };
              } else if (pattern.channels.length < MAX_CHANNELS) {
                // Add missing hardware channels
                const length = pattern.length;
                pattern.channels.push({
                  id: idGenerator.generate('channel'),
                  name: chDef.name,
                  shortName: chDef.shortName,
                  rows: Array.from({ length }, () => ({ ...EMPTY_CELL })),
                  muted: false,
                  solo: false,
                  collapsed: false,
                  volume: 80,
                  pan: 0,
                  instrumentId: null,
                  color: chColor,
                  channelMeta: {
                    importedFromMOD: false,
                    channelType: chDef.type === DivChanType.PCM ? 'sample' : 'synth',
                    furnaceType: chDef.type,
                    hardwareName: chDef.name,
                    shortName: chDef.shortName,
                    systemId: preset.fileID
                  }
                });
              }
            });

            // If pattern has more channels than preset, REMOVE them to match hardware constraints
            if (pattern.channels.length > preset.channelDefs.length) {
              pattern.channels.splice(preset.channelDefs.length);
            }
          }
        });

        // Add status message
        if (typeof window !== 'undefined') {
          import('@stores/useUIStore').then(({ useUIStore }) => {
            useUIStore.getState().setStatusMessage(`SYSTEM: ${preset.name.toUpperCase()}`);
          });
        }
      }),

    applyAmigaSongSettings: (presetId) => {
      const preset = SYSTEM_PRESETS.find((p) => p.id === presetId);
      if (!preset?.amigaFormat) return;

      // Paula hard-pan: ch0=Left, ch1=Right, ch2=Right, ch3=Left (repeating for >4ch)
      const paulaPan = [-100, 100, 100, -100];
      set((state) => {
        state.patterns.forEach((pattern) => {
          pattern.channels.forEach((ch, i) => {
            ch.pan = paulaPan[i % 4] ?? 0;
          });
        });
      });

      // Apply BPM via transport store (dynamic import to avoid circular deps)
      const bpm = preset.defaultBpm ?? 125;
      import('@stores/useTransportStore').then(({ useTransportStore }) => {
        useTransportStore.getState().setBPM(bpm);
      });
    },

    setChannelRecordGroup: (channelIndex, group) =>
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
            pattern.channels[channelIndex].recordGroup = group;
          }
        });
      }),

    getChannelsInRecordGroup: (group) => {
      const state = get();
      const pattern = state.patterns[state.currentPatternIndex];
      if (!pattern) return [];
      return pattern.channels
        .map((ch, i) => (ch.recordGroup === group ? i : -1))
        .filter((i) => i >= 0);
    },

    // Import/Export
    loadPatterns: (patterns) =>
      set((state) => {
        if (patterns.length > 0) {
          // Ensure all channels have required properties (color) and length is valid
          const normalizedPatterns = patterns.map((pattern) => ({
            ...pattern,
            length: Math.max(1, pattern.length),
            channels: pattern.channels.map((channel) => ({
              ...channel,
              color: channel.color ?? null,
            })),
          }));
          state.patterns = normalizedPatterns;
          state.currentPatternIndex = 0;
          useCursorStore.setState({
            cursor: { channelIndex: 0, rowIndex: 0, columnType: 'note', digitIndex: 0 },
            selection: null,
          });
          state.clipboard = null;
        }
      }),

    setPatternOrder: (order) =>
      set((state) => {
        if (order.length > 0) {
          state.patternOrder = order;
          state.currentPositionIndex = 0;
        }
      }),

    setOriginalModuleData: (data) =>
      set((state) => {
        state.originalModuleData = data;
      }),

    // Multi-format editor support
    setEditorMode: (mode) =>
      set((state) => {
        state.editorMode = mode;
      }),

    setFurnaceNative: (data) =>
      set((state) => {
        state.furnaceNative = data;
      }),

    setFurnaceOrderEntry: (channel, position, patternIndex) =>
      set((state) => {
        if (!state.furnaceNative) return;
        const sub = state.furnaceNative.subsongs[state.furnaceNative.activeSubsong];
        if (!sub) return;
        if (channel < 0 || channel >= sub.orders.length) return;
        if (position < 0 || position >= sub.ordersLen) return;
        sub.orders[channel][position] = patternIndex;
      }),

    setHivelyNative: (data) =>
      set((state) => {
        state.hivelyNative = data;
      }),

    setSongDBInfo: (info) =>
      set((state) => {
        state.songDBInfo = info;
      }),

    setSidMetadata: (info) =>
      set((state) => {
        state.sidMetadata = info;
      }),

    applyEditorMode: (song) =>
      set((state) => {
        // Always store linearPeriods — affects period→Hz math for XM, IT, FTM, XTracker etc.
        state.linearPeriods = song.linearPeriods ?? false;
        // Always store native file data for C64 SID and JamCracker engines
        state.c64SidFileData = song.c64SidFileData ?? null;
        state.jamCrackerFileData = song.jamCrackerFileData ?? null;
        state.futurePlayerFileData = song.futurePlayerFileData ?? null;
        if (song.furnaceNative) {
          state.editorMode = 'furnace';
          state.furnaceNative = song.furnaceNative;
          state.hivelyNative = null;
          state.hivelyFileData = null;
          state.klysNative = null;
          state.klysFileData = null;
          state.musiclineFileData = null;
          state.hivelyMeta = null;
          state.furnaceSubsongs = song.furnaceSubsongs ?? null;
          state.furnaceActiveSubsong = song.furnaceActiveSubsong ?? 0;
          state.channelTrackTables = null;
          state.channelSpeeds = null;
          state.channelGrooves = null;
        } else if (song.hivelyNative) {
          state.editorMode = 'hively';
          state.hivelyNative = song.hivelyNative;
          state.hivelyFileData = song.hivelyFileData ?? null;
          state.klysNative = null;
          state.klysFileData = null;
          state.musiclineFileData = null;
          state.hivelyMeta = song.hivelyMeta ?? null;
          state.furnaceNative = null;
          state.furnaceSubsongs = null;
          state.furnaceActiveSubsong = 0;
          state.channelTrackTables = null;
          state.channelSpeeds = null;
          state.channelGrooves = null;
        } else if (song.klysNative) {
          state.editorMode = 'klystrack';
          state.klysNative = song.klysNative;
          state.klysFileData = song.klysFileData ?? null;
          state.hivelyNative = null;
          state.hivelyFileData = null;
          state.musiclineFileData = null;
          state.hivelyMeta = null;
          state.furnaceNative = null;
          state.furnaceSubsongs = null;
          state.furnaceActiveSubsong = 0;
          state.channelTrackTables = null;
          state.channelSpeeds = null;
          state.channelGrooves = null;
        } else if (song.channelTrackTables) {
          // MusicLine Editor and similar per-channel formats
          state.editorMode = 'musicline';
          state.furnaceNative = null;
          state.hivelyNative = null;
          state.hivelyFileData = null;
          state.klysNative = null;
          state.klysFileData = null;
          state.musiclineFileData = song.musiclineFileData ?? null;
          state.hivelyMeta = null;
          state.furnaceSubsongs = null;
          state.furnaceActiveSubsong = 0;
          state.channelTrackTables = song.channelTrackTables;
          state.channelSpeeds = song.channelSpeeds ?? null;
          state.channelGrooves = song.channelGrooves ?? null;
        } else if (song.jamCrackerFileData) {
          // JamCracker Pro — 4-channel Amiga tracker (.jam files)
          state.editorMode = 'jamcracker';
          state.furnaceNative = null;
          state.hivelyNative = null;
          state.hivelyFileData = null;
          state.klysNative = null;
          state.klysFileData = null;
          state.musiclineFileData = null;
          state.hivelyMeta = null;
          state.furnaceSubsongs = null;
          state.furnaceActiveSubsong = 0;
          state.channelTrackTables = null;
          state.channelSpeeds = null;
          state.channelGrooves = null;
        } else if (song.goatTrackerData) {
          // GoatTracker Ultra SID tracker (.sng files only — requires GT engine)
          state.editorMode = 'goattracker';
          state.furnaceNative = null;
          state.hivelyNative = null;
          state.hivelyFileData = null;
          state.klysNative = null;
          state.klysFileData = null;
          state.musiclineFileData = null;
          state.hivelyMeta = null;
          state.furnaceSubsongs = null;
          state.furnaceActiveSubsong = 0;
          state.channelTrackTables = null;
          state.channelSpeeds = null;
          state.channelGrooves = null;
        } else if (song.c64SidFileData) {
          // C64 .sid files — use GT Ultra view for SID register display
          state.editorMode = 'goattracker';
          state.furnaceNative = null;
          state.hivelyNative = null;
          state.hivelyFileData = null;
          state.klysNative = null;
          state.klysFileData = null;
          state.musiclineFileData = null;
          state.hivelyMeta = null;
          state.furnaceSubsongs = null;
          state.furnaceActiveSubsong = 0;
          state.channelTrackTables = null;
          state.channelSpeeds = null;
          state.channelGrooves = null;
        } else {
          state.editorMode = 'classic';
          state.furnaceNative = null;
          state.hivelyNative = null;
          state.hivelyFileData = null;
          state.klysNative = null;
          state.klysFileData = null;
          state.musiclineFileData = null;
          state.hivelyMeta = null;
          state.furnaceSubsongs = null;
          state.furnaceActiveSubsong = 0;
          state.channelTrackTables = null;
          state.channelSpeeds = null;
          state.channelGrooves = null;
        }
      }),

    setFurnaceActiveSubsong: (index) =>
      set((state) => {
        state.furnaceActiveSubsong = index;
      }),

    importPattern: (pattern) => {
      const newIndex = get().patterns.length;
      set((state) => {
        // Normalize the pattern to ensure all channels have required properties
        const normalizedPattern = {
          ...pattern,
          length: Math.max(1, pattern.length),
          channels: pattern.channels.map((channel) => ({
            ...channel,
            color: channel.color ?? null,
          })),
        };
        state.patterns.push(normalizedPattern);
      });
      return newIndex;
    },

    // Undo/Redo support
    replacePattern: (index, pattern) =>
      set((state) => {
        if (index >= 0 && index < state.patterns.length) {
          // Deep clone the pattern to avoid reference issues
          state.patterns[index] = structuredClone(pattern);
        }
      }),

    // FT2: Pattern Order List management
    addToOrder: (patternIndex, position) =>
      set((state) => {
        if (patternIndex >= 0 && patternIndex < state.patterns.length) {
          if (position !== undefined && position >= 0 && position <= state.patternOrder.length) {
            state.patternOrder.splice(position, 0, patternIndex);
          } else {
            state.patternOrder.push(patternIndex);
          }
        }
      }),

    removeFromOrder: (positionIndex) =>
      set((state) => {
        if (positionIndex >= 0 && positionIndex < state.patternOrder.length) {
          // Don't allow removing the last position
          if (state.patternOrder.length > 1) {
            state.patternOrder.splice(positionIndex, 1);
            // Adjust current position if needed
            if (state.currentPositionIndex >= state.patternOrder.length) {
              state.currentPositionIndex = state.patternOrder.length - 1;
            }
          }
        }
      }),

    insertInOrder: (patternIndex, positionIndex) =>
      set((state) => {
        if (patternIndex >= 0 && patternIndex < state.patterns.length) {
          if (positionIndex >= 0 && positionIndex <= state.patternOrder.length) {
            state.patternOrder.splice(positionIndex, 0, patternIndex);
          }
        }
      }),

    duplicatePosition: (positionIndex) =>
      set((state) => {
        if (positionIndex >= 0 && positionIndex < state.patternOrder.length) {
          const patternIndex = state.patternOrder[positionIndex];
          state.patternOrder.splice(positionIndex + 1, 0, patternIndex);
        }
      }),

    clearOrder: () =>
      set((state) => {
        state.patternOrder = [0]; // Reset to just first pattern
        state.currentPositionIndex = 0;
      }),

    reorderPositions: (oldIndex, newIndex) =>
      set((state) => {
        if (
          oldIndex >= 0 &&
          oldIndex < state.patternOrder.length &&
          newIndex >= 0 &&
          newIndex < state.patternOrder.length
        ) {
          const [movedPattern] = state.patternOrder.splice(oldIndex, 1);
          state.patternOrder.splice(newIndex, 0, movedPattern);

          // Update current position if it was affected
          if (state.currentPositionIndex === oldIndex) {
            state.currentPositionIndex = newIndex;
          } else if (oldIndex < state.currentPositionIndex && newIndex >= state.currentPositionIndex) {
            state.currentPositionIndex--;
          } else if (oldIndex > state.currentPositionIndex && newIndex <= state.currentPositionIndex) {
            state.currentPositionIndex++;
          }
        }
      }),

    setCurrentPosition: (positionIndex, fromReplayer) =>
      set((state) => {
        if (positionIndex >= 0 && positionIndex < state.patternOrder.length) {
          if (state.currentPositionIndex === positionIndex) return;
          state.currentPositionIndex = positionIndex;
          // Also update current pattern to match this position
          const nextPatternIndex = state.patternOrder[positionIndex];
          state.currentPatternIndex = nextPatternIndex;

          // If this update came from the replayer's natural playback advancement,
          // do NOT call seekTo — the replayer already knows where it is.
          // Only seek for user-initiated position changes (clicking pattern order, etc.)
          // This prevents ~100ms cumulative drift per pattern caused by the seekTo
          // resetting the scheduler timeline while the replayer's 100ms lookahead
          // has already scheduled ahead.
          if (fromReplayer) return;

          // If playing, tell the replayer to seek to this position
          const replayer = getTrackerReplayer();
          if (replayer.isPlaying()) {
            // ONLY seek if the replayer isn't already at this position.
            if (replayer.getCurrentPosition() !== positionIndex) {
              // Maintain current row when jumping positions manually
              const currentRow = useTransportStore.getState().currentRow;
              replayer.seekTo(positionIndex, currentRow);
            }
          }
        }
      }),

    // UADE live pattern display — uses immer draft for safe mutation, no undo
    setLiveChannelData: (row, channelData) =>
      set((state) => {
        const patIdx = state.patternOrder[state.currentPositionIndex] ?? state.currentPatternIndex;
        const pattern = state.patterns[patIdx];
        if (!pattern) return;

        for (let ch = 0; ch < Math.min(channelData.length, pattern.channels.length); ch++) {
          const cell = pattern.channels[ch]?.rows[row];
          if (!cell) continue;
          const d = channelData[ch];
          if (d.note > 0) {
            cell.note = d.note;
            cell.instrument = d.instrument;
            cell.volume = d.volume;
          }
        }
      }),

    // Reset to initial state (for new project/tab)
    reset: () => {
      useCursorStore.setState({
        cursor: { channelIndex: 0, rowIndex: 0, columnType: 'note', digitIndex: 0 },
        selection: null,
      });
      set((state) => {
        state.patterns = [createEmptyPattern()];
        state.currentPatternIndex = 0;
        state.clipboard = null;
        state.trackClipboard = null;
        state.currentOctave = 4;
        state.recordMode = false;
        state.editStep = 1;
        state.insertMode = false;
        state.columnVisibility = { ...DEFAULT_COLUMN_VISIBILITY };
        state.copyMask = MASK_ALL;
        state.pasteMask = MASK_ALL;
        state.transposeMask = MASK_NOTE;
        state.macroSlots = Array.from({ length: 8 }, () => createEmptyMacroSlot());
        state.patternOrder = [0];
        state.currentPositionIndex = 0;
        state.editorMode = 'classic';
        state.furnaceNative = null;
        state.hivelyNative = null;
        state.klysNative = null;
        state.klysFileData = null;
        state.furnaceSubsongs = null;
        state.furnaceActiveSubsong = 0;
        state.songDBInfo = null;
        state.sidMetadata = null;
      });
    },
  }))
);

// Export mask constants for use in other modules
export { MASK_NOTE, MASK_INSTRUMENT, MASK_VOLUME, MASK_EFFECT, MASK_EFFECT2, MASK_ALL, hasMaskBit, toggleMaskBit };
export type { MacroSlot };
