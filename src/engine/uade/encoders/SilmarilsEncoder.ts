/**
 * SilmarilsEncoder - the Silmarils (.mok) note-byte codec.
 *
 * A Note command is `note, volume`; the note byte plus the instrument's note base indexes the player's 128-entry period table
 * (third-party/nuade/players/silmarils/sil_music.c s_periods). The grid note is measured from that period
 * (periodToGridNote), never from a base constant. The per-instrument note base lives in the module's script and is not read
 * here, so it is taken as 0. The raw byte rides in the invisible `period` field; only a note edit changes the module.
 */
import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';

export const SIL_PERIODS = [
  ...Array<number>(22).fill(0x1660),
  0x151C, 0x13F0, 0x12D0, 0x11C0, 0x10C0, 0x0FD0, 0x0EF0, 0x0E18, 0x0D4C, 0x0C8E, 0x0BDA, 0x0B30, 0x0A8F, 0x09F7, 0x0968,
  0x08E1, 0x0861, 0x08B1, 0x0777, 0x070C, 0x06A7, 0x0647, 0x05ED, 0x0598, 0x0547, 0x04FC, 0x04B4, 0x0470, 0x0430, 0x03F4,
  0x03BC, 0x0386, 0x0353, 0x0324, 0x02F6, 0x02CC, 0x02A4, 0x027E, 0x025A, 0x0238, 0x0218, 0x01FA, 0x01DE, 0x01C3, 0x01AA,
  0x0192, 0x017B, 0x0166, 0x0152, 0x013F, 0x012D, 0x011C, 0x010C, 0x00FD, 0x00EF, 0x00E2, 0x00D5, 0x00C9, 0x00BE, 0x00B3,
  0x00A9, 0x009F, 0x0096, 0x008E, 0x0086, 0x007F,
];

const GRID_NOTES = SIL_PERIODS.map(periodToGridNote);

export function decodeSilmarilsCell(raw: Uint8Array): TrackerCell {
  const b = raw[0];
  return { note: b < GRID_NOTES.length ? GRID_NOTES[b] : 0, instrument: 0, volume: 0, effTyp: 0, eff: 0, effTyp2: 0, eff2: 0, period: b };
}

export function encodeSilmarilsCell(cell: TrackerCell, stored?: Uint8Array): Uint8Array {
  const keep = stored ? stored[0] : (cell.period ?? 0);
  if (!cell.note || GRID_NOTES[keep] === cell.note) return new Uint8Array([keep]);
  // Start past the flat 22-entry floor, which repeats one period.
  const j = GRID_NOTES.indexOf(cell.note, 22);
  return new Uint8Array([j >= 0 ? j : keep]);
}

registerPatternEncoder('silmarils', () => encodeSilmarilsCell);
