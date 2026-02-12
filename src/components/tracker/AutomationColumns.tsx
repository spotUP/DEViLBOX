/**
 * AutomationColumns - Optional automation columns for tracker rows
 * Displays hex values (00-FF) for cutoff, resonance, envelope, pan, volume, etc.
 */

import React from 'react';
import type { TrackerCell, CursorPosition, ColumnVisibility } from '@typedefs';

interface AutomationColumnProps {
  value: number | undefined;
  isActive: boolean;
  isEmpty: boolean;
  columnType: 'cutoff' | 'resonance' | 'envMod' | 'pan';
}

const AutomationColumn: React.FC<AutomationColumnProps> = ({
  value,
  isActive,
  isEmpty,
  columnType,
}) => {
  const displayValue = isEmpty || value === undefined ? '..' : value.toString(16).toUpperCase().padStart(2, '0');

  const columnColor = {
    cutoff: 'text-ft2-effect', // Use effect color (typically green)
    resonance: 'text-ft2-volume', // Use volume color (typically yellow)
    envMod: 'text-ft2-instrument', // Use instrument color (typically cyan)
    pan: 'text-ft2-note', // Use note color (typically white)
  }[columnType];

  return (
    <span
      className={`font-mono text-xs ${
        isActive
          ? 'bg-ft2-highlight text-ft2-text font-bold'
          : isEmpty
          ? 'text-ft2-textDim'
          : columnColor
      }`}
    >
      {displayValue}
    </span>
  );
};

interface AutomationColumnsProps {
  cell: TrackerCell;
  cursor: CursorPosition;
  channelIndex: number;
  rowIndex: number;
  columnVisibility: ColumnVisibility;
}

export const AutomationColumns: React.FC<AutomationColumnsProps> = ({
  cell,
  cursor,
  channelIndex,
  rowIndex,
  columnVisibility,
}) => {
  const isChannelActive = cursor.rowIndex === rowIndex && cursor.channelIndex === channelIndex;

  return (
    <>
      {/* Cutoff (CUT) */}
      {columnVisibility.cutoff && (
        <>
          <span className="text-ft2-textDim">|</span>
          <AutomationColumn
            value={cell.cutoff}
            isActive={isChannelActive && cursor.columnType === 'cutoff'}
            isEmpty={cell.cutoff === undefined}
            columnType="cutoff"
          />
        </>
      )}

      {/* Resonance (RES) */}
      {columnVisibility.resonance && (
        <>
          <span className="text-ft2-textDim">|</span>
          <AutomationColumn
            value={cell.resonance}
            isActive={isChannelActive && cursor.columnType === 'resonance'}
            isEmpty={cell.resonance === undefined}
            columnType="resonance"
          />
        </>
      )}

      {/* Envelope Modulation (ENV) */}
      {columnVisibility.envMod && (
        <>
          <span className="text-ft2-textDim">|</span>
          <AutomationColumn
            value={cell.envMod}
            isActive={isChannelActive && cursor.columnType === 'envMod'}
            isEmpty={cell.envMod === undefined}
            columnType="envMod"
          />
        </>
      )}

      {/* Pan (PAN) */}
      {columnVisibility.pan && (
        <>
          <span className="text-ft2-textDim">|</span>
          <AutomationColumn
            value={cell.pan}
            isActive={isChannelActive && cursor.columnType === 'pan'}
            isEmpty={cell.pan === undefined}
            columnType="pan"
          />
        </>
      )}
    </>
  );
};

interface AutomationColumnHeadersProps {
  columnVisibility: ColumnVisibility;
}

export const AutomationColumnHeaders: React.FC<AutomationColumnHeadersProps> = ({
  columnVisibility,
}) => {
  return (
    <>
      {columnVisibility.cutoff && (
        <>
          <span className="text-ft2-textDim px-1">|</span>
          <span className="text-ft2-effect text-xs font-mono font-bold">CUT</span>
        </>
      )}
      {columnVisibility.resonance && (
        <>
          <span className="text-ft2-textDim px-1">|</span>
          <span className="text-ft2-volume text-xs font-mono font-bold">RES</span>
        </>
      )}
      {columnVisibility.envMod && (
        <>
          <span className="text-ft2-textDim px-1">|</span>
          <span className="text-ft2-instrument text-xs font-mono font-bold">ENV</span>
        </>
      )}
      {columnVisibility.pan && (
        <>
          <span className="text-ft2-textDim px-1">|</span>
          <span className="text-ft2-note text-xs font-mono font-bold">PAN</span>
        </>
      )}
    </>
  );
};

interface AutomationColumnToggleProps {
  columnVisibility: ColumnVisibility;
  onToggle: (column: keyof ColumnVisibility) => void;
}

export const AutomationColumnToggle: React.FC<AutomationColumnToggleProps> = ({
  columnVisibility,
  onToggle,
}) => {
  const columns: Array<{ key: keyof ColumnVisibility; label: string }> = [
    { key: 'cutoff', label: 'Cutoff (CUT)' },
    { key: 'resonance', label: 'Resonance (RES)' },
    { key: 'envMod', label: 'Env Mod (ENV)' },
    { key: 'pan', label: 'Pan (PAN)' },
  ];

  return (
    <div className="automation-column-toggle bg-ft2-window border border-ft2-border rounded p-4">
      <h3 className="text-ft2-text font-mono text-sm font-bold mb-2">Automation Columns</h3>
      <div className="space-y-2">
        {columns.map((column) => (
          <label key={column.key} className="flex items-center gap-2 text-xs font-mono text-ft2-text cursor-pointer">
            <input
              type="checkbox"
              checked={columnVisibility[column.key]}
              onChange={() => onToggle(column.key)}
              className="w-4 h-4"
            />
            <span>{column.label}</span>
          </label>
        ))}
      </div>
      <div className="mt-4 text-xs font-mono text-ft2-textDim">
        Automation columns display per-row parameter values (00-FF hex).
        Values are interpolated during playback and applied to synth parameters.
      </div>
    </div>
  );
};

/**
 * Hook for handling automation column input
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useAutomationColumnInput = (
  cell: TrackerCell,
  cursor: CursorPosition,
  channelIndex: number,
  rowIndex: number,
  setCell: (channelIndex: number, rowIndex: number, cell: Partial<TrackerCell>) => void,
  moveCursor: (direction: 'up' | 'down' | 'left' | 'right') => void
) => {
  const handleHexInput = React.useCallback(
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
      // Map cursor columnType to actual cell field name
      const fieldName = cursor.columnType as keyof Pick<TrackerCell, 'cutoff' | 'resonance' | 'envMod' | 'pan'>;
      const currentValue = (cell[fieldName] as number) || 0;
      const currentHex = currentValue.toString(16).toUpperCase().padStart(2, '0');

      // Shift left and add new digit
      const newHex = (currentHex[1] + hexDigit).padStart(2, '0');
      const newValue = parseInt(newHex, 16);

      setCell(channelIndex, rowIndex, {
        [fieldName]: newValue,
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
