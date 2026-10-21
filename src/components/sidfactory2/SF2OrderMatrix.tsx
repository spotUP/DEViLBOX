/**
 * SF2OrderMatrix - SID Factory II data adapter over the shared SongOrderMatrix.
 *
 * Rows = order positions, three columns per track: sequence index, transposition (signed
 * semitones, +3 / -2; stored as the raw byte, 0xA0 = none) and a loop marker. Edits go through the
 * store's own order-list actions (setOrderEntry / setOrderLoopPoint, both undoable).
 */

import React, { useCallback, useMemo } from 'react';
import { SongOrderMatrix } from '@/components/shared/SongOrderMatrix';
import type { ColumnDef, FormatChannel, OnCellChange } from '@/components/shared/format-editor-types';
import { useSF2Store, type SF2OrderList } from '@/stores/useSF2Store';

export const SF2_ORDER_MATRIX_W = 280;
const NO_TRANSPOSE = 0xA0;

const hex2 = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');

/** Raw transposition byte as the signed semitone offset (0xA0 = none). */
export function sf2TransposeToString(raw: number): string {
  const off = raw - NO_TRANSPOSE;
  return off === 0 ? '..' : `${off > 0 ? '+' : ''}${off}`;
}

/**
 * Typed text ("+3", "-2", "5") to the raw transposition byte: the inverse of sf2TransposeToString. An unsigned number
 * is positive. Null when the text is not a number or the byte leaves SF2's 0x80..0xFD transposition range.
 */
export function sf2TransposeFromString(text: string): number | null {
  const m = /^([+-]?)(\d{1,3})$/.exec(text.trim());
  if (!m) return null;
  const raw = NO_TRANSPOSE + (m[1] === '-' ? -1 : 1) * parseInt(m[2], 10);
  return raw >= 0x80 && raw <= 0xFD ? raw : null;
}

export const SF2_ORDER_COLUMNS: ColumnDef[] = [
  {
    key: 'seq', label: 'Seq', charWidth: 2, type: 'hex', hexDigits: 2,
    color: '#e0e0e0', emptyColor: '#444', emptyValue: -1, // end of list reads dim
    formatter: (v) => (v < 0 ? '..' : hex2(v)),
  },
  {
    key: 'transpose', label: 'Trn', charWidth: 3, type: 'hex', hexDigits: 2,
    color: '#ffcc00', emptyColor: '#444', emptyValue: NO_TRANSPOSE, // only a real transposition lights up
    formatter: sf2TransposeToString,
    parseTyped: sf2TransposeFromString,
  },
  {
    key: 'loop', label: 'Lp', charWidth: 1, type: 'hex', hexDigits: 1,
    color: '#60e060', emptyColor: '#444', emptyValue: 0,
    formatter: (v) => (v ? 'L' : '.'),
  },
];

/** One FormatChannel per track; every track is padded to the longest list (rows past a list's end read '..'). */
export function sf2OrderListsToFormatChannels(orderLists: SF2OrderList[]): FormatChannel[] {
  const numPositions = Math.max(1, ...orderLists.map((ol) => ol.entries.length));
  return orderLists.map((ol, ch) => ({
    label: `T${ch + 1}`,
    patternLength: numPositions,
    rows: Array.from({ length: numPositions }, (_, pos) => {
      const entry = pos < ol.entries.length ? ol.entries[pos] : null;
      if (!entry || entry.seqIdx < 0) return { seq: -1, transpose: NO_TRANSPOSE, loop: 0 };
      return { seq: entry.seqIdx, transpose: entry.transpose, loop: ol.hasLoop && pos === ol.loopIndex ? 1 : 0 };
    }),
  }));
}

/** Route a matrix edit to the store's order-list actions. */
export function applySF2OrderEdit(channel: number, position: number, columnKey: string, value: number): void {
  const store = useSF2Store.getState();
  const ol = store.orderLists[channel];
  if (!ol || position >= ol.entries.length) return;
  if (columnKey === 'seq') store.setOrderEntry(channel, position, { seqIdx: value & 0x7F });
  else if (columnKey === 'transpose') store.setOrderEntry(channel, position, { transpose: value & 0xFF });
  else if (columnKey === 'loop' && value) store.setOrderLoopPoint(channel, position);
}

interface Props {
  orderLists: SF2OrderList[];
  /** The order position to show: the playing one while playing, else the order cursor. */
  currentPosition: number;
  isPlaying: boolean;
  onPositionClick: (pos: number) => void;
}

export const SF2OrderMatrix: React.FC<Props> = React.memo(({ orderLists, currentPosition, isPlaying, onPositionClick }) => {
  const formatChannels = useMemo(() => sf2OrderListsToFormatChannels(orderLists), [orderLists]);
  const handleCellChange = useCallback<OnCellChange>(applySF2OrderEdit, []);
  return (
    <div className="flex-shrink-0 border-r border-dark-border" style={{ width: SF2_ORDER_MATRIX_W }}>
      <SongOrderMatrix
        label="ORDER LISTS"
        formatColumns={SF2_ORDER_COLUMNS}
        formatChannels={formatChannels}
        currentRow={currentPosition}
        isPlaying={isPlaying}
        onCellChange={handleCellChange}
        onPositionClick={onPositionClick}
      />
    </div>
  );
});
