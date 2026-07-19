/**
 * BlockOperations - Copy/Paste/Cut operations for tracker blocks
 * FT2-style block selection with Alt+B/E/C/V/X shortcuts
 *
 * PERF: This hook must NOT subscribe to cursor/selection via React hooks.
 * It's mounted in PixiTrackerView — any re-render cascades through the
 * entire @pixi/react reconciler + Yoga layout (~25ms). All cursor/selection
 * reads use getState() at call time instead.
 */

import { useCallback, useState } from 'react';
import { useTrackerStore, useCursorStore } from '@stores';
import { xmNoteToMidi, midiToXMNote } from '@/lib/xmConversions';
import { EMPTY_CELL, type TrackerCell } from '@typedefs';

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

      useTrackerStore.getState().bulkBlockEdit(
        `Transpose ${semitones > 0 ? '+' : ''}${semitones}`,
        (pattern) => {
          for (let ch = bounds.startChannel; ch <= bounds.endChannel; ch++) {
            for (let row = bounds.startRow; row <= bounds.endRow; row++) {
              const cell = pattern.channels[ch].rows[row];
              if (cell.note && cell.note !== 0 && cell.note !== 97) {
                const midiNote = xmNoteToMidi(cell.note);
                if (midiNote !== null) {
                  const newMidiNote = midiNote + semitones;
                  if (newMidiNote >= 12 && newMidiNote <= 107) {
                    cell.note = midiToXMNote(newMidiNote);
                  }
                }
              }
            }
          }
        },
      );
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

      useTrackerStore.getState().bulkBlockEdit('Amplify block', (pattern) => {
        for (let ch = bounds.startChannel; ch <= bounds.endChannel; ch++) {
          for (let row = bounds.startRow; row <= bounds.endRow; row++) {
            const cell = pattern.channels[ch].rows[row];
            if (cell.volume !== null) {
              cell.volume = Math.min(0x40, Math.max(0, Math.round(cell.volume * factor)));
            }
          }
        }
      });
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

      useTrackerStore.getState().bulkBlockEdit('Interpolate block', (pattern) => {
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
            pattern.channels[ch].rows[row][columnType] = interpolatedValue;
          }
        }
      });
    },
    [getBlockBounds]
  );

  /**
   * Reverse selection - flip row order within block
   */
  const reverseBlock = useCallback(() => {
    const bounds = getBlockBounds();
    if (!bounds) return;

    const rowCount = bounds.endRow - bounds.startRow + 1;
    if (rowCount < 2) return;

    useTrackerStore.getState().bulkBlockEdit('Reverse block', (pattern) => {
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
          pattern.channels[ch].rows[bounds.startRow + i] = { ...srcCell };
        }
      }
    });
  }, [getBlockBounds]);

  /**
   * Expand block - double the content by inserting empty rows between each row
   * Rows beyond the pattern end are clipped
   */
  const expandBlock = useCallback(() => {
    const bounds = getBlockBounds();
    if (!bounds) return;

    useTrackerStore.getState().bulkBlockEdit('Expand block', (pattern) => {
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
          pattern.channels[ch].rows[destRow] =
            i % 2 === 0 ? { ...snapshot[chIdx][i / 2] } : { ...EMPTY_CELL };
        }
      }
    });
  }, [getBlockBounds]);

  /**
   * Shrink block - compress content by removing every other row
   */
  const shrinkBlock = useCallback(() => {
    const bounds = getBlockBounds();
    if (!bounds) return;

    const rowCount = bounds.endRow - bounds.startRow + 1;
    if (rowCount < 2) return;

    useTrackerStore.getState().bulkBlockEdit('Shrink block', (pattern) => {
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
          pattern.channels[ch].rows[destRow] =
            srcIdx < rowCount ? { ...snapshot[chIdx][srcIdx] } : { ...EMPTY_CELL };
        }
      }
    });
  }, [getBlockBounds]);

  /**
   * Math operation on block values (volume or effect parameter)
   */
  const mathBlock = useCallback(
    (op: 'add' | 'sub' | 'mul' | 'div', value: number, column: 'volume' | 'eff') => {
      const bounds = getBlockBounds();
      if (!bounds) return;

      useTrackerStore.getState().bulkBlockEdit('Math block', (pattern) => {
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
            cell[column] = Math.max(0, Math.min(max, result));
          }
        }
      });
    },
    [getBlockBounds]
  );

  /**
   * Duplicate block in-place - repeat selection content to fill remaining pattern
   */
  const duplicateBlock = useCallback(() => {
    const bounds = getBlockBounds();
    if (!bounds) return;

    useTrackerStore.getState().bulkBlockEdit('Duplicate block', (pattern) => {
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
          pattern.channels[ch].rows[writeRow] = { ...snapshot[chIdx][srcIdx] };
        }
        writeRow++;
      }
    });
  }, [getBlockBounds]);

  // NOTE: FT2 Alt block shortcuts (Alt+B/E/C/V/P/X/T/Shift+T/R) are owned by the
  // single keyboard pipeline in useTrackerInput (via resolveFt2BlockKey). This
  // hook exposes only the operation FUNCTIONS below, consumed by the block
  // toolbar; it deliberately installs NO window keydown listener of its own.

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
