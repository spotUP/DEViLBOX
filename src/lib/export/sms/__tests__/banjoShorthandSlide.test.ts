import { describe, expect, it } from 'vitest';
import { convertPattern } from '../banjoSong';
import { Lossy } from '../../md/mdsSong';

// Banjo command bytes (third-party/banjo/music_driver/banjo_defines_wladx.inc).
const SLIDE_PORTA = 0x08, LEGATO_ON = 0x0e, LEGATO_OFF = 0x0f, NOTE_ON = 0x80;

type Cell = NonNullable<ReturnType<Parameters<typeof convertPattern>[0]>>;
const empty: Cell = { note: 0, octave: 0, instrument: -1, volume: -1, effects: [] };
const run = (cells: Cell[]) => {
  const lossy = new Lossy();
  return { bytes: convertPattern((r) => cells[r], cells.length, 0, 1, 0, 0, lossy), lossy: lossy.list() };
};
const find = (hay: number[], needle: number[]) => hay.findIndex((_, i) => needle.every((b, j) => hay[i + j] === b));

describe('Banjo export: Furnace E1xy / E2xy shorthand slides', () => {
  it('E1xy on a note row slides y semitones up at speed x*4 via SLIDE_PORTA and a legato target note', () => {
    const { bytes, lossy } = run([{ ...empty, note: 1, octave: 4, effects: [{ type: 0xe1, value: 0x37 }] }]);
    const n = bytes[find(bytes, [SLIDE_PORTA]) - 1] & 0x7f; // the row's own note-on comes first
    expect(find(bytes, [NOTE_ON | n, SLIDE_PORTA, 12, LEGATO_ON, NOTE_ON | (n + 7), LEGATO_OFF])).toBeGreaterThanOrEqual(0);
    expect(lossy.join()).not.toMatch(/E1/);
  });
  it('E2xy on a later row slides down from the last note', () => {
    const { bytes } = run([{ ...empty, note: 1, octave: 4 }, { ...empty, effects: [{ type: 0xe2, value: 0x23 }] }]);
    const first = bytes.find((b) => b & NOTE_ON)! & 0x7f;
    expect(find(bytes, [SLIDE_PORTA, 8, LEGATO_ON, NOTE_ON | (first - 3), LEGATO_OFF])).toBeGreaterThanOrEqual(0);
  });
});
