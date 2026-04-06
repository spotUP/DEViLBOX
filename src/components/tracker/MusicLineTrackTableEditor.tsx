/**
 * MusicLineTrackTableEditor — Editable per-channel track table matrix view.
 * Uses the shared SongOrderMatrix with block selection enabled.
 *
 * Shown instead of the standard pattern order list when the loaded song uses
 * per-channel independent track tables (MusicLine Editor and similar formats).
 *
 * Layout:
 *   Rows    = song positions (0..N)
 *   Columns = channels (Ch 1..numChannels)
 *   Cells   = pattern index at that channel x position (hex, 2 nibbles)
 *
 * Block operations (via SongOrderMatrix):
 *   Ctrl/Cmd+C — copy selected rectangular region of track entries
 *   Ctrl/Cmd+X — cut (copy + clear) selected region
 *   Ctrl/Cmd+V — paste at current position
 *   Ctrl/Cmd+A — select all entries
 *   Escape     — clear selection
 */

import React, { useMemo, useCallback } from 'react';
import { useTrackerStore, useFormatStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { useWasmPositionStore } from '@/stores/useWasmPositionStore';
import { SongOrderMatrix } from '@/components/shared/SongOrderMatrix';
import type { ColumnDef, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';
import { ML_TRACK_CMD_FLAG, ML_TRACK_CMD_END, ML_TRACK_CMD_JUMP, ML_TRACK_CMD_WAIT } from '@/lib/import/formats/MusicLineParser';

/**
 * Format a track table entry for display (3 chars wide).
 */
function formatTrackEntry(val: number): string {
  if (val === 0xFFFF) return '...';
  if (val & ML_TRACK_CMD_FLAG) {
    const cmdType = val & 0xFF00;
    const param = val & 0xFF;
    if (cmdType === ML_TRACK_CMD_END) return 'END';
    if (cmdType === (ML_TRACK_CMD_JUMP & 0xFF00)) return 'J' + param.toString(16).toUpperCase().padStart(2, '0');
    if (cmdType === (ML_TRACK_CMD_WAIT & 0xFF00)) return 'W' + param.toString(16).toUpperCase().padStart(2, '0');
    return '???';
  }
  return val.toString(16).toUpperCase().padStart(2, '0') + ' ';
}

const EMPTY_SENTINEL = 0xFFFF;

interface MusicLineTrackTableEditorProps {
  onSeek?: (position: number) => void;
}

export const MusicLineTrackTableEditor: React.FC<MusicLineTrackTableEditorProps> = ({ onSeek }) => {
  const channelTrackTables = useFormatStore((state) => state.channelTrackTables);
  const setTrackEntry = useFormatStore((state) => state.setMusicLineTrackEntry);
  const clearTrackEntry = useFormatStore((state) => state.clearMusicLineTrackEntry);
  const editPos = useTrackerStore((state) => state.currentPositionIndex);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const wasmSongPos = useWasmPositionStore((s) => s.songPos);
  const wasmActive = useWasmPositionStore((s) => s.active);

  const numChannels = channelTrackTables?.length ?? 0;
  const maxPositions = numChannels > 0
    ? Math.max(0, ...channelTrackTables!.map(t => t.length))
    : 0;

  const formatColumns = useMemo<ColumnDef[]>(() => [{
    key: 'track', label: 'Trk', charWidth: 3, type: 'hex' as const, hexDigits: 3,
    color: '#ffffff', emptyColor: '#808080', emptyValue: EMPTY_SENTINEL,
    formatter: formatTrackEntry,
  }], []);

  const formatChannels = useMemo<FormatChannel[]>(() => {
    if (!channelTrackTables || numChannels === 0) return [];
    const channels: FormatChannel[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const rows = [];
      for (let pos = 0; pos < maxPositions; pos++) {
        const patIdx = channelTrackTables[ch]?.[pos];
        rows.push({ track: patIdx === undefined ? EMPTY_SENTINEL : patIdx });
      }
      channels.push({
        label: `C${ch + 1}`,
        patternLength: maxPositions,
        rows,
        columns: [{
          key: 'track', label: `C${ch + 1}`, charWidth: 3, type: 'hex' as const, hexDigits: 3,
          color: '#ffffff', emptyColor: '#808080', emptyValue: EMPTY_SENTINEL,
          formatter: formatTrackEntry,
        }],
      });
    }
    return channels;
  }, [channelTrackTables, numChannels, maxPositions]);

  const handleCellChange = useCallback<OnCellChange>((channelIdx, rowIdx, _columnKey, value) => {
    setTrackEntry(channelIdx, rowIdx, value & 0xFFFF);
    onSeek?.(rowIdx);
  }, [setTrackEntry, onSeek]);

  const getCellValue = useCallback((ch: number, pos: number) => {
    return channelTrackTables?.[ch]?.[pos] ?? 0;
  }, [channelTrackTables]);

  const setCellValue = useCallback((ch: number, pos: number, value: number) => {
    setTrackEntry(ch, pos, value & 0xFFFF);
  }, [setTrackEntry]);

  const clearCellValueCb = useCallback((ch: number, pos: number) => {
    clearTrackEntry(ch, pos);
  }, [clearTrackEntry]);

  if (!channelTrackTables || channelTrackTables.length === 0) return null;

  return (
    <SongOrderMatrix
      label="TRACK TABLE"
      height={160}
      formatColumns={formatColumns}
      formatChannels={formatChannels}
      currentRow={(isPlaying && wasmActive) ? Math.min(wasmSongPos, maxPositions - 1) : editPos}
      isPlaying={isPlaying && wasmActive}
      onCellChange={handleCellChange}
      enableBlockSelection
      getCellValue={getCellValue}
      setCellValue={setCellValue}
      clearCellValue={clearCellValueCb}
      editPosition={editPos}
      numChannels={numChannels}
      numPositions={maxPositions}
    />
  );
};
