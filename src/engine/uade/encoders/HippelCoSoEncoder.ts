/**
 * HippelCoSoEncoder.ts — Variable-length encoder for Jochen Hippel CoSo patterns.
 *
 * CoSo pattern format (per-channel byte stream):
 *   -1 (0xFF signed):      end of pattern
 *   -2/-3 (0xFE/0xFD):     repeat/loop command + 1 param byte (2 bytes total)
 *   0-83:                   note byte, followed by info byte:
 *                           info & 0x1F = volseq (instrument) index
 *                           info bits 5-7: if non-zero, extra infoPrev byte follows
 *
 * XM note → CoSo note: reverse period table lookup.
 * CoSo note 12 = period 856 = C-1 = XM note 13.
 * So cosoNote ≈ xmNote - 1 (since CoSo 0 maps to XM ~1, CoSo 12 maps to XM 13).
 *
 * Parser reference: HippelCoSoParser.ts lines 410-455
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

// PT periods for reverse lookup (same as parser)
const PT_PERIODS: number[] = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
  107, 101,  95,  90,  85,  80,  76,  72,  68,  64,  60,  57,
];

// CoSo periods (from parser)
const COSO_PERIODS: number[] = [
  1712,1616,1524,1440,1356,1280,1208,1140,1076,1016,960,906,
  856,808,762,720,678,640,604,570,538,508,480,453,
  428,404,381,360,339,320,302,285,269,254,240,226,
  214,202,190,180,170,160,151,143,135,127,120,113,
  107,101,95,90,85,80,76,72,68,64,60,57,
  54,51,48,45,43,40,38,36,34,32,30,28,
  27,25,24,23,21,20,19,18,17,16,15,14,
];

/** Convert XM note (1-96) back to CoSo note index (0-83). */
function xmNoteToCoSo(xmNote: number): number {
  if (xmNote <= 0 || xmNote > 96) return 0;
  // XM note → PT period (xmNote 13 = C-1 = PT_PERIODS[0] = 856)
  const ptIdx = xmNote - 13;
  if (ptIdx < 0 || ptIdx >= PT_PERIODS.length) {
    // Out of PT range — find closest CoSo period
    return Math.max(0, Math.min(83, xmNote - 1));
  }
  const period = PT_PERIODS[ptIdx];
  // Find closest CoSo period
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < COSO_PERIODS.length; i++) {
    const d = Math.abs(COSO_PERIODS[i] - period);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Encode a signed byte as unsigned. */
function s8(v: number): number { return v < 0 ? v + 256 : v & 0xFF; }

export const hippelCoSoEncoder: VariableLengthEncoder = {
  formatId: 'hippelCoSo',

  encodePattern(rows: TrackerCell[]): Uint8Array {
    const buf: number[] = [];

    for (const cell of rows) {
      if (cell.note <= 0) {
        // Empty row — no note. CoSo has no "empty row" concept per se;
        // we emit a note 0 with instrument 0.
        buf.push(0);    // note = 0
        buf.push(0);    // info = 0 (instrument 0, no flags)
      } else {
        const cosoNote = xmNoteToCoSo(cell.note);
        buf.push(s8(cosoNote));
        // info byte: instrument in low 5 bits (0-indexed = instrument - 1)
        const volseqIdx = Math.max(0, (cell.instrument || 1) - 1) & 0x1F;
        buf.push(volseqIdx); // bits 5-7 = 0 (no infoPrev needed)
      }
    }

    // Terminate pattern
    buf.push(s8(-1)); // 0xFF = end of pattern

    return new Uint8Array(buf);
  },
};

registerVariableEncoder(hippelCoSoEncoder);
