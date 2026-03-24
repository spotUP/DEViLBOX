/**
 * GT Ultra adapter — Maps GT Ultra pattern data to format-agnostic FormatChannel[].
 */

import type { ColumnDef, FormatCell, FormatChannel } from '@/components/shared/format-editor-types';

export const GT_NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

export function gtNoteToString(note: number): string {
  if (note === 0 || note === 0xBD) return '...'; // 0=empty, 0xBD=REST
  if (note === 0xBE) return '==='; // keyoff
  if (note === 0xBF) return '+++'; // keyon
  if (note >= 0xC0) return '...'; // ENDPATT and other special values
  const n = note - 1;
  const octave = Math.floor(n / 12);
  const name = GT_NOTE_NAMES[n % 12];
  return `${name}${octave}`;
}

export function gtHex2(val: number): string {
  if (val === 0) return '..';
  return val.toString(16).toUpperCase().padStart(2, '0');
}

// GoatTracker order list command bytes: 0xD0+ are commands, not pattern numbers
const GT_MAX_PATT = 0xD0;

/** Resolve an order position to an actual pattern number, skipping GT commands (>=0xD0). */
export function resolveOrderPattern(orderData: Uint8Array | undefined, pos: number): number {
  if (!orderData) return 0;
  for (let i = pos; i < orderData.length; i++) {
    const v = orderData[i];
    if (v < GT_MAX_PATT) return v;
    if (v === 0xFF) return 0; // LOOPSONG
  }
  return 0;
}

// Shared color palette (matches GTOrderMatrix section colors)
const GT_COLORS = {
  orders: '#ff6666',
  wave:   '#60e060',
  pulse:  '#ff8866',
  filter: '#ffcc00',
  speed:  '#6699ff',
};

// Column definitions for GT Ultra: Note | Inst | Command | Data
export const GTU_COLUMNS: ColumnDef[] = [
  {
    key: 'note',
    label: 'Note',
    charWidth: 3,
    type: 'note',
    color: GT_COLORS.orders,
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    formatter: gtNoteToString,
  },
  {
    key: 'instrument',
    label: 'Ins',
    charWidth: 2,
    type: 'hex',
    color: GT_COLORS.wave,
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 2,
    formatter: gtHex2,
  },
  {
    key: 'command',
    label: 'Cmd',
    charWidth: 2,
    type: 'hex',
    color: GT_COLORS.filter,
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 2,
    formatter: gtHex2,
  },
  {
    key: 'data',
    label: 'Data',
    charWidth: 2,
    type: 'hex',
    color: GT_COLORS.pulse,
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 2,
    formatter: gtHex2,
  },
];

// Per-table column factories using section colors
function makeTableColumns(color: string): ColumnDef[] {
  return [
    {
      key: 'note',
      label: 'L',
      charWidth: 2,
      type: 'hex' as const,
      color,
      emptyColor: 'var(--color-border-light)',
      emptyValue: 0,
      hexDigits: 2,
      formatter: gtHex2,
    },
    {
      key: 'instrument',
      label: 'R',
      charWidth: 2,
      type: 'hex' as const,
      color,
      emptyColor: 'var(--color-border-light)',
      emptyValue: 0,
      hexDigits: 2,
      formatter: gtHex2,
    },
  ];
}

export const GTU_WAVE_COLUMNS   = makeTableColumns(GT_COLORS.wave);
export const GTU_PULSE_COLUMNS  = makeTableColumns(GT_COLORS.pulse);
export const GTU_FILTER_COLUMNS = makeTableColumns(GT_COLORS.filter);
export const GTU_SPEED_COLUMNS  = makeTableColumns(GT_COLORS.speed);

const TABLE_COLUMN_DEFS = [GTU_WAVE_COLUMNS, GTU_PULSE_COLUMNS, GTU_FILTER_COLUMNS, GTU_SPEED_COLUMNS];

/**
 * Convert GT Ultra store data to FormatChannel[] for the shared pattern editor.
 *
 * GT patterns are single-channel: each channel has its own order list pointing
 * to shared pattern numbers. This resolves each channel's current pattern and
 * builds the FormatChannel array from the raw Uint8Array pattern data.
 *
 * After the pattern channels, appends table channels:
 *   Wave table, Pulse table, Filter table, Speed table
 * Orders live in the GTOrderMatrix above the pattern editor (not duplicated here).
 */
export function gtUltraToFormatChannels(
  channelCount: number,
  orderData: Record<number, Uint8Array>,
  patternData: Map<number, { length: number; data: Uint8Array }>,
  currentOrderPos: number,
  tableData?: Record<string, { left: Uint8Array; right: Uint8Array }>,
): FormatChannel[] {
  const result: FormatChannel[] = [];

  // Determine max pattern length for consistent row count
  let maxPatLen = 64;
  for (let ch = 0; ch < channelCount; ch++) {
    const patIdx = resolveOrderPattern(orderData[ch], currentOrderPos);
    const pat = patternData.get(patIdx);
    if (pat && pat.length > maxPatLen) maxPatLen = pat.length;
  }

  // Pattern channels
  for (let ch = 0; ch < channelCount; ch++) {
    const patIdx = resolveOrderPattern(orderData[ch], currentOrderPos);
    const pat = patternData.get(patIdx);
    const rows: FormatCell[] = [];
    const patLen = pat?.length ?? maxPatLen;

    for (let row = 0; row < patLen; row++) {
      if (pat && row < pat.length) {
        const off = row * 4;
        rows.push({
          note: pat.data[off] ?? 0,
          instrument: pat.data[off + 1] ?? 0,
          command: pat.data[off + 2] ?? 0,
          data: pat.data[off + 3] ?? 0,
        });
      } else {
        rows.push({ note: 0, instrument: 0, command: 0, data: 0 });
      }
    }

    result.push({
      label: `CH${(ch + 1).toString().padStart(2, '0')}`,
      patternLength: patLen,
      rows,
    });
  }

  // Table channels — Wave, Pulse, Filter, Speed (L + R as note + instrument columns)
  const TABLE_NAMES = ['WAVE', 'PULSE', 'FLTR', 'SPEED'];
  const TABLE_KEYS = ['wave', 'pulse', 'filter', 'speed'];
  for (let t = 0; t < 4; t++) {
    const tbl = tableData?.[TABLE_KEYS[t]];
    const rows: FormatCell[] = [];
    for (let i = 0; i < 255; i++) {
      rows.push({
        note: tbl ? tbl.left[i] : 0,
        instrument: tbl ? tbl.right[i] : 0,
        command: 0,
        data: 0,
      });
    }
    result.push({
      label: TABLE_NAMES[t],
      patternLength: 255,
      rows,
      columns: TABLE_COLUMN_DEFS[t],
    });
  }

  return result;
}

/**
 * Parse binary pattern data from WASM into structured cell format.
 *
 * GT Ultra stores patterns as Uint8Array with 4 bytes per cell: [note, instr, cmd, data]
 */
export function parseBinaryPatternData(
  binaryData: Uint8Array,
  channelCount: number,
  patternLength: number
): Array<Array<{ note: number; instrument: number; command: number; data: number }>> {
  const patterns: Array<Array<{ note: number; instrument: number; command: number; data: number }>> = [];

  for (let ch = 0; ch < channelCount; ch++) {
    const channel: Array<{ note: number; instrument: number; command: number; data: number }> = [];
    for (let row = 0; row < patternLength; row++) {
      const offset = (ch * patternLength + row) * 4;
      channel.push({
        note: binaryData[offset] ?? 0,
        instrument: binaryData[offset + 1] ?? 0,
        command: binaryData[offset + 2] ?? 0,
        data: binaryData[offset + 3] ?? 0,
      });
    }
    patterns.push(channel);
  }

  return patterns;
}

