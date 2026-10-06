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

/**
 * SM1 notes run from period 5760 down to 127, 66 semitones: 21 below
 * ProTracker's C-1 (856), more than XM's range (note 1 = C-0) can hold.
 * The grid shows every note SM1_DISPLAY_SHIFT semitones (two octaves, so the
 * note names stay true) above its ProTracker-named pitch.
 */
export const SM1_DISPLAY_SHIFT = 24;

/** XM note of period index `k` (1-66), shifted into the grid's range. */
function xmOfIndex(k: number): number {
  return 13 + SM1_DISPLAY_SHIFT + Math.round(12 * Math.log2(856 / SM1_PERIODS[k]));
}

/**
 * XM note of SM1 period index `k` (1-66): the pitch the player sounds for a
 * note byte n plus its track's transpose is period index n (PERIODS[finetune +
 * arpeggio + note], sidmon1.c voice_process).
 */
export function sm1IndexToXM(k: number): number {
  if (k < 1 || k >= SM1_PERIODS.length) return 0;
  return xmOfIndex(k);
}

/** SM1 period index (1-66) nearest to an XM note; 0 for no note. */
export function xmToSm1Index(xmNote: number): number {
  if (xmNote <= 0 || xmNote > 96) return 0;
  let best = 1;
  for (let k = 2; k < SM1_PERIODS.length; k++) {
    if (Math.abs(xmOfIndex(k) - xmNote) < Math.abs(xmOfIndex(best) - xmNote)) best = k;
  }
  return best;
}

export function encodeSidMon1Cell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(5);
  const xmNote = cell.note ?? 0;

  // Byte 0: SM1 note index
  if (xmNote > 0 && xmNote <= 96) {
    out[0] = xmToSm1Index(xmNote);
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

  // Byte-exact carrier restore. SidMon1Parser.decodeCell stashes the exact 5 source
  // bytes in the invisible period/pan/cutoff/resonance carriers (fields the grid loop
  // never sets); reproduce all 5 bytes verbatim for an unedited cell. Edited grid cells
  // lack the carriers and keep the derivation above (which zeroes the unmapped effect
  // and speed bytes).
  if (
    cell.period !== undefined && cell.pan !== undefined &&
    cell.cutoff !== undefined && cell.resonance !== undefined
  ) {
    out[0] = (cell.period >> 8) & 0xFF;
    out[1] = cell.period & 0xFF;
    out[2] = cell.pan & 0xFF;
    out[3] = cell.cutoff & 0xFF;
    out[4] = cell.resonance & 0xFF;
  }

  return out;
}

registerPatternEncoder('sidMon1', () => encodeSidMon1Cell);
