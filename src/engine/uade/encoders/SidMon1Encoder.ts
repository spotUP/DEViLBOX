/**
 * SidMon1Encoder — Encodes TrackerCell back to SidMon 1.0 (.sid1/.smn) format.
 *
 * Cell encoding (5 bytes per row):
 *   byte[0]: note (0=no note, 1-66 = SM1 period table index)
 *   byte[1]: sample (1-based instrument, 0=none)
 *   byte[2]: effect
 *   byte[3]: effect parameter
 *   byte[4]: speed (0 = no speed change)
 *
 * Note mapping: SM1 notes are 0-based indices into SM1_PERIODS table.
 * The parser converts SM1 note → ProTracker period → XM note.
 * The encoder reverses: XM note → closest SM1 period table index.
 *
 * Note: Track transpose is applied at parse time and NOT reversed here.
 * This matches the SoundMon encoder pattern — edits write raw note values.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

// SM1 period table (from parser) — index 0 is unused, 1-66 are valid
const SM1_PERIODS: number[] = [
  0,
  5760,5424,5120,4832,4560,4304,4064,3840,3616,3424,3232,3048,
  2880,2712,2560,2416,2280,2152,2032,1920,1808,1712,1616,1524,
  1440,1356,1280,1208,1140,1076,1016, 960, 904, 856, 808, 762,
   720, 678, 640, 604, 570, 538, 508, 480, 452, 428, 404, 381,
   360, 339, 320, 302, 285, 269, 254, 240, 226, 214, 202, 190,
   180, 170, 160, 151, 143, 135, 127,
];

// Standard ProTracker periods for reverse mapping
const PT_PERIODS: number[] = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

/**
 * Convert XM note to SM1 note index (1-66).
 * XM note 13 = C-1 → PT period 856 → closest SM1 index.
 */
function xmNoteToSM1(xmNote: number): number {
  if (xmNote <= 0 || xmNote > 96) return 0;
  // XM note → PT period
  const ptIdx = xmNote - 13;
  if (ptIdx < 0 || ptIdx >= PT_PERIODS.length) return 0;
  const period = PT_PERIODS[ptIdx];

  // Find closest SM1 period (indices 1-66)
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 1; i < SM1_PERIODS.length; i++) {
    const d = Math.abs(SM1_PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function encodeSidMon1Cell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(5);
  const xmNote = cell.note ?? 0;

  // Byte 0: SM1 note index
  if (xmNote > 0 && xmNote <= 96) {
    out[0] = xmNoteToSM1(xmNote);
  } else {
    out[0] = 0;
  }

  // Byte 1: sample (1-based)
  out[1] = (cell.instrument ?? 0) & 0xFF;

  // Byte 2: effect (not mapped by parser, store 0)
  out[2] = 0;

  // Byte 3: effect parameter
  out[3] = 0;

  // Byte 4: speed (0 = no change)
  out[4] = 0;

  return out;
}

registerPatternEncoder('sidMon1', () => encodeSidMon1Cell);
