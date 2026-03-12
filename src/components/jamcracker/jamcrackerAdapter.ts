/**
 * JamCracker adapter — Maps JamCracker pattern data to format-agnostic FormatChannel[].
 */

import type { ColumnDef } from '@/components/shared/format-editor-types';

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

// Column definitions for JamCracker
// Main columns: Period | Instr | Speed | Arpeggio | Vibrato | Volume | Porta
// (Phase is typically internal, Porta is portamento/slide)
export const JAMCRACKER_COLUMNS: ColumnDef[] = [
  {
    key: 'period',
    label: 'Note',
    charWidth: 3,
    type: 'note',
    color: 'var(--color-text-secondary)',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    formatter: noteStr,
  },
  {
    key: 'instrument',
    label: 'Ins',
    charWidth: 2,
    type: 'hex',
    color: '#60e060',
    emptyColor: 'var(--color-border-light)',
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
    emptyColor: 'var(--color-border-light)',
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
    emptyColor: 'var(--color-border-light)',
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
    emptyColor: 'var(--color-border-light)',
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
    emptyColor: 'var(--color-border-light)',
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
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 2,
    formatter: hex2,
  },
];

