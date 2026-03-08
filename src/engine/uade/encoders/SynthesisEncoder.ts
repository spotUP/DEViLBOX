/**
 * SynthesisEncoder — Encodes TrackerCell back to Synthesis (.syn) format.
 *
 * Cell encoding (4 bytes):
 *   byte[0]: note (period index; 0 = no note)
 *   byte[1]: instrument
 *   byte[2]: (arpeggio << 4) | (effect & 0x0F)
 *   byte[3]: effect argument
 *
 * Note mapping: synNoteToXM maps index → 37 + (idx - 49)
 *   Reverse: xmNote → idx = xmNote - 37 + 49 = xmNote + 12
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function encodeSynthesisCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;

  // Byte 0: note (reverse of synNoteToXM: xm = 37 + (idx - 49) → idx = xm + 12)
  if (note > 0) {
    out[0] = Math.max(0, Math.min(255, note + 12));
  } else {
    out[0] = 0;
  }

  // Byte 1: instrument
  out[1] = (cell.instrument ?? 0) & 0xFF;

  // Byte 2: arpeggio (high nibble, from volume field or separate) | effect (low nibble)
  // The parser stores arpeggio index separately but we don't have a field for it in TrackerCell
  // It would have been stored in volume or lost. Use 0 for arpeggio.
  out[2] = (cell.effTyp ?? 0) & 0x0F;

  // Byte 3: effect argument
  out[3] = (cell.eff ?? 0) & 0xFF;

  return out;
}

registerPatternEncoder('synthesis', () => encodeSynthesisCell);

export { encodeSynthesisCell };
