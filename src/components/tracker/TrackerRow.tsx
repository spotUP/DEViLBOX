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
import { useUIStore } from '@stores/useUIStore';
import type { TrackerCell, CursorPosition } from '@typedefs';

interface TrackerRowProps {
  rowIndex: number;
  cells: TrackerCell[];
  channelColors: (string | null)[];
  cursorColumnType: CursorPosition['columnType'] | null; // Only passed for cursor row
  cursorChannelIndex: number; // -1 if not cursor row
  isCursorRow: boolean;
  isCurrentPlaybackRow: boolean;
  channelWidth?: number; // Optional width per channel (mobile uses full width)
  baseChannelIndex?: number; // Base channel index offset (for mobile single-channel view)
}

export const TrackerRow: React.FC<TrackerRowProps> = React.memo(
  ({ rowIndex, cells, channelColors, cursorColumnType, cursorChannelIndex, isCursorRow: _isCursorRow, isCurrentPlaybackRow: _isCurrentPlaybackRow, channelWidth, baseChannelIndex = 0 }) => {
    const setCell = useTrackerStore((state) => state.setCell);
    const useHexNumbers = useUIStore((state) => state.useHexNumbers);
    const rowNumber = useHexNumbers
      ? rowIndex.toString(16).toUpperCase().padStart(2, '0')
      : rowIndex.toString(10).padStart(2, '0');
    const effectiveChannelWidth = channelWidth || 260;

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
          {rowNumber}
        </div>

        {/* Channels */}
        {cells.map((cell, localIndex) => {
          // The actual channel index in the pattern (for cursor matching)
          const actualChannelIndex = baseChannelIndex + localIndex;
          // Cursor is now a fixed overlay - cells don't need active state
          // Only enable if this is the cursor row AND cursor channel
          const isChannelActive = cursorChannelIndex === actualChannelIndex;
          // XM format: note 97 = note off
          const isNoteOff = cell.note === 97;
          const channelColor = channelColors[localIndex];

          return (
            <div
              key={localIndex}
              className={`
                flex-shrink-0 h-full
                flex items-center gap-1 px-2
                border-r border-dark-border
                ${isChannelActive ? 'bg-accent-primary/10' : ''}
              `}
              style={{
                minWidth: effectiveChannelWidth,
                backgroundColor: channelColor && !isChannelActive ? `${channelColor}10` : undefined,
                boxShadow: channelColor ? `inset 2px 0 0 ${channelColor}40` : undefined,
              }}
            >
              {/* Note */}
              <NoteCell
                value={cell.note}
                isActive={isChannelActive && cursorColumnType === 'note'}
                isEmpty={cell.note === 0}
                isNoteOff={isNoteOff}
              />

              {/* Instrument */}
              <InstrumentCell
                value={cell.instrument}
                isActive={isChannelActive && cursorColumnType === 'instrument'}
                isEmpty={cell.instrument === 0}
              />

              {/* Volume */}
              <VolumeCell
                value={cell.volume}
                isActive={isChannelActive && cursorColumnType === 'volume'}
                isEmpty={cell.volume === 0 || cell.volume < 0x10}
              />

              {/* Effect 1 */}
              <EffectCell
                effTyp={cell.effTyp}
                eff={cell.eff}
                isActive={isChannelActive && (cursorColumnType === 'effTyp' || cursorColumnType === 'effParam')}
                isEmpty={cell.effTyp === 0 && cell.eff === 0}
              />

              {/* Effect 2 */}
              <EffectCell
                value={cell.effect2}
                isActive={isChannelActive && cursorColumnType === 'effect2'}
                isEmpty={!cell.effect2}
              />

              {/* Accent */}
              <AccentCell
                value={cell.accent}
                isActive={isChannelActive && cursorColumnType === 'accent'}
                onToggle={() => setCell(actualChannelIndex, rowIndex, { accent: !cell.accent })}
              />

              {/* Slide */}
              <SlideCell
                value={cell.slide}
                isActive={isChannelActive && cursorColumnType === 'slide'}
                onToggle={() => setCell(actualChannelIndex, rowIndex, { slide: !cell.slide })}
              />
            </div>
          );
        })}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for performance
    // Cursor is now a fixed overlay, so we don't need to track it here

    // Check if channel colors changed
    const colorsChanged = prevProps.channelColors.length !== nextProps.channelColors.length ||
      prevProps.channelColors.some((c, i) => c !== nextProps.channelColors[i]);

    return (
      prevProps.rowIndex === nextProps.rowIndex &&
      prevProps.channelWidth === nextProps.channelWidth &&
      prevProps.baseChannelIndex === nextProps.baseChannelIndex &&
      !colorsChanged &&
      prevProps.cells === nextProps.cells
    );
  }
);

TrackerRow.displayName = 'TrackerRow';
