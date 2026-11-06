/**
 * Beathoven Synthesizer: the stream commands that set a voice's state (slide, legato, note bias, arpeggio) show in
 * the grid's effect columns of the next note's row, loaded through the app's import entry point.
 *
 * Values read from the files (see beathovenImportRoute.test.ts for the layout):
 *  - tristar_cracktro.bss voice 3 stream `82 1` is the legato-on command, then note 3 on row 0: effect L01 on row 0 with
 *    note 27, instrument 6.
 *  - beathoven_smallest.bss (legacy) voice 0 arpeggio `81 001e 0003 ...` starts on tick 90 = row 18 (5 ticks per
 *    row): effect A03 beside note 34. Voice 3 plays the same stream from tick 10 = row 2.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { BTH_FX } from '../formats/beathovenEffectGlyphs';
import { beathovenEffectToString } from '../formats/beathovenEffectGlyphs';
import { xmEffectToString } from '@/lib/xmConversions';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/BeathovenParser', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../formats/BeathovenParser')>();
  return { ...orig, parseBeathovenFile: (...a: Parameters<typeof orig.parseBeathovenFile>) => { sentinel.calls++; return orig.parseBeathovenFile(...a); } };
});

const DIR = join(process.cwd(), 'public/data/songs/formats');

async function load(name: string): Promise<TrackerSong> {
  const { parseModuleToSong } = await import('../parseModuleToSong');
  const raw = new Uint8Array(readFileSync(join(DIR, name)));
  const before = sentinel.calls;
  const song = await parseModuleToSong(new File([raw], name));
  expect(sentinel.calls).toBeGreaterThan(before);
  return song;
}

const cellAt = (song: TrackerSong, ch: number, row: number) => song.patterns[Math.floor(row / 64)].channels[ch].rows[row % 64];

describe('Beathoven effect columns', () => {
  it('shows the legato command on the next note (tristar_cracktro.bss)', async () => {
    const c = cellAt(await load('tristar_cracktro.bss'), 3, 0);
    expect([c.note, c.instrument, c.effTyp, c.eff]).toEqual([27, 6, BTH_FX.legato, 1]);
    expect(beathovenEffectToString(c.effTyp, c.eff)).toBe('L01');
    expect(xmEffectToString(c.effTyp, c.eff)).toBe('L01');
  });

  it('shows the arpeggio count beside its first note (beathoven_smallest.bss)', async () => {
    const song = await load('beathoven_smallest.bss');
    const v0 = cellAt(song, 0, 18);
    expect([v0.note, v0.instrument, v0.effTyp, v0.eff]).toEqual([34, 1, BTH_FX.arpeggio, 3]);
    const v3 = cellAt(song, 3, 2);
    expect([v3.note, v3.effTyp, v3.eff]).toEqual([34, BTH_FX.arpeggio, 3]);
  });
});
