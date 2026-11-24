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
const SAMPLE = 'sample instrument without a usable sample played as a wavetable tone';
const XPCM_PTR = 0x22; // header slot of the XPCM table (was a dummy pointer)

describe('PCE sample instruments (XPCM)', () => {
  it('plays fd_PCB drums as XPCM: samples in their own banks, a table, no wavetable-tone fallback', async () => {
    const r = furnaceToHusic(await load('fd_PCB.fur'), 0, player, layout);
    expect(r.lossy.some((l) => l.startsWith(SAMPLE))).toBe(false);
    const at = (addr: number) => layout.constBank * 0x2000 + (addr - 0x4000);
    const tbl = r.rom[at(layout.soundDat) + XPCM_PTR] | (r.rom[at(layout.soundDat) + XPCM_PTR + 1] << 8);
    const e = at(tbl); // entry 0: addr16, len16, bank8
    expect(r.rom[e + 1]).toBe(0x60);
    expect(r.rom[e + 2] | (r.rom[e + 3] << 8)).toBeGreaterThan(0);
    expect(r.rom[e + 4]).toBeGreaterThanOrEqual(layout.firstFreeBank);
  });
  it('does not add sample banks on a wavetable-only song', async () => {
    const r = furnaceToHusic(await load('pcengineasdmo.fur'), 0, player, layout);
    expect(r.lossy.some((l) => l.startsWith(SAMPLE))).toBe(false);
  });
});
