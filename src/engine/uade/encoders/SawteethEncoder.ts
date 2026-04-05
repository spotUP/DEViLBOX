/**
 * SawteethEncoder — Encodes TrackerCell rows back to Sawteeth format.
 *
 * Sawteeth stores Parts (each a list of 3-byte steps: [ins, eff, note]),
 * which are referenced by per-channel song sequences. The parser expands
 * all parts inline into flat row arrays per channel.
 *
 * Since the format uses independent per-channel sequences with variable-length
 * parts, this uses the VariableLengthEncoder interface.
 *
 * Step encoding (3 bytes per step, inverse of parser):
 *   byte[0] = ins   (instrument index, 0 = none, 1+ = instrument)
 *   byte[1] = eff   (effect byte, format-specific)
 *   byte[2] = note  (0 = no note, 1-96 = note, already 1-based XM)
 *
 * The parser reads: ins = u8, eff = u8, note = u8 per step.
 * Transpose is applied at the channel sequence level, not stored per-step.
 */

import type { TrackerCell } from '@/types';
import { registerVariableEncoder, type VariableLengthEncoder } from '../UADEPatternEncoder';

/**
 * Encode a channel's rows back to Sawteeth Part step bytes.
 *
 * Each row becomes a 3-byte step [ins, eff, note]. This is the raw Part
 * data — the channel sequence header (part index, transpose, dAmp) is NOT
 * included here since that is song-structure-level data.
 */
function encodeSawteethPattern(rows: TrackerCell[], _channel: number): Uint8Array {
  const bytes = new Uint8Array(rows.length * 3);

  for (let i = 0; i < rows.length; i++) {
    const cell = rows[i];
    const off = i * 3;

    // Byte 0: instrument (direct passthrough)
    bytes[off] = (cell.instrument ?? 0) & 0xFF;

    // Byte 1: effect (the parser stores raw effect byte, no mapping)
    // The parser doesn't map Sawteeth effects to XM effects — it stores
    // the raw eff byte and sets effTyp/eff to 0. So encode back as 0.
    bytes[off + 1] = 0;

    // Byte 2: note (XM 1-based note or 0 for no note)
    const note = cell.note ?? 0;
    bytes[off + 2] = (note >= 1 && note <= 96) ? note : 0;
  }

  return bytes;
}

const sawteethEncoder: VariableLengthEncoder = {
  formatId: 'sawteeth',
  encodePattern: encodeSawteethPattern,
};

registerVariableEncoder(sawteethEncoder);

export { encodeSawteethPattern };
