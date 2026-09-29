/**
 * MODEncoder — Shared encoder for ProTracker MOD-compatible formats.
 *
 * Used by: STK, GMC, ICE, PT36, MFP, and any format using standard
 * 4-byte ProTracker cell encoding with Amiga period values.
 *
 * Cell encoding (4 bytes):
 *   byte[0] = (instrHi & 0xF0) | ((period >> 8) & 0x0F)
 *   byte[1] = period & 0xFF
 *   byte[2] = ((instrLo & 0x0F) << 4) | (effTyp & 0x0F)
 *   byte[3] = eff & 0xFF
 *
 * Note mapping: ProTracker naming via src/lib/amiga/periodNotes.ts -
 *   note 13 = C-1 = period 856, note 25 = C-2 = 428, note 37 = C-3 = 214.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder, decodeModCell } from '../UADEPatternEncoder';
import { noteToPeriod, cellPeriod } from '@/lib/amiga/periodNotes';

/**
 * Note -> Amiga period in ProTracker naming (note 13 = C-1 = 856); 0 for no
 * note. One table for every MOD-style reader and writer:
 * src/lib/amiga/periodNotes.ts.
 */
function xmNoteToPeriod(xmNote: number): number {
  return noteToPeriod(xmNote);
}

/**
 * Encode a TrackerCell to standard ProTracker MOD binary (4 bytes).
 */
export function encodeMODCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  // The cell's own period while it still names the note (off-table and
  // finetuned periods survive byte-exact), else the note's.
  const period = cellPeriod(cell);
  const instr = cell.instrument ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;

  out[0] = (instr & 0xF0) | ((period >> 8) & 0x0F);
  out[1] = period & 0xFF;
  out[2] = ((instr & 0x0F) << 4) | (effTyp & 0x0F);
  out[3] = eff & 0xFF;

  return out;
}

/**
 * Decode standard ProTracker MOD binary (4 bytes) back to a TrackerCell.
 * Exact inverse of encodeMODCell for table periods; the one MOD decoder.
 */
export const decodeMODCell = decodeModCell;

// Register for all MOD-compatible formats
registerPatternEncoder('mod', () => encodeMODCell);
registerPatternEncoder('stk', () => encodeMODCell);
registerPatternEncoder('gmc', () => encodeMODCell);
registerPatternEncoder('ice', () => encodeMODCell);
registerPatternEncoder('pt36', () => encodeMODCell);
registerPatternEncoder('mfp', () => encodeMODCell);

export { xmNoteToPeriod };
