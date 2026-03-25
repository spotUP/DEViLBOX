/**
 * PatternPreviewTooltip — DOM version of the pattern preview tooltip.
 * Shows a mini tracker grid when hovering over a clip in the arrangement.
 *
 * Positioned absolutely relative to the arrangement container.
 * Shared data from usePatternPreview hook.
 */

import React from 'react';
import { usePatternPreview } from '@/hooks/arrangement/usePatternPreview';

interface PatternPreviewTooltipProps {
  patternId: string | null;
  offsetRows?: number;
  x: number;
  y: number;
  visible: boolean;
}

const CELL_COLORS = {
  note: 'var(--color-cell-note)',
  instrument: 'var(--color-cell-instrument)',
  volume: 'var(--color-cell-volume)',
  effect: 'var(--color-cell-effect)',
  empty: 'var(--color-cell-empty)',
};

export const PatternPreviewTooltip: React.FC<PatternPreviewTooltipProps> = ({
  patternId,
  offsetRows = 0,
  x,
  y,
  visible,
}) => {
  const preview = usePatternPreview(patternId, 8, offsetRows);

  if (!visible || !preview || preview.rows.length === 0) return null;

  return (
    <div
      className="absolute z-50 pointer-events-none"
      style={{
        left: x + 12,
        top: y - 10,
        transform: 'translateY(-100%)',
      }}
    >
      <div className="bg-dark-bgSecondary border border-dark-border rounded-md shadow-lg p-2 min-w-[160px]">
        {/* Header */}
        <div className="text-[10px] font-mono text-text-secondary mb-1 flex justify-between">
          <span>{preview.patternName}</span>
          <span className="text-text-muted">P{String(preview.patternIndex).padStart(2, '0')} ({preview.totalRows} rows)</span>
        </div>

        {/* Mini tracker grid */}
        <div className="font-mono text-[9px] leading-[13px] overflow-hidden">
          {preview.rows.map((row, rowIdx) => (
            <div key={rowIdx} className="flex gap-2 whitespace-nowrap">
              {/* Row number */}
              <span className="text-text-muted w-[16px] text-right">
                {String(offsetRows + rowIdx).padStart(2, '0')}
              </span>
              {/* Channel cells (show max 4 channels to fit) */}
              {row.slice(0, 4).map((cell, chIdx) => (
                <span key={chIdx} className="flex gap-[2px]">
                  <span style={{ color: cell.note === '---' ? CELL_COLORS.empty : CELL_COLORS.note }}>
                    {cell.note}
                  </span>
                  <span style={{ color: cell.instrument === '..' ? CELL_COLORS.empty : CELL_COLORS.instrument }}>
                    {cell.instrument}
                  </span>
                  <span style={{ color: cell.effect === '...' ? CELL_COLORS.empty : CELL_COLORS.effect }}>
                    {cell.effect}
                  </span>
                </span>
              ))}
              {preview.channelCount > 4 && rowIdx === 0 && (
                <span className="text-text-muted">+{preview.channelCount - 4}</span>
              )}
            </div>
          ))}
          {preview.totalRows > preview.previewRows && (
            <div className="text-text-muted mt-0.5">... {preview.totalRows - preview.previewRows} more rows</div>
          )}
        </div>
      </div>
    </div>
  );
};
