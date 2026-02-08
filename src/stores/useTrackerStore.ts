/**
 * Tracker Store - Pattern Data & Cursor State
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  Pattern,
  TrackerCell,
  CursorPosition,
  BlockSelection,
  ClipboardData,
  ColumnVisibility,
} from '@typedefs';
import { DEFAULT_COLUMN_VISIBILITY, EMPTY_CELL, CHANNEL_COLORS } from '@typedefs';
import { xmNoteToMidi, midiToXMNote } from '@/lib/xmConversions';
import { getToneEngine } from '@engine/ToneEngine';
import { idGenerator } from '../utils/idGenerator';
import { DEFAULT_PATTERN_LENGTH, DEFAULT_NUM_CHANNELS, MAX_PATTERN_LENGTH, MAX_CHANNELS, MIN_CHANNELS, MIN_PATTERN_LENGTH } from '../constants/trackerConstants';

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
  cursor: CursorPosition;
  selection: BlockSelection | null;
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
  ptnJumpPos: number[];        // FT2: 4 stored jump positions for F9-F12 (Shift to store, Ctrl to jump)
  // FT2: Pattern Order List (Song Position List)
  patternOrder: number[]; // Array of pattern indices for song arrangement
  currentPositionIndex: number; // Current position in pattern order (for editing)

  // Original module data for libopenmpt playback (sample-accurate effects)
  originalModuleData: {
    base64: string;
    format: 'MOD' | 'XM' | 'IT' | 'S3M' | 'UNKNOWN';
    sourceFile?: string;
  } | null;

  // Actions
  setCurrentPattern: (index: number) => void;
  moveCursor: (direction: 'up' | 'down' | 'left' | 'right') => void;
  moveCursorToRow: (row: number) => void;
  moveCursorToChannel: (channel: number) => void;
  moveCursorToColumn: (columnType: CursorPosition['columnType']) => void;
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

  // Block operations
  startSelection: () => void;
  updateSelection: (channelIndex: number, rowIndex: number) => void;
  endSelection: () => void;
  clearSelection: () => void;
  selectColumn: (channelIndex: number, columnType: CursorPosition['columnType']) => void;
  selectChannel: (channelIndex: number) => void;
  selectPattern: () => void;
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
  transposeSelection: (semitones: number, currentInstrumentOnly?: boolean) => void;
  remapInstrument: (oldId: number, newId: number, scope: 'block' | 'track' | 'pattern' | 'song') => void;
  interpolateSelection: (column: 'volume' | 'cutoff' | 'resonance' | 'envMod' | 'pan', startValue: number, endValue: number, curve?: 'linear' | 'log' | 'exp' | 'scurve') => void;
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
  setCurrentPosition: (positionIndex: number) => void;

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
  setChannelRecordGroup: (channelIndex: number, group: 0 | 1 | 2) => void;
  getChannelsInRecordGroup: (group: 1 | 2) => number[];

  // Import/Export
  loadPatterns: (patterns: Pattern[]) => void;
  importPattern: (pattern: Pattern) => number;
  setPatternOrder: (order: number[]) => void;
  setOriginalModuleData: (data: TrackerStore['originalModuleData']) => void;

  // Undo/Redo support
  replacePattern: (index: number, pattern: Pattern) => void;

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
    cursor: {
      channelIndex: 0,
      rowIndex: 0,
      columnType: 'note',
      digitIndex: 0,
    },
    selection: null,
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
    ptnJumpPos: [0, 0, 0, 0], // FT2: 4 stored jump positions (F9-F12)
    // FT2: Pattern Order List (Song Position List)
    patternOrder: [0], // Start with first pattern in order
    currentPositionIndex: 0, // Start at position 0

    // Original module data for libopenmpt playback
    originalModuleData: null,

    // Actions
    setCurrentPattern: (index) =>
      set((state) => {
        if (index >= 0 && index < state.patterns.length) {
          state.currentPatternIndex = index;
        }
      }),

    moveCursor: (direction) =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const numChannels = pattern.channels.length;
        const numRows = pattern.length;

        const prevRow = state.cursor.rowIndex;
        const prevChannel = state.cursor.channelIndex;
        const prevColumn = state.cursor.columnType;
        const prevDigit = state.cursor.digitIndex;

        // Map column types to their digit count
        const DIGIT_COUNTS: Record<string, number> = {
          instrument: 2,
          volume: 2,
          effTyp: 1,
          effParam: 2,
          effTyp2: 1,
          effParam2: 2,
          cutoff: 2,
          resonance: 2,
          envMod: 2,
          pan: 2,
          probability: 2,
        };

        const currentDigits = DIGIT_COUNTS[state.cursor.columnType] || 0;

        switch (direction) {
          case 'up':
            if (state.cursor.rowIndex > 0) {
              state.cursor.rowIndex--;
            } else {
              state.cursor.rowIndex = numRows - 1;
            }
            break;

          case 'down':
            if (state.cursor.rowIndex < numRows - 1) {
              state.cursor.rowIndex++;
            } else {
              state.cursor.rowIndex = 0;
            }
            break;

          case 'left': {
            if (currentDigits > 0 && state.cursor.digitIndex > 0) {
              state.cursor.digitIndex--;
              break;
            }

            const columnOrder: CursorPosition['columnType'][] = [
              'note', 'instrument', 'volume', 'effTyp', 'effParam', 'effTyp2', 'effParam2', 'flag1', 'flag2', 'probability'
            ];
            const currentColumnIndex = columnOrder.indexOf(state.cursor.columnType);
            // Safety: if cursor is on an unknown column, snap to note
            if (currentColumnIndex === -1) {
              state.cursor.columnType = 'note';
              state.cursor.digitIndex = 0;
              break;
            }
            if (currentColumnIndex > 0) {
              state.cursor.columnType = columnOrder[currentColumnIndex - 1];
              const nextDigits = DIGIT_COUNTS[state.cursor.columnType] || 0;
              state.cursor.digitIndex = nextDigits > 0 ? nextDigits - 1 : 0;
            } else {
              // FT2: Wrap from channel 0 note to last channel's last column
              if (state.cursor.channelIndex > 0) {
                state.cursor.channelIndex--;
              } else {
                state.cursor.channelIndex = numChannels - 1;
              }
              state.cursor.columnType = columnOrder[columnOrder.length - 1];
              const nextDigits = DIGIT_COUNTS[state.cursor.columnType] || 0;
              state.cursor.digitIndex = nextDigits > 0 ? nextDigits - 1 : 0;
            }
            break;
          }

          case 'right': {
            if (currentDigits > 0 && state.cursor.digitIndex < currentDigits - 1) {
              state.cursor.digitIndex++;
              break;
            }

            const columnOrder2: CursorPosition['columnType'][] = [
              'note', 'instrument', 'volume', 'effTyp', 'effParam', 'effTyp2', 'effParam2', 'flag1', 'flag2', 'probability'
            ];
            const currentColumnIndex2 = columnOrder2.indexOf(state.cursor.columnType);
            // Safety: if cursor is on an unknown column, snap to note
            if (currentColumnIndex2 === -1) {
              state.cursor.columnType = 'note';
              state.cursor.digitIndex = 0;
              break;
            }
            if (currentColumnIndex2 < columnOrder2.length - 1) {
              state.cursor.columnType = columnOrder2[currentColumnIndex2 + 1];
              state.cursor.digitIndex = 0;
            } else {
              // FT2: Wrap from last channel's last column to channel 0 note
              if (state.cursor.channelIndex < numChannels - 1) {
                state.cursor.channelIndex++;
              } else {
                state.cursor.channelIndex = 0;
              }
              state.cursor.columnType = 'note';
              state.cursor.digitIndex = 0;
            }
            break;
          }
        }

        // PERF: Abort update if nothing changed
        if (
          state.cursor.rowIndex === prevRow &&
          state.cursor.channelIndex === prevChannel &&
          state.cursor.columnType === prevColumn &&
          state.cursor.digitIndex === prevDigit
        ) {
          return state;
        }
      }),

    moveCursorToRow: (row) =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        if (row >= 0 && row < pattern.length) {
          state.cursor.rowIndex = row;
        }
      }),

    moveCursorToChannel: (channel) =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        if (channel >= 0 && channel < pattern.channels.length) {
          state.cursor.channelIndex = channel;
        }
      }),

    moveCursorToColumn: (columnType) =>
      set((state) => {
        state.cursor.columnType = columnType;
        state.cursor.digitIndex = 0;
      }),

    setCell: (channelIndex, rowIndex, cellUpdate) =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        if (
          channelIndex >= 0 &&
          channelIndex < pattern.channels.length &&
          rowIndex >= 0 &&
          rowIndex < pattern.length
        ) {
          Object.assign(pattern.channels[channelIndex].rows[rowIndex], cellUpdate);
        }
      }),

    clearCell: (channelIndex, rowIndex) =>
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
      }),

    clearChannel: (channelIndex) =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
          pattern.channels[channelIndex].rows = pattern.channels[channelIndex].rows.map(() => ({ ...EMPTY_CELL }));
        }
      }),

    clearPattern: () =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        pattern.channels.forEach((channel) => {
          channel.rows = channel.rows.map(() => ({ ...EMPTY_CELL }));
        });
      }),

    insertRow: (channelIndex, rowIndex) =>
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
      }),

    deleteRow: (channelIndex, rowIndex) =>
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
      }),

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

      // If multi-rec/multi-edit not enabled, use cursor channel
      if (!state.multiRecEnabled && !state.multiEditEnabled) {
        return state.cursor.channelIndex;
      }

      // Find channel with lowest keyOffTime that has no note playing and is enabled
      let bestChannel = state.cursor.channelIndex;
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
        if (index >= 0 && index < 4) {
          state.ptnJumpPos[index] = row;
        }
      }),

    getPtnJumpPos: (index) => {
      const state = get();
      if (index >= 0 && index < 4) {
        return state.ptnJumpPos[index];
      }
      return 0;
    },

    startSelection: () =>
      set((state) => {
        state.selection = {
          startChannel: state.cursor.channelIndex,
          endChannel: state.cursor.channelIndex,
          startRow: state.cursor.rowIndex,
          endRow: state.cursor.rowIndex,
          columnTypes: [state.cursor.columnType],
        };
      }),

    updateSelection: (channelIndex, rowIndex) =>
      set((state) => {
        if (state.selection) {
          state.selection.endChannel = channelIndex;
          state.selection.endRow = rowIndex;
        }
      }),

    endSelection: () =>
      set((state) => {
        if (state.selection) {
          state.selection.endChannel = state.cursor.channelIndex;
          state.selection.endRow = state.cursor.rowIndex;
        }
      }),

    clearSelection: () =>
      set((state) => {
        state.selection = null;
      }),

    selectColumn: (channelIndex, columnType) =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        state.selection = {
          startChannel: channelIndex,
          endChannel: channelIndex,
          startRow: 0,
          endRow: pattern.length - 1,
          columnTypes: [columnType],
        };
      }),

    selectChannel: (channelIndex) =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        state.selection = {
          startChannel: channelIndex,
          endChannel: channelIndex,
          startRow: 0,
          endRow: pattern.length - 1,
          columnTypes: ['note', 'instrument', 'volume', 'effTyp', 'effParam', 'effTyp2', 'effParam2', 'flag1', 'flag2', 'probability'],
        };
      }),

    selectPattern: () =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        state.selection = {
          startChannel: 0,
          endChannel: pattern.channels.length - 1,
          startRow: 0,
          endRow: pattern.length - 1,
          columnTypes: ['note', 'instrument', 'volume', 'effTyp', 'effParam', 'effTyp2', 'effParam2', 'flag1', 'flag2', 'probability'],
        };
      }),

    copySelection: () =>
      set((state) => {
        if (!state.selection) return;

        const pattern = state.patterns[state.currentPatternIndex];
        const { startChannel, endChannel, startRow, endRow } = state.selection;

        const minChannel = Math.min(startChannel, endChannel);
        const maxChannel = Math.max(startChannel, endChannel);
        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);

        const copiedData: TrackerCell[][] = [];
        for (let ch = minChannel; ch <= maxChannel; ch++) {
          const channelData: TrackerCell[] = [];
          for (let row = minRow; row <= maxRow; row++) {
            channelData.push({ ...pattern.channels[ch].rows[row] });
          }
          copiedData.push(channelData);
        }

        state.clipboard = {
          channels: maxChannel - minChannel + 1,
          rows: maxRow - minRow + 1,
          data: copiedData,
        };
      }),

    cutSelection: () =>
      set((state) => {
        if (!state.selection) return;

        // Copy first
        const pattern = state.patterns[state.currentPatternIndex];
        const { startChannel, endChannel, startRow, endRow } = state.selection;

        const minChannel = Math.min(startChannel, endChannel);
        const maxChannel = Math.max(startChannel, endChannel);
        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);

        const copiedData: TrackerCell[][] = [];
        for (let ch = minChannel; ch <= maxChannel; ch++) {
          const channelData: TrackerCell[] = [];
          for (let row = minRow; row <= maxRow; row++) {
            channelData.push({ ...pattern.channels[ch].rows[row] });
            // Clear the cell
            pattern.channels[ch].rows[row] = { ...EMPTY_CELL };
          }
          copiedData.push(channelData);
        }

        state.clipboard = {
          channels: maxChannel - minChannel + 1,
          rows: maxRow - minRow + 1,
          data: copiedData,
        };

        state.selection = null;
      }),

    paste: () =>
      set((state) => {
        if (!state.clipboard) return;

        const pattern = state.patterns[state.currentPatternIndex];
        const { channelIndex, rowIndex } = state.cursor;
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

            // Merge properties based on pasteMask
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
        }
      }),

    // OpenMPT-style Mix Paste: Only fill empty cells
    pasteMix: () =>
      set((state) => {
        if (!state.clipboard) return;

        const pattern = state.patterns[state.currentPatternIndex];
        const { channelIndex, rowIndex } = state.cursor;
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
      }),

    // OpenMPT-style Flood Paste: Paste repeatedly until pattern end
    pasteFlood: () =>
      set((state) => {
        if (!state.clipboard) return;

        const pattern = state.patterns[state.currentPatternIndex];
        const { channelIndex, rowIndex } = state.cursor;
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
      }),

    // OpenMPT-style Push-Forward Paste: Insert clipboard data and shift existing content down
    pastePushForward: () =>
      set((state) => {
        if (!state.clipboard) return;

        const pattern = state.patterns[state.currentPatternIndex];
        const { channelIndex, rowIndex } = state.cursor;
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
        }
      }),

    // FT2: Track operations (single-channel copy/paste)
    copyTrack: (channelIndex) =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        if (channelIndex < 0 || channelIndex >= pattern.channels.length) return;

        const channel = pattern.channels[channelIndex];
        state.trackClipboard = channel.rows.map(row => ({ ...row }));
      }),

    cutTrack: (channelIndex) =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        if (channelIndex < 0 || channelIndex >= pattern.channels.length) return;

        const channel = pattern.channels[channelIndex];
        state.trackClipboard = channel.rows.map(row => ({ ...row }));

        // Clear the track
        channel.rows = channel.rows.map(() => ({ ...EMPTY_CELL }));
      }),

    pasteTrack: (channelIndex) =>
      set((state) => {
        if (!state.trackClipboard) return;

        const pattern = state.patterns[state.currentPatternIndex];
        if (channelIndex < 0 || channelIndex >= pattern.channels.length) return;

        const channel = pattern.channels[channelIndex];
        const { pasteMask } = state;

        // Paste as many rows as possible
        const maxRows = Math.min(state.trackClipboard.length, pattern.length);
        for (let row = 0; row < maxRows; row++) {
          const sourceCell = state.trackClipboard[row];
          const targetCell = channel.rows[row];

          // Merge properties based on pasteMask
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
      }),

    // FT2: Macro slots (quick-entry)
    writeMacroSlot: (slotIndex) =>
      set((state) => {
        if (slotIndex < 0 || slotIndex >= 8) return;

        const pattern = state.patterns[state.currentPatternIndex];
        const { channelIndex, rowIndex } = state.cursor;
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

    readMacroSlot: (slotIndex) =>
      set((state) => {
        if (slotIndex < 0 || slotIndex >= 8) return;

        const macro = state.macroSlots[slotIndex];
        const pattern = state.patterns[state.currentPatternIndex];
        const { channelIndex, rowIndex } = state.cursor;
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
      }),

    // Advanced editing - Transpose selection by semitones
    transposeSelection: (semitones, currentInstrumentOnly = false) =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const targetInstrumentId = currentInstrumentOnly ? state.patterns[state.currentPatternIndex].channels[state.cursor.channelIndex].rows[state.cursor.rowIndex].instrument : null;

        // Determine range to transpose (selection or just cursor position)
        let minChannel: number, maxChannel: number, minRow: number, maxRow: number;

        if (state.selection) {
          minChannel = Math.min(state.selection.startChannel, state.selection.endChannel);
          maxChannel = Math.max(state.selection.startChannel, state.selection.endChannel);
          minRow = Math.min(state.selection.startRow, state.selection.endRow);
          maxRow = Math.max(state.selection.startRow, state.selection.endRow);
        } else {
          // No selection - transpose all notes in current channel at current row
          minChannel = state.cursor.channelIndex;
          maxChannel = state.cursor.channelIndex;
          minRow = state.cursor.rowIndex;
          maxRow = state.cursor.rowIndex;
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
      }),

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

        if (scope === 'block' && state.selection) {
          const minChannel = Math.min(state.selection.startChannel, state.selection.endChannel);
          const maxChannel = Math.max(state.selection.startChannel, state.selection.endChannel);
          const minRow = Math.min(state.selection.startRow, state.selection.endRow);
          const maxRow = Math.max(state.selection.startRow, state.selection.endRow);

          for (let ch = minChannel; ch <= maxChannel; ch++) {
            processPattern(state.patterns[state.currentPatternIndex], ch, minRow, maxRow);
          }
        } else if (scope === 'track') {
          processPattern(state.patterns[state.currentPatternIndex], state.cursor.channelIndex);
        } else if (scope === 'pattern') {
          processPattern(state.patterns[state.currentPatternIndex]);
        } else if (scope === 'song') {
          state.patterns.forEach(p => processPattern(p));
        }
      }),

    // Advanced editing - Interpolate values in selection
    interpolateSelection: (column, startValue, endValue, curve = 'linear') =>
      set((state) => {
        if (!state.selection) return;

        const pattern = state.patterns[state.currentPatternIndex];
        const { startChannel, endChannel, startRow, endRow } = state.selection;

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
              cell.volume = Math.max(0, Math.min(64, value)); // 0x00-0x40
            } else if (column === 'cutoff') {
              cell.cutoff = Math.max(0, Math.min(127, value));
            } else if (column === 'resonance') {
              cell.resonance = Math.max(0, Math.min(127, value));
            } else if (column === 'envMod') {
              cell.envMod = Math.max(0, Math.min(127, value));
            } else if (column === 'pan') {
              cell.pan = Math.max(-100, Math.min(100, value));
            }
          }
        }
      }),

    // Advanced editing - Humanize selection (add random variation to volume)
    humanizeSelection: (volumeVariation) =>
      set((state) => {
        if (!state.selection) return;

        const pattern = state.patterns[state.currentPatternIndex];
        const { startChannel, endChannel, startRow, endRow } = state.selection;

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
      }),

    // Strum: add incremental note delays across channels (EDx effect)
    strumSelection: (tickDelay, direction) =>
      set((state) => {
        if (!state.selection) return;

        const pattern = state.patterns[state.currentPatternIndex];
        const { startChannel, endChannel, startRow, endRow } = state.selection;

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
      }),

    // Legato: for each channel in selection, extend each note's duration
    // by removing empty rows between consecutive notes (set slide flag)
    legatoSelection: () =>
      set((state) => {
        if (!state.selection) return;

        const pattern = state.patterns[state.currentPatternIndex];
        const { startChannel, endChannel, startRow, endRow } = state.selection;

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
      }),

    // FT2: Scale volume (multiply by factor)
    scaleVolume: (scope, factor) =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const getCells = (): TrackerCell[] => {
          const cells: TrackerCell[] = [];

          if (scope === 'block' && state.selection) {
            const minChannel = Math.min(state.selection.startChannel, state.selection.endChannel);
            const maxChannel = Math.max(state.selection.startChannel, state.selection.endChannel);
            const minRow = Math.min(state.selection.startRow, state.selection.endRow);
            const maxRow = Math.max(state.selection.startRow, state.selection.endRow);

            for (let ch = minChannel; ch <= maxChannel; ch++) {
              for (let row = minRow; row <= maxRow; row++) {
                if (ch < pattern.channels.length && row < pattern.length) {
                  cells.push(pattern.channels[ch].rows[row]);
                }
              }
            }
          } else if (scope === 'track') {
            const ch = state.cursor.channelIndex;
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
      }),

    // FT2: Fade volume (linear interpolation)
    fadeVolume: (scope, startVol, endVol) =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];
        const getCells = (): TrackerCell[] => {
          const cells: TrackerCell[] = [];

          if (scope === 'block' && state.selection) {
            const minChannel = Math.min(state.selection.startChannel, state.selection.endChannel);
            const maxChannel = Math.max(state.selection.startChannel, state.selection.endChannel);
            const minRow = Math.min(state.selection.startRow, state.selection.endRow);
            const maxRow = Math.max(state.selection.startRow, state.selection.endRow);

            for (let ch = minChannel; ch <= maxChannel; ch++) {
              for (let row = minRow; row <= maxRow; row++) {
                if (ch < pattern.channels.length && row < pattern.length) {
                  cells.push(pattern.channels[ch].rows[row]);
                }
              }
            }
          } else if (scope === 'track') {
            const ch = state.cursor.channelIndex;
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
      }),

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
          const cloned: Pattern = JSON.parse(JSON.stringify(original));
          cloned.id = idGenerator.generate('pattern');
          cloned.name = `${original.name} (Copy)`;
          state.patterns.splice(index + 1, 0, cloned);
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
          const cloned: Pattern = JSON.parse(JSON.stringify(original));
          cloned.id = idGenerator.generate('pattern');
          cloned.name = `${original.name} (Copy)`;
          state.patterns.splice(index + 1, 0, cloned);
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
        // Adjust cursor if needed
        if (state.cursor.channelIndex >= state.patterns[0]?.channels.length) {
          state.cursor.channelIndex = Math.max(0, state.patterns[0].channels.length - 1);
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
        // Adjust cursor if it was on the moved channel
        if (state.cursor.channelIndex === fromIndex) {
          state.cursor.channelIndex = toIndex;
        } else if (
          fromIndex < state.cursor.channelIndex &&
          toIndex >= state.cursor.channelIndex
        ) {
          state.cursor.channelIndex--;
        } else if (
          fromIndex > state.cursor.channelIndex &&
          toIndex <= state.cursor.channelIndex
        ) {
          state.cursor.channelIndex++;
        }
      }),

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
          state.cursor = {
            channelIndex: 0,
            rowIndex: 0,
            columnType: 'note',
            digitIndex: 0,
          };
          state.selection = null;
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
          state.patterns[index] = JSON.parse(JSON.stringify(pattern));
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

    setCurrentPosition: (positionIndex) =>
      set((state) => {
        if (positionIndex >= 0 && positionIndex < state.patternOrder.length) {
          state.currentPositionIndex = positionIndex;
          // Also update current pattern to match this position
          state.currentPatternIndex = state.patternOrder[positionIndex];
        }
      }),

    // Reset to initial state (for new project/tab)
    reset: () =>
      set((state) => {
        state.patterns = [createEmptyPattern()];
        state.currentPatternIndex = 0;
        state.cursor = {
          channelIndex: 0,
          rowIndex: 0,
          columnType: 'note',
          digitIndex: 0,
        };
        state.selection = null;
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
      }),
  }))
);

// Export mask constants for use in other modules
export { MASK_NOTE, MASK_INSTRUMENT, MASK_VOLUME, MASK_EFFECT, MASK_EFFECT2, MASK_ALL, hasMaskBit, toggleMaskBit };
export type { MacroSlot };
