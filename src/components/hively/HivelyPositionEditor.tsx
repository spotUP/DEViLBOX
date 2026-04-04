/**
 * HivelyPositionEditor — Editable position matrix for HivelyTracker/AHX.
 * Uses PatternEditorCanvas in format mode for visual consistency with the pattern editor.
 *
 * Each channel has: track (2 hex digits) + transpose (signed 2 hex digits).
 */

import React, { useMemo, useCallback } from 'react';
import type { HivelyNativeData } from '@/types/tracker';
import { useFormatStore } from '@stores';
import { PatternEditorCanvas } from '@/components/tracker/PatternEditorCanvas';
import type { ColumnDef, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';

export const HIVELY_MATRIX_HEIGHT = 200;
export const HIVELY_MATRIX_COLLAPSED_HEIGHT = 28;

// ─── Column definitions ─────────────────────────────────────────────────────

function makeTrackColumn(): ColumnDef {
  return {
    key: 'track',
    label: 'Trk',
    charWidth: 2,
    type: 'hex',
    hexDigits: 2,
    color: '#e0e0e0',
    emptyColor: '#444',
    emptyValue: undefined,
    formatter: (v: number) => v.toString(16).toUpperCase().padStart(2, '0'),
  };
}

function makeTransposeColumn(): ColumnDef {
  return {
    key: 'transpose',
    label: 'Tr',
    charWidth: 3,
    type: 'hex',
    hexDigits: 2,
    color: '#88ff88',
    emptyColor: '#808080',
    emptyValue: undefined,
    formatter: (v: number) => {
      // v is stored unsigned: 0-127 = positive, 128-255 = negative (two's complement in byte)
      // But nativeData stores signed values, so we receive signed here
      const sign = v >= 0 ? '+' : '-';
      const abs = Math.abs(v).toString(16).toUpperCase().padStart(2, '0');
      return `${sign}${abs}`;
    },
  };
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  width: number;
  height: number;
  nativeData: HivelyNativeData;
  currentPosition: number;
  onPositionChange: (pos: number) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const HivelyPositionEditor: React.FC<Props> = ({
  width, height, nativeData, currentPosition, onPositionChange: _onPositionChange,
  collapsed, onToggleCollapse,
}) => {
  const numPos = nativeData.positions.length;
  const numCh = nativeData.channels;

  const setCell = useFormatStore(s => s.setHivelyPositionCell);

  // Global columns (used as default; per-channel columns override)
  const formatColumns = useMemo<ColumnDef[]>(() => {
    return [makeTrackColumn(), makeTransposeColumn()];
  }, []);

  // Build FormatChannel[] — one channel per Hively channel
  const formatChannels = useMemo<FormatChannel[]>(() => {
    const channels: FormatChannel[] = [];
    for (let ch = 0; ch < numCh; ch++) {
      const rows = [];
      for (let pos = 0; pos < numPos; pos++) {
        const p = nativeData.positions[pos];
        rows.push({
          track: p.track[ch] ?? 0,
          transpose: p.transpose[ch] ?? 0,
        });
      }
      channels.push({
        label: `CH${ch + 1}`,
        patternLength: numPos,
        rows,
      });
    }
    return channels;
  }, [nativeData, numPos, numCh]);

  const handleCellChange = useCallback<OnCellChange>((channelIdx, rowIdx, columnKey, value) => {
    if (columnKey === 'track') {
      setCell(rowIdx, channelIdx, 'track', value);
    } else if (columnKey === 'transpose') {
      setCell(rowIdx, channelIdx, 'transpose', value);
    }
  }, [setCell]);

  if (collapsed) {
    return (
      <div
        style={{ height: HIVELY_MATRIX_COLLAPSED_HEIGHT, display: 'flex', alignItems: 'center', cursor: 'pointer', paddingLeft: 8, fontSize: 11, color: '#888', background: 'var(--color-bg-secondary)' }}
        onClick={onToggleCollapse}
      >
        POSITIONS [click to expand]
      </div>
    );
  }

  return (
    <div style={{ width, height, position: 'relative' }}>
      {onToggleCollapse && (
        <div
          style={{ position: 'absolute', top: 0, right: 8, zIndex: 1, cursor: 'pointer', fontSize: 11, color: '#888', lineHeight: '20px' }}
          onClick={onToggleCollapse}
        >
          [collapse]
        </div>
      )}
      <PatternEditorCanvas
        formatColumns={formatColumns}
        formatChannels={formatChannels}
        formatCurrentRow={currentPosition}
        formatIsPlaying={false}
        onFormatCellChange={handleCellChange}
        hideVUMeters={true}
      />
    </div>
  );
};
