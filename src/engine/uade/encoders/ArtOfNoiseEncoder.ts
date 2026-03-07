/**
 * ArtOfNoiseEncoder — Encodes TrackerCell back to Art Of Noise (.aon) binary format.
 *
 * Cell encoding: 4 bytes
 *   b1 = [unused:2 | note:6]
 *   b2 = [arpeggioLo:2 | instrument:6]
 *   b3 = [arpeggioHi:2 | effect:6]
 *   b4 = effectArg
 *
 * Note mapping (reverse of aonNoteToXM):
 *   XM note 0 → AON note 0 (empty)
 *   XM note N → AON note = (N - 37 + 24) + 1 = N - 12
 *   Parser: xmNote = 37 + (idx - 24) where idx = aonNote - 1
 *   So: aonNote = xmNote - 37 + 24 + 1 = xmNote - 12
 *
 * Effect mapping: AON effects map 1:1 to MOD/XM effects (same command numbers)
 * Arpeggio: stored across bits of b2 and b3, not in TrackerCell (lost in translation)
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

/**
 * Reverse-translate XM effect → AON effect.
 */
function reverseEffect(effTyp: number, eff: number): { effect: number; effectArg: number } {
  if (effTyp === 0 && eff === 0) return { effect: 0, effectArg: 0 };

  // AON effects are numbered 0-15, same as MOD
  switch (effTyp) {
    case 0x01: return { effect: 1, effectArg: eff };
    case 0x02: return { effect: 2, effectArg: eff };
    case 0x03: return { effect: 3, effectArg: eff };
    case 0x04: return { effect: 4, effectArg: eff };
    case 0x05: return { effect: 5, effectArg: eff };
    case 0x06: return { effect: 6, effectArg: eff };
    case 0x09: return { effect: 9, effectArg: eff };
    case 0x0A: return { effect: 10, effectArg: eff };
    case 0x0B: return { effect: 11, effectArg: eff };
    case 0x0C: return { effect: 12, effectArg: eff };
    case 0x0D: return { effect: 13, effectArg: eff };
    case 0x0E: return { effect: 14, effectArg: eff };
    case 0x0F: return { effect: 15, effectArg: eff };
    default: return { effect: 0, effectArg: 0 };
  }
}

/**
 * Encode a TrackerCell to AON binary format (4 bytes).
 */
function encodeAONCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);

  // Byte 0: note (bits 5-0), arpeggio is in bits 7-6 but we don't have that info
  const note = cell.note ?? 0;
  if (note > 0) {
    const aonNote = note - 12; // reverse of: xmNote = 37 + (idx - 24) where idx = aonNote - 1
    out[0] = Math.max(0, Math.min(63, aonNote)) & 0x3F;
  }

  // Byte 1: instrument (bits 5-0), arpeggio low bits in 7-6
  out[1] = (cell.instrument ?? 0) & 0x3F;

  // Byte 2: effect (bits 5-0), arpeggio high bits in 7-6
  const { effect, effectArg } = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[2] = effect & 0x3F;

  // Byte 3: effect argument
  out[3] = effectArg & 0xFF;

  return out;
}

registerPatternEncoder('aon', () => encodeAONCell);

export { encodeAONCell };
