/**
 * Art of Noise (.aon) grid view of the module bytes: where each grid cell lives in the file, and
 * how a grid edit is written back.
 *
 * Layout (ArtOfNoiseParser.ts): chunks from offset 46; INFO (version, positions, restart), PLST (one
 * stored-pattern number per position), PATT (stored patterns x 64 rows x channels x 4 bytes).
 *   b0 = [unused:2 | note:6]   b1 = [arpeggioLo:2 | instrument:6]
 *   b2 = [arpeggioHi:2 | effect:6]   b3 = effect argument
 *
 * The grid has one pattern per POSITION; positions share stored patterns, so one stored pattern shows
 * up in several grid patterns. A write goes to the stored pattern the position names, only the fields
 * of a cell that differ from what the stored cell shows are rewritten (the unused and arpeggio top bits
 * and effects the grid cannot show are carried), and siblingPositions lists every other position that
 * shows the same stored pattern (the live edit refreshes those).
 */
import type { TrackerCell } from '@/types';
import { aonEffectToGridEffect, aonNoteToGridNote, gridNoteToAonNote, isAonGridEffect } from './aonNotes';
import { reverseEffect } from '@/engine/uade/encoders/ArtOfNoiseEncoder';

export const AON_ROWS = 64;
const CELL = 4;
const MAX_INSTRUMENT = 63;

export interface AonGridEdit { pattern: number; row: number; channel: number; cell: TrackerCell }

export interface AonModule {
  channels: number;
  /** Stored pattern number of each position (grid pattern index = position). */
  positions: number[];
  storedPatterns: number;
  /** File offset of the first byte of the PATT chunk data. */
  patternOffset: number;
}

function u32(b: Uint8Array, o: number): number {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

export function decodeArtOfNoiseModule(bytes: Uint8Array): AonModule | null {
  if (bytes.length < 54) return null;
  const mark = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (mark !== 'AON4' && mark !== 'AON8') return null;
  const channels = mark === 'AON8' ? 8 : 4;
  let numPositions = 0;
  let plst: number[] | null = null;
  let patternOffset = 0;
  let storedPatterns = 0;
  let off = 46;
  while (off + 8 <= bytes.length) {
    const name = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
    const size = u32(bytes, off + 4);
    off += 8;
    if (off + size > bytes.length) break;
    if (name === 'INFO' && size >= 3) numPositions = bytes[off + 1];
    else if (name === 'PLST') plst = Array.from(bytes.subarray(off, off + size));
    else if (name === 'PATT') {
      patternOffset = off;
      storedPatterns = Math.floor(size / (CELL * channels * AON_ROWS));
    }
    off += size;
  }
  if (!plst || !patternOffset) return null;
  return { channels, positions: plst.slice(0, numPositions), storedPatterns, patternOffset };
}

/** File offset of a stored cell. */
export function aonCellOffset(m: AonModule, stored: number, row: number, channel: number): number {
  return m.patternOffset + ((stored * AON_ROWS + row) * m.channels + channel) * CELL;
}

/** The grid cell a stored cell shows (what the parser puts in the grid). */
export function aonCellToGrid(bytes: Uint8Array, off: number): TrackerCell {
  const { effTyp, eff } = aonEffectToGridEffect(bytes[off + 2] & 0x3f, bytes[off + 3]);
  return {
    note: aonNoteToGridNote(bytes[off] & 0x3f), instrument: bytes[off + 1] & 0x3f, volume: 0,
    effTyp, eff, effTyp2: 0, eff2: 0,
  };
}

/** Positions (other than `position`) that show the same stored pattern. */
export function siblingPositions(m: AonModule, position: number): number[] {
  const stored = m.positions[position];
  return m.positions.flatMap((s, i) => (s === stored && i !== position ? [i] : []));
}

/**
 * Write grid edits into a copy of the module. Returns the same array when nothing changes. An edit
 * is rejected (skipped) when it holds something the file cannot: instrument above 63, a note outside
 * the 60 the format has, an effect the grid does not map.
 */
export function applyArtOfNoiseGridEdits(bytes: Uint8Array, edits: readonly AonGridEdit[]): Uint8Array {
  const m = decodeArtOfNoiseModule(bytes);
  if (!m) return bytes;
  let out: Uint8Array | null = null;
  for (const { pattern, row, channel, cell } of edits) {
    const stored = m.positions[pattern];
    if (stored === undefined || stored >= m.storedPatterns || row < 0 || row >= AON_ROWS || channel < 0 || channel >= m.channels) continue;
    const note = cell.note ?? 0;
    const instrument = cell.instrument ?? 0;
    const effTyp = cell.effTyp ?? 0;
    const eff = cell.eff ?? 0;
    if (instrument < 0 || instrument > MAX_INSTRUMENT) continue;
    if (note !== 0 && gridNoteToAonNote(note) === 0) continue;
    if (!isAonGridEffect(effTyp)) continue;
    const off = aonCellOffset(m, stored, row, channel);
    const src = out ?? bytes;
    // Compared with the ORIGINAL cell, so a sibling position still showing the old value never undoes an edit.
    const shown = aonCellToGrid(bytes, off);
    let b0 = src[off], b1 = src[off + 1], b2 = src[off + 2], b3 = src[off + 3];
    if (note !== shown.note) b0 = (b0 & 0xc0) | gridNoteToAonNote(note);
    if (instrument !== shown.instrument) b1 = (b1 & 0xc0) | instrument;
    if (effTyp !== shown.effTyp || eff !== shown.eff) {
      const e = reverseEffect(effTyp, eff);
      b2 = (b2 & 0xc0) | (e.effect & 0x3f);
      b3 = e.effectArg & 0xff;
    }
    if (b0 === src[off] && b1 === src[off + 1] && b2 === src[off + 2] && b3 === src[off + 3]) continue;
    if (!out) out = new Uint8Array(bytes);
    out[off] = b0; out[off + 1] = b1; out[off + 2] = b2; out[off + 3] = b3;
  }
  return out ?? bytes;
}

type GridPattern = { channels: Array<{ rows: TrackerCell[] }> };
export interface AonLinkedEdit { pattern: number; row: number; channel: number; values: Pick<TrackerCell, 'note' | 'instrument' | 'effTyp' | 'eff'> }

/**
 * The cells of the other positions that show the stored pattern `patternIndex` shows, with the values
 * the edit gave (before -> after of one grid pattern). Cells a sibling already shows are not returned.
 */
export function aonLinkedEdits(bytes: Uint8Array, patternIndex: number, before: GridPattern, after: GridPattern, patterns: readonly GridPattern[]): AonLinkedEdit[] {
  const m = decodeArtOfNoiseModule(bytes);
  if (!m) return [];
  const sibs = siblingPositions(m, patternIndex);
  if (sibs.length === 0) return [];
  const out: AonLinkedEdit[] = [];
  after.channels.forEach((ch, channel) => ch.rows.forEach((cell, row) => {
    const old = before.channels[channel]?.rows[row];
    if (!old || (['note', 'instrument', 'effTyp', 'eff'] as const).every((f) => (old[f] ?? 0) === (cell[f] ?? 0))) return;
    for (const pattern of sibs) {
      const there = patterns[pattern]?.channels[channel]?.rows[row];
      if (!there) continue;
      const values = { note: cell.note ?? 0, instrument: cell.instrument ?? 0, effTyp: cell.effTyp ?? 0, eff: cell.eff ?? 0 };
      if ((['note', 'instrument', 'effTyp', 'eff'] as const).every((f) => (there[f] ?? 0) === values[f])) continue;
      out.push({ pattern, row, channel, values });
    }
  }));
  return out;
}
