/**
 * KlysPositionEditor — Editable sequence/position table for klystrack.
 * Klystrack data adapter over the shared SongOrderMatrix.
 *
 * Each channel has: pattern (3 decimal digits) + noteOffset (signed 2 hex digits).
 */

import React, { useMemo, useCallback } from 'react';
import type { KlysNativeData } from '@/types/tracker';
import { SongOrderMatrix } from '@/components/shared/SongOrderMatrix';
import type { ColumnDef, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';
import { klysSequenceSteps, klysStepIndexAt } from './klysAdapter';
import { klysSequenceChange } from './klysEdit';

export const KLYS_MATRIX_HEIGHT = 200;

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
  nativeData: KlysNativeData;
  /** The song ROW playing (or the edit position): klystrack's song position unit. The matrix highlights the step holding it. */
  songRow: number;
  /** The song is playing: the matrix follows songRow, one step per sequence step played. */
  isPlaying: boolean;
  /** A press on a matrix row: the song row its step starts at. */
  onPositionClick?: (songRow: number) => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const KlysPositionEditor: React.FC<KlysPositionEditorProps> = ({
  nativeData, songRow, isPlaying, onPositionClick,
}) => {
  const numChannels = nativeData.channels;

  const formatColumns = useMemo<ColumnDef[]>(() => [makePatternColumn(), makeOffsetColumn()], []);

  // One matrix row per sequence step (the song rows where any channel starts a pattern).
  const steps = useMemo(() => klysSequenceSteps(nativeData), [nativeData]);

  // One FormatChannel per klystrack channel
  const formatChannels = useMemo<FormatChannel[]>(() => {
    const channels: FormatChannel[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
      const byRow = new Map<number, { pattern: number; noteOffset: number }>();
      for (const e of nativeData.sequences[ch]?.entries ?? []) byRow.set(e.position, e);
      const rows = steps.map((stepRow) => {
        const entry = byRow.get(stepRow);
        return entry
          ? { pattern: entry.pattern, noteOffset: entry.noteOffset }
          : { pattern: -1, noteOffset: 0 }; // sentinel for "no entry"
      });
      channels.push({ label: `Channel ${ch + 1}`, patternLength: steps.length, rows });
    }
    return channels;
  }, [nativeData, numChannels, steps]);

  const handleCellChange = useCallback<OnCellChange>((channelIdx, rowIdx, columnKey, value) => {
    const stepRow = steps[rowIdx];
    if (stepRow === undefined) return;
    if (columnKey === 'pattern' || columnKey === 'noteOffset') klysSequenceChange(channelIdx, stepRow, columnKey, value);
  }, [steps]);

  const handlePositionClick = useCallback((rowIdx: number) => {
    const stepRow = steps[rowIdx];
    if (stepRow !== undefined) onPositionClick?.(stepRow);
  }, [steps, onPositionClick]);

  return (
    <SongOrderMatrix
      label="Sequence"
      height={KLYS_MATRIX_HEIGHT}
      formatColumns={formatColumns}
      formatChannels={formatChannels}
      currentRow={klysStepIndexAt(steps, songRow)}
      isPlaying={isPlaying}
      onCellChange={handleCellChange}
      onPositionClick={handlePositionClick}
    />
  );
};
