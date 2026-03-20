/**
 * StartrekkerAMEncoder — Encodes TrackerCell back to StartrekkerAM format.
 *
 * StarTrekker AM uses standard ProTracker MOD 4-byte cell encoding for the
 * .mod/.adsc file. The AM synthesis parameters live in the separate .nt
 * companion file and are not encoded per-cell.
 *
 * Cell encoding (4 bytes, standard ProTracker MOD):
 *   byte[0] = (instrHi & 0xF0) | ((period >> 8) & 0x0F)
 *   byte[1] = period & 0xFF
 *   byte[2] = ((instrLo & 0x0F) << 4) | (effTyp & 0x0F)
 *   byte[3] = eff & 0xFF
 *
 * Note mapping: XM note → Amiga period via standard ProTracker period table.
 *   XM note 1 = C-0 = period index 0, etc.
 *   The parser uses periodToNote() which returns 1-based note numbers.
 *
 * Reference: StartrekkerAMParser.ts (import), MODEncoder.ts (shared MOD encoding)
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

// ProTracker period table (finetune 0), 36 entries: C-1 to B-3
const MOD_PERIODS = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

/**
 * Convert note number (1-based from parser periodToNote) to Amiga period.
 * The parser's periodToNote() returns 1-based indices into the period table.
 * Returns 0 for no note or out-of-range.
 */
function noteToPeriod(note: number): number {
  if (note === 0) return 0;
  const idx = note - 1; // 1-based to 0-based
  if (idx < 0 || idx >= MOD_PERIODS.length) return 0;
  return MOD_PERIODS[idx];
}

/**
 * Encode a TrackerCell to StarTrekker AM / ProTracker MOD binary (4 bytes).
 */
export function encodeStartrekkerAMCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const period = noteToPeriod(cell.note ?? 0);
  const instr = cell.instrument ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;

  out[0] = (instr & 0xF0) | ((period >> 8) & 0x0F);
  out[1] = period & 0xFF;
  out[2] = ((instr & 0x0F) << 4) | (effTyp & 0x0F);
  out[3] = eff & 0xFF;

  return out;
}

registerPatternEncoder('startrekkerAM', () => encodeStartrekkerAMCell);
