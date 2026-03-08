/**
 * DeltaMusic1Encoder — Encodes TrackerCell back to DeltaMusic 1.0 (.dm1) format.
 *
 * Cell encoding (4 bytes per row):
 *   byte[0]: instrument (0-based)
 *   byte[1]: note (0 = no note; 1-83 = DM1 period index)
 *   byte[2]: effect type
 *   byte[3]: effect argument
 *
 * DeltaMusic uses 16-row blocks (not 64), assembled from 4 track sequences.
 *
 * Note mapping:
 *   Parser: DM1 note → period → periodToNoteIndex → amigaNoteToXM (adds 12)
 *   Reverse: xmNote → amigaIdx = xmNote - 12 (period table index)
 *   The DM1 format stores a raw note index (1-83) which maps to its own period table.
 *   Since the parser maps through the standard Amiga period table, we reverse through that.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function encodeDeltaMusic1Cell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;

  // Byte 0: instrument (parser stores as 1-based; DM1 file uses 0-based)
  const instr = cell.instrument ?? 0;
  out[0] = instr > 0 ? (instr - 1) & 0xFF : 0;

  // Byte 1: note index
  // Parser does: DM1 noteVal → DM1_PERIODS[noteVal-1] → periodToNoteIndex → +12 = xmNote
  // Reverse: xmNote - 12 = amiga index (1-based) → we need to find the DM1 note that
  // maps to this period. Since DM1 periods are a superset, we approximate:
  // For standard range, amiga note index ≈ DM1 note value
  if (note > 0 && note > 12) {
    out[1] = Math.min(83, note - 12);
  } else {
    out[1] = 0;
  }

  // Byte 2-3: effect type + param
  out[2] = (cell.effTyp ?? 0) & 0xFF;
  out[3] = (cell.eff ?? 0) & 0xFF;

  return out;
}

registerPatternEncoder('deltaMusic1', () => encodeDeltaMusic1Cell);

export { encodeDeltaMusic1Cell };
