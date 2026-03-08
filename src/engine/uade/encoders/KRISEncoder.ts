/**
 * KRISEncoder — Encodes TrackerCell back to KRIS Tracker format.
 *
 * Cell encoding (4 bytes per track row):
 *   byte[0]: noteByte (0xA8 or odd = empty; even 0x18-0x9E = valid)
 *   byte[1]: instrument (1-based)
 *   byte[2]: effect type (low nibble)
 *   byte[3]: effect parameter
 *
 * Note mapping:
 *   Parser: (noteByte - 0x18) / 2 → 0-based index, then apply transpose and map to XM
 *   Reverse: noteIdx = xmNote - 13 (same as Amiga mapping), noteByte = noteIdx * 2 + 0x18
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function encodeKRISCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;

  // Byte 0: noteByte
  if (note > 0 && note >= 13) {
    const noteIdx = note - 13;
    const noteByte = noteIdx * 2 + 0x18;
    out[0] = Math.min(0x9E, noteByte) & 0xFF;
  } else {
    out[0] = 0xA8; // empty
  }

  // Byte 1: instrument
  out[1] = (cell.instrument ?? 0) & 0xFF;

  // Byte 2: effect type (low nibble)
  out[2] = (cell.effTyp ?? 0) & 0x0F;

  // Byte 3: effect param
  out[3] = (cell.eff ?? 0) & 0xFF;

  return out;
}

registerPatternEncoder('kris', () => encodeKRISCell);

export { encodeKRISCell };
