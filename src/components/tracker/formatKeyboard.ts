/**
 * The format editors' keyboard: one cursor, one key handler, no focus needed.
 *
 * Every format canvas (PatternEditorCanvas in hively, klystrack, jamcracker, sidfactory2, cheesecutter, musicline and
 * goattracker mode) used to keep its own cursor in component state and take keys only through a React onKeyDown on the
 * focused grid. So clicking REC (or any button) stranded editing until the grid was clicked, and Tab before that click
 * moved only the tracker store's channel (P14f, owner 2026-10-07, amanda.ahx).
 *
 * pt2-clone and ft2-clone have one cursor and one keyboard handler that sees every key whatever was clicked last.
 * Here: the cursor is useCursorStore's (row, channel, formatColumnIndex), the handler is `handleFormatKey`, and
 * `attachFormatKeyboard` listens on the window, leaving text inputs (isTextEntryTarget), open modals and events the
 * global handler already took alone.
 */
import { useEditorStore } from '@stores/useEditorStore';
import { useUIStore } from '@stores/useUIStore';
import { useFormatStore } from '@stores/useFormatStore';
import { isTextEntryTarget } from '@/lib/keyboard/isTextEntryTarget';
import { isKeyHandled } from '@/lib/tracker/keyHandledSentinel';
import { stepRow, jumpRow, startHeldRepeat } from '@/lib/tracker/cursorNavigation';
import { isManualRowNavAllowed } from '@/lib/tracker/playbackNavigation';
import { nextTabChannel } from '@/lib/tracker/tabNavigation';
import { planNoteEntry, planCursorEntry, typedPitch, type EntryContext } from '@/lib/tracker/formatEntryPlan';
import { undoHively, redoHively, insertHivelyRow, deleteHivelyRow } from '@/components/hively/hivelyEdit';
import { typedNoteValue } from '@/components/shared/format-editor-types';
import type { ColumnDef, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';

export interface FormatCursor { channelIndex: number; rowIndex: number; columnIndex: number }
export interface FormatSelection {
  startRow: number; endRow: number; startCol: number; endCol: number;
  anchorRow: number; anchorCol: number;
}

/** What the handler needs from the canvas that is showing the format. */
export interface FormatKeyHost {
  columns: ColumnDef[];
  channels: FormatChannel[];
  isPlaying(): boolean;
  playbackRow(): number;
  getCursor(): FormatCursor;
  setCursor(update: (prev: FormatCursor) => FormatCursor): void;
  getSelection(): FormatSelection | null;
  setSelection(next: FormatSelection | null | ((prev: FormatSelection | null) => FormatSelection | null)): void;
  onCellChange?: OnCellChange;
  copy(): void;
  clearSelection(): void;
  paste(): void;
  transpose(semitones: number): void;
  /** Hex-column typing: how many digits of the current cell are in. */
  hexTyped: { current: { ch: number; row: number; col: number; digits: number; text?: string } | null };
  /** Held ArrowUp/ArrowDown scrolling. */
  heldArrow: { current: { dir: number } | null };
  arrowRaf: { current: number };
}

export function handleFormatKey(e: KeyboardEvent, host: FormatKeyHost): void {
  const pos = host.getCursor();
  if (!host.columns || !host.channels) return;
    const chCols = host.channels[pos.channelIndex]?.columns ?? host.columns;
    const col = chCols[pos.columnIndex];
    const numRows = host.channels[pos.channelIndex]?.patternLength ?? host.channels[0]?.patternLength ?? 0;
    const numCols = chCols.length;

    // ── Helper: move cursor and optionally extend/clear selection ──
    const moveCursor = (delta: { channelIndex?: number; rowIndex?: number; columnIndex?: number }, extend?: boolean) => {
      host.setCursor(prev => {
        const newChIdx = Math.max(0, Math.min(host.channels.length - 1,
            prev.channelIndex + (delta.channelIndex ?? 0)));
        const newChCols = host.channels[newChIdx]?.columns ?? host.columns;
        const newNumCols = newChCols.length;
        const newNumRows = host.channels[newChIdx]?.patternLength ?? 0;
        const next = {
          channelIndex: newChIdx,
          rowIndex: Math.max(0, Math.min(newNumRows - 1,
            prev.rowIndex + (delta.rowIndex ?? 0))),
          columnIndex: Math.max(0, Math.min(newNumCols - 1,
            delta.channelIndex ? Math.min(prev.columnIndex, newNumCols - 1)
              : prev.columnIndex + (delta.columnIndex ?? 0))),
        };
        if (extend) {
          // Extend selection from anchor to new cursor position
          host.setSelection(prevSel => {
            const anchorRow = prevSel ? prevSel.anchorRow : prev.rowIndex;
            const anchorCol = prevSel ? prevSel.anchorCol : prev.columnIndex;
            return {
              startRow: Math.min(anchorRow, next.rowIndex),
              endRow: Math.max(anchorRow, next.rowIndex),
              startCol: Math.min(anchorCol, next.columnIndex),
              endCol: Math.max(anchorCol, next.columnIndex),
              anchorRow,
              anchorCol,
            };
          });
        } else {
          // Clear selection on non-shift movement
          host.setSelection(null);
        }
        return next;
      });
    };

    // One octave for the jam (window handler) and the write: the editor store's.
    // '-' is a sign, not octave-down, in a typed-entry column
    if (e.key === '[' || (e.key === '-' && !col?.parseTyped)) { e.preventDefault(); const ed = useEditorStore.getState(); ed.setCurrentOctave(ed.currentOctave - 1); return; }
    if (e.key === ']' || e.key === '=') { e.preventDefault(); const ed = useEditorStore.getState(); ed.setCurrentOctave(ed.currentOctave + 1); return; }

    // Edit / record / jam follows the reference trackers (formatEntryPlan.ts, P14): edit off = nothing written
    // (the window handler jams), edit on + stopped = write at the cursor and step, recording = write at the playback row.
    const entryContext = (): EntryContext => {
      const ed = useEditorStore.getState();
      return {
        recordMode: ed.recordMode,
        isPlaying: host.isPlaying(),
        cursorRow: pos.rowIndex,
        playbackRow: host.playbackRow() ?? 0,
        editStep: ed.editStep,
        numRows,
        recQuantEnabled: ed.recQuantEnabled,
        recQuantRes: ed.recQuantRes,
      };
    };
    const stepCursorTo = (row: number | null) => {
      if (row !== null) host.setCursor(p => ({ ...p, rowIndex: Math.max(0, Math.min(numRows - 1, row)) }));
    };

    const isCtrlCmd = e.ctrlKey || e.metaKey;

    // Escape: clear selection
    if (e.key === 'Escape') {
      e.preventDefault();
      host.setSelection(null);
      return;
    }

    // Select All (Ctrl+A): select all rows in current channel, all columns
    if (isCtrlCmd && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      host.setSelection({
        startRow: 0, endRow: Math.max(0, numRows - 1),
        startCol: 0, endCol: Math.max(0, numCols - 1),
        anchorRow: 0, anchorCol: 0,
      });
      return;
    }

    // Copy (Ctrl+C / F4)
    if ((isCtrlCmd && e.key.toLowerCase() === 'c' && !e.shiftKey) || e.key === 'F4') {
      e.preventDefault();
      host.copy();
      return;
    }

    // Cut (Ctrl+X / F3)
    if ((isCtrlCmd && e.key.toLowerCase() === 'x') || e.key === 'F3') {
      e.preventDefault();
      host.copy();
      host.clearSelection();
      host.setSelection(null);
      return;
    }

    // Paste (Ctrl+V / F5)
    if ((isCtrlCmd && e.key.toLowerCase() === 'v') || e.key === 'F5') {
      e.preventDefault();
      host.paste();
      return;
    }

    // Undo / Redo (Ctrl+Z / Ctrl+Shift+Z)
    if (isCtrlCmd && e.key.toLowerCase() === 'z' && !e.altKey) {
      e.preventDefault();
      if (e.shiftKey) {
        if (redoHively()) {
          useUIStore.getState().setStatusMessage('REDO');
        } else {
          useUIStore.getState().setStatusMessage('NOTHING TO REDO');
        }
      } else {
        if (undoHively()) {
          useUIStore.getState().setStatusMessage('UNDO');
        } else {
          useUIStore.getState().setStatusMessage('NOTHING TO UNDO');
        }
      }
      return;
    }

    // Transpose: Ctrl+ArrowUp/Down = +/-1 semitone, Ctrl+Shift = +/-12
    if (isCtrlCmd && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey) {
      e.preventDefault();
      // Transpose the marked block if there is one, else the cell under the cursor.
      const delta = e.key === 'ArrowUp' ? (e.shiftKey ? 12 : 1) : (e.shiftKey ? -12 : -1);
      host.transpose(delta);
      return;
    }

    // Row navigation is the classic editor's rule (cursorNavigation.ts, playbackNavigation.ts): not while the song plays and
    // the view follows the play head; wrap at the ends when the keymap wraps; the keymap's page size; the shared held-key repeat.
    const rowNavAllowed = () => isManualRowNavAllowed(host.isPlaying(), useEditorStore.getState().followPlayback);
    const behavior = useEditorStore.getState().activeBehavior;
    const stepCursorRow = (dir: -1 | 1, extend?: boolean) => {
      const to = stepRow(host.getCursor().rowIndex, dir, numRows, behavior.cursorWrapVertical);
      moveCursor({ rowIndex: to - host.getCursor().rowIndex }, extend);
    };
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!rowNavAllowed()) return;
      e.preventDefault();
      if (e.repeat) return; // the shared repeat loop handles repeats
      const dir = e.key === 'ArrowUp' ? -1 : 1;
      stepCursorRow(dir, e.shiftKey);
      if (!e.shiftKey) {
        host.heldArrow.current = { dir };
        startHeldRepeat(host.arrowRaf, () => host.heldArrow.current, () => {
          if (rowNavAllowed()) stepCursorRow(host.heldArrow.current!.dir as -1 | 1);
        });
      }
      return;
    }

    // ── Insert row (Insert key) ──────────────────────────────────────────────
    if (e.key === 'Insert') {
      e.preventDefault();
      const ch = host.channels[pos.channelIndex];
      const trackIdx = ch?.trackIndex;
      if (trackIdx != null) {
        const store = useFormatStore.getState();
        if (store.editorMode === 'hively') {
          insertHivelyRow(trackIdx, pos.rowIndex);
        }
      }
      return;
    }

    // ── Delete row (Shift+Backspace) ──────────────────────────────────────────
    if (e.key === 'Backspace' && e.shiftKey) {
      e.preventDefault();
      const ch = host.channels[pos.channelIndex];
      const trackIdx = ch?.trackIndex;
      if (trackIdx != null) {
        const store = useFormatStore.getState();
        if (store.editorMode === 'hively') {
          deleteHivelyRow(trackIdx, pos.rowIndex);
        }
      }
      return;
    }

    switch (e.key) {
      case 'ArrowLeft':  e.preventDefault(); moveCursor({ columnIndex: -1 }, e.shiftKey); return;
      case 'ArrowRight': e.preventDefault(); moveCursor({ columnIndex: +1 }, e.shiftKey); return;
      case 'Tab': {
        e.preventDefault();
        // classic: Tab / Shift+Tab land on the next / previous channel's note column, wrapping
        const ch = nextTabChannel(pos.channelIndex, host.channels.length, e.shiftKey);
        const cols = host.channels[ch]?.columns ?? host.columns;
        const noteCol = Math.max(0, cols.findIndex((c) => c.type === 'note'));
        host.setCursor((p) => ({ ...p, channelIndex: ch, columnIndex: noteCol }));
        host.setSelection(null);
        return;
      }
      case 'PageUp':
      case 'PageDown':
      case 'Home':
      case 'End': {
        if (!rowNavAllowed()) return;
        e.preventDefault();
        const to = jumpRow(e.key, pos.rowIndex, numRows, behavior.pageJumpSize);
        if (e.key === 'PageUp' || e.key === 'PageDown') moveCursor({ rowIndex: to - pos.rowIndex }, e.shiftKey);
        else { host.setCursor((p) => ({ ...p, rowIndex: to })); host.setSelection(null); }
        return;
      }
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (host.getSelection()) {
          // Delete clears entire selection
          host.clearSelection();
          host.setSelection(null);
        } else if (col && !col.readOnly) {
          const plan = planCursorEntry(entryContext());
          if (plan.write) {
            host.onCellChange?.(pos.channelIndex, plan.row, col.key, col.emptyValue ?? 0);
            stepCursorTo(plan.nextCursorRow);
          }
        }
        return;
    }

    if (!col || col.readOnly) return;

    // Data entry clears selection
    if (col.type === 'note') {
      const typed = typedPitch(e.key, useEditorStore.getState().currentOctave);
      if (typed !== null && !e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        host.setSelection(null);
        const ctx = entryContext();
        if (e.repeat && ctx.isPlaying) return;
        const value = typedNoteValue(col, typed);
        const plan = planNoteEntry(ctx);
        if (value !== null && plan.write) {
          host.onCellChange?.(pos.channelIndex, plan.row, col.key, value);
          stepCursorTo(plan.nextCursorRow);
        }
      }
    } else if (col.parseTyped && (col.type === 'hex' || col.type === 'ctrl')) {
      if (/^[0-9+-]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        host.setSelection(null);
        const plan = planCursorEntry(entryContext());
        if (!plan.write) return;
        const prev = host.hexTyped.current;
        const continuing = prev !== null && prev.text !== undefined && prev.ch === pos.channelIndex
          && prev.row === plan.row && prev.col === pos.columnIndex && (e.key !== '+' && e.key !== '-');
        let text = continuing ? prev.text + e.key : e.key;
        if (e.key === '+' || e.key === '-') { // a sign alone writes nothing; the digits that follow do
          host.hexTyped.current = { ch: pos.channelIndex, row: plan.row, col: pos.columnIndex, digits: 0, text };
          return;
        }
        let value = col.parseTyped(text);
        if (value === null) { text = e.key; value = col.parseTyped(text); } // too long or out of range: start over
        if (value === null) return;
        host.onCellChange?.(pos.channelIndex, plan.row, col.key, value);
        const digits = text.replace(/[+-]/g, '').length;
        if (digits >= 2) {
          host.hexTyped.current = null;
          stepCursorTo(plan.nextCursorRow);
        } else {
          host.hexTyped.current = { ch: pos.channelIndex, row: plan.row, col: pos.columnIndex, digits, text };
        }
      }
    } else if (col.type === 'hex' || col.type === 'ctrl') {
      if (/^[0-9a-fA-F]$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        host.setSelection(null);
        const plan = planCursorEntry(entryContext());
        if (!plan.write) return;
        const digit = parseInt(e.key, 16);
        const hexDigits = col.hexDigits ?? 2;
        const typedSoFar = host.hexTyped.current;
        const continuing = typedSoFar !== null && typedSoFar.ch === pos.channelIndex
          && typedSoFar.row === plan.row && typedSoFar.col === pos.columnIndex;
        const digits = continuing ? typedSoFar.digits : 0;
        const cur = digits === 0 ? 0 : (host.channels[pos.channelIndex]?.rows[plan.row]?.[col.key]
          ?? (col.emptyValue ?? 0));
        const mask = (1 << (hexDigits * 4)) - 1;
        host.onCellChange?.(pos.channelIndex, plan.row, col.key, ((cur << 4) | digit) & mask);
        if (digits + 1 >= hexDigits) {
          host.hexTyped.current = null;
          stepCursorTo(plan.nextCursorRow);
        } else {
          host.hexTyped.current = { ch: pos.channelIndex, row: plan.row, col: pos.columnIndex, digits: digits + 1 };
        }
      }
    }
}

/** Keys the format keyboard must leave alone: typing, an open dialog, or a key the global handler already took. */
export function formatKeyIsForUs(e: KeyboardEvent): boolean {
  if (isKeyHandled(e)) return false;
  if (isTextEntryTarget(e.target)) return false;
  if (typeof document !== 'undefined' && document.querySelector('.fixed.inset-0.z-50')) return false;
  return true;
}

/** Listen on the window for as long as a format canvas is mounted. Returns the detach function. */
export function attachFormatKeyboard(getHost: () => FormatKeyHost | null): () => void {
  const down = (e: KeyboardEvent) => {
    const host = getHost();
    if (!host || !formatKeyIsForUs(e)) return;
    handleFormatKey(e, host);
  };
  const up = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const host = getHost();
    if (host) host.heldArrow.current = null;
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
  };
}
