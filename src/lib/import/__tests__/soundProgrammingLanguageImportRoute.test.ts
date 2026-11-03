/**
 * Sound Programming Language phase A: loading a .spl file through the app's import entry point (parseModuleToSong)
 * yields the decoder's time-aligned grid with byte-exact stream carriers.
 *
 * Expected values are derived by hand from boulderdash.spl and third-party/nuade/players/spl (spl.c step_voice,
 * spl_builds.c: Boulder Dash is the Full family, Swing divider, transpose 9, period table @0x2f6, streams @0xa26 /
 * 0xabe / 0xbbe / 0xc96; file offset = hunk offset + 0x20):
 *  - Voice 0 stream @0xa26 `f4 f4 f4 f1 000005b2`: call 0x5b2 = `f4 f4 f4 f1 0000041e`, call 0x41e = `f4 f4 f4 f0 <record>`
 *    then `f2`. The record (0x22 bytes) has octave 2 @+0x0c, flags 0, transpose 0. Back in 0x5b2: `d0` = length 16
 *    steps, then `40 40 ...`. Note 0x40, shifted by 9 (build transpose) = 0x49; plus octave 2 << 4 = 0x69; period =
 *    table[9] (0x7f00) >> 6 = 508 = A-1 = tracker note 22. It starts on row 0 and the next `40` on row 16 (a note
 *    holds its length). Voices 1 and 2 call the same 0x5b2 first, so they start with the same note on row 0.
 *  - A flat walk of the streams to each voice's first backward `f3` jump counts 660 / 364 / 410 / 80 notes and
 *    2496 / 2496 / 2496 / 320 steps (one grid row per step); the longest voice sets the grid: 2496 rows = 39 patterns.
 *  - Timer long @code+0x34 = 0x2e2f = 11823 -> 709379 / 11823 = 60 Hz; the Swing divider (reload 7) steps every 4
 *    ticks -> 15 steps/s; at speed 1 a row lasts 2.5 / BPM s, so BPM = 2.5 * 15 = 37.5 -> 37.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UADEVariablePatternLayout } from '@/engine/uade/UADEPatternEncoder';
import type { TrackerSong } from '@/engine/TrackerReplayer';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/SoundProgrammingLanguageParser', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../formats/SoundProgrammingLanguageParser')>();
  return {
    ...orig,
    parseSoundProgrammingLanguageFile: (...a: Parameters<typeof orig.parseSoundProgrammingLanguageFile>) => {
      sentinel.calls++;
      return orig.parseSoundProgrammingLanguageFile(...a);
    },
  };
});

const DIR = join(process.cwd(), 'public/data/songs/formats');

function notesOf(song: TrackerSong, v: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  song.patterns.forEach((p, pi) => p.channels[v].rows.forEach((c, r) => {
    if (c.note) out.push([pi * 64 + r, c.note, c.instrument]);
  }));
  return out;
}

describe('spl import route', () => {
  it('boulderdash.spl', async () => {
    const { parseModuleToSong } = await import('../parseModuleToSong');
    const raw = new Uint8Array(readFileSync(join(DIR, 'boulderdash.spl')));
    const before = sentinel.calls;
    const song = await parseModuleToSong(new File([raw], 'boulderdash.spl'));
    expect(sentinel.calls).toBeGreaterThan(before);
    const layout = (song as unknown as { uadeVariableLayout: UADEVariablePatternLayout }).uadeVariableLayout;
    expect(layout.formatId).toBe('soundProgrammingLanguage');
    expect(song.gridUnmatchedReason).toBeUndefined();

    const v = [0, 1, 2, 3].map((i) => notesOf(song, i));
    expect(v.map((n) => n.length)).toEqual([660, 364, 410, 80]);
    expect(song.patterns.reduce((n, p) => n + p.length, 0)).toBe(2496);
    expect(song.patterns.length).toBe(39);
    expect(v[0][0]).toEqual([0, 22, 1]);
    expect(v[0][1]).toEqual([16, 22, 1]);
    expect(v[1][0]).toEqual([0, 22, 1]);
    expect(v[2][0]).toEqual([0, 22, 1]);
    expect(song.initialBPM).toBe(37);

    expect(layout.blockRows?.length).toBeGreaterThan(0);
    layout.blockRows?.forEach((cells, i) => {
      const bytes = layout.encoder.encodePattern(cells, 0);
      const off = layout.filePatternAddrs[i];
      expect(Array.from(bytes)).toEqual(Array.from(raw.subarray(off, off + layout.filePatternSizes[i])));
      expect(bytes.length).toBe(layout.filePatternSizes[i]);
    });
  });
});
