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
        const FIRSTNOTE = 0x60; // GT note base offset (96)
        const noteVal = FIRSTNOTE + currentOctave * 12 + noteOffset;
        if (noteVal >= FIRSTNOTE && noteVal <= 0xBC) {
          // Jam: play the note through the SID engine
          engine?.jamNoteOn(cursor.channel, noteVal, currentInstrument);

          // Record: write to pattern via WASM
          if (recordMode) {
            const orderData = state.orderData[cursor.channel];
            const patIdx = orderData ? orderData[state.playbackPos.position] : 0;
            engine?.setPatternCell(patIdx, cursor.row, 0, noteVal);
            engine?.setPatternCell(patIdx, cursor.row, 1, currentInstrument);
            engine?.checkpointUndo(); // Finalize undo step
            // Refresh pattern data after edit
            state.refreshPatternData(patIdx);
            state.setCursor({ row: Math.min(cursor.row + editStep, state.patternLength) });
          }
        }
        return;
      }

      // Key-off (1 key or Delete in note column)
      if (e.key === '1' || e.key === 'Delete') {
        e.preventDefault();
        if (recordMode) {
          const orderData = state.orderData[cursor.channel];
          const patIdx = orderData ? orderData[state.playbackPos.position] : 0;
          engine?.setPatternCell(patIdx, cursor.row, 0, 0xBE);
          state.refreshPatternData(patIdx);
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
          // Read current cell value, modify the appropriate nibble, write back
          const orderData = state.orderData[cursor.channel];
          const patIdx = orderData ? orderData[state.playbackPos.position] : 0;
          const pat = state.patternData.get(patIdx);
          const col = cursor.column; // 1=instrument, 2=command, 3=data
          let currentVal = 0;
          if (pat && cursor.row < pat.length) {
            currentVal = pat.data[cursor.row * 4 + col];
          }
          // Apply hex digit
          const newVal = cursor.digit === 0
            ? (hv << 4) | (currentVal & 0x0F)
            : (currentVal & 0xF0) | hv;
          engine?.setPatternCell(patIdx, cursor.row, col, newVal);
          state.refreshPatternData(patIdx);

          if (cursor.digit === 1) {
            state.setCursor({
              digit: 0,
              row: Math.min(cursor.row + editStep, state.patternLength),
            });
          } else {
            state.setCursor({ digit: 1 });
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
          useGTUltraStore.getState().engine?.undo();
          return;
        case 'y':
          e.preventDefault();
          useGTUltraStore.getState().engine?.redo();
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

    // --- Navigation + Block Selection ---
    if (!e.ctrlKey && !e.metaKey) {
      // Shift+arrows: extend block selection
      if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const sel = state.selection;
        if (!sel.active) {
          // Start new selection from cursor
          state.setSelection({
            active: true,
            startChannel: cursor.channel,
            startRow: cursor.row,
            endChannel: cursor.channel,
            endRow: cursor.row,
          });
        }
        // Extend selection by moving the end point
        const s = state.selection.active ? state.selection : { ...state.selection, startChannel: cursor.channel, startRow: cursor.row, endChannel: cursor.channel, endRow: cursor.row };
        switch (e.key) {
          case 'ArrowUp':
            state.setSelection({ endRow: Math.max(0, s.endRow - 1) });
            state.setCursor({ row: Math.max(0, cursor.row - 1) });
            break;
          case 'ArrowDown':
            state.setSelection({ endRow: Math.min(state.patternLength, s.endRow + 1) });
            state.setCursor({ row: Math.min(state.patternLength, cursor.row + 1) });
            break;
          case 'ArrowLeft':
            state.setSelection({ endChannel: Math.max(0, s.endChannel - 1) });
            state.setCursor({ channel: Math.max(0, cursor.channel - 1), column: 0, digit: 0 });
            break;
          case 'ArrowRight': {
            const maxCh = state.sidCount * 3 - 1;
            state.setSelection({ endChannel: Math.min(maxCh, s.endChannel + 1) });
            state.setCursor({ channel: Math.min(maxCh, cursor.channel + 1), column: 0, digit: 0 });
            break;
          }
        }
        return;
      }

      // Normal arrows (no shift): navigate and clear selection
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (state.selection.active) state.clearSelection();
          state.moveCursor('up');
          return;
        case 'ArrowDown':
          e.preventDefault();
          if (state.selection.active) state.clearSelection();
          state.moveCursor('down');
          return;
        case 'ArrowLeft':
          e.preventDefault();
          if (state.selection.active) state.clearSelection();
          state.moveCursor('left');
          return;
        case 'ArrowRight':
          e.preventDefault();
          if (state.selection.active) state.clearSelection();
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

    // Delete key in non-note columns: clear the cell value
    if (e.key === 'Delete' && cursor.column >= 1) {
      e.preventDefault();
      if (recordMode) {
        const orderData = state.orderData[cursor.channel];
        const patIdx = orderData ? orderData[state.playbackPos.position] : 0;
        engine?.setPatternCell(patIdx, cursor.row, cursor.column, 0);
        engine?.checkpointUndo();
        state.refreshPatternData(patIdx);
        state.setCursor({ row: Math.min(cursor.row + editStep, state.patternLength) });
      }
      return;
    }

    // Escape: toggle record mode
    if (e.key === 'Escape') {
      e.preventDefault();
      state.setRecordMode(!recordMode);
      return;
    }

    // +/- keys: change current instrument number
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      state.setCurrentInstrument(Math.min(63, currentInstrument + 1));
      return;
    }
    if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      state.setCurrentInstrument(Math.max(1, currentInstrument - 1));
      return;
    }

    // F5-F8: set edit step (0, 1, 2, 4)
    if (e.key === 'F5') { e.preventDefault(); state.setEditStep(0); return; }
    if (e.key === 'F6') { e.preventDefault(); state.setEditStep(1); return; }
    if (e.key === 'F7') { e.preventDefault(); state.setEditStep(2); return; }
    if (e.key === 'F8') { e.preventDefault(); state.setEditStep(4); return; }

    // Shift+Z: cycle auto-advance mode (note → all → off)
    if (e.shiftKey && e.key === 'Z') {
      e.preventDefault();
      state.cycleAutoAdvanceMode();
      return;
    }

    // Shift+O/P: expand/shrink current pattern
    if (e.shiftKey && e.key === 'O') {
      e.preventDefault();
      const orderData = state.orderData[cursor.channel];
      const patIdx = orderData ? orderData[state.playbackPos.position] : 0;
      engine?.shrinkPattern(patIdx);
      engine?.checkpointUndo();
      state.refreshPatternData(patIdx);
      return;
    }
    if (e.shiftKey && e.key === 'P') {
      e.preventDefault();
      const orderData = state.orderData[cursor.channel];
      const patIdx = orderData ? orderData[state.playbackPos.position] : 0;
      engine?.expandPattern(patIdx);
      engine?.checkpointUndo();
      state.refreshPatternData(patIdx);
      return;
    }

    // Shift+C/V: copy/paste instrument
    if (e.shiftKey && e.key === 'C') {
      e.preventDefault();
      state.setClipboardInstrument(currentInstrument);
      return;
    }
    if (e.shiftKey && e.key === 'V') {
      e.preventDefault();
      const clipInst = state.clipboardInstrument;
      if (clipInst > 0 && clipInst !== currentInstrument) {
        engine?.copyInstrument(clipInst, currentInstrument);
        engine?.checkpointUndo();
      }
      return;
    }

    // Shift+S: swap current instrument with clipboard
    if (e.shiftKey && e.key === 'S') {
      e.preventDefault();
      const clipInst = state.clipboardInstrument;
      if (clipInst > 0 && clipInst !== currentInstrument) {
        engine?.swapInstruments(clipInst, currentInstrument);
        engine?.checkpointUndo();
      }
      return;
    }

    // Shift+F5/F6: order list track copy/paste (copy current channel's order, paste to current channel)
    if (e.shiftKey && e.key === 'F5') {
      e.preventDefault();
      const orderData = state.orderData[cursor.channel];
      if (orderData) state.setOrderClipboard(new Uint8Array(orderData));
      return;
    }
    if (e.shiftKey && e.key === 'F6') {
      e.preventDefault();
      const clip = state.orderClipboard;
      if (clip && engine) {
        for (let i = 0; i < clip.length; i++) {
          engine.setOrderEntry(cursor.channel, i, clip[i]);
        }
        engine.checkpointUndo();
      }
      return;
    }

    // Channel mute: Shift+1-6
    if (e.shiftKey && e.key >= '1' && e.key <= '6') {
      e.preventDefault();
      const ch = parseInt(e.key) - 1;
      if (ch < state.sidCount * 3) {
        state.toggleChannelMute(ch);
      }
      return;
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, handleKeyDown]);
}
