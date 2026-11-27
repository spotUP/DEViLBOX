/** HuSIC volume column on a held note. */

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

describe('HuSIC volume column on a held note', () => {
  // Ma-Da-Ra ch1 fades by volume column cells (o0 r72..) with no note. Each cell must continue the instrument's volume macro
  // from where it runs (a new envelope per step, not the macro restarted from its first, loudest frame).
  it('emits a distinct volume envelope per fade step instead of restarting the macro', async () => {
    const cmds = await track('pce/Ma-Da-Ra.fur', 1, 600);
    const vols = cmds.filter((c) => c.op === 0xfd && c.arg < 0x80).map((c) => c.arg);
    expect(new Set(vols).size).toBeGreaterThanOrEqual(5);
  });

  // pcengineasdmo ch5 "Cra" rows carry 03FF: Furnace restarts no macro there. A full note per row replayed volume
  // envelope frame 0 (register level 15 for one tick, then 31) on every row, a 20 Hz flutter the rom-check did not see.
  it('exports a noise note under 03xx as a slurred note', async () => {
    const cmds = (await track('pce/pcengineasdmo.fur', 4, 62)).filter((c) => c.frame > 32);
    expect(cmds.filter((c) => c.op === 0xe9).length).toBeGreaterThanOrEqual(8);
  });

  // Ma-Da-Ra ch4 changes to an instrument with no pan macro near frame 2184: the old pan envelope must be switched off.
  it('switches the pan envelope off for an instrument without a pan macro', async () => {
    const cmds = await track('pce/Ma-Da-Ra.fur', 3, 2300);
    expect(cmds.some((c) => c.op === 0xe6 && c.arg === 0xff)).toBe(true);
  });
});
