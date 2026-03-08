/**
 * OktalyzerEncoder — Encodes TrackerCell back to Oktalyzer (.okt) format.
 *
 * Cell encoding (4 bytes in PBOD chunk):
 *   byte[0]: note (Amiga note index via amigaNoteToXM reverse)
 *   byte[1]: sample index
 *   byte[2]: effect command
 *   byte[3]: effect data
 *
 * Note mapping: amigaNoteToXM(x) = x + 12 → reverse: xmNote - 12
 *
 * Effect mapping (reverse of mapOKTEffect):
 *   XM 0x0F → OKT 1 (set speed)
 *   XM 0x0B → OKT 2 (position jump)
 *   XM 0x0C → OKT 10 (set volume)
 *   XM 0x01 → OKT 11 (portamento up)
 *   XM 0x02 → OKT 12 (portamento down)
 *   XM 0x03 → OKT 13 (tone portamento)
 *   XM 0x0A → OKT 17 (volume slide)
 *   XM 0x0E (EC) → OKT 30 (note cut)
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function reverseOKTEffect(effTyp: number, eff: number): { cmd: number; data: number } {
  if (effTyp === 0 && eff === 0) return { cmd: 0, data: 0 };

  switch (effTyp) {
    case 0x0F: return { cmd: 1, data: eff };   // set speed
    case 0x0B: return { cmd: 2, data: eff };   // position jump
    case 0x0C: return { cmd: 10, data: eff };  // set volume
    case 0x01: return { cmd: 11, data: eff };  // portamento up
    case 0x02: return { cmd: 12, data: eff };  // portamento down
    case 0x03: return { cmd: 13, data: eff };  // tone portamento
    case 0x0A: return { cmd: 17, data: eff };  // volume slide
    case 0x0E: {
      if ((eff & 0xF0) === 0xC0) return { cmd: 30, data: eff & 0x0F }; // note cut
      return { cmd: 0, data: 0 };
    }
    default: return { cmd: 0, data: 0 };
  }
}

function encodeOktalyzerCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;

  // Byte 0: Amiga note index (reverse of amigaNoteToXM: xm - 12)
  if (note > 0 && note > 12) {
    out[0] = (note - 12) & 0xFF;
  } else {
    out[0] = 0;
  }

  // Byte 1: sample (1-based instrument → 0-based? Check parser)
  out[1] = (cell.instrument ?? 0) & 0xFF;

  // Byte 2-3: effect
  const { cmd, data } = reverseOKTEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[2] = cmd & 0xFF;
  out[3] = data & 0xFF;

  return out;
}

registerPatternEncoder('oktalyzer', () => encodeOktalyzerCell);

export { encodeOktalyzerCell };
