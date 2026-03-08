/**
 * PLMEncoder — Encodes TrackerCell back to Disorder Tracker 2 (.plm) format.
 *
 * Cell encoding (5 bytes):
 *   byte[0]: note (BCD octave/semitone: hi=octave, lo=semitone; 0x90+ or 0 = empty)
 *   byte[1]: instrument
 *   byte[2]: volume (0 = no volume change)
 *   byte[3]: effect command
 *   byte[4]: effect parameter
 *
 * Note mapping: XM note → PLM note
 *   Parser: (noteByte >> 4) * 12 + (noteByte & 0x0F) + 12 + 1
 *   Reverse: raw = xmNote - 13, octave = floor(raw/12), semi = raw%12
 *            plmNote = (octave << 4) | semi
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

// Reverse of EFF_TRANS[] lookup. Parser maps cmd → XM effTyp.
// We need XM effTyp → PLM cmd.
// From typical PLM/DT2 effect translation:
function reversePLMEffect(effTyp: number, eff: number): { cmd: number; param: number } {
  if (effTyp === 0 && eff === 0) return { cmd: 0, param: 0 };

  // Direct mapping for common effects
  switch (effTyp) {
    case 0x01: return { cmd: 0x01, param: eff }; // portamento up
    case 0x02: return { cmd: 0x02, param: eff }; // portamento down
    case 0x03: return { cmd: 0x03, param: eff }; // tone portamento
    case 0x04: return { cmd: 0x04, param: eff }; // vibrato
    case 0x05: return { cmd: 0x05, param: eff }; // tone porta + vol slide
    case 0x06: return { cmd: 0x06, param: eff }; // vibrato + vol slide
    case 0x07: return { cmd: 0x07, param: eff }; // tremolo
    case 0x08: return { cmd: 0x08, param: eff }; // panning
    case 0x09: return { cmd: 0x09, param: eff }; // sample offset
    case 0x0A: return { cmd: 0x0A, param: eff }; // volume slide
    case 0x0B: return { cmd: 0x0B, param: eff }; // position jump
    case 0x0C: return { cmd: 0x0C, param: eff }; // set volume
    case 0x0D: return { cmd: 0x0D, param: eff }; // pattern break
    case 0x0E: return { cmd: 0x0E, param: eff }; // extended
    case 0x0F: return { cmd: 0x0F, param: eff }; // set speed/tempo
    default:   return { cmd: 0, param: 0 };
  }
}

function encodePLMCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(5);
  const note = cell.note ?? 0;

  // Byte 0: note as BCD
  if (note > 0 && note >= 13) {
    const raw = note - 13;
    const octave = Math.floor(raw / 12);
    const semi = raw % 12;
    out[0] = (octave << 4) | semi;
  } else {
    out[0] = 0; // empty
  }

  out[1] = (cell.instrument ?? 0) & 0xFF;
  out[2] = (cell.volume ?? 0) & 0xFF;

  const { cmd, param } = reversePLMEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[3] = cmd & 0xFF;
  out[4] = param & 0xFF;

  return out;
}

registerPatternEncoder('plm', () => encodePLMCell);

export { encodePLMCell };
