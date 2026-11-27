/**
 * HuSIC pitch paths on real songs: a pitch move past drv_pitchenv's 126-per-frame cap is split into a note env plus a residual
 * pitch env, and an 02xx slide set before a channel's first note keeps running into later notes (Furnace starts a
 * linear channel at note 60, so the slide does not reach its note-0 floor at once).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFurnaceSong } from '../../../import/formats/FurnaceSongParser';
import { furnaceToHusic, type HusicLayout } from '../husicSong';

const root = join(__dirname, '../../../../..');
const player = readFileSync(join(root, 'public/pce/player.pce'));
const layout = JSON.parse(readFileSync(join(root, 'public/pce/player.json'), 'utf8')) as HusicLayout;
// Argument byte counts of the HuSIC track commands the converter writes ($EE = bank jump).
const ARGS: Record<number, number> = { 0xe9: 0, 0xeb: 2, 0xee: 3, 0xf0: 1, 0xf1: 1, 0xf2: 1, 0xf4: 1, 0xf7: 1, 0xf8: 1, 0xfa: 1, 0xfc: 1, 0xfd: 1, 0xfe: 1 };
type Cmd = { frame: number; op: number; arg: number };

async function track(song: string, ch: number, frames: number): Promise<Cmd[]> {
  const b = readFileSync(join(root, 'public/data/songs/furnace', song));
  const m = await parseFurnaceSong(b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer);
  const { rom } = furnaceToHusic(m, 0, player, layout);
  const cr = (a: number) => layout.constBank * 0x2000 + (a - 0x4000);
  const rd = (a: number) => rom[cr(a)] | (rom[cr(a) + 1] << 8);
  const ptr = (i: number) => rd(layout.soundDat + 2 * i);
  let addr = rd(ptr(0) + 2 * ch), bank = rom[cr(ptr(7) + ch)], frame = 0;
  const out: Cmd[] = [];
  while (frame < frames && out.length < 4000) {
    const at = bank * 0x2000 + (addr - 0x4000), op = rom[at], k = ARGS[op] ?? 1;
    if (op === 0xee) { bank = rom[at + 1]; addr = rom[at + 2] | (rom[at + 3] << 8); continue; }
    out.push({ frame, op, arg: rom[at + 1] });
    if (op < 0xe6 || op === 0xf4 || op === 0xfc) frame += rom[at + 1];
    addr += 1 + k;
  }
  return out;
}
const lastBefore = (cmds: Cmd[], i: number, op: number) => { for (let j = i - 1; j >= 0 && cmds[j].op >= 0xe6; j--) if (cmds[j].op === op) return cmds[j].arg; return undefined; };

describe('HuSIC pitch paths', () => {
  it('keeps an 02xx slide set before the first note running into that note', async () => {
    const cmds = await track('blank/sawvibes.fur', 4, 100);
    const i = cmds.findIndex((c) => c.op < 0xe6 && c.frame === 64);
    expect(i).toBeGreaterThan(0);
    expect(lastBefore(cmds, i, 0xf8)).not.toBe(0xff);
  });
  it('splits a fast pitch drop into a note env plus a residual pitch env', async () => {
    const all = await Promise.all([0, 1, 2, 3, 4, 5].map((ch) => track('pce/continuity_error.fur', ch, 600)));
    const split = all.some((cmds) => cmds.some((c, i) => c.op < 0xe6 && lastBefore(cmds, i, 0xf7) !== undefined && lastBefore(cmds, i, 0xf7) !== 0xff && lastBefore(cmds, i, 0xf8) !== undefined && lastBefore(cmds, i, 0xf8) !== 0xff));
    expect(split).toBe(true);
  });
  it('keys on an octave -1 note as its low byte instead of holding the previous note', async () => {
    // pcengineasdmo ch0 order 30 row 0 (frame 4804): A#-1 in Furnace = HuSIC byte $0E (_freq[1] = 3839).
    const cmds = await track('pce/pcengineasdmo.fur', 0, 4900);
    expect(cmds.some((c) => c.frame === 4804 && c.op === 0x0e)).toBe(true);
  });
});
