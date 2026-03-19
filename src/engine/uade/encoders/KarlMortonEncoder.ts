/**
 * KarlMortonEncoder — Variable-length encoder for Karl Morton (.mus) patterns.
 *
 * KM music data encoding (per-row, per-channel, variable-length):
 *   If high bit set: repeat mode
 *     byte & 0x7F = repeat count → repeat last note/instr/effect that many more rows
 *   Else: note byte
 *     0 = empty row (no note)
 *     1-36 = note (maps to XM note via +36 offset: KM note 1 → XM 37)
 *   Followed by:
 *     byte 2: instr (& 0x1F = 1-based sample reference; & 0x80 = reuse previous effects)
 *     If not reuse:
 *       byte 3: effect command (0-19)
 *       byte 4: effect param
 *
 * Effect reverse table (XM → KM command index):
 *   XM 0x0C → KM 0  (volume)
 *   XM 0x0E 0xAx → KM 1  (fine vol slide up)
 *   XM 0x0E 0xBx → KM 2  (fine vol slide down)
 *   XM 0x0E 0x1x → KM 3  (fine slide up)
 *   XM 0x0E 0x2x → KM 4  (fine slide down)
 *   XM 0x0E 0x5x → KM 5  (set finetune)
 *   XM 0x09 → KM 6  (sample offset)
 *   XM 0x03 → KM 7  (tone portamento) — but KM 16 is tone porta with param=0xFF
 *   XM 0x05 → KM 8  (tone porta + vol slide)
 *   XM 0x04 → KM 9  (vibrato)
 *   XM 0x06 → KM 10 (vibrato + vol slide)
 *   XM 0x00 → KM 11 (arpeggio)
 *   XM 0x01 → KM 12 (portamento up)
 *   XM 0x02 → KM 13 (portamento down)
 *   XM 0x0A → KM 14 (volume slide)
 *   XM 0x0E 0x9x → KM 15 (retrig)
 *   XM 0x0E 0xCx → KM 17 (note cut)
 *   XM 0x0F → KM 18 (speed/tempo)
 *   XM 0x07 → KM 19 (tremolo)
 *
 * Parser reference: KarlMortonParser.ts (lines 393-484)
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

const KM_NOTE_OFFSET = 36; // XM note = kmNote + 36

/**
 * Reverse-map XM effect to Karl Morton command index + param.
 * Returns { cmd, param, empty } where empty=true means no effect.
 */
function reverseKMEffect(effTyp: number, eff: number): { cmd: number; param: number; empty: boolean } {
  if (effTyp === 0 && eff === 0) return { cmd: 0, param: 0, empty: true };

  switch (effTyp) {
    case 0x00: // Arpeggio
      if (eff === 0) return { cmd: 0, param: 0, empty: true };
      return { cmd: 11, param: eff, empty: false };
    case 0x01: // Portamento up
      return { cmd: 12, param: eff, empty: false };
    case 0x02: // Portamento down
      return { cmd: 13, param: eff, empty: false };
    case 0x03: // Tone portamento
      return { cmd: 7, param: eff, empty: false };
    case 0x04: // Vibrato
      return { cmd: 9, param: eff, empty: false };
    case 0x05: // Tone porta + vol slide
      return { cmd: 8, param: eff, empty: false };
    case 0x06: // Vibrato + vol slide
      return { cmd: 10, param: eff, empty: false };
    case 0x07: // Tremolo
      return { cmd: 19, param: eff, empty: false };
    case 0x09: // Sample offset
      return { cmd: 6, param: eff, empty: false };
    case 0x0A: // Volume slide
      return { cmd: 14, param: eff, empty: false };
    case 0x0C: // Set volume
      return { cmd: 0, param: eff, empty: false };
    case 0x0E: {
      // Extended MOD commands
      const subCmd = (eff >> 4) & 0x0F;
      const subParam = eff & 0x0F;
      switch (subCmd) {
        case 0x1: return { cmd: 3, param: subParam, empty: false };  // Fine slide up
        case 0x2: return { cmd: 4, param: subParam, empty: false };  // Fine slide down
        case 0x5: return { cmd: 5, param: subParam, empty: false };  // Set finetune
        case 0x9: return { cmd: 15, param: subParam, empty: false }; // Retrig
        case 0xA: return { cmd: 1, param: subParam, empty: false };  // Fine vol slide up
        case 0xB: return { cmd: 2, param: subParam, empty: false };  // Fine vol slide down
        case 0xC: return { cmd: 17, param: subParam, empty: false }; // Note cut
        default: return { cmd: 0, param: 0, empty: true };
      }
    }
    case 0x0F: // Speed/tempo
      return { cmd: 18, param: eff, empty: false };
    default:
      return { cmd: 0, param: 0, empty: true };
  }
}

export const karlMortonEncoder: VariableLengthEncoder = {
  formatId: 'karlMorton',

  encodePattern(rows: TrackerCell[]): Uint8Array {
    const buf: number[] = [];

    for (let i = 0; i < rows.length; i++) {
      const cell = rows[i];
      if (!cell) {
        // Empty row
        buf.push(0);    // note = 0
        buf.push(0);    // instr = 0, no reuse flag
        buf.push(0);    // cmd = 0
        buf.push(0);    // param = 0
        continue;
      }

      // Note byte
      const xmNote = cell.note ?? 0;
      let kmNote = 0;
      if (xmNote > 0 && xmNote > KM_NOTE_OFFSET) {
        kmNote = Math.min(36, xmNote - KM_NOTE_OFFSET);
      }
      buf.push(kmNote & 0x7F); // high bit clear = not a repeat

      // Instrument byte
      const instr = (cell.instrument ?? 0) & 0x1F;
      const { cmd, param, empty } = reverseKMEffect(cell.effTyp ?? 0, cell.eff ?? 0);

      if (empty) {
        // Set reuse flag (bit 7) to skip effect bytes
        buf.push(instr | 0x80);
      } else {
        buf.push(instr); // no reuse flag
        buf.push(cmd & 0xFF);
        buf.push(param & 0xFF);
      }
    }

    return new Uint8Array(buf);
  },
};

registerVariableEncoder(karlMortonEncoder);
