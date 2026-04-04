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
import { musiclineToFormatChannels, musiclineToFormatChannelsPerChannel, makeMusicLineCellChange } from './musiclineAdapter';
import type { FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';

export interface MusicLineFormatData {
  channels: FormatChannel[];
  currentRow: number;
  /** Per-channel current row (for independent scrolling) */
  perChannelRows: number[];
  isPlaying: boolean;
  handleCellChange: OnCellChange;
}

export function useMusicLineFormatData(): MusicLineFormatData {
  const channelTrackTables = useFormatStore((s) => s.channelTrackTables);
  const patterns = useTrackerStore((s) => s.patterns);
  const editPos = useTrackerStore((s) => s.currentPositionIndex);
  const transportRow = useTransportStore((s) => s.currentRow);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const patternOrder = useTrackerStore((s) => s.patternOrder);

  // WASM engines (MusicLine) report per-channel position to useWasmPositionStore
  const wasmRow = useWasmPositionStore((s) => s.row);
  const wasmActive = useWasmPositionStore((s) => s.active);
  const channelRows = useWasmPositionStore((s) => s.channelRows);
  const channelPositions = useWasmPositionStore((s) => s.channelPositions);

  const currentRow = wasmActive ? wasmRow : transportRow;
  const maxPos = Math.max(0, patternOrder.length - 1);

  // Build per-channel display data. Each channel uses its own position and shows
  // its own pattern — MusicLine channels advance independently with different
  // speeds and pattern lengths.
  const channels = useMemo(() => {
    if (!channelTrackTables || channelTrackTables.length === 0) return [];

    const hasPerChannel = isPlaying && wasmActive && channelPositions.length > 0;

    if (hasPerChannel) {
      // Per-channel: each channel shows its own position's pattern
      return musiclineToFormatChannelsPerChannel(channelTrackTables, patterns, channelPositions, maxPos);
    }
    // Not playing or no per-channel data: all channels show editPos
    return musiclineToFormatChannels(channelTrackTables, patterns, Math.min(editPos, maxPos));
  }, [channelTrackTables, patterns, isPlaying, wasmActive, channelPositions, editPos, maxPos]);

  const handleCellChange = useCallback<OnCellChange>(
    (channelIdx, rowIdx, columnKey, value) => {
      if (!channelTrackTables) return;
      const changeFn = makeMusicLineCellChange(channelTrackTables, editPos);
      changeFn(channelIdx, rowIdx, columnKey, value);
    },
    [channelTrackTables, editPos],
  );

  // Use channel 0's row for global scroll (best we can do with single-scroll editor)
  const ch0Row = (channelRows.length > 0) ? channelRows[0] : currentRow;
  const maxRow = channels.length > 0 ? (channels[0].patternLength - 1) : 0;
  const clampedRow = Math.min(wasmActive ? ch0Row : currentRow, maxRow);
  const displayRow = isPlaying ? clampedRow : 0;

  // Drive FormatPlaybackState for scroll in the pattern editor.
  useEffect(() => {
    setFormatPlaybackPlaying(isPlaying);
    return () => setFormatPlaybackPlaying(false);
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) setFormatPlaybackRow(clampedRow);
  }, [isPlaying, clampedRow]);

  // Build per-channel row array, clamped to each channel's pattern length
  const perChannelRows = useMemo(() => {
    if (!isPlaying || !wasmActive || channelRows.length === 0) return [];
    return channels.map((ch, i) => {
      const row = channelRows[i] ?? 0;
      return Math.min(row, Math.max(0, ch.patternLength - 1));
    });
  }, [isPlaying, wasmActive, channelRows, channels]);

  return { channels, currentRow: displayRow, perChannelRows, isPlaying, handleCellChange };
}
