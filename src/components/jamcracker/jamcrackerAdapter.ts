/**
 * JamCracker adapter — Maps JamCracker pattern data to format-agnostic FormatChannel[].
 */

import type { ColumnDef, FormatCell, FormatChannel } from '@/components/shared/format-editor-types';

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

function noteStr(period: number): string {
  if (!period) return '---';
  if (period < 1 || period > 36) return '???';
  const n = period - 1;
  return NOTE_NAMES[n % 12] + (Math.floor(n / 12) + 1);
}

function hex2(val: number): string {
  return val ? val.toString(16).toUpperCase().padStart(2, '0') : '--';
}

function hex1(val: number): string {
  return val ? val.toString(16).toUpperCase() : '-';
}

// Column definitions for JamCracker
// Main columns: Period | Instr | Speed | Arpeggio | Vibrato | Volume | Porta
// (Phase is typically internal, Porta is portamento/slide)
export const JAMCRACKER_COLUMNS: ColumnDef[] = [
  {
    key: 'period',
    label: 'Note',
    charWidth: 3,
    type: 'note',
    color: '#e0e0e0',
    emptyColor: '#333',
    emptyValue: 0,
    formatter: noteStr,
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
    key: 'speed',
    label: 'Spd',
    charWidth: 2,
    type: 'hex',
    color: '#ffaa55',
    emptyColor: '#333',
    emptyValue: 0,
    hexDigits: 2,
    formatter: hex2,
  },
  {
    key: 'arpeggio',
    label: 'Arp',
    charWidth: 2,
    type: 'hex',
    color: '#55aaff',
    emptyColor: '#333',
    emptyValue: 0,
    hexDigits: 2,
    formatter: hex2,
  },
  {
    key: 'vibrato',
    label: 'Vib',
    charWidth: 2,
    type: 'hex',
    color: '#ff66cc',
    emptyColor: '#333',
    emptyValue: 0,
    hexDigits: 2,
    formatter: hex2,
  },
  {
    key: 'volume',
    label: 'Vol',
    charWidth: 2,
    type: 'hex',
    color: '#66ccff',
    emptyColor: '#333',
    emptyValue: 0,
    hexDigits: 2,
    formatter: hex2,
  },
  {
    key: 'porta',
    label: 'Prt',
    charWidth: 2,
    type: 'hex',
    color: '#ccff66',
    emptyColor: '#333',
    emptyValue: 0,
    hexDigits: 2,
    formatter: hex2,
  },
];

/**
 * Convert JamCracker pattern data to FormatChannel[].
 *
 * JamCracker has 4 channels with 32 rows per pattern.
 */
export function jamcrackerToFormatChannels(
  patterns: Array<any>, // Pattern data from engine
  numRows: number = 32,
  currentPatternIndices: number[] = [0, 0, 0, 0]
): FormatChannel[] {
  const result: FormatChannel[] = [];
  const CHANNELS = 4;

  for (let ch = 0; ch < CHANNELS; ch++) {
    const patIdx = currentPatternIndices[ch] || 0;
    const pattern = patterns?.[patIdx];
    const rows: FormatCell[] = [];

    if (pattern?.rows && pattern.rows[ch]) {
      for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
        const row = pattern.rows[ch][rowIdx];
        if (row) {
          rows.push({
            period: row.period || 0,
            instrument: row.instr || 0,
            speed: row.speed || 0,
            arpeggio: row.arpeggio || 0,
            vibrato: row.vibrato || 0,
            volume: row.volume || 0,
            porta: row.porta || 0,
          });
        } else {
          rows.push({
            period: 0,
            instrument: 0,
            speed: 0,
            arpeggio: 0,
            vibrato: 0,
            volume: 0,
            porta: 0,
          });
        }
      }
    }

    const label = `CH${(ch + 1).toString().padStart(2, '0')}:P${patIdx.toString().padStart(2, '0')}`;
    result.push({
      label,
      patternLength: rows.length || numRows,
      rows,
    });
  }

  return result;
}
