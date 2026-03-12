/**
 * QuadraComposerEncoder — Encodes TrackerCell back to Quadra Composer (.qc) format.
 *
 * Cell encoding (4 bytes):
 *   byte[0]: instrument (1-based; 0 = no instrument)
 *   byte[1]: note (0-35 = C-1 to B-3; >35 = no note)
 *   byte[2]: effect type (low nibble only)
 *   byte[3]: effect parameter
 *
 * Note mapping: XM note 37-72 → QC note 0-35
 * Effect: mostly direct ProTracker; vibrato depth halved, sample offset halved
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function encodeQCCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;

  // Byte 0: instrument
  out[0] = (cell.instrument ?? 0) & 0xFF;

  // Byte 1: note (XM 37 = C-3 → QC 0)
  if (note > 0 && note >= 37 && note <= 72) {
    out[1] = note - 37;
  } else {
    out[1] = 0xFF; // no note
  }

  // Byte 2: effect type (low nibble)
  let effTyp = cell.effTyp ?? 0;
  let eff = cell.eff ?? 0;

  // Reverse parser adjustments
  if (effTyp === 0x04 && eff > 0) {
    // Vibrato: parser doubled the depth, so halve it
    const speed = (eff >> 4) & 0x0F;
    const depth = Math.min(0x0F, Math.floor((eff & 0x0F) / 2));
    eff = (speed << 4) | depth;
  }
  if (effTyp === 0x09 && eff > 0) {
    // Sample offset: parser doubled, so halve
    eff = Math.floor(eff / 2);
  }

  out[2] = effTyp & 0x0F;
  out[3] = eff & 0xFF;

  return out;
}

registerPatternEncoder('quadraComposer', () => encodeQCCell);

export { encodeQCCell };
