/**
 * WantedTeamDaveLoweEncoder — Encodes TrackerCell back to Dave Lowe format.
 *
 * Dave Lowe modules are AmigaDOS HUNK executables. The parser is a stub
 * that generates empty placeholder patterns — no cell decoding exists.
 *
 * This encoder uses standard ProTracker MOD 4-byte cell encoding since
 * Dave Lowe is a 4-channel Amiga format with standard note/period conventions.
 *
 * Cell encoding (4 bytes, standard MOD):
 *   byte[0] = (instrHi & 0xF0) | ((period >> 8) & 0x0F)
 *   byte[1] = period & 0xFF
 *   byte[2] = ((instrLo & 0x0F) << 4) | (effTyp & 0x0F)
 *   byte[3] = eff & 0xFF
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';
// ProTracker naming (note 13 = C-1 = 856), one table: src/lib/amiga/periodNotes.ts.
import { noteToPeriod as xmNoteToPeriod } from '@/lib/amiga/periodNotes';

/**
 * Encode a TrackerCell to standard ProTracker MOD binary (4 bytes).
 */
export function encodeWantedTeamDaveLoweCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(4);
  const period = xmNoteToPeriod(cell.note ?? 0);
  const instr = cell.instrument ?? 0;
  const effTyp = cell.effTyp ?? 0;
  const eff = cell.eff ?? 0;

  out[0] = (instr & 0xF0) | ((period >> 8) & 0x0F);
  out[1] = period & 0xFF;
  out[2] = ((instr & 0x0F) << 4) | (effTyp & 0x0F);
  out[3] = eff & 0xFF;

  return out;
}

registerPatternEncoder('wantedTeamDaveLowe', () => encodeWantedTeamDaveLoweCell);
