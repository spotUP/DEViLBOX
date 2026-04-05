/**
 * InStereo1Encoder — Encodes TrackerCell back to InStereo! 1.0 (.is) format.
 *
 * Cell encoding (4 bytes per track row):
 *   byte[0]: note (period table index; 0 = no note, 0x7f = note-off)
 *   byte[1]: instrument
 *   byte[2]: [7:4]=arpeggio, [3:0]=effect
 *   byte[3]: effect argument
 *
 * Note mapping:
 *   Parser: is10NoteToXm: noteIndex + 36 = xmNote (clamped to 96)
 *   Reverse: xmNote → noteIndex = xmNote - 36; 97 → 0x7f (note-off)
 *
 * Effect mapping:
 *   Parser: is10EffectToXm maps effect 7 → XM 0x0C, effect F → XM 0x0F
 *   Reverse: XM 0x0C → IS10 effect 7, XM 0x0F → IS10 effect F
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function encodeInStereo1Cell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;

  // Byte 0: note index
  // Parser: is10NoteToXm(noteIndex) = noteIndex + 36
  // Reverse: noteIndex = xmNote - 36
  if (note === 97) {
    out[0] = 0x7f; // note-off
  } else if (note > 36) {
    out[0] = Math.min(108, note - 36);
  } else {
    out[0] = 0;
  }

  // Byte 1: instrument (1-based in both parser and file)
  out[1] = (cell.instrument ?? 0) & 0xFF;

  // Byte 2: [7:4]=arpeggio, [3:0]=effect
  // Parser: arpeggio = (byt3 & 0xf0) >> 4, effect = byt3 & 0x0f
  // Reverse XM effects to IS10 effect codes
  const arpeggio = 0; // arpeggio table index is not reconstructible from XM
  let effect = 0;
  let effectArg = (cell.eff ?? 0) & 0xFF;

  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;

  switch (effTyp) {
    case 0x0C: // SetVolume → IS10 effect 7
      effect = 0x07;
      effectArg = Math.min(63, eff) & 0x3f;
      break;
    case 0x0F: // SetSpeed → IS10 effect F
      if (eff > 0 && eff <= 31) {
        effect = 0x0F;
        effectArg = eff;
      }
      break;
    default:
      effect = 0;
      effectArg = 0;
      break;
  }

  out[2] = ((arpeggio & 0x0F) << 4) | (effect & 0x0F);
  out[3] = effectArg & 0xFF;

  return out;
}

registerPatternEncoder('inStereo1', () => encodeInStereo1Cell);

export { encodeInStereo1Cell };
