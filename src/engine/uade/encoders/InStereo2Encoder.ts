/**
 * InStereo2Encoder — Encodes TrackerCell back to InStereo! 2.0 (.is20) format.
 *
 * Cell encoding (4 bytes per track row):
 *   byte[0]: note (period table index; 0 = no note, 0x7f = mute/note-off)
 *   byte[1]: instrument
 *   byte[2]: [7]=disableSoundTranspose, [6]=disableNoteTranspose, [5:4]=arpeggio, [3:0]=effect
 *   byte[3]: effect argument
 *
 * Note mapping:
 *   Parser: is20NoteToXm: noteIndex + 12 = xmNote (clamped to 96)
 *   Reverse: xmNote → noteIndex = xmNote - 12; 97 → 0x7f (note-off)
 *
 * Effect mapping:
 *   Parser: is20EffectToXm maps various IS20 effects to XM
 *   Reverse: XM effects → IS20 effect codes
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function encodeInStereo2Cell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;

  // Byte 0: note index
  if (note === 97) {
    out[0] = 0x7f; // note-off/mute
  } else if (note > 12) {
    out[0] = Math.min(108, note - 12);
  } else {
    out[0] = 0;
  }

  // Byte 1: instrument (1-based in both parser and file)
  out[1] = (cell.instrument ?? 0) & 0xFF;

  // Byte 2: [7]=disableSoundTranspose, [6]=disableNoteTranspose, [5:4]=arpeggio, [3:0]=effect
  // Transpose flags are not reconstructible from XM data; default to 0 (not disabled)
  const disableSoundTranspose = 0;
  const disableNoteTranspose = 0;
  const arpeggio = 0; // arpeggio table index not reconstructible from XM

  let effect = 0;
  let effectArg = 0;

  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;

  switch (effTyp) {
    case 0x00: // Arpeggio
      if (eff !== 0) {
        effect = 0x00;
        effectArg = eff;
      }
      break;
    case 0x03: // Tone portamento → IS20 effect 7
      effect = 0x07;
      effectArg = eff;
      break;
    case 0x0A: // Volume slide → IS20 effect A (SetVolumeIncrement)
      effect = 0x0A;
      if ((eff & 0xF0) !== 0) {
        // Slide up: high nibble
        effectArg = (eff >> 4) & 0x0F;
      } else {
        // Slide down: low nibble → negative (256 - val)
        effectArg = (256 - (eff & 0x0F)) & 0xFF;
      }
      break;
    case 0x0B: // Position jump → IS20 effect B
      effect = 0x0B;
      effectArg = eff;
      break;
    case 0x0C: // Set volume → IS20 effect C
      effect = 0x0C;
      effectArg = Math.min(64, eff);
      break;
    case 0x0D: // Pattern break → IS20 effect D
      effect = 0x0D;
      effectArg = 0;
      break;
    case 0x0F: // Set speed → IS20 effect F
      if (eff > 0 && eff <= 31) {
        effect = 0x0F;
        effectArg = eff;
      }
      break;
    default:
      break;
  }

  out[2] = ((disableSoundTranspose & 1) << 7)
    | ((disableNoteTranspose & 1) << 6)
    | ((arpeggio & 0x03) << 4)
    | (effect & 0x0F);
  out[3] = effectArg & 0xFF;

  return out;
}

registerPatternEncoder('inStereo2', () => encodeInStereo2Cell);

export { encodeInStereo2Cell };
