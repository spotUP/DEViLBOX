/**
 * FurnaceOrderEditor — Order matrix for Furnace modules.
 * Furnace data adapter over the shared SongOrderMatrix (one step per pattern while playing).
 *
 * Grid: rows = order positions, columns = channels, cells = pattern indices (hex 2-digit).
 */

import React, { useMemo, useCallback } from 'react';
import type { FurnaceNativeData } from '@/types/tracker';
import { SongOrderMatrix } from '@/components/shared/SongOrderMatrix';
import type { ColumnDef, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';
import { useVisibleChannelMask } from '@/hooks/tracker/useVisibleChannelMask';
import { isChannelVisible } from '@/lib/tracker/visibleChannels';

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
  /** The song is playing: the matrix rides `currentPosition`, one step per pattern. */
  isPlaying?: boolean;
  nativeData: FurnaceNativeData;
  currentPosition: number;
  onPositionChange: (pos: number) => void;
  onOrderChange: (channel: number, position: number, patternIndex: number) => void;
}

export const FurnaceOrderEditor: React.FC<Props> = ({
  width, height, collapsed, onToggleCollapse, isPlaying = false,
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
  // The order matrix shows the channels the pattern grid shows: one list (visibleChannels.ts).
  const visibleMask = useVisibleChannelMask();
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
        hidden: !isChannelVisible(visibleMask, ch),
      });
    }
    return channels;
  }, [sub, numCh, numPos, visibleMask]);

  const handleCellChange = useCallback<OnCellChange>((channelIdx, rowIdx, _columnKey, value) => {
    onOrderChange(channelIdx, rowIdx, value & 0xFF);
  }, [onOrderChange]);

  return (
    <SongOrderMatrix
      label="ORDERS"
      width={width}
      height={height}
      formatColumns={formatColumns}
      formatChannels={formatChannels}
      currentRow={currentPosition}
      isPlaying={isPlaying}
      onCellChange={handleCellChange}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
    />
  );
};
