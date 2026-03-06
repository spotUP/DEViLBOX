/**
 * Hively adapter — Maps HivelyNativeData to format-agnostic FormatChannel[].
 */

import type { ColumnDef, FormatCell, FormatChannel } from '@/components/shared/format-editor-types';
import type { HivelyNativeData } from '@/types/tracker';

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteToString(note: number, transpose: number): string {
  if (note === 0) return '---';
  const t = note + transpose;
  if (t < 1 || t > 60) return '???';
  const n = t - 1;
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12)}`;
}

function fxToString(fx: number, param: number): string {
  if (fx === 0 && param === 0) return '000';
  return `${fx.toString(16).toUpperCase()}${param.toString(16).toUpperCase().padStart(2, '0')}`;
}

function hex2(val: number): string {
  return val.toString(16).toUpperCase().padStart(2, '0');
}

// Column definitions for Hively: Note | Inst | FX1 | FX2
export const HIVELY_COLUMNS: ColumnDef[] = [
  {
    key: 'note',
    label: 'Note',
    charWidth: 3,
    type: 'note',
    color: '#e0e0e0',
    emptyColor: '#333',
    emptyValue: 0,
    formatter: (val: number) => noteToString(val, 0), // transpose applied during rendering
  },
  {
    key: 'instrument',
    label: 'Ins',
    charWidth: 2,
    type: 'hex',
    color: '#60e060',
    emptyColor: '#333',
    emptyValue: 0,
    hexDigits: 2,
    formatter: hex2,
  },
  {
    key: 'fx1',
    label: 'Fx1',
    charWidth: 3,
    type: 'hex',
    color: '#ffaa55',
    emptyColor: '#333',
    emptyValue: 0,
    hexDigits: 3,
    formatter: (val: number) => fxToString((val >> 8) & 0xF, val & 0xFF),
  },
  {
    key: 'fx2',
    label: 'Fx2',
    charWidth: 3,
    type: 'hex',
    color: '#55aaff',
    emptyColor: '#333',
    emptyValue: 0,
    hexDigits: 3,
    formatter: (val: number) => fxToString((val >> 8) & 0xF, val & 0xFF),
  },
];

/**
 * Convert HivelyNativeData to FormatChannel[] for pattern editing.
 *
 * Maps the Hively track pool to individual channels with note transpose applied.
 */
export function hivelyToFormatChannels(
  nativeData: HivelyNativeData,
  currentPosition: number
): FormatChannel[] {
  const result: FormatChannel[] = [];

  // Get current song and positions
  const songIdx = 0; // Assuming single song for now
  const song = nativeData.songs?.[songIdx];
  if (!song) return result;

  for (let ch = 0; ch < Math.min(nativeData.numChannels || 4, 8); ch++) {
    // Get the track for this channel at current position
    let trackIdx = -1;
    let transpose = 0;

    // Find the position entry
    if (song.positionTable && currentPosition < song.positionTable.length) {
      const posEntry = song.positionTable[currentPosition];
      if (posEntry && ch < posEntry.tracks.length) {
        trackIdx = posEntry.tracks[ch].trackIdx;
        transpose = posEntry.tracks[ch].transpose || 0;
      }
    }

    // Build rows from track data
    const rows: FormatCell[] = [];
    if (trackIdx >= 0 && trackIdx < nativeData.tracks.length) {
      const track = nativeData.tracks[trackIdx];
      for (let rowIdx = 0; rowIdx < (track?.numRows || 64); rowIdx++) {
        const note = track?.notes?.[rowIdx] || 0;
        const ins = track?.instruments?.[rowIdx] || 0;
        const fx1 = track?.fx1?.[rowIdx] || 0;
        const fx2 = track?.fx2?.[rowIdx] || 0;
        rows.push({ note, instrument: ins, fx1, fx2 });
      }
    }

    const patternLength = rows.length || 64;
    const label = trackIdx >= 0
      ? `CH${(ch + 1).toString().padStart(2, '0')}:T${trackIdx.toString().padStart(3, '0')}${transpose ? (transpose > 0 ? `+${transpose}` : `${transpose}`) : ''}`
      : `CH${(ch + 1).toString().padStart(2, '0')}`;

    result.push({ label, patternLength, rows });
  }

  return result;
}
