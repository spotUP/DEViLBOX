/**
 * SongOrderMatrix — Unified collapsible song position/order editor.
 *
 * Used by all format-specific views (TFMX, Hively, MusicLine, etc.) to show
 * which patterns/tracks play on which channels at each song position.
 *
 * Layout:
 *   Collapsed: 28px bar with format label + expand button
 *   Expanded:  PatternEditorCanvas in format mode at specified height
 *
 * The caller builds formatChannels/formatColumns from their native data
 * and passes them in — this component handles only the rendering shell.
 */

import React from 'react';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import type { ColumnDef, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';

export const MATRIX_COLLAPSED_HEIGHT = 28;

interface SongOrderMatrixProps {
  /** Format label shown in the collapsed bar (e.g. "POSITIONS", "TRACKSTEPS") */
  label: string;
  /** Container width in pixels */
  width?: number;
  /** Container height in pixels (expanded state) */
  height: number;
  /** Column definitions for the matrix grid */
  formatColumns: ColumnDef[];
  /** Channel data: one FormatChannel per voice/channel */
  formatChannels: FormatChannel[];
  /** Current playback/cursor row to highlight */
  currentRow?: number;
  /** Whether playback is actively driving the highlight */
  isPlaying?: boolean;
  /** Cell edit callback */
  onCellChange?: OnCellChange;
  /** Collapsed state */
  collapsed?: boolean;
  /** Toggle collapse */
  onToggleCollapse?: () => void;
}

export const SongOrderMatrix: React.FC<SongOrderMatrixProps> = ({
  label,
  width,
  height,
  formatColumns,
  formatChannels,
  currentRow,
  isPlaying = false,
  onCellChange,
  collapsed = false,
  onToggleCollapse,
}) => {
  const effectiveHeight = collapsed ? MATRIX_COLLAPSED_HEIGHT : height;

  if (collapsed) {
    return (
      <div
        style={{
          width: width ?? '100%',
          height: `${MATRIX_COLLAPSED_HEIGHT}px`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          cursor: 'pointer',
          backgroundColor: 'var(--color-bg-tertiary)',
          borderBottom: '1px solid var(--color-border)',
          fontSize: '11px',
          color: 'var(--color-text-muted)',
          userSelect: 'none',
        }}
        onClick={onToggleCollapse}
      >
        <span style={{ flex: 1 }}>{label} (collapsed)</span>
        <span style={{ color: 'var(--color-text-dim)', fontSize: '10px' }}>[expand]</span>
      </div>
    );
  }

  return (
    <div style={{ width: width ?? '100%', height: `${effectiveHeight}px`, position: 'relative', overflow: 'hidden' }}>
      <PatternEditorCanvas
        formatColumns={formatColumns}
        formatChannels={formatChannels}
        formatCurrentRow={currentRow}
        formatIsPlaying={isPlaying}
        onFormatCellChange={onCellChange}
        hideVUMeters
      />
      {onToggleCollapse && (
        <div
          style={{
            position: 'absolute', top: 2, right: 8,
            fontSize: '10px', color: 'var(--color-text-dim)',
            cursor: 'pointer', zIndex: 10, userSelect: 'none',
            padding: '1px 4px',
            backgroundColor: 'rgba(0,0,0,0.5)',
            borderRadius: '3px',
          }}
          onClick={onToggleCollapse}
        >
          [collapse]
        </div>
      )}
    </div>
  );
};
