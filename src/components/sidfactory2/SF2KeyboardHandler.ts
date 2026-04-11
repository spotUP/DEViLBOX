/**
 * SF2KeyboardHandler — Keyboard input for SID Factory II pattern editor.
 *
 * Key bindings match the original SID Factory II editor (keyhook_setup.cpp):
 *
 * Transport:
 *   F1          = Play (toggle)
 *   Escape      = Stop
 *   Ctrl+P      = Toggle follow play
 *
 * Octave:
 *   F3          = Octave down
 *   F4          = Octave up
 *
 * Transpose:
 *   Shift+F3    = Transpose -1 semitone (marked or full seq)
 *   Shift+F4    = Transpose +1 semitone
 *   Ctrl+F3     = Transpose -12 (octave down)
 *   Ctrl+F4     = Transpose +12 (octave up)
 *
 * Channel mute:
 *   Ctrl+1/2/3  = Toggle mute channel 1/2/3
 *
 * Editing:
 *   Space       = Erase event under cursor (note+inst+cmd → empty)
 *   Ctrl+Space  = Erase entire event line
 *   Shift+Space = Toggle gate (note 0x00 ↔ 0x7E)
 *   Shift+Enter = Toggle tie note (instrument 0x80 ↔ 0x90)
 *   Delete      = Clear value at cursor column only
 *   Ctrl+Delete = Delete row + shrink sequence
 *   Backspace   = Clear row + move up
 *   Ctrl+Bksp   = Delete row + shrink + move up
 *   Insert      = Insert blank row
 *   Ctrl+Shift+Down = Fill gate until next note event
 *   Ctrl+Shift+Up   = Fill gate since previous note event
 *
 * Clipboard:
 *   Ctrl+C      = Copy (marked region or full sequence)
 *   Ctrl+V      = Paste at cursor
 *   Ctrl+Z      = Undo
 *   Ctrl+Shift+Z / Ctrl+Y = Redo
 *
 * Selection:
 *   Shift+Up    = Extend mark upward
 *   Shift+Down  = Extend mark downward
 *
 * Sequence management:
 *   Ctrl+D        = Duplicate & replace sequence
 *   Ctrl+Shift+D  = Duplicate & append sequence (keep original)
 *   Ctrl+B        = Split sequence at cursor
 *   Ctrl+F        = Insert first free sequence
 *   Ctrl+Shift+F  = Insert first empty sequence
 *   Ctrl+L        = Set order loop point (all tracks)
 *   Ctrl+Shift+L  = Set order loop point (current track)
 *
 * Navigation:
 *   Tab / Shift+Tab = Next/prev channel
 *   Ctrl+I      = Set instrument from cursor
 *   Ctrl+O      = Set command from cursor
 *
 * Display:
 *   Ctrl+U      = Toggle hex uppercase/lowercase
 *   Ctrl+N      = Toggle notation mode (Sharp/Flat)
 *   Ctrl+S      = Quick save (export download)
 *
 * Play markers:
 *   Alt+1-8     = Select play marker slot
 *   Ctrl+M      = Set marker at current position
 *   Ctrl+G      = Go to selected marker
 *
 * Hardware:
 *   F9          = Toggle SID model (6581/8580)
 *   Shift+F9    = Toggle region (PAL/NTSC)
 *
 * Sequence tools:
 *   F5          = Resize sequence (prompt for new length)
 *   Shift+F5    = Expand sequence (double length, insert rests)
 *   F6          = Utilities — remove unused sequences
 *
 * Note input applies transposition offset (transpose - 0xA0) so stored
 * values are absolute. Display shows transposed notes.
 *
 * Column order: 0=Instrument, 1=Command, 2=Note (matching original)
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

/** Get the transposition offset for the current track at the current order position.
 *  Matches original: transpose = rawByte - 0xA0 (0xA0 = no transposition) */
function getCurrentTranspose(state: ReturnType<typeof useSF2Store.getState>, track: number): number {
  const ol = state.orderLists[track];
  if (!ol || state.orderCursor >= ol.entries.length) return 0;
  return state.orderLists[track].entries[state.orderCursor].transpose - 0xA0;
}

export function useSF2KeyboardHandler(active: boolean) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!active) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    const state = useSF2Store.getState();
    const { cursor, editStep, currentOctave, currentInstrument } = state;
    const mod = e.ctrlKey || e.metaKey;

    // ── Undo/Redo (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y) ──
    if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); state.undo(); return; }
    if (mod && e.key === 'z' && e.shiftKey) { e.preventDefault(); state.redo(); return; }
    if (mod && e.key === 'y') { e.preventDefault(); state.redo(); return; }

    // ── Transport: F1=Play, Escape=Stop ──
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

    // ── Follow play: Ctrl+P ──
    if (mod && e.key === 'p') { e.preventDefault(); state.setFollowPlay(!state.followPlay); return; }

    // ── Octave: F3/F4 (no modifiers) ──
    if (e.key === 'F3' && !e.shiftKey && !mod) { e.preventDefault(); state.setCurrentOctave(currentOctave - 1); return; }
    if (e.key === 'F4' && !e.shiftKey && !mod) { e.preventDefault(); state.setCurrentOctave(currentOctave + 1); return; }

    // ── Channel mute: Ctrl+1/2/3 ──
    if (mod && !e.altKey && (e.key === '1' || e.key === '2' || e.key === '3')) {
      e.preventDefault();
      const ch = parseInt(e.key) - 1;
      if (ch < state.trackCount) state.toggleChannelMute(ch);
      return;
    }

    // ── Play markers: Alt+1-8 to select slot ──
    if (e.altKey && !mod && !e.shiftKey && e.key >= '1' && e.key <= '8') {
      e.preventDefault();
      state.selectMarker(parseInt(e.key) - 1);
      return;
    }

    // ── Set marker: Ctrl+M ──
    if (mod && e.key === 'm' && !e.shiftKey) {
      e.preventDefault();
      state.setPlayMarker();
      return;
    }

    // ── Goto marker: Ctrl+G ──
    if (mod && e.key === 'g' && !e.shiftKey) {
      e.preventDefault();
      state.gotoPlayMarker();
      return;
    }

    // ── Toggle notation mode: Ctrl+N ──
    if (mod && e.key === 'n' && !e.shiftKey) {
      e.preventDefault();
      state.toggleNotationMode();
      return;
    }

    // ── SID model toggle: F9 (no mod) ──
    if (e.key === 'F9' && !mod && !e.shiftKey) {
      e.preventDefault();
      state.toggleSIDModel();
      return;
    }

    // ── Region toggle: Shift+F9 ──
    if (e.key === 'F9' && e.shiftKey && !mod) {
      e.preventDefault();
      state.toggleRegion();
      return;
    }

    // ── F5 = Resize sequence (prompt for new length) ──
    if (e.key === 'F5' && !mod && !e.shiftKey) {
      e.preventDefault();
      const seqIdx = getCurrentSeqIdx(state, cursor.channel);
      if (seqIdx === null) return;
      const seq = state.sequences.get(seqIdx);
      const currentLen = seq?.length ?? 32;
      const input = window.prompt(`Resize sequence ${seqIdx} (current: ${currentLen} rows)\nNew length (1-1024):`, String(currentLen));
      if (input !== null) {
        const newLen = parseInt(input, 10);
        if (!isNaN(newLen) && newLen >= 1 && newLen <= 1024) {
          state.resizeSequence(seqIdx, newLen);
        }
      }
      return;
    }

    // ── Shift+F5 = Expand sequence (double length, insert rests) ──
    if (e.key === 'F5' && e.shiftKey && !mod) {
      e.preventDefault();
      const seqIdx = getCurrentSeqIdx(state, cursor.channel);
      if (seqIdx !== null) state.expandSequence(seqIdx);
      return;
    }

    // ── F6 = Utilities (remove unused sequences) ──
    if (e.key === 'F6' && !mod && !e.shiftKey) {
      e.preventDefault();
      // Count used vs total sequences
      const usedSet = new Set<number>();
      for (const ol of state.orderLists) {
        for (const entry of ol.entries) usedSet.add(entry.seqIdx);
      }
      const total = state.sequences.size;
      const unused = total - usedSet.size;
      if (unused === 0) {
        window.alert(`All ${total} sequences are in use.`);
      } else {
        const ok = window.confirm(`Found ${unused} unused sequence(s) out of ${total}.\nRemove unused sequences?`);
        if (ok) state.removeUnusedSequences();
      }
      return;
    }

    // ── Set instrument from cursor: Ctrl+I ──
    if (mod && e.key === 'i') {
      e.preventDefault();
      const seqIdx = getCurrentSeqIdx(state, cursor.channel);
      const seq = seqIdx !== null ? state.sequences.get(seqIdx) : null;
      if (seq && cursor.row < seq.length) {
        const inst = seq[cursor.row].instrument;
        if (inst > 0 && inst < 0x80) state.setCurrentInstrument(inst);
      }
      return;
    }

    // ── Set command from cursor: Ctrl+O ──
    if (mod && e.key === 'o') {
      e.preventDefault();
      const seqIdx = getCurrentSeqIdx(state, cursor.channel);
      const seq = seqIdx !== null ? state.sequences.get(seqIdx) : null;
      if (seq && cursor.row < seq.length) {
        const cmd = seq[cursor.row].command;
        if (cmd > 0 && cmd < 0x80) state.setCurrentCommand(cmd);
      }
      return;
    }

    // ── Sequence management ──
    // Ctrl+D = Duplicate & replace sequence
    if (mod && e.key === 'd' && !e.shiftKey) {
      e.preventDefault();
      state.duplicateSequence(cursor.channel, state.orderCursor);
      return;
    }
    // Ctrl+Shift+D = Duplicate & append sequence (keep original, insert copy after)
    if (mod && e.key === 'D' && e.shiftKey) {
      e.preventDefault();
      state.duplicateSequenceAppend(cursor.channel, state.orderCursor);
      return;
    }
    // Ctrl+B = Split sequence at cursor
    if (mod && e.key === 'b') {
      e.preventDefault();
      state.splitSequenceAtRow(cursor.channel, state.orderCursor, cursor.row);
      return;
    }
    // Ctrl+F = Insert first free sequence
    if (mod && e.key === 'f' && !e.shiftKey) {
      e.preventDefault();
      state.insertFirstFreeSequence(cursor.channel, state.orderCursor);
      return;
    }
    // Ctrl+Shift+F = Insert first empty sequence
    if (mod && e.key === 'F' && e.shiftKey) {
      e.preventDefault();
      state.insertFirstEmptySequence(cursor.channel, state.orderCursor);
      return;
    }
    // Ctrl+U = Toggle hex uppercase
    if (mod && e.key === 'u') {
      e.preventDefault();
      state.toggleHexUppercase();
      return;
    }
    // Ctrl+L = Set order loop point (all tracks)
    if (mod && e.key === 'l' && !e.shiftKey) {
      e.preventDefault();
      state.setAllOrderLoopPoints(state.orderCursor);
      return;
    }
    // Ctrl+Shift+L = Set order loop point (current track only)
    if (mod && e.key === 'l' && e.shiftKey) {
      e.preventDefault();
      state.setOrderLoopPoint(cursor.channel, state.orderCursor);
      return;
    }
    // Ctrl+S = Quick save (export)
    if (mod && e.key === 's') {
      e.preventDefault();
      const data = state.exportSF2File();
      if (data) {
        const blob = new Blob([new Uint8Array(data)], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (state.songName || 'untitled') + '.sf2';
        a.click();
        URL.revokeObjectURL(url);
      }
      return;
    }

    // ── Navigation: Tab/Shift+Tab ──
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        state.setCursor({ channel: Math.max(0, cursor.channel - 1), column: 0, digit: 0 });
      } else {
        state.setCursor({ channel: Math.min(state.trackCount - 1, cursor.channel + 1), column: 0, digit: 0 });
      }
      state.clearMark();
      return;
    }

    // ── Data editing needs sequence context ──
    const seqIdx = getCurrentSeqIdx(state, cursor.channel);
    const seq = seqIdx !== null ? state.sequences.get(seqIdx) : null;
    const maxRow = seq ? seq.length - 1 : 63;

    // ── Transpose: Shift+F3/F4 = ±1, Ctrl+F3/F4 = ±12 ──
    if (e.key === 'F3' && e.shiftKey && !mod) {
      e.preventDefault();
      if (seqIdx !== null) {
        const from = state.markStart ?? 0;
        const to = state.markEnd ?? maxRow;
        state.transposeBlock(seqIdx, from, to, -1);
      }
      return;
    }
    if (e.key === 'F4' && e.shiftKey && !mod) {
      e.preventDefault();
      if (seqIdx !== null) {
        const from = state.markStart ?? 0;
        const to = state.markEnd ?? maxRow;
        state.transposeBlock(seqIdx, from, to, 1);
      }
      return;
    }
    if (e.key === 'F3' && mod) {
      e.preventDefault();
      if (seqIdx !== null) {
        const from = state.markStart ?? 0;
        const to = state.markEnd ?? maxRow;
        state.transposeBlock(seqIdx, from, to, -12);
      }
      return;
    }
    if (e.key === 'F4' && mod) {
      e.preventDefault();
      if (seqIdx !== null) {
        const from = state.markStart ?? 0;
        const to = state.markEnd ?? maxRow;
        state.transposeBlock(seqIdx, from, to, 12);
      }
      return;
    }

    // ── Mark block: Shift+Up/Down ──
    if (e.shiftKey && !mod && e.key === 'ArrowUp') {
      e.preventDefault();
      const newRow = Math.max(0, cursor.row - 1);
      if (state.markStart === null) {
        // Start marking from current row
        state.setMark(newRow, cursor.row);
      } else {
        state.setMark(Math.min(state.markStart, newRow), Math.max(state.markEnd ?? cursor.row, cursor.row));
        // Adjust mark bounds to follow cursor
        const ms = state.markStart!;
        const me = state.markEnd!;
        if (cursor.row === ms) state.setMark(newRow, me);
        else state.setMark(ms, newRow);
      }
      state.setCursor({ row: newRow });
      return;
    }
    if (e.shiftKey && !mod && e.key === 'ArrowDown') {
      e.preventDefault();
      const newRow = Math.min(maxRow, cursor.row + 1);
      if (state.markStart === null) {
        state.setMark(cursor.row, newRow);
      } else {
        const ms = state.markStart!;
        const me = state.markEnd!;
        if (cursor.row === me) state.setMark(ms, newRow);
        else state.setMark(newRow, me);
      }
      state.setCursor({ row: newRow });
      return;
    }

    // ── Ctrl+Shift+Down = Toggle gate until next event ──
    if (mod && e.shiftKey && e.key === 'ArrowDown') {
      e.preventDefault();
      if (seqIdx !== null && seq) {
        // Fill gate-on (0x7E) from cursor down until next note event
        for (let r = cursor.row; r <= maxRow; r++) {
          const ev = seq[r];
          if (r > cursor.row && ev.note > 0 && ev.note !== 0x7E) break;
          if (ev.note === 0) {
            state.setSequenceCell(seqIdx, r, 'note', 0x7E);
          }
        }
      }
      return;
    }
    // ── Ctrl+Shift+Up = Toggle gate since previous event ──
    if (mod && e.shiftKey && e.key === 'ArrowUp') {
      e.preventDefault();
      if (seqIdx !== null && seq) {
        for (let r = cursor.row; r >= 0; r--) {
          const ev = seq[r];
          if (r < cursor.row && ev.note > 0 && ev.note !== 0x7E) break;
          if (ev.note === 0) {
            state.setSequenceCell(seqIdx, r, 'note', 0x7E);
          }
        }
      }
      return;
    }

    // ── Space = Erase event under cursor ──
    if (e.key === ' ' && !mod && !e.shiftKey) {
      e.preventDefault();
      if (seqIdx !== null) {
        state.eraseEvent(seqIdx, cursor.row);
        state.setCursor({ row: Math.min(maxRow, cursor.row + editStep) });
      }
      return;
    }

    // ── Ctrl+Space = Erase event line ──
    if (e.key === ' ' && mod && !e.shiftKey) {
      e.preventDefault();
      if (seqIdx !== null) {
        state.eraseEventLine(seqIdx, cursor.row);
        state.setCursor({ row: Math.min(maxRow, cursor.row + editStep) });
      }
      return;
    }

    // ── Shift+Space = Toggle gate (note 0x00 ↔ 0x7E) ──
    if (e.key === ' ' && e.shiftKey && !mod) {
      e.preventDefault();
      if (seqIdx !== null && seq && cursor.row < seq.length) {
        const curNote = seq[cursor.row].note;
        const newNote = (curNote === 0) ? 0x7E : (curNote === 0x7E) ? 0 : curNote;
        state.setSequenceCell(seqIdx, cursor.row, 'note', newNote);
        state.setCursor({ row: Math.min(maxRow, cursor.row + editStep) });
      }
      return;
    }

    // ── Shift+Enter = Toggle tie note (instrument 0x80 ↔ 0x90) ──
    if (e.key === 'Enter' && e.shiftKey && !mod) {
      e.preventDefault();
      if (seqIdx !== null && seq && cursor.row < seq.length) {
        const curInst = seq[cursor.row].instrument;
        const newInst = (curInst === 0x80) ? 0x90 : (curInst === 0x90) ? 0x80 : curInst;
        state.setSequenceCell(seqIdx, cursor.row, 'instrument', newInst);
        state.setCursor({ row: Math.min(maxRow, cursor.row + editStep) });
      }
      return;
    }

    // ── Clipboard: Ctrl+C/V (uses mark region if active, else full seq) ──
    if (mod && e.key === 'c' && !e.shiftKey) {
      e.preventDefault();
      if (seqIdx !== null) {
        const from = state.markStart ?? 0;
        const to = state.markEnd ?? maxRow;
        state.copyBlock(seqIdx, from, to);
      }
      return;
    }
    if (mod && e.key === 'v' && !e.shiftKey) {
      e.preventDefault();
      if (seqIdx !== null) state.pasteBlock(seqIdx, cursor.row);
      return;
    }

    // ── Insert/Delete ──
    if (e.key === 'Insert' && !mod) {
      e.preventDefault();
      if (seqIdx !== null) state.insertRow(seqIdx, cursor.row);
      return;
    }
    // Ctrl+Delete = delete row + shrink
    if (e.key === 'Delete' && mod) {
      e.preventDefault();
      if (seqIdx !== null) {
        state.deleteRow(seqIdx, cursor.row);
        const newMax = seq ? seq.length - 2 : 63;
        if (cursor.row > newMax) state.setCursor({ row: Math.max(0, newMax) });
      }
      return;
    }
    // Delete = clear value at cursor column
    if (e.key === 'Delete' && !mod) {
      e.preventDefault();
      if (seqIdx === null) return;
      // Col 0=instrument, 1=command, 2=note
      const field: keyof SF2SeqEvent = cursor.column === 0 ? 'instrument' : cursor.column === 1 ? 'command' : 'note';
      const emptyVal = cursor.column === 2 ? 0 : 0x80;
      state.setSequenceCell(seqIdx, cursor.row, field, emptyVal);
      return;
    }
    // Ctrl+Backspace = delete row + shrink + move up
    if (e.key === 'Backspace' && mod) {
      e.preventDefault();
      if (seqIdx !== null) {
        state.deleteRow(seqIdx, cursor.row);
        const newMax = seq ? seq.length - 2 : 63;
        state.setCursor({ row: Math.max(0, Math.min(cursor.row - 1, newMax)) });
      }
      return;
    }
    // Backspace = clear row + move up
    if (e.key === 'Backspace' && !mod) {
      e.preventDefault();
      if (seqIdx !== null) {
        state.eraseEvent(seqIdx, cursor.row);
        state.setCursor({ row: Math.max(0, cursor.row - 1) });
      }
      return;
    }

    // ── Note entry (column 2 = note) ──
    if (cursor.column === 2 && !mod) {
      const noteOffset = PIANO_MAP[e.key.toLowerCase()];
      if (noteOffset !== undefined) {
        e.preventDefault();
        if (seqIdx === null) return;
        // Subtract transposition so stored value is absolute (matches original)
        const transpose = getCurrentTranspose(state, cursor.channel);
        const noteVal = 1 + currentOctave * 12 + noteOffset - transpose;
        if (noteVal < 1 || noteVal >= 0x60) return; // out of range after transpose
        state.setSequenceCell(seqIdx, cursor.row, 'note', noteVal);
        if (currentInstrument > 0) {
          state.setSequenceCell(seqIdx, cursor.row, 'instrument', currentInstrument);
        }
        state.setCursor({ row: Math.min(maxRow, cursor.row + editStep) });
        return;
      }
    }

    // ── Hex entry (columns 0-1: instrument, command) ──
    if (cursor.column < 2 && !mod) {
      const h = hexVal(e.key);
      if (h !== null) {
        e.preventDefault();
        if (seqIdx === null) return;

        // Validate: instrument first digit must be 0-1 (max 0x1F=31)
        // Command first digit must be 0-3 (max 0x3F=63)
        if (cursor.digit === 0) {
          if (cursor.column === 0 && h > 1) return; // instrument: reject >1
          if (cursor.column === 1 && h > 3) return; // command: reject >3
        }

        const field: keyof SF2SeqEvent = cursor.column === 0 ? 'instrument' : 'command';
        const current = seq && cursor.row < seq.length ? seq[cursor.row][field] : 0;

        let newVal: number;
        if (cursor.digit === 0) {
          newVal = (h << 4) | (current & 0x0F);
          state.setCursor({ digit: 1 });
        } else {
          newVal = (current & 0xF0) | h;
          // Validate combined value: instrument max 0x1F, command max 0x3F
          if (cursor.column === 0 && newVal > 0x1F) return;
          if (cursor.column === 1 && newVal > 0x3F) return;
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
