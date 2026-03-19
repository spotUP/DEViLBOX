/**
 * ULTEncoder — Variable-length encoder for UltraTracker (.ult) pattern data.
 *
 * ULT uses channel-interleaved RLE-compressed pattern data:
 *   Outer loop: for each channel
 *     Inner loop: for each pattern
 *       Read rows: b = read byte
 *         if b == 0xFC → repeat = next byte; noteByte = next byte
 *         else → repeat = 1; noteByte = b
 *       Then 4 more bytes: [instr, cmd, para1, para2]
 *
 * Note encoding: 0 = empty; raw 1-96 → XM note = raw + 24
 *   Reverse: xmNote - 24 = raw (1-96 range)
 *
 * Effect encoding: cmd byte = (eff2 nibble << 4) | (eff1 nibble)
 *   para1 = eff1 param, para2 = eff2 param
 *
 * The encoder outputs per-channel, per-pattern RLE data.
 * No RLE compression is applied (each row emits 5 bytes: note, instr, cmd, para1, para2).
 * This is valid ULT since the 0xFC repeat marker is optional.
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

const XM_KEYOFF_NOTE = 97;

/**
 * Reverse-translate XM effect to ULT effect nibble + param.
 */
function reverseULTEffect(effTyp: number, eff: number): { nibble: number; param: number } {
  if (effTyp === 0 && eff === 0) return { nibble: 0, param: 0 };

  switch (effTyp) {
    case 0x00: // Arpeggio
      return eff !== 0 ? { nibble: 0x0, param: eff } : { nibble: 0, param: 0 };
    case 0x01: {
      // Portamento up — check for fine porta
      if ((eff & 0xF0) === 0xF0) {
        // Fine porta up → ULT extended E1x
        return { nibble: 0xE, param: 0x10 | (eff & 0x0F) };
      }
      return { nibble: 0x1, param: eff };
    }
    case 0x02: {
      if ((eff & 0xF0) === 0xF0) {
        return { nibble: 0xE, param: 0x20 | (eff & 0x0F) };
      }
      return { nibble: 0x2, param: eff };
    }
    case 0x03: return { nibble: 0x3, param: eff }; // tone porta
    case 0x04: return { nibble: 0x4, param: eff }; // vibrato
    case 0x07: return { nibble: 0x7, param: eff }; // tremolo
    case 0x08: {
      // Set panning: XM 0-255 → ULT nibble 0-15
      const nibbleVal = Math.min(0x0F, Math.round(eff / 0x11));
      return { nibble: 0xB, param: nibbleVal };
    }
    case 0x09: {
      // Sample offset: ULT multiplies by 4, so reverse divide
      return { nibble: 0x9, param: Math.min(0xFF, Math.round(eff / 4)) };
    }
    case 0x0A: {
      // Volume slide
      const up = (eff >> 4) & 0x0F;
      const down = eff & 0x0F;
      if (down === 0x0F && up > 0) {
        // Fine volume slide up → E Ax
        return { nibble: 0xE, param: 0xA0 | (up & 0x0F) };
      }
      if (up === 0x0F && down > 0) {
        // Fine volume slide down → E Bx
        return { nibble: 0xE, param: 0xB0 | (down & 0x0F) };
      }
      if (up > 0) return { nibble: 0xA, param: up << 4 };
      return { nibble: 0xA, param: down & 0x0F };
    }
    case 0x0C: {
      // Set volume: XM 0-64 → ULT 0-255
      return { nibble: 0xC, param: Math.min(255, Math.round(eff * 255 / 64)) };
    }
    case 0x0D: {
      // Pattern break: decimal → BCD
      const bcdParam = ((Math.floor(eff / 10) & 0x0F) << 4) | (eff % 10);
      return { nibble: 0xD, param: bcdParam };
    }
    case 0x0E: {
      // Extended effects
      const hiNib = (eff >> 4) & 0x0F;
      const loNib = eff & 0x0F;
      if (hiNib === 0x09) return { nibble: 0xE, param: 0x90 | loNib }; // retrigger
      if (hiNib === 0x0C) return { nibble: 0xE, param: 0xC0 | loNib }; // note cut
      if (hiNib === 0x0D) return { nibble: 0xE, param: 0xD0 | loNib }; // note delay
      if (hiNib === 0x06) return { nibble: 0xE, param: 0x80 | loNib }; // pan position
      return { nibble: 0, param: 0 };
    }
    case 0x0F: {
      // Speed / tempo
      if (eff > 0x2F) return { nibble: 0xF, param: eff }; // tempo
      if (eff === 0) return { nibble: 0xF, param: 0 };
      return { nibble: 0xF, param: Math.min(0x1F, eff) }; // speed
    }
    default: return { nibble: 0, param: 0 };
  }
}

export const ultEncoder: VariableLengthEncoder = {
  formatId: 'ult',

  /**
   * Encode rows for a single channel in ULT format.
   * Each row: 5 bytes [noteByte, instr, cmd, para1, para2]
   * No RLE applied (repeat=1 for all cells).
   */
  encodePattern(rows: TrackerCell[], _channel: number): Uint8Array {
    const buf: number[] = [];

    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;

      // Note byte: 0=empty, 1-96=note (XM note - 24)
      let noteByte = 0;
      if (note === XM_KEYOFF_NOTE) {
        // ULT handles key-off via effect 5, not via note byte
        noteByte = 0;
      } else if (note > 24 && note <= 120) {
        noteByte = note - 24;
      }

      // Encode both effects into cmd nibbles + param bytes
      const fx1 = reverseULTEffect(cell.effTyp ?? 0, cell.eff ?? 0);
      const fx2 = reverseULTEffect(cell.effTyp2 ?? 0, cell.eff2 ?? 0);

      // cmd byte: (eff2 nibble << 4) | (eff1 nibble)
      const cmd = ((fx2.nibble & 0x0F) << 4) | (fx1.nibble & 0x0F);

      buf.push(noteByte & 0xFF);
      buf.push(instr & 0xFF);
      buf.push(cmd);
      buf.push(fx1.param & 0xFF);
      buf.push(fx2.param & 0xFF);
    }

    return new Uint8Array(buf);
  },
};

registerVariableEncoder(ultEncoder);
