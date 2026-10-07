/**
 * The load owns the companion set: loading song B after song A leaves none of
 * A's companions in /uade, even when B has the same name as A or carries none.
 * Runs the real worklet and WASM.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { startWorklet, songBuffer } from './workletHarness';
import { uadePlayerHint } from '@/lib/import/uadePlayerHint';

const DIR = 'public/data/songs/digital-sonix-and-chrome/David Hanlon';
const CONFIG = ['ENV', 'uaerc', 'uade.conf', 'eagleplayer.conf', 'score', 'uadecore', 'players'];
const comp = (...names: string[]) => names.map((filename) => ({ filename, buffer: new ArrayBuffer(16) }));

describe('UADE companion set per load', { timeout: 60000 }, () => {
  const files = readdirSync(join(process.cwd(), DIR)).filter((f) => !f.startsWith('.')).slice(0, 2);
  async function start() {
    const w = await startWorklet('uade', 'UADE', async (c) => (await import('@/engine/uade/UADEEngine')).uadeTransform(c));
    const left = () => (w.proc._wasm as { FS: { readdir(p: string): string[] } }).FS.readdir('/uade').filter((n) => n !== '.' && n !== '..' && !CONFIG.includes(n)).sort();
    const load = (i: number, companions?: Array<{ filename: string; buffer: ArrayBuffer }>) =>
      w.send({ type: 'load', buffer: songBuffer(join(DIR, files[i])), filenameHint: uadePlayerHint(files[i]), skipScan: true, companions });
    return { ...w, left, load };
  }

  it('song B after song A leaves none of A\'s companions in /uade', async () => {
    const { left, load } = await start();
    await load(0, comp('smp.a'));
    expect(left()).toContain('smp.a');
    await load(1, comp('smp.b'));
    expect(left()).toEqual(['smp.b', uadePlayerHint(files[1])].sort());
  });

  it('the same song reloaded with another companion set drops the old companion', async () => {
    const { left, load } = await start();
    await load(0, comp('smp.a'));
    await load(0, comp('smp.b'));
    expect(left()).toEqual(['smp.b', uadePlayerHint(files[0])].sort());
  });

  it('a load that carries no companions leaves none from the song before', async () => {
    const { left, load } = await start();
    await load(0, comp('smp.a'));
    await load(1);
    expect(left()).toEqual([uadePlayerHint(files[1])]);
  });
});
