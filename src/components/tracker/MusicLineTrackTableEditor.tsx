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

function formatHex2(val: number): string {
  if (val === 0xFFFF) return '..';
  return val.toString(16).toUpperCase().padStart(2, '0');
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

  if (!channelTrackTables || channelTrackTables.length === 0) return null;

  const numChannels = channelTrackTables.length;
  const maxPositions = Math.max(0, ...channelTrackTables.map(t => t.length));

  // Global column definition (each channel uses the same 2-digit hex column)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const formatColumns = useMemo<ColumnDef[]>(() => [{
    key: 'track',
    label: 'Trk',
    charWidth: 2,
    type: 'hex' as const,
    hexDigits: 2,
    color: '#ffffff',
    emptyColor: '#808080',
    emptyValue: EMPTY_SENTINEL,
    formatter: formatHex2,
  }], []);

  // Build FormatChannel[] — one per MusicLine channel
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const formatChannels = useMemo<FormatChannel[]>(() => {
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
          charWidth: 2,
          type: 'hex' as const,
          hexDigits: 2,
          color: '#ffffff',
          emptyColor: '#808080',
          emptyValue: EMPTY_SENTINEL,
          formatter: formatHex2,
        }],
      });
    }
    return channels;
  }, [channelTrackTables, numChannels, maxPositions]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const handleCellChange = useCallback<OnCellChange>((channelIdx, rowIdx, _columnKey, value) => {
    setTrackEntry(channelIdx, rowIdx, value & 0xFF);
    onSeek?.(rowIdx);
  }, [setTrackEntry, onSeek]);

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
