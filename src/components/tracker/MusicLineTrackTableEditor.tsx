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
 *
 * Block operations (track table level):
 *   Ctrl/Cmd+C — copy selected rectangular region of track entries
 *   Ctrl/Cmd+X — cut (copy + clear) selected region
 *   Ctrl/Cmd+V — paste at current position
 *   Ctrl/Cmd+A — select all entries
 *   Escape     — clear selection
 *
 * The PatternEditorCanvas handles per-cell pattern editing (note/instrument/fx).
 * This component adds track-table-level block operations on top.
 */

import React, { useMemo, useCallback, useState, useRef } from 'react';
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

// ── Track table clipboard ────────────────────────────────────────────────────

interface TrackTableClipboard {
  /** 2D array: [channel][position] of track entry values */
  entries: number[][];
  numChannels: number;
  numPositions: number;
}

// Module-level clipboard persists across re-renders
let trackTableClipboard: TrackTableClipboard | null = null;

// ── Block selection state ────────────────────────────────────────────────────

interface TrackTableSelection {
  startCh: number;
  startPos: number;
  endCh: number;
  endPos: number;
}

function normalizeSelection(sel: TrackTableSelection): { chLo: number; chHi: number; posLo: number; posHi: number } {
  return {
    chLo: Math.min(sel.startCh, sel.endCh),
    chHi: Math.max(sel.startCh, sel.endCh),
    posLo: Math.min(sel.startPos, sel.endPos),
    posHi: Math.max(sel.startPos, sel.endPos),
  };
}

interface MusicLineTrackTableEditorProps {
  /** Called when user clicks a position cell to navigate */
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

  // Block selection state
  const [selection, setSelection] = useState<TrackTableSelection | null>(null);

  // Track the wrapper div for keyboard events
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  // ── Block operations ──────────────────────────────────────────────────────

  const copySelection = useCallback(() => {
    if (!selection || !channelTrackTables) return;
    const { chLo, chHi, posLo, posHi } = normalizeSelection(selection);
    const entries: number[][] = [];
    for (let ch = chLo; ch <= chHi; ch++) {
      const chEntries: number[] = [];
      for (let pos = posLo; pos <= posHi; pos++) {
        chEntries.push(channelTrackTables[ch]?.[pos] ?? 0);
      }
      entries.push(chEntries);
    }
    trackTableClipboard = {
      entries,
      numChannels: chHi - chLo + 1,
      numPositions: posHi - posLo + 1,
    };
  }, [selection, channelTrackTables]);

  const cutSelection = useCallback(() => {
    if (!selection || !channelTrackTables) return;
    copySelection();
    const { chLo, chHi, posLo, posHi } = normalizeSelection(selection);
    for (let ch = chLo; ch <= chHi; ch++) {
      for (let pos = posLo; pos <= posHi; pos++) {
        clearTrackEntry(ch, pos);
      }
    }
    setSelection(null);
  }, [selection, channelTrackTables, copySelection, clearTrackEntry]);

  const pasteAtPosition = useCallback(() => {
    if (!trackTableClipboard || !channelTrackTables) return;
    const { entries, numChannels: clipCh, numPositions: clipPos } = trackTableClipboard;
    // Paste starting at editPos, channel 0
    for (let ch = 0; ch < clipCh; ch++) {
      const targetCh = ch;
      if (targetCh >= numChannels) break;
      for (let pos = 0; pos < clipPos; pos++) {
        const targetPos = editPos + pos;
        if (targetPos >= maxPositions) break;
        setTrackEntry(targetCh, targetPos, entries[ch][pos]);
      }
    }
  }, [channelTrackTables, numChannels, maxPositions, editPos, setTrackEntry]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const isMeta = e.metaKey || e.ctrlKey;

    if (isMeta && e.key === 'c') {
      e.preventDefault();
      copySelection();
      return;
    }
    if (isMeta && e.key === 'x') {
      e.preventDefault();
      cutSelection();
      return;
    }
    if (isMeta && e.key === 'v') {
      e.preventDefault();
      pasteAtPosition();
      return;
    }
    if (isMeta && e.key === 'a') {
      e.preventDefault();
      if (numChannels > 0 && maxPositions > 0) {
        setSelection({
          startCh: 0, startPos: 0,
          endCh: numChannels - 1, endPos: maxPositions - 1,
        });
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setSelection(null);
      return;
    }
  }, [copySelection, cutSelection, pasteAtPosition, numChannels, maxPositions]);

  if (!channelTrackTables || channelTrackTables.length === 0) return null;

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ width: '100%', height: 160, outline: 'none' }}
    >
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
