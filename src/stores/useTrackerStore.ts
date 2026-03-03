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
  FurnaceSubsongPlayback,
} from '@typedefs';
import { DEFAULT_COLUMN_VISIBILITY, EMPTY_CELL, CHANNEL_COLORS } from '@typedefs';
import { xmNoteToMidi, midiToXMNote } from '@/lib/xmConversions';
import { getToneEngine } from '@engine/ToneEngine';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { useTransportStore } from './useTransportStore';
import { idGenerator } from '../utils/idGenerator';
import { DEFAULT_PATTERN_LENGTH, DEFAULT_NUM_CHANNELS, MAX_PATTERN_LENGTH, MAX_CHANNELS, MIN_CHANNELS, MIN_PATTERN_LENGTH } from '../constants/trackerConstants';
import { SYSTEM_PRESETS, DivChanType } from '../constants/systemPresets';
import { useHistoryStore } from './useHistoryStore';
import { useCursorStore } from './useCursorStore';

// FT2-style bitwise mask system for copy/paste/transpose operations
// Bit 0: Note
// Bit 1: Instrument
// Bit 2: Volume
// Bit 3: Effect
// Bit 4: Effect2
const MASK_NOTE = 1 << 0;      // 0b00001
const MASK_INSTRUMENT = 1 << 1; // 0b00010
const MASK_VOLUME = 1 << 2;     // 0b00100
const MASK_EFFECT = 1 << 3;     // 0b01000
const MASK_EFFECT2 = 1 << 4;    // 0b10000
const MASK_ALL = 0b11111;       // All columns

// Helper functions for mask operations
const hasMaskBit = (mask: number, bit: number): boolean => (mask & bit) !== 0;
const toggleMaskBit = (mask: number, bit: number): number => mask ^ bit;

// Macro slot structure for rapid data entry (FT2-style)
interface MacroSlot {
  note: number;
  instrument: number;
  volume: number;
  effTyp: number;
  eff: number;
  effTyp2: number;
  eff2: number;
}

const createEmptyMacroSlot = (): MacroSlot => ({
  note: 0,
  instrument: 0,
  volume: 0,
  effTyp: 0,
  eff: 0,
  effTyp2: 0,
  eff2: 0,
});

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
  musiclineFileData: Uint8Array | null;
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
  applyEditorMode: (song: { linearPeriods?: boolean; furnaceNative?: FurnaceNativeData; hivelyNative?: HivelyNativeData; hivelyFileData?: ArrayBuffer; musiclineFileData?: Uint8Array; hivelyMeta?: { stereoMode: number; mixGain: number; speedMultiplier: number; version: number }; furnaceSubsongs?: FurnaceSubsongPlayback[]; furnaceActiveSubsong?: number; channelTrackTables?: number[][]; channelSpeeds?: number[]; channelGrooves?: number[]; goatTrackerData?: Uint8Array }) => void;
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
    musiclineFileData: null,
    hivelyMeta: null,
    furnaceSubsongs: null,
    furnaceActiveSubsong: 0,
    channelTrackTables: null,
    channelSpeeds: null,
    channelGrooves: null,

    songDBInfo: null,

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
        const pattern = state.patterns[state.currentPatternIndex];
        if (
          channelIndex >= 0 &&
          channelIndex < pattern.channels.length &&
          rowIndex >= 0 &&
          rowIndex < pattern.length
        ) {
          pattern.channels[channelIndex].rows[rowIndex] = {
            ...pattern.channels[channelIndex].rows[rowIndex],
            ...cellUpdate,
          };
        }
      });
      useHistoryStore.getState().pushAction('EDIT_CELL', 'Edit cell', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    clearCell: (channelIndex, rowIndex) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        if (
          channelIndex >= 0 &&
          channelIndex < pattern.channels.length &&
          rowIndex >= 0 &&
          rowIndex < pattern.length
        ) {
          pattern.channels[channelIndex].rows[rowIndex] = { ...EMPTY_CELL };
        }
      });
      useHistoryStore.getState().pushAction('CLEAR_CELL', 'Clear cell', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    clearChannel: (channelIndex) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
          pattern.channels[channelIndex].rows = pattern.channels[channelIndex].rows.map(() => ({ ...EMPTY_CELL }));
        }
      });
      useHistoryStore.getState().pushAction('CLEAR_CHANNEL', 'Clear channel', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    clearPattern: () => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        pattern.channels.forEach((channel) => {
          channel.rows = channel.rows.map(() => ({ ...EMPTY_CELL }));
        });
      });
      useHistoryStore.getState().pushAction('CLEAR_PATTERN', 'Clear pattern', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    insertRow: (channelIndex, rowIndex) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        if (
          channelIndex >= 0 &&
          channelIndex < pattern.channels.length &&
          rowIndex >= 0 &&
          rowIndex < pattern.length
        ) {
          const rows = pattern.channels[channelIndex].rows;
          // Shift rows down starting from rowIndex
          for (let i = pattern.length - 1; i > rowIndex; i--) {
            rows[i] = { ...rows[i - 1] };
          }
          // Clear inserted row
          rows[rowIndex] = { ...EMPTY_CELL };
        }
      });
      useHistoryStore.getState().pushAction('INSERT_ROW', 'Insert row', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    deleteRow: (channelIndex, rowIndex) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        if (
          channelIndex >= 0 &&
          channelIndex < pattern.channels.length &&
          rowIndex >= 0 &&
          rowIndex < pattern.length
        ) {
          const rows = pattern.channels[channelIndex].rows;
          // Shift rows up starting from rowIndex
          for (let i = rowIndex; i < pattern.length - 1; i++) {
            rows[i] = { ...rows[i + 1] };
          }
          // Clear last row
          rows[pattern.length - 1] = { ...EMPTY_CELL };
        }
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

      // If multi-rec/multi-edit not enabled, use cursor channel
      if (!state.multiRecEnabled && !state.multiEditEnabled) {
        return cursorChannel;
      }

      // Find channel with lowest keyOffTime that has no note playing and is enabled
      let bestChannel = cursorChannel;
      let bestTime = Infinity;

      for (let i = 0; i < numChannels; i++) {
        if (
          state.multiRecChannels[i] && // Channel is enabled for multi-rec
          state.keyOnTab[i] === 0 &&   // No note currently playing
          state.keyOffTime[i] < bestTime
        ) {
          bestChannel = i;
          bestTime = state.keyOffTime[i];
        }
      }

      return bestChannel;
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
        let sel = selection;
        
        // Fallback: use current cell if no selection
        if (!sel) {
          sel = {
            startChannel: cursor.channelIndex,
            endChannel: cursor.channelIndex,
            startRow: cursor.rowIndex,
            endRow: cursor.rowIndex,
            startColumn: cursor.columnType,
            endColumn: cursor.columnType,
            columnTypes: [cursor.columnType],
          };
        }

        const { startChannel, endChannel, startRow, endRow, columnTypes } = sel;
        const minChannel = Math.min(startChannel, endChannel);
        const maxChannel = Math.max(startChannel, endChannel);
        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);

        const copiedData: TrackerCell[][] = [];
        const isFullCell = !columnTypes || columnTypes.length === 0 || columnTypes.length > 8;

        for (let ch = minChannel; ch <= maxChannel; ch++) {
          const channelData: TrackerCell[] = [];
          for (let row = minRow; row <= maxRow; row++) {
            const sourceCell = pattern.channels[ch].rows[row];
            if (isFullCell) {
              channelData.push({ ...sourceCell });
            } else {
              // Create a "sparse" cell with only selected fields
              const sparseCell: TrackerCell = { ...EMPTY_CELL };
              if (columnTypes.includes('note')) {
                sparseCell.note = sourceCell.note;
                sparseCell.instrument = sourceCell.instrument;
              }
              if (columnTypes.includes('instrument')) sparseCell.instrument = sourceCell.instrument;
              if (columnTypes.includes('volume')) sparseCell.volume = sourceCell.volume;
              if (columnTypes.includes('effTyp') || columnTypes.includes('effParam')) {
                sparseCell.effTyp = sourceCell.effTyp;
                sparseCell.eff = sourceCell.eff;
              }
              if (columnTypes.includes('effTyp2') || columnTypes.includes('effParam2')) {
                sparseCell.effTyp2 = sourceCell.effTyp2;
                sparseCell.eff2 = sourceCell.eff2;
              }
              if (columnTypes.includes('flag1')) sparseCell.flag1 = sourceCell.flag1;
              if (columnTypes.includes('flag2')) sparseCell.flag2 = sourceCell.flag2;
              if (columnTypes.includes('probability')) sparseCell.probability = sourceCell.probability;
              channelData.push(sparseCell);
            }
          }
          copiedData.push(channelData);
        }

        state.clipboard = {
          channels: maxChannel - minChannel + 1,
          rows: maxRow - minRow + 1,
          data: copiedData,
          columnTypes: columnTypes,
        };
      }),

    cutSelection: () => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const { cursor, selection } = useCursorStore.getState();
        let sel = selection;
        
        // Fallback: use current cell if no selection
        if (!sel) {
          sel = {
            startChannel: cursor.channelIndex,
            endChannel: cursor.channelIndex,
            startRow: cursor.rowIndex,
            endRow: cursor.rowIndex,
            startColumn: cursor.columnType,
            endColumn: cursor.columnType,
            columnTypes: [cursor.columnType],
          };
        }

        const { startChannel, endChannel, startRow, endRow, columnTypes } = sel;
        const minChannel = Math.min(startChannel, endChannel);
        const maxChannel = Math.max(startChannel, endChannel);
        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);

        const copiedData: TrackerCell[][] = [];
        const isFullCell = !columnTypes || columnTypes.length === 0 || columnTypes.length > 8;

        for (let ch = minChannel; ch <= maxChannel; ch++) {
          const channelData: TrackerCell[] = [];
          for (let row = minRow; row <= maxRow; row++) {
            const cell = pattern.channels[ch].rows[row];
            
            // Copy logic
            if (isFullCell) {
              channelData.push({ ...cell });
              pattern.channels[ch].rows[row] = { ...EMPTY_CELL };
            } else {
              const sparseCell: TrackerCell = { ...EMPTY_CELL };
              if (columnTypes.includes('note')) {
                sparseCell.note = cell.note;
                sparseCell.instrument = cell.instrument;
                cell.note = 0;
                cell.instrument = 0;
              }
              if (columnTypes.includes('instrument')) {
                sparseCell.instrument = cell.instrument;
                cell.instrument = 0;
              }
              if (columnTypes.includes('volume')) {
                sparseCell.volume = cell.volume;
                cell.volume = 0;
              }
              if (columnTypes.includes('effTyp') || columnTypes.includes('effParam')) {
                sparseCell.effTyp = cell.effTyp;
                sparseCell.eff = cell.eff;
                cell.effTyp = 0;
                cell.eff = 0;
              }
              if (columnTypes.includes('effTyp2') || columnTypes.includes('effParam2')) {
                sparseCell.effTyp2 = cell.effTyp2;
                sparseCell.eff2 = cell.eff2;
                cell.effTyp2 = 0;
                cell.eff2 = 0;
              }
              if (columnTypes.includes('flag1')) {
                sparseCell.flag1 = cell.flag1;
                cell.flag1 = undefined;
              }
              if (columnTypes.includes('flag2')) {
                sparseCell.flag2 = cell.flag2;
                cell.flag2 = undefined;
              }
              if (columnTypes.includes('probability')) {
                sparseCell.probability = cell.probability;
                cell.probability = undefined;
              }
              channelData.push(sparseCell);
            }
          }
          copiedData.push(channelData);
        }

        state.clipboard = {
          channels: maxChannel - minChannel + 1,
          rows: maxRow - minRow + 1,
          data: copiedData,
          columnTypes: columnTypes,
        };

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
        const { channelIndex, rowIndex } = useCursorStore.getState().cursor;
        const { data, columnTypes } = state.clipboard;
        const { pasteMask } = state;
        
        const isSparse = !!(columnTypes && columnTypes.length > 0 && columnTypes.length <= 8);

        for (let ch = 0; ch < data.length; ch++) {
          const targetChannel = channelIndex + ch;
          if (targetChannel >= pattern.channels.length) break;

          for (let row = 0; row < data[ch].length; row++) {
            const targetRow = rowIndex + row;
            if (targetRow >= pattern.length) break;

            const sourceCell = data[ch][row];
            const targetCell = pattern.channels[targetChannel].rows[targetRow];

            // Merge properties based on pasteMask AND columnTypes if sparse
            if (hasMaskBit(pasteMask, MASK_NOTE) && (!isSparse || columnTypes.includes('note'))) {
              targetCell.note = sourceCell.note;
              if (sourceCell.instrument !== 0) {
                targetCell.instrument = sourceCell.instrument;
              }
            }
            if (hasMaskBit(pasteMask, MASK_INSTRUMENT) && (!isSparse || columnTypes.includes('instrument'))) {
              targetCell.instrument = sourceCell.instrument;
            }
            if (hasMaskBit(pasteMask, MASK_VOLUME) && (!isSparse || columnTypes.includes('volume'))) {
              targetCell.volume = sourceCell.volume;
            }
            if (hasMaskBit(pasteMask, MASK_EFFECT) && (!isSparse || columnTypes.includes('effTyp') || columnTypes.includes('effParam'))) {
              targetCell.effTyp = sourceCell.effTyp;
              targetCell.eff = sourceCell.eff;
            }
            if (hasMaskBit(pasteMask, MASK_EFFECT2) && (!isSparse || columnTypes.includes('effTyp2') || columnTypes.includes('effParam2'))) {
              targetCell.effTyp2 = sourceCell.effTyp2;
              targetCell.eff2 = sourceCell.eff2;
            }
            
            // Flags and prob
            if (isSparse) {
              if (columnTypes.includes('flag1')) targetCell.flag1 = sourceCell.flag1;
              if (columnTypes.includes('flag2')) targetCell.flag2 = sourceCell.flag2;
              if (columnTypes.includes('probability')) targetCell.probability = sourceCell.probability;
            } else {
              if (sourceCell.flag1 !== undefined) targetCell.flag1 = sourceCell.flag1;
              if (sourceCell.flag2 !== undefined) targetCell.flag2 = sourceCell.flag2;
              if (sourceCell.probability !== undefined) targetCell.probability = sourceCell.probability;
            }
          }
        }
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
        const { channelIndex, rowIndex } = useCursorStore.getState().cursor;
        const { data } = state.clipboard;
        const { pasteMask } = state;

        for (let ch = 0; ch < data.length; ch++) {
          const targetChannel = channelIndex + ch;
          if (targetChannel >= pattern.channels.length) break;

          for (let row = 0; row < data[ch].length; row++) {
            const targetRow = rowIndex + row;
            if (targetRow >= pattern.length) break;

            const sourceCell = data[ch][row];
            const targetCell = pattern.channels[targetChannel].rows[targetRow];

            // Only paste if target cell field is empty (0 or null)
            if (hasMaskBit(pasteMask, MASK_NOTE) && sourceCell.note !== 0 && targetCell.note === 0) {
              targetCell.note = sourceCell.note;
            }
            if (hasMaskBit(pasteMask, MASK_INSTRUMENT) && sourceCell.instrument !== 0 && targetCell.instrument === 0) {
              targetCell.instrument = sourceCell.instrument;
            }
            if (hasMaskBit(pasteMask, MASK_VOLUME) && sourceCell.volume !== 0 && targetCell.volume === 0) {
              targetCell.volume = sourceCell.volume;
            }
            if (hasMaskBit(pasteMask, MASK_EFFECT) && (sourceCell.effTyp !== 0 || sourceCell.eff !== 0) && targetCell.effTyp === 0 && targetCell.eff === 0) {
              targetCell.effTyp = sourceCell.effTyp;
              targetCell.eff = sourceCell.eff;
            }
            if (hasMaskBit(pasteMask, MASK_EFFECT2) && (sourceCell.effTyp2 !== 0 || sourceCell.eff2 !== 0) && targetCell.effTyp2 === 0 && targetCell.eff2 === 0) {
              targetCell.effTyp2 = sourceCell.effTyp2;
              targetCell.eff2 = sourceCell.eff2;
            }
          }
        }
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
        const { channelIndex, rowIndex } = useCursorStore.getState().cursor;
        const { data } = state.clipboard;
        const { pasteMask } = state;
        const clipboardRows = data[0]?.length || 0;
        if (clipboardRows === 0) return;

        for (let ch = 0; ch < data.length; ch++) {
          const targetChannel = channelIndex + ch;
          if (targetChannel >= pattern.channels.length) break;

          // Keep pasting until we reach the end of the pattern
          let currentRow = rowIndex;
          while (currentRow < pattern.length) {
            for (let row = 0; row < data[ch].length; row++) {
              const targetRow = currentRow + row;
              if (targetRow >= pattern.length) break;

              const sourceCell = data[ch][row];
              const targetCell = pattern.channels[targetChannel].rows[targetRow];

              if (hasMaskBit(pasteMask, MASK_NOTE)) {
                targetCell.note = sourceCell.note;
              }
              if (hasMaskBit(pasteMask, MASK_INSTRUMENT)) {
                targetCell.instrument = sourceCell.instrument;
              }
              if (hasMaskBit(pasteMask, MASK_VOLUME)) {
                targetCell.volume = sourceCell.volume;
              }
              if (hasMaskBit(pasteMask, MASK_EFFECT)) {
                targetCell.effTyp = sourceCell.effTyp;
                targetCell.eff = sourceCell.eff;
              }
              if (hasMaskBit(pasteMask, MASK_EFFECT2)) {
                targetCell.effTyp2 = sourceCell.effTyp2;
                targetCell.eff2 = sourceCell.eff2;
              }
            }
            currentRow += clipboardRows;
          }
        }
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
        const { channelIndex, rowIndex } = useCursorStore.getState().cursor;
        const { data } = state.clipboard;
        const { pasteMask } = state;
        const clipboardRows = data[0]?.length || 0;
        if (clipboardRows === 0) return;

        for (let ch = 0; ch < data.length; ch++) {
          const targetChannel = channelIndex + ch;
          if (targetChannel >= pattern.channels.length) break;

          const channel = pattern.channels[targetChannel];

          // Shift existing rows down (from bottom to insertion point)
          for (let row = pattern.length - 1; row >= rowIndex + clipboardRows; row--) {
            const sourceRow = row - clipboardRows;
            if (sourceRow >= rowIndex) {
              channel.rows[row] = { ...channel.rows[sourceRow] };
            }
          }

          // Insert clipboard data
          for (let row = 0; row < data[ch].length; row++) {
            const targetRow = rowIndex + row;
            if (targetRow >= pattern.length) break;

            const sourceCell = data[ch][row];
            const targetCell = channel.rows[targetRow];

            // Clear target cell first, then apply paste mask
            targetCell.note = 0;
            targetCell.instrument = 0;
            targetCell.volume = 0;
            targetCell.effTyp = 0;
            targetCell.eff = 0;
            targetCell.effTyp2 = 0;
            targetCell.eff2 = 0;
            targetCell.flag1 = 0;
            targetCell.flag2 = 0;
            targetCell.probability = 0;

            if (hasMaskBit(pasteMask, MASK_NOTE)) {
              targetCell.note = sourceCell.note;
              targetCell.flag1 = sourceCell.flag1 ?? 0;
              targetCell.flag2 = sourceCell.flag2 ?? 0;
              targetCell.probability = sourceCell.probability ?? 0;
            }
            if (hasMaskBit(pasteMask, MASK_INSTRUMENT)) {
              targetCell.instrument = sourceCell.instrument;
            }
            if (hasMaskBit(pasteMask, MASK_VOLUME)) {
              targetCell.volume = sourceCell.volume;
            }
            if (hasMaskBit(pasteMask, MASK_EFFECT)) {
              targetCell.effTyp = sourceCell.effTyp;
              targetCell.eff = sourceCell.eff;
            }
            if (hasMaskBit(pasteMask, MASK_EFFECT2)) {
              targetCell.effTyp2 = sourceCell.effTyp2;
              targetCell.eff2 = sourceCell.eff2;
            }
          }
        }
      });
      useHistoryStore.getState().pushAction('PASTE_PUSH_FORWARD', 'Push-forward paste', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // FT2: Track operations (single-channel copy/paste)
    copyTrack: (channelIndex) =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        if (channelIndex < 0 || channelIndex >= pattern.channels.length) return;

        const channel = pattern.channels[channelIndex];
        state.trackClipboard = channel.rows.map(row => ({ ...row }));
      }),

    cutTrack: (channelIndex) => {
      const patternIndex = get().currentPatternIndex;
      const pattern = get().patterns[patternIndex];
      if (channelIndex < 0 || channelIndex >= pattern.channels.length) return;
      const beforePattern = pattern;
      set((state) => {
        const p = state.patterns[state.currentPatternIndex];
        if (channelIndex < 0 || channelIndex >= p.channels.length) return;
        const channel = p.channels[channelIndex];
        state.trackClipboard = channel.rows.map(row => ({ ...row }));
        channel.rows = channel.rows.map(() => ({ ...EMPTY_CELL }));
      });
      useHistoryStore.getState().pushAction('CUT_TRACK', 'Cut track', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    pasteTrack: (channelIndex) => {
      if (!get().trackClipboard) return;
      const patternIndex = get().currentPatternIndex;
      const pattern = get().patterns[patternIndex];
      if (channelIndex < 0 || channelIndex >= pattern.channels.length) return;
      const beforePattern = pattern;
      set((state) => {
        if (!state.trackClipboard) return;

        const p = state.patterns[state.currentPatternIndex];
        if (channelIndex < 0 || channelIndex >= p.channels.length) return;

        const channel = p.channels[channelIndex];
        const { pasteMask } = state;

        const maxRows = Math.min(state.trackClipboard.length, p.length);
        for (let row = 0; row < maxRows; row++) {
          const sourceCell = state.trackClipboard[row];
          const targetCell = channel.rows[row];

          if (hasMaskBit(pasteMask, MASK_NOTE)) {
            targetCell.note = sourceCell.note;
          }
          if (hasMaskBit(pasteMask, MASK_INSTRUMENT)) {
            targetCell.instrument = sourceCell.instrument;
          }
          if (hasMaskBit(pasteMask, MASK_VOLUME)) {
            targetCell.volume = sourceCell.volume;
          }
          if (hasMaskBit(pasteMask, MASK_EFFECT)) {
            targetCell.effTyp = sourceCell.effTyp;
            targetCell.eff = sourceCell.eff;
          }
          if (hasMaskBit(pasteMask, MASK_EFFECT2)) {
            targetCell.effTyp2 = sourceCell.effTyp2;
            targetCell.eff2 = sourceCell.eff2;
          }
        }
      });
      useHistoryStore.getState().pushAction('PASTE_TRACK', 'Paste track', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // FT2: Macro slots (quick-entry)
    writeMacroSlot: (slotIndex) =>
      set((state) => {
        if (slotIndex < 0 || slotIndex >= 8) return;

        const pattern = state.patterns[state.currentPatternIndex];
        const { channelIndex, rowIndex } = useCursorStore.getState().cursor;
        const cell = pattern.channels[channelIndex].rows[rowIndex];

        state.macroSlots[slotIndex] = {
          note: cell.note,
          instrument: cell.instrument,
          volume: cell.volume,
          effTyp: cell.effTyp,
          eff: cell.eff,
          effTyp2: cell.effTyp2,
          eff2: cell.eff2,
        };
      }),

    readMacroSlot: (slotIndex) => {
      if (slotIndex < 0 || slotIndex >= 8) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        if (slotIndex < 0 || slotIndex >= 8) return;

        const macro = state.macroSlots[slotIndex];
        const pattern = state.patterns[state.currentPatternIndex];
        const { channelIndex, rowIndex } = useCursorStore.getState().cursor;
        const { pasteMask } = state;

        if (!state.insertMode) {
          // Overwrite mode: paste macro to current cell
          const targetCell = pattern.channels[channelIndex].rows[rowIndex];

          if (hasMaskBit(pasteMask, MASK_NOTE) && macro.note !== 0) {
            targetCell.note = macro.note;
          }
          if (hasMaskBit(pasteMask, MASK_INSTRUMENT) && macro.instrument !== 0) {
            targetCell.instrument = macro.instrument;
          }
          if (hasMaskBit(pasteMask, MASK_VOLUME) && macro.volume !== 0) {
            targetCell.volume = macro.volume;
          }
          if (hasMaskBit(pasteMask, MASK_EFFECT)) {
            targetCell.effTyp = macro.effTyp;
            targetCell.eff = macro.eff;
          }
          if (hasMaskBit(pasteMask, MASK_EFFECT2) && (macro.effTyp2 !== 0 || macro.eff2 !== 0)) {
            targetCell.effTyp2 = macro.effTyp2;
            targetCell.eff2 = macro.eff2;
          }
        } else {
          // Insert mode: shift rows down and insert macro
          const channel = pattern.channels[channelIndex];
          const newRow: TrackerCell = { ...EMPTY_CELL };

          if (hasMaskBit(pasteMask, MASK_NOTE) && macro.note !== 0) {
            newRow.note = macro.note;
          }
          if (hasMaskBit(pasteMask, MASK_INSTRUMENT) && macro.instrument !== 0) {
            newRow.instrument = macro.instrument;
          }
          if (hasMaskBit(pasteMask, MASK_VOLUME) && macro.volume !== 0) {
            newRow.volume = macro.volume;
          }
          if (hasMaskBit(pasteMask, MASK_EFFECT)) {
            newRow.effTyp = macro.effTyp;
            newRow.eff = macro.eff;
          }
          if (hasMaskBit(pasteMask, MASK_EFFECT2) && (macro.effTyp2 !== 0 || macro.eff2 !== 0)) {
            newRow.effTyp2 = macro.effTyp2;
            newRow.eff2 = macro.eff2;
          }

          // Shift rows down
          channel.rows.splice(rowIndex, 0, newRow);

          // Remove last row to maintain pattern length
          if (channel.rows.length > pattern.length) {
            channel.rows.pop();
          }
        }
      });
      useHistoryStore.getState().pushAction('READ_MACRO', 'Apply macro', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // Advanced editing - Apply instrument number to all notes in selection
    applyInstrumentToSelection: (instrumentId) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const { cursor: _cur, selection: _sel } = useCursorStore.getState();
        let minChannel: number, maxChannel: number, minRow: number, maxRow: number;
        if (_sel) {
          minChannel = Math.min(_sel.startChannel, _sel.endChannel);
          maxChannel = Math.max(_sel.startChannel, _sel.endChannel);
          minRow = Math.min(_sel.startRow, _sel.endRow);
          maxRow = Math.max(_sel.startRow, _sel.endRow);
        } else {
          minChannel = _cur.channelIndex;
          maxChannel = _cur.channelIndex;
          minRow = _cur.rowIndex;
          maxRow = _cur.rowIndex;
        }
        for (let ch = minChannel; ch <= maxChannel; ch++) {
          if (ch >= pattern.channels.length) continue;
          for (let row = minRow; row <= maxRow; row++) {
            if (row >= pattern.length) continue;
            const cell = pattern.channels[ch].rows[row];
            if (cell.note && cell.note !== 0) {
              cell.instrument = instrumentId;
            }
          }
        }
      });
      useHistoryStore.getState().pushAction('EDIT_CELL', 'Apply instrument to selection', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // Advanced editing - Transpose selection by semitones
    transposeSelection: (semitones, currentInstrumentOnly = false) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const { cursor: _cur, selection: _sel } = useCursorStore.getState();
        const targetInstrumentId = currentInstrumentOnly ? state.patterns[state.currentPatternIndex].channels[_cur.channelIndex].rows[_cur.rowIndex].instrument : null;

        // Determine range to transpose (selection or just cursor position)
        let minChannel: number, maxChannel: number, minRow: number, maxRow: number;

        if (_sel) {
          minChannel = Math.min(_sel.startChannel, _sel.endChannel);
          maxChannel = Math.max(_sel.startChannel, _sel.endChannel);
          minRow = Math.min(_sel.startRow, _sel.endRow);
          maxRow = Math.max(_sel.startRow, _sel.endRow);
        } else {
          // No selection - transpose all notes in current channel at current row
          minChannel = _cur.channelIndex;
          maxChannel = _cur.channelIndex;
          minRow = _cur.rowIndex;
          maxRow = _cur.rowIndex;
        }

        // Transpose notes in the range
        for (let ch = minChannel; ch <= maxChannel; ch++) {
          if (ch >= pattern.channels.length) continue;

          for (let row = minRow; row <= maxRow; row++) {
            if (row >= pattern.length) continue;

            const cell = pattern.channels[ch].rows[row];
            // Skip empty (0) and note-off (97)
            if (!cell.note || cell.note === 0 || cell.note === 97) continue;

            // If filtering by current instrument, skip others
            if (currentInstrumentOnly && targetInstrumentId !== null && cell.instrument !== targetInstrumentId) {
              continue;
            }

            // Convert XM note to MIDI, transpose, convert back
            const midiNote = xmNoteToMidi(cell.note);
            if (midiNote === null) continue;

            const newMidiNote = midiNote + semitones;
            if (newMidiNote >= 12 && newMidiNote <= 107) {
              cell.note = midiToXMNote(newMidiNote);
            }
          }
        }
      });
      useHistoryStore.getState().pushAction('TRANSPOSE', 'Transpose', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // Swap all occurrences of Instrument A with Instrument B
    remapInstrument: (oldId, newId, scope) =>
      set((state) => {
        const processPattern = (patt: Pattern, channelIdx?: number, rowStart?: number, rowEnd?: number) => {
          const chStart = channelIdx !== undefined ? channelIdx : 0;
          const chEnd = channelIdx !== undefined ? channelIdx : patt.channels.length - 1;
          const rStart = rowStart !== undefined ? rowStart : 0;
          const rEnd = rowEnd !== undefined ? rowEnd : patt.length - 1;

          for (let ch = chStart; ch <= chEnd; ch++) {
            for (let row = rStart; row <= rEnd; row++) {
              if (patt.channels[ch].rows[row]?.instrument === oldId) {
                patt.channels[ch].rows[row].instrument = newId;
              }
            }
          }
        };

        const { cursor: _cur, selection: _sel } = useCursorStore.getState();
        if (scope === 'block' && _sel) {
          const minChannel = Math.min(_sel.startChannel, _sel.endChannel);
          const maxChannel = Math.max(_sel.startChannel, _sel.endChannel);
          const minRow = Math.min(_sel.startRow, _sel.endRow);
          const maxRow = Math.max(_sel.startRow, _sel.endRow);

          for (let ch = minChannel; ch <= maxChannel; ch++) {
            processPattern(state.patterns[state.currentPatternIndex], ch, minRow, maxRow);
          }
        } else if (scope === 'track') {
          processPattern(state.patterns[state.currentPatternIndex], _cur.channelIndex);
        } else if (scope === 'pattern') {
          processPattern(state.patterns[state.currentPatternIndex]);
        } else if (scope === 'song') {
          state.patterns.forEach(p => processPattern(p));
        }
      }),

    // Advanced editing - Interpolate values in selection
    interpolateSelection: (column, startValue, endValue, curve = 'linear') => {
      if (!useCursorStore.getState().selection) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const _sel = useCursorStore.getState().selection;
        if (!_sel) return;

        const pattern = state.patterns[state.currentPatternIndex];
        const { startChannel, endChannel, startRow, endRow } = _sel;

        const minChannel = Math.min(startChannel, endChannel);
        const maxChannel = Math.max(startChannel, endChannel);
        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);
        const rowCount = maxRow - minRow + 1;

        if (rowCount < 2) return; // Need at least 2 rows to interpolate

        // Curve function: maps linear t (0-1) to curved t
        const applyCurve = (t: number): number => {
          switch (curve) {
            case 'log': return Math.log(1 + t * 9) / Math.log(10); // fast start, slow end
            case 'exp': return (Math.pow(10, t) - 1) / 9; // slow start, fast end
            case 'scurve': return t * t * (3 - 2 * t); // smooth S-curve (Hermite)
            default: return t; // linear
          }
        };

        // Apply interpolation to each channel in selection
        for (let ch = minChannel; ch <= maxChannel; ch++) {
          if (ch >= pattern.channels.length) continue;

          for (let row = minRow; row <= maxRow; row++) {
            if (row >= pattern.length) continue;

            const cell = pattern.channels[ch].rows[row];
            const linearT = (row - minRow) / (rowCount - 1); // 0 to 1
            const t = applyCurve(linearT);
            const value = Math.round(startValue + (endValue - startValue) * t);

            // Apply to the appropriate column
            if (column === 'volume') {
              // XM volume column: 0x10 to 0x50 are volume values 0-64
              cell.volume = Math.max(0x10, Math.min(0x50, value));
            } else if (column === 'effParam') {
              // If no effect type set, default to volume (0x0C)
              if (cell.effTyp === 0) cell.effTyp = 0x0C; 
              cell.eff = Math.max(0, Math.min(255, value));
            } else if (column === 'effParam2') {
              // If no effect type 2 set, default to volume (0x0C)
              if (cell.effTyp2 === 0) cell.effTyp2 = 0x0C;
              cell.eff2 = Math.max(0, Math.min(255, value));
            } else {
              // Automation columns: 0x00-0xFF
              if (column === 'cutoff') cell.cutoff = Math.max(0, Math.min(255, value));
              else if (column === 'resonance') cell.resonance = Math.max(0, Math.min(255, value));
              else if (column === 'envMod') cell.envMod = Math.max(0, Math.min(255, value));
              else if (column === 'pan') cell.pan = Math.max(0, Math.min(255, value));
            }
          }
        }
      });
      useHistoryStore.getState().pushAction('INTERPOLATE', 'Interpolate', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // Advanced editing - Humanize selection (add random variation to volume)
    humanizeSelection: (volumeVariation) => {
      if (!useCursorStore.getState().selection) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const _sel = useCursorStore.getState().selection;
        if (!_sel) return;

        const pattern = state.patterns[state.currentPatternIndex];
        const { startChannel, endChannel, startRow, endRow } = _sel;

        const minChannel = Math.min(startChannel, endChannel);
        const maxChannel = Math.max(startChannel, endChannel);
        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);

        // Apply random variation to volume values
        for (let ch = minChannel; ch <= maxChannel; ch++) {
          if (ch >= pattern.channels.length) continue;

          for (let row = minRow; row <= maxRow; row++) {
            if (row >= pattern.length) continue;

            const cell = pattern.channels[ch].rows[row];
            // Only humanize cells that have a note and volume
            // Skip empty (0) and note-off (97)
            if (!cell.note || cell.note === 0 || cell.note === 97) continue;

            // Extract volume value from XM volume column (0x10-0x50 = set volume 0-64)
            const hasSetVolume = cell.volume >= 0x10 && cell.volume <= 0x50;
            const currentVolume = hasSetVolume ? cell.volume - 0x10 : 48; // Default to 48 if not set
            const maxVariation = Math.floor(currentVolume * (volumeVariation / 100));
            const randomOffset = Math.floor(Math.random() * (maxVariation * 2 + 1)) - maxVariation;
            const newVolume = Math.max(0, Math.min(64, currentVolume + randomOffset));

            // Store as XM volume (0x10-0x50)
            cell.volume = 0x10 + newVolume;
          }
        }
      });
      useHistoryStore.getState().pushAction('HUMANIZE', 'Humanize', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // Strum: add incremental note delays across channels (EDx effect)
    strumSelection: (tickDelay, direction) => {
      if (!useCursorStore.getState().selection) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const _sel = useCursorStore.getState().selection;
        if (!_sel) return;

        const pattern = state.patterns[state.currentPatternIndex];
        const { startChannel, endChannel, startRow, endRow } = _sel;

        const minChannel = Math.min(startChannel, endChannel);
        const maxChannel = Math.max(startChannel, endChannel);
        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);

        for (let row = minRow; row <= maxRow; row++) {
          if (row >= pattern.length) continue;

          for (let ch = minChannel; ch <= maxChannel; ch++) {
            if (ch >= pattern.channels.length) continue;
            const cell = pattern.channels[ch].rows[row];
            if (!cell.note || cell.note === 0 || cell.note === 97) continue;

            // Calculate delay for this channel
            const chIdx = direction === 'down' ? ch - minChannel : (maxChannel - ch);
            const delay = Math.min(0xF, chIdx * tickDelay);

            if (delay > 0) {
              // Set EDx (note delay) effect: effTyp=14 (E), eff=0xD0+delay
              cell.effTyp = 14; // E
              cell.eff = 0xD0 + delay;
            }
          }
        }
      });
      useHistoryStore.getState().pushAction('STRUM', 'Strum', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // Legato: for each channel in selection, extend each note's duration
    // by removing empty rows between consecutive notes (set slide flag)
    legatoSelection: () => {
      if (!useCursorStore.getState().selection) return;
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const _sel = useCursorStore.getState().selection;
        if (!_sel) return;

        const pattern = state.patterns[state.currentPatternIndex];
        const { startChannel, endChannel, startRow, endRow } = _sel;

        const minChannel = Math.min(startChannel, endChannel);
        const maxChannel = Math.max(startChannel, endChannel);
        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);

        // For each channel, find notes and add tone portamento (3xx) to connect them
        for (let ch = minChannel; ch <= maxChannel; ch++) {
          if (ch >= pattern.channels.length) continue;

          let lastNoteRow = -1;
          for (let row = minRow; row <= maxRow; row++) {
            if (row >= pattern.length) continue;
            const cell = pattern.channels[ch].rows[row];

            if (cell.note > 0 && cell.note < 97) {
              if (lastNoteRow >= 0 && row > lastNoteRow + 1) {
                // Only set tone portamento if effect column is empty
                if (cell.effTyp === 0) {
                  cell.effTyp = 3; // Tone portamento
                  cell.eff = 0xFF; // Max speed
                }
              }
              lastNoteRow = row;
            }
          }
        }
      });
      useHistoryStore.getState().pushAction('LEGATO', 'Legato', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // FT2: Scale volume (multiply by factor)
    scaleVolume: (scope, factor) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const { cursor: _cur, selection: _sel } = useCursorStore.getState();
        const getCells = (): TrackerCell[] => {
          const cells: TrackerCell[] = [];

          if (scope === 'block' && _sel) {
            const minChannel = Math.min(_sel.startChannel, _sel.endChannel);
            const maxChannel = Math.max(_sel.startChannel, _sel.endChannel);
            const minRow = Math.min(_sel.startRow, _sel.endRow);
            const maxRow = Math.max(_sel.startRow, _sel.endRow);

            for (let ch = minChannel; ch <= maxChannel; ch++) {
              for (let row = minRow; row <= maxRow; row++) {
                if (ch < pattern.channels.length && row < pattern.length) {
                  cells.push(pattern.channels[ch].rows[row]);
                }
              }
            }
          } else if (scope === 'track') {
            const ch = _cur.channelIndex;
            if (ch < pattern.channels.length) {
              cells.push(...pattern.channels[ch].rows);
            }
          } else if (scope === 'pattern') {
            pattern.channels.forEach(channel => {
              cells.push(...channel.rows);
            });
          }

          return cells;
        };

        const cells = getCells();
        cells.forEach(cell => {
          if (cell.volume !== null && cell.volume !== undefined) {
            cell.volume = Math.min(0x40, Math.max(0, Math.round(cell.volume * factor)));
          }
        });
      });
      useHistoryStore.getState().pushAction('SCALE_VOLUME', 'Scale volume', patternIndex, beforePattern, get().patterns[patternIndex]);
    },

    // FT2: Fade volume (linear interpolation)
    fadeVolume: (scope, startVol, endVol) => {
      const patternIndex = get().currentPatternIndex;
      const beforePattern = get().patterns[patternIndex];
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const { cursor: _cur, selection: _sel } = useCursorStore.getState();
        const getCells = (): TrackerCell[] => {
          const cells: TrackerCell[] = [];

          if (scope === 'block' && _sel) {
            const minChannel = Math.min(_sel.startChannel, _sel.endChannel);
            const maxChannel = Math.max(_sel.startChannel, _sel.endChannel);
            const minRow = Math.min(_sel.startRow, _sel.endRow);
            const maxRow = Math.max(_sel.startRow, _sel.endRow);

            for (let ch = minChannel; ch <= maxChannel; ch++) {
              for (let row = minRow; row <= maxRow; row++) {
                if (ch < pattern.channels.length && row < pattern.length) {
                  cells.push(pattern.channels[ch].rows[row]);
                }
              }
            }
          } else if (scope === 'track') {
            const ch = _cur.channelIndex;
            if (ch < pattern.channels.length) {
              cells.push(...pattern.channels[ch].rows);
            }
          } else if (scope === 'pattern') {
            pattern.channels.forEach(channel => {
              cells.push(...channel.rows);
            });
          }

          return cells;
        };

        const cells = getCells();
        const count = cells.length;
        if (count < 2) return;

        cells.forEach((cell, index) => {
          const t = index / (count - 1); // 0 to 1
          const volume = Math.round(startVol + t * (endVol - startVol));
          cell.volume = Math.min(0x40, Math.max(0, volume));
        });
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
        const pattern = state.patterns[state.currentPatternIndex];
        const { startChannel, endChannel, startRow, endRow } = selection;
        const minCh = Math.min(startChannel, endChannel);
        const maxCh = Math.max(startChannel, endChannel);
        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);
        for (let ch = minCh; ch <= maxCh; ch++) {
          for (let r = minRow; r <= maxRow; r++) {
            const cell = pattern.channels[ch]?.rows[r];
            if (cell && cell.volume != null && cell.volume > 0) {
              cell.volume = Math.max(0, Math.min(0x40, Math.round(cell.volume * factor)));
            }
          }
        }
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
        const pat = state.patterns[state.currentPatternIndex];
        const tempRows = pat.channels[aIdx].rows.map(r => ({ ...r }));
        pat.channels[aIdx].rows = pat.channels[bIdx].rows.map(r => ({ ...r }));
        pat.channels[bIdx].rows = tempRows;
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

    applyEditorMode: (song) =>
      set((state) => {
        // Always store linearPeriods — affects period→Hz math for XM, IT, FTM, XTracker etc.
        state.linearPeriods = song.linearPeriods ?? false;
        if (song.furnaceNative) {
          state.editorMode = 'furnace';
          state.furnaceNative = song.furnaceNative;
          state.hivelyNative = null;
          state.hivelyFileData = null;
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
          state.musiclineFileData = null;
          state.hivelyMeta = song.hivelyMeta ?? null;
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
          state.musiclineFileData = song.musiclineFileData ?? null;
          state.hivelyMeta = null;
          state.furnaceSubsongs = null;
          state.furnaceActiveSubsong = 0;
          state.channelTrackTables = song.channelTrackTables;
          state.channelSpeeds = song.channelSpeeds ?? null;
          state.channelGrooves = song.channelGrooves ?? null;
        } else if (song.goatTrackerData) {
          // GoatTracker Ultra SID tracker
          state.editorMode = 'goattracker';
          state.furnaceNative = null;
          state.hivelyNative = null;
          state.hivelyFileData = null;
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
        state.furnaceSubsongs = null;
        state.furnaceActiveSubsong = 0;
        state.songDBInfo = null;
      });
    },
  }))
);

// Export mask constants for use in other modules
export { MASK_NOTE, MASK_INSTRUMENT, MASK_VOLUME, MASK_EFFECT, MASK_EFFECT2, MASK_ALL, hasMaskBit, toggleMaskBit };
export type { MacroSlot };
