/**
 * STMEncoder — Encodes TrackerCell back to ScreamTracker 2 (.stm) binary format.
 *
 * Cell encoding: 4 bytes [noteByte, insVol, volCmd, cmdInf]
 *
 * noteByte:
 *   0xFB/0xFC = empty/continue
 *   0xFD/0xFE = note cut
 *   Otherwise: (octave << 4) | semitone, where octave*12+semitone+37 = xmNote
 *
 * insVol:
 *   bits [7:3] = instrument (0-31)
 *   bits [2:0] = volume low 3 bits
 *
 * volCmd:
 *   bits [7:4] = volume high bits (shifted left by 1 from raw)
 *   bits [3:0] = effect index
 *
 * cmdInf: effect parameter
 *
 * Effect mapping (reverse of convertSTMEffect / STM_EFFECTS table):
 *   XM 0x0F → STM 0x01 (set speed)
 *   XM 0x0B → STM 0x02 (position jump)
 *   XM 0x0D → STM 0x03 (pattern break, BCD)
 *   XM 0x0A → STM 0x04 (volume slide)
 *   XM 0x02 → STM 0x05 (portamento down)
 *   XM 0x01 → STM 0x06 (portamento up)
 *   XM 0x03 → STM 0x07 (tone portamento)
 *   XM 0x04 → STM 0x08 (vibrato)
 *   XM 0x1D → STM 0x09 (tremor)
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

const XM_NOTE_CUT = 97;

/**
 * Reverse-translate XM effect → STM effect index + param.
 */
function reverseEffect(effTyp: number, eff: number): { stmIdx: number; param: number } {
  if (effTyp === 0 && eff === 0) return { stmIdx: 0, param: 0 };

  switch (effTyp) {
    case 0x0F: return { stmIdx: 0x01, param: (eff << 4) }; // set speed (pack as high nibble)
    case 0x0B: return { stmIdx: 0x02, param: eff };         // position jump
    case 0x0D: {
      // Pattern break: convert from decimal back to BCD
      const bcdParam = ((Math.floor(eff / 10) & 0x0F) << 4) | (eff % 10);
      return { stmIdx: 0x03, param: bcdParam };
    }
    case 0x0A: return { stmIdx: 0x04, param: eff };         // volume slide
    case 0x02: return { stmIdx: 0x05, param: eff };         // portamento down
    case 0x01: return { stmIdx: 0x06, param: eff };         // portamento up
    case 0x03: return { stmIdx: 0x07, param: eff };         // tone portamento
    case 0x04: return { stmIdx: 0x08, param: eff };         // vibrato
    case 0x1D: return { stmIdx: 0x09, param: eff };         // tremor
    default: return { stmIdx: 0, param: 0 };
  }
}

/**
 * Encode a TrackerCell to STM binary format (4 bytes).
 */
function encodeSTMCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;

  // Byte 0: noteByte
  if (note === 0) {
    out[0] = 0xFB; // empty
  } else if (note === XM_NOTE_CUT) {
    out[0] = 0xFE; // note cut
  } else {
    // Reverse: xmNote = octave*12 + semitone + 37, so xmNote - 37 = octave*12 + semitone
    const n = note - 37;
    if (n >= 0 && n < 96) {
      const octave = Math.floor(n / 12);
      const semitone = n % 12;
      out[0] = (octave << 4) | semitone;
    } else {
      out[0] = 0xFB; // out of range → empty
    }
  }

  // Bytes 1-2: instrument + volume
  const instr = Math.min(31, cell.instrument ?? 0);
  const vol = Math.min(64, cell.volume ?? 0);

  // insVol: instrument in bits [7:3], volume low 3 bits in [2:0]
  out[1] = ((instr & 0x1F) << 3) | (vol & 0x07);

  // volCmd: volume high bits in [7:4] (shifted left by 1), effect index in [3:0]
  const { stmIdx, param } = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[2] = ((vol & 0x78) << 1) | (stmIdx & 0x0F);

  // Byte 3: effect parameter
  out[3] = param & 0xFF;

  return out;
}

registerPatternEncoder('stm', () => encodeSTMCell);

export { encodeSTMCell };
