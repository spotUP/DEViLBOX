/**
 * monotoneGrid.ts - MONOTONE (.MON) module carrier and grid mapping.
 *
 * The file is a 351-byte header followed by `patterns * 64 rows * tracks`
 * 16-bit little-endian cells, in pattern, row, track order (MT_SONG.PAS
 * TMTSongFileHeader, GetNotePtr). The carrier keeps the original image and
 * the cells as raw words, so encode(decode(bytes)) is byte-identical and an
 * edit rewrites only the words of the cells that changed.
 *
 * Cell word `nnnnnnne eedddddd`: note 7 bits (0 none, 1 = A0, 127 = note off),
 * effect index 3 bits, data 6 bits. Effect indexes 0..7 are the commands
 * 0xy 1xx 2xx 3xx 4xy Bxx Dxx Fxx; an effect index 0 with data 0 is "no effect".
 *
 * Grid mapping: notes are tracker notes (A0 = 10, so MONOTONE note n shows as
 * n + 9), note off is 97, the commands use their standard effTyp (0 1 2 3 4 B D F)
 * and the argument byte verbatim, except 0xy and 4xy whose two 3-bit nibbles
 * show as the usual x<<4|y. MONOTONE notes 88 (cell 97, shows as note off) is
 * the one note the grid cannot tell from note off; edits never rewrite a cell
 * whose shown form did not change, so such a cell survives untouched.
 */
import type { TrackerCell } from '@/types';

export const MON_HEADER_SIZE = 351;
export const MON_ROWS = 64;
export const MON_ORDER_OFFSET = 95;
export const MON_ORDER_SIZE = 256;
export const MON_NOTE_OFF = 127;
export const MON_NOTE_OFFSET = 9;
const GRID_NOTE_OFF = 97;
const ID = 'MONOTONE';

/** Effect index (word bits 6..8) to the grid effTyp. */
export const MON_EFFECT_TYPES: readonly number[] = [0x0, 0x1, 0x2, 0x3, 0x4, 0xb, 0xd, 0xf];

export interface MonotoneModule {
  title: string;
  comment: string;
  version: number;
  patterns: number;
  tracks: number;
  cellSize: number;
  /** Order list up to (not including) the 0xFF end mark, entries as stored. */
  order: number[];
  /** Every cell word: index = (pattern * 64 + row) * tracks + track. */
  words: Uint16Array;
  /** The original file bytes; encode patches the cells into a copy. */
  image: Uint8Array;
}

function pascalString(b: Uint8Array, at: number): string {
  const n = Math.min(b[at], 40);
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(b[at + 1 + i]);
  return s;
}

/**
 * The file starts with the Pascal string "MONOTONE". Needs only the first 9 bytes, so the
 * name-plus-content detection can tell a MONOTONE .mon from a Maniacs of Noise .mon on a
 * header slice.
 */
export function hasMonotoneSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 1 + ID.length || bytes[0] !== ID.length) return false;
  for (let i = 0; i < ID.length; i++) if (bytes[1 + i] !== ID.charCodeAt(i)) return false;
  return true;
}

/** The module, or null when it is not a version 1, 2-byte-cell MONOTONE file of exactly the size its header implies. */
export function decodeMonotoneModule(bytes: Uint8Array): MonotoneModule | null {
  if (bytes.length < MON_HEADER_SIZE || !hasMonotoneSignature(bytes)) return null;
  const version = bytes[91], patterns = bytes[92], tracks = bytes[93], cellSize = bytes[94];
  if (version !== 1 || cellSize !== 2 || tracks < 1 || patterns < 1) return null;
  const count = patterns * MON_ROWS * tracks;
  if (bytes.length !== MON_HEADER_SIZE + count * 2) return null;
  const order: number[] = [];
  for (let i = 0; i < MON_ORDER_SIZE && bytes[MON_ORDER_OFFSET + i] !== 0xff; i++) order.push(bytes[MON_ORDER_OFFSET + i]);
  const words = new Uint16Array(count);
  for (let i = 0; i < count; i++) words[i] = bytes[MON_HEADER_SIZE + i * 2] | (bytes[MON_HEADER_SIZE + i * 2 + 1] << 8);
  return {
    title: pascalString(bytes, 9), comment: pascalString(bytes, 50),
    version, patterns, tracks, cellSize, order, words, image: bytes.slice(),
  };
}

export function isMonotoneModule(bytes: Uint8Array): boolean {
  return decodeMonotoneModule(bytes) !== null;
}

/** The file bytes: the original image with the cell words written back. */
export function encodeMonotoneModule(m: MonotoneModule): Uint8Array {
  const out = m.image.slice();
  for (let i = 0; i < m.words.length; i++) {
    out[MON_HEADER_SIZE + i * 2] = m.words[i] & 0xff;
    out[MON_HEADER_SIZE + i * 2 + 1] = m.words[i] >> 8;
  }
  return out;
}

export const monWordIndex = (m: MonotoneModule, pattern: number, row: number, track: number): number =>
  (pattern * MON_ROWS + row) * m.tracks + track;

/** The grid cell a word shows. */
export function monWordToCell(word: number): TrackerCell {
  const note = word >> 9, idx = (word >> 6) & 7, data = word & 63;
  const cell: TrackerCell = { note: 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0 };
  cell.note = note === 0 ? 0 : note === MON_NOTE_OFF ? GRID_NOTE_OFF : note + MON_NOTE_OFFSET;
  if (idx !== 0 || data !== 0) {
    cell.effTyp = MON_EFFECT_TYPES[idx];
    cell.eff = idx === 0 || idx === 4 ? ((data >> 3) << 4) | (data & 7) : data;
  }
  return cell;
}

/** The word a grid cell is. Notes outside what a word holds, and effects MONOTONE lacks, become empty. */
export function monCellToWord(cell: TrackerCell): number {
  const n = cell.note ?? 0;
  const note = n === GRID_NOTE_OFF ? MON_NOTE_OFF : n - MON_NOTE_OFFSET >= 1 && n - MON_NOTE_OFFSET <= 100 ? n - MON_NOTE_OFFSET : 0;
  const idx = MON_EFFECT_TYPES.indexOf(cell.effTyp ?? 0);
  const eff = cell.eff ?? 0;
  let data = 0;
  let index = 0;
  if (idx > 0 || (idx === 0 && eff !== 0)) {
    index = idx;
    data = idx === 0 || idx === 4 ? (((eff >> 4) & 7) << 3) | (eff & 7) : eff & 63;
  }
  return (note << 9) | (index << 6) | data;
}

export interface MonotoneGridEdit { pattern: number; row: number; channel: number; cell: TrackerCell }

/** Whether two cells show the same thing in the fields the grid decodes. */
export function monCellsEqual(a: TrackerCell, b: TrackerCell): boolean {
  return (a.note ?? 0) === (b.note ?? 0) && (a.effTyp ?? 0) === (b.effTyp ?? 0) && (a.eff ?? 0) === (b.eff ?? 0);
}

/** The file bytes with grid edits written in; the same bytes when no cell differs from what it shows. */
export function applyMonotoneGridEdits(bytes: Uint8Array, edits: readonly MonotoneGridEdit[]): Uint8Array {
  const m = decodeMonotoneModule(bytes);
  if (!m) return bytes;
  let changed = false;
  for (const e of edits) {
    if (e.pattern < 0 || e.pattern >= m.patterns || e.row < 0 || e.row >= MON_ROWS || e.channel < 0 || e.channel >= m.tracks) continue;
    const at = monWordIndex(m, e.pattern, e.row, e.channel);
    if (monCellsEqual(monWordToCell(m.words[at]), e.cell)) continue;
    m.words[at] = monCellToWord(e.cell);
    changed = true;
  }
  return changed ? encodeMonotoneModule(m) : bytes;
}
