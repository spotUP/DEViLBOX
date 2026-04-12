/**
 * CheeseCutterKeyboardHandler — Keyboard input for CheeseCutter pattern editor.
 *
 * Key bindings:
 *
 * Transport:
 *   F1          = Toggle play
 *   Escape      = Stop
 *
 * Octave:
 *   F3          = Octave down
 *   F4          = Octave up
 *
 * Navigation:
 *   Arrow keys  = Move cursor
 *   Tab         = Next channel
 *   Shift+Tab   = Previous channel
 *
 * Editing:
 *   Space       = Clear cell under cursor
 *   Delete      = Delete row + shrink
 *   Insert      = Insert blank row
 *   Backspace   = Clear row + move up
 *
 * Note input:
 *   Z-M = C to B in current octave (lower row)
 *   Q-P = C to B in current octave + 1 (upper row)
 *
 * Hex entry for instrument/command columns (0-9, A-F).
 */

import { useEffect, useCallback } from 'react';
import { useCheeseCutterStore } from '@/stores/useCheeseCutterStore';
import type { CCSequenceRow } from '@/stores/useCheeseCutterStore';

// QWERTY -> note offset (C-based, relative to current octave)
const PIANO_MAP: Record<string, number> = {
  'z': 0,  's': 1,  'x': 2,  'd': 3,  'c': 4,  'v': 5,
  'g': 6,  'b': 7,  'h': 8,  'n': 9,  'j': 10, 'm': 11,
  'q': 12, '2': 13, 'w': 14, '3': 15, 'e': 16, 'r': 17,
  '5': 18, 't': 19, '6': 20, 'y': 21, '7': 22, 'u': 23,
  'i': 24, '9': 25, 'o': 26, '0': 27, 'p': 28,
};

function hexVal(char: string): number | null {
  const c = char.toLowerCase();
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  if (c >= 'a' && c <= 'f') return c.charCodeAt(0) - 87;
  return null;
}

/** Get the sequence index for the current voice at the current order position */
function getCurrentSeqIdx(state: ReturnType<typeof useCheeseCutterStore.getState>, voice: number): number | null {
  const tl = state.trackLists[voice];
  if (!tl || state.orderCursor >= tl.length) return null;
  const entry = tl[state.orderCursor];
  if (entry.isEnd) return null;
  return entry.sequence;
}

export function useCheeseCutterKeyboardHandler(active: boolean) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!active) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const state = useCheeseCutterStore.getState();
    const { cursor, editStep, currentOctave, currentInstrument } = state;
    const mod = e.ctrlKey || e.metaKey;

    // -- Transport: F1=Play toggle, Escape=Stop --
    if (e.key === 'F1' && !mod && !e.shiftKey) {
      e.preventDefault();
      state.setPlaying(!state.playing);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      state.setPlaying(false);
      return;
    }

    // -- Octave: F3/F4 --
    if (e.key === 'F3' && !e.shiftKey && !mod) {
      e.preventDefault();
      state.setCurrentOctave(currentOctave - 1);
      return;
    }
    if (e.key === 'F4' && !e.shiftKey && !mod) {
      e.preventDefault();
      state.setCurrentOctave(currentOctave + 1);
      return;
    }

    // -- Navigation: Tab/Shift+Tab --
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        state.setCursor({ channel: Math.max(0, cursor.channel - 1), column: 0, digit: 0 });
      } else {
        state.setCursor({ channel: Math.min(2, cursor.channel + 1), column: 0, digit: 0 });
      }
      return;
    }

    // -- Data editing needs sequence context --
    const seqIdx = getCurrentSeqIdx(state, cursor.channel);
    const seq = seqIdx !== null && seqIdx < state.sequences.length ? state.sequences[seqIdx] : null;
    const maxRow = seq ? seq.rows.length - 1 : 63;

    // -- Arrow key navigation --
    if (e.key === 'ArrowUp' && !mod && !e.shiftKey) {
      e.preventDefault();
      state.setCursor({ row: Math.max(0, cursor.row - 1) });
      return;
    }
    if (e.key === 'ArrowDown' && !mod && !e.shiftKey) {
      e.preventDefault();
      state.setCursor({ row: Math.min(maxRow, cursor.row + 1) });
      return;
    }
    if (e.key === 'ArrowLeft' && !mod && !e.shiftKey) {
      e.preventDefault();
      if (cursor.column > 0) {
        state.setCursor({ column: cursor.column - 1, digit: 0 });
      } else if (cursor.channel > 0) {
        state.setCursor({ channel: cursor.channel - 1, column: 2, digit: 0 });
      }
      return;
    }
    if (e.key === 'ArrowRight' && !mod && !e.shiftKey) {
      e.preventDefault();
      if (cursor.column < 2) {
        state.setCursor({ column: cursor.column + 1, digit: 0 });
      } else if (cursor.channel < 2) {
        state.setCursor({ channel: cursor.channel + 1, column: 0, digit: 0 });
      }
      return;
    }

    // -- Space = Clear cell under cursor --
    if (e.key === ' ' && !mod && !e.shiftKey) {
      e.preventDefault();
      if (seqIdx !== null) {
        state.eraseEvent(seqIdx, cursor.row);
        state.setCursor({ row: Math.min(maxRow, cursor.row + editStep) });
      }
      return;
    }

    // -- Delete = Delete row + shrink --
    if (e.key === 'Delete' && !mod) {
      e.preventDefault();
      if (seqIdx !== null) {
        state.deleteRow(seqIdx, cursor.row);
        const newMax = seq ? seq.rows.length - 2 : 63;
        if (cursor.row > newMax) state.setCursor({ row: Math.max(0, newMax) });
      }
      return;
    }

    // -- Insert = Insert blank row --
    if (e.key === 'Insert' && !mod) {
      e.preventDefault();
      if (seqIdx !== null) {
        state.insertRow(seqIdx, cursor.row);
      }
      return;
    }

    // -- Backspace = Clear row + move up --
    if (e.key === 'Backspace' && !mod) {
      e.preventDefault();
      if (seqIdx !== null) {
        state.eraseEvent(seqIdx, cursor.row);
        state.setCursor({ row: Math.max(0, cursor.row - 1) });
      }
      return;
    }

    // -- Note entry (column 0 = note) --
    if (cursor.column === 0 && !mod) {
      const noteOffset = PIANO_MAP[e.key.toLowerCase()];
      if (noteOffset !== undefined) {
        e.preventDefault();
        if (seqIdx === null) return;
        // CC note encoding: 3=C-0, 4=C#0, ... (12 per octave starting from 3)
        const noteVal = 3 + currentOctave * 12 + noteOffset;
        if (noteVal < 3 || noteVal > 127) return;
        state.setSequenceCell(seqIdx, cursor.row, 'note', noteVal);
        if (currentInstrument > 0) {
          state.setSequenceCell(seqIdx, cursor.row, 'instrument', currentInstrument);
        }
        state.setCursor({ row: Math.min(maxRow, cursor.row + editStep) });
        return;
      }
    }

    // -- Hex entry (columns 1-2: instrument, command) --
    if (cursor.column > 0 && !mod) {
      const h = hexVal(e.key);
      if (h !== null) {
        e.preventDefault();
        if (seqIdx === null) return;

        const field: keyof CCSequenceRow = cursor.column === 1 ? 'instrument' : 'command';
        const current = seq && cursor.row < seq.rows.length ? seq.rows[cursor.row][field] as number : 0;

        let newVal: number;
        if (cursor.digit === 0) {
          newVal = (h << 4) | (current & 0x0F);
          state.setCursor({ digit: 1 });
        } else {
          newVal = (current & 0xF0) | h;
          state.setCursor({ digit: 0, row: Math.min(maxRow, cursor.row + editStep) });
        }
        state.setSequenceCell(seqIdx, cursor.row, field, newVal);
        return;
      }
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, handleKeyDown]);
}
