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
import { useHistoryStore } from '@stores/useHistoryStore';
import { getToneEngine } from '@engine/ToneEngine';
import { getTrackerReplayer } from '@engine/TrackerReplayer';
import { getTrackerScratchController } from '@engine/TrackerScratchController';
import { useNoteInput, useEffectInput, useNavigationInput } from './input';

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
  const transposeSelection = useTrackerStore((state) => state.transposeSelection);
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

  // A pattern is read-only when it was imported in UADE classic (playback-only) mode.
  const isPatternEditable = pattern?.importMetadata?.sourceFormat !== 'UADE';

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

  // Handle keyboard input — edit operations that remain in the composition hook
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Only handle keys when tracker view is active
      const activeView = useUIStore.getState().activeView;
      if (activeView !== 'tracker') {
        return;
      }

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
      // FT2: Insert/Delete Row Operations
      // ============================================

      if (key === 'Insert') {
        e.preventDefault();
        if (recordMode) {
          if (e.shiftKey) {
            for (let ch = 0; ch < pattern.channels.length; ch++) {
              insertRow(ch, cursorRef.current.rowIndex);
            }
          } else {
            handleInsertRow();
          }
        } else {
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

      // Delete: Different behaviors based on modifiers (requires edit mode)
      if (key === 'Delete' && recordMode) {
        e.preventDefault();
        if (e.shiftKey) {
          setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, {
            note: 0,
            instrument: 0,
            volume: 0,
            effTyp: 0,
            eff: 0,
          });
        } else if (e.ctrlKey || e.metaKey) {
          setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, {
            volume: 0,
            effTyp: 0,
            eff: 0,
          });
        } else if (e.altKey) {
          setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, {
            effTyp: 0,
            eff: 0,
          });
        } else {
          if (cursorRef.current.columnType === 'note') {
            setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { note: 0, instrument: 0 });
          } else if (cursorRef.current.columnType === 'instrument') {
            setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { instrument: 0 });
          } else if (cursorRef.current.columnType === 'volume') {
            setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { volume: 0 });
          } else if (cursorRef.current.columnType === 'effTyp' || cursorRef.current.columnType === 'effParam') {
            setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { effTyp: 0, eff: 0 });
          } else if (cursorRef.current.columnType === 'effTyp2' || cursorRef.current.columnType === 'effParam2') {
            setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { effTyp2: 0, eff2: 0 });
          } else if (cursorRef.current.columnType === 'probability') {
            setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { probability: undefined });
          } else {
            clearCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex);
          }
        }
        if (editStep > 0 && !isPlaying) {
          moveCursorToRow((cursorRef.current.rowIndex + editStep) % pattern.length);
        }
        return;
      }

      // Backspace: Delete previous note/line (requires edit mode)
      if (key === 'Backspace' && recordMode) {
        e.preventDefault();
        if (e.metaKey) {
          if (cursorRef.current.columnType === 'note') {
            setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { note: 0, instrument: 0 });
          } else if (cursorRef.current.columnType === 'instrument') {
            setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { instrument: 0 });
          } else if (cursorRef.current.columnType === 'volume') {
            setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { volume: 0 });
          } else if (cursorRef.current.columnType === 'effTyp' || cursorRef.current.columnType === 'effParam') {
            setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { effTyp: 0, eff: 0 });
          } else if (cursorRef.current.columnType === 'effTyp2' || cursorRef.current.columnType === 'effParam2') {
            setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { effTyp2: 0, eff2: 0 });
          } else if (cursorRef.current.columnType === 'probability') {
            setCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex, { probability: undefined });
          } else {
            clearCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex);
          }
          if (editStep > 0 && !isPlaying) {
            moveCursorToRow((cursorRef.current.rowIndex + editStep) % pattern.length);
          }
        } else if (e.shiftKey) {
          if (cursorRef.current.rowIndex > 0) {
            moveCursor('up');
            handleDeleteRow();
          }
        } else {
          if (cursorRef.current.rowIndex > 0) {
            moveCursor('up');
            clearCell(cursorRef.current.channelIndex, cursorRef.current.rowIndex);
          } else {
            clearCell(cursorRef.current.channelIndex, 0);
          }
        }
        return;
      }

      // F3/F4/F5 with modifiers: Cut/Copy/Paste operations
      if (key === 'F3') {
        e.preventDefault();
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
          cutSelection();
        }
        return;
      }

      if (key === 'F4') {
        e.preventDefault();
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
          copySelection();
        }
        return;
      }

      if (key === 'F5') {
        e.preventDefault();
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
          paste();
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
          paste();
          useUIStore.getState().setStatusMessage('PASTE');
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

      // FT2: Right Shift = Record pattern (play with recording)
      if (e.key === 'Shift' && e.location === 2) {
        if (getTrackerScratchController().isActive) return;
        e.preventDefault();
        if (!recordMode) {
          if (!isPatternEditable) {
            useUIStore.getState().openNonEditableDialog();
            return;
          }
          toggleRecordMode();
        }
        if (isPlaying) stop();
        setIsLooping(true);
        getToneEngine().init().then(() => play());
        return;
      }

      // FT2: Right Ctrl = Play song
      if (e.key === 'Control' && e.location === 2) {
        if (getTrackerScratchController().isActive) return;
        e.preventDefault();
        if (isPlaying) stop();
        setIsLooping(false);
        getToneEngine().init().then(() => play());
        return;
      }

      // FT2: Right Alt = Play pattern
      if (e.key === 'Alt' && e.location === 2) {
        if (getTrackerScratchController().isActive) return;
        e.preventDefault();
        if (isPlaying) stop();
        setIsLooping(true);
        getToneEngine().init().then(() => play());
        return;
      }

      // Space: Toggle edit mode or stop (FT2 style)
      if (key === ' ') {
        e.preventDefault();

        if (isPlaying) {
          const stoppedRow = playbackRow;
          getTrackerReplayer().stop();
          stop();
          getToneEngine().releaseAll();
          // Move edit cursor to where playback stopped
          useCursorStore.getState().moveCursorToRow(stoppedRow);
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
        return;
      }

      // Ctrl+Enter: Play song
      if (key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (isPlaying) stop();
        setIsLooping(false);
        getToneEngine().init().then(() => play());
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
      paste,
      pasteMix,
      pasteFlood,
      pastePushForward,
      handleInsertRow,
      handleDeleteRow,
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
