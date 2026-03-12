/**
 * MEDEncoder — Encodes TrackerCell back to MED/OctaMED format.
 *
 * Two cell formats:
 *
 * MMD0 (3 bytes):
 *   byte[0]: instrHi[7:4] | periodHi[3:0]
 *   byte[1]: periodLo[7:0]
 *   byte[2]: instrLo[7:4] | effectType[3:0]
 *   (effect param stored separately or as 0)
 *
 * MMD1+ (4 bytes):
 *   byte[0]: note (0=none, 1-96)
 *   byte[1]: instrument
 *   byte[2]: effect type
 *   byte[3]: effect parameter
 *
 * Note: We encode MMD1+ format (4 bytes) as the primary format since
 * it's simpler and more common.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

// MED period table for MMD0 encoding
const MED_PERIODS = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

/**
 * Encode for MMD1+ (4-byte cells).
 */
function encodeMED4Cell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;

  // MMD1+ note: direct note value (parser maps to XM 1:1 in MMD1 mode)
  // Parser: noteRaw (0-based) → XM note directly
  out[0] = note > 0 ? (note & 0xFF) : 0;
  out[1] = (cell.instrument ?? 0) & 0xFF;
  out[2] = (cell.effTyp ?? 0) & 0xFF;
  out[3] = (cell.eff ?? 0) & 0xFF;

  return out;
}

/**
 * Encode for MMD0 (3-byte cells).
 */
function encodeMED3Cell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(3);
  const note = cell.note ?? 0;
  const instr = cell.instrument ?? 0;

  // Convert XM note to period
  let period = 0;
  if (note > 0 && note >= 37) {
    const idx = note - 37;
    if (idx >= 0 && idx < MED_PERIODS.length) {
      period = MED_PERIODS[idx];
    }
  }

  // byte[0]: instrHi[7:4] | periodHi[3:0]
  out[0] = ((instr & 0xF0)) | ((period >> 8) & 0x0F);

  // byte[1]: periodLo
  out[1] = period & 0xFF;

  // byte[2]: instrLo[7:4] | effectType[3:0]
  out[2] = ((instr & 0x0F) << 4) | ((cell.effTyp ?? 0) & 0x0F);

  return out;
}

registerPatternEncoder('med_mmd1', () => encodeMED4Cell);
registerPatternEncoder('med_mmd0', () => encodeMED3Cell);

export { encodeMED4Cell, encodeMED3Cell };
