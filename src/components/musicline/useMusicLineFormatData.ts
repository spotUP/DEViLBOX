/**
 * useMusicLineFormatData — Shared hook for MusicLine pattern data.
 *
 * Converts TrackerStore + FormatStore state to FormatChannel[] and provides
 * a cell change handler. Used by DOM (TrackerView) and can be used by Pixi.
 */

import { useCallback, useMemo } from 'react';
import { useTrackerStore, useFormatStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { musiclineToFormatChannels, makeMusicLineCellChange } from './musiclineAdapter';
import type { FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';

export interface MusicLineFormatData {
  channels: FormatChannel[];
  currentRow: number;
  isPlaying: boolean;
  handleCellChange: OnCellChange;
}

export function useMusicLineFormatData(): MusicLineFormatData {
  const channelTrackTables = useFormatStore((s) => s.channelTrackTables);
  const patterns = useTrackerStore((s) => s.patterns);
  const currentPos = useTrackerStore((s) => s.currentPositionIndex);
  const currentRow = useTransportStore((s) => s.currentRow);
  const isPlaying = useTransportStore((s) => s.isPlaying);

  const channels = useMemo(() => {
    if (!channelTrackTables || channelTrackTables.length === 0) return [];
    return musiclineToFormatChannels(channelTrackTables, patterns, currentPos);
  }, [channelTrackTables, patterns, currentPos]);

  const handleCellChange = useCallback<OnCellChange>(
    (channelIdx, rowIdx, columnKey, value) => {
      if (!channelTrackTables) return;
      const changeFn = makeMusicLineCellChange(channelTrackTables, currentPos);
      changeFn(channelIdx, rowIdx, columnKey, value);
    },
    [channelTrackTables, currentPos],
  );

  // Use the global row for now; PatternEditorCanvas doesn't support per-channel rows yet
  const displayRow = isPlaying ? currentRow : 0;

  return { channels, currentRow: displayRow, isPlaying, handleCellChange };
}
