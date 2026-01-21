// @ts-nocheck - Undefined argument issue
/**
 * useTrackerInput - FastTracker II Keyboard Input System
 * Implements authentic FT2 keyboard shortcuts
 */

import { useEffect, useCallback, useRef } from 'react';
import { useTrackerStore, useTransportStore, useInstrumentStore } from '@stores';
import { getToneEngine } from '@engine/ToneEngine';

// Track currently held notes to prevent retriggering and enable proper release
interface HeldNote {
  note: string;
  instrumentId: number;
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

export const useTrackerInput = () => {
  const {
    cursor,
    moveCursor,
    moveCursorToRow,
    moveCursorToChannel,
    moveCursorToColumn: _moveCursorToColumn,
    setCell,
    clearCell,
    patterns,
    currentPatternIndex,
    setCurrentPattern,
    selection,
    startSelection,
    endSelection,
    clearSelection,
    copySelection,
    cutSelection,
    paste,
    currentOctave,
    setCurrentOctave,
    transposeSelection,
    interpolateSelection,
    humanizeSelection,
    recordMode,
    editStep,
    // FT2: New features
    writeMacroSlot,
    readMacroSlot,
    toggleInsertMode,
  } = useTrackerStore();

  const {
    isPlaying,
    currentRow: playbackRow,
    stop,
    play,
    togglePlayPause: _togglePlayPause,
  } = useTransportStore();

  const {
    instruments,
    currentInstrumentId,
    setCurrentInstrument
  } = useInstrumentStore();

  const pattern = patterns[currentPatternIndex];

  // Track held notes by key to enable proper release
  const heldNotesRef = useRef<Map<string, HeldNote>>(new Map());

  // Track volume effect prefix state
  const volumeEffectPrefixRef = useRef<number | null>(null);

  // Preview note with attack (called on keydown)
  const previewNote = useCallback(
    (note: string, octave: number, key: string) => {
      if (currentInstrumentId === null) return;

      const engine = getToneEngine();
      const instrument = instruments.find((i) => i.id === currentInstrumentId);
      if (!instrument) return;

      const fullNote = `${note}${octave}`;

      // Check if this key is already held
      if (heldNotesRef.current.has(key)) {
        return; // Already playing this key
      }

      // Track the held note
      heldNotesRef.current.set(key, { note: fullNote, instrumentId: currentInstrumentId });

      // Trigger attack (note will sustain until keyup)
      engine.triggerNoteAttack(currentInstrumentId, fullNote, undefined, 1, instrument);
    },
    [currentInstrumentId, instruments]
  );

  // Release note (called on keyup)
  const releaseNote = useCallback(
    (key: string) => {
      const heldNote = heldNotesRef.current.get(key);
      if (!heldNote) return;

      const engine = getToneEngine();
      const instrument = instruments.find((i) => i.id === heldNote.instrumentId);

      // Release the note
      engine.releaseNote(heldNote.instrumentId, heldNote.note);

      // Remove from held notes
      heldNotesRef.current.delete(key);
    },
    [instruments]
  );

  // Enter note into cell
  const enterNote = useCallback(
    (note: string, octave: number) => {
      // Format note as "C-4" (with dash) for storage
      const fullNote = `${note}-${octave}`;

      // When recording during playback, enter at the current playback row
      // Otherwise enter at the cursor position
      const targetRow = (recordMode && isPlaying) ? playbackRow : cursor.rowIndex;

      setCell(cursor.channelIndex, targetRow, {
        note: fullNote,
        instrument: currentInstrumentId !== null ? currentInstrumentId : undefined,
      });

      // Always advance cursor by editStep after note entry (unless during playback)
      if (editStep > 0 && !isPlaying) {
        const newRow = Math.min(pattern.length - 1, cursor.rowIndex + editStep);
        moveCursorToRow(newRow);
      }
    },
    [cursor, currentInstrumentId, setCell, recordMode, editStep, pattern, moveCursorToRow, isPlaying, playbackRow]
  );

  // Insert empty row at cursor, shift rows down
  const insertRow = useCallback(() => {
    // This would need to be implemented in the store
    // For now, we'll just clear the current cell
    clearCell(cursor.channelIndex, cursor.rowIndex);
  }, [cursor, clearCell]);

  // Delete row at cursor, shift rows up
  const deleteRow = useCallback(() => {
    clearCell(cursor.channelIndex, cursor.rowIndex);
  }, [cursor, clearCell]);

  // Handle keyboard input
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if typing in input field
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
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

      // F9-F12: Jump in pattern (0%, 25%, 50%, 75%)
      if (key === 'F9') {
        e.preventDefault();
        moveCursorToRow(0);
        return;
      }
      if (key === 'F10') {
        e.preventDefault();
        moveCursorToRow(Math.floor(pattern.length * 0.25));
        return;
      }
      if (key === 'F11') {
        e.preventDefault();
        moveCursorToRow(Math.floor(pattern.length * 0.5));
        return;
      }
      if (key === 'F12') {
        e.preventDefault();
        moveCursorToRow(Math.floor(pattern.length * 0.75));
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

      // Tab/Shift+Tab: Jump to next/previous track
      if (key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          if (cursor.channelIndex > 0) {
            moveCursorToChannel(cursor.channelIndex - 1);
          }
        } else {
          if (cursor.channelIndex < pattern.channels.length - 1) {
            moveCursorToChannel(cursor.channelIndex + 1);
          }
        }
        return;
      }

      // Alt+Q..I: Jump to track 0-7
      if (e.altKey && ALT_TRACK_MAP_1[keyLower] !== undefined) {
        e.preventDefault();
        const track = ALT_TRACK_MAP_1[keyLower] % pattern.channels.length;
        moveCursorToChannel(track);
        return;
      }

      // Alt+A..K: Jump to track 8-15
      if (e.altKey && ALT_TRACK_MAP_2[keyLower] !== undefined) {
        e.preventDefault();
        const track = ALT_TRACK_MAP_2[keyLower] % pattern.channels.length;
        moveCursorToChannel(track);
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
      // FT2: Insert Mode Toggle
      // ============================================

      // Insert key: Toggle insert/overwrite mode
      if (key === 'Insert') {
        e.preventDefault();
        toggleInsertMode();
        return;
      }

      // ============================================
      // Transpose Selection (Ctrl+Arrow)
      // ============================================

      // Ctrl+Up: Transpose selection up 1 semitone
      if ((e.ctrlKey || e.metaKey) && key === 'ArrowUp' && !e.altKey) {
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

      // Ctrl+Down: Transpose selection down 1 semitone
      if ((e.ctrlKey || e.metaKey) && key === 'ArrowDown' && !e.altKey) {
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

      // Delete: Different behaviors based on modifiers
      if (key === 'Delete') {
        e.preventDefault();
        if (e.shiftKey) {
          // Shift+Del: Delete note, volume and effect
          setCell(cursor.channelIndex, cursor.rowIndex, {
            note: null,
            instrument: null,
            volume: null,
            effect: null,
          });
        } else if (e.ctrlKey || e.metaKey) {
          // Ctrl+Del: Delete volume and effect
          setCell(cursor.channelIndex, cursor.rowIndex, {
            volume: null,
            effect: null,
          });
        } else if (e.altKey) {
          // Alt+Del: Delete effect only
          setCell(cursor.channelIndex, cursor.rowIndex, {
            effect: null,
          });
        } else {
          // Del: Delete note or volume at cursor
          if (cursor.columnType === 'note') {
            setCell(cursor.channelIndex, cursor.rowIndex, { note: null, instrument: null });
          } else if (cursor.columnType === 'volume') {
            setCell(cursor.channelIndex, cursor.rowIndex, { volume: null });
          } else if (cursor.columnType === 'effect') {
            setCell(cursor.channelIndex, cursor.rowIndex, { effect: null });
          } else if (cursor.columnType === 'effect2') {
            setCell(cursor.channelIndex, cursor.rowIndex, { effect2: null });
          } else {
            clearCell(cursor.channelIndex, cursor.rowIndex);
          }
        }
        return;
      }

      // Insert: Insert note at cursor
      if (key === 'Insert') {
        e.preventDefault();
        if (e.shiftKey) {
          // Shift+Ins: Insert line (would need store support)
          insertRow();
        } else {
          insertRow();
        }
        return;
      }

      // Backspace: Delete previous note/line
      if (key === 'Backspace') {
        e.preventDefault();
        if (e.shiftKey) {
          // Shift+Backspace: Delete previous line
          if (cursor.rowIndex > 0) {
            moveCursor('up');
            deleteRow();
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

      // Escape: Clear selection and volume effect prefix
      if (key === 'Escape') {
        e.preventDefault();
        clearSelection();
        volumeEffectPrefixRef.current = null; // Reset volume effect prefix
        return;
      }

      // ============================================
      // 5.3 Miscellaneous
      // ============================================

      // Space: Stop + toggle edit mode (FT2 style)
      if (key === ' ') {
        e.preventDefault();

        // Toggle accent/slide when on those columns (works in both edit and record mode)
        if (cursor.columnType === 'accent') {
          const currentCell = pattern.channels[cursor.channelIndex].rows[cursor.rowIndex];
          setCell(cursor.channelIndex, cursor.rowIndex, { accent: !currentCell.accent });
          return;
        }
        if (cursor.columnType === 'slide') {
          const currentCell = pattern.channels[cursor.channelIndex].rows[cursor.rowIndex];
          setCell(cursor.channelIndex, cursor.rowIndex, { slide: !currentCell.slide });
          return;
        }

        // Space = Stop playback
        if (isPlaying) {
          stop();
        }
        return;
      }

      // Enter: Toggle accent/slide when on those columns
      if (key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        if (cursor.columnType === 'accent') {
          e.preventDefault();
          const currentCell = pattern.channels[cursor.channelIndex].rows[cursor.rowIndex];
          setCell(cursor.channelIndex, cursor.rowIndex, { accent: !currentCell.accent });
          return;
        }
        if (cursor.columnType === 'slide') {
          e.preventDefault();
          const currentCell = pattern.channels[cursor.channelIndex].rows[cursor.rowIndex];
          setCell(cursor.channelIndex, cursor.rowIndex, { slide: !currentCell.slide });
          return;
        }
      }

      // Ctrl+Enter: Play song
      if (key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        play();
        return;
      }

      // CapsLock: Enter keyoff note "==="
      if (key === 'CapsLock') {
        e.preventDefault();
        if (cursor.columnType === 'note') {
          // When recording during playback, enter at the current playback row
          const targetRow = (recordMode && isPlaying) ? playbackRow : cursor.rowIndex;
          setCell(cursor.channelIndex, targetRow, { note: '===' });
          // Always advance cursor by editStep after note entry (unless during playback)
          if (editStep > 0 && !isPlaying) {
            const newRow = Math.min(pattern.length - 1, cursor.rowIndex + editStep);
            moveCursorToRow(newRow);
          }
        }
        return;
      }

      // F1-F7: Select octave 1-7
      if (key >= 'F1' && key <= 'F7') {
        e.preventDefault();
        const octave = parseInt(key.substring(1));
        setCurrentOctave(octave);
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
      // Volume Effect Prefix Keys (FT2-style)
      // MUST come before note entry to prevent conflicts
      // ============================================

      // Volume effect prefix keys (only work in volume column)
      if (cursor.columnType === 'volume' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.repeat) {
        const upperKey = key.toUpperCase();

        // Check if we're waiting for a parameter after a prefix
        if (volumeEffectPrefixRef.current !== null && HEX_DIGITS_ALL.includes(key)) {
          e.preventDefault();
          const hexDigit = upperKey;
          const highNibble = volumeEffectPrefixRef.current;
          const lowNibble = parseInt(hexDigit, 16);
          const volumeEffect = (highNibble << 4) | lowNibble;

          setCell(cursor.channelIndex, cursor.rowIndex, { volume: volumeEffect });
          volumeEffectPrefixRef.current = null; // Reset prefix state

          // Advance cursor
          if (editStep > 0) {
            moveCursor(0, editStep);
          }
          return;
        }

        // Prefix key pressed
        const prefixMap: Record<string, number> = {
          'V': 0x6, // Volume slide down
          'U': 0x7, // Volume slide up
          'P': 0xC, // Set panning
          'H': 0xB, // Vibrato
          'G': 0xF, // Porta to note
        };

        if (prefixMap[upperKey] !== undefined) {
          e.preventDefault();
          volumeEffectPrefixRef.current = prefixMap[upperKey];
          return;
        }
      }

      // Reset volume effect prefix if we leave volume column or press modifier keys
      if (cursor.columnType !== 'volume' || (e.altKey || e.ctrlKey || e.metaKey)) {
        volumeEffectPrefixRef.current = null;
      }

      // ============================================
      // Note Entry (Piano Keys)
      // ============================================

      // Check if this is a note key
      // IMPORTANT: Ignore key repeats to prevent retriggering while holding a key
      if (NOTE_MAP[keyLower] && !e.altKey && !e.ctrlKey && !e.metaKey && !e.repeat) {
        e.preventDefault();
        const { note, octaveOffset } = NOTE_MAP[keyLower];
        const octave = currentOctave + octaveOffset;

        // Preview note (pass key for tracking held notes)
        previewNote(note, octave, keyLower);

        // Enter note if on note column
        if (cursor.columnType === 'note') {
          enterNote(note, octave);
        }
        return;
      }

      // Ignore repeat events for note keys even without triggering new note
      if (NOTE_MAP[keyLower] && e.repeat) {
        e.preventDefault();
        return;
      }

      // ============================================
      // Hex Entry for Instrument/Volume/Effect
      // ============================================

      // Hex digit entry for instrument, volume, effect columns
      if (
        HEX_DIGITS_ALL.includes(key) &&
        !e.altKey && !e.ctrlKey && !e.metaKey &&
        (cursor.columnType === 'instrument' ||
          cursor.columnType === 'volume' ||
          cursor.columnType === 'effect' ||
          cursor.columnType === 'effect2')
      ) {
        // Skip if waiting for volume effect prefix parameter (already handled above)
        if (cursor.columnType === 'volume' && volumeEffectPrefixRef.current !== null) {
          return;
        }

        // Skip if it's a note key (numbers 2,3,5,6,7,9,0 are used for notes)
        const isNoteKey = ['2', '3', '5', '6', '7', '9', '0'].includes(key);
        if (isNoteKey && cursor.columnType !== 'instrument' &&
            cursor.columnType !== 'volume' && cursor.columnType !== 'effect' && cursor.columnType !== 'effect2') {
          return;
        }

        e.preventDefault();
        const hexDigit = key.toUpperCase();
        const currentCell = pattern.channels[cursor.channelIndex].rows[cursor.rowIndex];

        if (cursor.columnType === 'instrument') {
          const currentValue = currentCell.instrument || 0;
          const currentHex = currentValue.toString(16).toUpperCase().padStart(2, '0');
          const newHex = (currentHex[1] + hexDigit).padStart(2, '0');
          const newValue = parseInt(newHex, 16);
          setCell(cursor.channelIndex, cursor.rowIndex, { instrument: newValue });
        } else if (cursor.columnType === 'volume') {
          const currentValue = currentCell.volume || 0;
          const currentHex = currentValue.toString(16).toUpperCase().padStart(2, '0');
          const newHex = (currentHex[1] + hexDigit).padStart(2, '0');
          const newValue = Math.min(0x40, parseInt(newHex, 16));
          setCell(cursor.channelIndex, cursor.rowIndex, { volume: newValue });
        } else if (cursor.columnType === 'effect') {
          const currentValue = currentCell.effect || '...';
          const currentStr = currentValue === '...' ? '000' : currentValue.padEnd(3, '0');
          const newStr = (currentStr[1] + currentStr[2] + hexDigit).slice(-3);
          setCell(cursor.channelIndex, cursor.rowIndex, { effect: newStr });
        } else if (cursor.columnType === 'effect2') {
          const currentValue = currentCell.effect2 || '...';
          const currentStr = currentValue === '...' ? '000' : currentValue.padEnd(3, '0');
          const newStr = (currentStr[1] + currentStr[2] + hexDigit).slice(-3);
          setCell(cursor.channelIndex, cursor.rowIndex, { effect2: newStr });
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
      editStep,
      moveCursor,
      moveCursorToRow,
      moveCursorToChannel,
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
      previewNote,
      enterNote,
      insertRow,
      deleteRow,
      transposeSelection,
      interpolateSelection,
      humanizeSelection,
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
