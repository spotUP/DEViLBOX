/**
 * Howie Davies: the stream commands that set a voice's state show in the grid's effect columns of the next event's row, loaded
 * through the app's import entry point.
 *
 * Values read from the decoder run on blazing_thunder.hd: voice 0 reads the Speed command (6) before its first note, so
 * row 0 carries S06 beside note 18, instrument 11; voice 1 reads Maximum Volume 0x40 before its note on row 640
 * (pattern 10, row 0): V40 beside note 28, instrument 7.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { HD_FX, commandStreamEffectToString } from '../formats/commandStreamEffectGlyphs';
import { xmEffectToString } from '@/lib/xmConversions';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/HowieDaviesParser', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../formats/HowieDaviesParser')>();
  return { ...orig, parseHowieDaviesFile: (...a: Parameters<typeof orig.parseHowieDaviesFile>) => { sentinel.calls++; return orig.parseHowieDaviesFile(...a); } };
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

describe('Howie Davies effect columns', () => {
  it('shows Speed and Maximum Volume beside the note they precede (blazing_thunder.hd)', async () => {
    const song = await load('blazing_thunder.hd');
    const s = cellAt(song, 0, 0);
    expect([s.note, s.instrument, s.effTyp, s.eff]).toEqual([18, 11, HD_FX.speed, 6]);
    const v = cellAt(song, 1, 640);
    expect([v.note, v.instrument, v.effTyp, v.eff]).toEqual([28, 7, HD_FX.maxVolume, 0x40]);
    expect(commandStreamEffectToString(v.effTyp, v.eff)).toBe('V40');
    expect(xmEffectToString(v.effTyp, v.eff)).toBe('V40');
  });
});
