/**
 * David Hanney (.dh) parser.
 *
 * Format (from third-party/nuade/players/davidhanney/davidhanney.c): a 4-byte "DSNG" tag, then chunks of
 * tag(4) + size(4) + data. SEQU holds one pattern number per order (a byte each), INFO holds the order count
 * (u16 at +0) and the speed (u16 at +4), and each "BLK" + pattern number chunk holds a u16 row count followed by
 * rows of 4 voices x 3 bytes: note, instrument, (effect << 4 | parameter).
 *
 * Note bytes: 0 empty, 1 stops the voice, 2 releases it, n >= 3 plays period table entry n - 2. Entry 36 is the
 * 856 period (C-1), which is grid note 13, so grid note = byte - 25. Bytes below 26 lie under the grid's range;
 * encodeCell keeps the stored byte whenever the cell's grid note is unchanged, so the file stays byte-exact.
 *
 * Playback stays with UADE; edits are written into the module bytes through uadePatternLayout.
 */

import type { TrackerSong, TrackerFormat } from '@/engine/TrackerReplayer';
import type { InstrumentConfig, TrackerCell } from '@/types';
import type { UADEPatternLayout } from '@/engine/uade/UADEPatternEncoder';

const FIRST_CHUNK = 4;
const CHUNK_HEADER = 8;
const ROW_COUNT_BYTES = 2;
const CELL_BYTES = 3;
const VOICES = 4;
const ROW_BYTES = VOICES * CELL_BYTES;
const NOTE_STOP = 1;
const NOTE_TABLE_BIAS = 2;
const NOTE_TO_GRID = 25;
const GRID_NOTE_OFF = 97;
const DEFAULT_SPEED = 6;
const INSTRUMENT_COUNT = 16;

function u16BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 8) | buf[off + 1]) >>> 0;
}

function u32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}

function tagAt(buf: Uint8Array, off: number): string {
  return String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
}

/** True when the file starts with the "DSNG" tag followed by the SEQU chunk. */
export function isDavidHanneyFormat(buffer: ArrayBuffer | Uint8Array): boolean {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return buf.length >= 16 && tagAt(buf, 0) === 'DSNG' && tagAt(buf, FIRST_CHUNK) === 'SEQU';
}

interface Chunk {
  tag: string;
  data: number;
  size: number;
  /** Fourth tag byte: the pattern number of a BLK chunk. */
  id: number;
}

function readChunks(buf: Uint8Array): Chunk[] {
  const chunks: Chunk[] = [];
  let off = FIRST_CHUNK;
  while (off + CHUNK_HEADER <= buf.length) {
    const size = u32BE(buf, off + 4);
    const data = off + CHUNK_HEADER;
    if (data + size > buf.length) break;
    chunks.push({ tag: tagAt(buf, off).slice(0, 3), data, size, id: buf[off + 3] });
    off = data + size;
  }
  return chunks;
}

/** Stored cell bytes to a grid cell. Inverse of encodeDavidHanneyCell for every cell the grid can show. */
export function decodeDavidHanneyCell(bytes: Uint8Array): TrackerCell {
  const b = bytes[0];
  let note = 0;
  if (b === NOTE_STOP) note = GRID_NOTE_OFF;
  else if (b > NOTE_TABLE_BIAS && b - NOTE_TO_GRID >= 1 && b - NOTE_TO_GRID < GRID_NOTE_OFF) note = b - NOTE_TO_GRID;
  return {
    note,
    instrument: bytes[1],
    volume: 0,
    effTyp: bytes[2] >> 4,
    eff: bytes[2] & 0x0f,
    effTyp2: 0,
    eff2: 0,
  };
}

/**
 * Grid cell to stored bytes. When the grid note is what the stored note byte already decodes to, the stored byte
 * is kept (release, stop and notes below the grid's range survive an edit of another field).
 */
export function encodeDavidHanneyCell(cell: TrackerCell, stored?: Uint8Array): Uint8Array {
  const out = new Uint8Array(CELL_BYTES);
  const keep = stored !== undefined && decodeDavidHanneyCell(stored).note === cell.note;
  if (keep) out[0] = stored[0];
  else if (cell.note === 0) out[0] = 0;
  else if (cell.note === GRID_NOTE_OFF) out[0] = NOTE_STOP;
  else out[0] = Math.min(255, cell.note + NOTE_TO_GRID);
  out[1] = cell.instrument & 0xff;
  out[2] = ((cell.effTyp & 0x0f) << 4) | (cell.eff & 0x0f);
  return out;
}

export function parseDavidHanneyFile(buffer: ArrayBuffer, filename: string): TrackerSong {
  const buf = new Uint8Array(buffer);
  if (!isDavidHanneyFormat(buf)) throw new Error('Not a David Hanney module');

  const baseName = filename.split('/').pop() ?? filename;
  const moduleName = baseName.replace(/^dh\./i, '').replace(/\.dh$/i, '') || baseName;

  const chunks = readChunks(buf);
  const sequ = chunks.find(c => c.tag === 'SEQ');
  const info = chunks.find(c => c.tag === 'INF');
  const blocks = chunks.filter(c => c.tag === 'BLK');
  if (!sequ || !info || info.size < 6 || blocks.length === 0) throw new Error('David Hanney module: missing chunks');

  const orderCount = Math.min(u16BE(buf, info.data), sequ.size);
  const speed = u16BE(buf, info.data + 4) || DEFAULT_SPEED;

  const blockIndex = new Map<number, number>();
  blocks.forEach((c, i) => blockIndex.set(c.id, i));
  const blockBase = blocks.map(c => c.data);
  const blockRows = blocks.map(c => Math.min(u16BE(buf, c.data), Math.floor((c.size - ROW_COUNT_BYTES) / ROW_BYTES)));

  const patterns = blocks.map((c, p) => ({
    id: `pattern-${p}`,
    name: `Pattern ${c.id}`,
    length: blockRows[p],
    channels: Array.from({ length: VOICES }, (_, ch) => ({
      id: `channel-${ch}`,
      name: `Channel ${ch + 1}`,
      muted: false,
      solo: false,
      collapsed: false,
      volume: 100,
      pan: ch === 0 || ch === 3 ? -50 : 50,
      instrumentId: null,
      color: null,
      rows: Array.from({ length: blockRows[p] }, (_, row) => {
        const off = blockBase[p] + ROW_COUNT_BYTES + row * ROW_BYTES + ch * CELL_BYTES;
        return decodeDavidHanneyCell(buf.subarray(off, off + CELL_BYTES));
      }),
    })),
    importMetadata: {
      sourceFormat: 'MOD' as const,
      sourceFile: filename,
      importedAt: new Date().toISOString(),
      originalChannelCount: VOICES,
      originalPatternCount: blocks.length,
      originalInstrumentCount: INSTRUMENT_COUNT,
    },
  }));

  const songPositions: number[] = [];
  for (let o = 0; o < orderCount; o++) songPositions.push(blockIndex.get(buf[sequ.data + o]) ?? 0);

  const instruments: InstrumentConfig[] = Array.from({ length: INSTRUMENT_COUNT }, (_, i) => ({
    id: i + 1,
    name: '',
    type: 'synth' as const,
    synthType: 'Synth' as const,
    effects: [],
    volume: 0,
    pan: 0,
  } as InstrumentConfig));

  const layout: UADEPatternLayout = {
    formatId: 'davidHanney',
    patternDataFileOffset: blockBase[0] + ROW_COUNT_BYTES,
    bytesPerCell: CELL_BYTES,
    rowsPerPattern: Math.max(...blockRows),
    numChannels: VOICES,
    numPatterns: blocks.length,
    moduleSize: buffer.byteLength,
    encodeCell: encodeDavidHanneyCell,
    encodeOverStored: true,
    decodeCell: decodeDavidHanneyCell,
    getCellFileOffset: (pattern, row, channel) =>
      blockBase[pattern] + ROW_COUNT_BYTES + row * ROW_BYTES + channel * CELL_BYTES,
  };

  return {
    name: `${moduleName} [DavidHanney]`,
    format: 'MOD' as TrackerFormat,
    patterns,
    instruments,
    songPositions,
    songLength: songPositions.length,
    restartPosition: 0,
    numChannels: VOICES,
    initialSpeed: speed,
    initialBPM: 125,
    linearPeriods: false,
    uadeEditableFileData: buffer.slice(0) as ArrayBuffer,
    uadeEditableFileName: filename,
    uadePatternLayout: layout,
  };
}
