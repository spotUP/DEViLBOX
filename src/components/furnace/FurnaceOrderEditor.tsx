/**
 * FurnaceOrderEditor — Order matrix for Furnace modules.
 * Uses PatternEditorCanvas in format mode for visual consistency with the pattern editor.
 *
 * Grid: rows = order positions, columns = channels, cells = pattern indices (hex 2-digit).
 */

import React, { useMemo, useCallback } from 'react';
import type { FurnaceNativeData } from '@/types/tracker';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import type { ColumnDef, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';

export const FURNACE_ORDER_MATRIX_HEIGHT = 200;
export const FURNACE_ORDER_MATRIX_COLLAPSED_HEIGHT = 28;

function formatHex2(val: number): string {
  return val.toString(16).toUpperCase().padStart(2, '0');
}

function makeChannelColumn(name: string): ColumnDef {
  return {
    key: 'order',
    label: name,
    charWidth: 2,
    type: 'hex',
    hexDigits: 2,
    color: '#e0e0e0',
    emptyColor: '#444',
    emptyValue: undefined, // All values meaningful (0x00 = pattern 0)
    formatter: formatHex2,
  };
}

interface Props {
  width: number;
  height: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  nativeData: FurnaceNativeData;
  currentPosition: number;
  onPositionChange: (pos: number) => void;
  onOrderChange: (channel: number, position: number, patternIndex: number) => void;
}

export const FurnaceOrderEditor: React.FC<Props> = ({
  width, height, collapsed, onToggleCollapse,
  nativeData, currentPosition, onPositionChange: _onPositionChange, onOrderChange,
}) => {
  const sub = nativeData.subsongs[nativeData.activeSubsong];
  const numPos = sub?.ordersLen ?? 0;
  const numCh  = sub?.channels.length ?? 0;

  // One shared column def (all channels use the same 2-digit hex column)
  const formatColumns = useMemo<ColumnDef[]>(() => {
    return [{ key: 'order', label: 'Val', charWidth: 2, type: 'hex', hexDigits: 2, color: '#e0e0e0', emptyColor: '#444', emptyValue: undefined, formatter: formatHex2 }];
  }, []);

  // Build FormatChannel[] — one channel per Furnace channel
  const formatChannels = useMemo<FormatChannel[]>(() => {
    const channels: FormatChannel[] = [];
    for (let ch = 0; ch < numCh; ch++) {
      const label = sub?.channels[ch]?.name ?? `CH${ch}`;
      const col = makeChannelColumn(label);
      const rows = [];
      for (let pos = 0; pos < numPos; pos++) {
        const patIdx = sub?.orders[ch]?.[pos] ?? 0;
        rows.push({ order: patIdx });
      }
      channels.push({
        label,
        patternLength: numPos,
        rows,
        columns: [col],
      });
    }
    return channels;
  }, [sub, numCh, numPos]);

  const handleCellChange = useCallback<OnCellChange>((channelIdx, rowIdx, _columnKey, value) => {
    onOrderChange(channelIdx, rowIdx, value & 0xFF);
  }, [onOrderChange]);

  if (collapsed) {
    return (
      <div
        style={{ height: FURNACE_ORDER_MATRIX_COLLAPSED_HEIGHT, display: 'flex', alignItems: 'center', cursor: 'pointer', paddingLeft: 8, fontSize: 11, color: '#888', background: 'var(--color-bg-secondary)' }}
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
        formatCurrentRow={currentPosition}
        formatIsPlaying={false}
        onFormatCellChange={handleCellChange}
        hideVUMeters={true}
      />
    </div>
  );
};
