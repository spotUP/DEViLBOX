/**
 * AMFEncoder — Encodes TrackerCell back to AMF/Asylum binary format.
 *
 * Cell encoding: 4 bytes [note, instrument, command, param]
 *   note:       0 = no note; otherwise raw note value
 *   instrument: instrument number (0-based? 1-based in practice)
 *   command:    MOD-style effect command (0x00-0x0F)
 *   param:      effect parameter
 *
 * Note mapping (reverse of AMF parser):
 *   Parser: xmNote = noteRaw + 24 + 13 = noteRaw + 37
 *   Reverse: noteRaw = xmNote - 37
 *
 * Effect mapping (reverse of convertModCommand):
 *   Most effects pass through 1:1 (standard MOD commands)
 *   0x08 (panning): parser does param * 2, so reverse is param / 2
 *   0x0C (volume): parser does min(param, 64), pass through
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

/**
 * Reverse-translate XM effect → AMF/Asylum effect.
 */
function reverseEffect(effTyp: number, eff: number): { command: number; param: number } {
  if (effTyp === 0 && eff === 0) return { command: 0, param: 0 };

  // Panning: parser doubled, so halve
  if (effTyp === 0x08) {
    return { command: 0x08, param: Math.round(eff / 2) & 0xFF };
  }

  // Standard MOD effects 0x00-0x0F pass through
  if (effTyp <= 0x0F) {
    return { command: effTyp, param: eff };
  }

  return { command: 0, param: 0 };
}

/**
 * Encode a TrackerCell to AMF/Asylum binary format (4 bytes).
 */
function encodeAMFCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);

  // Byte 0: note
  const note = cell.note ?? 0;
  if (note > 0) {
    const noteRaw = note - 37;
    out[0] = (noteRaw > 0 && noteRaw <= 107) ? noteRaw : 0;
  }

  // Byte 1: instrument
  out[1] = cell.instrument ?? 0;

  // Bytes 2-3: effect
  const { command, param } = reverseEffect(cell.effTyp ?? 0, cell.eff ?? 0);
  out[2] = command;
  out[3] = param;

  return out;
}

registerPatternEncoder('amf', () => encodeAMFCell);

export { encodeAMFCell };
