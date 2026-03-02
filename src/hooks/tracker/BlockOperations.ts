/**
 * BlockOperations - Copy/Paste/Cut operations for tracker blocks
 * FT2-style block selection with Alt+B/E/C/V/X shortcuts
 *
 * PERF: This hook must NOT subscribe to cursor/selection via React hooks.
 * It's mounted in PixiTrackerView — any re-render cascades through the
 * entire @pixi/react reconciler + Yoga layout (~25ms). All cursor/selection
 * reads use getState() at call time instead.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTrackerStore, useCursorStore } from '@stores';
import { xmNoteToMidi, midiToXMNote } from '@/lib/xmConversions';
import type { TrackerCell } from '@typedefs';

/** Which cell columns block operations should affect */
export interface ContentMask {
  note: boolean;
  instrument: boolean;
  volume: boolean;
  effect: boolean;
  effect2: boolean;
}

export const DEFAULT_CONTENT_MASK: ContentMask = {
  note: true,
  instrument: true,
  volume: true,
  effect: true,
  effect2: true,
};

export interface BlockOperationsState {
  blockStartMarked: boolean;
  blockEndMarked: boolean;
  isBlockSelected: boolean;
}

export const useBlockOperations = () => {
  // PERF: NO React hooks for ANY store — use getState() at call time.
  // useBlockOperations() is called in PixiTrackerView; any re-render here
  // cascades through the entire @pixi/react reconciler + Yoga layout (~25ms).

  const [blockState, setBlockState] = useState<BlockOperationsState>({
    blockStartMarked: false,
    blockEndMarked: false,
    isBlockSelected: false,
  });

  /**
   * Mark block start (Alt+B)
   */
  const markBlockStart = useCallback(() => {
    useCursorStore.getState().startSelection();
    setBlockState((prev) => ({
      ...prev,
      blockStartMarked: true,
      blockEndMarked: false,
      isBlockSelected: false,
    }));
  }, []);

  const markBlockEnd = useCallback(() => {
    useCursorStore.getState().endSelection();
    setBlockState((prev) => ({
      ...prev,
      blockEndMarked: true,
      isBlockSelected: true,
    }));
  }, []);

  const copyBlock = useCallback(() => {
    if (!useCursorStore.getState().selection) { console.warn('No block selected'); return; }
    useTrackerStore.getState().copySelection();
  }, []);

  const pasteBlock = useCallback(() => {
    if (!useTrackerStore.getState().clipboard) { console.warn('No clipboard data'); return; }
    useTrackerStore.getState().paste();
  }, []);

  const cutBlock = useCallback(() => {
    if (!useCursorStore.getState().selection) { console.warn('No block selected'); return; }
    useTrackerStore.getState().cutSelection();
    setBlockState({ blockStartMarked: false, blockEndMarked: false, isBlockSelected: false });
  }, []);

  const clearBlock = useCallback(() => {
    useCursorStore.getState().clearSelection();
    setBlockState({ blockStartMarked: false, blockEndMarked: false, isBlockSelected: false });
  }, []);

  /**
   * Get normalized block bounds
   */
  const getBlockBounds = useCallback((): {
    startChannel: number;
    endChannel: number;
    startRow: number;
    endRow: number;
  } | null => {
    const selection = useCursorStore.getState().selection;
    if (!selection) return null;

    return {
      startChannel: Math.min(selection.startChannel, selection.endChannel),
      endChannel: Math.max(selection.startChannel, selection.endChannel),
      startRow: Math.min(selection.startRow, selection.endRow),
      endRow: Math.max(selection.startRow, selection.endRow),
    };
  }, []);

  /**
   * Check if a cell is within the selected block
   */
  const isCellInBlock = useCallback(
    (channelIndex: number, rowIndex: number): boolean => {
      const bounds = getBlockBounds();
      if (!bounds) return false;

      return (
        channelIndex >= bounds.startChannel &&
        channelIndex <= bounds.endChannel &&
        rowIndex >= bounds.startRow &&
        rowIndex <= bounds.endRow
      );
    },
    [getBlockBounds]
  );

  /**
   * Transpose block (shift notes up/down by semitones)
   */
  const transposeBlock = useCallback(
    (semitones: number) => {
      const bounds = getBlockBounds();
      if (!bounds) return;

      const { patterns, currentPatternIndex, setCell } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];

      for (let ch = bounds.startChannel; ch <= bounds.endChannel; ch++) {
        for (let row = bounds.startRow; row <= bounds.endRow; row++) {
          const cell = pattern.channels[ch].rows[row];
          if (cell.note && cell.note !== 0 && cell.note !== 97) {
            const midiNote = xmNoteToMidi(cell.note);
            if (midiNote !== null) {
              const newMidiNote = midiNote + semitones;
              if (newMidiNote >= 12 && newMidiNote <= 107) {
                setCell(ch, row, { note: midiToXMNote(newMidiNote) });
              }
            }
          }
        }
      }
    },
    [getBlockBounds]
  );

  /**
   * Amplify block (multiply volume values)
   */
  const amplifyBlock = useCallback(
    (factor: number) => {
      const bounds = getBlockBounds();
      if (!bounds) return;

      const { patterns, currentPatternIndex, setCell } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];

      for (let ch = bounds.startChannel; ch <= bounds.endChannel; ch++) {
        for (let row = bounds.startRow; row <= bounds.endRow; row++) {
          const cell = pattern.channels[ch].rows[row];
          if (cell.volume !== null) {
            const newVolume = Math.min(0x40, Math.max(0, Math.round(cell.volume * factor)));
            setCell(ch, row, { volume: newVolume });
          }
        }
      }

    },
    [getBlockBounds]
  );

  /**
   * Interpolate values between block start and end
   */
  const interpolateBlock = useCallback(
    (columnType: 'volume' | 'cutoff' | 'resonance' | 'envMod' | 'pan') => {
      const bounds = getBlockBounds();
      if (!bounds) return;

      const { patterns, currentPatternIndex, setCell } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];

      for (let ch = bounds.startChannel; ch <= bounds.endChannel; ch++) {
        const startCell = pattern.channels[ch].rows[bounds.startRow];
        const endCell = pattern.channels[ch].rows[bounds.endRow];

        const startValue = (startCell[columnType] as number) || 0;
        const endValue = (endCell[columnType] as number) || 0;

        const rowCount = bounds.endRow - bounds.startRow;
        if (rowCount <= 1) continue;

        for (let i = 1; i < rowCount; i++) {
          const t = i / rowCount;
          const interpolatedValue = Math.round(startValue + (endValue - startValue) * t);
          const row = bounds.startRow + i;
          setCell(ch, row, { [columnType]: interpolatedValue });
        }
      }

    },
    [getBlockBounds]
  );

  /**
   * Reverse selection - flip row order within block
   */
  const reverseBlock = useCallback(() => {
    const bounds = getBlockBounds();
    if (!bounds) return;

    const { patterns, currentPatternIndex, setCell } = useTrackerStore.getState();
    const pattern = patterns[currentPatternIndex];

    const rowCount = bounds.endRow - bounds.startRow + 1;
    if (rowCount < 2) return;

    // Collect all cells in the block
    const snapshot: TrackerCell[][] = [];
    for (let ch = bounds.startChannel; ch <= bounds.endChannel; ch++) {
      const channelCells: TrackerCell[] = [];
      for (let row = bounds.startRow; row <= bounds.endRow; row++) {
        channelCells.push({ ...pattern.channels[ch].rows[row] });
      }
      snapshot.push(channelCells);
    }

    // Write back in reverse order
    for (let ch = bounds.startChannel; ch <= bounds.endChannel; ch++) {
      const chIdx = ch - bounds.startChannel;
      for (let i = 0; i < rowCount; i++) {
        const srcCell = snapshot[chIdx][rowCount - 1 - i];
        setCell(ch, bounds.startRow + i, {
          note: srcCell.note,
          instrument: srcCell.instrument,
          volume: srcCell.volume,
          effTyp: srcCell.effTyp,
          eff: srcCell.eff,
          effTyp2: srcCell.effTyp2,
          eff2: srcCell.eff2,
          flag1: srcCell.flag1,
          flag2: srcCell.flag2,
        });
      }
    }

  }, [getBlockBounds]);

  /**
   * Expand block - double the content by inserting empty rows between each row
   * Rows beyond the pattern end are clipped
   */
  const expandBlock = useCallback(() => {
    const bounds = getBlockBounds();
    if (!bounds) return;

    const { patterns, currentPatternIndex, setCell } = useTrackerStore.getState();
    const pattern = patterns[currentPatternIndex];

    const rowCount = bounds.endRow - bounds.startRow + 1;
    const patternLength = pattern.channels[0]?.rows.length || 64;

    // Snapshot the block
    const snapshot: TrackerCell[][] = [];
    for (let ch = bounds.startChannel; ch <= bounds.endChannel; ch++) {
      const channelCells: TrackerCell[] = [];
      for (let row = bounds.startRow; row <= bounds.endRow; row++) {
        channelCells.push({ ...pattern.channels[ch].rows[row] });
      }
      snapshot.push(channelCells);
    }

    // Write expanded: original rows at even positions, clear odd positions
    for (let ch = bounds.startChannel; ch <= bounds.endChannel; ch++) {
      const chIdx = ch - bounds.startChannel;
      for (let i = 0; i < rowCount * 2; i++) {
        const destRow = bounds.startRow + i;
        if (destRow >= patternLength) break;

        if (i % 2 === 0) {
          // Original row
          const srcCell = snapshot[chIdx][i / 2];
          setCell(ch, destRow, {
            note: srcCell.note,
            instrument: srcCell.instrument,
            volume: srcCell.volume,
            effTyp: srcCell.effTyp,
            eff: srcCell.eff,
            effTyp2: srcCell.effTyp2,
            eff2: srcCell.eff2,
            flag1: srcCell.flag1,
            flag2: srcCell.flag2,
          });
        } else {
          // Empty row
          setCell(ch, destRow, {
            note: 0,
            instrument: 0,
            volume: 0,
            effTyp: 0,
            eff: 0,
            effTyp2: 0,
            eff2: 0,
            flag1: 0,
            flag2: 0,
          });
        }
      }
    }

  }, [getBlockBounds]);

  /**
   * Shrink block - compress content by removing every other row
   */
  const shrinkBlock = useCallback(() => {
    const bounds = getBlockBounds();
    if (!bounds) return;

    const { patterns, currentPatternIndex, setCell } = useTrackerStore.getState();
    const pattern = patterns[currentPatternIndex];

    const rowCount = bounds.endRow - bounds.startRow + 1;
    if (rowCount < 2) return;

    // Snapshot the block
    const snapshot: TrackerCell[][] = [];
    for (let ch = bounds.startChannel; ch <= bounds.endChannel; ch++) {
      const channelCells: TrackerCell[] = [];
      for (let row = bounds.startRow; row <= bounds.endRow; row++) {
        channelCells.push({ ...pattern.channels[ch].rows[row] });
      }
      snapshot.push(channelCells);
    }

    // Write shrunk: take every other row, clear the rest
    for (let ch = bounds.startChannel; ch <= bounds.endChannel; ch++) {
      const chIdx = ch - bounds.startChannel;
      for (let i = 0; i < rowCount; i++) {
        const destRow = bounds.startRow + i;
        const srcIdx = i * 2;
        if (srcIdx < rowCount) {
          const srcCell = snapshot[chIdx][srcIdx];
          setCell(ch, destRow, {
            note: srcCell.note,
            instrument: srcCell.instrument,
            volume: srcCell.volume,
            effTyp: srcCell.effTyp,
            eff: srcCell.eff,
            effTyp2: srcCell.effTyp2,
            eff2: srcCell.eff2,
            flag1: srcCell.flag1,
            flag2: srcCell.flag2,
          });
        } else {
          // Clear remaining rows
          setCell(ch, destRow, {
            note: 0,
            instrument: 0,
            volume: 0,
            effTyp: 0,
            eff: 0,
            effTyp2: 0,
            eff2: 0,
            flag1: 0,
            flag2: 0,
          });
        }
      }
    }

  }, [getBlockBounds]);

  /**
   * Math operation on block values (volume or effect parameter)
   */
  const mathBlock = useCallback(
    (op: 'add' | 'sub' | 'mul' | 'div', value: number, column: 'volume' | 'eff') => {
      const bounds = getBlockBounds();
      if (!bounds) return;

      const { patterns, currentPatternIndex, setCell } = useTrackerStore.getState();
      const pattern = patterns[currentPatternIndex];

      for (let ch = bounds.startChannel; ch <= bounds.endChannel; ch++) {
        for (let row = bounds.startRow; row <= bounds.endRow; row++) {
          const cell = pattern.channels[ch].rows[row];
          const current = cell[column] as number;
          if (current === 0 && column === 'volume') continue; // skip empty volume

          let result: number;
          switch (op) {
            case 'add': result = current + value; break;
            case 'sub': result = current - value; break;
            case 'mul': result = Math.round(current * value); break;
            case 'div': result = value !== 0 ? Math.round(current / value) : current; break;
          }

          const max = column === 'volume' ? 0x50 : 0xFF;
          result = Math.max(0, Math.min(max, result));
          setCell(ch, row, { [column]: result });
        }
      }

    },
    [getBlockBounds]
  );

  /**
   * Duplicate block in-place - repeat selection content to fill remaining pattern
   */
  const duplicateBlock = useCallback(() => {
    const bounds = getBlockBounds();
    if (!bounds) return;

    const { patterns, currentPatternIndex, setCell } = useTrackerStore.getState();
    const pattern = patterns[currentPatternIndex];

    const rowCount = bounds.endRow - bounds.startRow + 1;
    const patternLength = pattern.channels[0]?.rows.length || 64;

    // Snapshot the block
    const snapshot: TrackerCell[][] = [];
    for (let ch = bounds.startChannel; ch <= bounds.endChannel; ch++) {
      const channelCells: TrackerCell[] = [];
      for (let row = bounds.startRow; row <= bounds.endRow; row++) {
        channelCells.push({ ...pattern.channels[ch].rows[row] });
      }
      snapshot.push(channelCells);
    }

    // Repeat from end of block to end of pattern
    let writeRow = bounds.endRow + 1;
    while (writeRow < patternLength) {
      for (let ch = bounds.startChannel; ch <= bounds.endChannel; ch++) {
        const chIdx = ch - bounds.startChannel;
        const srcIdx = (writeRow - bounds.endRow - 1) % rowCount;
        const srcCell = snapshot[chIdx][srcIdx];
        setCell(ch, writeRow, {
          note: srcCell.note,
          instrument: srcCell.instrument,
          volume: srcCell.volume,
          effTyp: srcCell.effTyp,
          eff: srcCell.eff,
          effTyp2: srcCell.effTyp2,
          eff2: srcCell.eff2,
          flag1: srcCell.flag1,
          flag2: srcCell.flag2,
        });
      }
      writeRow++;
    }

  }, [getBlockBounds]);

  /**
   * Handle keyboard shortcuts
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input field
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Alt+B - Mark block start
      if (e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        markBlockStart();
        return;
      }

      // Alt+E - Mark block end
      if (e.altKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        markBlockEnd();
        return;
      }

      // Alt+C - Copy block
      if (e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copyBlock();
        return;
      }

      // Alt+V or Alt+P - Paste block
      if (e.altKey && (e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'p')) {
        e.preventDefault();
        pasteBlock();
        return;
      }

      // Alt+X - Cut block
      if (e.altKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        cutBlock();
        return;
      }

      // Escape - Clear block selection
      if (e.key === 'Escape' && useCursorStore.getState().selection) {
        e.preventDefault();
        clearBlock();
        return;
      }

      // Alt+T - Transpose block up
      if (e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        transposeBlock(1);
        return;
      }

      // Alt+Shift+T - Transpose block down
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        transposeBlock(-1);
        return;
      }

      // Alt+R - Reverse block
      if (e.altKey && e.key.toLowerCase() === 'r' && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        reverseBlock();
        return;
      }

      // Alt+D - Duplicate block
      if (e.altKey && e.key.toLowerCase() === 'd' && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        duplicateBlock();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    markBlockStart,
    markBlockEnd,
    copyBlock,
    pasteBlock,
    cutBlock,
    clearBlock,
    transposeBlock,
    reverseBlock,
    duplicateBlock,
  ]);

  return {
    blockState,
    get selection() { return useCursorStore.getState().selection; },
    get clipboard() { return useTrackerStore.getState().clipboard; },
    markBlockStart,
    markBlockEnd,
    copyBlock,
    pasteBlock,
    cutBlock,
    clearBlock,
    isCellInBlock,
    getBlockBounds,
    transposeBlock,
    amplifyBlock,
    interpolateBlock,
    reverseBlock,
    expandBlock,
    shrinkBlock,
    mathBlock,
    duplicateBlock,
  };
};
