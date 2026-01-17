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

interface TrackerStore {
  // State
  patterns: Pattern[];
  currentPatternIndex: number;
  cursor: CursorPosition;
  selection: BlockSelection | null;
  clipboard: ClipboardData | null;
  followPlayback: boolean;
  showGhostPatterns: boolean; // Show previous/next patterns as ghosts
  columnVisibility: ColumnVisibility;
  currentOctave: number; // FT2: F1-F7 selects octave 1-7
  recordMode: boolean; // When true, entering notes advances cursor by editStep
  editStep: number; // Rows to advance after entering a note (1-16)

  // Actions
  setCurrentPattern: (index: number) => void;
  moveCursor: (direction: 'up' | 'down' | 'left' | 'right') => void;
  moveCursorToRow: (row: number) => void;
  moveCursorToChannel: (channel: number) => void;
  moveCursorToColumn: (columnType: CursorPosition['columnType']) => void;
  setCell: (channelIndex: number, rowIndex: number, cell: Partial<TrackerCell>) => void;
  clearCell: (channelIndex: number, rowIndex: number) => void;
  setFollowPlayback: (enabled: boolean) => void;
  setShowGhostPatterns: (enabled: boolean) => void;
  setColumnVisibility: (visibility: Partial<ColumnVisibility>) => void;
  setCurrentOctave: (octave: number) => void;
  toggleRecordMode: () => void;
  setEditStep: (step: number) => void;

  // Block operations
  startSelection: () => void;
  endSelection: () => void;
  clearSelection: () => void;
  copySelection: () => void;
  cutSelection: () => void;
  paste: () => void;

  // Advanced editing
  transposeSelection: (semitones: number) => void;
  interpolateSelection: (column: 'volume' | 'cutoff' | 'resonance' | 'envMod' | 'pan', startValue: number, endValue: number) => void;
  humanizeSelection: (volumeVariation: number) => void;

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

  // Channel management
  addChannel: () => void;
  removeChannel: (channelIndex: number) => void;
  toggleChannelMute: (channelIndex: number) => void;
  toggleChannelSolo: (channelIndex: number) => void;
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

const createEmptyPattern = (length: number = 64, numChannels: number = 4): Pattern => ({
  id: `pattern-${Date.now()}`,
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
    followPlayback: false,
    showGhostPatterns: true, // Show ghost patterns by default
    columnVisibility: { ...DEFAULT_COLUMN_VISIBILITY },
    currentOctave: 4, // Default octave (F4)
    recordMode: false, // Start with record mode off
    editStep: 1, // Default edit step (advance 1 row after note entry)

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

          case 'left':
            // Move to previous column/channel
            // Column order includes TB-303 accent and slide
            const columnOrder: CursorPosition['columnType'][] = [
              'note',
              'instrument',
              'volume',
              'effect',
              'accent',
              'slide',
            ];
            const currentColumnIndex = columnOrder.indexOf(state.cursor.columnType);
            if (currentColumnIndex > 0) {
              state.cursor.columnType = columnOrder[currentColumnIndex - 1];
              state.cursor.digitIndex = 0;
            } else if (state.cursor.channelIndex > 0) {
              state.cursor.channelIndex--;
              state.cursor.columnType = 'slide'; // Jump to last column of previous channel
              state.cursor.digitIndex = 0;
            }
            break;

          case 'right':
            // Move to next column/channel
            // Column order includes TB-303 accent and slide
            const columnOrder2: CursorPosition['columnType'][] = [
              'note',
              'instrument',
              'volume',
              'effect',
              'accent',
              'slide',
            ];
            const currentColumnIndex2 = columnOrder2.indexOf(state.cursor.columnType);
            if (currentColumnIndex2 < columnOrder2.length - 1) {
              state.cursor.columnType = columnOrder2[currentColumnIndex2 + 1];
              state.cursor.digitIndex = 0;
            } else if (state.cursor.channelIndex < numChannels - 1) {
              state.cursor.channelIndex++;
              state.cursor.columnType = 'note'; // Jump to first column of next channel
              state.cursor.digitIndex = 0;
            }
            break;
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

        for (let ch = 0; ch < data.length; ch++) {
          const targetChannel = channelIndex + ch;
          if (targetChannel >= pattern.channels.length) break;

          for (let row = 0; row < data[ch].length; row++) {
            const targetRow = rowIndex + row;
            if (targetRow >= pattern.length) break;

            pattern.channels[targetChannel].rows[targetRow] = { ...data[ch][row] };
          }
        }
      }),

    // Advanced editing - Transpose selection by semitones
    transposeSelection: (semitones) =>
      set((state) => {
        const pattern = state.patterns[state.currentPatternIndex];

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
            if (!cell.note) continue;

            const semitone = parseNote(cell.note);
            if (semitone === null) continue; // Skip note-off and empty

            const newSemitone = semitone + semitones;
            const newNote = semitoneToNote(newSemitone);

            if (newNote) {
              cell.note = newNote;
            }
            // If out of range, keep original note
          }
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

    addPattern: (length = 64) =>
      set((state) => {
        const numChannels = state.patterns[0]?.channels.length || 4;
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
          cloned.id = `pattern-${Date.now()}`;
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
          cloned.id = `pattern-${Date.now()}`;
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
          const newLength = Math.min(oldLength * 2, 256); // Max 256 rows

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
          const newLength = Math.max(Math.floor(oldLength / 2), 1); // Min 1 row

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

    // Channel management
    addChannel: () =>
      set((state) => {
        const maxChannels = 16;
        // Get available colors (excluding null)
        const availableColors = CHANNEL_COLORS.filter((c) => c !== null) as string[];
        // Pick a random color for the new channel
        const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)];

        state.patterns.forEach((pattern) => {
          if (pattern.channels.length < maxChannels) {
            const newChannelIndex = pattern.channels.length;
            pattern.channels.push({
              id: `channel-${Date.now()}-${newChannelIndex}`,
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
        const minChannels = 1;
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
          // Ensure all channels have required properties (color)
          const normalizedPatterns = patterns.map((pattern) => ({
            ...pattern,
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
        state.currentOctave = 4;
        state.recordMode = false;
        state.editStep = 1;
        state.columnVisibility = { ...DEFAULT_COLUMN_VISIBILITY };
      }),
  }))
);
