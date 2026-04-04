/**
 * useMusicLineFormatData — Shared hook for MusicLine pattern data.
 *
 * Converts TrackerStore + FormatStore state to FormatChannel[] and provides
 * a cell change handler. Used by DOM (TrackerView) and can be used by Pixi.
 */

import { useCallback, useMemo } from 'react';
import { useTrackerStore, useFormatStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { useWasmPositionStore } from '@/stores/useWasmPositionStore';
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
  const editPos = useTrackerStore((s) => s.currentPositionIndex);
  const transportRow = useTransportStore((s) => s.currentRow);
  const isPlaying = useTransportStore((s) => s.isPlaying);

  // WASM engines (MusicLine) report position to useWasmPositionStore
  const wasmRow = useWasmPositionStore((s) => s.row);
  const wasmSongPos = useWasmPositionStore((s) => s.songPos);
  const wasmActive = useWasmPositionStore((s) => s.active);

  const currentRow = wasmActive ? wasmRow : transportRow;
  const currentPos = (isPlaying && wasmActive) ? wasmSongPos : editPos;

  const channels = useMemo(() => {
    if (!channelTrackTables || channelTrackTables.length === 0) return [];
    return musiclineToFormatChannels(channelTrackTables, patterns, currentPos);
  }, [channelTrackTables, patterns, currentPos]);

  const handleCellChange = useCallback<OnCellChange>(
    (channelIdx, rowIdx, columnKey, value) => {
      if (!channelTrackTables) return;
      const changeFn = makeMusicLineCellChange(channelTrackTables, editPos);
      changeFn(channelIdx, rowIdx, columnKey, value);
    },
    [channelTrackTables, editPos],
  );

  const displayRow = isPlaying ? currentRow : 0;

  return { channels, currentRow: displayRow, isPlaying, handleCellChange };
}
