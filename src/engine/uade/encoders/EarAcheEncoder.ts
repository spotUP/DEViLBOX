/**
 * EarAcheEncoder - EarAche (.ea) grid cell codec (third-party/nuade/players/earache/ea_module.c).
 *
 * The row table (header word 0, offset 0x18 after the "EASO" mark) holds 8-byte rows, one 2-byte cell [note, instrument]
 * per voice. note = index into the player's period table (1..70, ascending pitch, 0 = none): grid note = index, in table
 * order only, the octave is not measured against Paula output. instrument = instrument table index, grid instrument =
 * index + 1. A cell the grid cannot show (an instrument byte with no note, or a note above the table) is carried raw:
 * effTyp = first byte, eff = second byte.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

export const EA_MAX_NOTE = 70;

export function decodeEarAcheCell(b: ArrayLike<number>): TrackerCell {
  const shown = b[0] >= 1 && b[0] <= EA_MAX_NOTE;
  return { note: shown ? b[0] : 0, instrument: shown ? b[1] + 1 : 0, volume: 0, effTyp: shown ? 0 : b[0], eff: shown ? 0 : b[1], effTyp2: 0, eff2: 0 };
}

export function encodeEarAcheCell(c: TrackerCell): Uint8Array {
  const note = c.note ?? 0;
  if (note >= 1 && note <= EA_MAX_NOTE) return Uint8Array.of(note, Math.max(0, (c.instrument ?? 0) - 1) & 0xff);
  return Uint8Array.of((c.effTyp ?? 0) & 0xff, (c.eff ?? 0) & 0xff);
}

registerPatternEncoder('earAche', () => encodeEarAcheCell);
