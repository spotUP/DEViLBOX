/**
 * DigitalMugicianEncoder — Encodes TrackerCell back to Digital Mugician (.dmu) format.
 *
 * Cell encoding (4 bytes per row):
 *   byte[0]: note (DM period table index, 0=no note)
 *   byte[1]: sample (bits[5:0] = instrument index, 1-based)
 *   byte[2]: effect byte (0-63=portamento target, 64+=effect type)
 *   byte[3]: effect parameter (signed int8)
 *
 * Note: The parser applies per-track transpose + per-instrument finetune when
 * building the displayed XM note. This encoder converts XM note back to a raw
 * DM period index WITHOUT accounting for transpose (same pattern as SoundMon).
 * The 68k replayer applies transpose at playback time.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

// First 57 entries of DM_PERIODS (finetune 0 group) for reverse lookup
const DM_PERIODS_FT0: number[] = [
  3220,3040,2869,2708,2556,2412,2277,2149,2029,1915,1807,1706,
  1610,1520,1434,1354,1278,1206,1139,1075,1014, 957, 904, 853,
   805, 760, 717, 677, 639, 603, 569, 537, 507, 479, 452, 426,
   403, 380, 359, 338, 319, 302, 285, 269, 254, 239, 226, 213,
   201, 190, 179, 169, 160, 151, 142, 134, 127,
];

/**
 * Convert XM note (1-96) to DM period table index (0-56 in finetune 0 group).
 * Parser uses: bestIdx + 1 for XM note, so reverse: dmIdx = xmNote - 1.
 */
function xmNoteToDMIndex(xmNote: number): number {
  if (xmNote <= 0 || xmNote > 96) return 0;
  // Parser maps DM index → XM note via: xmNote = bestIdx + 1
  // Reverse: dmIndex = xmNote - 1
  const idx = xmNote - 1;
  return Math.max(0, Math.min(DM_PERIODS_FT0.length - 1, idx));
}

export function encodeDigitalMugicianCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const xmNote = cell.note ?? 0;

  // Byte 0: DM note index
  if (xmNote > 0 && xmNote <= 96) {
    out[0] = xmNoteToDMIndex(xmNote);
  } else {
    out[0] = 0;
  }

  // Byte 1: sample (6-bit, 0=none)
  out[1] = (cell.instrument ?? 0) & 0x3F;

  // Byte 2: effect — default to 64 (no effect / val1=2)
  // Parser: val1 = effect < 64 ? 1 : effect - 62
  // So effect=64 → val1=2 (no effect), effect=65 → val1=3 (volume), etc.
  // For basic encoding, write 64 (no effect) unless we have effect data
  const effTyp = cell.effTyp ?? 0;
  if (effTyp === 0) {
    out[2] = 64; // no effect
  } else if (effTyp === 0x0F && (cell.eff ?? 0) > 0 && (cell.eff ?? 0) <= 15) {
    // Set speed → DM effect val1=6 → effect = 6 + 62 = 68
    out[2] = 68;
  } else if (effTyp === 0x0E && (cell.eff ?? 0) === 0x01) {
    // LED filter on → DM effect val1=7 → effect = 7 + 62 = 69
    out[2] = 69;
  } else if (effTyp === 0x0E && (cell.eff ?? 0) === 0x00) {
    // LED filter off → DM effect val1=8 → effect = 8 + 62 = 70
    out[2] = 70;
  } else if (effTyp === 0x03) {
    // Tone portamento → DM val1=12 → effect = 12 + 62 = 74
    out[2] = 74;
  } else {
    out[2] = 64; // fallback: no effect
  }

  // Byte 3: effect parameter (signed int8)
  if (effTyp === 0x01) {
    // Portamento up → positive param
    out[3] = Math.min(cell.eff ?? 0, 127) & 0xFF;
  } else if (effTyp === 0x02) {
    // Portamento down → negative param
    out[3] = (-(Math.min(cell.eff ?? 0, 127))) & 0xFF;
  } else if (effTyp === 0x0F) {
    out[3] = (cell.eff ?? 0) & 0xFF;
  } else if (effTyp === 0x03) {
    out[3] = (cell.eff ?? 0) & 0xFF;
  } else {
    out[3] = 0;
  }

  return out;
}

registerPatternEncoder('digitalMugician', () => encodeDigitalMugicianCell);
