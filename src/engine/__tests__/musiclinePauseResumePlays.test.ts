/**
 * MusicLine went silent after a pause: the replayer paused it with 'stop',
 * which unloads the song in the worklet, and resume (a bare 'play') had
 * nothing to play. Pause now keeps the song; the registry marks MusicLine as
 * pausable and resumable so the transport's pause/resume reach it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultWASMTransform } from '../wasm/WASMSingletonBase';
import { ROOT, startWorklet, songBuffer, stereoOutputs, type WorkletProc } from './workletHarness';

function energy(proc: WorkletProc, blocks = 200): number {
  let sum = 0;
  for (let i = 0; i < blocks; i++) {
    const out = stereoOutputs(1);
    proc.process([], out);
    for (const ch of out[0]) for (const v of ch) sum += Math.abs(v);
  }
  return sum;
}

describe('MusicLine pause and resume', () => {
  it('plays again after pause then resume without a reload', async () => {
    const { proc, send } = await startWorklet('musicline', 'MusicLine', defaultWASMTransform);
    await send({ type: 'load', buffer: songBuffer('public/data/songs/musicline-editor/drax.ml') });
    await send({ type: 'play' });
    expect(energy(proc), 'plays').toBeGreaterThan(1);
    await send({ type: 'pause' });
    expect(energy(proc), 'paused is silent').toBeLessThan(1e-3);
    await send({ type: 'play' });
    expect(energy(proc), 'resume plays the same song').toBeGreaterThan(1);
  }, 60_000);

  it('stop unloads the song, so only a reload plays again (why pause must not send stop)', async () => {
    const { proc, send } = await startWorklet('musicline', 'MusicLine', defaultWASMTransform);
    await send({ type: 'load', buffer: songBuffer('public/data/songs/musicline-editor/drax.ml') });
    await send({ type: 'play' });
    await send({ type: 'stop' });
    await send({ type: 'play' });
    expect(energy(proc)).toBeLessThan(1e-3);
  }, 60_000);

  it('muting every channel mid-song does not end the song, and unmuting plays on', async () => {
    const { proc, send, posted } = await startWorklet('musicline', 'MusicLine', defaultWASMTransform);
    await send({ type: 'load', buffer: songBuffer('public/data/songs/musicline-editor/drax.ml') });
    await send({ type: 'play' });
    expect(energy(proc)).toBeGreaterThan(1);
    await send({ type: 'setMuteMask', mask: 0 });
    expect(energy(proc), 'all muted is silent').toBeLessThan(1e-3);
    expect(posted.some((p) => p.type === 'ended'), 'mute is not a song end').toBe(false);
    await send({ type: 'setMuteMask', mask: 0xffffffff });
    expect(energy(proc), 'unmuted plays on').toBeGreaterThan(1);
  }, 60_000);

  it('the replayer registry routes pause and resume to MusicLine', () => {
    const src = readFileSync(resolve(ROOT, 'src/engine/replayer/wasmEngineRegistry.ts'), 'utf8');
    const block = src.slice(src.indexOf("key: 'MusicLine'"), src.indexOf("key: 'MusicLine'") + 700);
    expect(block).toMatch(/supportsPause: true/);
    expect(block).toMatch(/supportsResume: true/);
  });
});
