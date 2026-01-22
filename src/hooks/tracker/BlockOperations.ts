/**
 * BlockOperations - Copy/Paste/Cut operations for tracker blocks
 * FT2-style block selection with Alt+B/E/C/V/X shortcuts
 */

import { useCallback, useEffect, useState } from 'react';
import { useTrackerStore } from '@stores';
import { xmNoteToMidi, midiToXMNote } from '@/lib/xmConversions';
// Types imported for future use
// import type { TrackerCell, BlockSelection } from '@typedefs';

export interface BlockOperationsState {
  blockStartMarked: boolean;
  blockEndMarked: boolean;
  isBlockSelected: boolean;
}

export const useBlockOperations = () => {
  const {
    cursor,
    selection,
    clipboard,
    patterns,
    currentPatternIndex,
    startSelection,
    endSelection,
    clearSelection,
    copySelection,
    cutSelection,
    paste,
    setCell,
  } = useTrackerStore();

  const [blockState, setBlockState] = useState<BlockOperationsState>({
    blockStartMarked: false,
    blockEndMarked: false,
    isBlockSelected: false,
  });

  const pattern = patterns[currentPatternIndex];

  /**
   * Mark block start (Alt+B)
   */
  const markBlockStart = useCallback(() => {
    startSelection();
    setBlockState((prev) => ({
      ...prev,
      blockStartMarked: true,
      blockEndMarked: false,
      isBlockSelected: false,
    }));
    console.log('Block start marked at row', cursor.rowIndex, 'channel', cursor.channelIndex);
  }, [startSelection, cursor]);

  /**
   * Mark block end (Alt+E)
   */
  const markBlockEnd = useCallback(() => {
    endSelection();
    setBlockState((prev) => ({
      ...prev,
      blockEndMarked: true,
      isBlockSelected: true,
    }));
    console.log('Block end marked at row', cursor.rowIndex, 'channel', cursor.channelIndex);
  }, [endSelection, cursor]);

  /**
   * Copy block (Alt+C)
   */
  const copyBlock = useCallback(() => {
    if (!selection) {
      console.warn('No block selected');
      return;
    }

    copySelection();
    console.log('Block copied:', selection);
  }, [selection, copySelection]);

  /**
   * Paste block (Alt+V or Alt+P)
   */
  const pasteBlock = useCallback(() => {
    if (!clipboard) {
      console.warn('No clipboard data');
      return;
    }

    paste();
    console.log('Block pasted at row', cursor.rowIndex, 'channel', cursor.channelIndex);
  }, [clipboard, paste, cursor]);

  /**
   * Cut block (Alt+X) - copy + clear
   */
  const cutBlock = useCallback(() => {
    if (!selection) {
      console.warn('No block selected');
      return;
    }

    cutSelection();
    setBlockState({
      blockStartMarked: false,
      blockEndMarked: false,
      isBlockSelected: false,
    });
    console.log('Block cut:', selection);
  }, [selection, cutSelection]);

  /**
   * Clear block selection (Escape)
   */
  const clearBlock = useCallback(() => {
    clearSelection();
    setBlockState({
      blockStartMarked: false,
      blockEndMarked: false,
      isBlockSelected: false,
    });
    console.log('Block selection cleared');
  }, [clearSelection]);

  /**
   * Get normalized block bounds
   */
  const getBlockBounds = useCallback((): {
    startChannel: number;
    endChannel: number;
    startRow: number;
    endRow: number;
  } | null => {
    if (!selection) return null;

    return {
      startChannel: Math.min(selection.startChannel, selection.endChannel),
      endChannel: Math.max(selection.startChannel, selection.endChannel),
      startRow: Math.min(selection.startRow, selection.endRow),
      endRow: Math.max(selection.startRow, selection.endRow),
    };
  }, [selection]);

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

      for (let ch = bounds.startChannel; ch <= bounds.endChannel; ch++) {
        for (let row = bounds.startRow; row <= bounds.endRow; row++) {
          const cell = pattern.channels[ch].rows[row];
          // Skip empty cells (0) and note-offs (97)
          if (cell.note && cell.note !== 0 && cell.note !== 97) {
            // Convert XM note to MIDI
            const midiNote = xmNoteToMidi(cell.note);
            if (midiNote !== null) {
              const newMidiNote = midiNote + semitones;

              // Clamp to valid MIDI range
              if (newMidiNote >= 12 && newMidiNote <= 107) {
                const newXmNote = midiToXMNote(newMidiNote);
                setCell(ch, row, { note: newXmNote });
              }
            }
          }
        }
      }

      console.log(`Block transposed by ${semitones} semitones`);
    },
    [getBlockBounds, pattern, setCell]
  );

  /**
   * Amplify block (multiply volume values)
   */
  const amplifyBlock = useCallback(
    (factor: number) => {
      const bounds = getBlockBounds();
      if (!bounds) return;

      for (let ch = bounds.startChannel; ch <= bounds.endChannel; ch++) {
        for (let row = bounds.startRow; row <= bounds.endRow; row++) {
          const cell = pattern.channels[ch].rows[row];
          if (cell.volume !== null) {
            const newVolume = Math.min(0x40, Math.max(0, Math.round(cell.volume * factor)));
            setCell(ch, row, { volume: newVolume });
          }
        }
      }

      console.log(`Block amplified by ${factor}x`);
    },
    [getBlockBounds, pattern, setCell]
  );

  /**
   * Interpolate values between block start and end
   */
  const interpolateBlock = useCallback(
    (columnType: 'volume' | 'cutoff' | 'resonance' | 'envMod' | 'pan') => {
      const bounds = getBlockBounds();
      if (!bounds) return;

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

      console.log(`Block interpolated for ${columnType}`);
    },
    [getBlockBounds, pattern, setCell]
  );

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
      if (e.key === 'Escape' && selection) {
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
    selection,
  ]);

  return {
    blockState,
    selection,
    clipboard,
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
  };
};
