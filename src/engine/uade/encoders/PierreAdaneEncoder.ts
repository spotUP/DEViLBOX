/**
 * PierreAdaneEncoder - the Pierre Adane Packer (.pap) track-entry codec.
 *
 * A track entry is `u16 period, u8 (instrument << 4 | effect), u8 param` (third-party/nuade/players/pierreadane/pa_internal.h).
 * The period is a plain Amiga period, so the grid note is measured from it (periodToGridNote), never from a base constant.
 * All four bytes have a grid field (period -> note and the invisible `period`, instrument, effect nibble, parameter), so a
 * cell whose note is unchanged re-encodes to its stored bytes. The effect nibble is kept raw: its meaning is the player's,
 * not ProTracker's.
 */
import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';
import { periodToGridNote, noteToPeriod } from '@/lib/amiga/periodNotes';

export function decodePierreAdaneCell(raw: Uint8Array): TrackerCell {
  const period = (raw[0] << 8) | raw[1];
  return {
    note: periodToGridNote(period), instrument: raw[2] >> 4, volume: 0,
    effTyp: raw[2] & 0x0f, eff: raw[3], effTyp2: 0, eff2: 0, period,
  };
}

export function encodePierreAdaneCell(cell: TrackerCell, stored?: Uint8Array): Uint8Array {
  const keep = stored ? (stored[0] << 8) | stored[1] : (cell.period ?? 0);
  let period = keep;
  if (!cell.note) period = 0;
  else if (periodToGridNote(keep) !== cell.note) period = noteToPeriod(cell.note) || keep;
  return new Uint8Array([
    period >> 8, period & 0xff,
    ((cell.instrument & 0x0f) << 4) | ((cell.effTyp ?? 0) & 0x0f), (cell.eff ?? 0) & 0xff,
  ]);
}

registerPatternEncoder('pierreAdane', () => encodePierreAdaneCell);
