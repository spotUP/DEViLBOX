/**
 * InfogramesEncoder - the Infogrames (.dum) pattern byte codec.
 *
 * A pattern is a byte stream (third-party/nuade/players/infogrames/ig_module.c, infogrames.c): a byte below 0x80 starts a
 * note whose period is ig_period(byte); 0x80-0xFF are commands (0xE0-0xE2 take one argument byte). The grid note is
 * measured from that period (periodToGridNote), never from a base constant. Commands and arguments are carried raw in
 * the invisible `period` field and rewritten from the stored byte, so only a note edit changes the module. A byte is a
 * note start, so a note cannot be cleared or added without changing the stream length: those edits keep the stored byte.
 */
import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';

/** ig_period(0..95), the monotone part of the player's table. */
export const INFOGRAMES_PERIODS = [
  27340, 25804, 24357, 22990, 21699, 20483, 19334, 18247, 17222, 16267, 15347, 14482, 13672, 12905, 12179, 11498,
  10854, 10241, 9574, 9125, 8623, 8132, 7678, 7246, 6844, 6454, 6092, 5750, 5427, 5121, 4836, 4565,
  4308, 4067, 3838, 3622, 3419, 3227, 3045, 2875, 2715, 2562, 2418, 2281, 2153, 2033, 1919, 1811,
  1709, 1613, 1522, 1437, 1357, 1280, 1208, 1141, 1077, 1016, 959, 906, 854, 806, 761, 719,
  678, 640, 604, 570, 538, 508, 480, 453, 427, 403, 381, 359, 339, 320, 302, 285,
  269, 254, 240, 226, 214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 112,
];

const GRID_NOTES = INFOGRAMES_PERIODS.map(periodToGridNote);

/** Set in the invisible `period` of a command's argument cell: a typed note must not overwrite that byte. */
const ARGUMENT_MARK = 0x100;

/** `argument`: the byte is a command's argument (-1), never a note. */
export function decodeInfogramesCell(raw: Uint8Array, argument = 0): TrackerCell {
  const b = raw[0] ?? 0;
  const note = argument === 0 && b < INFOGRAMES_PERIODS.length ? GRID_NOTES[b] : 0;
  return { note, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, period: argument === 0 ? b : ARGUMENT_MARK | b };
}

export function encodeInfogramesCell(cell: TrackerCell, stored?: Uint8Array): Uint8Array {
  const keep = stored ? stored[0] : (cell.period ?? 0) & 0xff;
  if ((cell.period ?? 0) & ARGUMENT_MARK) return new Uint8Array([keep]);
  // Only a cell the stored byte already makes a note (not an argument or command) takes a note edit.
  if (!cell.note || keep >= INFOGRAMES_PERIODS.length || GRID_NOTES[keep] === cell.note) return new Uint8Array([keep]);
  const i = GRID_NOTES.indexOf(cell.note);
  return new Uint8Array([i >= 0 ? i : keep]);
}

registerPatternEncoder('infogrames', () => encodeInfogramesCell);
