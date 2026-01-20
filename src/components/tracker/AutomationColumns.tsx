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
