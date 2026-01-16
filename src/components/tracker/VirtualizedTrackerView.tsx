// @ts-nocheck - Experimental file with react-window type issues
/**
 * VirtualizedTrackerView - Optimized Pattern Editor with react-window
 * Uses virtualization to render only visible rows for performance
 * Target: 16 channels × 128 rows at 60 FPS
 */

import React, { useRef, useEffect, useMemo, memo } from 'react';
import { FixedSizeGrid as Grid } from 'react-window';
import { useTrackerStore, useTransportStore } from '@stores';
import type { TrackerCell } from '@typedefs';
import { NoteCell } from './NoteCell';
import { InstrumentCell } from './InstrumentCell';
import { VolumeCell } from './VolumeCell';
import { EffectCell } from './EffectCell';
import { AccentCell } from './AccentCell';
import { SlideCell } from './SlideCell';

const ROW_HEIGHT = 24;
const COLUMN_WIDTH = 120; // Approximate width per channel
const ROW_NUMBER_WIDTH = 48;
const HEADER_HEIGHT = 32;
const OVERSCAN_ROW_COUNT = 16; // Render ±16 rows beyond visible area

interface CellRendererProps {
  columnIndex: number;
  rowIndex: number;
  style: React.CSSProperties;
  data: {
    pattern: any;
    cursor: any;
    currentRow: number;
    isPlaying: boolean;
    columnVisibility: any;
  };
}

/**
 * Optimized Cell Renderer
 * Memoized to prevent unnecessary re-renders
 */
const CellRenderer = memo<CellRendererProps>(({ columnIndex, rowIndex, style, data }) => {
  const { pattern, cursor, currentRow, isPlaying, columnVisibility } = data;

  // Row number column
  if (columnIndex === 0) {
    const isCurrentPlaybackRow = isPlaying && currentRow === rowIndex;
    const isCursorRow = cursor.rowIndex === rowIndex;

    return (
      <div
        style={style}
        className={`
          flex items-center justify-center text-xs font-mono font-bold border-r border-ft2-border
          ${isCurrentPlaybackRow ? 'bg-ft2-cursor text-ft2-bg' : 'bg-ft2-panel text-ft2-textDim'}
        `}
      >
        {rowIndex.toString(16).toUpperCase().padStart(2, '0')}
      </div>
    );
  }

  // Pattern data columns
  const channelIndex = columnIndex - 1;
  const channel = pattern?.channels[channelIndex];
  if (!channel) return null;

  const cell: TrackerCell = channel.rows[rowIndex];
  const isCursorChannel = cursor.channelIndex === channelIndex;
  const isCursorRow = cursor.rowIndex === rowIndex;
  const isActiveCell = isCursorChannel && isCursorRow;
  const isCurrentPlaybackRow = isPlaying && currentRow === rowIndex;

  return (
    <div
      style={style}
      className={`
        flex items-center gap-0.5 px-2 border-r border-ft2-border text-xs font-mono
        ${isCurrentPlaybackRow ? 'bg-ft2-panel' : 'bg-ft2-bg'}
        ${isCursorRow ? 'bg-opacity-80' : ''}
      `}
    >
      {/* Note */}
      {columnVisibility.note && (
        <NoteCell
          cell={cell}
          isActive={isActiveCell && cursor.columnType === 'note'}
          isCursorRow={isCursorRow}
        />
      )}

      {/* Instrument */}
      {columnVisibility.instrument && (
        <InstrumentCell
          cell={cell}
          isActive={isActiveCell && cursor.columnType === 'instrument'}
          isCursorRow={isCursorRow}
        />
      )}

      {/* Volume */}
      {columnVisibility.volume && (
        <VolumeCell
          cell={cell}
          isActive={isActiveCell && cursor.columnType === 'volume'}
          isCursorRow={isCursorRow}
        />
      )}

      {/* Effect */}
      {columnVisibility.effect && (
        <EffectCell
          cell={cell}
          isActive={isActiveCell && cursor.columnType === 'effect'}
          isCursorRow={isCursorRow}
        />
      )}

      {/* TB-303 Columns */}
      {columnVisibility.accent && (
        <AccentCell
          cell={cell}
          isActive={isActiveCell && cursor.columnType === 'accent'}
          isCursorRow={isCursorRow}
        />
      )}

      {columnVisibility.slide && (
        <SlideCell
          cell={cell}
          isActive={isActiveCell && cursor.columnType === 'slide'}
          isCursorRow={isCursorRow}
        />
      )}
    </div>
  );
});

CellRenderer.displayName = 'CellRenderer';

/**
 * Virtualized Tracker View Component
 */
export const VirtualizedTrackerView: React.FC = () => {
  const { patterns, currentPatternIndex, cursor, columnVisibility } = useTrackerStore();
  const { currentRow, isPlaying } = useTransportStore();
  const gridRef = useRef<Grid>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const pattern = patterns[currentPatternIndex];

  // Calculate dimensions
  const numRows = pattern?.length || 64;
  const numColumns = (pattern?.channels.length || 4) + 1; // +1 for row numbers
  const containerWidth = containerRef.current?.clientWidth || 800;
  const containerHeight = containerRef.current?.clientHeight || 600;

  // Memoize grid data to prevent unnecessary re-renders
  const gridData = useMemo(
    () => ({
      pattern,
      cursor,
      currentRow,
      isPlaying,
      columnVisibility,
    }),
    [pattern, cursor, currentRow, isPlaying, columnVisibility]
  );

  // Auto-scroll to keep cursor/playback row centered
  useEffect(() => {
    if (gridRef.current) {
      const activeRow = isPlaying ? currentRow : cursor.rowIndex;

      // Scroll to keep the active row in view
      gridRef.current.scrollToItem({
        align: 'center',
        rowIndex: activeRow,
      });
    }
  }, [cursor.rowIndex, currentRow, isPlaying]);

  // Maintain scroll position on pattern switch
  const prevPatternRef = useRef(currentPatternIndex);
  useEffect(() => {
    if (prevPatternRef.current !== currentPatternIndex && gridRef.current) {
      // Reset to top or maintain cursor position
      gridRef.current.scrollToItem({
        align: 'center',
        rowIndex: cursor.rowIndex,
      });
    }
    prevPatternRef.current = currentPatternIndex;
  }, [currentPatternIndex, cursor.rowIndex]);

  if (!pattern) {
    return (
      <div className="flex-1 flex items-center justify-center text-ft2-textDim font-mono">
        No pattern loaded
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden bg-ft2-bg font-mono text-sm"
    >
      {/* Horizontal Edit Bar (absolutely fixed in middle) */}
      <div
        className="pointer-events-none absolute z-50"
        style={{
          top: '50%',
          left: 0,
          right: 0,
          height: `${ROW_HEIGHT}px`,
          transform: 'translateY(-50%)',
          backgroundColor: 'color-mix(in srgb, var(--color-tracker-cursor) 30%, transparent)',
          borderTop: '3px solid var(--color-tracker-cursor)',
          borderBottom: '3px solid var(--color-tracker-cursor)',
          boxShadow: '0 0 20px color-mix(in srgb, var(--color-tracker-cursor) 50%, transparent)',
        }}
      />

      {/* Header Row (Fixed) */}
      <div
        className="sticky top-0 z-10 flex items-center bg-ft2-header border-b-2 border-ft2-border"
        style={{ height: `${HEADER_HEIGHT}px` }}
      >
        <div
          className="flex-shrink-0 px-2 py-1 text-ft2-text text-xs font-bold text-center border-r border-ft2-border"
          style={{ width: `${ROW_NUMBER_WIDTH}px` }}
        >
          #
        </div>
        {pattern.channels.map((channel, idx) => (
          <div
            key={channel.id}
            className="flex items-center gap-1 px-2 py-1 border-r border-ft2-border text-xs font-bold"
            style={{ minWidth: `${COLUMN_WIDTH}px` }}
          >
            <span className="text-ft2-highlight">CH{idx + 1}</span>
            <span className="text-ft2-textDim text-[10px]">
              {columnVisibility.note && 'NOTE '}
              {columnVisibility.instrument && 'IN '}
              {columnVisibility.volume && 'VOL '}
              {columnVisibility.effect && 'EFF '}
              {columnVisibility.accent && 'A '}
              {columnVisibility.slide && 'S'}
            </span>
          </div>
        ))}
      </div>

      {/* Virtualized Grid */}
      <Grid
        ref={gridRef}
        columnCount={numColumns}
        columnWidth={(index) => (index === 0 ? ROW_NUMBER_WIDTH : COLUMN_WIDTH)}
        height={containerHeight - HEADER_HEIGHT}
        rowCount={numRows}
        rowHeight={ROW_HEIGHT}
        width={containerWidth}
        itemData={gridData}
        overscanRowCount={OVERSCAN_ROW_COUNT}
        className="scrollbar-ft2"
        style={{
          // Use CSS transforms for smooth scrolling
          willChange: 'transform',
        }}
      >
        {CellRenderer}
      </Grid>

      {/* Performance Info (Debug) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-green-400 text-xs font-mono px-2 py-1">
          Virtualized: {numRows}×{numColumns - 1} | Overscan: ±{OVERSCAN_ROW_COUNT}
        </div>
      )}
    </div>
  );
};

/**
 * Performance Notes:
 *
 * 1. Virtualization: Only renders visible rows + overscan buffer
 * 2. Memoization: CellRenderer is memoized to prevent unnecessary re-renders
 * 3. CSS Transforms: Cursor highlight uses absolute positioning with transforms
 * 4. Optimized Data: gridData is memoized to prevent prop changes
 * 5. Smooth Scrolling: react-window handles smooth scrolling at 60 FPS
 *
 * Target Performance:
 * - 16 channels × 128 rows = 2048 cells total
 * - With virtualization: ~30-40 visible rows × 16 channels = ~480-640 rendered cells
 * - Overhead reduction: ~75% fewer DOM nodes
 * - Expected FPS: 60 FPS stable
 */
