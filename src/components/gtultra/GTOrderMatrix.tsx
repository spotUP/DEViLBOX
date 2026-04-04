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

function formatOrderVal(val: number): string {
  if (val === 0xFF) return 'EN';
  if (val >= 0xD0 && val <= 0xDF) return `R${(val & 0x0F).toString(16).toUpperCase()}`;
  if (val >= 0xE0 && val <= 0xEF) return `-${(val & 0x0F).toString(16).toUpperCase()}`;
  if (val >= 0xF0 && val <= 0xFE) return `+${(val & 0x0F).toString(16).toUpperCase()}`;
  return val.toString(16).toUpperCase().padStart(2, '0');
}

// ─── Column definition: one column per channel, 2 hex digits ─────────────────

function makeOrderColumn(chIdx: number): ColumnDef {
  return {
    key: 'order',
    label: `C${chIdx + 1}`,
    charWidth: 2,
    type: 'hex',
    hexDigits: 2,
    color: '#e0e0e0',
    emptyColor: '#444',
    emptyValue: undefined,  // All values are meaningful (0x00 is pattern 0)
    formatter: formatOrderVal,
  };
}

const ORDER_COLUMN: ColumnDef = {
  key: 'order',
  label: 'Val',
  charWidth: 2,
  type: 'hex',
  hexDigits: 2,
  color: '#e0e0e0',
  emptyColor: '#444',
  emptyValue: undefined,
  formatter: formatOrderVal,
};

// ─── Props ──────────────────────────────────────────────────────────────────

interface GTOrderMatrixProps {
  width: number;
  height: number;
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
  const totalLen = orderData.length > 0 ? orderData[0].length : 0;

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
        const val = orderData[ch]?.[row] ?? 0;
        rows.push({ order: val });
      }
      channels.push({
        label: `C${ch + 1}`,
        patternLength: totalLen,
        rows,
        columns: [col],
      });
    }
    return channels;
  }, [orderData, channelCount, totalLen]);

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
    <div style={{ width, height, position: 'relative' }}>
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
      />
    </div>
  );
});
