/**
 * DigiBooster1Layout.ts - the byte layout of the DigiBooster 1.x module ("DIGI Booster module", OpenMPT Load_digi.cpp),
 * shared by the importer (cell offsets), the cell encoder and the native exporter (repacking).
 *
 * Header 1572 bytes: channels at 25, packed flag at 26, highest pattern at 46. Patterns follow, then the sample data.
 * Unpacked pattern: channels one after another, 64 rows of 4 bytes each. Packed pattern: u16 BE byte count of what follows,
 * a 64-byte row mask (bit 7 = channel 0), then the 4-byte cells of the set bits in row-major order. A cell is the Amiga word
 * sample-high(4) period(12) sample-low(4) effect(4) parameter(8).
 *
 * Packed edits: a cell that already has bytes is written in place; a cell the mask leaves out, or one cleared to nothing,
 * changes the pattern's length, so the whole pattern is repacked and its size field rewritten (packDigi1Pattern). Patterns
 * without edits are copied as stored, so an unedited module is reproduced byte for byte.
 */
import type { TrackerCell } from '@/types';
import { periodToNote, noteToPeriod } from '@/lib/amiga/periodNotes';

export const DIGI1_HEADER_SIZE = 1572;
export const DIGI1_ROWS = 64;
const CELL_SIZE = 4;
const MAGIC = 'DIGI Booster module';

export interface Digi1Pattern {
  /** File offset of the pattern record (the size field of a packed pattern). */
  start: number;
  /** File offset one past the pattern record. */
  end: number;
  /** Per channel * 64 + row: file offset of the cell's 4 bytes, or -1 when the packed mask leaves it out. */
  cellOffsets: Int32Array;
}

export interface Digi1Scan {
  channels: number;
  packed: boolean;
  patterns: Digi1Pattern[];
  /** File offset where the sample data starts. */
  dataEnd: number;
}

export function isDigi1(b: Uint8Array): boolean {
  if (b.length < DIGI1_HEADER_SIZE) return false;
  for (let i = 0; i < MAGIC.length; i++) if (b[i] !== MAGIC.charCodeAt(i)) return false;
  return true;
}

export function scanDigi1(b: Uint8Array): Digi1Scan | null {
  if (!isDigi1(b)) return null;
  const channels = b[25] || 4;
  const packed = b[26] !== 0;
  const count = (b[46] ?? 0) + 1;
  const patterns: Digi1Pattern[] = [];
  let off = DIGI1_HEADER_SIZE;
  for (let p = 0; p < count; p++) {
    const start = off;
    const cellOffsets = new Int32Array(channels * DIGI1_ROWS).fill(-1);
    if (!packed) {
      for (let ch = 0; ch < channels; ch++) for (let r = 0; r < DIGI1_ROWS; r++) {
        cellOffsets[ch * DIGI1_ROWS + r] = off + CELL_SIZE <= b.length ? off : -1;
        off += CELL_SIZE;
      }
    } else {
      if (off + 2 + DIGI1_ROWS > b.length) return null;
      const size = ((b[off] ?? 0) << 8) | (b[off + 1] ?? 0);
      const end = off + 2 + size;
      let cursor = off + 2 + DIGI1_ROWS;
      for (let r = 0; r < DIGI1_ROWS; r++) {
        const mask = b[off + 2 + r] ?? 0;
        for (let ch = 0; ch < channels; ch++) {
          if (!(mask & (1 << (7 - ch)))) continue;
          if (cursor + CELL_SIZE > b.length) return null;
          cellOffsets[ch * DIGI1_ROWS + r] = cursor;
          cursor += CELL_SIZE;
        }
      }
      off = Math.max(cursor, end);
    }
    patterns.push({ start, end: off, cellOffsets });
  }
  return { channels, packed, patterns, dataEnd: off };
}

/** Decode a cell's 4 bytes. The note is the period's nearest note (13 = C-1), the shared Amiga period table. */
export function decodeDigi1Cell(bytes: Uint8Array): TrackerCell {
  const period = (((bytes[0] ?? 0) & 0x0F) << 8) | (bytes[1] ?? 0);
  const sample = ((bytes[0] ?? 0) & 0xF0) | (((bytes[2] ?? 0) >> 4) & 0x0F);
  return {
    note: period > 0 ? periodToNote(period) : 0,
    instrument: sample,
    volume: 0,
    effTyp: (bytes[2] ?? 0) & 0x0F,
    eff: bytes[3] ?? 0,
    effTyp2: 0, eff2: 0,
  };
}

/** Encode a cell over its stored bytes; a cell that still shows what the stored bytes decode to keeps them (period off the table included). */
export function encodeDigi1Cell(cell: TrackerCell, stored?: Uint8Array): Uint8Array {
  const out = new Uint8Array(CELL_SIZE);
  const shown = decodeDigi1Cell(stored ?? out);
  if (cell.note === shown.note && cell.instrument === shown.instrument && cell.effTyp === shown.effTyp && cell.eff === shown.eff) {
    if (stored) out.set(stored.subarray(0, CELL_SIZE));
    return out;
  }
  const period = cell.note > 0 ? noteToPeriod(cell.note) : 0;
  const sample = Math.max(0, Math.min(255, cell.instrument || 0));
  out[0] = (sample & 0xF0) | ((period >> 8) & 0x0F);
  out[1] = period & 0xFF;
  out[2] = ((sample & 0x0F) << 4) | ((cell.effTyp || 0) <= 0x0F ? (cell.effTyp || 0) & 0x0F : 0);
  out[3] = (cell.eff || 0) & 0xFF;
  return out;
}

/** The record of one packed pattern: u16 byte count, 64-byte row mask, then the cells present. `cells[ch * 64 + row]` is 4 bytes or null for absent. */
export function packDigi1Pattern(cells: ReadonlyArray<Uint8Array | null>, channels: number): Uint8Array {
  const mask = new Uint8Array(DIGI1_ROWS);
  const data: number[] = [];
  for (let r = 0; r < DIGI1_ROWS; r++) for (let ch = 0; ch < channels; ch++) {
    const c = cells[ch * DIGI1_ROWS + r];
    if (!c) continue;
    mask[r] = (mask[r] ?? 0) | (1 << (7 - ch));
    data.push(c[0]!, c[1]!, c[2]!, c[3]!);
  }
  const size = DIGI1_ROWS + data.length;
  const out = new Uint8Array(2 + size);
  out[0] = (size >> 8) & 0xFF; out[1] = size & 0xFF;
  out.set(mask, 2);
  out.set(data, 2 + DIGI1_ROWS);
  return out;
}

/**
 * The module with the grid's edits written in: in place for an unpacked module, by repacking each edited pattern (size field
 * rewritten, the sample data moved up or down behind it) for a packed one. `patterns` is the grid; a cell is edited when it no
 * longer shows what its stored bytes decode to. Returns the original bytes when nothing is edited.
 */
export function patchDigi1Module(source: Uint8Array, patterns: ReadonlyArray<{ channels: ReadonlyArray<{ rows: ReadonlyArray<TrackerCell> }> }>): Uint8Array | null {
  const scan = scanDigi1(source);
  if (!scan) return null;
  const zero = new Uint8Array(CELL_SIZE);
  const parts: Uint8Array[] = [source.subarray(0, DIGI1_HEADER_SIZE)];
  const out = scan.packed ? null : new Uint8Array(source);
  scan.patterns.forEach((pat, p) => {
    const grid = patterns[p];
    const cells: Array<Uint8Array | null> = [];
    let edited = false;
    for (let ch = 0; ch < scan.channels; ch++) for (let r = 0; r < DIGI1_ROWS; r++) {
      const off = pat.cellOffsets[ch * DIGI1_ROWS + r]!;
      const stored = off >= 0 ? source.subarray(off, off + CELL_SIZE) : zero;
      const cell = grid?.channels[ch]?.rows[r];
      if (!cell) { cells.push(off >= 0 ? stored : null); continue; }
      const enc = encodeDigi1Cell(cell, stored);
      const same = enc.every((v, i) => v === stored[i]);
      if (same) { cells.push(off >= 0 ? stored : null); continue; }
      edited = true;
      if (out && off >= 0) out.set(enc, off);
      cells.push(enc.some((v) => v !== 0) ? enc : null);
    }
    if (!out) parts.push(edited ? packDigi1Pattern(cells, scan.channels) : source.subarray(pat.start, pat.end));
  });
  if (out) return out;
  parts.push(source.subarray(scan.dataEnd));
  const total = parts.reduce((n, a) => n + a.length, 0);
  const result = new Uint8Array(total);
  let at = 0;
  for (const a of parts) { result.set(a, at); at += a.length; }
  return result;
}
