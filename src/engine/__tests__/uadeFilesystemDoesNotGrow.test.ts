/**
 * Loading song after song from the jukebox does not leave every previous song
 * in the UADE filesystem.
 *
 * Owner, 2026-10-06: the app gets slower the more songs are loaded; the load
 * failure diagnostic listed /uade with every module and companion ever loaded
 * (fantasi8.is, jmf.spacestation, jb.ikari_warriors, ...). MEMFS keeps what is
 * written until something unlinks it. Runs the real worklet and WASM.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { startWorklet, songBuffer } from './workletHarness';
import { uadePlayerHint } from '@/lib/import/uadePlayerHint';

const DIR = 'public/data/songs/digital-sonix-and-chrome/David Hanlon';
const CONFIG = ['ENV', 'uaerc', 'uade.conf', 'eagleplayer.conf', 'score', 'uadecore', 'players'];

interface Fs { readdir(p: string): string[] }

async function start() {
  const w = await startWorklet('uade', 'UADE', async (c) => (await import('@/engine/uade/UADEEngine')).uadeTransform(c));
  const fs = () => (w.proc._wasm as { FS: Fs }).FS.readdir('/uade').filter((n) => n !== '.' && n !== '..');
  return { ...w, fs };
}

describe('UADE filesystem across song loads', { timeout: 60000 }, () => {
  const files = readdirSync(join(process.cwd(), DIR)).filter((f) => !f.startsWith('.')).slice(0, 2);

  it('keeps only the current song and its companions after loading two songs', async () => {
    const { send, fs } = await start();
    const hint = (f: string) => uadePlayerHint(f);
    await send({ type: 'addCompanionFile', filename: 'smp.first', buffer: new ArrayBuffer(16) });
    await send({ type: 'load', buffer: songBuffer(join(DIR, files[0])), filenameHint: hint(files[0]), skipScan: true });
    expect(fs()).toContain('smp.first');
    await send({ type: 'addCompanionFile', filename: 'smp.second', buffer: new ArrayBuffer(16) });
    await send({ type: 'load', buffer: songBuffer(join(DIR, files[1])), filenameHint: hint(files[1]), skipScan: true });

    const left = fs().filter((n) => !CONFIG.includes(n));
    expect(left.sort()).toEqual(['smp.second', hint(files[1])].sort());
  });

  it('keeps the companions when the same song is loaded again', async () => {
    const { send, fs } = await start();
    await send({ type: 'addCompanionFile', filename: 'smp.first', buffer: new ArrayBuffer(16) });
    const h = uadePlayerHint(files[0]);
    await send({ type: 'load', buffer: songBuffer(join(DIR, files[0])), filenameHint: h, skipScan: true });
    await send({ type: 'load', buffer: songBuffer(join(DIR, files[0])), filenameHint: h, skipScan: true });
    expect(fs()).toContain('smp.first');
  });

  it('does not replay a previous song companions into a fresh instance', async () => {
    const { send, proc } = await start();
    await send({ type: 'addCompanionFile', filename: 'smp.first', buffer: new ArrayBuffer(16) });
    await send({ type: 'load', buffer: songBuffer(join(DIR, files[0])), filenameHint: uadePlayerHint(files[0]), skipScan: true });
    await send({ type: 'load', buffer: songBuffer(join(DIR, files[1])), filenameHint: uadePlayerHint(files[1]), skipScan: true });
    expect([...(proc._companionFiles as Map<string, unknown>).keys()]).toEqual([]);
  });
});
