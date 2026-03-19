/**
 * MODEncoder — Shared encoder for ProTracker MOD-compatible formats.
 *
 * Used by: STK, GMC, ICE, PT36, MFP, and any format using standard
 * 4-byte ProTracker cell encoding with Amiga period values.
 *
 * Cell encoding (4 bytes):
 *   byte[0] = (instrHi & 0xF0) | ((period >> 8) & 0x0F)
 *   byte[1] = period & 0xFF
 *   byte[2] = ((instrLo & 0x0F) << 4) | (effTyp & 0x0F)
 *   byte[3] = eff & 0xFF
 *
 * Note mapping: XM note → Amiga period via standard ProTracker period table.
 *   XM note 37 = C-3 = period 856, XM note 48 = B-3 = period 453, etc.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

// Standard ProTracker period table (finetune 0), 36 entries: C-1 to B-3
const MOD_PERIODS = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

/**
 * Convert XM note number to Amiga period.
 * XM note 37 = C-3 → period index 0 → period 856
 * Returns 0 for no note or out-of-range.
 */
function xmNoteToPeriod(xmNote: number): number {
  if (xmNote === 0) return 0;
  const periodIdx = xmNote - 37; // XM 37 = C-3 = index 0 (FT2 convention)
  if (periodIdx < 0 || periodIdx >= MOD_PERIODS.length) return 0;
  return MOD_PERIODS[periodIdx];
}

/**
 * Encode a TrackerCell to standard ProTracker MOD binary (4 bytes).
 */
export function encodeMODCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const period = xmNoteToPeriod(cell.note ?? 0);
  const instr = cell.instrument ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;

  out[0] = (instr & 0xF0) | ((period >> 8) & 0x0F);
  out[1] = period & 0xFF;
  out[2] = ((instr & 0x0F) << 4) | (effTyp & 0x0F);
  out[3] = eff & 0xFF;

  return out;
}

// Register for all MOD-compatible formats
registerPatternEncoder('mod', () => encodeMODCell);
registerPatternEncoder('stk', () => encodeMODCell);
registerPatternEncoder('gmc', () => encodeMODCell);
registerPatternEncoder('ice', () => encodeMODCell);
registerPatternEncoder('pt36', () => encodeMODCell);
registerPatternEncoder('mfp', () => encodeMODCell);

export { xmNoteToPeriod };
