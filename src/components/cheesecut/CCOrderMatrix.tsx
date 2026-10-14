/**
 * CCOrderMatrix - CheeseCutter data adapter over the shared SongOrderMatrix.
 *
 * Rows = order positions, per voice: sequence index and transposition. READ-ONLY: the
 * CheeseCutter store has no track-list edit action (trackLists is only written by
 * loadData), and adding a parallel write path here would bypass undo and the live sync,
 * so no onCellChange is passed.
 */

import React, { useMemo } from 'react';
import { SongOrderMatrix } from '@/components/shared/SongOrderMatrix';
import type { ColumnDef, FormatChannel } from '@/components/shared/format-editor-types';
import type { CCTrackListEntry } from '@/stores/useCheeseCutterStore';

export const CC_ORDER_MATRIX_W = 240;

const hex2 = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');

export const CC_ORDER_COLUMNS: ColumnDef[] = [
  {
    key: 'seq', label: 'Seq', charWidth: 2, type: 'hex', hexDigits: 2,
    color: '#e0e0e0', emptyColor: '#444', emptyValue: undefined,
    formatter: (v) => (v < 0 ? '..' : hex2(v)),
  },
  {
    key: 'transpose', label: 'Trn', charWidth: 3, type: 'hex', hexDigits: 2,
    color: '#ffcc00', emptyColor: '#444', emptyValue: 0,
    formatter: (v) => (v === 0 ? '...' : `${v > 0 ? '+' : ''}${v}`),
  },
];

/** One FormatChannel per voice; shorter lists are padded, end markers read '..'. */
export function ccTrackListsToFormatChannels(trackLists: Array<CCTrackListEntry[]>): FormatChannel[] {
  const numPositions = Math.max(1, ...trackLists.map((tl) => tl.length));
  return trackLists.map((tl, ch) => ({
    label: `V${ch + 1}`,
    patternLength: numPositions,
    rows: Array.from({ length: numPositions }, (_, pos) => {
      const entry = pos < tl.length ? tl[pos] : null;
      if (!entry || entry.isEnd) return { seq: -1, transpose: 0 };
      return { seq: entry.sequence, transpose: entry.transpose };
    }),
  }));
}

interface Props {
  trackLists: Array<CCTrackListEntry[]>;
  /** The order position to show: the playing one while playing, else the order cursor. */
  currentPosition: number;
  isPlaying: boolean;
  onPositionClick: (pos: number) => void;
}

export const CCOrderMatrix: React.FC<Props> = React.memo(({ trackLists, currentPosition, isPlaying, onPositionClick }) => {
  const formatChannels = useMemo(() => ccTrackListsToFormatChannels(trackLists), [trackLists]);
  return (
    <div className="flex-shrink-0 border-r border-dark-border" style={{ width: CC_ORDER_MATRIX_W }}>
      <SongOrderMatrix
        label="TRACK LISTS"
        formatColumns={CC_ORDER_COLUMNS}
        formatChannels={formatChannels}
        currentRow={currentPosition}
        isPlaying={isPlaying}
        onPositionClick={onPositionClick}
      />
    </div>
  );
});
