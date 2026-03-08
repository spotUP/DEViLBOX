/**
 * SoundFXEncoder — Encodes TrackerCell back to SoundFX (.sfx) binary format.
 *
 * Cell encoding (4 bytes):
 *   byte[0-1]: note as signed int16 BE (Amiga period, or negative for special)
 *   byte[2]:   (sampleHi << 4) | (effect & 0x0F)
 *   byte[3]:   effect parameter
 *
 * Note: Negative periods encode special commands:
 *   -2 = note off, -3 = note off, -4 = pattern break, -5 = position jump
 * But the parser maps these to XM effects, so we reverse from XM effects.
 *
 * Effect mapping (reverse of SoundFX parser):
 *   XM 0x00 → SFX 0 (arpeggio)
 *   XM 0x01 → SFX 1 (portamento up, nibble)
 *   XM 0x0E → SFX 3/4 (filter/LED)
 *   XM 0x0C → SFX 5/6 (volume)
 *   XM 0x0F → SFX 9 (set speed)
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';
import { xmNoteToPeriod } from './MODEncoder';

const XM_NOTE_CUT = 97;

/**
 * Reverse-translate XM effect → SoundFX effect + param.
 */
function reverseEffect(effTyp: number, eff: number): { sfxEff: number; param: number } {
  if (effTyp === 0 && eff === 0) return { sfxEff: 0, param: 0 };

  switch (effTyp) {
    case 0x00: return { sfxEff: 0, param: eff };   // arpeggio
    case 0x01: return { sfxEff: 1, param: eff };   // portamento up
    case 0x02: return { sfxEff: 2, param: eff };   // portamento down
    case 0x0C: return { sfxEff: 6, param: eff };   // set volume
    case 0x0F: return { sfxEff: 9, param: eff };   // set speed
    case 0x0A: return { sfxEff: 5, param: eff };   // volume slide
    case 0x0E: return { sfxEff: 3, param: eff };   // filter/extended
    default:   return { sfxEff: 0, param: 0 };
  }
}

function encodeSoundFXCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;

  // Byte 0-1: period as signed int16 BE
  let period = 0;
  if (note === XM_NOTE_CUT) {
    period = -2; // note off
  } else if (note > 0) {
    period = xmNoteToPeriod(note);
  }

  // Write as signed int16 BE
  out[0] = (period >> 8) & 0xFF;
  out[1] = period & 0xFF;

  // Byte 2: (sampleHi << 4) | effect
  const instr = cell.instrument ?? 0;
  const { sfxEff, param } = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[2] = ((instr & 0x0F) << 4) | (sfxEff & 0x0F);

  // Byte 3: effect param
  out[3] = param & 0xFF;

  return out;
}

registerPatternEncoder('soundfx', () => encodeSoundFXCell);

export { encodeSoundFXCell };
