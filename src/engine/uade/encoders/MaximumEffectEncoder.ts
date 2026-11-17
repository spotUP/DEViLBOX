/**
 * MaximumEffectEncoder - the Maximum Effect (Wanted Team "MaximumEffect", MAX.<name>) note word codec.
 *
 * An event starts with a 2-byte note word `1iiiiiii nnnnnnnk` (third-party/nuade/players/maximumeffect/mxe_module.c):
 * bit 15 set, 7-bit instrument, byte offset into the 36-word period table (even), bit 0 = keep volume. Period table
 * index 0 (856) is C-1 = grid note 13. Instrument 0 is shown as 1. The grid shows the note and instrument only; the
 * commands and the duration word that follow the note word are not in the grid and are never rewritten.
 * The stored word (bit 15, keep-volume bit, untouched fields) is the source of truth for an unedited cell.
 */
import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

const OFFSET = 13;

export function decodeMaximumEffectCell(raw: Uint8Array): TrackerCell {
  const idx = (raw[1] & 0xfe) >> 1;
  return {
    note: idx < 36 ? idx + OFFSET : 0, instrument: (raw[0] & 0x7f) + 1, volume: 0,
    effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, period: (raw[0] << 8) | raw[1],
  };
}

export function encodeMaximumEffectCell(cell: TrackerCell, stored?: Uint8Array): Uint8Array {
  const word = stored ? (stored[0] << 8) | stored[1] : ((cell.period ?? 0x8000) & 0xffff);
  const was = decodeMaximumEffectCell(new Uint8Array([word >> 8, word & 0xff]));
  let out = word | 0x8000;
  if (cell.note >= OFFSET && cell.note < OFFSET + 36 && cell.note !== was.note) out = (out & 0xff01) | ((cell.note - OFFSET) << 1);
  if (cell.instrument >= 1 && cell.instrument <= 128 && cell.instrument !== was.instrument) out = (out & 0x80ff) | ((cell.instrument - 1) << 8);
  return new Uint8Array([out >> 8, out & 0xff]);
}

registerPatternEncoder('maximumEffect', () => encodeMaximumEffectCell);
