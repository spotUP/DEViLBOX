/**
 * STPEncoder — Encodes TrackerCell back to SoundTracker Pro II (.stp) format.
 *
 * Cell encoding (4 bytes):
 *   byte[0]: instrument (1-based; 0 = no instrument)
 *   byte[1]: note (1-based; 0 = empty; STP_NOTE_OFFSET=25 → XM note = 25 + raw)
 *   byte[2]: effect command
 *   byte[3]: effect parameter
 *
 * Note mapping: XM note → STP raw = xmNote - 25
 *
 * Effect mapping (reverse of convertSTPEffect):
 *   XM 0x01 → STP 0x01 (portamento up)
 *   XM 0x02 → STP 0x02 (portamento down)
 *   XM 0x03 → STP 0x03 (tone portamento)
 *   XM 0x0C → STP 0x04 (set volume)
 *   XM 0x0A → STP 0x05 (volume slide, nibbles swapped: hi=down, lo=up)
 *   XM 0x0B → STP 0x06 (position jump)
 *   XM 0x0D → STP 0x07 (pattern break)
 *   XM 0x0F → STP 0x0F (set speed/tempo)
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

const STP_NOTE_OFFSET = 25;

function reverseSTPEffect(effTyp: number, eff: number): { cmd: number; param: number } {
  if (effTyp === 0 && eff === 0) return { cmd: 0, param: 0 };

  switch (effTyp) {
    case 0x01: return { cmd: 0x01, param: eff };
    case 0x02: return { cmd: 0x02, param: eff };
    case 0x03: return { cmd: 0x03, param: eff };
    case 0x0C: return { cmd: 0x04, param: eff };
    case 0x0A: {
      // Swap nibbles: XM hi=up/lo=down → STP hi=down/lo=up
      const up = (eff >> 4) & 0x0F;
      const down = eff & 0x0F;
      return { cmd: 0x05, param: (down << 4) | up };
    }
    case 0x0B: return { cmd: 0x06, param: eff };
    case 0x0D: return { cmd: 0x07, param: eff };
    case 0x0F: return { cmd: 0x0F, param: eff };
    default: return { cmd: 0, param: 0 };
  }
}

function encodeSTPCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);

  out[0] = (cell.instrument ?? 0) & 0xFF;

  const note = cell.note ?? 0;
  if (note > 0 && note >= STP_NOTE_OFFSET) {
    out[1] = note - STP_NOTE_OFFSET;
  } else {
    out[1] = 0;
  }

  const { cmd, param } = reverseSTPEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[2] = cmd & 0xFF;
  out[3] = param & 0xFF;

  return out;
}

registerPatternEncoder('stp', () => encodeSTPCell);

export { encodeSTPCell };
