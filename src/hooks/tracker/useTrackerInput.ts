/**
 * useTrackerInput - FastTracker II Keyboard Input System
 * Composition hook that combines navigation, note input, and effect input sub-hooks.
 * Edit operations (undo/redo, cut/copy/paste, transpose, etc.) remain here.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTrackerStore, useCursorStore, useTransportStore } from '@stores';
import { useEditorStore } from '@stores/useEditorStore';
import { useUIStore } from '@stores/useUIStore';
import { useFormatStore } from '@stores/useFormatStore';
import { useHistoryStore } from '@stores/useHistoryStore';
import * as Tone from 'tone';
import { getToneEngine } from '@engine/ToneEngine';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { parseMPTClipboard } from '@lib/import/MPTClipboardParser';
import { useNoteInput, useEffectInput, useNavigationInput } from './input';
import type { EditorBehavior } from '@engine/keyboard/EditorBehavior';

/** Get the cell field names for a given note column index (0-3) */
function noteColFields(nci: number): { note: string; instrument: string; volume: string } {
  if (nci === 1) return { note: 'note2', instrument: 'instrument2', volume: 'volume2' };
  if (nci === 2) return { note: 'note3', instrument: 'instrument3', volume: 'volume3' };
  if (nci === 3) return { note: 'note4', instrument: 'instrument4', volume: 'volume4' };
  return { note: 'note', instrument: 'instrument', volume: 'volume' };
}

export const useTrackerInput = () => {
  // PERFORMANCE: cursor and selection are refs — updated via subscription, not React state.
  const cursorRef = useRef(useCursorStore.getState().cursor);
  const selectionRef = useRef(useCursorStore.getState().selection);
  useEffect(() => {
    const unsub = useCursorStore.subscribe((state, prev) => {
      if (state.cursor !== prev.cursor) cursorRef.current = state.cursor;
      if (state.selection !== prev.selection) selectionRef.current = state.selection;
    });
    return unsub;
  }, []);

  const inputRefs = { cursorRef, selectionRef };

  // Sub-hooks
  const noteInput = useNoteInput(inputRefs);
  const effectInput = useEffectInput(inputRefs);
  const navInput = useNavigationInput(inputRefs);

  const {
    patterns,
    currentPatternIndex,
  } = useTrackerStore(useShallow((state) => ({
    patterns: state.patterns,
    currentPatternIndex: state.currentPatternIndex,
  })));

  const recordMode = useEditorStore((state) => state.recordMode);
  const editStep = useEditorStore((state) => state.editStep);

  const moveCursor = useCursorStore((state) => state.moveCursor);
  const moveCursorToRow = useCursorStore((state) => state.moveCursorToRow);
  const clearSelection = useCursorStore((state) => state.clearSelection);

  const setCell = useTrackerStore((state) => state.setCell);
  const clearCell = useTrackerStore((state) => state.clearCell);
  const copySelection = useTrackerStore((state) => state.copySelection);
  const cutSelection = useTrackerStore((state) => state.cutSelection);
  const paste = useTrackerStore((state) => state.paste);
  const pasteMix = useTrackerStore((state) => state.pasteMix);
  const pasteFlood = useTrackerStore((state) => state.pasteFlood);
  const pastePushForward = useTrackerStore((state) => state.pastePushForward);
  const copyTrack = useTrackerStore((state) => state.copyTrack);
  const cutTrack = useTrackerStore((state) => state.cutTrack);
  const pasteTrack = useTrackerStore((state) => state.pasteTrack);
  const copyPattern = useTrackerStore((state) => state.copyPattern);
  const cutPattern = useTrackerStore((state) => state.cutPattern);
  const pastePattern = useTrackerStore((state) => state.pastePattern);
  const transposeSelection = useTrackerStore((state) => state.transposeSelection);
  const transposeTrack = useTrackerStore((state) => state.transposeTrack);
  const transposePattern = useTrackerStore((state) => state.transposePattern);
  const toggleRecordMode = useEditorStore((state) => state.toggleRecordMode);
  const writeMacroSlot = useTrackerStore((state) => state.writeMacroSlot);
  const readMacroSlot = useTrackerStore((state) => state.readMacroSlot);
  const toggleInsertMode = useEditorStore((state) => state.toggleInsertMode);
  const insertRow = useTrackerStore((state) => state.insertRow);
  const deleteRow = useTrackerStore((state) => state.deleteRow);
  const interpolateSelection = useTrackerStore((state) => state.interpolateSelection);
  const replacePattern = useTrackerStore((state) => state.replacePattern);

  const {
    isPlaying,
    currentRow: playbackRow,
    stop,
    play,
    setIsLooping,
  } = useTransportStore(useShallow((state) => ({
    isPlaying: state.isPlaying,
    currentRow: state.currentRow,
    stop: state.stop,
    play: state.play,
    setIsLooping: state.setIsLooping,
  })));

  const pattern = patterns[currentPatternIndex];

  // A pattern is read-only when it was imported from a playback-only format
  // (UADE classic mode, C64 SID files). Editing has no effect on playback
  // because native engines play the raw binary, not the extracted patterns.
  const sourceFormat = pattern?.importMetadata?.sourceFormat;
  const isPatternEditable = sourceFormat !== 'UADE' && sourceFormat !== 'SID';

  // Track last Esc press for double-Esc panic (kill all notes)
  const lastEscPressRef = useRef<number>(0);

  // FT2: Insert empty row at cursor, shift rows down (local wrapper)
  const handleInsertRow = useCallback(() => {
    insertRow(cursorRef.current.channelIndex, cursorRef.current.rowIndex);
  }, [insertRow]);

  // FT2: Delete row at cursor, shift rows up (local wrapper)
  const handleDeleteRow = useCallback(() => {
    deleteRow(cursorRef.current.channelIndex, cursorRef.current.rowIndex);
  }, [deleteRow]);

  // Behavior-aware delete: what to clear depends on scheme + cursor position
  const deleteByCursorField = useCallback((behavior: EditorBehavior) => {
    const ch = cursorRef.current.channelIndex;
    const row = cursorRef.current.rowIndex;
    const colType = cursorRef.current.columnType;

    switch (behavior.deleteClearsWhat) {
      case 'note-inst-vol': {
        // FT2: Delete clears note+instrument+volume on note column, or cursor field
        if (colType === 'note') {
          const f = noteColFields(cursorRef.current.noteColumnIndex ?? 0);
          setCell(ch, row, { [f.note]: 0, [f.instrument]: 0, [f.volume]: 0 });
        } else if (colType === 'instrument') {
          const f = noteColFields(cursorRef.current.noteColumnIndex ?? 0);
          setCell(ch, row, { [f.instrument]: 0 });
        } else if (colType === 'volume') {
          const f = noteColFields(cursorRef.current.noteColumnIndex ?? 0);
          setCell(ch, row, { [f.volume]: 0 });
        } else if (colType === 'effTyp' || colType === 'effParam') {
          setCell(ch, row, { effTyp: 0, eff: 0 });
        } else if (colType === 'effTyp2' || colType === 'effParam2') {
          setCell(ch, row, { effTyp2: 0, eff2: 0 });
        } else if (colType === 'probability') {
          setCell(ch, row, { probability: undefined });
        } else {
          clearCell(ch, row);
        }
        break;
      }
      case 'cursor-field': {
        // IT/Renoise: Delete clears only the field at cursor position
        if (colType === 'note') {
          const f = noteColFields(cursorRef.current.noteColumnIndex ?? 0);
          setCell(ch, row, { [f.note]: 0 });
        } else if (colType === 'instrument') {
          const f = noteColFields(cursorRef.current.noteColumnIndex ?? 0);
          setCell(ch, row, { [f.instrument]: 0 });
        } else if (colType === 'volume') {
          const f = noteColFields(cursorRef.current.noteColumnIndex ?? 0);
          setCell(ch, row, { [f.volume]: 0 });
        } else if (colType === 'effTyp' || colType === 'effParam') {
          setCell(ch, row, { effTyp: 0, eff: 0 });
        } else if (colType === 'effTyp2' || colType === 'effParam2') {
          setCell(ch, row, { effTyp2: 0, eff2: 0 });
        } else if (colType === 'probability') {
          setCell(ch, row, { probability: undefined });
        } else {
          clearCell(ch, row);
        }
        break;
      }
      case 'note-sample': {
        // PT: Delete clears note + sample number
        const f = noteColFields(cursorRef.current.noteColumnIndex ?? 0);
        setCell(ch, row, { [f.note]: 0, [f.instrument]: 0 });
        break;
      }
    }
  }, [setCell, clearCell]);

  // Handle keyboard input — edit operations that remain in the composition hook
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Only handle keys when tracker view is active
      const activeView = useUIStore.getState().activeView;
      if (activeView !== 'tracker') {
        return;
      }

      // Skip if already handled by the global keyboard handler
      if ((e as any).__handled) return;

      // Ignore if typing in input field or operating a dropdown
      if (
        (window as any).__pixiInputFocused ||
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

      // In format mode (Hively, Furnace, etc.), let the format-specific handler
      // in PatternEditorCanvas handle edit operations (undo, redo, transpose).
      // Classic navigation (F-keys, transport) still handled below.
      const editorMode = useFormatStore.getState().editorMode;
      if (editorMode !== 'classic') {
        const isCtrlCmd = e.ctrlKey || e.metaKey;
        // Bail on Ctrl+Z/Y (undo/redo) — format handler owns these
        if (isCtrlCmd && (keyLower === 'z' || keyLower === 'y') && !e.altKey) return;
        // Bail on Ctrl+Arrow (transpose) — format handler owns these
        if (isCtrlCmd && (key === 'ArrowUp' || key === 'ArrowDown') && !e.altKey) return;
      }

      // ── Delegate to sub-hooks (order matters) ──

      // Navigation first (F9-F12, arrows, Tab, Page, Home/End, Alt+track)
      if (navInput.handleKeyDown(e)) return;

      // ============================================
      // Undo / Redo (Ctrl+Z / Ctrl+Y, Ctrl+Shift+Z)
      // ============================================

      if ((e.ctrlKey || e.metaKey) && keyLower === 'z' && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) {
          const histStore = useHistoryStore.getState();
          if (histStore.canRedo()) {
            const afterState = histStore.redo();
            if (afterState) {
              const action = histStore.getLastAction();
              replacePattern(action?.patternIndex ?? currentPatternIndex, afterState);
              useUIStore.getState().setStatusMessage(`REDO: ${action?.description ?? ''}`);
            }
          } else {
            useUIStore.getState().setStatusMessage('NOTHING TO REDO');
          }
        } else {
          const histStore = useHistoryStore.getState();
          if (histStore.canUndo()) {
            const action = histStore.getLastAction();
            const beforeState = histStore.undo();
            if (beforeState && action) {
              replacePattern(action.patternIndex, beforeState);
              useUIStore.getState().setStatusMessage(`UNDO: ${action.description}`);
            }
          } else {
            useUIStore.getState().setStatusMessage('NOTHING TO UNDO');
          }
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && keyLower === 'y' && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        const histStore = useHistoryStore.getState();
        if (histStore.canRedo()) {
          const afterState = histStore.redo();
          if (afterState) {
            const action = histStore.getLastAction();
            replacePattern(action?.patternIndex ?? currentPatternIndex, afterState);
            useUIStore.getState().setStatusMessage(`REDO: ${action?.description ?? ''}`);
          }
        } else {
          useUIStore.getState().setStatusMessage('NOTHING TO REDO');
        }
        return;
      }

      // ============================================
      // FT2: Macro Slots (Ctrl+1-8)
      // ============================================

      if ((e.ctrlKey || e.metaKey) && key >= '1' && key <= '8' && !e.altKey) {
        e.preventDefault();
        const slotIndex = parseInt(key) - 1;
        if (e.shiftKey) {
          writeMacroSlot(slotIndex);
        } else {
          readMacroSlot(slotIndex);
        }
        return;
      }

      // ============================================
      // Insert/Delete Row Operations (behavior-aware)
      // ============================================

      if (key === 'Insert') {
        const behavior = useEditorStore.getState().activeBehavior;
        e.preventDefault();
        if (recordMode) {
          if (e.shiftKey && behavior.insertShiftAllChannels) {
            for (let ch = 0; ch < pattern.channels.length; ch++) {
              insertRow(ch, cursorRef.current.rowIndex);
            }
          } else {
            handleInsertRow();
          }
        } else if (behavior.insertTogglesMode) {
          toggleInsertMode();
        }
        return;
      }

      // ============================================
      // Transpose Selection (Ctrl+Arrow)
      // ============================================

      if (recordMode && (e.ctrlKey || e.metaKey) && key === 'ArrowUp' && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) {
          transposeSelection(12);
        } else {
          transposeSelection(1);
        }
        return;
      }

      if (recordMode && (e.ctrlKey || e.metaKey) && key === 'ArrowDown' && !e.altKey) {
        e.preventDefault();
        if (e.shiftKey) {
          transposeSelection(-12);
        } else {
          transposeSelection(-1);
        }
        return;
      }

      // ============================================
      // Cut/Copy/Paste
      // ============================================

      // Delete: Behavior-aware clearing (requires edit mode)
      if (key === 'Delete' && recordMode) {
        const behavior = useEditorStore.getState().activeBehavior;
        e.preventDefault();

        // FT2 modifier variants: Shift=clear all, Ctrl=clear vol+eff, Alt=clear eff
        if (behavior.deleteModifierVariants) {
          if (e.shiftKey) {
            setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, {
              note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0,
            });
          } else if (e.ctrlKey || e.metaKey) {
            setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, {
              volume: 0, effTyp: 0, eff: 0,
            });
          } else if (e.altKey) {
            setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, {
              effTyp: 0, eff: 0,
            });
          } else {
            // Bare Delete: behavior-determined
            deleteByCursorField(behavior);
          }
        } else {
          // Non-FT2 schemes: bare Delete only, behavior-determined
          deleteByCursorField(behavior);
        }

        if (behavior.advanceOnDelete && editStep > 0 && !isPlaying) {
          moveCursorToRow((cursorRef.current.rowIndex + editStep) % pattern.length);
        }
        return;
      }

      // Backspace: Delete previous note/line (requires edit mode)
      // Backspace: Behavior-aware (requires edit mode)
      if (key === 'Backspace' && recordMode) {
        const behavior = useEditorStore.getState().activeBehavior;
        e.preventDefault();
        if (e.metaKey) {
          // Cmd+Backspace: clear current field and advance (same for all schemes)
          deleteByCursorField(behavior);
          if (editStep > 0 && !isPlaying) {
            moveCursorToRow((cursorRef.current.rowIndex + editStep) % pattern.length);
          }
        } else if (e.shiftKey) {
          // Shift+Backspace: move up + delete row (pull up)
          if (cursorRef.current.rowIndex > 0) {
            moveCursor('up');
            handleDeleteRow();
          }
        } else {
          // Plain Backspace: behavior-dependent
          switch (behavior.backspaceBehavior) {
            case 'pull-delete':
              // FT2: move up, then clear cell (like FT2's backspace)
              if (cursorRef.current.rowIndex > 0) {
                moveCursor('up');
                clearCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex);
              } else {
                clearCell(cursorRef.current.channelIndex, 0);
              }
              break;
            case 'clear-prev':
              // PT: move up, clear cell
              if (cursorRef.current.rowIndex > 0) {
                moveCursor('up');
                clearCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex);
              } else {
                clearCell(cursorRef.current.channelIndex, 0);
              }
              break;
            case 'pull-channel':
              // IT: pull rows up in current channel only
              if (cursorRef.current.rowIndex > 0) {
                moveCursor('up');
                handleDeleteRow();
              }
              break;
          }
        }
        return;
      }

      // F3/F4/F5: Cut/Copy/Paste with FT2 scoping (only if behavior enables it)
      // Shift = Track (single channel), Ctrl = Pattern (all channels), Alt = Block (selection)
      if (key === 'F3' && useEditorStore.getState().activeBehavior.fKeyCutCopyPaste) {
        e.preventDefault();
        if (e.shiftKey) {
          cutTrack(cursorRef.current.channelIndex);
          useUIStore.getState().setStatusMessage('CUT TRACK');
        } else if (e.ctrlKey || e.metaKey) {
          cutPattern();
          useUIStore.getState().setStatusMessage('CUT PATTERN');
        } else if (e.altKey) {
          cutSelection();
          useUIStore.getState().setStatusMessage('CUT BLOCK');
        }
        return;
      }

      if (key === 'F4' && useEditorStore.getState().activeBehavior.fKeyCutCopyPaste) {
        e.preventDefault();
        if (e.shiftKey) {
          copyTrack(cursorRef.current.channelIndex);
          useUIStore.getState().setStatusMessage('COPY TRACK');
        } else if (e.ctrlKey || e.metaKey) {
          copyPattern();
          useUIStore.getState().setStatusMessage('COPY PATTERN');
        } else if (e.altKey) {
          copySelection();
          useUIStore.getState().setStatusMessage('COPY BLOCK');
        }
        return;
      }

      if (key === 'F5' && useEditorStore.getState().activeBehavior.fKeyCutCopyPaste) {
        e.preventDefault();
        if (e.shiftKey) {
          pasteTrack(cursorRef.current.channelIndex);
          useUIStore.getState().setStatusMessage('PASTE TRACK');
        } else if (e.ctrlKey || e.metaKey) {
          pastePattern();
          useUIStore.getState().setStatusMessage('PASTE PATTERN');
        } else if (e.altKey) {
          paste();
          useUIStore.getState().setStatusMessage('PASTE BLOCK');
        }
        return;
      }

      // F7/F8: Transpose with FT2 scoping (only if behavior enables it)
      // Shift = Track, Ctrl = Pattern, Alt = Block; F7 = up, F8 = down
      // Shift+Ctrl = 12 semitones (octave) instead of 1
      if (key === 'F7' && (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey)
          && useEditorStore.getState().activeBehavior.fKeyTranspose) {
        e.preventDefault();
        const octaveJump = e.shiftKey && (e.ctrlKey || e.metaKey);
        const semitones = octaveJump ? 12 : 1;
        if (e.shiftKey && !(e.ctrlKey || e.metaKey)) {
          transposeTrack(cursorRef.current.channelIndex, semitones);
          useUIStore.getState().setStatusMessage(`TRANSPOSE TRACK +${semitones}`);
        } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
          transposePattern(semitones);
          useUIStore.getState().setStatusMessage(`TRANSPOSE PATTERN +${semitones}`);
        } else if (e.altKey) {
          transposeSelection(semitones);
          useUIStore.getState().setStatusMessage(`TRANSPOSE BLOCK +${semitones}`);
        } else {
          // Shift+Ctrl = octave transpose on pattern
          transposePattern(semitones);
          useUIStore.getState().setStatusMessage(`TRANSPOSE PATTERN +${semitones}`);
        }
        return;
      }
      if (key === 'F8' && (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey)
          && useEditorStore.getState().activeBehavior.fKeyTranspose) {
        e.preventDefault();
        const octaveJump = e.shiftKey && (e.ctrlKey || e.metaKey);
        const semitones = octaveJump ? 12 : 1;
        if (e.shiftKey && !(e.ctrlKey || e.metaKey)) {
          transposeTrack(cursorRef.current.channelIndex, -semitones);
          useUIStore.getState().setStatusMessage(`TRANSPOSE TRACK -${semitones}`);
        } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
          transposePattern(-semitones);
          useUIStore.getState().setStatusMessage(`TRANSPOSE PATTERN -${semitones}`);
        } else if (e.altKey) {
          transposeSelection(-semitones);
          useUIStore.getState().setStatusMessage(`TRANSPOSE BLOCK -${semitones}`);
        } else {
          // Shift+Ctrl = octave transpose on pattern
          transposePattern(-semitones);
          useUIStore.getState().setStatusMessage(`TRANSPOSE PATTERN -${semitones}`);
        }
        return;
      }

      // Standard Ctrl+C/X/V shortcuts
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
          pasteMix();
          useUIStore.getState().setStatusMessage('MIX PASTE');
        } else {
          // Try internal clipboard first, then system clipboard for MPT format
          const hasInternal = !!useTrackerStore.getState().clipboard;
          if (hasInternal) {
            paste();
            useUIStore.getState().setStatusMessage('PASTE');
          } else {
            // Try reading MPT/Furnace format from system clipboard
            navigator.clipboard.readText().then(text => {
              const mpt = parseMPTClipboard(text);
              if (mpt && mpt.rows.length > 0) {
                const { cursor } = useCursorStore.getState();
                const store = useTrackerStore.getState();
                const pattern = store.patterns[store.currentPatternIndex];
                if (!pattern) return;
                for (let r = 0; r < mpt.rows.length; r++) {
                  const targetRow = cursor.rowIndex + r;
                  if (targetRow >= pattern.length) break;
                  for (let ch = 0; ch < mpt.rows[r].length; ch++) {
                    const targetCh = cursor.channelIndex + ch;
                    if (targetCh >= pattern.channels.length) break;
                    store.setCell(targetCh, targetRow, mpt.rows[r][ch]);
                  }
                }
                useUIStore.getState().setStatusMessage('PASTE (MPT)');
              } else {
                paste(); // fallback to internal
                useUIStore.getState().setStatusMessage('PASTE');
              }
            }).catch(() => {
              paste(); // clipboard API denied, use internal
              useUIStore.getState().setStatusMessage('PASTE');
            });
          }
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && keyLower === 'f') {
        e.preventDefault();
        pasteFlood();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && keyLower === 'i') {
        e.preventDefault();
        pastePushForward();
        return;
      }

      // I key (no modifiers): Interpolate values in selection (only on volume column)
      if (keyLower === 'i' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && cursorRef.current.columnType === 'volume') {
        e.preventDefault();
        if (selectionRef.current) {
          const startRow = Math.min(selectionRef.current.startRow, selectionRef.current.endRow);
          const endRow = Math.max(selectionRef.current.startRow, selectionRef.current.endRow);
          const channel = cursorRef.current.channelIndex;

          const startCell = pattern.channels[channel].rows[startRow];
          const endCell = pattern.channels[channel].rows[endRow];
          const startValue = startCell.volume || 0;
          const endValue = endCell.volume || 64;

          interpolateSelection('volume', startValue, endValue, 'linear');
          useUIStore.getState().setStatusMessage(`INTERPOLATE: ${startValue} → ${endValue}`);
        } else {
          useUIStore.getState().setStatusMessage('SELECT VOLUME RANGE FIRST');
        }
        return;
      }

      // Ctrl+H: Chord tool (expand note into chord)
      if ((e.ctrlKey || e.metaKey) && keyLower === 'h' && !e.altKey) {
        e.preventDefault();
        if (cursorRef.current.columnType === 'note') {
          const currentCell = pattern.channels[cursorRef.current.channelIndex].rows[cursorRef.current.rowIndex];
          if (currentCell.note && currentCell.note > 0 && currentCell.note < 97) {
            const rootNote = currentCell.note;
            const third = rootNote + 4;
            const fifth = rootNote + 7;

            if (cursorRef.current.channelIndex + 2 < pattern.channels.length) {
              setCell(cursorRef.current.channelIndex + 1, cursorRef.current.rowIndex, {
                note: third,
                instrument: currentCell.instrument
              });
              setCell(cursorRef.current.channelIndex + 2, cursorRef.current.rowIndex, {
                note: fifth,
                instrument: currentCell.instrument
              });
              useUIStore.getState().setStatusMessage('CHORD: MAJOR');
            } else {
              useUIStore.getState().setStatusMessage('CHORD: NOT ENOUGH CHANNELS');
            }
          } else {
            useUIStore.getState().setStatusMessage('CHORD: NO NOTE');
          }
        }
        return;
      }

      // Escape: Clear selection, or double-Esc to kill all notes (panic)
      if (key === 'Escape') {
        e.preventDefault();

        const now = Date.now();
        const timeSinceLastEsc = now - lastEscPressRef.current;

        if (timeSinceLastEsc < 500) {
          getToneEngine().releaseAll();
          useUIStore.getState().setStatusMessage('PANIC - ALL NOTES OFF');
          lastEscPressRef.current = 0;
        } else {
          clearSelection();
          lastEscPressRef.current = now;
        }
        return;
      }

      // ============================================
      // Miscellaneous
      // ============================================

      // FT2: Right Shift = Play song from start, Right Alt = Play pattern from start
      // Handled by the global keyboard handler (useGlobalKeyboardHandler.ts) which uses
      // forcePosition() for tight restart. Do NOT duplicate here — the dual handling
      // caused stop/play cycles that broke rapid-fire restart.
      if (e.key === 'Shift' && e.location === 2) return;

      // FT2: Right Ctrl = Play song (handled by global handler via scheme)
      if (e.key === 'Control' && e.location === 2) return;

      // FT2: Right Alt = Play pattern from start
      // Handled by global keyboard handler via forcePosition() for tight restart.
      if (e.key === 'Alt' && e.location === 2) return;

      // Space: Behavior-aware (FT2: play/stop or edit toggle, IT: always toggle edit, Renoise: play/stop)
      if (key === ' ') {
        const behavior = useEditorStore.getState().activeBehavior;
        e.preventDefault();

        switch (behavior.spaceBehavior) {
          case 'play-stop-or-edit':
            // FT2: If playing → stop. If stopped → toggle edit mode.
            if (isPlaying) {
              getTrackerReplayer().stop();
              stop();
              getToneEngine().releaseAll();
              useUIStore.getState().setStatusMessage('STOPPED');
            } else {
              if (!recordMode && !isPatternEditable) {
                useUIStore.getState().openNonEditableDialog();
                return;
              }
              toggleRecordMode();
              const isRec = useEditorStore.getState().recordMode;
              useUIStore.getState().setStatusMessage(isRec ? 'RECORD ON' : 'RECORD OFF');
            }
            break;
          case 'toggle-edit': {
            // IT: In edit mode, Space on an empty cell pastes current instrument from mask
            if (behavior.itSpaceCopyMask && recordMode) {
              const ch = cursorRef.current.channelIndex;
              const row = cursorRef.current.rowIndex;
              const cell = pattern.channels[ch]?.rows[row];
              if (cell && cell.note === 0) {
                const { currentInstrumentId, instruments } = (require('@stores/useInstrumentStore') as any).useInstrumentStore.getState();
                const idx = instruments.findIndex((i: any) => i.id === currentInstrumentId);
                if (idx >= 0) {
                  setCell(ch, row, { instrument: idx + 1 });
                }
                if (editStep > 0 && !isPlaying) {
                  moveCursorToRow((cursorRef.current.rowIndex + editStep) % pattern.length);
                }
                return;
              }
            }
            // Always toggle edit mode regardless of play state.
            if (!recordMode && !isPatternEditable) {
              useUIStore.getState().openNonEditableDialog();
              return;
            }
            toggleRecordMode();
            const isRec = useEditorStore.getState().recordMode;
            useUIStore.getState().setStatusMessage(isRec ? 'RECORD ON' : 'RECORD OFF');
            break;
          }
          case 'play-stop':
            // Renoise: Always play/stop, never toggles edit.
            if (isPlaying) {
              getTrackerReplayer().stop();
              stop();
              getToneEngine().releaseAll();
              useUIStore.getState().setStatusMessage('STOPPED');
            } else {
              const ctx = (Tone.getContext() as any).rawContext as AudioContext;
              if (ctx.state === 'running') {
                play();
              } else {
                getToneEngine().init().then(() => play());
              }
              useUIStore.getState().setStatusMessage('PLAYING');
            }
            break;
        }
        return;
      }

      // Ctrl+Enter: Play song
      if (key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (isPlaying) stop();
        setIsLooping(false);
        // Fast path: skip async init when AudioContext is already running
        const ctx = (Tone.getContext() as any).rawContext as AudioContext;
        if (ctx.state === 'running') {
          play();
        } else {
          getToneEngine().init().then(() => play());
        }
        useUIStore.getState().setStatusMessage('PLAYING');
        return;
      }

      // ── Delegate to note input (CapsLock, F1-F7, octave, grave, piano keys) ──
      if (noteInput.handleKeyDown(e)) return;

      // ── Delegate to effect input (instrument, volume, effect, flag, probability columns) ──
      if (effectInput.handleKeyDown(e)) return;
    },
    [
      pattern,
      patterns,
      currentPatternIndex,
      isPlaying,
      playbackRow,
      recordMode,
      toggleRecordMode,
      editStep,
      moveCursor,
      moveCursorToRow,
      setCell,
      clearCell,
      stop,
      play,
      clearSelection,
      copySelection,
      cutSelection,
      copyTrack, cutTrack, pasteTrack,
      copyPattern, cutPattern, pastePattern,
      transposeTrack, transposePattern,
      paste,
      pasteMix,
      pasteFlood,
      pastePushForward,
      handleInsertRow,
      handleDeleteRow,
      deleteByCursorField,
      transposeSelection,
      readMacroSlot,
      writeMacroSlot,
      toggleInsertMode,
      replacePattern,
      interpolateSelection,
      insertRow,
      setIsLooping,
      isPatternEditable,
      navInput,
      noteInput,
      effectInput,
    ]
  );

  // Handle key release
  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      const activeView = useUIStore.getState().activeView;
      if (activeView !== 'tracker') {
        return;
      }

      navInput.handleKeyUp(e);
      noteInput.handleKeyUp(e);
    },
    [navInput, noteInput]
  );

  // Attach keyboard listeners (re-registers when handlers change identity)
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [handleKeyDown, handleKeyUp]);

  // Cleanup RAF only on unmount — NOT when handlers re-register
  useEffect(() => {
    return () => { navInput.cleanup(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    previewNote: noteInput.previewNote,
    enterNote: noteInput.enterNote,
    currentOctave: noteInput.currentOctave,
    setCurrentOctave: noteInput.setCurrentOctave,
  };
};
