/**
 * The CoSo parser read a pattern byte 0x80-0xFC as a one-byte unknown command. The player (hippel.c step_voice)
 * reads every byte below FD as a note event: note byte, info byte, and one more byte when the info byte has any
 * of bits 5-7 set. Bit 7 only skips the instrument trigger, so the pitch changes and the sound plays on.
 * The parser then read the info byte as the next event, so the rest of the pattern was shifted (phantom notes,
 * a pattern that ended early). All three CoSo songs in the repo use these bytes (ghostbattle titletune: 171).
 */
import { describe, it, expect } from 'vitest';
import { decodeCoSoGrid, cosoNoteToXM } from '@lib/import/formats/HippelCoSoParser';

/** One step, voice 0 on pattern 0, whose stream is `stream`; the other voices point at an end-only pattern. */
function module(stream: number[]) {
  const buf = new Uint8Array(256);
  const patternsOff = 0;
  buf[0] = 0; buf[1] = 8; buf[2] = 0; buf[3] = 7; buf[7] = 0xFF;
  buf.set(stream, 8);
  const songPointer = 64;
  buf[songPointer] = 0;
  for (let v = 1; v < 4; v++) buf[songPointer + v * 3] = 1;
  return { buf, patternsOff, songPointer };
}

describe('CoSo grid: a note without an instrument trigger (0x80-0xFC)', () => {
  // note 18 inst 1; no-trigger note 1A (info 00); no-trigger note 1C with portamento (info 20, param 05); note 18
  const stream = [0x18, 0x01, 0x9A, 0x00, 0x9C, 0x20, 0x05, 0x18, 0x01, 0xFF];

  it('reads it as one note row with its info and param bytes, so the events after it stay in place', () => {
    const { buf, patternsOff, songPointer } = module(stream);
    const { rows, spans } = decodeCoSoGrid(buf, patternsOff, songPointer, 1, 4);
    const voice = rows[0][0];
    expect(voice.slice(0, 4).map((c) => c.note)).toEqual([
      cosoNoteToXM(0x18, 0), cosoNoteToXM(0x1A, 0), cosoNoteToXM(0x1C, 0), cosoNoteToXM(0x18, 0),
    ]);
    // the no-trigger notes show no instrument; the triggered ones do
    expect(voice.slice(0, 4).map((c) => c.instrument)).toEqual([2, 0, 0, 2]);
    expect(voice.slice(4).every((c) => c.note === 0)).toBe(true);
    expect(spans[0][0].slice(0, 4).map((s) => s && [s.offset, s.length])).toEqual([[8, 2], [10, 2], [12, 3], [15, 2]]);
  });

  it('typing a new pitch over it keeps bit 7, the info byte and the param', () => {
    const { buf, patternsOff, songPointer } = module(stream);
    const { rows, spans } = decodeCoSoGrid(buf, patternsOff, songPointer, 1, 4);
    const cell = rows[0][0][2];
    const out = spans[0][0][2]!.encode({ ...cell, note: cosoNoteToXM(0x1E, 0), instrument: 3 }, buf);
    expect(Array.from(out!)).toEqual([0x9E, 0x20, 0x05]);
  });

  it('a triggered note still writes its instrument', () => {
    const { buf, patternsOff, songPointer } = module(stream);
    const { rows, spans } = decodeCoSoGrid(buf, patternsOff, songPointer, 1, 4);
    const out = spans[0][0][0]!.encode({ ...rows[0][0][0], instrument: 3 }, buf);
    expect(Array.from(out!)).toEqual([0x18, 0x02]);
  });
});
