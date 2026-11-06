/**
 * Riff Raff: the stream commands that set a voice's state show in the grid's effect columns of the next event's row, loaded
 * through the app's import entry point.
 *
 * Values read from the decoder run on riffraff_smallest.riff (Side Winder II replayer): the first note of every voice on
 * row 1 is preceded by a Set Volume command, so its row carries V<volume> beside the note and instrument. Voice 0:
 * note 29, instrument 6, volume 0x3C; voice 1: note 25, instrument 6, volume 0x40.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrackerSong } from '@/engine/TrackerReplayer';
import { RR_FX, commandStreamEffectToString } from '../formats/commandStreamEffectGlyphs';
import { xmEffectToString } from '@/lib/xmConversions';

const sentinel = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@lib/import/formats/RiffRaffParser', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../formats/RiffRaffParser')>();
  return { ...orig, parseRiffRaffFile: (...a: Parameters<typeof orig.parseRiffRaffFile>) => { sentinel.calls++; return orig.parseRiffRaffFile(...a); } };
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

describe('Riff Raff effect columns', () => {
  it('shows Set Volume beside the note it precedes (riffraff_smallest.riff)', async () => {
    const song = await load('riffraff_smallest.riff');
    const v0 = cellAt(song, 0, 1);
    expect([v0.note, v0.instrument, v0.effTyp, v0.eff]).toEqual([29, 6, RR_FX.setVolume, 0x3c]);
    const v1 = cellAt(song, 1, 1);
    expect([v1.note, v1.instrument, v1.effTyp, v1.eff]).toEqual([25, 6, RR_FX.setVolume, 0x40]);
    expect(commandStreamEffectToString(v0.effTyp, v0.eff)).toBe('V3C');
    expect(xmEffectToString(v0.effTyp, v0.eff)).toBe('V3C');
  });
});
