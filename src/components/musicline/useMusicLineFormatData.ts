/**
 * useMusicLineFormatData — Shared hook for MusicLine pattern data.
 *
 * Converts TrackerStore + FormatStore state to FormatChannel[] and provides
 * a cell change handler. Used by DOM (TrackerView) and can be used by Pixi.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useTrackerStore, useFormatStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { useWasmPositionStore } from '@/stores/useWasmPositionStore';
import { setFormatPlaybackRow, setFormatPlaybackPlaying } from '@/engine/FormatPlaybackState';
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
  const wasmActive = useWasmPositionStore((s) => s.active);

  const currentRow = wasmActive ? wasmRow : transportRow;

  // IMPORTANT: channels must stay tied to editPos, NOT wasmSongPos.
  // Changing channels during playback triggers usePatternPlayback's needsReload
  // which restarts the WASM engine in a loop. The WASM engine handles its own
  // pattern sequencing — we only need to update the display cursor row.
  const channels = useMemo(() => {
    if (!channelTrackTables || channelTrackTables.length === 0) return [];
    return musiclineToFormatChannels(channelTrackTables, patterns, editPos);
  }, [channelTrackTables, patterns, editPos]);

  const handleCellChange = useCallback<OnCellChange>(
    (channelIdx, rowIdx, columnKey, value) => {
      if (!channelTrackTables) return;
      const changeFn = makeMusicLineCellChange(channelTrackTables, editPos);
      changeFn(channelIdx, rowIdx, columnKey, value);
    },
    [channelTrackTables, editPos],
  );

  const displayRow = isPlaying ? currentRow : 0;

  // Drive FormatPlaybackState so PatternEditorCanvas RAF loop scrolls
  useEffect(() => {
    setFormatPlaybackPlaying(isPlaying);
    return () => setFormatPlaybackPlaying(false);
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) setFormatPlaybackRow(currentRow);
  }, [isPlaying, currentRow]);

  return { channels, currentRow: displayRow, isPlaying, handleCellChange };
}
