/**
 * TrackerRow - Single row in the pattern editor
 * Responsive design with proper cell sizing
 */

import React from 'react';
import { NoteCell } from './NoteCell';
import { InstrumentCell } from './InstrumentCell';
import { VolumeCell } from './VolumeCell';
import { EffectCell } from './EffectCell';
import { FlagCell } from './FlagCell';
import { ProbabilityCell } from './ProbabilityCell';
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
  channelWidths?: number[]; // Per-channel widths (for collapsed channels)
  collapsedChannels?: boolean[]; // Which channels are collapsed
  baseChannelIndex?: number; // Base channel index offset (for mobile single-channel view)
}

export const TrackerRow: React.FC<TrackerRowProps> = React.memo(
  ({ rowIndex, cells, channelColors, cursorColumnType, cursorChannelIndex, isCursorRow: _isCursorRow, isCurrentPlaybackRow: _isCurrentPlaybackRow, channelWidth, channelWidths, collapsedChannels, baseChannelIndex = 0 }) => {
    const useHexNumbers = useUIStore((state) => state.useHexNumbers);
    const rowHighlightInterval = useUIStore((state) => state.rowHighlightInterval);
    const showBeatLabels = useUIStore((state) => state.showBeatLabels);
    const rowNumber = useHexNumbers
      ? rowIndex.toString(16).toUpperCase().padStart(2, '0')
      : rowIndex.toString(10).padStart(2, '0');

    // Beat label: beat.tick within measure (assumes 4 rows per beat, configurable via highlight interval)
    const beatInterval = rowHighlightInterval || 4;
    const beat = Math.floor(rowIndex / beatInterval) + 1;
    const tick = (rowIndex % beatInterval) + 1;
    const beatLabel = `${beat}.${tick}`;
    const effectiveChannelWidth = channelWidth || 260;

    // Row background styling - Modern dark theme
    // Only beat highlight and alternating colors - NO cursor/playback row highlighting
    // The fixed center edit bar indicates the active position
    const getRowBgClass = () => {
      if (rowHighlightInterval > 0 && rowIndex % rowHighlightInterval === 0) {
        return 'bg-tracker-row-highlight';
      }
      return rowIndex % 2 === 0 ? 'bg-tracker-row-even' : 'bg-tracker-row-odd';
    };

    return (
      <div className={`flex items-center h-full ${getRowBgClass()}`}>
        {/* Row Number */}
        <div
          className={`
            flex-shrink-0 ${showBeatLabels ? 'w-20' : 'w-12'} h-full flex items-center justify-center gap-1
            text-xs font-mono border-r border-dark-border
            ${rowHighlightInterval > 0 && rowIndex % rowHighlightInterval === 0 ? 'text-text-secondary font-bold' : 'text-text-muted'}
          `}
        >
          {rowNumber}
          {showBeatLabels && (
            <span className={`text-[9px] ${tick === 1 ? 'text-yellow-500' : 'text-text-muted/50'}`}>
              {beatLabel}
            </span>
          )}
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
          // Check if this channel is collapsed
          const isCollapsed = collapsedChannels?.[localIndex] ?? false;
          // Use per-channel width if provided, otherwise fall back to default
          const thisChannelWidth = channelWidths?.[localIndex] ?? effectiveChannelWidth;

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
                minWidth: thisChannelWidth,
                width: thisChannelWidth,
                backgroundColor: channelColor && !isChannelActive ? `${channelColor}10` : undefined,
                boxShadow: channelColor ? `inset 2px 0 0 ${channelColor}40` : undefined,
              }}
            >
              {/* Note - always visible */}
              <NoteCell
                value={cell.note}
                isActive={isChannelActive && cursorColumnType === 'note'}
                isEmpty={cell.note === 0}
                isNoteOff={isNoteOff}
              />

              {/* Other columns - hidden when collapsed */}
              {!isCollapsed && (
                <>
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
                    effTyp={cell.effTyp2}
                    eff={cell.eff2}
                    isActive={isChannelActive && (cursorColumnType === 'effTyp2' || cursorColumnType === 'effParam2')}
                    isEmpty={cell.effTyp2 === 0 && cell.eff2 === 0}
                  />

                  {/* Flag 1 (Accent or Slide) */}
                  <FlagCell
                    value={cell.flag1}
                    isActive={isChannelActive && cursorColumnType === 'flag1'}
                  />

                  {/* Flag 2 (Accent or Slide) */}
                  <FlagCell
                    value={cell.flag2}
                    isActive={isChannelActive && cursorColumnType === 'flag2'}
                  />

                  {/* Probability */}
                  <ProbabilityCell
                    value={cell.probability}
                    isActive={isChannelActive && cursorColumnType === 'probability'}
                  />
                </>
              )}
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
