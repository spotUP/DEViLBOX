/**
 * SoundMonEncoder — Encodes TrackerCell back to SoundMon/Brian Postma (.bp) format.
 *
 * Cell encoding (3 bytes per row):
 *   byte[0]: note (signed; 0 = no note)
 *   byte[1]: (sample << 4) | (effect & 0x0F)
 *   byte[2]: param (signed)
 *
 * Note: SoundMon uses 16-row blocks (not 64), and tracks are referenced via
 * track indirection. The encoder only handles cell→bytes conversion.
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

function encodeSoundMonCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(3);
  const note = cell.note ?? 0;

  // Byte 0: note value. The parser maps the raw SoundMon note index through two tables
  // (bpNoteToXM: index→PERIODS→nearest ProTracker period→XM note), which is not a simple
  // additive offset — so it cannot be inverted from the XM note alone. Prefer the exact
  // source note byte stashed by decodeCell in the `period` carrier; edited grid cells carry
  // none and fall back to the (approximate) additive derivation.
  if (cell.period !== undefined) {
    out[0] = cell.period & 0xFF;
  } else if (note > 36) {
    out[0] = (note - 36) & 0xFF;
  } else {
    out[0] = 0;
  }

  // Byte 1: (sample << 4) | effect — both nibbles round-trip exactly
  const instr = cell.instrument ?? 0;
  out[1] = ((instr & 0x0F) << 4) | ((cell.effTyp ?? 0) & 0x0F);

  // Byte 2: param (as signed byte)
  out[2] = (cell.eff ?? 0) & 0xFF;

  return out;
}

registerPatternEncoder('soundMon', () => encodeSoundMonCell);

export { encodeSoundMonCell };
