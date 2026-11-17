/**
 * ThomasHermannEncoder - Thomas Hermann grid cell codec (third-party/nuade/players/thomashermann/thm_module.c).
 *
 * A row is 3 bytes [note, instrument, flags]. note = (index << 4) | octave nibble with index 0..11 over the player's
 * period table (ascending pitch); 0xcf retrigger, 0xdf release, 0xef stop, 0xff nothing. flags bit 0 = slide, bit 1 =
 * no_stop (kept in eff); the other flag bits survive from the stored bytes.
 * Grid note = rank * 12 + index + 1 with rank = (octave nibble + 1) & 15 (0xf, 0, 1, 2, 3 -> 0..4): table order only,
 * the octave is not measured against Paula output. Commands live in effTyp 1 (retrigger), 2 (release), 3 (stop).
 */

import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';

const COMMANDS = [0, 0xcf, 0xdf, 0xef];

export function decodeThomasHermannCell(bytes: Uint8Array): TrackerCell {
  const n = bytes[0];
  const cmd = COMMANDS.indexOf(n);
  const index = n >> 4;
  const nibble = n & 15;
  const isNote = n < 0xc0 && index < 12 && (nibble === 15 || nibble <= 3);
  return {
    note: isNote ? ((nibble + 1) & 15) * 12 + index + 1 : 0,
    instrument: bytes[1],
    volume: 0,
    effTyp: cmd > 0 ? cmd : 0,
    eff: bytes[2] & 3,
    effTyp2: 0,
    eff2: 0,
  };
}

export function encodeThomasHermannCell(cell: TrackerCell, stored?: Uint8Array): Uint8Array {
  if (stored && JSON.stringify(decodeThomasHermannCell(stored)) === JSON.stringify(cell)) return Uint8Array.from(stored);
  const out = new Uint8Array(3);
  const note = cell.note ?? 0;
  const eff = cell.effTyp ?? 0;
  if (note >= 1 && note <= 60) {
    out[0] = ((note - 1) % 12 << 4) | (Math.floor((note - 1) / 12) + 15) % 16;
  } else {
    out[0] = eff >= 1 && eff <= 3 ? COMMANDS[eff] : 0xff;
  }
  out[1] = (cell.instrument ?? 0) & 0xff;
  out[2] = ((cell.eff ?? 0) & 3) | ((stored?.[2] ?? 0) & ~3);
  return out;
}

registerPatternEncoder('thomasHermann', () => encodeThomasHermannCell);
