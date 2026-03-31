/**
 * useNavigationInput - Cursor movement, page up/down, track jump, bookmark jump.
 * Handles F9-F12 pattern jumps, PageUp/Down, Home/End, Tab, Alt+track jumps,
 * and arrow keys with RAF-driven smooth scrolling.
 */

import { useCallback, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTrackerStore, useCursorStore, useTransportStore, useFormatStore } from '@stores';
import { useEditorStore } from '@stores/useEditorStore';
import * as Tone from 'tone';
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
  const heldArrowRef = useRef<{ dir: 'up' | 'down' | 'left' | 'right'; selecting: boolean } | null>(null);
  const arrowRafRef = useRef(0);
  const moveCursorRef = useRef(moveCursor);
  moveCursorRef.current = moveCursor;
  const endSelectionRef = useRef(endSelection);
  endSelectionRef.current = endSelection;

  // Handle navigation keydown events. Returns true if handled.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent): boolean => {
      // Skip if already handled by the global keyboard handler (capture-phase)
      if ((e as any).__handled) return false;

      // Format modes handle arrows/tab/page in PatternEditorCanvas.handleFormatKeyDown.
      // Skip when that div has focus to avoid double-move.
      if (useFormatStore.getState().editorMode !== 'classic') {
        const target = e.target as HTMLElement;
        if (target?.dataset?.patternEditor) return false;
      }

      const key = e.key;
      const keyLower = key.toLowerCase();

      // Fast play: skip async ToneEngine.init() when AudioContext is already running
      const playFast = () => {
        const ctx = (Tone.getContext() as any).rawContext as AudioContext;
        if (ctx.state === 'running') {
          play();
        } else {
          getToneEngine().init().then(() => play());
        }
      };

      // F9-F12: Jump in pattern (FT2-style) — disabled during playback
      if (key === 'F9') {
        if (isPlaying) return false;
        e.preventDefault();
        if (e.shiftKey) {
          setPtnJumpPos(0, cursorRef.current.rowIndex);
        } else if (e.ctrlKey || e.metaKey) {
          moveCursorToRow(getPtnJumpPos(0));
          setIsLooping(false);
          playFast();
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
          moveCursorToRow(getPtnJumpPos(1));
          setIsLooping(false);
          playFast();
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
          moveCursorToRow(getPtnJumpPos(2));
          setIsLooping(false);
          playFast();
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
          moveCursorToRow(getPtnJumpPos(3));
          setIsLooping(false);
          playFast();
        } else {
          moveCursorToRow(Math.floor(pattern.length * 0.75));
        }
        return true;
      }

      // PageUp: Jump N lines up (N = behavior.pageJumpSize) — disabled during playback
      if (key === 'PageUp') {
        if (isPlaying) return false;
        e.preventDefault();
        const jump = useEditorStore.getState().activeBehavior.pageJumpSize;
        moveCursorToRow(Math.max(0, cursorRef.current.rowIndex - jump));
        return true;
      }

      // PageDown: Jump N lines down (N = behavior.pageJumpSize) — disabled during playback
      if (key === 'PageDown') {
        if (isPlaying) return false;
        e.preventDefault();
        const jump = useEditorStore.getState().activeBehavior.pageJumpSize;
        moveCursorToRow(Math.min(pattern.length - 1, cursorRef.current.rowIndex + jump));
        return true;
      }

      // Home: behavior-aware (row-jump vs double-press)
      if (key === 'Home') {
        if (isPlaying) return false;
        e.preventDefault();
        const behavior = useEditorStore.getState().activeBehavior;
        if (behavior.homeEndBehavior === 'double-press') {
          // IT: first press = move to note column, second press = row 0
          if (cursorRef.current.columnType !== 'note') {
            moveCursorToColumn('note');
          } else {
            moveCursorToRow(0);
          }
        } else {
          moveCursorToRow(0);
        }
        return true;
      }

      // End: behavior-aware (row-jump vs double-press)
      if (key === 'End') {
        if (isPlaying) return false;
        e.preventDefault();
        const behavior = useEditorStore.getState().activeBehavior;
        if (behavior.homeEndBehavior === 'double-press') {
          // IT: first press = move to last column, second press = last row
          const cols = useCursorStore.getState().getColumnsForChannel(cursorRef.current.channelIndex);
          const lastColType = cols && cols.length > 0 ? cols[cols.length - 1].type : 'effParam';
          if (cursorRef.current.columnType !== lastColType) {
            moveCursorToColumn(lastColType);
          } else {
            moveCursorToRow(pattern.length - 1);
          }
        } else {
          moveCursorToRow(pattern.length - 1);
        }
        return true;
      }

      // Tab/Shift+Tab: behavior-aware channel/column navigation
      if (key === 'Tab') {
        e.preventDefault();
        const behavior = useEditorStore.getState().activeBehavior;

        if (behavior.tabBehavior === 'cycle-columns') {
          // IT/Renoise/OpenMPT: Tab cycles columns within channel, then next channel
          const cols = useCursorStore.getState().getColumnsForChannel(cursorRef.current.channelIndex);
          if (e.shiftKey) {
            // Check if we're at the first column
            const isFirstCol = cols && cols.length > 0 &&
              cursorRef.current.columnType === cols[0].type &&
              (cursorRef.current.noteColumnIndex ?? 0) === cols[0].nci &&
              (cursorRef.current.digitIndex ?? 0) === 0;
            if (isFirstCol) {
              // At first column — move to previous channel's last column
              const prevCh = cursorRef.current.channelIndex > 0
                ? cursorRef.current.channelIndex - 1
                : pattern.channels.length - 1;
              moveCursorToChannel(prevCh);
              const prevCols = useCursorStore.getState().getColumnsForChannel(prevCh);
              if (prevCols && prevCols.length > 0) {
                moveCursorToColumn(prevCols[prevCols.length - 1].type);
              }
            } else {
              moveCursor('left');
            }
          } else {
            // Check if we're at the last column
            const isLastCol = cols && cols.length > 0 &&
              cursorRef.current.columnType === cols[cols.length - 1].type &&
              (cursorRef.current.noteColumnIndex ?? 0) === cols[cols.length - 1].nci;
            if (isLastCol) {
              // At last column — move to next channel's first column
              const nextCh = cursorRef.current.channelIndex < pattern.channels.length - 1
                ? cursorRef.current.channelIndex + 1
                : 0;
              moveCursorToChannel(nextCh);
              moveCursorToColumn('note');
            } else {
              moveCursor('right');
            }
          }
        } else {
          // FT2/PT: Tab jumps to next/prev channel note column
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
        }
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
      if (key === 'ArrowUp' || key === 'ArrowDown') {
        if (isPlaying) return false;
        e.preventDefault();
        const dir = key === 'ArrowUp' ? 'up' as const : 'down' as const;
        if (e.repeat) {
          e.stopImmediatePropagation();
          return true;
        }
        const behavior = useEditorStore.getState().activeBehavior;
        const selecting = behavior.selectionModifier === 'alt'
          ? (e.altKey || e.shiftKey)   // FT2: Alt+arrows select (also allow Shift for convenience)
          : e.shiftKey;                // IT/Renoise: Shift+arrows select
        if (selecting && !selectionRef.current) startSelection();
        moveCursor(dir);
        if (selecting) endSelection();
        // Start RAF-driven scroll (time-based throttle — refresh-rate independent)
        heldArrowRef.current = { dir, selecting };
        if (!arrowRafRef.current) {
          const keyDownTime = performance.now();
          let initialDelayPassed = false;
          let lastMoveTime = keyDownTime;
          const INITIAL_DELAY = 250; // ms before first repeat (matches typical OS key repeat delay)
          const MOVE_INTERVAL = 50; // ~20 moves/sec after initial delay
          const tick = (now: number) => {
            const held = heldArrowRef.current;
            if (!held) { arrowRafRef.current = 0; return; }
            if (!initialDelayPassed) {
              if (now - keyDownTime >= INITIAL_DELAY) {
                initialDelayPassed = true;
                lastMoveTime = now;
                moveCursorRef.current(held.dir);
                if (held.selecting) endSelectionRef.current();
              }
            } else if (now - lastMoveTime >= MOVE_INTERVAL) {
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
        if (e.repeat) {
          e.stopImmediatePropagation();
          return true;
        }
        const behavior = useEditorStore.getState().activeBehavior;
        const selecting = behavior.selectionModifier === 'alt' ? e.altKey : e.shiftKey;
        if (selecting && !selectionRef.current) startSelection();
        moveCursor('left');
        if (selecting) endSelection();
        heldArrowRef.current = { dir: 'left', selecting };
        if (!arrowRafRef.current) {
          const keyDownTime = performance.now();
          let initialDelayPassed = false;
          let lastMoveTime = keyDownTime;
          const INITIAL_DELAY = 250;
          const MOVE_INTERVAL = 50;
          const tick = (now: number) => {
            const held = heldArrowRef.current;
            if (!held) { arrowRafRef.current = 0; return; }
            if (!initialDelayPassed) {
              if (now - keyDownTime >= INITIAL_DELAY) {
                initialDelayPassed = true;
                lastMoveTime = now;
                moveCursorRef.current(held.dir);
                if (held.selecting) endSelectionRef.current();
              }
            } else if (now - lastMoveTime >= MOVE_INTERVAL) {
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

      if (key === 'ArrowRight') {
        e.preventDefault();
        if (e.repeat) {
          e.stopImmediatePropagation();
          return true;
        }
        const behavior = useEditorStore.getState().activeBehavior;
        const selecting = behavior.selectionModifier === 'alt' ? e.altKey : e.shiftKey;
        if (selecting && !selectionRef.current) startSelection();
        moveCursor('right');
        if (selecting) endSelection();
        heldArrowRef.current = { dir: 'right', selecting };
        if (!arrowRafRef.current) {
          const keyDownTime = performance.now();
          let initialDelayPassed = false;
          let lastMoveTime = keyDownTime;
          const INITIAL_DELAY = 250;
          const MOVE_INTERVAL = 50;
          const tick = (now: number) => {
            const held = heldArrowRef.current;
            if (!held) { arrowRafRef.current = 0; return; }
            if (!initialDelayPassed) {
              if (now - keyDownTime >= INITIAL_DELAY) {
                initialDelayPassed = true;
                lastMoveTime = now;
                moveCursorRef.current(held.dir);
                if (held.selecting) endSelectionRef.current();
              }
            } else if (now - lastMoveTime >= MOVE_INTERVAL) {
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
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
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
