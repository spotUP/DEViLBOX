/**
 * useGTUltraFormatData — Shared hook for GT Ultra pattern data.
 *
 * Converts GT Ultra store state to FormatChannel[] and provides
 * a cell change handler. Used by both DOM (GTUltraView) and
 * Pixi (PixiGTUltraView) to avoid duplicating adapter logic.
 */

import { useCallback, useMemo } from 'react';
import { useTransportStore } from '@stores/useTransportStore';
import { useGTUltraStore } from '../../stores/useGTUltraStore';
import { gtUltraToFormatChannels, resolveOrderPattern } from './gtuAdapter';
import type { FormatChannel } from '@/components/shared/format-editor-types';

export interface GTUltraFormatData {
  channels: FormatChannel[];
  currentRow: number;
  isPlaying: boolean;
  channelCount: number;
  handleCellChange: (channelIdx: number, rowIdx: number, columnKey: string, value: number) => void;
}

export function useGTUltraFormatData(): GTUltraFormatData {
  const sidCount = useGTUltraStore((s) => s.sidCount);
  const channelCount = sidCount * 3;
  const currentRow = useTransportStore((s) => s.currentRow);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const orderData = useGTUltraStore((s) => s.orderData);
  const patternData = useGTUltraStore((s) => s.patternData);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const orderCursor = useGTUltraStore((s) => s.orderCursor);
  const tableData = useGTUltraStore((s) => s.tableData);

  const currentOrderPos = isPlaying ? playbackPos.songPos : orderCursor;
  const displayRow = isPlaying ? playbackPos.row : currentRow;

  const channels = useMemo(
    () => gtUltraToFormatChannels(channelCount, orderData, patternData, currentOrderPos, tableData),
    [channelCount, orderData, patternData, currentOrderPos, tableData],
  );

  const handleCellChange = useCallback(
    (channelIdx: number, rowIdx: number, columnKey: string, value: number) => {
      const engine = useGTUltraStore.getState().engine;
      if (!engine) return;
      const store = useGTUltraStore.getState();

      // Pattern channels: 0..channelCount-1
      if (channelIdx < channelCount) {
        const patIdx = resolveOrderPattern(store.orderData[channelIdx], currentOrderPos);
        const colMap: Record<string, number> = { note: 0, instrument: 1, command: 2, data: 3 };
        const col = colMap[columnKey];
        if (col === undefined) return;
        engine.setPatternCell(patIdx, rowIdx, col, value);
        return;
      }

      // Order channels: channelCount..channelCount*2-1
      const orderBase = channelCount;
      if (channelIdx < orderBase + channelCount) {
        const ch = channelIdx - orderBase;
        if (columnKey === 'note') {
          engine.setOrderEntry(ch, rowIdx, value);
          store.refreshAllOrders();
        }
        return;
      }

      // Table channels: channelCount*2..channelCount*2+3
      const tableBase = channelCount * 2;
      const tableIdx = channelIdx - tableBase;
      if (tableIdx >= 0 && tableIdx < 4) {
        const side = columnKey === 'note' ? 0 : columnKey === 'instrument' ? 1 : -1;
        if (side >= 0) {
          engine.setTableEntry(tableIdx, side, rowIdx, value);
          store.refreshAllTables();
        }
      }
    },
    [currentOrderPos, channelCount],
  );

  return { channels, currentRow: displayRow, isPlaying, channelCount, handleCellChange };
}
