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
 * Hively stores a pool of reusable tracks. Each position entry references
 * one track per channel with an optional transpose value.
 */
export function hivelyToFormatChannels(
  nativeData: HivelyNativeData,
  currentPosition: number
): FormatChannel[] {
  const result: FormatChannel[] = [];
  const numCh = nativeData.channels || 4;

  // Get current position entry
  const posEntry = nativeData.positions?.[currentPosition];

  for (let ch = 0; ch < Math.min(numCh, 8); ch++) {
    const trackIdx = posEntry?.track?.[ch] ?? -1;
    const transpose = posEntry?.transpose?.[ch] ?? 0;

    // Build rows from track's steps array
    const rows: FormatCell[] = [];
    if (trackIdx >= 0 && trackIdx < nativeData.tracks.length) {
      const track = nativeData.tracks[trackIdx];
      const steps = track?.steps ?? [];
      for (let rowIdx = 0; rowIdx < steps.length; rowIdx++) {
        const step = steps[rowIdx];
        const note = step?.note ?? 0;
        const ins = step?.instrument ?? 0;
        // Pack fx + fxParam into a single value for the 3-digit hex column
        const fx1 = step ? ((step.fx & 0xF) << 8) | (step.fxParam & 0xFF) : 0;
        const fx2 = step ? ((step.fxb & 0xF) << 8) | (step.fxbParam & 0xFF) : 0;
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
