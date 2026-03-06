/**
 * GT Ultra adapter — Maps GT Ultra pattern data to format-agnostic FormatChannel[].
 */

import type { ColumnDef, FormatCell, FormatChannel } from '@/components/shared/format-editor-types';

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteToString(note: number): string {
  if (note === 0 || note === 0xBD) return '...'; // 0=empty, 0xBD=REST
  if (note === 0xBE) return '==='; // keyoff
  if (note === 0xBF) return '+++'; // keyon
  if (note >= 0xC0) return '...'; // ENDPATT and other special values
  const n = note - 1;
  const octave = Math.floor(n / 12);
  const name = NOTE_NAMES[n % 12];
  return `${name}${octave}`;
}

function hex2(val: number): string {
  if (val === 0) return '..';
  return val.toString(16).toUpperCase().padStart(2, '0');
}

// Column definitions for GT Ultra: Note | Inst | Command | Data
export const GTU_COLUMNS: ColumnDef[] = [
  {
    key: 'note',
    label: 'Note',
    charWidth: 3,
    type: 'note',
    color: '#e0e0e0',
    emptyColor: '#333',
    emptyValue: 0,
    formatter: noteToString,
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
    key: 'command',
    label: 'Cmd',
    charWidth: 2,
    type: 'hex',
    color: '#ffcc00',
    emptyColor: '#333',
    emptyValue: 0,
    hexDigits: 2,
    formatter: hex2,
  },
  {
    key: 'data',
    label: 'Data',
    charWidth: 2,
    type: 'hex',
    color: '#ff8866',
    emptyColor: '#333',
    emptyValue: 0,
    hexDigits: 2,
    formatter: hex2,
  },
];

/**
 * Convert GT Ultra pattern data to FormatChannel[].
 *
 * GT Ultra stores patterns directly; this maps channels to FormatChannel format.
 */
export function gtuToFormatChannels(
  patternData: Array<Array<{ note: number; instrument: number; command: number; data: number }>>,
  channelCount: number,
  patternLength: number
): FormatChannel[] {
  const result: FormatChannel[] = [];

  for (let ch = 0; ch < channelCount; ch++) {
    const rows: FormatCell[] = [];

    if (patternData[ch]) {
      for (let rowIdx = 0; rowIdx < patternLength; rowIdx++) {
        const cell = patternData[ch][rowIdx];
        if (cell) {
          rows.push({
            note: cell.note,
            instrument: cell.instrument,
            command: cell.command,
            data: cell.data,
          });
        } else {
          rows.push({
            note: 0,
            instrument: 0,
            command: 0,
            data: 0,
          });
        }
      }
    }

    const label = `CH${(ch + 1).toString().padStart(2, '0')}`;
    result.push({
      label,
      patternLength: rows.length || patternLength,
      rows,
    });
  }

  return result;
}
