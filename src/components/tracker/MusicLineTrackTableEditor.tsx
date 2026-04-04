/**
 * MusicLineTrackTableEditor — Editable per-channel track table matrix view.
 * Uses PatternEditorCanvas in format mode for visual consistency with the pattern editor.
 *
 * Shown instead of the standard pattern order list when the loaded song uses
 * per-channel independent track tables (MusicLine Editor and similar formats).
 *
 * Layout:
 *   Rows    = song positions (0..N)
 *   Columns = channels (Ch 1..numChannels)
 *   Cells   = pattern index at that channel x position (hex, 2 nibbles)
 */

import React, { useMemo, useCallback } from 'react';
import { useTrackerStore, useFormatStore } from '@stores';
import { useTransportStore } from '@stores/useTransportStore';
import { useWasmPositionStore } from '@/stores/useWasmPositionStore';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import type { ColumnDef, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';
import { ML_TRACK_CMD_FLAG, ML_TRACK_CMD_END, ML_TRACK_CMD_JUMP, ML_TRACK_CMD_WAIT } from '@/lib/import/formats/MusicLineParser';

/**
 * Format a track table entry for display (3 chars wide).
 * Normal entries: 2-digit hex pattern index (right-padded with space).
 * Special commands (bit 15 set):
 *   END      → "END"
 *   JUMP pos → "Jxx" (xx = hex position)
 *   WAIT cnt → "Wxx" (xx = hex tick count)
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

// Sentinel for undefined/empty cells
const EMPTY_SENTINEL = 0xFFFF;

interface MusicLineTrackTableEditorProps {
  /** Called when user clicks a position cell to navigate */
  onSeek?: (position: number) => void;
}

export const MusicLineTrackTableEditor: React.FC<MusicLineTrackTableEditorProps> = ({ onSeek }) => {
  const channelTrackTables = useFormatStore((state) => state.channelTrackTables);
  const setTrackEntry = useFormatStore((state) => state.setMusicLineTrackEntry);
  const editPos = useTrackerStore((state) => state.currentPositionIndex);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const wasmSongPos = useWasmPositionStore((s) => s.songPos);
  const wasmActive = useWasmPositionStore((s) => s.active);

  const numChannels = channelTrackTables?.length ?? 0;
  const maxPositions = numChannels > 0
    ? Math.max(0, ...channelTrackTables!.map(t => t.length))
    : 0;

  // Global column definition (each channel uses the same 3-char column)
  const formatColumns = useMemo<ColumnDef[]>(() => [{
    key: 'track',
    label: 'Trk',
    charWidth: 3,
    type: 'hex' as const,
    hexDigits: 3,
    color: '#ffffff',
    emptyColor: '#808080',
    emptyValue: EMPTY_SENTINEL,
    formatter: formatTrackEntry,
  }], []);

  // Build FormatChannel[] — one per MusicLine channel
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
          key: 'track',
          label: `C${ch + 1}`,
          charWidth: 3,
          type: 'hex' as const,
          hexDigits: 3,
          color: '#ffffff',
          emptyColor: '#808080',
          emptyValue: EMPTY_SENTINEL,
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

  if (!channelTrackTables || channelTrackTables.length === 0) return null;

  return (
    <div style={{ width: '100%', height: 160 }}>
      <PatternEditorCanvas
        formatColumns={formatColumns}
        formatChannels={formatChannels}
        formatCurrentRow={(isPlaying && wasmActive) ? Math.min(wasmSongPos, maxPositions - 1) : editPos}
        formatIsPlaying={isPlaying && wasmActive}
        onFormatCellChange={handleCellChange}
        hideVUMeters={true}
      />
    </div>
  );
};
