/**
 * GTOrderMatrix — Orders editor panel above the pattern editor.
 * Uses PatternEditorCanvas in format mode for visual consistency with the pattern editor.
 */

import React, { useMemo, useCallback } from 'react';
import { useGTUltraStore } from '../../stores/useGTUltraStore';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import type { ColumnDef, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';

export const GT_ORDER_MATRIX_HEIGHT = 200;
export const GT_ORDER_MATRIX_COLLAPSED_HEIGHT = 28;

// ─── Order command coloring ──────────────────────────────────────────────────

/** Display value of a row past the end of a channel's order list: drawn blank. */
export const ORDER_PAST_END = 0x1ff;
/** Display flag on the row after RST: the restart position it jumps to. */
const ORDER_RESTART = 0x100;

function formatOrderVal(val: number): string {
  if (val === ORDER_PAST_END) return '';
  if (val & ORDER_RESTART) return `>${(val & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
  if (val === 0xFF) return 'RST';
  if (val >= 0xD0 && val <= 0xDF) return `R${(val & 0x0F).toString(16).toUpperCase()}`;
  if (val >= 0xE0 && val <= 0xEF) return `-${(val & 0x0F).toString(16).toUpperCase()}`;
  if (val >= 0xF0 && val <= 0xFE) return `+${(val & 0x0F).toString(16).toUpperCase()}`;
  return val.toString(16).toUpperCase().padStart(2, '0');
}

/**
 * A channel's order list as the matrix shows it. GoatTracker ends each list
 * with FF (RST) followed by the restart position; the 256-byte buffer after
 * that is unused. Showing it drew every channel as hundreds of "00" rows -
 * pattern 0 over and over - after a song that has four positions (owner
 * 2026-10-08: "the matrix ... makes no sense"). Rows past the end are blank.
 */
export function gtOrderDisplayRows(list: ArrayLike<number>): number[] {
  const rows: number[] = [];
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    rows.push(v);
    if (v === 0xFF) {
      if (i + 1 < list.length) rows.push(ORDER_RESTART | list[i + 1]);
      return rows;
    }
  }
  return rows;
}

// ─── Column definition: one column per channel, 2 hex digits ─────────────────

function makeOrderColumn(chIdx: number): ColumnDef {
  return {
    key: 'order',
    label: `C${chIdx + 1}`,
    charWidth: 3,
    type: 'hex',
    hexDigits: 2,
    color: '#e0e0e0',
    emptyColor: '#444',
    emptyValue: ORDER_PAST_END,  // 0x00 is pattern 0; only rows past the end are empty
    formatter: formatOrderVal,
  };
}

const ORDER_COLUMN: ColumnDef = {
  key: 'order',
  label: 'Val',
  charWidth: 3,
  type: 'hex',
  hexDigits: 2,
  color: '#e0e0e0',
  emptyColor: '#444',
  emptyValue: ORDER_PAST_END,
  formatter: formatOrderVal,
};

// ─── Props ──────────────────────────────────────────────────────────────────

interface GTOrderMatrixProps {
  width: number;
  /** Pixel height; omitted, the matrix fills its parent. */
  height?: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const GTOrderMatrix: React.FC<GTOrderMatrixProps> = React.memo(({ width, height, collapsed, onToggleCollapse }) => {
  const orderData = useGTUltraStore((s) => s.orderData);
  const songPos = useGTUltraStore((s) => s.playbackPos.songPos);
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const engine = useGTUltraStore((s) => s.engine);

  const channelCount = sidCount * 3;
  const displayRows = useMemo(
    () => Array.from({ length: channelCount }, (_, ch) => (orderData[ch] ? gtOrderDisplayRows(orderData[ch]) : [])),
    [orderData, channelCount],
  );
  const totalLen = Math.max(0, ...displayRows.map((r) => r.length));

  // Build format columns (one per GT channel)
  const formatColumns = useMemo<ColumnDef[]>(() => {
    return [ORDER_COLUMN];
  }, []);

  // Build FormatChannel[] — one channel per GT order channel
  const formatChannels = useMemo<FormatChannel[]>(() => {
    const channels: FormatChannel[] = [];
    for (let ch = 0; ch < channelCount; ch++) {
      const col = makeOrderColumn(ch);
      const rows = [];
      for (let row = 0; row < totalLen; row++) {
        rows.push({ order: displayRows[ch][row] ?? ORDER_PAST_END });
      }
      channels.push({
        label: `C${ch + 1}`,
        patternLength: totalLen,
        rows,
        columns: [col],
      });
    }
    return channels;
  }, [displayRows, channelCount, totalLen]);

  const handleCellChange = useCallback<OnCellChange>((channelIdx, rowIdx, _columnKey, value) => {
    if (engine) {
      engine.setOrderEntry(channelIdx, rowIdx, value);
      useGTUltraStore.getState().refreshAllOrders();
    }
  }, [engine]);

  if (collapsed) {
    return (
      <div
        style={{ height: GT_ORDER_MATRIX_COLLAPSED_HEIGHT, display: 'flex', alignItems: 'center', cursor: 'pointer', paddingLeft: 8, fontSize: 11, color: '#888', background: 'var(--color-bg-secondary)' }}
        onClick={onToggleCollapse}
      >
        ORDERS [click to expand]
      </div>
    );
  }

  return (
    <div style={{ width, height: height ?? '100%', position: 'relative' }}>
      {onToggleCollapse && (
        <div
          style={{ position: 'absolute', top: 0, right: 8, zIndex: 1, cursor: 'pointer', fontSize: 11, color: '#888', lineHeight: '20px' }}
          onClick={onToggleCollapse}
        >
          [collapse]
        </div>
      )}
      <PatternEditorCanvas
        formatColumns={formatColumns}
        formatChannels={formatChannels}
        formatCurrentRow={songPos}
        formatIsPlaying={false}
        onFormatCellChange={handleCellChange}
        hideVUMeters={true}
        hideAutomationLanes={true}
      />
    </div>
  );
});
