/**
 * The CoSo parser showed a speed change (FE n) as an empty grid row, though the player spends no time on it:
 * hippel.c step_voice reads FE n and goes on to the next event in the same step. The grid then showed rows the player
 * never plays, so it drifted from the playhead, and a rebuild from the grid wrote each one back as an FD row that
 * takes a step. FE n now belongs to the row of the event after it; FD n is a row of its own.
 */
import { describe, it, expect } from 'vitest';
import { decodeCoSoGrid } from '@lib/import/formats/HippelCoSoParser';

/** One step, voice 0 on pattern 0, whose stream is `stream`; the other voices point at an end-only pattern. */
function module(stream: number[]) {
  const buf = new Uint8Array(256);
  const patternsOff = 0;
  // pattern pointer table: pattern 0 at 8, pattern 1 (end only) at 7
  buf[0] = 0; buf[1] = 8; buf[2] = 0; buf[3] = 7; buf[7] = 0xFF;
  buf.set(stream, 8);
  const songPointer = 64; // one step: voice 0 -> pattern 0, voices 1..3 -> pattern 1
  buf[songPointer] = 0;
  for (let v = 1; v < 4; v++) buf[songPointer + v * 3] = 1;
  return { buf, patternsOff, songPointer };
}

describe('CoSo grid: FE n takes no row', () => {
  it('FE 03, note, FD 00, note is three rows: note, rest, note (not five)', () => {
    const { buf, patternsOff, songPointer } = module([0xFE, 3, 0x18, 0x01, 0xFD, 0, 0x1A, 0x01, 0xFF]);
    const { rows, spans } = decodeCoSoGrid(buf, patternsOff, songPointer, 1, 4);
    const voice = rows[0][0];
    expect(voice.slice(0, 3).map((c) => c.note > 0)).toEqual([true, false, true]);
    expect(voice.slice(3).every((c) => c.note === 0)).toBe(true);
    // The first row's bytes include the FE in front of the note
    expect(spans[0][0][0]).toMatchObject({ offset: 8, length: 4 });
    expect(spans[0][0][1]).toMatchObject({ offset: 12, length: 2 });
    expect(spans[0][0][2]).toMatchObject({ offset: 14, length: 2 });
  });

  it('typing over the note keeps the FE in front of it', () => {
    const { buf, patternsOff, songPointer } = module([0xFE, 3, 0x18, 0x01, 0xFF]);
    const { rows, spans } = decodeCoSoGrid(buf, patternsOff, songPointer, 1, 4);
    const out = spans[0][0][0]!.encode({ ...rows[0][0][0], note: rows[0][0][0].note + 2 }, buf);
    expect(Array.from(out!)).toEqual([0xFE, 3, 0x1A, 0x01]);
  });

  it('an FE right before the end of the pattern is no row', () => {
    const { buf, patternsOff, songPointer } = module([0x18, 0x01, 0xFE, 2, 0xFF]);
    const { rows } = decodeCoSoGrid(buf, patternsOff, songPointer, 1, 4);
    expect(rows[0][0].filter((c) => c.note > 0)).toHaveLength(1);
  });
});
