/**
 * PSMEncoder — Variable-length encoder for PSM16 (.psm) pattern data.
 *
 * PSM has two sub-formats (New PSM and PSM16), both with packed pattern rows.
 * We only support PSM16 encoding here since New PSM's chunk-based RIFF layout
 * with per-row size headers makes in-place patching impractical.
 *
 * PSM16 cell encoding (packed, flag-based):
 *   chnFlag byte: bits 0-4 = channel, bit 7 = note+instr, bit 6 = vol, bit 5 = effect
 *   If bit 7: note (uint8), instrument (uint8)
 *   If bit 6: volume (uint8, 0-64)
 *   If bit 5: command (uint8), param (uint8)
 *   chnFlag 0 = end of row
 *
 * Note encoding (PSM16): raw = xmNote - 36
 * Effect encoding: reverse of convertPSM16Effect
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

// Reverse PSM16 effect: XM effTyp → PSM16 command
function reversePSM16Effect(effTyp: number, eff: number): { cmd: number; param: number } {
  if (effTyp === 0 && eff === 0) return { cmd: 0, param: 0 };

  switch (effTyp) {
    case 0x0A: {
      // Volume slide — determine direction from parameter
      const up = (eff >> 4) & 0x0F;
      const down = eff & 0x0F;
      if (down === 0x0F && up > 0) return { cmd: 0x01, param: (up << 4) | 0x0F }; // fine vol up
      if (up > 0 && down === 0) return { cmd: 0x02, param: (up << 4) & 0xF0 };     // vol up
      if (up === 0x0F && down > 0) return { cmd: 0x03, param: 0xF0 | down };        // fine vol down
      if (up === 0 && down > 0) return { cmd: 0x04, param: down & 0x0F };            // vol down
      return { cmd: 0, param: 0 };
    }
    case 0x01: {
      if ((eff & 0xF0) === 0xF0) return { cmd: 0x0A, param: eff & 0x0F }; // fine porta up
      return { cmd: 0x0B, param: eff };                                      // porta up
    }
    case 0x02: {
      if ((eff & 0xF0) === 0xF0) return { cmd: 0x0C, param: eff | 0xF0 }; // fine porta down
      return { cmd: 0x0D, param: eff };                                      // porta down
    }
    case 0x03: return { cmd: 0x0E, param: eff };   // tone portamento
    case 0x13: {
      const hiNib = (eff >> 4) & 0x0F;
      const loNib = eff & 0x0F;
      if (hiNib === 0x01) return { cmd: 0x0F, param: loNib };       // glissando
      if (hiNib === 0x03) return { cmd: 0x15, param: loNib };       // vib waveform
      if (hiNib === 0x04) return { cmd: 0x1F, param: loNib };       // trem waveform
      if (hiNib === 0x09) return { cmd: 0x29, param: loNib };       // retrigger
      if (hiNib === 0x0C) return { cmd: 0x2A, param: loNib };       // note cut
      if (hiNib === 0x0D) return { cmd: 0x2B, param: loNib };       // note delay
      if (hiNib === 0x0B) return { cmd: 0x34, param: loNib };       // loop
      if (hiNib === 0x0E) return { cmd: 0x35, param: loNib };       // pattern delay
      if (hiNib === 0x02) return { cmd: 0x47, param: loNib };       // finetune
      if (hiNib === 0x08) return { cmd: 0x48, param: loNib };       // balance
      return { cmd: 0, param: 0 };
    }
    case 0x04: return { cmd: 0x14, param: eff };   // vibrato
    case 0x05: {
      if ((eff >> 4) > 0) return { cmd: 0x10, param: eff << 4 }; // tone porta + vol up
      return { cmd: 0x11, param: eff & 0x0F };                     // tone porta + vol dn
    }
    case 0x06: {
      if ((eff >> 4) > 0) return { cmd: 0x16, param: eff << 4 }; // vib + vol up
      return { cmd: 0x17, param: eff & 0x0F };                     // vib + vol dn
    }
    case 0x07: return { cmd: 0x1E, param: eff };   // tremolo
    case 0x09: return { cmd: 0x28, param: eff };   // sample offset
    case 0x1B: return { cmd: 0x29, param: eff & 0x0F }; // retrigger
    case 0x0B: return { cmd: 0x32, param: eff };   // position jump
    case 0x0D: return { cmd: 0x33, param: eff };   // pattern break
    case 0x0F: return { cmd: eff >= 0x20 ? 0x3D : 0x3C, param: eff }; // speed/tempo
    case 0x00: return { cmd: 0x46, param: eff };   // arpeggio
    default:   return { cmd: 0, param: 0 };
  }
}

export const psmEncoder: VariableLengthEncoder = {
  formatId: 'psm',

  /**
   * Encode rows for a single channel in PSM16 packed format.
   * Each row emits: [chnFlag, ...fields] for non-empty cells, plus 0x00 end-of-row.
   */
  encodePattern(rows: TrackerCell[], channel: number): Uint8Array {
    const buf: number[] = [];

    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const vol = cell.volume ?? 0;
      const { cmd, param } = reversePSM16Effect(cell.effTyp ?? 0, cell.eff ?? 0);

      const hasNote = note !== 0 || instr !== 0;
      const hasVol = vol !== 0;
      const hasEffect = cmd !== 0 || param !== 0;

      if (hasNote || hasVol || hasEffect) {
        let flag = channel & 0x1F;
        if (hasNote) flag |= 0x80;
        if (hasVol) flag |= 0x40;
        if (hasEffect) flag |= 0x20;

        buf.push(flag);

        if (hasNote) {
          // note: xmNote - 36 (reverse of parser: note + 36)
          const rawNote = note > 0 ? Math.max(0, Math.min(255, note - 36)) : 0;
          buf.push(rawNote);
          buf.push(instr & 0xFF);
        }

        if (hasVol) {
          buf.push(Math.min(64, vol));
        }

        if (hasEffect) {
          buf.push(cmd & 0xFF);
          buf.push(param & 0xFF);
        }
      }

      // End of row marker
      buf.push(0x00);
    }

    return new Uint8Array(buf);
  },
};

registerVariableEncoder(psmEncoder);
