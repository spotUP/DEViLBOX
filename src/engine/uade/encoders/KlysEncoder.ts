/**
 * KlysEncoder.ts — Encodes TrackerCell back to Klystrack native step format.
 *
 * Klystrack pattern step (6 bytes, little-endian):
 *   byte[0]: note       (0=empty, 1-96=note, 97=note-off; 0xFF in native = empty)
 *   byte[1]: instrument (0xFF=no instrument, 0-254=instrument index)
 *   byte[2]: ctrl       (bitfield: legato, slide, vibrato)
 *   byte[3]: volume     (0-128 or special values; 0=default)
 *   byte[4]: command low byte  (command = type << 8 | param; low = param)
 *   byte[5]: command high byte (high = type)
 *
 * TrackerCell mapping (from KlysParser / WASM callback):
 *   cell.note = step.note (1-96, 97=off, 0=empty)
 *   cell.instrument = step.instrument + 1 (parser adds 1; 0xFF native → -1 or 0 in cell)
 *   cell.volume = step.volume
 *   cell.effTyp = command >> 8 (effect type)
 *   cell.eff = command & 0xFF (effect parameter)
 *
 * Reverse mapping:
 *   note: cell.note (0=empty → 0, 1-96 → same, 97=noteoff → 97)
 *   instrument: cell.instrument - 1 if > 0, else 0xFF
 *   ctrl: 0 (not exposed in TrackerCell)
 *   volume: cell.volume
 *   command: (cell.effTyp << 8) | cell.eff
 *
 * This is a fixed-size 6-byte cell encoder.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

export function encodeKlysCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(6);

  // Byte 0: note
  const note = cell.note ?? 0;
  out[0] = note & 0xFF;

  // Byte 1: instrument (reverse: parser adds 1, so subtract 1; 0 or negative → 0xFF)
  const instr = cell.instrument ?? 0;
  out[1] = instr > 0 ? ((instr - 1) & 0xFF) : 0xFF;

  // Byte 2: ctrl (not tracked in TrackerCell — default 0)
  out[2] = 0;

  // Byte 3: volume
  out[3] = (cell.volume ?? 0) & 0xFF;

  // Bytes 4-5: command (little-endian uint16: type << 8 | param)
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;
  const command = ((effTyp & 0xFF) << 8) | (eff & 0xFF);
  out[4] = command & 0xFF;        // low byte (param)
  out[5] = (command >> 8) & 0xFF; // high byte (type)

  return out;
}

registerPatternEncoder('klystrack', () => encodeKlysCell);
