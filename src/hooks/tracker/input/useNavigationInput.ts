/**
 * useNavigationInput - Cursor movement, page up/down, track jump, bookmark jump.
 * Handles F9-F12 pattern jumps, PageUp/Down, Home/End, Tab, Alt+track jumps,
 * and arrow keys with RAF-driven smooth scrolling.
 */

import { useCallback, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTrackerStore, useCursorStore, useTransportStore, useFormatStore } from '@stores';
import { useEditorStore } from '@stores/useEditorStore';
import { getToneEngine } from '@engine/ToneEngine';
import { ALT_TRACK_MAP_1, ALT_TRACK_MAP_2, type TrackerInputRefs } from './inputConstants';

export const useNavigationInput = (refs: TrackerInputRefs) => {
  const { cursorRef, selectionRef } = refs;

  const {
    patterns,
    currentPatternIndex,
  } = useTrackerStore(useShallow((state) => ({
    patterns: state.patterns,
    currentPatternIndex: state.currentPatternIndex,
  })));

  const setCurrentPattern = useTrackerStore((state) => state.setCurrentPattern);
  const setPtnJumpPos = useEditorStore((state) => state.setPtnJumpPos);
  const getPtnJumpPos = useEditorStore((state) => state.getPtnJumpPos);

  const moveCursor = useCursorStore((state) => state.moveCursor);
  const moveCursorToRow = useCursorStore((state) => state.moveCursorToRow);
  const moveCursorToChannel = useCursorStore((state) => state.moveCursorToChannel);
  const moveCursorToColumn = useCursorStore((state) => state.moveCursorToColumn);
  const startSelection = useCursorStore((state) => state.startSelection);
  const endSelection = useCursorStore((state) => state.endSelection);

  const {
    isPlaying,
    stop,
    play,
    setIsLooping,
  } = useTransportStore(useShallow((state) => ({
    isPlaying: state.isPlaying,
    stop: state.stop,
    play: state.play,
    setIsLooping: state.setIsLooping,
  })));

  const pattern = patterns[currentPatternIndex];

  // ── RAF-driven arrow key scrolling ──────────────────────────────────────────
  const heldArrowRef = useRef<{ dir: 'up' | 'down'; selecting: boolean } | null>(null);
  const arrowRafRef = useRef(0);
  const moveCursorRef = useRef(moveCursor);
  moveCursorRef.current = moveCursor;
  const endSelectionRef = useRef(endSelection);
  endSelectionRef.current = endSelection;

  // Handle navigation keydown events. Returns true if handled.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent): boolean => {
      // Format modes handle arrows/tab/page in PatternEditorCanvas.handleFormatKeyDown.
      // Skip when that div has focus to avoid double-move.
      if (useFormatStore.getState().editorMode !== 'classic') {
        const target = e.target as HTMLElement;
        if (target?.dataset?.patternEditor) return false;
      }

      const key = e.key;
      const keyLower = key.toLowerCase();

      // F9-F12: Jump in pattern (FT2-style) — disabled during playback
      if (key === 'F9') {
        if (isPlaying) return false;
        e.preventDefault();
        if (e.shiftKey) {
          setPtnJumpPos(0, cursorRef.current.rowIndex);
        } else if (e.ctrlKey || e.metaKey) {
          const jumpRow = getPtnJumpPos(0);
          moveCursorToRow(jumpRow);
          if (isPlaying) stop();
          setIsLooping(false);
          getToneEngine().init().then(() => play());
        } else {
          moveCursorToRow(0);
        }
        return true;
      }
      if (key === 'F10') {
        if (isPlaying) return false;
        e.preventDefault();
        if (e.shiftKey) {
          setPtnJumpPos(1, cursorRef.current.rowIndex);
        } else if (e.ctrlKey || e.metaKey) {
          const jumpRow = getPtnJumpPos(1);
          moveCursorToRow(jumpRow);
          if (isPlaying) stop();
          setIsLooping(false);
          getToneEngine().init().then(() => play());
        } else {
          moveCursorToRow(Math.floor(pattern.length * 0.25));
        }
        return true;
      }
      if (key === 'F11') {
        if (isPlaying) return false;
        e.preventDefault();
        if (e.shiftKey) {
          setPtnJumpPos(2, cursorRef.current.rowIndex);
        } else if (e.ctrlKey || e.metaKey) {
          const jumpRow = getPtnJumpPos(2);
          moveCursorToRow(jumpRow);
          if (isPlaying) stop();
          setIsLooping(false);
          getToneEngine().init().then(() => play());
        } else {
          moveCursorToRow(Math.floor(pattern.length * 0.5));
        }
        return true;
      }
      if (key === 'F12') {
        if (isPlaying) return false;
        e.preventDefault();
        if (e.shiftKey) {
          setPtnJumpPos(3, cursorRef.current.rowIndex);
        } else if (e.ctrlKey || e.metaKey) {
          const jumpRow = getPtnJumpPos(3);
          moveCursorToRow(jumpRow);
          if (isPlaying) stop();
          setIsLooping(false);
          getToneEngine().init().then(() => play());
        } else {
          moveCursorToRow(Math.floor(pattern.length * 0.75));
        }
        return true;
      }

      // PageUp: Jump 16 lines up — disabled during playback
      if (key === 'PageUp') {
        if (isPlaying) return false;
        e.preventDefault();
        moveCursorToRow(Math.max(0, cursorRef.current.rowIndex - 16));
        return true;
      }

      // PageDown: Jump 16 lines down — disabled during playback
      if (key === 'PageDown') {
        if (isPlaying) return false;
        e.preventDefault();
        moveCursorToRow(Math.min(pattern.length - 1, cursorRef.current.rowIndex + 16));
        return true;
      }

      // Home: Jump to line 0 — disabled during playback
      if (key === 'Home') {
        if (isPlaying) return false;
        e.preventDefault();
        moveCursorToRow(0);
        return true;
      }

      // End: Jump to last line — disabled during playback
      if (key === 'End') {
        if (isPlaying) return false;
        e.preventDefault();
        moveCursorToRow(pattern.length - 1);
        return true;
      }

      // Tab/Shift+Tab: Jump to next/previous track (with wrapping)
      if (key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          if (cursorRef.current.columnType === 'note') {
            if (cursorRef.current.channelIndex > 0) {
              moveCursorToChannel(cursorRef.current.channelIndex - 1);
            } else {
              moveCursorToChannel(pattern.channels.length - 1);
            }
          }
        } else {
          if (cursorRef.current.channelIndex < pattern.channels.length - 1) {
            moveCursorToChannel(cursorRef.current.channelIndex + 1);
          } else {
            moveCursorToChannel(0);
          }
        }
        moveCursorToColumn('note');
        return true;
      }

      // Alt+Q..I: Jump to track 0-7
      if (e.altKey && ALT_TRACK_MAP_1[keyLower] !== undefined) {
        e.preventDefault();
        const track = ALT_TRACK_MAP_1[keyLower] % pattern.channels.length;
        moveCursorToChannel(track);
        moveCursorToColumn('note');
        return true;
      }

      // Alt+A..K: Jump to track 8-15
      if (e.altKey && ALT_TRACK_MAP_2[keyLower] !== undefined) {
        e.preventDefault();
        const track = ALT_TRACK_MAP_2[keyLower] % pattern.channels.length;
        moveCursorToChannel(track);
        moveCursorToColumn('note');
        return true;
      }

      // Arrow keys (up/down) — disabled during playback and in format modes
      // (format modes handle arrows in PatternEditorCanvas.handleFormatKeyDown)
      if (key === 'ArrowUp' || key === 'ArrowDown') {
        if (isPlaying) return false;
        e.preventDefault();
        const dir = key === 'ArrowUp' ? 'up' as const : 'down' as const;
        if (e.repeat) {
          e.stopImmediatePropagation();
          return true;
        }
        const selecting = e.altKey || e.shiftKey;
        if (selecting && !selectionRef.current) startSelection();
        moveCursor(dir);
        if (selecting) endSelection();
        // Start RAF-driven scroll (time-based throttle — refresh-rate independent)
        heldArrowRef.current = { dir, selecting };
        if (!arrowRafRef.current) {
          let lastMoveTime = performance.now(); // seed with current time to prevent immediate double-move
          const MOVE_INTERVAL = 50; // ~20 moves/sec regardless of refresh rate
          const tick = (now: number) => {
            const held = heldArrowRef.current;
            if (!held) { arrowRafRef.current = 0; return; }
            if (now - lastMoveTime >= MOVE_INTERVAL) {
              lastMoveTime = now;
              moveCursorRef.current(held.dir);
              if (held.selecting) endSelectionRef.current();
            }
            arrowRafRef.current = requestAnimationFrame(tick);
          };
          arrowRafRef.current = requestAnimationFrame(tick);
        }
        return true;
      }

      if (key === 'ArrowLeft') {
        e.preventDefault();
        if (isPlaying) {
          moveCursor('left');
        } else if (e.shiftKey && !e.altKey) {
          if (currentPatternIndex > 0) setCurrentPattern(currentPatternIndex - 1);
        } else if (e.altKey) {
          if (!selectionRef.current) startSelection();
          moveCursor('left');
          endSelection();
        } else {
          moveCursor('left');
        }
        return true;
      }

      if (key === 'ArrowRight') {
        e.preventDefault();
        if (isPlaying) {
          moveCursor('right');
        } else if (e.shiftKey && !e.altKey) {
          if (currentPatternIndex < patterns.length - 1) setCurrentPattern(currentPatternIndex + 1);
        } else if (e.altKey) {
          if (!selectionRef.current) startSelection();
          moveCursor('right');
          endSelection();
        } else {
          moveCursor('right');
        }
        return true;
      }

      return false;
    },
    [
      pattern, patterns, currentPatternIndex, isPlaying,
      moveCursor, moveCursorToRow, moveCursorToChannel, moveCursorToColumn,
      setCurrentPattern, startSelection, endSelection,
      stop, play, setIsLooping, setPtnJumpPos, getPtnJumpPos,
      cursorRef, selectionRef,
    ]
  );

  // Handle navigation keyup events. Returns true if handled.
  const handleKeyUp = useCallback(
    (e: KeyboardEvent): boolean => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        heldArrowRef.current = null;
        return true;
      }
      return false;
    },
    []
  );

  // Cleanup RAF on unmount
  const cleanup = useCallback(() => {
    if (arrowRafRef.current) {
      cancelAnimationFrame(arrowRafRef.current);
      arrowRafRef.current = 0;
    }
    heldArrowRef.current = null;
  }, []);

  return useMemo(() => ({ handleKeyDown, handleKeyUp, cleanup }), [handleKeyDown, handleKeyUp, cleanup]);
};
