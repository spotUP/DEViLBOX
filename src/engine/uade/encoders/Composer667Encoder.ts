/**
 * Composer667Encoder — Encodes TrackerCell back to Composer 669 binary format.
 *
 * Cell encoding: 3 bytes
 *   byte0 = [note:6 | instrHi:2]     (note in bits 7-2, instr high in bits 1-0)
 *   byte1 = [instrLo:4 | volume:4]   (instr low in bits 7-4, vol in bits 3-0)
 *   byte2 = effect parameter          (0xFF = no effect)
 *
 * Special values:
 *   byte0 == 0xFE → no note, no instrument change
 *   byte0 == 0xFF → no note, no instrument, no volume
 *
 * Note mapping (reverse of parser):
 *   Parser: note = (noteInstr >> 2) + 37
 *   Reverse: rawNote = xmNote - 37
 *
 * Volume mapping (reverse of parser):
 *   Parser: volume = Math.round((rawVol * 64 + 8) / 15)
 *   Reverse: rawVol = Math.round(volume * 15 / 64)
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

/**
 * Reverse-translate XM effect → 669 effect parameter byte.
 * 669 effects are encoded as a single byte where the high nibble
 * is the command and the low nibble is the parameter.
 * Returns 0xFF for no effect.
 */
function reverseEffect(effTyp: number, eff: number): number {
  if (effTyp === 0 && eff === 0) return 0xFF; // no effect

  switch (effTyp) {
    case 0x01: // Portamento up → 669 cmd 0
      return (0 << 4) | (eff & 0x0F);
    case 0x02: // Portamento down → 669 cmd 1
      return (1 << 4) | (eff & 0x0F);
    case 0x03: // Tone portamento → 669 cmd 2
      return (2 << 4) | (eff & 0x0F);
    case 0x04: // Vibrato → 669 cmd 4
      return (4 << 4) | (eff & 0x0F);
    case 0x0F: // Set speed → 669 cmd 5
      return (5 << 4) | (eff & 0x0F);
    case 0x0E: // Extended effects → 669 cmd 6 or 7
      if (eff === 0x04) return (6 << 4) | 0; // fine porta up variant
      if (eff === 0x14) return (6 << 4) | 1;
      if ((eff & 0xF0) === 0x90) return (7 << 4) | (eff & 0x0F); // retrigger
      return 0xFF;
    default:
      return 0xFF;
  }
}

/**
 * Encode a TrackerCell to Composer 669 binary format (3 bytes).
 */
function encode669Cell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(3);

  const note = cell.note ?? 0;
  const instr = cell.instrument ?? 0;
  const volume = cell.volume ?? 0;
  const hasNote = note > 0;
  const hasVolume = volume > 0;

  if (!hasNote && !hasVolume) {
    // No note, no volume → 0xFF marker
    out[0] = 0xFF;
    out[1] = 0x00;
  } else if (!hasNote) {
    // No note but has volume → 0xFE marker
    out[0] = 0xFE;
    const rawVol = Math.min(15, Math.round(volume * 15 / 64));
    out[1] = rawVol & 0x0F;
  } else {
    // Has note (and possibly volume)
    const rawNote = Math.max(0, Math.min(63, note - 37));
    const instrHi = instr & 0x03;
    out[0] = (rawNote << 2) | instrHi;

    const instrLo = (instr >> 2) & 0x0F;
    const rawVol = hasVolume ? Math.min(15, Math.round(volume * 15 / 64)) : 0;
    out[1] = (instrLo << 4) | (rawVol & 0x0F);
  }

  // Byte 2: effect
  out[2] = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0);

  return out;
}

registerPatternEncoder('composer667', () => encode669Cell);

export { encode669Cell };
