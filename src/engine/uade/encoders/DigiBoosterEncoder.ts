/**
 * DigiBoosterEncoder — Encodes TrackerCell back to DigiBooster (.digi/.dbm) format.
 *
 * Cell encoding (4 bytes):
 *   byte[0]: note (0=none; 1-96 raw, parser adds +12 for XM)
 *   byte[1]: instrument (0-indexed)
 *   byte[2]: effect type
 *   byte[3]: effect parameter
 *
 * Note mapping: XM note → DBM raw = xmNote - 12
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function encodeDigiBoosterCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;

  // Byte 0: note (reverse of +12 offset)
  if (note > 0 && note > 12) {
    out[0] = Math.min(96, note - 12);
  } else {
    out[0] = 0;
  }

  // Byte 1: instrument (0-indexed; parser adds +1, so subtract)
  const instr = cell.instrument ?? 0;
  out[1] = instr > 0 ? (instr - 1) & 0xFF : 0;

  // Byte 2-3: effect type + param (ProTracker compatible)
  out[2] = (cell.effTyp ?? 0) & 0xFF;
  out[3] = (cell.eff ?? 0) & 0xFF;

  return out;
}

registerPatternEncoder('digiBooster', () => encodeDigiBoosterCell);

export { encodeDigiBoosterCell };
