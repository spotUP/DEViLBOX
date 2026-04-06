/**
 * HivelyPositionEditor — Editable position matrix for HivelyTracker/AHX.
 * Uses the shared SongOrderMatrix for rendering.
 *
 * Each channel has: track (2 hex digits) + transpose (signed 2 hex digits).
 */

import React, { useMemo, useCallback } from 'react';
import type { HivelyNativeData } from '@/types/tracker';
import { useFormatStore } from '@stores';
import { SongOrderMatrix, MATRIX_COLLAPSED_HEIGHT } from '@/components/shared/SongOrderMatrix';
import type { ColumnDef, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';

export const HIVELY_MATRIX_HEIGHT = 200;
export const HIVELY_MATRIX_COLLAPSED_HEIGHT = MATRIX_COLLAPSED_HEIGHT;

function makeTrackColumn(): ColumnDef {
  return {
    key: 'track', label: 'Trk', charWidth: 2, type: 'hex', hexDigits: 2,
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
  nativeData: HivelyNativeData;
  currentPosition: number;
  onPositionChange: (pos: number) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const HivelyPositionEditor: React.FC<Props> = ({
  width, height, nativeData, currentPosition, onPositionChange: _onPositionChange,
  collapsed, onToggleCollapse,
}) => {
  const numPos = nativeData.positions.length;
  const numCh = nativeData.channels;
  const setCell = useFormatStore(s => s.setHivelyPositionCell);

  const formatColumns = useMemo<ColumnDef[]>(() => [makeTrackColumn(), makeTransposeColumn()], []);

  const formatChannels = useMemo<FormatChannel[]>(() => {
    const channels: FormatChannel[] = [];
    for (let ch = 0; ch < numCh; ch++) {
      const rows = [];
      for (let pos = 0; pos < numPos; pos++) {
        const p = nativeData.positions[pos];
        rows.push({ track: p.track[ch] ?? 0, transpose: p.transpose[ch] ?? 0 });
      }
      channels.push({ label: `CH${ch + 1}`, patternLength: numPos, rows });
    }
    return channels;
  }, [nativeData, numPos, numCh]);

  const handleCellChange = useCallback<OnCellChange>((channelIdx, rowIdx, columnKey, value) => {
    if (columnKey === 'track') setCell(rowIdx, channelIdx, 'track', value);
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
