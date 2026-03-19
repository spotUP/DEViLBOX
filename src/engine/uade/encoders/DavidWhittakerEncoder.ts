/**
 * DavidWhittakerEncoder — Encodes TrackerCell back to David Whittaker format.
 *
 * David Whittaker modules are compiled 68k Amiga executables. The pattern data
 * is embedded within the player code and cannot be directly addressed without
 * full 68k disassembly. The parser generates placeholder patterns rather than
 * parsing cells from binary.
 *
 * This encoder uses standard ProTracker MOD 4-byte cell encoding since DW is
 * a 4-channel Amiga format. When UADE loads the module and the chip RAM base
 * is resolved, cells can potentially be patched at the correct addresses.
 *
 * Cell encoding (4 bytes, standard MOD):
 *   byte[0] = (instrHi & 0xF0) | ((period >> 8) & 0x0F)
 *   byte[1] = period & 0xFF
 *   byte[2] = ((instrLo & 0x0F) << 4) | (effTyp & 0x0F)
 *   byte[3] = eff & 0xFF
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

// Standard ProTracker period table (finetune 0), 36 entries: C-1 to B-3
const MOD_PERIODS = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
];

/**
 * Convert XM note number to Amiga period.
 * XM note 37 = C-3 → period index 0 → period 856
 * Returns 0 for no note or out-of-range.
 */
function xmNoteToPeriod(xmNote: number): number {
  if (xmNote === 0) return 0;
  const periodIdx = xmNote - 37;
  if (periodIdx < 0 || periodIdx >= MOD_PERIODS.length) return 0;
  return MOD_PERIODS[periodIdx];
}

/**
 * Encode a TrackerCell to standard ProTracker MOD binary (4 bytes).
 * Used for David Whittaker format chip RAM patching.
 */
export function encodeDavidWhittakerCell(cell: TrackerCell): Uint8Array {
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

registerPatternEncoder('davidWhittaker', () => encodeDavidWhittakerCell);
