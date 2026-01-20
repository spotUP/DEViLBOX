import { useCallback } from 'react';
import type { TrackerCell, CursorPosition } from '@typedefs';

/**
 * Hook for handling automation column input
 */
export const useAutomationColumnInput = (
  cell: TrackerCell,
  cursor: CursorPosition,
  channelIndex: number,
  rowIndex: number,
  setCell: (channelIndex: number, rowIndex: number, cell: Partial<TrackerCell>) => void,
  moveCursor: (direction: 'up' | 'down' | 'left' | 'right') => void
) => {
  const handleHexInput = useCallback(
    (key: string) => {
      const hexDigits = '0123456789ABCDEFabcdef';
      if (!hexDigits.includes(key)) return false;

      const isAutomationColumn =
        cursor.columnType === 'cutoff' ||
        cursor.columnType === 'resonance' ||
        cursor.columnType === 'envMod' ||
        cursor.columnType === 'pan';

      if (!isAutomationColumn) return false;

      const hexDigit = key.toUpperCase();
      const currentValue = (cell[cursor.columnType as keyof TrackerCell] as number) || 0;
      const currentHex = currentValue.toString(16).toUpperCase().padStart(2, '0');

      // Shift left and add new digit
      const newHex = (currentHex[1] + hexDigit).padStart(2, '0');
      const newValue = parseInt(newHex, 16);

      setCell(channelIndex, rowIndex, {
        [cursor.columnType]: newValue,
      });

      // Move down after 2 digits entered
      if (cursor.digitIndex >= 1) {
        moveCursor('down');
      }

      return true;
    },
    [cell, cursor, channelIndex, rowIndex, setCell, moveCursor]
  );

  return { handleHexInput };
};
