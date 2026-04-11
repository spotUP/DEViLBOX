/**
 * useGTUltraFormatData — Shared hook for GT Ultra pattern data.
 *
 * Converts GT Ultra store state to FormatChannel[] and provides
 * a cell change handler. Used by both DOM (GTUltraView) and
 * Pixi (PixiGTUltraView) to avoid duplicating adapter logic.
 */

import { useCallback, useMemo } from 'react';
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
  // GT Ultra has its own engine — read playback state from the GT Ultra store,
  // NOT from useTransportStore (which tracks the standard tracker engine).
  const gtPlaying = useGTUltraStore((s) => s.playing);
  const playbackRow = useGTUltraStore((s) => s.playbackPos.row);
  const cursorRow = useGTUltraStore((s) => s.cursor.row);
  const orderData = useGTUltraStore((s) => s.orderData);
  const patternData = useGTUltraStore((s) => s.patternData);
  const playbackPos = useGTUltraStore((s) => s.playbackPos);
  const orderCursor = useGTUltraStore((s) => s.orderCursor);
  const currentOrderPos = gtPlaying ? playbackPos.songPos : orderCursor;
  const displayRow = gtPlaying ? playbackRow : cursorRow;

  const channels = useMemo(
    () => gtUltraToFormatChannels(channelCount, orderData, patternData, currentOrderPos),
    [channelCount, orderData, patternData, currentOrderPos],
  );

  const handleCellChange = useCallback(
    (channelIdx: number, rowIdx: number, columnKey: string, value: number) => {
      const engine = useGTUltraStore.getState().engine;
      if (!engine) return;
      const store = useGTUltraStore.getState();

      // Pattern channels only (tables are now in the instrument editor)
      const patIdx = resolveOrderPattern(store.orderData[channelIdx], currentOrderPos);
      const colMap: Record<string, number> = { note: 0, instrument: 1, command: 2, data: 3 };
      const col = colMap[columnKey];
      if (col === undefined) return;
      engine.setPatternCell(patIdx, rowIdx, col, value);
      store.refreshPatternData(patIdx);
    },
    [currentOrderPos, channelCount],
  );

  return { channels, currentRow: displayRow, isPlaying: gtPlaying, channelCount, handleCellChange };
}
