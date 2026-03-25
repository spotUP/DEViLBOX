/**
 * PatternMatrix — DOM version of the Renoise-style pattern matrix.
 *
 * Grid layout: rows = song positions, columns = channels.
 * Each cell shows the pattern number. Colored cells = has data.
 * Click cell to navigate to that position/pattern.
 */

import React from 'react';
import { usePatternMatrix } from '@/hooks/arrangement/usePatternMatrix';
import { useTrackerStore } from '@stores';
import { useResponsiveSafe } from '@/contexts/ResponsiveContext';

interface PatternMatrixProps {
  width?: number;
  height?: number;
}

const CELL_W_DESKTOP = 40;
const CELL_H_DESKTOP = 20;
const CELL_W_MOBILE = 48;
const CELL_H_MOBILE = 36; // 36px for touch-friendly targets
const HEADER_H = 22;
const ROW_LABEL_W = 32;

const CHANNEL_COLORS = ['#4a9eff', '#ff6b6b', '#51cf66', '#ffd43b', '#cc5de8', '#ff922b', '#20c997', '#f06595'];

export const PatternMatrix: React.FC<PatternMatrixProps> = ({
  width,
  height,
}) => {
  const { isMobile } = useResponsiveSafe();
  const CELL_W = isMobile ? CELL_W_MOBILE : CELL_W_DESKTOP;
  const CELL_H = isMobile ? CELL_H_MOBILE : CELL_H_DESKTOP;

  const matrix = usePatternMatrix();
  const setCurrentPosition = useTrackerStore(s => s.setCurrentPosition);
  const setCurrentPattern = useTrackerStore(s => s.setCurrentPattern);

  if (matrix.positions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-xs">
        No pattern order
      </div>
    );
  }

  return (
    <div
      className="overflow-auto scrollbar-modern bg-dark-bg border border-dark-border rounded"
      style={{ width: width ?? '100%', height: height ?? '100%' }}
    >
      {/* Channel headers */}
      <div className="flex sticky top-0 z-10 bg-dark-bgSecondary border-b border-dark-border">
        <div
          className="flex-shrink-0 text-text-muted text-[9px] font-mono flex items-center justify-center border-r border-dark-border"
          style={{ width: ROW_LABEL_W, height: HEADER_H }}
        >
          Pos
        </div>
        {Array.from({ length: matrix.channelCount }, (_, ch) => (
          <div
            key={ch}
            className="flex-shrink-0 text-[9px] font-mono flex items-center justify-center border-r border-dark-border"
            style={{
              width: CELL_W,
              height: HEADER_H,
              color: CHANNEL_COLORS[ch % CHANNEL_COLORS.length],
            }}
          >
            CH{ch + 1}
          </div>
        ))}
      </div>

      {/* Matrix rows */}
      {matrix.cells.map((row, posIdx) => {
        const isCurrent = posIdx === matrix.currentPosition;
        return (
          <div
            key={posIdx}
            className={`flex ${isCurrent ? 'bg-dark-bgActive' : posIdx % 2 === 0 ? 'bg-dark-bg' : 'bg-dark-bgSecondary'}`}
          >
            {/* Position label */}
            <div
              className={`flex-shrink-0 text-[10px] font-mono flex items-center justify-center border-r border-dark-border ${
                isCurrent ? 'text-accent-primary font-bold' : 'text-text-muted'
              }`}
              style={{ width: ROW_LABEL_W, height: CELL_H }}
            >
              {String(posIdx).padStart(2, '0')}
            </div>

            {/* Channel cells */}
            {row.map((cell, ch) => (
              <button
                key={ch}
                onClick={() => {
                  setCurrentPosition(posIdx, true);
                  setCurrentPattern(cell.patternIndex, true);
                }}
                className={`flex-shrink-0 text-[10px] font-mono flex items-center justify-center border-r border-dark-border transition-colors cursor-pointer
                  ${cell.hasData
                    ? 'hover:brightness-125'
                    : 'text-text-muted hover:bg-dark-bgHover'
                  }
                `}
                style={{
                  width: CELL_W,
                  height: CELL_H,
                  backgroundColor: cell.hasData
                    ? `${CHANNEL_COLORS[ch % CHANNEL_COLORS.length]}20`
                    : undefined,
                  color: cell.hasData
                    ? CHANNEL_COLORS[ch % CHANNEL_COLORS.length]
                    : undefined,
                }}
                title={`Position ${posIdx}, Channel ${ch + 1}, Pattern ${cell.patternIndex} (${cell.patternName})`}
              >
                {String(cell.patternIndex).padStart(2, '0')}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
};
