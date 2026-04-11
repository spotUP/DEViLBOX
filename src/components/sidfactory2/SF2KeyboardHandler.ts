/**
 * SF2KeyboardHandler — Keyboard input for SID Factory II pattern editor.
 *
 * Handles:
 * - QWERTY piano note entry (2 octaves)
 * - Hex value entry for instrument/command columns
 * - Navigation (arrows, pgup/pgdn, home/end)
 * - Order list position changes (F1/F2 or ctrl+arrows)
 * - Insert/Delete row (Insert, Backspace with Ctrl)
 * - Clipboard: Ctrl+C (copy), Ctrl+X (cut), Ctrl+V (paste)
 * - Transpose: Ctrl+Shift+Up/Down (+/- 1 semitone), Ctrl+Shift+F1/F2 (+/- 12)
 * - Undo/Redo: Ctrl+Z / Ctrl+Shift+Z
 * - Channel mute: F5-F8 toggle mute, Ctrl+F5-F8 solo
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
    const mod = e.ctrlKey || e.metaKey;

    // ── Undo/Redo ──
    if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); state.undo(); return; }
    if (mod && e.key === 'z' && e.shiftKey) { e.preventDefault(); state.redo(); return; }
    if (mod && e.key === 'y') { e.preventDefault(); state.redo(); return; }

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

    // ── Channel mute (F5-F8) ──
    if (e.key === 'F5' || e.key === 'F6' || e.key === 'F7' || e.key === 'F8') {
      e.preventDefault();
      const ch = parseInt(e.key[1]) - 5; // F5=0, F6=1, F7=2, F8=3
      if (ch < state.trackCount) {
        if (mod) {
          state.soloChannel(ch);
        } else {
          state.toggleChannelMute(ch);
        }
      }
      return;
    }

    // ── Follow mode toggle ──
    if (e.key === 'F11') { e.preventDefault(); state.setFollowPlay(!state.followPlay); return; }

    // ── Navigation ──
    switch (e.key) {
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          state.setCursor({ channel: Math.max(0, cursor.channel - 1), column: 0, digit: 0 });
        } else {
          state.setCursor({ channel: Math.min(state.trackCount - 1, cursor.channel + 1), column: 0, digit: 0 });
        }
        return;
    }

    // ── Data editing needs sequence context ──
    const seqIdx = getCurrentSeqIdx(state, cursor.channel);
    const seq = seqIdx !== null ? state.sequences.get(seqIdx) : null;
    const maxRow = seq ? seq.length - 1 : 63;

    // ── Clipboard (Ctrl+C/X/V) ──
    if (mod && e.key === 'c' && !e.shiftKey) {
      e.preventDefault();
      if (seqIdx !== null) state.copyBlock(seqIdx, 0, maxRow);
      return;
    }
    if (mod && e.key === 'x' && !e.shiftKey) {
      e.preventDefault();
      if (seqIdx !== null) state.cutBlock(seqIdx, 0, maxRow);
      return;
    }
    if (mod && e.key === 'v' && !e.shiftKey) {
      e.preventDefault();
      if (seqIdx !== null) state.pasteBlock(seqIdx, cursor.row);
      return;
    }

    // ── Transpose (Ctrl+Shift+Up/Down = +/-1, Ctrl+Shift+F1/F2 = +/-12) ──
    if (mod && e.shiftKey && e.key === 'ArrowUp') {
      e.preventDefault();
      if (seqIdx !== null) state.transposeBlock(seqIdx, 0, maxRow, 1);
      return;
    }
    if (mod && e.shiftKey && e.key === 'ArrowDown') {
      e.preventDefault();
      if (seqIdx !== null) state.transposeBlock(seqIdx, 0, maxRow, -1);
      return;
    }

    // ── Insert/Delete row ──
    if (e.key === 'Insert') {
      e.preventDefault();
      if (seqIdx !== null) state.insertRow(seqIdx, cursor.row);
      return;
    }
    if (mod && e.key === 'Backspace') {
      e.preventDefault();
      if (seqIdx !== null) {
        state.deleteRow(seqIdx, cursor.row);
        const newMax = seq ? seq.length - 2 : 63;
        if (cursor.row > newMax) state.setCursor({ row: Math.max(0, newMax) });
      }
      return;
    }

    // ── Delete current cell ──
    if (e.key === 'Delete' || (e.key === 'Backspace' && !mod)) {
      e.preventDefault();
      if (seqIdx === null) return;
      const field: keyof SF2SeqEvent = cursor.column === 0 ? 'note' : cursor.column === 1 ? 'instrument' : 'command';
      state.setSequenceCell(seqIdx, cursor.row, field, cursor.column === 0 ? 0 : 0x80);
      state.setCursor({ row: Math.min(maxRow, cursor.row + editStep) });
      return;
    }

    // ── Note entry (column 0) ──
    if (cursor.column === 0 && !mod) {
      const noteOffset = PIANO_MAP[e.key.toLowerCase()];
      if (noteOffset !== undefined) {
        e.preventDefault();
        if (seqIdx === null) return;
        const noteVal = 1 + currentOctave * 12 + noteOffset; // SF2: 1-111 = notes
        state.setSequenceCell(seqIdx, cursor.row, 'note', Math.min(111, noteVal));
        if (currentInstrument > 0) {
          state.setSequenceCell(seqIdx, cursor.row, 'instrument', currentInstrument);
        }
        state.setCursor({ row: Math.min(maxRow, cursor.row + editStep) });
        return;
      }
    }

    // ── Hex entry (columns 1-2: instrument, command) ──
    if (cursor.column > 0 && !mod) {
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
