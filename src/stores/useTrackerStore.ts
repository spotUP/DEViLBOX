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
import { getToneEngine } from '@engine/ToneEngine';
import { idGenerator } from '../utils/idGenerator';
import { DEFAULT_PATTERN_LENGTH, DEFAULT_NUM_CHANNELS, MAX_PATTERN_LENGTH, MAX_CHANNELS, MIN_CHANNELS, MIN_PATTERN_LENGTH } from '../constants/trackerConstants';

// Note names for transpose operations
const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

// Parse note string (e.g., "C-4", "D#5") to semitone value (0-127)
const parseNote = (noteStr: string): number | null => {
  if (!noteStr || noteStr === '...' || noteStr === '===' || noteStr.length < 3) return null;

  const notePart = noteStr.substring(0, 2);
  const octave = parseInt(noteStr.substring(2), 10);

  if (isNaN(octave)) return null;

  const noteIndex = NOTE_NAMES.indexOf(notePart);
  if (noteIndex === -1) return null;

  return octave * 12 + noteIndex;
};

// Convert semitone value back to note string
const semitoneToNote = (semitone: number): string | null => {
  if (semitone < 0 || semitone > 127) return null;

  const octave = Math.floor(semitone / 12);
  const noteIndex = semitone % 12;

  return `${NOTE_NAMES[noteIndex]}${octave}`;
};

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
  note: string | null;
  instrument: number | null;
  volume: number | null;
  effect: string | null;
  effect2: string | null;
}

const createEmptyMacroSlot = (): MacroSlot => ({
  note: null,
  instrument: null,
  volume: null,
  effect: null,
  effect2: null,
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
  editStep: number; // Rows to advance after entering a note (1-16)
  // FT2: Pattern Order List (Song Position List)
  patternOrder: number[]; // Array of pattern indices for song arrangement
  currentPositionIndex: number; // Current position in pattern order (for editing)

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
  interpolateSelection: (column: 'volume' | 'cutoff' | 'resonance' | 'envMod' | 'pan', startValue: number, endValue: number) => void;
  humanizeSelection: (volumeVariation: number) => void;
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
  // toggleChannelCollapse: (channelIndex: number) => void;
  setChannelVolume: (channelIndex: number, volume: number) => void;
  setChannelPan: (channelIndex: number, pan: number) => void;
  setChannelColor: (channelIndex: number, color: string | null) => void;

  // Import/Export
  loadPatterns: (patterns: Pattern[]) => void;
  importPattern: (pattern: Pattern) => number;

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
    // FT2: Pattern Order List (Song Position List)
    patternOrder: [0], // Start with first pattern in order
    currentPositionIndex: 0, // Start at position 0

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

        // Map column types to their digit count (0 means not editable on digit level or handles separately)
        const DIGIT_COUNTS: Record<string, number> = {
          instrument: 2,
          volume: 2,
          effect: 3,
          effect2: 3,
          cutoff: 2,
          resonance: 2,
          envMod: 2,
          pan: 2,
        };

        const currentDigits = DIGIT_COUNTS[state.cursor.columnType] || 0;

        switch (direction) {
          case 'up':
            if (state.cursor.rowIndex > 0) {
              state.cursor.rowIndex--;
            } else {
              state.cursor.rowIndex = numRows - 1; // Wrap to bottom
            }
            break;

          case 'down':
            if (state.cursor.rowIndex < numRows - 1) {
              state.cursor.rowIndex++;
            } else {
              state.cursor.rowIndex = 0; // Wrap to top
            }
            break;

          case 'left': {
            if (currentDigits > 0 && state.cursor.digitIndex > 0) {
              state.cursor.digitIndex--;
              return;
            }

            const columnOrder: CursorPosition['columnType'][] = [
              'note',
              'instrument',
              'volume',
              'effect',
              'effect2',
              'accent',
              'slide',
            ];
            const currentColumnIndex = columnOrder.indexOf(state.cursor.columnType);
            if (currentColumnIndex > 0) {
              state.cursor.columnType = columnOrder[currentColumnIndex - 1];
              const nextDigits = DIGIT_COUNTS[state.cursor.columnType] || 0;
              state.cursor.digitIndex = nextDigits > 0 ? nextDigits - 1 : 0;
            } else if (state.cursor.channelIndex > 0) {
              state.cursor.channelIndex--;
              state.cursor.columnType = columnOrder[columnOrder.length - 1];
              const nextDigits = DIGIT_COUNTS[state.cursor.columnType] || 0;
              state.cursor.digitIndex = nextDigits > 0 ? nextDigits - 1 : 0;
            }
            break;
          }

          case 'right': {
            if (currentDigits > 0 && state.cursor.digitIndex < currentDigits - 1) {
              state.cursor.digitIndex++;
              return;
            }

            const columnOrder2: CursorPosition['columnType'][] = [
              'note',
              'instrument',
              'volume',
              'effect',
              'effect2',
              'accent',
              'slide',
            ];
            const currentColumnIndex2 = columnOrder2.indexOf(state.cursor.columnType);
            if (currentColumnIndex2 < columnOrder2.length - 1) {
              state.cursor.columnType = columnOrder2[currentColumnIndex2 + 1];
              state.cursor.digitIndex = 0;
            } else if (state.cursor.channelIndex < numChannels - 1) {
              state.cursor.channelIndex++;
              state.cursor.columnType = 'note';
              state.cursor.digitIndex = 0;
            }
            break;
          }
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
          columnTypes: ['note', 'instrument', 'volume', 'effect', 'effect2', 'accent', 'slide'],
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
          columnTypes: ['note', 'instrument', 'volume', 'effect', 'effect2', 'accent', 'slide'],
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
              targetCell.effect = sourceCell.effect;
            }
            if (hasMaskBit(pasteMask, MASK_EFFECT2)) {
              targetCell.effect2 = sourceCell.effect2;
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
            targetCell.effect = sourceCell.effect;
          }
          if (hasMaskBit(pasteMask, MASK_EFFECT2)) {
            targetCell.effect2 = sourceCell.effect2;
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
          effect: cell.effect,
          effect2: cell.effect2 ?? null,
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

          if (hasMaskBit(pasteMask, MASK_NOTE) && macro.note !== null) {
            targetCell.note = macro.note;
          }
          if (hasMaskBit(pasteMask, MASK_INSTRUMENT) && macro.instrument !== null) {
            targetCell.instrument = macro.instrument;
          }
          if (hasMaskBit(pasteMask, MASK_VOLUME) && macro.volume !== null) {
            targetCell.volume = macro.volume;
          }
          if (hasMaskBit(pasteMask, MASK_EFFECT) && macro.effect !== null) {
            targetCell.effect = macro.effect;
          }
          if (hasMaskBit(pasteMask, MASK_EFFECT2) && macro.effect2 !== null) {
            targetCell.effect2 = macro.effect2;
          }
        } else {
          // Insert mode: shift rows down and insert macro
          const channel = pattern.channels[channelIndex];
          const newRow: TrackerCell = { ...EMPTY_CELL };

          if (hasMaskBit(pasteMask, MASK_NOTE) && macro.note !== null) {
            newRow.note = macro.note;
          }
          if (hasMaskBit(pasteMask, MASK_INSTRUMENT) && macro.instrument !== null) {
            newRow.instrument = macro.instrument;
          }
          if (hasMaskBit(pasteMask, MASK_VOLUME) && macro.volume !== null) {
            newRow.volume = macro.volume;
          }
          if (hasMaskBit(pasteMask, MASK_EFFECT) && macro.effect !== null) {
            newRow.effect = macro.effect;
          }
          if (hasMaskBit(pasteMask, MASK_EFFECT2) && macro.effect2 !== null) {
            newRow.effect2 = macro.effect2;
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
            if (!cell.note || cell.note === '...' || cell.note === '===') continue;

            // If filtering by current instrument, skip others
            if (currentInstrumentOnly && targetInstrumentId !== null && cell.instrument !== targetInstrumentId) {
              continue;
            }

            const semitone = parseNote(cell.note);
            if (semitone === null) continue;

            const newSemitone = semitone + semitones;
            const newNote = semitoneToNote(newSemitone);

            if (newNote) {
              cell.note = newNote;
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
    interpolateSelection: (column, startValue, endValue) =>
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

        // Apply interpolation to each channel in selection
        for (let ch = minChannel; ch <= maxChannel; ch++) {
          if (ch >= pattern.channels.length) continue;

          for (let row = minRow; row <= maxRow; row++) {
            if (row >= pattern.length) continue;

            const cell = pattern.channels[ch].rows[row];
            const t = (row - minRow) / (rowCount - 1); // 0 to 1
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
            if (!cell.note || cell.note === '...' || cell.note === '===') continue;

            const currentVolume = cell.volume ?? 64; // Default to max if not set
            const maxVariation = Math.floor(currentVolume * (volumeVariation / 100));
            const randomOffset = Math.floor(Math.random() * (maxVariation * 2 + 1)) - maxVariation;
            const newVolume = Math.max(1, Math.min(64, currentVolume + randomOffset));

            cell.volume = newVolume;
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
      }),

    deletePattern: (index) =>
      set((state) => {
        if (state.patterns.length > 1 && index >= 0 && index < state.patterns.length) {
          state.patterns.splice(index, 1);
          if (state.currentPatternIndex >= state.patterns.length) {
            state.currentPatternIndex = state.patterns.length - 1;
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
              volume: 80,
              pan: 0,
              instrumentId: null,
              color: randomColor,
            });
          }
        });
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
      }),

    toggleChannelMute: (channelIndex) => {
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
            pattern.channels[channelIndex].muted = !pattern.channels[channelIndex].muted;
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
    },

    toggleChannelSolo: (channelIndex) => {
      set((state) => {
        state.patterns.forEach((pattern) => {
          if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
            pattern.channels[channelIndex].solo = !pattern.channels[channelIndex].solo;
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
    },

    // toggleChannelCollapse: (channelIndex) =>
    //   set((state) => {
    //     state.patterns.forEach((pattern) => {
    //       if (channelIndex >= 0 && channelIndex < pattern.channels.length) {
    //         pattern.channels[channelIndex].collapsed = !pattern.channels[channelIndex].collapsed;
    //       }
    //     });
    //   }),

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

    // Import/Export
    loadPatterns: (patterns) =>
      set((state) => {
        console.log('[TrackerStore] loadPatterns called with', patterns.length, 'patterns');
        if (patterns.length > 0) {
          console.log('[TrackerStore] First pattern:', {
            id: patterns[0].id,
            name: patterns[0].name,
            length: patterns[0].length,
            channels: patterns[0].channels.length,
            firstChannelRows: patterns[0].channels[0]?.rows?.length,
          });
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
          console.log('[TrackerStore] Patterns loaded, currentPatternIndex:', 0);
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
