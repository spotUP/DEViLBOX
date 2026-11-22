// hUGEDriver Game Boy route: converter output shape on a real GB song, and the staleness guard
// (public/gb/huge-player.gb must be rebuilt with tools/build-gb-player.sh when a player or driver source changes).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFurnaceSong } from '../../import/formats/FurnaceSongParser';
import { buildHugeRom, furnaceToHuge, HUGE_SONG_BASE, type HugePlayerMeta } from '../gb/hugeSong';

const ROOT = join(__dirname, '../../../..');
const META = JSON.parse(readFileSync(join(ROOT, 'public/gb/huge-player.json'), 'utf8')) as HugePlayerMeta & { sources: string[] };

describe('hUGEDriver Game Boy export', () => {
  it('player binary matches its sources (rebuild with tools/build-gb-player.sh)', () => {
    const h = createHash('sha1');
    for (const s of META.sources) h.update(readFileSync(join(ROOT, s)));
    expect(h.digest('hex')).toBe(META.sourceHash);
    expect(META.songAddress).toBe(HUGE_SONG_BASE);
  });

  it('converts cheap.fur into a song whose pointers stay inside the song area', async () => {
    const fur = readFileSync(join(ROOT, 'public/data/songs/furnace/gameboy/cheap.fur'));
    const song = furnaceToHuge(await parseFurnaceSong(fur.buffer.slice(fur.byteOffset, fur.byteOffset + fur.length)));
    expect(song.orders).toBe(28 * 2); // 28 Furnace orders of 128 rows -> 2 hUGE orders of 64 rows each
    expect(song.lossy.length).toBeGreaterThan(0);
    const end = HUGE_SONG_BASE + song.blob.length;
    for (let i = 1; i < 21; i += 2) { // descriptor: tempo byte, then 10 little-endian pointers
      const p = song.blob[i] | (song.blob[i + 1] << 8);
      expect(p).toBeGreaterThanOrEqual(HUGE_SONG_BASE);
      expect(p).toBeLessThan(end);
    }
    const player = readFileSync(join(ROOT, 'public/gb/huge-player.gb'));
    const rom = buildHugeRom(player, META, song.blob, song.screen);
    let sum = 0;
    for (let i = 0; i < rom.length; i++) if (i !== 0x14e && i !== 0x14f) sum = (sum + rom[i]) & 0xffff;
    expect((rom[0x14e] << 8) | rom[0x14f]).toBe(sum);
  });
});
