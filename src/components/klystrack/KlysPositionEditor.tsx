/**
 * KlysPositionEditor — Editable sequence/position table for klystrack.
 * Klystrack data adapter over the shared SongOrderMatrix.
 *
 * Each channel has: pattern (3 decimal digits) + noteOffset (signed 2 hex digits).
 */

import React, { useMemo, useCallback } from 'react';
import type { KlysNativeData } from '@/types/tracker';
import { useFormatStore } from '@stores';
import { SongOrderMatrix } from '@/components/shared/SongOrderMatrix';
import type { ColumnDef, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';

export const KLYS_MATRIX_HEIGHT = 200;
export const KLYS_MATRIX_COLLAPSED_HEIGHT = 28;

// ─── Column definitions ─────────────────────────────────────────────────────

function makePatternColumn(): ColumnDef {
  return {
    key: 'pattern',
    label: 'Pat',
    charWidth: 3,
    type: 'hex',
    hexDigits: 3,
    color: '#e0e0e0',
    emptyColor: '#444',
    emptyValue: undefined,
    formatter: (v: number) => {
      if (v < 0) return '---';
      return v.toString().padStart(3, '0');
    },
  };
}

function makeOffsetColumn(): ColumnDef {
  return {
    key: 'noteOffset',
    label: 'Off',
    charWidth: 3,
    type: 'hex',
    hexDigits: 2,
    color: '#88ff88',
    emptyColor: '#808080',
    emptyValue: undefined,
    formatter: (v: number) => {
      const sign = v >= 0 ? '+' : '-';
      const abs = Math.abs(v).toString().padStart(2, '0');
      return `${sign}${abs}`;
    },
  };
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface KlysPositionEditorProps {
  width: number;
  height: number;
  nativeData: KlysNativeData;
  currentPosition: number;
  /** The song is playing: the matrix follows currentPosition, one step per pattern played. */
  isPlaying: boolean;
  onPositionChange: (pos: number) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const KlysPositionEditor: React.FC<KlysPositionEditorProps> = ({
  width, height, nativeData, currentPosition, isPlaying, onPositionChange: _onPositionChange,
  collapsed, onToggleCollapse,
}) => {
  const numChannels = nativeData.channels;
  const numPositions = nativeData.songLength;

  const setEntry = useFormatStore(s => s.setKlysSequenceEntry);

  // Global columns
  const formatColumns = useMemo<ColumnDef[]>(() => {
    return [makePatternColumn(), makeOffsetColumn()];
  }, []);

  // Build FormatChannel[] — one channel per klystrack channel
  const formatChannels = useMemo<FormatChannel[]>(() => {
    const channels: FormatChannel[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const seq = nativeData.sequences[ch];
      const rows = [];
      for (let pos = 0; pos < numPositions; pos++) {
        const entry = seq?.entries.find(e => e.position === pos);
        if (entry) {
          rows.push({
            pattern: entry.pattern,
            noteOffset: entry.noteOffset,
          });
        } else {
          rows.push({
            pattern: -1,  // sentinel for "no entry"
            noteOffset: 0,
          });
        }
      }
      channels.push({
        label: `CH${(ch + 1).toString().padStart(2, '0')}`,
        patternLength: numPositions,
        rows,
      });
    }
    return channels;
  }, [nativeData, numChannels, numPositions]);

  const handleCellChange = useCallback<OnCellChange>((channelIdx, rowIdx, columnKey, value) => {
    if (columnKey === 'pattern') {
      setEntry(channelIdx, rowIdx, 'pattern', value);
    } else if (columnKey === 'noteOffset') {
      setEntry(channelIdx, rowIdx, 'noteOffset', value);
    }
  }, [setEntry]);

  return (
    <SongOrderMatrix
      label="SEQUENCE"
      width={width}
      height={height}
      formatColumns={formatColumns}
      formatChannels={formatChannels}
      currentRow={currentPosition}
      isPlaying={isPlaying}
      onCellChange={handleCellChange}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
    />
  );
};
