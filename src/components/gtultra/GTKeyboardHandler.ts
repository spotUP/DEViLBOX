/**
 * GTKeyboardHandler — Keyboard input for GoatTracker Ultra pattern editor.
 *
 * Handles:
 * - QWERTY piano note entry (2 octaves)
 * - Hex value entry for instrument/command/data columns
 * - Navigation (arrows, pgup/pgdn, home/end)
 * - Transport (space, F1-F3)
 * - Edit operations (delete, insert)
 *
 * Attaches to window keydown; should only be active when GT editor is focused.
 */

import { useEffect, useCallback } from 'react';
import { useGTUltraStore } from '../../stores/useGTUltraStore';
import { gtCopy, gtPaste, gtDelete, gtTranspose, gtInsertRow, gtDeleteRow, gtInterpolate } from './GTBlockOperations';

// QWERTY → note offset (C-based, relative to current octave)
const PIANO_MAP: Record<string, number> = {
  // Lower octave
  'z': 0,  's': 1,  'x': 2,  'd': 3,  'c': 4,  'v': 5,
  'g': 6,  'b': 7,  'h': 8,  'n': 9,  'j': 10, 'm': 11,
  // Upper octave
  'q': 12, '2': 13, 'w': 14, '3': 15, 'e': 16, 'r': 17,
  '5': 18, 't': 19, '6': 20, 'y': 21, '7': 22, 'u': 23,
  'i': 24, '9': 25, 'o': 26, '0': 27, 'p': 28,
};

// Hex char → value
function hexVal(char: string): number | null {
  const c = char.toLowerCase();
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  if (c >= 'a' && c <= 'f') return c.charCodeAt(0) - 87;
  return null;
}

export function useGTKeyboardHandler(active: boolean) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!active) return;
    // Don't intercept when in text inputs
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const state = useGTUltraStore.getState();
    const { cursor, editStep, currentOctave, currentInstrument, recordMode, engine } = state;

    // --- Transport ---
    if (e.key === ' ') {
      e.preventDefault();
      if (state.playing) {
        engine?.stop();
        state.setPlaying(false);
      } else {
        engine?.play();
        state.setPlaying(true);
      }
      return;
    }

    // F1 = play from start, F2 = play from cursor, F3 = stop
    if (e.key === 'F1') {
      e.preventDefault();
      engine?.play(state.currentSong, 0, 0);
      state.setPlaying(true);
      return;
    }
    if (e.key === 'F2') {
      e.preventDefault();
      engine?.play(state.currentSong, state.playbackPos.position, cursor.row);
      state.setPlaying(true);
      return;
    }
    if (e.key === 'F3') {
      e.preventDefault();
      engine?.stop();
      state.setPlaying(false);
      return;
    }

    // Octave up/down: F9/F10
    if (e.key === 'F9') {
      e.preventDefault();
      state.setCurrentOctave(Math.max(0, currentOctave - 1));
      return;
    }
    if (e.key === 'F10') {
      e.preventDefault();
      state.setCurrentOctave(Math.min(7, currentOctave + 1));
      return;
    }

    // --- Note column: piano keys ---
    if (cursor.column === 0 && !e.ctrlKey && !e.metaKey) {
      const noteOffset = PIANO_MAP[e.key.toLowerCase()];
      if (noteOffset !== undefined) {
        e.preventDefault();
        const noteVal = currentOctave * 12 + noteOffset + 1; // 1-based notes
        if (noteVal >= 1 && noteVal <= 95) {
          // Jam: always play the note
          engine?.jamNoteOn(cursor.channel, noteVal, currentInstrument);

          // Record: write to pattern
          if (recordMode) {
            // TODO: write to WASM pattern via engine
            // For now, advance cursor by editStep
            state.setCursor({ row: Math.min(cursor.row + editStep, state.patternLength) });
          }
        }
        return;
      }

      // Key-off (1 key or Delete in note column)
      if (e.key === '1' || e.key === 'Delete') {
        e.preventDefault();
        if (recordMode) {
          // Write key-off (0xBE) to pattern
          state.setCursor({ row: Math.min(cursor.row + editStep, state.patternLength) });
        }
        return;
      }
    }

    // --- Hex columns: instrument, command, data ---
    if (cursor.column >= 1 && cursor.column <= 3 && !e.ctrlKey && !e.metaKey) {
      const hv = hexVal(e.key);
      if (hv !== null) {
        e.preventDefault();
        if (recordMode) {
          // TODO: modify the hex digit in WASM pattern
          // digit 0 = high nibble, digit 1 = low nibble
          const nextDigit = cursor.digit === 0 ? 1 : 0;
          if (cursor.digit === 1) {
            // After entering both digits, advance row
            state.setCursor({
              digit: 0,
              row: Math.min(cursor.row + editStep, state.patternLength),
            });
          } else {
            state.setCursor({ digit: nextDigit });
          }
        }
        return;
      }
    }

    // --- Block operations (Ctrl/Cmd) ---
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'c':
          e.preventDefault();
          gtCopy();
          return;
        case 'v':
          e.preventDefault();
          gtPaste();
          return;
        case 'x':
          e.preventDefault();
          gtCopy();
          gtDelete();
          return;
        case 'z':
          e.preventDefault();
          // TODO: Undo via WASM engine (gt_undo)
          return;
        case 'y':
          e.preventDefault();
          // TODO: Redo via WASM engine (gt_redo)
          return;
        case 'i':
          e.preventDefault();
          gtInterpolate();
          return;
      }

      // Ctrl+Shift+Up/Down = transpose
      if (e.shiftKey && e.key === 'ArrowUp') {
        e.preventDefault();
        gtTranspose(1);
        return;
      }
      if (e.shiftKey && e.key === 'ArrowDown') {
        e.preventDefault();
        gtTranspose(-1);
        return;
      }
      // Ctrl+Up/Down = transpose by octave
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        gtTranspose(12);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        gtTranspose(-12);
        return;
      }
      return;
    }

    // --- Navigation ---
    if (!e.ctrlKey && !e.metaKey) {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          state.moveCursor('up');
          return;
        case 'ArrowDown':
          e.preventDefault();
          state.moveCursor('down');
          return;
        case 'ArrowLeft':
          e.preventDefault();
          state.moveCursor('left');
          return;
        case 'ArrowRight':
          e.preventDefault();
          state.moveCursor('right');
          return;
        case 'PageUp':
          e.preventDefault();
          state.setCursor({ row: Math.max(0, cursor.row - 16) });
          return;
        case 'PageDown':
          e.preventDefault();
          state.setCursor({ row: Math.min(state.patternLength, cursor.row + 16) });
          return;
        case 'Home':
          e.preventDefault();
          state.setCursor({ row: 0 });
          return;
        case 'End':
          e.preventDefault();
          state.setCursor({ row: state.patternLength });
          return;
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) {
            state.setCursor({ channel: Math.max(0, cursor.channel - 1), column: 0, digit: 0 });
          } else {
            const maxCh = state.sidCount * 3 - 1;
            state.setCursor({ channel: Math.min(maxCh, cursor.channel + 1), column: 0, digit: 0 });
          }
          return;
      }
    }

    // --- Edit operations ---
    if (e.key === 'Insert') {
      e.preventDefault();
      gtInsertRow();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      gtDeleteRow();
      return;
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, handleKeyDown]);
}
