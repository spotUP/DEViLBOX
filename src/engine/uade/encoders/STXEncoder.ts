/**
 * STXEncoder — Variable-length encoder for ScreamTracker STMIK (.stx) pattern data.
 *
 * STX uses S3M packed row format:
 *   0x00 = end of row
 *   flagByte & 0x1F = channel
 *   flagByte & 0x20 → note (uint8) + instrument (uint8) follow
 *   flagByte & 0x40 → volume (uint8, 0-64) follows
 *   flagByte & 0x80 → STM command (uint8) + param (uint8) follow
 *
 * Note encoding (S3M):
 *   noteByte high nibble = octave, low nibble = semitone (0=C)
 *   XM note = octave * 12 + semitone + 1
 *   0xFE = note off; 0xFF = no note
 *
 * Effect encoding:
 *   STX uses STM effects via convertSTMEffect (same as STMEncoder).
 *   XM effTyp → STM effect index (reverse mapping).
 */

import type { TrackerCell } from '@/types';
import type { VariableLengthEncoder } from '../UADEPatternEncoder';
import { registerVariableEncoder } from '../UADEPatternEncoder';

const XM_NOTE_OFF = 97;

/**
 * Reverse-translate XM effect → STM effect index + param.
 * Same mapping as STMEncoder's reverseEffect.
 */
function reverseSTMEffect(effTyp: number, eff: number): { stmIdx: number; param: number } {
  if (effTyp === 0 && eff === 0) return { stmIdx: 0, param: 0 };

  switch (effTyp) {
    case 0x0F: return { stmIdx: 0x01, param: (eff << 4) };  // set speed (pack as high nibble)
    case 0x0B: return { stmIdx: 0x02, param: eff };          // position jump
    case 0x0D: {
      // Pattern break: decimal → BCD
      const bcdParam = ((Math.floor(eff / 10) & 0x0F) << 4) | (eff % 10);
      return { stmIdx: 0x03, param: bcdParam };
    }
    case 0x0A: {
      // Volume slide: lower nibble takes precedence (reverse of parser)
      let p = eff;
      if (p & 0x0F) {
        p = p & 0x0F;
      } else {
        p = p & 0xF0;
      }
      return { stmIdx: 0x04, param: p };
    }
    case 0x02: return { stmIdx: 0x05, param: eff };  // portamento down
    case 0x01: return { stmIdx: 0x06, param: eff };  // portamento up
    case 0x03: return { stmIdx: 0x07, param: eff };  // tone portamento
    case 0x04: return { stmIdx: 0x08, param: eff };  // vibrato
    case 0x1D: return { stmIdx: 0x09, param: eff };  // tremor
    default:   return { stmIdx: 0, param: 0 };
  }
}

export const stxEncoder: VariableLengthEncoder = {
  formatId: 'stx',

  /**
   * Encode rows for a single channel in STX (S3M packed) format.
   * Each non-empty cell: flagByte + optional [note, instr] + optional [volume] + optional [cmd, param]
   * Each row ends with 0x00.
   */
  encodePattern(rows: TrackerCell[], channel: number): Uint8Array {
    const buf: number[] = [];

    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row];
      const note = cell.note ?? 0;
      const instr = cell.instrument ?? 0;
      const vol = cell.volume ?? 0;
      const { stmIdx, param } = reverseSTMEffect(cell.effTyp ?? 0, cell.eff ?? 0);

      const hasNote = note !== 0 || instr !== 0;
      const hasVol = vol !== 0;
      const hasEffect = stmIdx !== 0 || param !== 0;

      if (hasNote || hasVol || hasEffect) {
        let flag = channel & 0x1F;
        if (hasNote) flag |= 0x20;
        if (hasVol) flag |= 0x40;
        if (hasEffect) flag |= 0x80;

        buf.push(flag);

        if (hasNote) {
          // XM note → S3M note byte
          let noteByte = 0xFF; // no note
          if (note === XM_NOTE_OFF) {
            noteByte = 0xFE; // note off
          } else if (note >= 1 && note <= 120) {
            // XM note = octave * 12 + semitone + 1
            // So octave = (note - 1) / 12, semitone = (note - 1) % 12
            const n = note - 1;
            const octave = Math.floor(n / 12);
            const semitone = n % 12;
            noteByte = (octave << 4) | semitone;
          }
          buf.push(noteByte);
          buf.push(instr & 0xFF);
        }

        if (hasVol) {
          buf.push(Math.min(64, vol));
        }

        if (hasEffect) {
          buf.push(stmIdx & 0xFF);
          buf.push(param & 0xFF);
        }
      }

      // End of row marker
      buf.push(0x00);
    }

    return new Uint8Array(buf);
  },
};

registerVariableEncoder(stxEncoder);
