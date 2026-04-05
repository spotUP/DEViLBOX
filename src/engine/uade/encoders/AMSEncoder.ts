/**
 * AMSEncoder — Variable-length encoder for AMS (Extreme's Tracker / Velvet Studio) pattern data.
 *
 * AMS pattern encoding (ReadAMSPattern):
 *   flags byte:
 *     0xFF = empty row (skip)
 *     bits 0-4 = channel (0-31)
 *     bit 6 = note mask (if 0, note+instrument follow)
 *     bit 7 = end of row marker
 *
 *   If !(flags & 0x40): note byte + instrument byte
 *     note byte bit 7 = moreCommands flag
 *     note byte bits 0-6: 0=empty, 1=keyoff, 2-121=note (AMS2), 12-108=note (AMS1)
 *
 *   Command loop (while moreCommands):
 *     cmdByte bit 7 = moreCommands
 *     cmdByte bit 6 = volume command (no param byte)
 *     cmdByte bits 0-5: effect index or volume value
 *     If !volCommand: param byte follows
 *
 * This encoder only handles AMS 2.x (Velvet Studio) note encoding.
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

const NOTE_KEYOFF = 97;

/**
 * Reverse effect mapping: XM effTyp+eff → AMS effect index + param.
 * AMS uses MOD effects 0x00-0x0F and extended 0x10-0x2C.
 */
function reverseAMSEffect(effTyp: number, eff: number): { effect: number; param: number } {
  if (effTyp === 0 && eff === 0) return { effect: 0, param: 0 };

  // Standard MOD effects (0x00-0x0F) map nearly 1:1
  switch (effTyp) {
    case 0x00: return eff !== 0 ? { effect: 0x00, param: eff } : { effect: 0, param: 0 }; // arpeggio
    case 0x01: {
      // Portamento up — check for extra fine
      if ((eff & 0xF0) === 0xE0) return { effect: 0x11, param: eff & 0x0F }; // extra fine porta up
      if ((eff & 0xF0) === 0xF0) return { effect: 0x0E, param: 0x10 | ((eff & 0x0F) * 2 - 1) }; // fine porta up
      return { effect: 0x01, param: eff };
    }
    case 0x02: {
      if ((eff & 0xF0) === 0xE0) return { effect: 0x12, param: eff & 0x0F }; // extra fine porta down
      if ((eff & 0xF0) === 0xF0) return { effect: 0x0E, param: 0x20 | ((eff & 0x0F) * 2 - 1) }; // fine porta down
      return { effect: 0x02, param: eff };
    }
    case 0x03: return { effect: 0x03, param: eff }; // tone portamento
    case 0x04: return { effect: 0x04, param: eff }; // vibrato
    case 0x05: return { effect: 0x05, param: eff }; // tone porta + vol slide
    case 0x06: return { effect: 0x06, param: eff }; // vibrato + vol slide
    case 0x07: return { effect: 0x07, param: eff }; // tremolo
    case 0x08: {
      // Set panning: XM pan 0-255 → AMS 4-bit panning
      const nibble = Math.min(0x0F, Math.round(eff / 0x11));
      return { effect: 0x08, param: nibble };
    }
    case 0x09: return { effect: 0x09, param: eff }; // sample offset
    case 0x0A: {
      // Volume slide — check for fine slides (from extended effects)
      const up = (eff >> 4) & 0x0F;
      const down = eff & 0x0F;
      if (down === 0x0F && up > 0) return { effect: 0x1E, param: 0xA0 | ((up * 2 - 1) & 0x0F) }; // fine vol up
      if (up === 0x0F && down > 0) return { effect: 0x1E, param: 0xB0 | ((down * 2 - 1) & 0x0F) }; // fine vol down
      return { effect: 0x0A, param: eff };
    }
    case 0x0B: return { effect: 0x0B, param: eff }; // position jump
    case 0x0C: {
      // Set volume: XM vol 0-64 → AMS param (vol * 2 - 1 clamped)
      const param = eff > 0 ? Math.min(255, eff * 2 - 1) : 0;
      return { effect: 0x0C, param };
    }
    case 0x0D: return { effect: 0x0D, param: eff }; // pattern break
    case 0x0E: {
      // Extended effects
      const hiNib = (eff >> 4) & 0x0F;
      const loNib = eff & 0x0F;
      if (hiNib === 0x09) {
        // S9E/S9F → forward/backward
        if (eff === 0x9E) return { effect: 0x10, param: 0 };
        if (eff === 0x9F) return { effect: 0x10, param: 1 };
        return { effect: 0x0E, param: eff };
      }
      if (hiNib === 0x09) return { effect: 0x13, param: loNib }; // retrigger
      return { effect: 0x0E, param: eff }; // pass through
    }
    case 0x0F: return { effect: 0x0F, param: eff }; // speed/tempo
    case 0x10: {
      // Global volume: XM 0-64 → AMS param (vol * 2 - 1)
      const param = eff > 0 ? Math.min(127, eff * 2 - 1) : 0;
      return { effect: 0x2C, param };
    }
    case 0x11: return { effect: 0x2A, param: eff }; // global vol slide
    case 0x14: return { effect: 0x20, param: eff }; // key-off at tick
    default:   return { effect: 0, param: 0 };
  }
}

export const amsEncoder: VariableLengthEncoder = {
  formatId: 'ams',

  /**
   * Encode rows for a single channel in AMS packed format.
   */
  encodePattern(rows: TrackerCell[], channel: number): Uint8Array {
    const buf: number[] = [];

    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const vol = cell.volume ?? 0;
      const { effect: fx1Effect, param: fx1Param } = reverseAMSEffect(cell.effTyp ?? 0, cell.eff ?? 0);
      const { effect: fx2Effect, param: fx2Param } = reverseAMSEffect(cell.effTyp2 ?? 0, cell.eff2 ?? 0);

      const hasNote = note !== 0 || instr !== 0;
      const hasVol = vol > 0;
      const hasFx1 = fx1Effect !== 0 || fx1Param !== 0;
      const hasFx2 = fx2Effect !== 0 || fx2Param !== 0;

      if (!hasNote && !hasVol && !hasFx1 && !hasFx2) {
        // Empty row
        buf.push(0xFF);
        continue;
      }

      // Flags byte: channel + noteMask + endOfRow
      let flags = channel & 0x1F;
      if (!hasNote) flags |= 0x40; // note mask bit = skip note
      flags |= 0x80; // end of row (one event per channel per row)

      buf.push(flags);

      // Collect commands to encode
      const commands: Array<{ isVol: boolean; effect: number; param: number }> = [];

      if (hasVol) {
        commands.push({ isVol: true, effect: vol - 1, param: 0 });
      }
      if (hasFx1) {
        commands.push({ isVol: false, effect: fx1Effect, param: fx1Param });
      }
      if (hasFx2) {
        commands.push({ isVol: false, effect: fx2Effect, param: fx2Param });
      }

      const hasCommands = commands.length > 0;

      if (!hasNote && !hasCommands) {
        // Just the flags byte
        continue;
      }

      if (hasNote) {
        // Note byte: bit 7 = moreCommands, bits 0-6 = note value
        let noteVal = 0;
        if (note === NOTE_KEYOFF) {
          noteVal = 1;
        } else if (note >= 1 && note <= 120) {
          // AMS 2.x: noteVal = xmNote + 2 - 1 = xmNote + 1
          noteVal = note + 1;
        }

        const moreCommandsBit = hasCommands ? 0x80 : 0;
        buf.push((noteVal & 0x7F) | moreCommandsBit);

        // Instrument
        buf.push(instr & 0xFF);
      }

      // Encode commands
      for (let ci = 0; ci < commands.length; ci++) {
        const cmd = commands[ci];
        const isLast = ci === commands.length - 1;
        const moreCommandsBit = isLast ? 0 : 0x80;

        if (cmd.isVol) {
          // Volume command: bit 6 set, no param byte
          buf.push((cmd.effect & 0x3F) | 0x40 | moreCommandsBit);
        } else {
          // Effect command: bit 6 clear
          buf.push((cmd.effect & 0x3F) | moreCommandsBit);
          buf.push(cmd.param & 0xFF);
        }
      }
    }

    return new Uint8Array(buf);
  },
};

registerVariableEncoder(amsEncoder);
