/**
 * PatternMinimap - Minimap scrollbar showing pattern note density
 * Displays a compressed view of the pattern with activity indicators
 */

import React, { useCallback, useRef, useMemo } from 'react';
import { useTrackerStore } from '@stores';
import { useTransportStore } from '@stores';
import { useShallow } from 'zustand/react/shallow';

interface PatternMinimapProps {
  height: number;
}

export const PatternMinimap: React.FC<PatternMinimapProps> = React.memo(({ height }) => {
  const { patterns, currentPatternIndex, cursor, selection } = useTrackerStore(
    useShallow((state) => ({
      patterns: state.patterns,
      currentPatternIndex: state.currentPatternIndex,
      cursor: state.cursor,
      selection: state.selection,
    }))
  );
  const { isPlaying, currentRow } = useTransportStore(
    useShallow((state) => ({ isPlaying: state.isPlaying, currentRow: state.currentRow }))
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const pattern = patterns[currentPatternIndex];

  const patternLength = pattern?.length ?? 64;
  const rowHeight = height / patternLength;
  const activeRow = Math.min(
    isPlaying ? currentRow : cursor.rowIndex,
    patternLength - 1
  );

  // Calculate note density per row (memoized)
  const density = useMemo(() => {
    if (!pattern) return new Uint8Array(0);
    const d = new Uint8Array(patternLength);
    for (let row = 0; row < patternLength; row++) {
      let count = 0;
      for (let ch = 0; ch < pattern.channels.length; ch++) {
        const cell = pattern.channels[ch].rows[row];
        if (cell.note > 0 || cell.effTyp > 0 || cell.volume >= 0x10) {
          count++;
        }
      }
      d[row] = count;
    }
    return d;
  }, [pattern, patternLength]);

  // Click to jump to row
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const row = Math.floor((y / height) * patternLength);
    const clampedRow = Math.max(0, Math.min(patternLength - 1, row));
    useTrackerStore.getState().moveCursorToRow(clampedRow);
  }, [height, patternLength]);

  if (!pattern) return null;

  // Use reduce instead of spread to avoid call stack limits on large patterns
  let maxDensity = 1;
  for (let i = 0; i < density.length; i++) {
    if (density[i] > maxDensity) maxDensity = density[i];
  }

  return (
    <div
      ref={containerRef}
      className="w-4 bg-neutral-900 border-l border-neutral-700 cursor-pointer flex-shrink-0"
      style={{ height }}
      onClick={handleClick}
      title="Click to jump to row"
    >
      {/* Density bars */}
      <svg width="16" height={height} className="block" aria-label="Pattern density minimap" role="img">
        {Array.from({ length: patternLength }, (_, row) => {
          const d = density[row];
          if (d === 0) return null;
          const y = row * rowHeight;
          const w = (d / maxDensity) * 14;
          return (
            <rect
              key={row}
              x={1}
              y={y}
              width={w}
              height={Math.max(1, rowHeight - 0.5)}
              fill={row % 4 === 0 ? '#3b82f6' : '#6366f1'}
              opacity={0.5}
            />
          );
        })}

        {/* Selection highlight */}
        {selection && (() => {
          const minRow = Math.min(selection.startRow, selection.endRow);
          const maxRow = Math.max(selection.startRow, selection.endRow);
          return (
            <rect
              x={0}
              y={minRow * rowHeight}
              width={16}
              height={(maxRow - minRow + 1) * rowHeight}
              fill="#facc15"
              opacity={0.2}
            />
          );
        })()}

        {/* Active row indicator */}
        <rect
          x={0}
          y={activeRow * rowHeight}
          width={16}
          height={Math.max(2, rowHeight)}
          fill={isPlaying ? '#22c55e' : '#ef4444'}
          opacity={0.8}
        />
      </svg>
    </div>
  );
});

PatternMinimap.displayName = 'PatternMinimap';
