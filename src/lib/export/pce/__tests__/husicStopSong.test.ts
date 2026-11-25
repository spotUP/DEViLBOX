/**
 * Furnace FFxx stops the song when the row's ticks run out (playback.cpp shallStopSched). HuSIC's $FF command only loops, so the
 * export ends the song at that row and every track loops on one silent frame there: no FFxx lossy entry, loop point = stop point.
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

describe('PCE FFxx stop song', () => {
  it('Warpdrive_Engage stops at its FFxx row and loops on silence', async () => {
    const r = furnaceToHusic(await load('Warpdrive_Engage.fur'), 0, player, layout);
    expect(r.lossy.some((l) => l.startsWith('effect FFxx'))).toBe(false);
    expect(r.loopFrame).toBe(r.frames - 1);
  });
  it('a song without FFxx keeps its own loop point', async () => {
    const r = furnaceToHusic(await load('Ma-Da-Ra.fur'), 0, player, layout);
    expect(r.loopFrame).toBeLessThan(r.frames - 1);
  });
});
