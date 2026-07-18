/**
 * SunTronicPositionEditor — Editable position matrix for SunTronic V1.3.
 * Mirrors HivelyPositionEditor exactly.
 *
 * Each of 4 voices has: block index (2 hex digits) + signed transpose.
 */

import React, { useMemo, useCallback } from 'react';
import type { SunTronicNativeData } from '@/lib/import/formats/sunNativeData';
import { useFormatStore } from '@stores';
import { SongOrderMatrix, MATRIX_COLLAPSED_HEIGHT } from '@/components/shared/SongOrderMatrix';
import type { ColumnDef, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';

export const SUNTRONIC_MATRIX_HEIGHT = 200;
export const SUNTRONIC_MATRIX_COLLAPSED_HEIGHT = MATRIX_COLLAPSED_HEIGHT;

function makeBlockColumn(): ColumnDef {
  return {
    key: 'blockIndex', label: 'Blk', charWidth: 2, type: 'hex', hexDigits: 2,
    color: '#e0e0e0', emptyColor: '#444', emptyValue: undefined,
    formatter: (v: number) => v.toString(16).toUpperCase().padStart(2, '0'),
  };
}

function makeTransposeColumn(): ColumnDef {
  return {
    key: 'transpose', label: 'Tr', charWidth: 3, type: 'hex', hexDigits: 2,
    color: '#88ff88', emptyColor: '#808080', emptyValue: undefined,
    formatter: (v: number) => {
      const sign = v >= 0 ? '+' : '-';
      return `${sign}${Math.abs(v).toString(16).toUpperCase().padStart(2, '0')}`;
    },
  };
}

interface Props {
  width: number;
  height: number;
  nativeData: SunTronicNativeData;
  currentPosition: number;
  onPositionChange: (pos: number) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const SunTronicPositionEditor: React.FC<Props> = ({
  width, height, nativeData, currentPosition, onPositionChange: _onPositionChange,
  collapsed, onToggleCollapse,
}) => {
  const numPos = nativeData.positions.length;
  const setCell = useFormatStore(s => s.setSunTronicPositionCell);

  const formatColumns = useMemo<ColumnDef[]>(() => [makeBlockColumn(), makeTransposeColumn()], []);

  const formatChannels = useMemo<FormatChannel[]>(() => {
    const channels: FormatChannel[] = [];
    for (let ch = 0; ch < 4; ch++) {
      const rows = [];
      for (let pos = 0; pos < numPos; pos++) {
        const p = nativeData.positions[pos];
        rows.push({
          blockIndex: p.blockIndex[ch as 0 | 1 | 2 | 3] ?? 0,
          transpose: p.transpose[ch as 0 | 1 | 2 | 3] ?? 0,
        });
      }
      channels.push({ label: `CH${ch + 1}`, patternLength: numPos, rows });
    }
    return channels;
  }, [nativeData, numPos]);

  const handleCellChange = useCallback<OnCellChange>((channelIdx, rowIdx, columnKey, value) => {
    if (columnKey === 'blockIndex') setCell(rowIdx, channelIdx, 'blockIndex', value);
    else if (columnKey === 'transpose') setCell(rowIdx, channelIdx, 'transpose', value);
  }, [setCell]);

  return (
    <SongOrderMatrix
      label="POSITIONS"
      width={width}
      height={height}
      formatColumns={formatColumns}
      formatChannels={formatChannels}
      currentRow={currentPosition}
      onCellChange={handleCellChange}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
    />
  );
};
