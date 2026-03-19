/**
 * PTMEncoder — Variable-length encoder for PolyTracker (.ptm) pattern data.
 *
 * PTM uses RLE-compressed pattern encoding:
 *   b == 0          → end of row
 *   b & 0x1F        → channel index
 *   b & 0x20        → note + instrument follow (2 bytes)
 *   b & 0x40        → command + param follow (2 bytes)
 *   b & 0x80        → volume byte follows (1 byte)
 *
 * Note encoding: raw note 1-120 = XM note 1-120; 254 = note cut (XM 97)
 * Effects: standard MOD/XM effects 0x00-0x0F (same numbering)
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

const XM_NOTE_CUT = 97;

export const ptmEncoder: VariableLengthEncoder = {
  formatId: 'ptm',

  /**
   * Encode rows for a single channel in PTM packed format.
   */
  encodePattern(rows: TrackerCell[], channel: number): Uint8Array {
    const buf: number[] = [];

    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const vol = cell.volume ?? 0;
      const effTyp = cell.effTyp ?? 0;
      const eff = cell.eff ?? 0;

      const hasNote = note !== 0 || instr !== 0;
      const hasEffect = effTyp !== 0 || eff !== 0;
      const hasVol = vol !== 0;

      if (hasNote || hasEffect || hasVol) {
        let flag = channel & 0x1F;
        if (hasNote) flag |= 0x20;
        if (hasEffect) flag |= 0x40;
        if (hasVol) flag |= 0x80;

        buf.push(flag);

        if (hasNote) {
          // Note: XM note 1-120 → raw 1-120; XM 97 → 254 (note cut)
          let rawNote = 0;
          if (note === XM_NOTE_CUT) {
            rawNote = 254;
          } else if (note >= 1 && note <= 120) {
            rawNote = note;
          }
          buf.push(rawNote);
          buf.push(instr & 0xFF);
        }

        if (hasEffect) {
          // PTM effects are MOD commands 0x00-0x0F, same as XM
          // Commands > 0x0F are extended PTM effects (rare)
          const command = (effTyp <= 0x0F) ? effTyp : 0;
          buf.push(command & 0xFF);
          buf.push(eff & 0xFF);
        }

        if (hasVol) {
          buf.push(Math.min(64, vol));
        }
      }

      // End of row marker
      buf.push(0x00);
    }

    return new Uint8Array(buf);
  },
};

registerVariableEncoder(ptmEncoder);
