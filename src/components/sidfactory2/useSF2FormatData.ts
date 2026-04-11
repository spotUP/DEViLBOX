/**
 * useSF2FormatData — Shared hook for SID Factory II pattern data.
 *
 * Converts SF2 store state to FormatChannel[] and provides a cell change
 * handler. Used by both DOM (SF2View) and Pixi (PixiSF2View) to avoid
 * duplicating adapter logic.
 */

import { useCallback, useMemo } from 'react';
import { useSF2Store } from '@/stores/useSF2Store';
import { sf2ToFormatChannels } from './sf2Adapter';
import type { FormatChannel } from '@/components/shared/format-editor-types';

export interface SF2FormatData {
  channels: FormatChannel[];
  currentRow: number;
  isPlaying: boolean;
  trackCount: number;
  handleCellChange: (channelIdx: number, rowIdx: number, columnKey: string, value: number) => void;
}

export function useSF2FormatData(): SF2FormatData {
  const trackCount = useSF2Store((s) => s.trackCount);
  const playing = useSF2Store((s) => s.playing);
  const playbackRow = useSF2Store((s) => s.playbackPos.row);
  const orderLists = useSF2Store((s) => s.orderLists);
  const sequences = useSF2Store((s) => s.sequences);
  const playbackPos = useSF2Store((s) => s.playbackPos);
  const orderCursor = useSF2Store((s) => s.orderCursor);

  const cursorRow = useSF2Store((s) => s.cursor.row);

  const currentOrderPos = playing ? playbackPos.songPos : orderCursor;
  const displayRow = playing ? playbackRow : cursorRow;

  const channels = useMemo(
    () => sf2ToFormatChannels(trackCount, orderLists, sequences, currentOrderPos),
    [trackCount, orderLists, sequences, currentOrderPos],
  );

  const handleCellChange = useCallback(
    (channelIdx: number, rowIdx: number, columnKey: string, value: number) => {
      const store = useSF2Store.getState();
      const ol = store.orderLists[channelIdx];
      if (!ol || currentOrderPos >= ol.entries.length) return;
      const seqIdx = ol.entries[currentOrderPos].seqIdx;

      const fieldMap: Record<string, keyof typeof store.sequences extends never ? never : string> = {
        note: 'note',
        instrument: 'instrument',
        command: 'command',
      };
      const field = fieldMap[columnKey];
      if (!field) return;

      store.setSequenceCell(seqIdx, rowIdx, field as any, value);
    },
    [currentOrderPos],
  );

  return { channels, currentRow: displayRow, isPlaying: playing, trackCount, handleCellChange };
}
