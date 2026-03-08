/**
 * TCBTrackerEncoder — Encodes TrackerCell back to TCB Tracker ("AN COOL!") format.
 *
 * Cell encoding (2 bytes per cell):
 *   byte[0]: note byte (0=empty, 0x10-0x3B=valid note)
 *            High nibble = octave (1-3), low nibble = semitone (0-11)
 *   byte[1]: (instrument << 4) | (effectType & 0x0F)
 *            Instrument: 0-15 (maps to 1-16 in parser)
 *
 * XM note mapping:
 *   xmNote = octave * 12 + semitone + 1
 *   Reverse: octave = ((xmNote - 1) / 12) | 0, semitone = (xmNote - 1) % 12
 *   noteByte = (octave << 4) | semitone
 *   Valid range: octave 1-3, semitone 0-11 → noteByte 0x10-0x3B
 *
 * Effects:
 *   0x0D = pattern break (XM Dxx)
 *   Other effects use specialValues table (format 2) — simplified here.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

export function encodeTCBTrackerCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(2);
  const xmNote = cell.note ?? 0;

  // Byte 0: TCB note byte
  if (xmNote > 0 && xmNote <= 96) {
    const octave = Math.floor((xmNote - 1) / 12);
    const semitone = (xmNote - 1) % 12;
    // Valid range: octave 1-3
    if (octave >= 1 && octave <= 3) {
      out[0] = (octave << 4) | semitone;
    } else {
      out[0] = 0; // out of range
    }
  } else {
    out[0] = 0;
  }

  // Byte 1: (instrument << 4) | effect
  // Parser adds 1 to instrument, so reverse: subtract 1
  const instr = Math.max(0, (cell.instrument ?? 0) - 1) & 0x0F;
  let effect = 0;

  const effTyp = cell.effTyp ?? 0;
  if (effTyp === 0x0D) {
    effect = 0x0D; // pattern break
  }
  // Other effects would need the specialValues table context; leave as 0

  out[1] = (instr << 4) | (effect & 0x0F);

  return out;
}

registerPatternEncoder('tcbTracker', () => encodeTCBTrackerCell);
