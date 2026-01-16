/**
 * TrackerRow - Single row in the pattern editor
 * Responsive design with proper cell sizing
 */

import React from 'react';
import { NoteCell } from './NoteCell';
import { InstrumentCell } from './InstrumentCell';
import { VolumeCell } from './VolumeCell';
import { EffectCell } from './EffectCell';
import { AccentCell } from './AccentCell';
import { SlideCell } from './SlideCell';
import { useTrackerStore } from '@stores';
import type { TrackerCell, CursorPosition } from '@typedefs';

interface TrackerRowProps {
  rowIndex: number;
  cells: TrackerCell[];
  channelColors: (string | null)[];
  cursor: CursorPosition;
  isCursorRow: boolean;
  isCurrentPlaybackRow: boolean;
}

export const TrackerRow: React.FC<TrackerRowProps> = React.memo(
  ({ rowIndex, cells, channelColors, cursor, isCursorRow, isCurrentPlaybackRow: _isCurrentPlaybackRow }) => {
    const setCell = useTrackerStore((state) => state.setCell);
    const rowNumberHex = rowIndex.toString(16).toUpperCase().padStart(2, '0');

    // Row background styling - Modern dark theme
    // Only beat highlight and alternating colors - NO cursor/playback row highlighting
    // The fixed center edit bar indicates the active position
    const getRowBgClass = () => {
      if (rowIndex % 4 === 0) {
        return 'bg-tracker-row-highlight';
      }
      return rowIndex % 2 === 0 ? 'bg-tracker-row-even' : 'bg-tracker-row-odd';
    };

    return (
      <div className={`flex items-center h-full ${getRowBgClass()}`}>
        {/* Row Number */}
        <div
          className={`
            flex-shrink-0 w-12 h-full flex items-center justify-center
            text-xs font-mono border-r border-dark-border
            ${rowIndex % 4 === 0 ? 'text-text-secondary font-bold' : 'text-text-muted'}
          `}
        >
          {rowNumberHex}
        </div>

        {/* Channels */}
        {cells.map((cell, channelIndex) => {
          // Cursor only shows on the edit bar row (isCursorRow) at the selected channel
          const isChannelActive = isCursorRow && cursor.channelIndex === channelIndex;
          const isNoteOff = cell.note === '===';
          const channelColor = channelColors[channelIndex];

          return (
            <div
              key={channelIndex}
              className={`
                flex-shrink-0 min-w-[260px] h-full
                flex items-center gap-1 px-2
                border-r border-dark-border
                ${isChannelActive ? 'bg-accent-primary/10' : ''}
              `}
              style={{
                backgroundColor: channelColor && !isChannelActive ? `${channelColor}10` : undefined,
                boxShadow: channelColor ? `inset 2px 0 0 ${channelColor}40` : undefined,
              }}
            >
              {/* Note */}
              <NoteCell
                value={cell.note}
                isActive={isChannelActive && cursor.columnType === 'note'}
                isEmpty={cell.note === null}
                isNoteOff={isNoteOff}
              />

              {/* Instrument */}
              <InstrumentCell
                value={cell.instrument}
                isActive={isChannelActive && cursor.columnType === 'instrument'}
                isEmpty={cell.instrument === null}
              />

              {/* Volume */}
              <VolumeCell
                value={cell.volume}
                isActive={isChannelActive && cursor.columnType === 'volume'}
                isEmpty={cell.volume === null}
              />

              {/* Effect */}
              <EffectCell
                value={cell.effect}
                isActive={isChannelActive && cursor.columnType === 'effect'}
                isEmpty={cell.effect === null}
              />

              {/* Accent */}
              <AccentCell
                value={cell.accent}
                isActive={isChannelActive && cursor.columnType === 'accent'}
                onToggle={() => setCell(channelIndex, rowIndex, { accent: !cell.accent })}
              />

              {/* Slide */}
              <SlideCell
                value={cell.slide}
                isActive={isChannelActive && cursor.columnType === 'slide'}
                onToggle={() => setCell(channelIndex, rowIndex, { slide: !cell.slide })}
              />
            </div>
          );
        })}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for performance
    // Cursor only matters when isCursorRow is true
    const cursorChanged = prevProps.isCursorRow || nextProps.isCursorRow
      ? (prevProps.cursor.channelIndex !== nextProps.cursor.channelIndex ||
         prevProps.cursor.columnType !== nextProps.cursor.columnType)
      : false;

    // Check if channel colors changed
    const colorsChanged = prevProps.channelColors.length !== nextProps.channelColors.length ||
      prevProps.channelColors.some((c, i) => c !== nextProps.channelColors[i]);

    return (
      prevProps.rowIndex === nextProps.rowIndex &&
      prevProps.isCursorRow === nextProps.isCursorRow &&
      prevProps.isCurrentPlaybackRow === nextProps.isCurrentPlaybackRow &&
      !cursorChanged &&
      !colorsChanged &&
      prevProps.cells === nextProps.cells
    );
  }
);

TrackerRow.displayName = 'TrackerRow';
