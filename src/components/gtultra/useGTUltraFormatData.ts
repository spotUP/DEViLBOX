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

  const currentOrderPos = isPlaying ? playbackPos.songPos : orderCursor;
  const displayRow = isPlaying ? playbackPos.row : currentRow;

  const channels = useMemo(
    () => gtUltraToFormatChannels(channelCount, orderData, patternData, currentOrderPos),
    [channelCount, orderData, patternData, currentOrderPos],
  );

  const handleCellChange = useCallback(
    (channelIdx: number, rowIdx: number, columnKey: string, value: number) => {
      const engine = useGTUltraStore.getState().engine;
      if (!engine) return;
      const store = useGTUltraStore.getState();
      const patIdx = resolveOrderPattern(store.orderData[channelIdx], currentOrderPos);
      const colMap: Record<string, number> = { note: 0, instrument: 1, command: 2, data: 3 };
      const col = colMap[columnKey];
      if (col === undefined) return;
      engine.setPatternCell(patIdx, rowIdx, col, value);
    },
    [currentOrderPos],
  );

  return { channels, currentRow: displayRow, isPlaying, channelCount, handleCellChange };
}
