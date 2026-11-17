/**
 * MajorTomEncoder - the Major Tom / ARP ("ARP." magic) grid cell codec.
 *
 * A row is 4 voices x 4 bytes [note, instrument, effect, param]
 * (third-party/nuade/players/majortom/mt_module.c). Note byte 0 = no note; otherwise the period index is
 * ((note - 0x10) >> 4) * 12 + (note & 0xf) into mt_period_words (mt_data.c). The grid note is measured from that
 * period (periodToGridNote), never from a base constant. The per-position transpose is not applied: the grid shows the
 * stored byte, so an edit writes back the byte the user typed.
 */
import type { TrackerCell } from '@/types';
import { registerPatternEncoder } from '../UADEPatternEncoder';
import { periodToGridNote } from '@/lib/amiga/periodNotes';

/** mt_period_words[0..59], the monotone part of the player's table. */
export const MAJORTOM_PERIODS = [
  0x0d40, 0x0c80, 0x0bd0, 0x0b20, 0x0a80, 0x09f0, 0x0960, 0x08d0, 0x0850, 0x07e0, 0x0770, 0x0700,
  0x06a0, 0x0640, 0x05e8, 0x0590, 0x0540, 0x04f8, 0x04b0, 0x0468, 0x0428, 0x03f0, 0x03b8, 0x0380,
  0x0350, 0x0320, 0x02f4, 0x02c8, 0x02a0, 0x027c, 0x0258, 0x0234, 0x0214, 0x01f8, 0x01dc, 0x01c0,
  0x01a8, 0x0190, 0x017a, 0x0164, 0x0150, 0x013e, 0x012c, 0x011a, 0x010a, 0x00fc, 0x00ee, 0x00e0,
  0x00d4, 0x00c8, 0x00bd, 0x00b2, 0x00a8, 0x009f, 0x0096, 0x008d, 0x0085, 0x007e, 0x0077, 0x0070,
];

const GRID_NOTES = MAJORTOM_PERIODS.map(periodToGridNote);

/** Period index of a note byte, or -1 when the byte is not a note the table holds. */
export function majorTomIndex(b: number): number {
  if (b < 0x10 || (b & 0xf) > 11) return -1;
  const i = ((b - 0x10) >> 4) * 12 + (b & 0xf);
  return i < MAJORTOM_PERIODS.length ? i : -1;
}

export function decodeMajorTomCell(bytes: Uint8Array): TrackerCell {
  const i = majorTomIndex(bytes[0]);
  return {
    note: i >= 0 ? GRID_NOTES[i] : 0,
    instrument: i >= 0 ? bytes[1] : 0,
    volume: 0,
    effTyp: bytes[2],
    eff: bytes[3],
    effTyp2: 0,
    eff2: 0,
  };
}

export function encodeMajorTomCell(cell: TrackerCell, stored?: Uint8Array): Uint8Array {
  const out = new Uint8Array(4);
  const note = cell.note ?? 0;
  const keep = stored && decodeMajorTomCell(stored).note === note;
  if (keep) out[0] = stored[0];
  else {
    const i = GRID_NOTES.indexOf(note);
    out[0] = i >= 0 ? 0x10 + Math.floor(i / 12) * 16 + (i % 12) : 0;
  }
  out[1] = out[0] ? (cell.instrument ?? 0) & 0xff : (stored?.[1] ?? 0);
  out[2] = (cell.effTyp ?? 0) & 0xff;
  out[3] = (cell.eff ?? 0) & 0xff;
  return out;
}

registerPatternEncoder('majortom', () => encodeMajorTomCell);
