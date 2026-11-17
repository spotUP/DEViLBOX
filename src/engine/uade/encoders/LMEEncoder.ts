/**
 * LMEEncoder - the Leggless Music Editor (.lme) note-word codec.
 *
 * An event's note word is an index into a 37-entry period table (ProTracker periods 856 .. 107,
 * third-party/nuade/players/legglessmusiceditor/lme_module.c k_periods); the position list adds a per-pattern
 * transposition to it. The grid note is measured from the period (periodToGridNote), never from a base constant.
 * The raw word and the pattern's transposition ride in the invisible `period` field (word + transpose16 * 65536), so only a
 * note edit changes the module. Stop events have no note word and are not placed in the layout.
 */
import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';

export const LME_PERIODS = [
  0x358, 0x328, 0x2FA, 0x2D0, 0x2A6, 0x280, 0x25C, 0x23A, 0x21A, 0x1FC, 0x1E0, 0x1C5, 0x1AC,
  0x194, 0x17D, 0x168, 0x153, 0x140, 0x12E, 0x11D, 0x10D, 0x0FE, 0x0F0, 0x0E2, 0x0D6, 0x0CA,
  0x0BE, 0x0B4, 0x0AA, 0x0A0, 0x097, 0x08F, 0x087, 0x07F, 0x078, 0x071, 0x06B,
];

const GRID_NOTES = LME_PERIODS.map(periodToGridNote);

const pack = (word: number, transpose: number) => word + (transpose & 0xffff) * 0x10000;
const wordOf = (period: number) => period % 0x10000;
const transposeOf = (period: number) => (Math.floor(period / 0x10000) << 16) >> 16;

export function decodeLMECell(raw: Uint8Array, transpose = 0): TrackerCell {
  const word = (raw[0] << 8) | raw[1];
  const i = (word + transpose) & 0xffff;
  return { note: i < LME_PERIODS.length ? GRID_NOTES[i] : 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, period: pack(word, transpose) };
}

export function encodeLMECell(cell: TrackerCell, stored?: Uint8Array): Uint8Array {
  const period = cell.period ?? 0;
  const transpose = transposeOf(period);
  const keep = stored ? (stored[0] << 8) | stored[1] : wordOf(period);
  const out = (w: number) => new Uint8Array([(w >> 8) & 0xff, w & 0xff]);
  const cur = (keep + transpose) & 0xffff;
  if (!cell.note || (cur < GRID_NOTES.length && GRID_NOTES[cur] === cell.note)) return out(keep);
  const j = GRID_NOTES.indexOf(cell.note);
  return out(j >= 0 ? (j - transpose) & 0xffff : keep);
}

registerPatternEncoder('lme', () => encodeLMECell);
