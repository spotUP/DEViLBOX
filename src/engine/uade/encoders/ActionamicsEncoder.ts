/**
 * ActionamicsEncoder.ts — Variable-length encoder for Actionamics track data.
 *
 * Actionamics uses a compact encoding per track (one channel's pattern):
 *   bit7 set (0x80-0xFF):  delay — ~byte = number of empty rows to insert
 *   0x70-0x7F:             effect-only row: effect byte + arg byte (2 bytes)
 *   0x00-0x6F:             note row: note byte, then:
 *     bit7 set:            delay (insert note, then ~byte empty rows)
 *     0x70-0x7F:           effect: effect byte + arg byte (3 bytes: note+eff+arg)
 *     0x00-0x6F:           instrument byte, then:
 *       bit7:              delay after note+instr
 *       0x70-0x7F:         effect byte + arg (4 bytes: note+instr+eff+arg)
 *       else:              also note+instr (2 bytes total — shouldn't happen)
 *
 * XM effect → Actionamics effect mapping (reverse of parser's mapEffect):
 *   XM 0x00 → AST 0x70  (arpeggio)
 *   XM 0x01 → AST 0x71  (slide up)
 *   XM 0x02 → AST 0x72  (slide down)
 *   XM 0x04 → AST 0x74  (vibrato)
 *   XM 0x06 → AST 0x7E  (vol slide + vibrato)
 *   XM 0x07 → AST 0x7A  (tremolo)
 *   XM 0x09 → AST 0x76  (sample offset)
 *   XM 0x0A → AST 0x7D  (volume slide)
 *   XM 0x0C → AST 0x7C  (set volume)
 *   XM 0x0D → AST 0x7B  (break)
 *   XM 0x0F → AST 0x7F  (set speed)
 *   XM 0x0E:
 *     0xD? → AST 0x77  (note delay)
 *     0xC? → AST 0x78  (mute/cut)
 *
 * Parser reference: ActionamicsParser.ts lines 483-558, 562-581
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

/** Convert XM note → Actionamics note index (1-based). */
function xmNoteToAST(xmNote: number): number {
  if (xmNote <= 0 || xmNote > 96) return 0;
  // Parser: xm = XM_REFERENCE_NOTE + (noteIdx - PERIOD_TABLE_REFERENCE_IDX)
  //       = 13 + (noteIdx - 37) = noteIdx - 24
  // Reverse: noteIdx = xmNote + 24
  const idx = xmNote + 24;
  return (idx >= 1 && idx <= 73) ? idx : 0;
}

/** Convert XM effect to Actionamics effect code + param. Returns null if no mapping. */
function xmEffectToAST(effTyp: number, eff: number): [number, number] | null {
  switch (effTyp) {
    case 0x00: return eff !== 0 ? [0x70, eff] : null;
    case 0x01: return [0x71, eff];
    case 0x02: return [0x72, eff];
    case 0x04: return [0x74, eff];
    case 0x06: return [0x7E, eff];
    case 0x07: return [0x7A, eff];
    case 0x09: return [0x76, eff];
    case 0x0A: return [0x7D, eff];
    case 0x0C: return [0x7C, Math.min(64, eff)];
    case 0x0D: return [0x7B, eff];
    case 0x0F: return [0x7F, eff];
    case 0x0E: {
      const sub = (eff >> 4) & 0x0F;
      const param = eff & 0x0F;
      if (sub === 0x0D) return [0x77, param]; // note delay
      if (sub === 0x0C) return [0x78, param]; // mute/cut
      return null;
    }
    default: return null;
  }
}

function isEmpty(cell: TrackerCell): boolean {
  return cell.note === 0 && cell.instrument === 0 && cell.effTyp === 0 && cell.eff === 0;
}

export const actionamicsEncoder: VariableLengthEncoder = {
  formatId: 'actionamics',

  encodePattern(rows: TrackerCell[]): Uint8Array {
    const buf: number[] = [];
    let i = 0;

    while (i < rows.length) {
      const cell = rows[i];

      // Check for runs of empty rows → RLE delay
      if (isEmpty(cell)) {
        let runLen = 0;
        while (i + runLen < rows.length && isEmpty(rows[i + runLen]) && runLen < 127) {
          runLen++;
        }
        // Delay byte: ~runLen stored as unsigned = (255 - runLen + 1) with bit7 set
        buf.push((~runLen) & 0xFF);
        i += runLen;
        continue;
      }

      const note = xmNoteToAST(cell.note);
      const astEff = xmEffectToAST(cell.effTyp, cell.eff);

      if (note === 0 && astEff) {
        // Effect-only row (no note)
        buf.push(astEff[0]);
        buf.push(astEff[1] & 0xFF);
      } else if (note > 0) {
        buf.push(note & 0x6F); // note byte (0-0x6F range)
        if (cell.instrument > 0 && cell.instrument <= 0x6F) {
          buf.push(cell.instrument & 0x6F);
          if (astEff) {
            buf.push(astEff[0]);
            buf.push(astEff[1] & 0xFF);
          }
        } else if (astEff) {
          buf.push(astEff[0]);
          buf.push(astEff[1] & 0xFF);
        }
      } else {
        // No note, no effect — encode as single-row delay
        buf.push(0xFE); // ~1 = delay of 1 empty row
      }

      i++;
    }

    return new Uint8Array(buf);
  },
};

registerVariableEncoder(actionamicsEncoder);
