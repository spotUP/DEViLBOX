/**
 * Beathoven Synthesizer phase A: loading a .bss file through the app's import entry point (parseModuleToSong)
 * yields the decoder's time-aligned grid with byte-exact stream carriers.
 *
 * Expected values are derived by hand from the stream bytes and third-party/nuade/players/beathoven:
 *  - beathoven_smallest.bss (N100, legacy). Voice 0 track list @0x678 -> stream @0xa78 `82 50 00`: a rest of 0x50 = 80
 *    ticks (one tick per row, unscaled). Next entry @0x7c8 = `80 0 0ab6` (instrument record 0ab6 = instrument 1),
 *    `82 000a` rest 10, then `81 001e 0003 000d 0010 0014` the arpeggio, which starts on row 80 + 10 = 90 with first
 *    note number 0x0d. Table @0x2e4 (508 480 ...), index = note + note_base(0) - origin(1) = 12 -> period 254 = A-2 =
 *    tracker note 34. Voice 3 plays the same stream @0x7c8 from row 0: arpeggio on row 10, note 34, instrument 1.
 *    Voice 2 @0xa80: `80 0 0ace`, note 0x0c length 5 on row 0: index 11 -> period 269 = A#-2 = note 33.
 *    A flat walk of the track lists counts 43 / 192 / 22 / 43 notes (voices 0..3) and 1360 / 1360 / 240 / 1280 rows.
 *  - tristar_cracktro.bss (N109, tempo 3, constant bias 4, table @0x8c24). Voice 0 stream @0x8d34 begins
 *    `80 0 9132  8 4`: note 8, length 4 steps: index 8 - 1 + 0 + 4 = 11 -> period 285 = G-2 = note 32, row 0.
 *    Voice 1 `80 0 9108  3 4`: index 6 -> period 381 = D-2 = note 27. Voice 2 `3 8`: note 27. Voice 3 `82 1` is
 *    legato (no time) then `3 0x20`: note 27 on row 0. Counts 46 / 32 / 134 / 6, longest voice 768 rows.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/BeathovenParser', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../formats/BeathovenParser')>();
  return { ...orig, parseBeathovenFile: (...a: Parameters<typeof orig.parseBeathovenFile>) => { sentinel.calls++; return orig.parseBeathovenFile(...a); } };
});

const DIR = join(process.cwd(), 'public/data/songs/formats');

function notesOf(song: TrackerSong, v: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  song.patterns.forEach((p, pi) => p.channels[v].rows.forEach((c, r) => {
    if (c.note) out.push([pi * 64 + r, c.note, c.instrument]);
  }));
  return out;
}

async function load(name: string): Promise<{ raw: Uint8Array; song: TrackerSong; layout: UADEVariablePatternLayout }> {
  const { parseModuleToSong } = await import('../parseModuleToSong');
  const raw = new Uint8Array(readFileSync(join(DIR, name)));
  const before = sentinel.calls;
  const song = await parseModuleToSong(new File([raw], name));
  expect(sentinel.calls).toBeGreaterThan(before);
  const layout = (song as unknown as { uadeVariableLayout: UADEVariablePatternLayout }).uadeVariableLayout;
  expect(layout.formatId).toBe('beathoven');
  return { raw, song, layout };
}

function expectCarriersRebuildBytes(raw: Uint8Array, layout: UADEVariablePatternLayout): void {
  expect(layout.blockRows?.length).toBeGreaterThan(0);
  layout.blockRows?.forEach((cells, i) => {
    const bytes = layout.encoder.encodePattern(cells, 0);
    const off = layout.filePatternAddrs[i];
    expect(Array.from(bytes)).toEqual(Array.from(raw.subarray(off, off + layout.filePatternSizes[i])));
    expect(bytes.length).toBe(layout.filePatternSizes[i]);
  });
}

describe('bss import route', () => {
  it('legacy N100: beathoven_smallest.bss', async () => {
    const { raw, song, layout } = await load('beathoven_smallest.bss');
    const v = [0, 1, 2, 3].map((i) => notesOf(song, i));
    expect(v.map((n) => n.length)).toEqual([43, 192, 22, 43]);
    expect(v[0][0]).toEqual([18, 34, 1])  /* tick 90 at step 5 */;
    expect(v[2][0][0]).toBe(0);
    expect(v[2][0][1]).toBe(33);
    expect(v[3][0]).toEqual([2, 34, 1]);
    expect(song.patterns.reduce((n, p) => n + p.length, 0)).toBe(272);
    expectCarriersRebuildBytes(raw, layout);
  });

  it('N109: tristar_cracktro.bss', async () => {
    const { raw, song, layout } = await load('tristar_cracktro.bss');
    const v = [0, 1, 2, 3].map((i) => notesOf(song, i));
    expect(v.map((n) => n.length)).toEqual([46, 32, 134, 6]);
    expect(v[0][0]).toEqual([0, 32, 1]);
    expect(v[1][0][0]).toBe(0);
    expect(v[1][0][1]).toBe(27);
    expect(v[2][0][1]).toBe(27);
    expect(v[3][0][0]).toBe(0);
    expect(v[3][0][1]).toBe(27);
    expect(song.patterns.reduce((n, p) => n + p.length, 0)).toBe(384);
    expectCarriersRebuildBytes(raw, layout);
  });
});
