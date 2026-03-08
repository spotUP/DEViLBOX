/**
 * FAREncoder — Encodes TrackerCell back to Farandole Composer (.far) format.
 *
 * Cell encoding (4 bytes):
 *   byte[0]: note (0=none, 1-72 valid, maps to XM note +36)
 *   byte[1]: instrument (0-indexed)
 *   byte[2]: volume (0=none, 1-16 maps to 0-64 scale)
 *   byte[3]: effect (high nibble type, low nibble param)
 *
 * Note mapping: XM note → FAR note = xmNote - 36 (1-72 range)
 *
 * Effect mapping (reverse of convertFAREffect):
 *   XM 0x01 → FAR 0x01 (portamento up)
 *   XM 0x02 → FAR 0x02 (portamento down)
 *   XM 0x03 → FAR 0x03 (tone porta)
 *   XM 0x05 → FAR 0x05/0x09 (vibrato depth)
 *   XM 0x0A → FAR 0x07/0x08 (volume slide)
 *   XM 0x0F → FAR 0x0F (set speed)
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function reverseFAREffect(effTyp: number, eff: number): number {
  if (effTyp === 0 && eff === 0) return 0;

  switch (effTyp) {
    case 0x01: return (0x01 << 4) | (eff & 0x0F); // portamento up
    case 0x02: return (0x02 << 4) | (eff & 0x0F); // portamento down
    case 0x03: return (0x03 << 4) | (eff & 0x0F); // tone portamento
    case 0x04: return (0x04 << 4) | (eff & 0x0F); // retrigger
    case 0x05: return (0x05 << 4) | (eff & 0x0F); // vibrato depth
    case 0x0A: {
      // Volume slide: up → 0x07, down → 0x08
      const up = (eff >> 4) & 0x0F;
      const down = eff & 0x0F;
      if (up > 0) return (0x07 << 4) | (up & 0x0F);
      return (0x08 << 4) | (down & 0x0F);
    }
    case 0x0E: return (0x0B << 4) | (eff & 0x0F); // panning
    case 0x0F: return (0x0F << 4) | (eff & 0x0F); // set speed
    default:   return 0;
  }
}

function encodeFARCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;

  // Byte 0: note (XM note - 36; 1-72 range)
  if (note > 0 && note > 36) {
    out[0] = Math.min(72, note - 36);
  } else {
    out[0] = 0;
  }

  // Byte 1: instrument (0-indexed; parser adds 1, so subtract 1)
  const instr = cell.instrument ?? 0;
  out[1] = instr > 0 ? (instr - 1) & 0xFF : 0;

  // Byte 2: volume (0=none, 1-16; parser maps (rawVol-1)*64/15 → 0-64)
  // Reverse: volRaw = round(vol * 15 / 64) + 1
  const vol = cell.volume ?? 0;
  if (vol > 0) {
    out[2] = Math.min(16, Math.round(vol * 15 / 64) + 1);
  } else {
    out[2] = 0;
  }

  // Byte 3: effect byte (nibbles: type|param)
  out[3] = reverseFAREffect(cell.effTyp ?? 0, cell.eff ?? 0);

  return out;
}

registerPatternEncoder('far', () => encodeFARCell);

export { encodeFARCell };
