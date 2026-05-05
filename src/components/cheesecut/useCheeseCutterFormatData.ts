/**
 * useCheeseCutterFormatData — Shared hook for CheeseCutter pattern data.
 *
 * Converts CheeseCutter store state to FormatChannel[] and provides a cell change
 * handler. Used by both DOM (CheeseCutterView) and Pixi to avoid
 * duplicating adapter logic.
 */

import { useCallback, useMemo } from 'react';
import { useCheeseCutterStore } from '@/stores/useCheeseCutterStore';
import { useTransportStore } from '@/stores/useTransportStore';
import { useTrackerStore } from '@/stores/useTrackerStore';
import { cheeseCutterToFormatChannels } from './cheeseCutterAdapter';
import type { FormatChannel } from '@/components/shared/format-editor-types';

export interface CheeseCutterFormatData {
  channels: FormatChannel[];
  currentRow: number;
  isPlaying: boolean;
  handleCellChange: (channelIdx: number, rowIdx: number, columnKey: string, value: number) => void;
}

interface ResolveCheeseCutterPlaybackViewArgs {
  transportPlaying: boolean;
  transportRow: number;
  transportSongPos: number;
  storePlaying: boolean;
  storePlaybackRow: number;
  storePlaybackSongPos: number;
  orderCursor: number;
  cursorRow: number;
}

export function resolveCheeseCutterPlaybackView({
  transportPlaying,
  transportRow,
  transportSongPos,
  storePlaying,
  storePlaybackRow,
  storePlaybackSongPos,
  orderCursor,
  cursorRow,
}: ResolveCheeseCutterPlaybackViewArgs): { currentOrderPos: number; displayRow: number; isPlaying: boolean } {
  const isPlaying = transportPlaying || storePlaying;
  const liveSongPos = transportPlaying ? transportSongPos : storePlaybackSongPos;
  const liveRow = transportPlaying ? transportRow : storePlaybackRow;

  return {
    currentOrderPos: isPlaying ? liveSongPos : orderCursor,
    displayRow: isPlaying ? liveRow : cursorRow,
    isPlaying,
  };
}

export function useCheeseCutterFormatData(): CheeseCutterFormatData {
  const storePlaying = useCheeseCutterStore((s) => s.playing);
  const playbackRow = useCheeseCutterStore((s) => s.playbackPos.row);
  const sequences = useCheeseCutterStore((s) => s.sequences);
  const trackLists = useCheeseCutterStore((s) => s.trackLists);
  const playbackPos = useCheeseCutterStore((s) => s.playbackPos);
  const orderCursor = useCheeseCutterStore((s) => s.orderCursor);
  const cursorRow = useCheeseCutterStore((s) => s.cursor.row);
  const transportPlaying = useTransportStore((s) => s.isPlaying);
  const transportRow = useTransportStore((s) => s.currentRow);
  const transportSongPos = useTrackerStore((s) => s.currentPositionIndex);

  const { currentOrderPos, displayRow, isPlaying } = resolveCheeseCutterPlaybackView({
    transportPlaying,
    transportRow,
    transportSongPos,
    storePlaying,
    storePlaybackRow: playbackRow,
    storePlaybackSongPos: playbackPos.songPos,
    orderCursor,
    cursorRow,
  });

  const channels = useMemo(
    () => cheeseCutterToFormatChannels(sequences, trackLists, currentOrderPos),
    [sequences, trackLists, currentOrderPos],
  );

  const handleCellChange = useCallback(
    (channelIdx: number, rowIdx: number, columnKey: string, value: number) => {
      const store = useCheeseCutterStore.getState();
      const tl = store.trackLists[channelIdx];
      if (!tl || currentOrderPos >= tl.length) return;
      const entry = tl[currentOrderPos];
      if (entry.isEnd) return;
      const seqIdx = entry.sequence;

      const fieldMap: Record<string, string> = {
        note: 'note',
        instrument: 'instrument',
        command: 'command',
      };
      const field = fieldMap[columnKey];
      if (!field) return;

      store.setSequenceCell(seqIdx, rowIdx, field as 'note' | 'instrument' | 'command', value);
    },
    [currentOrderPos],
  );

  return { channels, currentRow: displayRow, isPlaying, handleCellChange };
}
