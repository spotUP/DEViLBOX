/**
 * SF2KeyboardHandler — Keyboard input for SID Factory II pattern editor.
 *
 * Handles:
 * - QWERTY piano note entry (2 octaves)
 * - Hex value entry for instrument/command columns
 * - Navigation (arrows, pgup/pgdn, home/end)
 * - Order list position changes (F1/F2 or ctrl+arrows)
 *
 * Attaches to window keydown; only active when SF2 editor is focused.
 */

import { useEffect, useCallback } from 'react';
import { useSF2Store } from '@/stores/useSF2Store';
import type { SF2SeqEvent } from '@/stores/useSF2Store';

// QWERTY → note offset (C-based, relative to current octave)
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

/** Get the sequence index for the current track at the current order position */
function getCurrentSeqIdx(state: ReturnType<typeof useSF2Store.getState>, track: number): number | null {
  const ol = state.orderLists[track];
  if (!ol || state.orderCursor >= ol.entries.length) return null;
  return ol.entries[state.orderCursor].seqIdx;
}

export function useSF2KeyboardHandler(active: boolean) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!active) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const state = useSF2Store.getState();
    const { cursor, editStep, currentOctave, currentInstrument, orderCursor, orderLists } = state;
    const maxOlLen = Math.max(1, ...orderLists.map(ol => ol.entries.length));

    // ── Transport ──
    if (e.key === ' ') {
      e.preventDefault();
      state.setPlaying(!state.playing);
      return;
    }

    // ── Order list position ──
    if (e.key === 'F1') {
      e.preventDefault();
      state.setOrderCursor(Math.max(0, orderCursor - 1));
      return;
    }
    if (e.key === 'F2') {
      e.preventDefault();
      state.setOrderCursor(Math.min(maxOlLen - 1, orderCursor + 1));
      return;
    }

    // ── Octave up/down ──
    if (e.key === 'F3') { e.preventDefault(); state.setCurrentOctave(currentOctave - 1); return; }
    if (e.key === 'F4') { e.preventDefault(); state.setCurrentOctave(currentOctave + 1); return; }

    // ── Navigation ──
    const seqIdx = getCurrentSeqIdx(state, cursor.channel);
    const seq = seqIdx !== null ? state.sequences.get(seqIdx) : null;
    const maxRow = seq ? seq.length - 1 : 63;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        state.setCursor({ row: Math.max(0, cursor.row - (e.ctrlKey ? 8 : 1)) });
        return;
      case 'ArrowDown':
        e.preventDefault();
        state.setCursor({ row: Math.min(maxRow, cursor.row + (e.ctrlKey ? 8 : 1)) });
        return;
      case 'ArrowLeft':
        e.preventDefault();
        if (cursor.column > 0) {
          state.setCursor({ column: cursor.column - 1, digit: 0 });
        } else if (cursor.channel > 0) {
          state.setCursor({ channel: cursor.channel - 1, column: 2, digit: 0 });
        }
        return;
      case 'ArrowRight':
        e.preventDefault();
        if (cursor.column < 2) {
          state.setCursor({ column: cursor.column + 1, digit: 0 });
        } else if (cursor.channel < state.trackCount - 1) {
          state.setCursor({ channel: cursor.channel + 1, column: 0, digit: 0 });
        }
        return;
      case 'PageUp':
        e.preventDefault();
        state.setCursor({ row: Math.max(0, cursor.row - 16) });
        return;
      case 'PageDown':
        e.preventDefault();
        state.setCursor({ row: Math.min(maxRow, cursor.row + 16) });
        return;
      case 'Home':
        e.preventDefault();
        state.setCursor({ row: 0 });
        return;
      case 'End':
        e.preventDefault();
        state.setCursor({ row: maxRow });
        return;
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          state.setCursor({ channel: Math.max(0, cursor.channel - 1), column: 0, digit: 0 });
        } else {
          state.setCursor({ channel: Math.min(state.trackCount - 1, cursor.channel + 1), column: 0, digit: 0 });
        }
        return;
    }

    // ── Delete ──
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (seqIdx === null) return;
      const field: keyof SF2SeqEvent = cursor.column === 0 ? 'note' : cursor.column === 1 ? 'instrument' : 'command';
      state.setSequenceCell(seqIdx, cursor.row, field, 0);
      state.setCursor({ row: Math.min(maxRow, cursor.row + editStep) });
      return;
    }

    // ── Note entry (column 0) ──
    if (cursor.column === 0 && !e.ctrlKey && !e.metaKey) {
      const noteOffset = PIANO_MAP[e.key.toLowerCase()];
      if (noteOffset !== undefined) {
        e.preventDefault();
        if (seqIdx === null) return;
        const noteVal = 1 + currentOctave * 12 + noteOffset; // SF2: 1-111 = notes
        state.setSequenceCell(seqIdx, cursor.row, 'note', Math.min(111, noteVal));
        // Also set instrument if configured
        if (currentInstrument > 0) {
          state.setSequenceCell(seqIdx, cursor.row, 'instrument', currentInstrument);
        }
        state.setCursor({ row: Math.min(maxRow, cursor.row + editStep) });
        return;
      }
    }

    // ── Hex entry (columns 1-2: instrument, command) ──
    if (cursor.column > 0 && !e.ctrlKey && !e.metaKey) {
      const h = hexVal(e.key);
      if (h !== null) {
        e.preventDefault();
        if (seqIdx === null) return;
        const field: keyof SF2SeqEvent = cursor.column === 1 ? 'instrument' : 'command';
        const current = seq && cursor.row < seq.length ? seq[cursor.row][field] : 0;

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
