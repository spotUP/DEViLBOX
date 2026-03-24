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

// Column definitions for GT Ultra: Note | Inst | Command | Data
export const GTU_COLUMNS: ColumnDef[] = [
  {
    key: 'note',
    label: 'Note',
    charWidth: 3,
    type: 'note',
    color: 'var(--color-text-secondary)',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    formatter: gtNoteToString,
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
    formatter: gtHex2,
  },
  {
    key: 'command',
    label: 'Cmd',
    charWidth: 2,
    type: 'hex',
    color: '#ffcc00',
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
    color: '#ff8866',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 2,
    formatter: gtHex2,
  },
];

// Order channel columns: single hex value per row
export const GTU_ORDER_COLUMNS: ColumnDef[] = [
  {
    key: 'note',
    label: 'Val',
    charWidth: 2,
    type: 'hex',
    color: '#ff6666',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 2,
    formatter: gtHex2,
  },
];

// Table channel columns: L (left) and R (right) hex values
export const GTU_TABLE_COLUMNS: ColumnDef[] = [
  {
    key: 'note',
    label: 'L',
    charWidth: 2,
    type: 'hex',
    color: '#60e060',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 2,
    formatter: gtHex2,
  },
  {
    key: 'instrument',
    label: 'R',
    charWidth: 2,
    type: 'hex',
    color: '#ff8866',
    emptyColor: 'var(--color-border-light)',
    emptyValue: 0,
    hexDigits: 2,
    formatter: gtHex2,
  },
];

/**
 * Convert GT Ultra store data to FormatChannel[] for the shared pattern editor.
 *
 * GT patterns are single-channel: each channel has its own order list pointing
 * to shared pattern numbers. This resolves each channel's current pattern and
 * builds the FormatChannel array from the raw Uint8Array pattern data.
 *
 * After the pattern channels, appends special channels for:
 *   Orders (per SID-channel), Wave table, Pulse table, Filter table, Speed table
 * These use the same column layout: note=value1, instrument=value2, command/data=0.
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

  // Order channels — one per SID channel, showing the order list as a vertical column
  for (let ch = 0; ch < channelCount; ch++) {
    const order = orderData[ch];
    const len = order?.length ?? 0;
    const rows: FormatCell[] = [];
    for (let i = 0; i < Math.max(len, maxPatLen); i++) {
      const val = i < len ? (order[i] ?? 0) : 0;
      rows.push({ note: val, instrument: 0, command: 0, data: 0 });
    }
    result.push({
      label: `ORD${ch + 1}`,
      patternLength: Math.max(len, maxPatLen),
      rows,
      columns: GTU_ORDER_COLUMNS,
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
      columns: GTU_TABLE_COLUMNS,
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

