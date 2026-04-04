/**
 * SequenceMatrixEditor — Shared collapsible matrix editor using PatternEditorCanvas.
 *
 * Wraps PatternEditorCanvas in format mode with collapse/expand chrome.
 * Used by order/sequence/position editors across formats (GT Ultra, Hively,
 * Klystrack, Furnace, TFMX).
 */

import React from 'react';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import type { ColumnDef, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';

// ─── Shared constants matching the main tracker editor ──────────────────────

export const MATRIX_CHAR_W = 10;
export const MATRIX_ROW_H = 20;
export const MATRIX_HEADER_H = 24;
export const MATRIX_FONT = '14px "JetBrains Mono", "Fira Code", monospace';
export const MATRIX_HEIGHT = 200;
export const MATRIX_COLLAPSED_HEIGHT = 28;

// ─── Props ──────────────────────────────────────────────────────────────────

export interface SequenceMatrixEditorProps {
  /** Section label shown in the collapse header (e.g., "ORDERS", "POSITIONS", "SEQUENCE") */
  label: string;
  width: number;
  height: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Currently active row (for playback highlight) */
  activeRow: number;
  /** Format column definitions */
  formatColumns: ColumnDef[];
  /** Format channel data (one channel per track/voice column) */
  formatChannels: FormatChannel[];
  /** Called when user edits a cell */
  onCellChange?: OnCellChange;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const SequenceMatrixEditor: React.FC<SequenceMatrixEditorProps> = ({
  label, width, height, collapsed, onToggleCollapse,
  activeRow, formatColumns, formatChannels, onCellChange,
}) => {
  // ── Collapsed state ─────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div
        style={{
          width,
          height: MATRIX_COLLAPSED_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          paddingLeft: 8,
          fontSize: 11,
          color: '#888',
          background: 'var(--color-bg-secondary)',
        }}
        onClick={onToggleCollapse}
      >
        {label} [click to expand]
      </div>
    );
  }

  // ── Expanded state ──────────────────────────────────────────────────────
  return (
    <div style={{ width, height, position: 'relative' }}>
      {onToggleCollapse && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 8,
            zIndex: 1,
            cursor: 'pointer',
            fontSize: 11,
            color: '#888',
            lineHeight: '20px',
          }}
          onClick={onToggleCollapse}
        >
          [collapse]
        </div>
      )}
      <PatternEditorCanvas
        formatColumns={formatColumns}
        formatChannels={formatChannels}
        formatCurrentRow={activeRow}
        formatIsPlaying={false}
        onFormatCellChange={onCellChange}
        hideVUMeters={true}
      />
    </div>
  );
};
