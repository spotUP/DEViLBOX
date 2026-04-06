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
 * Optional block selection: Ctrl/Cmd+C/X/V/A, Escape for rectangular
 * copy/cut/paste/select-all/deselect on the matrix grid.
 */

import React, { useState, useCallback, useRef } from 'react';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import type { ColumnDef, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';

export const MATRIX_COLLAPSED_HEIGHT = 28;

// ── Block selection types ────────────────────────────────────────────────────

interface MatrixSelection {
  startCh: number;
  startPos: number;
  endCh: number;
  endPos: number;
}

interface MatrixClipboard {
  entries: number[][];
  numChannels: number;
  numPositions: number;
}

function normalizeSelection(sel: MatrixSelection) {
  return {
    chLo: Math.min(sel.startCh, sel.endCh),
    chHi: Math.max(sel.startCh, sel.endCh),
    posLo: Math.min(sel.startPos, sel.endPos),
    posHi: Math.max(sel.startPos, sel.endPos),
  };
}

// Module-level clipboard persists across re-renders
let matrixClipboard: MatrixClipboard | null = null;

// ── Props ────────────────────────────────────────────────────────────────────

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

  // ── Block selection (opt-in) ─────────────────────────────────────────────
  /** Enable Ctrl/Cmd+C/X/V/A block selection operations */
  enableBlockSelection?: boolean;
  /** Read cell value at (channel, position) for clipboard copy */
  getCellValue?: (channel: number, position: number) => number;
  /** Write cell value at (channel, position) for clipboard paste */
  setCellValue?: (channel: number, position: number, value: number) => void;
  /** Clear cell value at (channel, position) for clipboard cut */
  clearCellValue?: (channel: number, position: number) => void;
  /** Current edit cursor position (for paste target) */
  editPosition?: number;
  /** Total number of channels */
  numChannels?: number;
  /** Total number of positions/rows */
  numPositions?: number;
}

// ── Component ────────────────────────────────────────────────────────────────

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
  enableBlockSelection = false,
  getCellValue,
  setCellValue,
  clearCellValue,
  editPosition = 0,
  numChannels = 0,
  numPositions = 0,
}) => {
  const [selection, setSelection] = useState<MatrixSelection | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ── Block operations ───────────────────────────────────────────────────────

  const copySelection = useCallback(() => {
    if (!selection || !getCellValue) return;
    const { chLo, chHi, posLo, posHi } = normalizeSelection(selection);
    const entries: number[][] = [];
    for (let ch = chLo; ch <= chHi; ch++) {
      const chEntries: number[] = [];
      for (let pos = posLo; pos <= posHi; pos++) {
        chEntries.push(getCellValue(ch, pos));
      }
      entries.push(chEntries);
    }
    matrixClipboard = { entries, numChannels: chHi - chLo + 1, numPositions: posHi - posLo + 1 };
  }, [selection, getCellValue]);

  const cutSelection = useCallback(() => {
    if (!selection || !clearCellValue) return;
    copySelection();
    const { chLo, chHi, posLo, posHi } = normalizeSelection(selection);
    for (let ch = chLo; ch <= chHi; ch++) {
      for (let pos = posLo; pos <= posHi; pos++) {
        clearCellValue(ch, pos);
      }
    }
    setSelection(null);
  }, [selection, copySelection, clearCellValue]);

  const pasteAtPosition = useCallback(() => {
    if (!matrixClipboard || !setCellValue) return;
    const { entries, numChannels: clipCh, numPositions: clipPos } = matrixClipboard;
    for (let ch = 0; ch < clipCh; ch++) {
      if (ch >= numChannels) break;
      for (let pos = 0; pos < clipPos; pos++) {
        const targetPos = editPosition + pos;
        if (targetPos >= numPositions) break;
        setCellValue(ch, targetPos, entries[ch][pos]);
      }
    }
  }, [setCellValue, numChannels, numPositions, editPosition]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!enableBlockSelection) return;
    const isMeta = e.metaKey || e.ctrlKey;

    if (isMeta && e.key === 'c') { e.preventDefault(); copySelection(); return; }
    if (isMeta && e.key === 'x') { e.preventDefault(); cutSelection(); return; }
    if (isMeta && e.key === 'v') { e.preventDefault(); pasteAtPosition(); return; }
    if (isMeta && e.key === 'a') {
      e.preventDefault();
      if (numChannels > 0 && numPositions > 0) {
        setSelection({ startCh: 0, startPos: 0, endCh: numChannels - 1, endPos: numPositions - 1 });
      }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); setSelection(null); return; }
  }, [enableBlockSelection, copySelection, cutSelection, pasteAtPosition, numChannels, numPositions]);

  // ── Collapsed state ────────────────────────────────────────────────────────

  if (collapsed) {
    return (
      <div
        style={{
          width: width ?? '100%',
          height: `${MATRIX_COLLAPSED_HEIGHT}px`,
          display: 'flex', alignItems: 'center', padding: '0 12px',
          cursor: 'pointer',
          backgroundColor: 'var(--color-bg-tertiary)',
          borderBottom: '1px solid var(--color-border)',
          fontSize: '11px', color: 'var(--color-text-muted)', userSelect: 'none',
        }}
        onClick={onToggleCollapse}
      >
        <span style={{ flex: 1 }}>{label} (collapsed)</span>
        <span style={{ color: 'var(--color-text-dim)', fontSize: '10px' }}>[expand]</span>
      </div>
    );
  }

  // ── Expanded state ─────────────────────────────────────────────────────────

  return (
    <div
      ref={wrapperRef}
      tabIndex={enableBlockSelection ? 0 : undefined}
      onKeyDown={enableBlockSelection ? handleKeyDown : undefined}
      style={{
        width: width ?? '100%',
        height: `${height}px`,
        position: 'relative',
        overflow: 'hidden',
        outline: 'none',
      }}
    >
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
