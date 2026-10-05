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
 * Note mapping: DeltaMusic1Notes.noteToDM1Index, the inverse of the name the
 * parser gives a note byte (the period it plays, periodNotes naming). An
 * unedited cell carries its exact source note byte in `period` (set by the
 * parser's decodeCell) and gets it back verbatim, since several bytes share
 * a name.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';
import { noteToDM1Index } from '@/lib/import/formats/DeltaMusic1Notes';

function encodeDeltaMusic1Cell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;

  // Byte 0: instrument (parser stores as 1-based; DM1 file uses 0-based)
  const instr = cell.instrument ?? 0;
  out[0] = instr > 0 ? (instr - 1) & 0xFF : 0;

  // Byte 1: note index - the exact source byte when decodeCell left it in the
  // carrier, else the index that plays the grid note.
  out[1] = cell.period !== undefined ? cell.period & 0xFF : noteToDM1Index(note);

  // Byte 2-3: effect type + param
  out[2] = (cell.effTyp ?? 0) & 0xFF;
  out[3] = (cell.eff ?? 0) & 0xFF;

  return out;
}

registerPatternEncoder('deltaMusic1', () => encodeDeltaMusic1Cell);

export { encodeDeltaMusic1Cell };
