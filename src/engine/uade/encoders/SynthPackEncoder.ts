/**
 * SynthPackEncoder - the SynthPack (Wanted Team "OBISYNTHPACK", .osp) Longs-layout note-list event codec.
 *
 * An event is 6 bytes `note, volume, instrument, effect, row, param` (third-party/nuade/players/synthpack/sp_longs.c).
 * `note` indexes the player's 72-entry period table in which index 24 (period 856) is C-1, so grid note = index - 11
 * (period 1712 = grid 1). Index 0xFF with volume 0 is a release (grid note off). The index is kept in the invisible `period`
 * field so an unedited cell re-encodes to its stored bytes; the row byte always comes from the stored event.
 * The column's note_shift / instrument_shift (pattern line) are not applied to the grid: it shows the stored values.
 */
import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';
import { NOTE_OFF_VALUE } from '@/lib/tracker/noteValue';

const OFFSET = 11;
const VOL = 0x10; // cell.volume = 0x10 + stored volume (0..0x40)

export function decodeSynthPackCell(raw: Uint8Array): TrackerCell {
  const release = raw[0] === 0xff;
  return {
    note: release ? NOTE_OFF_VALUE : raw[0] >= 12 && raw[0] - OFFSET <= 72 ? raw[0] - OFFSET : 0,
    instrument: raw[2], volume: release || raw[1] > 0x40 ? 0 : VOL + raw[1],
    effTyp: raw[3], eff: raw[5], effTyp2: 0, eff2: 0, period: raw[0],
  };
}

export function encodeSynthPackCell(cell: TrackerCell, stored?: Uint8Array): Uint8Array {
  const s = stored ?? new Uint8Array(6);
  const keep = stored ? stored[0] : (cell.period ?? 0);
  let note = keep;
  if (cell.note === NOTE_OFF_VALUE) note = 0xff;
  else if (cell.note && cell.note !== (keep === 0xff ? -1 : keep - OFFSET)) note = cell.note + OFFSET;
  const vol = (cell.volume ?? 0) >= VOL ? Math.min(0x40, cell.volume - VOL) : s[1];
  return new Uint8Array([note, note === 0xff && cell.note === NOTE_OFF_VALUE ? s[1] : vol, cell.instrument & 0xff, (cell.effTyp ?? 0) & 0xff, s[4], (cell.eff ?? 0) & 0xff]);
}

registerPatternEncoder('synthPack', () => encodeSynthPackCell);
