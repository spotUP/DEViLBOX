/**
 * Furnace pce.cpp plays an Amiga-type or useSample instrument through DDA (control $DF, sample bytes streamed to reg 6, period
 * unused). The HuSIC export has no DDA route, so such a note sounds as a wavetable tone: the export must say so. fd_PCB channel 1
 * uses instrument 0 ("bitboks", useSample with a note map) for its drum hits.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFurnaceSong } from '../../../import/formats/FurnaceSongParser';
import { furnaceToHusic, type HusicLayout } from '../husicSong';

const root = join(__dirname, '../../../../..');
const player = readFileSync(join(root, 'public/pce/player.pce'));
const layout = JSON.parse(readFileSync(join(root, 'public/pce/player.json'), 'utf8')) as HusicLayout;
const load = async (song: string) => {
  const b = readFileSync(join(root, 'public/data/songs/furnace/pce', song));
  return parseFurnaceSong(b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer);
};
const SAMPLE = 'sample instrument (DDA) played as a wavetable tone';

describe('PCE sample instruments', () => {
  it('reports a useSample instrument as lossy', async () => {
    expect(furnaceToHusic(await load('fd_PCB.fur'), 0, player, layout).lossy.some((l) => l.startsWith(SAMPLE))).toBe(true);
  });
  it('does not report it on a wavetable-only song', async () => {
    expect(furnaceToHusic(await load('pcengineasdmo.fur'), 0, player, layout).lossy.some((l) => l.startsWith(SAMPLE))).toBe(false);
  });
});
