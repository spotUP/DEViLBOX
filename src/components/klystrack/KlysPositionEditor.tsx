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
import { klysSequenceSteps, klysStepIndexAt } from './klysAdapter';

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
  /** The song ROW playing (or edited): klystrack's song position unit. The matrix highlights the step holding it. */
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

  const setEntry = useFormatStore(s => s.setKlysSequenceEntry);

  // Global columns
  const formatColumns = useMemo<ColumnDef[]>(() => {
    return [makePatternColumn(), makeOffsetColumn()];
  }, []);

  // One matrix row per sequence step (the song rows where any channel starts a pattern).
  const steps = useMemo(() => klysSequenceSteps(nativeData), [nativeData]);

  // Build FormatChannel[] — one channel per klystrack channel
  const formatChannels = useMemo<FormatChannel[]>(() => {
    const channels: FormatChannel[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const byRow = new Map<number, { pattern: number; noteOffset: number }>();
      for (const e of nativeData.sequences[ch]?.entries ?? []) byRow.set(e.position, e);
      const rows = steps.map((songRow) => {
        const entry = byRow.get(songRow);
        return entry
          ? { pattern: entry.pattern, noteOffset: entry.noteOffset }
          : { pattern: -1, noteOffset: 0 }; // sentinel for "no entry"
      });
      channels.push({
        label: `CH${(ch + 1).toString().padStart(2, '0')}`,
        patternLength: steps.length,
        rows,
      });
    }
    return channels;
  }, [nativeData, numChannels, steps]);

  const handleCellChange = useCallback<OnCellChange>((channelIdx, rowIdx, columnKey, value) => {
    const songRow = steps[rowIdx];
    if (songRow === undefined) return;
    if (columnKey === 'pattern') {
      setEntry(channelIdx, songRow, 'pattern', value);
    } else if (columnKey === 'noteOffset') {
      setEntry(channelIdx, songRow, 'noteOffset', value);
    }
  }, [setEntry, steps]);

  return (
    <SongOrderMatrix
      label="SEQUENCE"
      width={width}
      height={height}
      formatColumns={formatColumns}
      formatChannels={formatChannels}
      currentRow={klysStepIndexAt(steps, currentPosition)}
      isPlaying={isPlaying}
      onCellChange={handleCellChange}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
    />
  );
};
