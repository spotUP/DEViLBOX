// @ts-nocheck - Undefined argument issue
/**
 * useTrackerInput - FastTracker II Keyboard Input System
 * Implements authentic FT2 keyboard shortcuts
 */

import { useEffect, useCallback, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTrackerStore, useTransportStore, useInstrumentStore } from '@stores';
import { useSettingsStore } from '@stores/useSettingsStore';
import { useUIStore } from '@stores/useUIStore';
import { getToneEngine } from '@engine/ToneEngine';
import { stringNoteToXM } from '@/lib/xmConversions';

// Track currently held notes to prevent retriggering and enable proper release
interface HeldNote {
  note: string;
  xmNote: number;        // XM note number (1-96) for recording note-off
  instrumentId: number;
  channelIndex: number;  // Channel where this note was placed (for multi-channel)
}

// FT2 piano key mapping (QWERTY → notes)
const NOTE_MAP: Record<string, { note: string; octaveOffset: number }> = {
  // Bottom row (lower octave)
  z: { note: 'C', octaveOffset: 0 },
  s: { note: 'C#', octaveOffset: 0 },
  x: { note: 'D', octaveOffset: 0 },
  d: { note: 'D#', octaveOffset: 0 },
  c: { note: 'E', octaveOffset: 0 },
  v: { note: 'F', octaveOffset: 0 },
  g: { note: 'F#', octaveOffset: 0 },
  b: { note: 'G', octaveOffset: 0 },
  h: { note: 'G#', octaveOffset: 0 },
  n: { note: 'A', octaveOffset: 0 },
  j: { note: 'A#', octaveOffset: 0 },
  m: { note: 'B', octaveOffset: 0 },
  ',': { note: 'C', octaveOffset: 1 },
  // Top row (higher octave)
  q: { note: 'C', octaveOffset: 1 },
  '2': { note: 'C#', octaveOffset: 1 },
  w: { note: 'D', octaveOffset: 1 },
  '3': { note: 'D#', octaveOffset: 1 },
  e: { note: 'E', octaveOffset: 1 },
  r: { note: 'F', octaveOffset: 1 },
  '5': { note: 'F#', octaveOffset: 1 },
  t: { note: 'G', octaveOffset: 1 },
  '6': { note: 'G#', octaveOffset: 1 },
  y: { note: 'A', octaveOffset: 1 },
  '7': { note: 'A#', octaveOffset: 1 },
  u: { note: 'B', octaveOffset: 1 },
  i: { note: 'C', octaveOffset: 2 },
  '9': { note: 'C#', octaveOffset: 2 },
  o: { note: 'D', octaveOffset: 2 },
  '0': { note: 'D#', octaveOffset: 2 },
  p: { note: 'E', octaveOffset: 2 },
};

// Alt+Q..I track jump mapping (tracks 0-7)
const ALT_TRACK_MAP_1: Record<string, number> = {
  q: 0, w: 1, e: 2, r: 3, t: 4, y: 5, u: 6, i: 7,
};

// Alt+A..K track jump mapping (tracks 8-15)
const ALT_TRACK_MAP_2: Record<string, number> = {
  a: 8, s: 9, d: 10, f: 11, g: 12, h: 13, j: 14, k: 15,
};

// Hex digit keys
const HEX_DIGITS_ALL = '0123456789ABCDEFabcdef';

// FT2 Volume Column Effect Keys (VOL1 position)
// These map to volume effect types: 0-4 = set volume prefix, - = vol slide down, + = vol slide up, etc.
// Index maps to high nibble value: 0=0x00, 1=0x10, 2=0x20, 3=0x30, 4=0x40, 5=0x60(down), 6=0x70(up), etc.
const VOL1_KEY_MAP: Record<string, number> = {
  '0': 0x0,  // 0x00-0x0F - nothing (or set volume 0 with second digit)
  '1': 0x1,  // 0x10-0x1F - set volume 0-15
  '2': 0x2,  // 0x20-0x2F - set volume 16-31
  '3': 0x3,  // 0x30-0x3F - set volume 32-47
  '4': 0x4,  // 0x40-0x4F - set volume 48-63 (0x50 = 64)
  '-': 0x6,  // 0x60-0x6F - volume slide down
  '+': 0x7,  // 0x70-0x7F - volume slide up
  'd': 0x8,  // 0x80-0x8F - fine volume down
  'u': 0x9,  // 0x90-0x9F - fine volume up
  's': 0xA,  // 0xA0-0xAF - set vibrato speed
  'v': 0xB,  // 0xB0-0xBF - vibrato
  'p': 0xC,  // 0xC0-0xCF - set panning
  'l': 0xD,  // 0xD0-0xDF - pan slide left
  'r': 0xE,  // 0xE0-0xEF - pan slide right
  'm': 0xF,  // 0xF0-0xFF - tone portamento
};

// FT2 Effect Type Keys (EFX0 position) - 36 effect commands
// Maps 0-9, A-Z to effect types 0-35
const EFFECT_TYPE_KEY_MAP: Record<string, number> = {
  '0': 0x00, '1': 0x01, '2': 0x02, '3': 0x03, '4': 0x04,
  '5': 0x05, '6': 0x06, '7': 0x07, '8': 0x08, '9': 0x09,
  'a': 0x0A, 'b': 0x0B, 'c': 0x0C, 'd': 0x0D, 'e': 0x0E, 'f': 0x0F,
  'g': 0x10, 'h': 0x11, 'i': 0x12, 'j': 0x13, 'k': 0x14, 'l': 0x15,
  'm': 0x16, 'n': 0x17, 'o': 0x18, 'p': 0x19, 'q': 0x1A, 'r': 0x1B,
  's': 0x1C, 't': 0x1D, 'u': 0x1E, 'v': 0x1F, 'w': 0x20, 'x': 0x21,
  'y': 0x22, 'z': 0x23,
};

export const useTrackerInput = () => {
  // PERFORMANCE: Use useShallow to prevent re-renders when state references haven't changed
  // Actions (functions) are always stable, only state values can cause re-renders
  const {
    cursor,
    patterns,
    currentPatternIndex,
    selection,
    currentOctave,
    recordMode,
    editStep,
    insertMode,
    multiRecEnabled,
    multiEditEnabled,
    multiRecChannels,
    recReleaseEnabled,
  } = useTrackerStore(useShallow((state) => ({
    cursor: state.cursor,
    patterns: state.patterns,
    currentPatternIndex: state.currentPatternIndex,
    selection: state.selection,
    currentOctave: state.currentOctave,
    recordMode: state.recordMode,
    editStep: state.editStep,
    insertMode: state.insertMode,
    multiRecEnabled: state.multiRecEnabled,
    multiEditEnabled: state.multiEditEnabled,
    multiRecChannels: state.multiRecChannels,
    recReleaseEnabled: state.recReleaseEnabled,
  })));

  // Actions are stable and don't cause re-renders - get them separately
  const moveCursor = useTrackerStore((state) => state.moveCursor);
  const moveCursorToRow = useTrackerStore((state) => state.moveCursorToRow);
  const moveCursorToChannel = useTrackerStore((state) => state.moveCursorToChannel);
  const moveCursorToColumn = useTrackerStore((state) => state.moveCursorToColumn);
  const setCell = useTrackerStore((state) => state.setCell);
  const clearCell = useTrackerStore((state) => state.clearCell);
  const setCurrentPattern = useTrackerStore((state) => state.setCurrentPattern);
  const startSelection = useTrackerStore((state) => state.startSelection);
  const endSelection = useTrackerStore((state) => state.endSelection);
  const clearSelection = useTrackerStore((state) => state.clearSelection);
  const copySelection = useTrackerStore((state) => state.copySelection);
  const cutSelection = useTrackerStore((state) => state.cutSelection);
  const paste = useTrackerStore((state) => state.paste);
  const pasteMix = useTrackerStore((state) => state.pasteMix);
  const pasteFlood = useTrackerStore((state) => state.pasteFlood);
  const pastePushForward = useTrackerStore((state) => state.pastePushForward);
  const setCurrentOctave = useTrackerStore((state) => state.setCurrentOctave);
  const transposeSelection = useTrackerStore((state) => state.transposeSelection);
  const interpolateSelection = useTrackerStore((state) => state.interpolateSelection);
  const humanizeSelection = useTrackerStore((state) => state.humanizeSelection);
  const toggleRecordMode = useTrackerStore((state) => state.toggleRecordMode);
  const setEditStep = useTrackerStore((state) => state.setEditStep);
  const writeMacroSlot = useTrackerStore((state) => state.writeMacroSlot);
  const readMacroSlot = useTrackerStore((state) => state.readMacroSlot);
  const toggleInsertMode = useTrackerStore((state) => state.toggleInsertMode);
  const setKeyOn = useTrackerStore((state) => state.setKeyOn);
  const setKeyOff = useTrackerStore((state) => state.setKeyOff);
  const findBestChannel = useTrackerStore((state) => state.findBestChannel);
  const insertRow = useTrackerStore((state) => state.insertRow);
  const deleteRow = useTrackerStore((state) => state.deleteRow);
  const setPtnJumpPos = useTrackerStore((state) => state.setPtnJumpPos);
  const getPtnJumpPos = useTrackerStore((state) => state.getPtnJumpPos);

  const {
    isPlaying,
    currentRow: playbackRow,
    stop,
    play,
    togglePlayPause: _togglePlayPause,
  } = useTransportStore(useShallow((state) => ({
    isPlaying: state.isPlaying,
    currentRow: state.currentRow,
    stop: state.stop,
    play: state.play,
    togglePlayPause: state.togglePlayPause,
  })));

  const {
    instruments,
    currentInstrumentId,
    setCurrentInstrument
  } = useInstrumentStore();

  const pattern = patterns[currentPatternIndex];

  // Track held notes by key to enable proper release
  const heldNotesRef = useRef<Map<string, HeldNote>>(new Map());

  // FT2: Get the channel to use for note entry (multi-channel allocation)
  const getTargetChannel = useCallback(() => {
    const editMode = recordMode && !isPlaying;
    const recMode = recordMode && isPlaying;

    // Use multi-channel allocation if enabled for current mode
    if ((multiEditEnabled && editMode) || (multiRecEnabled && recMode)) {
      return findBestChannel();
    }

    // Default: use cursor channel
    return cursor.channelIndex;
  }, [cursor.channelIndex, recordMode, isPlaying, multiEditEnabled, multiRecEnabled, findBestChannel]);

  // Preview note with attack (called on keydown)
  const previewNote = useCallback(
    (note: string, octave: number, key: string) => {
      if (currentInstrumentId === null) return;

      const engine = getToneEngine();
      const instrument = instruments.find((i) => i.id === currentInstrumentId);
      if (!instrument) return;

      const fullNote = `${note}${octave}`;
      const noteStr = `${note}-${octave}`;
      const xmNote = stringNoteToXM(noteStr);

      // Check if this key is already held
      if (heldNotesRef.current.has(key)) {
        return; // Already playing this key
      }

      // TB-303 LEGATO DETECTION:
      // If any other notes are currently held when we press a new key,
      // this is a legato transition - the 303 should SLIDE to the new note
      // without retriggering envelopes
      const hasHeldNotes = heldNotesRef.current.size > 0;
      const is303Synth = instrument.synthType === 'TB303' ||
                         instrument.synthType === 'Buzz3o3';
      const slideActive = hasHeldNotes && is303Synth;

      // For accent, we could use velocity threshold but keyboard doesn't have velocity
      // In the future, we could use a modifier key (e.g., Shift+key = accent)
      const accent = false; // TODO: Add Shift+key for accent

      // FT2: Get target channel for multi-channel recording
      const targetChannel = getTargetChannel();

      // PERFORMANCE: Trigger audio FIRST before any state updates
      // State updates can cause React re-renders which delay audio
      const { midiPolyphonic } = useSettingsStore.getState();
      if (midiPolyphonic) {
        // Polyphonic mode: use voice allocation for proper chord support
        // Pass accent and slide for 303 legato behavior
        engine.triggerPolyNoteAttack(currentInstrumentId, fullNote, 1, instrument, accent, slideActive);
      } else {
        // Monophonic mode: use legacy direct attack with accent/slide
        engine.triggerNoteAttack(currentInstrumentId, fullNote, undefined, 1, instrument, undefined, accent, slideActive);
      }

      // Track the held note with channel info (ref update, no re-render)
      heldNotesRef.current.set(key, {
        note: fullNote,
        xmNote,
        instrumentId: currentInstrumentId,
        channelIndex: targetChannel,
      });

      // FT2: Track key state for multi-channel allocation (state update, may re-render)
      setKeyOn(targetChannel, xmNote);
    },
    [currentInstrumentId, instruments, getTargetChannel, setKeyOn]
  );

  // Release note (called on keyup)
  const releaseNote = useCallback(
    (key: string) => {
      const heldNote = heldNotesRef.current.get(key);
      if (!heldNote) return;

      const engine = getToneEngine();
      const instrument = instruments.find((i) => i.id === heldNote.instrumentId);

      // Release the note - use polyphonic API if enabled
      const { midiPolyphonic } = useSettingsStore.getState();
      if (midiPolyphonic && instrument) {
        engine.triggerPolyNoteRelease(heldNote.instrumentId, heldNote.note, instrument);
      } else {
        engine.releaseNote(heldNote.instrumentId, heldNote.note);
      }

      // FT2: Track key-off for multi-channel allocation
      setKeyOff(heldNote.channelIndex);

      // FT2: Record note-off if enabled during recording
      if (recReleaseEnabled && recordMode && isPlaying) {
        // Record note-off (===) at current playback row
        setCell(heldNote.channelIndex, playbackRow, { note: 97 }); // 97 = note off in XM
      }

      // Remove from held notes
      heldNotesRef.current.delete(key);
    },
    [instruments, setKeyOff, recReleaseEnabled, recordMode, isPlaying, setCell, playbackRow]
  );

  // Enter note into cell
  const enterNote = useCallback(
    (note: string, octave: number, targetChannelOverride?: number) => {
      // Convert note + octave to XM note number (1-96)
      // FT2/XM format: note is numeric, not string
      const noteStr = `${note}-${octave}`; // e.g., "C-4"
      const xmNote = stringNoteToXM(noteStr);

      if (xmNote === 0) {
        console.warn(`Invalid note: ${noteStr}`);
        return;
      }

      // FT2: Use target channel from multi-channel allocation or override
      const targetChannel = targetChannelOverride !== undefined
        ? targetChannelOverride
        : getTargetChannel();

      // When recording during playback, enter at the current playback row
      // Otherwise enter at the cursor position
      const targetRow = (recordMode && isPlaying) ? playbackRow : cursor.rowIndex;

      // FT2: Insert mode - shift rows down before entering note
      if (insertMode && !isPlaying) {
        insertRow(targetChannel, targetRow);
      }

      // FT2: Auto-stamp instrument when entering notes (modern tracker behavior)
      // If currentInstrumentId is set, stamp it into the pattern
      // This allows TB-303 and other instruments to work without manual assignment
      setCell(targetChannel, targetRow, {
        note: xmNote,
        instrument: currentInstrumentId !== null ? currentInstrumentId : undefined,
      });

      // Chord entry mode: advance to next channel instead of next row
      const chordEntry = useUIStore.getState().chordEntryMode;
      if (chordEntry && !isPlaying && targetChannelOverride === undefined) {
        const channelCount = pattern.channels.length;
        const nextChannel = cursor.channelIndex + 1;
        if (nextChannel < channelCount) {
          moveCursorToChannel(nextChannel);
          // Don't advance row in chord mode - user advances manually
          return;
        }
        // At last channel: fall through to normal row advance behavior
      }

      // FT2: Always advance cursor by editStep after note entry (unless during playback)
      // Uses modulo wrapping, not clamping — FT2: (row + editRowSkip) % numRows
      if (editStep > 0 && !isPlaying) {
        moveCursorToRow((cursor.rowIndex + editStep) % pattern.length);
      }
    },
    [cursor, setCell, recordMode, editStep, pattern, moveCursorToRow, moveCursorToChannel, isPlaying, playbackRow, insertMode, insertRow, getTargetChannel]
  );

  // FT2: Insert empty row at cursor, shift rows down (local wrapper)
  const handleInsertRow = useCallback(() => {
    insertRow(cursor.channelIndex, cursor.rowIndex);
  }, [cursor, insertRow]);

  // FT2: Delete row at cursor, shift rows up (local wrapper)
  const handleDeleteRow = useCallback(() => {
    deleteRow(cursor.channelIndex, cursor.rowIndex);
  }, [cursor, deleteRow]);

  // Handle keyboard input
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if typing in input field or operating a dropdown
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Ignore if a modal is open (z-50 is modal z-index)
      if (document.querySelector('.fixed.inset-0.z-50')) {
        return;
      }

      const key = e.key;
      const keyLower = key.toLowerCase();

      // ============================================
      // 5.1 Cursor Moves
      // ============================================

      // F9-F12: Jump in pattern (FT2-style)
      // Plain: Jump to 0%, 25%, 50%, 75%
      // Shift: Store current row as jump position
      // Ctrl: Jump to stored position and play from there
      if (key === 'F9') {
        e.preventDefault();
        if (e.shiftKey) {
          setPtnJumpPos(0, cursor.rowIndex);
        } else if (e.ctrlKey || e.metaKey) {
          const jumpRow = getPtnJumpPos(0);
          moveCursorToRow(jumpRow);
          play();
        } else {
          moveCursorToRow(0);
        }
        return;
      }
      if (key === 'F10') {
        e.preventDefault();
        if (e.shiftKey) {
          setPtnJumpPos(1, cursor.rowIndex);
        } else if (e.ctrlKey || e.metaKey) {
          const jumpRow = getPtnJumpPos(1);
          moveCursorToRow(jumpRow);
          play();
        } else {
          moveCursorToRow(Math.floor(pattern.length * 0.25));
        }
        return;
      }
      if (key === 'F11') {
        e.preventDefault();
        if (e.shiftKey) {
          setPtnJumpPos(2, cursor.rowIndex);
        } else if (e.ctrlKey || e.metaKey) {
          const jumpRow = getPtnJumpPos(2);
          moveCursorToRow(jumpRow);
          play();
        } else {
          moveCursorToRow(Math.floor(pattern.length * 0.5));
        }
        return;
      }
      if (key === 'F12') {
        e.preventDefault();
        if (e.shiftKey) {
          setPtnJumpPos(3, cursor.rowIndex);
        } else if (e.ctrlKey || e.metaKey) {
          const jumpRow = getPtnJumpPos(3);
          moveCursorToRow(jumpRow);
          play();
        } else {
          moveCursorToRow(Math.floor(pattern.length * 0.75));
        }
        return;
      }

      // PageUp: Jump 16 lines up
      if (key === 'PageUp') {
        e.preventDefault();
        moveCursorToRow(Math.max(0, cursor.rowIndex - 16));
        return;
      }

      // PageDown: Jump 16 lines down
      if (key === 'PageDown') {
        e.preventDefault();
        moveCursorToRow(Math.min(pattern.length - 1, cursor.rowIndex + 16));
        return;
      }

      // Home: Jump to line 0
      if (key === 'Home') {
        e.preventDefault();
        moveCursorToRow(0);
        return;
      }

      // End: Jump to last line
      if (key === 'End') {
        e.preventDefault();
        moveCursorToRow(pattern.length - 1);
        return;
      }

      // Tab/Shift+Tab: Jump to next/previous track (with wrapping)
      // FT2: Tab always lands on CURSOR_NOTE of target channel
      if (key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          // FT2 Shift+Tab: If already on note column, go to previous channel
          // If on any other column, just jump to note column of same channel
          if (cursor.columnType === 'note') {
            if (cursor.channelIndex > 0) {
              moveCursorToChannel(cursor.channelIndex - 1);
            } else {
              moveCursorToChannel(pattern.channels.length - 1);
            }
          }
        } else {
          // FT2 Tab: Always go to note column of next channel
          if (cursor.channelIndex < pattern.channels.length - 1) {
            moveCursorToChannel(cursor.channelIndex + 1);
          } else {
            moveCursorToChannel(0);
          }
        }
        // FT2: Always reset to note column
        moveCursorToColumn('note');
        return;
      }

      // Alt+Q..I: Jump to track 0-7 (FT2: always lands on note column)
      if (e.altKey && ALT_TRACK_MAP_1[keyLower] !== undefined) {
        e.preventDefault();
        const track = ALT_TRACK_MAP_1[keyLower] % pattern.channels.length;
        moveCursorToChannel(track);
        moveCursorToColumn('note');
        return;
      }

      // Alt+A..K: Jump to track 8-15 (FT2: always lands on note column)
      if (e.altKey && ALT_TRACK_MAP_2[keyLower] !== undefined) {
        e.preventDefault();
        const track = ALT_TRACK_MAP_2[keyLower] % pattern.channels.length;
        moveCursorToChannel(track);
        moveCursorToColumn('note');
        return;
      }

      // ============================================
      // FT2: Macro Slots (Ctrl+1-8)
      // ============================================

      // Ctrl+1-8: Read macro slot (Ctrl+Shift+1-8: Write)
      if ((e.ctrlKey || e.metaKey) && key >= '1' && key <= '8' && !e.altKey) {
        e.preventDefault();
        const slotIndex = parseInt(key) - 1;
        if (e.shiftKey) {
          // Ctrl+Shift+1-8: Write current cell to macro slot
          writeMacroSlot(slotIndex);
        } else {
          // Ctrl+1-8: Read macro slot to current cell
          readMacroSlot(slotIndex);
        }
        return;
      }

      // ============================================
      // FT2: Insert/Delete Row Operations
      // ============================================

      // Insert key: In edit mode, insert row. Otherwise toggle insert mode.
      // Shift+Insert: Insert entire line (all channels)
      if (key === 'Insert') {
        e.preventDefault();
        if (recordMode) {
          if (e.shiftKey) {
            // Shift+Insert: Insert line (all channels) - shifts all rows down
            handleInsertRow();
          } else {
            // Insert: Insert row on current channel only
            handleInsertRow();
          }
        } else {
          // Not in edit mode: toggle insert mode
          toggleInsertMode();
        }
        return;
      }

      // ============================================
      // Transpose Selection (Ctrl+Arrow)
      // ============================================

      // Ctrl+Up: Transpose selection up 1 semitone (requires edit mode)
      if (recordMode && (e.ctrlKey || e.metaKey) && key === 'ArrowUp' && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) {
          // Ctrl+Shift+Up: Transpose up 12 semitones (octave)
          transposeSelection(12);
        } else {
          // Ctrl+Up: Transpose up 1 semitone
          transposeSelection(1);
        }
        return;
      }

      // Ctrl+Down: Transpose selection down 1 semitone (requires edit mode)
      if (recordMode && (e.ctrlKey || e.metaKey) && key === 'ArrowDown' && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) {
          // Ctrl+Shift+Down: Transpose down 12 semitones (octave)
          transposeSelection(-12);
        } else {
          // Ctrl+Down: Transpose down 1 semitone
          transposeSelection(-1);
        }
        return;
      }

      // Arrow keys
      if (key === 'ArrowUp') {
        e.preventDefault();
        if (e.altKey) {
          // Alt+Arrow: Mark block
          if (!selection) startSelection();
          moveCursor('up');
          endSelection();
        } else {
          moveCursor('up');
        }
        return;
      }

      if (key === 'ArrowDown') {
        e.preventDefault();
        if (e.altKey) {
          if (!selection) startSelection();
          moveCursor('down');
          endSelection();
        } else {
          moveCursor('down');
        }
        return;
      }

      if (key === 'ArrowLeft') {
        e.preventDefault();
        if (e.altKey) {
          if (!selection) startSelection();
          moveCursor('left');
          endSelection();
        } else {
          moveCursor('left');
        }
        return;
      }

      if (key === 'ArrowRight') {
        e.preventDefault();
        if (e.altKey) {
          if (!selection) startSelection();
          moveCursor('right');
          endSelection();
        } else {
          moveCursor('right');
        }
        return;
      }

      // ============================================
      // 5.2 Cut/Copy/Paste
      // ============================================

      // Delete: Different behaviors based on modifiers (requires edit mode)
      // FT2: Delete clears fields then advances by editRowSkip with wrapping
      if (key === 'Delete' && recordMode) {
        e.preventDefault();
        if (e.shiftKey) {
          // Shift+Del: Delete note, instrument, volume and effect (FT2-style)
          setCell(cursor.channelIndex, cursor.rowIndex, {
            note: 0,
            instrument: 0,
            volume: 0,
            effTyp: 0,
            eff: 0,
          });
        } else if (e.ctrlKey || e.metaKey) {
          // Ctrl+Del: Delete volume and effect (FT2-style)
          setCell(cursor.channelIndex, cursor.rowIndex, {
            volume: 0,
            effTyp: 0,
            eff: 0,
          });
        } else if (e.altKey) {
          // Alt+Del: Delete effect only (FT2-style)
          setCell(cursor.channelIndex, cursor.rowIndex, {
            effTyp: 0,
            eff: 0,
          });
        } else {
          // Del: Delete note or volume at cursor (FT2-style based on cursor position)
          if (cursor.columnType === 'note') {
            setCell(cursor.channelIndex, cursor.rowIndex, { note: 0, instrument: 0 });
          } else if (cursor.columnType === 'instrument') {
            setCell(cursor.channelIndex, cursor.rowIndex, { instrument: 0 });
          } else if (cursor.columnType === 'volume') {
            setCell(cursor.channelIndex, cursor.rowIndex, { volume: 0 });
          } else if (cursor.columnType === 'effTyp' || cursor.columnType === 'effParam') {
            setCell(cursor.channelIndex, cursor.rowIndex, { effTyp: 0, eff: 0 });
          } else if (cursor.columnType === 'effTyp2' || cursor.columnType === 'effParam2') {
            setCell(cursor.channelIndex, cursor.rowIndex, { effTyp2: 0, eff2: 0 });
          } else if (cursor.columnType === 'probability') {
            setCell(cursor.channelIndex, cursor.rowIndex, { probability: undefined });
          } else {
            clearCell(cursor.channelIndex, cursor.rowIndex);
          }
        }
        // FT2: Advance by editStep after delete (same as any data entry)
        if (editStep > 0 && !isPlaying) {
          moveCursorToRow((cursor.rowIndex + editStep) % pattern.length);
        }
        return;
      }

      // Backspace: Delete previous note/line (requires edit mode)
      if (key === 'Backspace' && recordMode) {
        e.preventDefault();
        if (e.shiftKey) {
          // Shift+Backspace: Delete previous line (FT2: shifts rows up)
          if (cursor.rowIndex > 0) {
            moveCursor('up');
            handleDeleteRow();
          }
        } else {
          // Backspace: Delete previous note
          if (cursor.rowIndex > 0) {
            moveCursor('up');
            clearCell(cursor.channelIndex, cursor.rowIndex);
          }
        }
        return;
      }

      // F3/F4/F5 with modifiers: Cut/Copy/Paste operations
      if (key === 'F3') {
        e.preventDefault();
        if (e.altKey) {
          // Alt+F3: Cut block
          cutSelection();
        } else if (e.ctrlKey || e.metaKey) {
          // Ctrl+F3: Cut pattern (not implemented yet)
          cutSelection();
        } else if (e.shiftKey) {
          // Shift+F3: Cut track (not implemented yet)
          cutSelection();
        }
        return;
      }

      if (key === 'F4') {
        e.preventDefault();
        if (e.altKey) {
          // Alt+F4: Copy block
          copySelection();
        } else if (e.ctrlKey || e.metaKey) {
          // Ctrl+F4: Copy pattern
          copySelection();
        } else if (e.shiftKey) {
          // Shift+F4: Copy track
          copySelection();
        }
        return;
      }

      if (key === 'F5') {
        e.preventDefault();
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
          // Any modifier + F5: Paste
          paste();
        }
        return;
      }

      // Standard Ctrl+C/X/V shortcuts (in addition to FT2's F3/F4/F5)
      if ((e.ctrlKey || e.metaKey) && keyLower === 'c' && !e.altKey) {
        e.preventDefault();
        copySelection();
        useUIStore.getState().setStatusMessage('COPY');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && keyLower === 'x' && !e.altKey) {
        e.preventDefault();
        cutSelection();
        useUIStore.getState().setStatusMessage('CUT');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && keyLower === 'v' && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) {
          // Ctrl+Shift+V: Mix Paste (only fill empty cells)
          pasteMix();
          useUIStore.getState().setStatusMessage('MIX PASTE');
        } else {
          paste();
          useUIStore.getState().setStatusMessage('PASTE');
        }
        return;
      }
      // Ctrl+Shift+F: Flood Paste (paste until pattern end)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && keyLower === 'f') {
        e.preventDefault();
        pasteFlood();
        return;
      }
      // Ctrl+Shift+I: Push-Forward Paste (insert and shift down)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && keyLower === 'i') {
        e.preventDefault();
        pastePushForward();
        return;
      }

      // Escape: Clear selection and volume effect prefix
      if (key === 'Escape') {
        e.preventDefault();
        clearSelection();
        return;
      }

      // ============================================
      // 5.3 Miscellaneous
      // ============================================

      // FT2: Right Shift = Record pattern (play with recording)
      if (e.key === 'Shift' && e.location === 2) { // location 2 = right side
        e.preventDefault();
        if (!recordMode) {
          toggleRecordMode(); // Enable record mode
        }
        play();
        return;
      }

      // FT2: Right Ctrl = Play song
      if (e.key === 'Control' && e.location === 2) {
        e.preventDefault();
        play();
        return;
      }

      // FT2: Right Alt = Play pattern (same as play for now)
      if (e.key === 'Alt' && e.location === 2) {
        e.preventDefault();
        play();
        return;
      }

      // Space: Toggle edit mode or stop (FT2 style)
      if (key === ' ') {
        e.preventDefault();

        // FT2 behavior: If playing, stop. If not playing, toggle edit mode.
        if (isPlaying) {
          stop();
          useUIStore.getState().setStatusMessage('STOPPED');
        } else {
          // Toggle edit/record mode
          toggleRecordMode();
          const isRec = useTrackerStore.getState().recordMode;
          useUIStore.getState().setStatusMessage(isRec ? 'RECORD ON' : 'RECORD OFF');
        }
        return;
      }

      // Ctrl+Enter or Right Enter: Play song
      if (key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        play();
        return;
      }

      // CapsLock: Enter note-off (XM note 97)
      if (key === 'CapsLock') {
        e.preventDefault();
        if (cursor.columnType === 'note') {
          // When recording during playback, enter at the current playback row
          const targetRow = (recordMode && isPlaying) ? playbackRow : cursor.rowIndex;
          setCell(cursor.channelIndex, targetRow, { note: 97 }); // 97 = note off in XM format
          // FT2: Advance cursor by editStep with wrapping (unless during playback)
          if (editStep > 0 && !isPlaying) {
            moveCursorToRow((cursor.rowIndex + editStep) % pattern.length);
          }
        }
        return;
      }

      // F1-F7: Select octave 1-7 (FT2 uses F1-F8 for octaves 0-6, we use 1-7)
      if (key >= 'F1' && key <= 'F7') {
        e.preventDefault();
        const octave = parseInt(key.substring(1));
        setCurrentOctave(octave);
        useUIStore.getState().setStatusMessage(`OCTAVE ${octave}`);
        return;
      }

      // FT2: Grave key (`) - Cycle edit step (0-16)
      // Shift+` decreases, plain ` increases
      if (key === '`' || key === '~') {
        e.preventDefault();
        let newStep: number;
        if (e.shiftKey) {
          // Decrease edit step (wrap from 0 to 16)
          newStep = editStep === 0 ? 16 : editStep - 1;
        } else {
          // Increase edit step (wrap from 16 to 0)
          newStep = editStep === 16 ? 0 : editStep + 1;
        }
        setEditStep(newStep);
        useUIStore.getState().setStatusMessage(`EDIT STEP ${newStep}`);
        return;
      }

      // FT2: Numpad +/- or Keypad * to change octave
      if (e.code === 'NumpadAdd' || (key === '+' && !e.shiftKey && e.location === 3)) {
        e.preventDefault();
        if (currentOctave < 7) {
          setCurrentOctave(currentOctave + 1);
        }
        return;
      }
      if (e.code === 'NumpadSubtract' || (key === '-' && e.location === 3)) {
        e.preventDefault();
        if (currentOctave > 1) {
          setCurrentOctave(currentOctave - 1);
        }
        return;
      }

      // Shift+Left/Right: Change pattern number (song position)
      if (e.shiftKey && key === 'ArrowLeft') {
        e.preventDefault();
        if (currentPatternIndex > 0) {
          setCurrentPattern(currentPatternIndex - 1);
        }
        return;
      }
      if (e.shiftKey && key === 'ArrowRight') {
        e.preventDefault();
        if (currentPatternIndex < patterns.length - 1) {
          setCurrentPattern(currentPatternIndex + 1);
        }
        return;
      }

      // ============================================
      // 5.5 Instrument Select
      // ============================================

      // Shift+Up/Down: Select previous/next instrument
      if (e.shiftKey && key === 'ArrowUp') {
        e.preventDefault();
        if (currentInstrumentId !== null && currentInstrumentId > 0) {
          const prevInst = instruments.find(i => i.id === currentInstrumentId - 1);
          if (prevInst) setCurrentInstrument(prevInst.id);
        }
        return;
      }
      if (e.shiftKey && key === 'ArrowDown') {
        e.preventDefault();
        if (currentInstrumentId !== null) {
          const nextInst = instruments.find(i => i.id === currentInstrumentId + 1);
          if (nextInst) setCurrentInstrument(nextInst.id);
        }
        return;
      }

      // ============================================
      // Note Entry (Piano Keys)
      // ============================================

      // Check if this is a note key
      // IMPORTANT: Ignore key repeats to prevent retriggering while holding a key
      // FT2: Only process note keys when cursor is on the NOTE column
      // Otherwise, keys like 'c', 'v', 'b' etc. should go to effect/volume entry
      if (NOTE_MAP[keyLower] && !e.altKey && !e.ctrlKey && !e.metaKey && !e.repeat && cursor.columnType === 'note') {
        e.preventDefault();
        const { note, octaveOffset } = NOTE_MAP[keyLower];
        const octave = currentOctave + octaveOffset;

        // Preview note (pass key for tracking held notes)
        // This also sets up the target channel for multi-channel recording
        previewNote(note, octave, keyLower);

        // FT2: Only enter notes when in edit/record mode
        if (recordMode) {
          // FT2: Get the channel that was allocated by previewNote for multi-channel
          const heldNote = heldNotesRef.current.get(keyLower);
          const targetChannel = heldNote?.channelIndex;
          enterNote(note, octave, targetChannel);
        }
        return;
      }

      // FT2: Key repeat behavior - only repeat note entry in edit mode
      // In edit mode (recordMode && !isPlaying), allow key repeat for notes
      if (NOTE_MAP[keyLower] && e.repeat && cursor.columnType === 'note') {
        e.preventDefault();
        // FT2 behavior: Allow key repeat only in edit mode
        if (recordMode && !isPlaying) {
          const { note, octaveOffset } = NOTE_MAP[keyLower];
          const octave = currentOctave + octaveOffset;
          const heldNote = heldNotesRef.current.get(keyLower);
          enterNote(note, octave, heldNote?.channelIndex);
        }
        return;
      }

      // ============================================
      // FT2-Style Data Entry (Instrument/Volume/Effect)
      // Requires recordMode to be enabled (FT2: Edit mode)
      // ============================================

      const currentCell = pattern.channels[cursor.channelIndex].rows[cursor.rowIndex];

      // ---------- INSTRUMENT COLUMN (hex digits only) ----------
      if (recordMode && cursor.columnType === 'instrument' && HEX_DIGITS_ALL.includes(key) && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const hexDigit = parseInt(key, 16);
        const currentValue = currentCell.instrument || 0;

        let newValue: number;
        if (cursor.digitIndex === 0) {
          // High nibble: (hex << 4) | (current & 0x0F)
          newValue = (hexDigit << 4) | (currentValue & 0x0F);
        } else {
          // Low nibble: (current & 0xF0) | hex
          newValue = (currentValue & 0xF0) | hexDigit;
        }

        // XM instrument range is 0-128
        if (newValue > 128) newValue = 128;
        setCell(cursor.channelIndex, cursor.rowIndex, { instrument: newValue });

        // FT2: Stay on same column/digit, advance row by editStep with wrapping
        if (editStep > 0 && !isPlaying) {
          moveCursorToRow((cursor.rowIndex + editStep) % pattern.length);
        }
        return;
      }

      // ---------- VOLUME COLUMN (FT2 VOL1 special keys + VOL2 hex) ----------
      if (recordMode && cursor.columnType === 'volume' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const currentValue = currentCell.volume || 0;

        if (cursor.digitIndex === 0) {
          // VOL1: Use FT2 volume effect keys (not hex)
          const vol1Key = VOL1_KEY_MAP[keyLower];
          if (vol1Key !== undefined) {
            e.preventDefault();
            // Set high nibble, preserve low nibble
            let newValue = (vol1Key << 4) | (currentValue & 0x0F);
            // FT2: volume 0x51-0x5F clamps to 0x50
            if (newValue >= 0x51 && newValue <= 0x5F) newValue = 0x50;
            setCell(cursor.channelIndex, cursor.rowIndex, { volume: newValue });
            // FT2: Stay on same column/digit, advance row by editStep with wrapping
            if (editStep > 0 && !isPlaying) {
              moveCursorToRow((cursor.rowIndex + editStep) % pattern.length);
            }
            return;
          }
        } else {
          // VOL2: Use hex digits
          if (HEX_DIGITS_ALL.includes(key)) {
            e.preventDefault();
            const hexDigit = parseInt(key, 16);
            let newValue: number;

            // FT2: If volume was < 0x10, set to 0x10 + digit
            if (currentValue < 0x10) {
              newValue = 0x10 + hexDigit;
            } else {
              newValue = (currentValue & 0xF0) | hexDigit;
            }

            // FT2: volume 0x51-0x5F clamps to 0x50
            if (newValue >= 0x51 && newValue <= 0x5F) newValue = 0x50;
            setCell(cursor.channelIndex, cursor.rowIndex, { volume: newValue });

            // FT2: Stay on same column/digit, advance row by editStep with wrapping
            if (editStep > 0 && !isPlaying) {
              moveCursorToRow((cursor.rowIndex + editStep) % pattern.length);
            }
            return;
          }
        }
      }

      // ---------- EFFECT TYPE (EFX0): FT2 effect command keys (0-9, A-Z) ----------
      if (recordMode && cursor.columnType === 'effTyp' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const effKey = EFFECT_TYPE_KEY_MAP[keyLower];
        if (effKey !== undefined) {
          e.preventDefault();
          setCell(cursor.channelIndex, cursor.rowIndex, { effTyp: effKey });
          // FT2: Stay on same column, advance row by editStep with wrapping
          if (editStep > 0 && !isPlaying) {
            moveCursorToRow((cursor.rowIndex + editStep) % pattern.length);
          }
          return;
        }
      }

      // ---------- EFFECT PARAMETER (EFX1/EFX2): Hex digits only ----------
      if (recordMode && cursor.columnType === 'effParam' && HEX_DIGITS_ALL.includes(key) && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const hexDigit = parseInt(key, 16);
        const currentValue = currentCell.eff || 0;

        let newValue: number;
        if (cursor.digitIndex === 0) {
          // High nibble (EFX1)
          newValue = (hexDigit << 4) | (currentValue & 0x0F);
        } else {
          // Low nibble (EFX2)
          newValue = (currentValue & 0xF0) | hexDigit;
        }

        setCell(cursor.channelIndex, cursor.rowIndex, { eff: newValue });

        // FT2: Stay on same column/digit, advance row by editStep with wrapping
        if (editStep > 0 && !isPlaying) {
          moveCursorToRow((cursor.rowIndex + editStep) % pattern.length);
        }
        return;
      }

      // ---------- EFFECT2 TYPE (EFX2_0): FT2 effect command keys (0-9, A-Z) ----------
      if (recordMode && cursor.columnType === 'effTyp2' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const effKey = EFFECT_TYPE_KEY_MAP[keyLower];
        if (effKey !== undefined) {
          e.preventDefault();
          setCell(cursor.channelIndex, cursor.rowIndex, { effTyp2: effKey });
          // FT2: Stay on same column, advance row by editStep with wrapping
          if (editStep > 0 && !isPlaying) {
            moveCursorToRow((cursor.rowIndex + editStep) % pattern.length);
          }
          return;
        }
      }

      // ---------- FLAG COLUMNS: 'A' for accent (1), 'S' for slide (2), '0'/'.' to clear ----------
      if (recordMode && (cursor.columnType === 'flag1' || cursor.columnType === 'flag2') && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const flagField = cursor.columnType; // 'flag1' or 'flag2'

        if (keyLower === 'a') {
          e.preventDefault();
          setCell(cursor.channelIndex, cursor.rowIndex, { [flagField]: 1 }); // 1 = accent
          if (editStep > 0 && !isPlaying) moveCursorToRow((cursor.rowIndex + editStep) % pattern.length);
          return;
        }
        if (keyLower === 's') {
          e.preventDefault();
          setCell(cursor.channelIndex, cursor.rowIndex, { [flagField]: 2 }); // 2 = slide
          if (editStep > 0 && !isPlaying) moveCursorToRow((cursor.rowIndex + editStep) % pattern.length);
          return;
        }
        if (key === '0' || key === '.') {
          e.preventDefault();
          setCell(cursor.channelIndex, cursor.rowIndex, { [flagField]: 0 }); // 0 = clear
          if (editStep > 0 && !isPlaying) moveCursorToRow((cursor.rowIndex + editStep) % pattern.length);
          return;
        }
      }

      // ---------- EFFECT2 PARAMETER (EFX2_1/EFX2_2): Hex digits only ----------
      if (recordMode && cursor.columnType === 'effParam2' && HEX_DIGITS_ALL.includes(key) && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const hexDigit = parseInt(key, 16);
        const currentValue = currentCell.eff2 || 0;

        let newValue: number;
        if (cursor.digitIndex === 0) {
          // High nibble
          newValue = (hexDigit << 4) | (currentValue & 0x0F);
        } else {
          // Low nibble
          newValue = (currentValue & 0xF0) | hexDigit;
        }

        setCell(cursor.channelIndex, cursor.rowIndex, { eff2: newValue });

        // FT2: Stay on same column/digit, advance row by editStep with wrapping
        if (editStep > 0 && !isPlaying) {
          moveCursorToRow((cursor.rowIndex + editStep) % pattern.length);
        }
        return;
      }

      // ---------- PROBABILITY COLUMN: Decimal digits 0-9 (percentage 0-99) ----------
      if (recordMode && cursor.columnType === 'probability' && /^[0-9]$/.test(key) && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const digit = parseInt(key, 10);
        const currentValue = currentCell.probability || 0;

        let newValue: number;
        if (cursor.digitIndex === 0) {
          // Tens digit
          newValue = (digit * 10) + (currentValue % 10);
        } else {
          // Ones digit
          newValue = (Math.floor(currentValue / 10) * 10) + digit;
        }

        // Clamp to 0-99
        newValue = Math.min(99, Math.max(0, newValue));

        setCell(cursor.channelIndex, cursor.rowIndex, { probability: newValue });

        // FT2: Stay on same column/digit, advance row by editStep with wrapping
        if (editStep > 0 && !isPlaying) {
          moveCursorToRow((cursor.rowIndex + editStep) % pattern.length);
        }
        return;
      }
    },
    [
      cursor,
      pattern,
      patterns,
      currentPatternIndex,
      isPlaying,
      playbackRow,
      currentOctave,
      currentInstrumentId,
      instruments,
      selection,
      recordMode,
      toggleRecordMode,
      editStep,
      setEditStep,
      moveCursor,
      moveCursorToRow,
      moveCursorToChannel,
      moveCursorToColumn,
      setCell,
      clearCell,
      setCurrentPattern,
      setCurrentInstrument,
      stop,
      play,
      startSelection,
      endSelection,
      clearSelection,
      copySelection,
      cutSelection,
      paste,
      pasteMix,
      pasteFlood,
      pastePushForward,
      previewNote,
      enterNote,
      handleInsertRow,
      handleDeleteRow,
      transposeSelection,
      interpolateSelection,
      humanizeSelection,
      setPtnJumpPos,
      getPtnJumpPos,
    ]
  );

  // Handle key release for note off
  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      const keyLower = e.key.toLowerCase();

      // Release note if this is a note key
      if (NOTE_MAP[keyLower]) {
        releaseNote(keyLower);
      }
    },
    [releaseNote]
  );

  // Attach keyboard listeners
  // Use capture phase to intercept F1-F12 before browser handles them
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [handleKeyDown, handleKeyUp]);

  return {
    previewNote,
    enterNote,
    currentOctave,
    setCurrentOctave,
  };
};
