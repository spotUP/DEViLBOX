/**
 * useGTDAWKeyboardHandler — Keyboard input for GoatTracker Ultra DAW mode.
 *
 * Handles:
 * - Transport (Space = play/stop, R = record toggle)
 * - Bottom panel switching (1-5)
 * - Sidebar toggle (Tab)
 * - Octave (Z/X)
 * - Zoom (+/- keys)
 * - Note entry (A-G, Shift+A-G for sharps)
 * - Navigation (arrows)
 * - Delete/Backspace (clear note at cursor)
 * - Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)
 * - Copy/Cut/Paste (Ctrl+C / Ctrl+X / Ctrl+V)
 *
 * Attaches to window keydown; should only be active when DAW view is focused.
 */

import { useEffect, useCallback } from 'react';
import { useGTUltraStore } from '@/stores/useGTUltraStore';

// Letter note → semitone within octave (1-based, C=1 .. B=12)
const NOTE_MAP: Record<string, number> = {
  'c': 1, 'd': 3, 'e': 5, 'f': 6, 'g': 8, 'a': 10, 'b': 12,
};

// Sharp offsets (Shift+letter)
const SHARP_MAP: Record<string, number> = {
  'c': 2,  // C#
  'd': 4,  // D#
  'f': 7,  // F#
  'g': 9,  // G#
  'a': 11, // A#
};

const BOTTOM_PANELS = ['mixer', 'tables', 'monitor', 'presets', 'clips'] as const;

export function useGTDAWKeyboardHandler(active: boolean): void {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!active) return;

    // Don't intercept when in text inputs
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const state = useGTUltraStore.getState();
    const {
      engine,
      cursor,
      currentOctave,
      currentInstrument,
      dawSelectedPattern,
      dawSelectedChannel,
      dawZoomX,
      dawZoomY,
      dawGridSnap,
    } = state;

    const key = e.key;
    const lower = key.toLowerCase();

    // --- Ctrl/Cmd shortcuts ---
    if (e.ctrlKey || e.metaKey) {
      // Undo / Redo
      if (lower === 'z' && !e.shiftKey) {
        e.preventDefault();
        engine?.undo();
        state.refreshPatternData(dawSelectedPattern);
        return;
      }
      if ((lower === 'z' && e.shiftKey) || lower === 'y') {
        e.preventDefault();
        engine?.redo();
        state.refreshPatternData(dawSelectedPattern);
        return;
      }

      // Copy
      if (lower === 'c') {
        e.preventDefault();
        const pd = state.patternData.get(dawSelectedPattern);
        if (!pd) return;
        const sel = state.dawSelection;
        const bytesPerCell = 4;
        const clipboard: Array<{ relRow: number; note: number; instrument: number }> = [];

        if (sel) {
          const minRow = Math.min(sel.startRow, sel.endRow);
          const maxRow = Math.max(sel.startRow, sel.endRow);
          for (let row = minRow; row <= maxRow; row++) {
            const off = row * bytesPerCell;
            if (off >= pd.data.length) break;
            const noteVal = pd.data[off];
            const instVal = pd.data[off + 1];
            if (noteVal > 0 && noteVal <= 96) {
              clipboard.push({ relRow: row - minRow, note: noteVal, instrument: instVal });
            }
          }
        } else {
          // No selection: copy single cell at cursor
          const off = cursor.row * bytesPerCell;
          if (off < pd.data.length) {
            const noteVal = pd.data[off];
            const instVal = pd.data[off + 1];
            if (noteVal > 0 && noteVal <= 96) {
              clipboard.push({ relRow: 0, note: noteVal, instrument: instVal });
            }
          }
        }
        state.setDawClipboard(clipboard);
        return;
      }

      // Cut
      if (lower === 'x') {
        e.preventDefault();
        const pd = state.patternData.get(dawSelectedPattern);
        if (!pd || !engine) return;
        const sel = state.dawSelection;
        const bytesPerCell = 4;
        const clipboard: Array<{ relRow: number; note: number; instrument: number }> = [];

        if (sel) {
          const minRow = Math.min(sel.startRow, sel.endRow);
          const maxRow = Math.max(sel.startRow, sel.endRow);
          for (let row = minRow; row <= maxRow; row++) {
            const off = row * bytesPerCell;
            if (off >= pd.data.length) break;
            const noteVal = pd.data[off];
            const instVal = pd.data[off + 1];
            if (noteVal > 0 && noteVal <= 96) {
              clipboard.push({ relRow: row - minRow, note: noteVal, instrument: instVal });
            }
            // Clear the cell
            engine.setPatternCell(dawSelectedPattern, row, 0, 0);
            engine.setPatternCell(dawSelectedPattern, row, 1, 0);
          }
        } else {
          const off = cursor.row * bytesPerCell;
          if (off < pd.data.length) {
            const noteVal = pd.data[off];
            const instVal = pd.data[off + 1];
            if (noteVal > 0 && noteVal <= 96) {
              clipboard.push({ relRow: 0, note: noteVal, instrument: instVal });
            }
          }
          engine.setPatternCell(dawSelectedPattern, cursor.row, 0, 0);
          engine.setPatternCell(dawSelectedPattern, cursor.row, 1, 0);
        }
        state.setDawClipboard(clipboard);
        state.refreshPatternData(dawSelectedPattern);
        return;
      }

      // Paste
      if (lower === 'v') {
        e.preventDefault();
        const clip = state.dawClipboard;
        if (!clip.length || !engine) return;
        for (const entry of clip) {
          const targetRow = cursor.row + entry.relRow;
          engine.setPatternCell(dawSelectedPattern, targetRow, 0, entry.note);
          engine.setPatternCell(dawSelectedPattern, targetRow, 1, entry.instrument);
        }
        state.refreshPatternData(dawSelectedPattern);
        return;
      }

      return;
    }

    // --- Transport ---
    if (key === ' ') {
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

    if (lower === 'r' && !e.shiftKey) {
      e.preventDefault();
      state.setRecordMode(!state.recordMode);
      return;
    }

    // --- Bottom panel switching (1-5) ---
    if (!e.shiftKey && key >= '1' && key <= '5') {
      e.preventDefault();
      const idx = parseInt(key) - 1;
      state.setDawBottomPanel(BOTTOM_PANELS[idx]);
      return;
    }

    // --- Sidebar toggle ---
    if (key === 'Tab') {
      e.preventDefault();
      state.setDawSidebarOpen(!state.dawSidebarOpen);
      return;
    }

    // --- Octave down/up ---
    if (lower === 'z' && !e.shiftKey) {
      e.preventDefault();
      state.setCurrentOctave(Math.max(0, currentOctave - 1));
      return;
    }
    if (lower === 'x' && !e.shiftKey) {
      e.preventDefault();
      state.setCurrentOctave(Math.min(7, currentOctave + 1));
      return;
    }

    // --- Zoom in/out ---
    if (key === '+' || key === '=') {
      e.preventDefault();
      const newZoom = Math.min(32, dawZoomX + 2);
      state.setDawZoom(newZoom, dawZoomY);
      return;
    }
    if (key === '-' || key === '_') {
      e.preventDefault();
      const newZoom = Math.max(4, dawZoomX - 2);
      state.setDawZoom(newZoom, dawZoomY);
      return;
    }

    // --- Delete/Backspace: clear note at cursor ---
    if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault();
      engine?.setPatternCell(dawSelectedPattern, cursor.row, 0, 0);
      engine?.setPatternCell(dawSelectedPattern, cursor.row, 1, 0);
      useGTUltraStore.getState().refreshPatternData(dawSelectedPattern);
      return;
    }

    // --- Navigation ---
    if (key === 'ArrowUp') {
      e.preventDefault();
      state.setCursor({ row: Math.max(0, cursor.row - 1) });
      return;
    }
    if (key === 'ArrowDown') {
      e.preventDefault();
      state.setCursor({ row: cursor.row + 1 });
      return;
    }
    if (key === 'ArrowLeft') {
      e.preventDefault();
      state.setCursor({ row: Math.max(0, cursor.row - dawGridSnap) });
      return;
    }
    if (key === 'ArrowRight') {
      e.preventDefault();
      state.setCursor({ row: cursor.row + dawGridSnap });
      return;
    }

    // --- Note entry: A-G (with Shift for sharps) ---
    if (lower >= 'a' && lower <= 'g') {
      let noteInOctave: number | undefined;

      if (e.shiftKey) {
        noteInOctave = SHARP_MAP[lower];
        // E# and B# don't exist as sharps in this mapping — ignore
        if (noteInOctave === undefined) return;
      } else {
        noteInOctave = NOTE_MAP[lower];
        if (noteInOctave === undefined) return;
      }

      e.preventDefault();
      const noteValue = currentOctave * 12 + noteInOctave;

      // Place note in pattern
      engine?.setPatternCell(dawSelectedPattern, cursor.row, 0, noteValue);
      engine?.setPatternCell(dawSelectedPattern, cursor.row, 1, currentInstrument);
      useGTUltraStore.getState().refreshPatternData(dawSelectedPattern);

      // Jam preview
      engine?.jamNoteOn(dawSelectedChannel, noteValue, currentInstrument);
      setTimeout(() => {
        engine?.jamNoteOff(dawSelectedChannel);
      }, 200);
      return;
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, handleKeyDown]);
}
