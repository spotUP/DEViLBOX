/**
 * JamCracker adapter — Maps JamCracker pattern data to format-agnostic FormatChannel[].
 */

import type { ColumnDef, FormatCell, FormatChannel } from '@/components/shared/format-editor-types';

// --- Types -------------------------------------------------------------------

export interface JCPatternRow {
  period: number;
  instr: number;
  speed: number;
  arpeggio: number;
  vibrato: number;
  phase: number;
  volume: number;
  porta: number;
}

export interface JCPatternData {
  numRows: number;
  rows: JCPatternRow[][];
}

export interface JCSongInfo {
  songLen: number;
  numPats: number;
  numInst: number;
  entries: number[];
}

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
    pixiColor: 0xaaaacc,
    pixiEmptyColor: 0x444455,
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
    pixiColor: 0x60e060,
    pixiEmptyColor: 0x334433,
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
    pixiColor: 0xffaa55,
    pixiEmptyColor: 0x443322,
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
    pixiColor: 0x55aaff,
    pixiEmptyColor: 0x223344,
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
    pixiColor: 0xff66cc,
    pixiEmptyColor: 0x442233,
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
    pixiColor: 0x66ccff,
    pixiEmptyColor: 0x223344,
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
    pixiColor: 0xccff66,
    pixiEmptyColor: 0x334422,
  },
];

// --- Channel conversion ------------------------------------------------------

/** Convert JCPatternData to FormatChannel[] for use in GenericFormatView / FormatPatternEditor. */
export function jcToChannels(
  patternData: JCPatternData,
  numRows: number,
): FormatChannel[] {
  const result: FormatChannel[] = [];
  for (let ch = 0; ch < 4; ch++) {
    const rows: FormatCell[] = [];
    for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
      const cell = patternData.rows[rowIdx]?.[ch];
      rows.push({
        period: cell?.period ?? 0,
        instrument: cell?.instr ?? 0,
        speed: cell?.speed ?? 0,
        arpeggio: cell?.arpeggio ?? 0,
        vibrato: cell?.vibrato ?? 0,
        volume: cell?.volume ?? 0,
        porta: cell?.porta ?? 0,
      });
    }
    result.push({
      label: `CH ${(ch + 1).toString().padStart(2, '0')}`,
      patternLength: numRows || 32,
      rows,
    });
  }
  return result;
}
