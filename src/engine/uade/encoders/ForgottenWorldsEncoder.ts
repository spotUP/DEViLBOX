/**
 * ForgottenWorldsEncoder - the Forgotten Worlds (.fw) stream byte codec.
 *
 * A voice stream or pattern is a byte stream (third-party/nuade/players/forgottenworlds/forgottenworlds.c): a byte
 * below 0x80 starts a note whose period is k_periods[byte], followed by a length byte; 0x84, 0x86 and 0x88 (instrument,
 * rest, call) take one argument byte; 0x80, 0x82 and 0x8A are single-byte end, loop and return. The grid note is
 * measured from the period (periodToGridNote), never from a base constant. Commands and arguments are carried raw in
 * the invisible `period` field, so only a note edit changes the module. A byte is a note start, so a note cannot be
 * cleared or added without changing the stream length: those edits keep the stored byte.
 */
import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';

/** k_periods[0..45]; entry 46 is 0 (the table end), not a playable note. */
export const FORGOTTEN_WORLDS_PERIODS = [
  0x6B0, 0x650, 0x5F0, 0x5A0, 0x550, 0x500, 0x4B8, 0x478, 0x438, 0x3F8, 0x3C0, 0x388, 0x358, 0x328, 0x2F8, 0x2D0,
  0x2A8, 0x280, 0x25C, 0x23C, 0x21C, 0x1FC, 0x1E0, 0x1C4, 0x1AC, 0x194, 0x17C, 0x168, 0x154, 0x140, 0x12E, 0x11E,
  0x10E, 0x0FE, 0x0F0, 0x0E2, 0x0D6, 0x0CA, 0x0BE, 0x0B4, 0x0AA, 0x0A0, 0x097, 0x08F, 0x087, 0x07F,
];

const GRID_NOTES = FORGOTTEN_WORLDS_PERIODS.map(periodToGridNote);

/** Set in the invisible `period` of a command's argument cell: a typed note must not overwrite that byte. */
const ARGUMENT_MARK = 0x100;

/** `argument`: the byte is a note length or a command argument (-1), never a note. */
export function decodeForgottenWorldsCell(raw: Uint8Array, argument = 0): TrackerCell {
  const b = raw[0] ?? 0;
  const note = argument === 0 && b < FORGOTTEN_WORLDS_PERIODS.length ? GRID_NOTES[b] : 0;
  return { note, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, period: argument === 0 ? b : ARGUMENT_MARK | b };
}

export function encodeForgottenWorldsCell(cell: TrackerCell, stored?: Uint8Array): Uint8Array {
  const keep = stored ? stored[0] : (cell.period ?? 0) & 0xff;
  if ((cell.period ?? 0) & ARGUMENT_MARK) return new Uint8Array([keep]);
  if (!cell.note || keep >= FORGOTTEN_WORLDS_PERIODS.length || GRID_NOTES[keep] === cell.note) return new Uint8Array([keep]);
  const i = GRID_NOTES.indexOf(cell.note);
  return new Uint8Array([i >= 0 ? i : keep]);
}

registerPatternEncoder('forgottenWorlds', () => encodeForgottenWorldsCell);
