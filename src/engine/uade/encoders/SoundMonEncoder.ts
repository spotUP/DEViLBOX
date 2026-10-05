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
import { noteToBpNote } from '@/lib/import/formats/SoundMonNotes';

function encodeSoundMonCell(cell: TrackerCell): Uint8Array {
  const out = new Uint8Array(3);
  const note = cell.note ?? 0;

  // Byte 0: note value. Several note bytes share a name (SoundMonNotes: all
  // below C-0 read as C-0), so an unedited cell gets the exact source byte
  // decodeCell stashed in the `period` carrier; an edited cell carries none
  // and takes the value that plays its note.
  out[0] = cell.period !== undefined ? cell.period & 0xFF : noteToBpNote(note) & 0xFF;

  // Byte 1: (sample << 4) | effect — both nibbles round-trip exactly
  const instr = cell.instrument ?? 0;
  out[1] = ((instr & 0x0F) << 4) | ((cell.effTyp ?? 0) & 0x0F);

  // Byte 2: param (as signed byte)
  out[2] = (cell.eff ?? 0) & 0xFF;

  return out;
}

registerPatternEncoder('soundMon', () => encodeSoundMonCell);

export { encodeSoundMonCell };
