/**
 * SimpleAmigaStubEncoder — Encodes TrackerCell back to simple Amiga stub formats.
 *
 * Covers: Sonic Arranger SAS, Sound Factory PSF (stub variant), Leggless LME,
 * Mike Davies MD, Mark II MK2, AProSys APS, Art and Magic AAM.
 *
 * All are self-contained 68k binaries. The parsers generate empty placeholder
 * patterns — no cells are parsed from the binary.
 *
 * This encoder uses standard ProTracker MOD 4-byte cell encoding since all
 * are 4-channel Amiga formats. When UADE loads the module and the chip RAM
 * base is resolved, cells can potentially be patched at the correct addresses.
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
 * Used for simple Amiga stub format chip RAM patching.
 */
export function encodeSimpleAmigaStubCell(cell: TrackerCell): Uint8Array {
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

// Register encoders for all simple stub formats
registerPatternEncoder('sonicArrangerSas', () => encodeSimpleAmigaStubCell);
registerPatternEncoder('soundFactoryStub', () => encodeSimpleAmigaStubCell);
registerPatternEncoder('leggless', () => encodeSimpleAmigaStubCell);
registerPatternEncoder('mikeDavies', () => encodeSimpleAmigaStubCell);
registerPatternEncoder('markII', () => encodeSimpleAmigaStubCell);
registerPatternEncoder('aProSys', () => encodeSimpleAmigaStubCell);
registerPatternEncoder('artAndMagic', () => encodeSimpleAmigaStubCell);
